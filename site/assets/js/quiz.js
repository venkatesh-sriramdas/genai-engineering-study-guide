/* Follow the Question: quiz engine. Owner: E2.
   Guide.quiz.mount(container, items, ctx) -> { destroy, summary }
   ctx = { world, level, refs, levelId, worldId } for practice problems, or { world, topic, refs, topicId, worldId } for topics
   (topic quizzes record with { topicId, worldId } and never complete a level)
   Types: single, multi, order, match, numeric. Reports through Guide.store.recordQuiz and completes the
   level through Guide.store.completeLevel when every quiz item was answered and any defend score is saved. */
(function () {
  'use strict';
  var G = (window.Guide = window.Guide || {});
  var ui = G.kit;

  var TAGS = {
    concept: ['Concept', 'neutral'], diagnose: ['Diagnose', 'info'], flip: ['What flips it', 'preview'],
    bug: ['Spot the bug', 'bad'], numeric: ['Numbers', 'ok'], tradeoff: ['Trade-off', 'accent'],
    security: ['Security', 'warn'], order: ['Order', 'neutral']
  };
  var TYPES = {
    single: 'Choose one', multi: 'Select all that apply', order: 'Put in order', match: 'Match the pairs', numeric: 'Enter a number'
  };

  /* ---------- completion rule shared with defend.js and render.js ---------- */
  function storeState() { return G.store && G.store.get ? G.store.get() : null; }
  function attempted(id) {
    var st = storeState();
    var q = st && st.quiz && st.quiz[id];
    return !!(q && q.attempts > 0);
  }
  function defendSaved(levelId) {
    var st = storeState();
    var lv = st && st.levels && st.levels[levelId];
    return !!(lv && lv.defend && lv.defend.max > 0);
  }
  function completionMet(level) {
    if (!level) return false;
    var items = level.quiz || [];
    if (!items.length && !level.defend) return false;
    return items.every(function (q) { return attempted(q.id); }) && (level.defend ? defendSaved(level.id) : true);
  }
  function completeIfMet(level, worldId) {
    if (!completionMet(level)) return false;
    if (ui.storeCall('levelStatus', level.id) !== 'done') ui.storeCall('completeLevel', level.id, worldId);
    return true;
  }

  /* ---------- helpers ---------- */
  function nonIdentityShuffle(n, seed) {
    var ids = [];
    for (var i = 0; i < n; i++) ids.push(i);
    if (n < 2) return ids;
    for (var t = 0; t < 12; t++) {
      var s = G.shuffle(ids, seed + ':' + t);
      if (s.some(function (v, k) { return v !== k; })) return s;
    }
    return ids.slice().reverse();
  }
  function fmtNum(n) {
    var v = Number(n);
    if (!isFinite(v)) return String(n);
    return v.toLocaleString('en-US', { maximumFractionDigits: 6 });
  }
  function parseNum(s) {
    var t = String(s == null ? '' : s).trim().replace(/[,\s_]/g, '').replace(/%$/, '');
    if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return NaN;
    return parseFloat(t);
  }
  function flip(list, mutate, skip) {
    var kids = Array.prototype.slice.call(list.children);
    var before = kids.map(function (k) { return k.getBoundingClientRect().top; });
    mutate();
    if (ui.reducedMotion()) return;
    kids.forEach(function (k, i) {
      if (k === skip) return;
      var dy = before[i] - k.getBoundingClientRect().top;
      if (dy && k.animate) k.animate([{ transform: 'translateY(' + dy + 'px)' }, { transform: 'none' }], { duration: 200, easing: 'ease-out' });
    });
  }
  function codeEl(spec) {
    if (G.render && G.render.code) return G.render.code(spec);
    return G.el('pre', { class: 'g-code__pre' }, G.el('code', null, spec.code));
  }
  function mark(host, tone, text, icon) {
    var m = host.querySelector('.g-opt__mark, .g-mark');
    if (!m) return;
    G.clear(m);
    m.appendChild(ui.icon(icon, 14));
    m.appendChild(document.createTextNode(text));
    ['correct', 'wrong', 'missed'].forEach(function (t) { m.classList.remove('g-mark--' + t); });
    m.classList.add('g-mark--' + tone);
    host.classList.add('is-' + tone);
  }

  /* ---------- type handlers ----------
     Each returns { build(body), value(), ready(), result(), lock(res), keyHint(n) } for one attempt. */
  function singleHandler(q, ctx, seed, nth, onChange, labelId) {
    var inputs = [], labels = [], perm = q.options.map(function (_, i) { return i; });
    if (nth > 0) perm = G.shuffle(perm, seed + ':' + nth);
    var name = ui.uid('q');
    return {
      build: function (body) {
        var wrap = G.el('div', { class: 'g-opts', role: 'radiogroup', 'aria-labelledby': labelId });
        perm.forEach(function (orig, pos) {
          var input = G.el('input', { type: 'radio', class: 'sr-only', name: name, value: String(orig) });
          input.addEventListener('change', onChange);
          inputs.push(input);
          var label = G.el('label', { class: 'g-opt' }, input,
            G.el('span', { class: 'g-opt__key', 'aria-hidden': 'true' }, String(pos + 1)),
            ui.mdEl('span', 'g-opt__text', q.options[orig], ctx, 'inline'),
            G.el('span', { class: 'g-opt__mark' }),
            G.el('span', { class: 'g-opt__ring', 'aria-hidden': 'true' }));
          label.dataset.orig = String(orig);
          labels.push(label);
          wrap.appendChild(label);
        });
        body.appendChild(wrap);
      },
      value: function () {
        for (var i = 0; i < inputs.length; i++) if (inputs[i].checked) return +inputs[i].value;
        return null;
      },
      ready: function () { return this.value() !== null; },
      result: function () { return { correct: this.value() === q.answer }; },
      lock: function () {
        var chosen = this.value();
        inputs.forEach(function (i) { i.disabled = true; });
        labels.forEach(function (label) {
          var orig = +label.dataset.orig;
          if (orig === q.answer) mark(label, 'correct', 'Correct answer', 'check');
          else if (orig === chosen) mark(label, 'wrong', 'Your answer', 'cross');
        });
      },
      key: function (n) {
        var input = inputs[n - 1];
        if (!input || input.disabled) return;
        input.checked = true;
        input.focus();
        onChange();
      }
    };
  }

  function multiHandler(q, ctx, seed, nth, onChange, labelId) {
    var inputs = [], labels = [], perm = q.options.map(function (_, i) { return i; });
    if (nth > 0) perm = G.shuffle(perm, seed + ':' + nth);
    var answers = q.answers || [];
    return {
      build: function (body) {
        var wrap = G.el('div', { class: 'g-opts', role: 'group', 'aria-labelledby': labelId });
        perm.forEach(function (orig, pos) {
          var input = G.el('input', { type: 'checkbox', class: 'sr-only', value: String(orig) });
          input.addEventListener('change', onChange);
          inputs.push(input);
          var label = G.el('label', { class: 'g-opt g-opt--multi' }, input,
            G.el('span', { class: 'g-opt__key', 'aria-hidden': 'true' }, String(pos + 1)),
            ui.mdEl('span', 'g-opt__text', q.options[orig], ctx, 'inline'),
            G.el('span', { class: 'g-opt__mark' }),
            G.el('span', { class: 'g-opt__ring', 'aria-hidden': 'true' }));
          label.dataset.orig = String(orig);
          labels.push(label);
          wrap.appendChild(label);
        });
        body.appendChild(wrap);
      },
      value: function () { return inputs.filter(function (i) { return i.checked; }).map(function (i) { return +i.value; }); },
      ready: function () { return this.value().length > 0; },
      result: function () {
        var v = this.value();
        return { correct: v.length === answers.length && answers.every(function (a) { return v.indexOf(a) !== -1; }) };
      },
      lock: function () {
        var v = this.value();
        inputs.forEach(function (i) { i.disabled = true; });
        labels.forEach(function (label) {
          var orig = +label.dataset.orig;
          var chosen = v.indexOf(orig) !== -1, right = answers.indexOf(orig) !== -1;
          if (chosen && right) mark(label, 'correct', 'Correct choice', 'check');
          else if (chosen && !right) mark(label, 'wrong', 'Not correct', 'cross');
          else if (!chosen && right) mark(label, 'missed', 'Missed', 'warn');
        });
      },
      key: function (n) {
        var input = inputs[n - 1];
        if (!input || input.disabled) return;
        input.checked = !input.checked;
        input.focus();
        onChange();
      }
    };
  }

  function orderHandler(q, ctx, seed, nth, onChange, labelId) {
    var n = q.items.length;
    var start = nonIdentityShuffle(n, seed + ':' + nth);
    var list = null;
    var dragLi = null;

    function lis() { return Array.prototype.slice.call(list.children); }
    function renumber() {
      var all = lis();
      all.forEach(function (li, i) {
        li.querySelector('.g-ord__pos').textContent = String(i + 1);
        var up = li.querySelector('.g-ord__up'), down = li.querySelector('.g-ord__down');
        up.disabled = i === 0 || list.classList.contains('is-locked');
        down.disabled = i === all.length - 1 || list.classList.contains('is-locked');
      });
    }
    function moveTo(li, to) {
      var from = lis().indexOf(li);
      if (to < 0 || to >= n || to === from) return;
      flip(list, function () {
        list.removeChild(li);
        list.insertBefore(li, list.children[to] || null);
        renumber();
      }, li);
      onChange();
    }
    function build(body) {
      list = G.el('ol', { class: 'g-ord', 'aria-labelledby': labelId });
      start.forEach(function (orig) {
        var li = G.el('li', { class: 'g-ord__item' });
        li.dataset.idx = String(orig);
        var plain = G.md.text(q.items[orig]);
        var up = ui.button({ cls: 'g-btn--ghost g-btn--sm g-btn--icon g-ord__up', icon: 'chevron-down', label: '', attrs: { 'aria-label': 'Move up: ' + plain } });
        var down = ui.button({ cls: 'g-btn--ghost g-btn--sm g-btn--icon g-ord__down', icon: 'chevron-down', label: '', attrs: { 'aria-label': 'Move down: ' + plain } });
        up.classList.add('g-ord__btn');
        down.classList.add('g-ord__btn');
        up.addEventListener('click', function () {
          moveTo(li, lis().indexOf(li) - 1);
          (up.disabled ? down : up).focus();
          ui.announce(plain + ', position ' + (lis().indexOf(li) + 1) + ' of ' + n);
        });
        down.addEventListener('click', function () {
          moveTo(li, lis().indexOf(li) + 1);
          (down.disabled ? up : down).focus();
          ui.announce(plain + ', position ' + (lis().indexOf(li) + 1) + ' of ' + n);
        });
        var grip = G.el('span', { class: 'g-ord__grip', 'aria-hidden': 'true', title: 'Drag to reorder' }, '\u22EE\u22EE');
        grip.addEventListener('pointerdown', function (e) {
          if (list.classList.contains('is-locked') || (e.pointerType === 'mouse' && e.button !== 0)) return;
          e.preventDefault();
          dragLi = li;
          li.classList.add('is-dragging');
          list.setPointerCapture(e.pointerId);
        });
        li.appendChild(grip);
        li.appendChild(G.el('span', { class: 'g-ord__pos', 'aria-hidden': 'true' }));
        li.appendChild(ui.mdEl('span', 'g-ord__text', q.items[orig], ctx, 'inline'));
        li.appendChild(G.el('span', { class: 'g-mark g-ord__mark' }));
        li.appendChild(G.el('span', { class: 'g-ord__btns' }, up, down));
        list.appendChild(li);
      });
      list.addEventListener('pointermove', function (e) {
        if (!dragLi) return;
        var others = lis().filter(function (x) { return x !== dragLi; });
        var target = others.filter(function (x) {
          var r = x.getBoundingClientRect();
          return r.top + r.height / 2 < e.clientY;
        }).length;
        if (target !== lis().indexOf(dragLi)) moveTo(dragLi, target);
      });
      function endDrag() { if (dragLi) { dragLi.classList.remove('is-dragging'); dragLi = null; } }
      list.addEventListener('pointerup', endDrag);
      list.addEventListener('pointercancel', endDrag);
      body.appendChild(list);
      body.appendChild(G.el('p', { class: 'g-q__hint' }, 'Drag the handle, or use the arrow buttons, to reorder.'));
      renumber();
    }
    return {
      build: build,
      value: function () { return lis().map(function (li) { return +li.dataset.idx; }); },
      ready: function () { return true; },
      result: function () { return { correct: this.value().every(function (v, i) { return v === i; }) }; },
      lock: function () {
        list.classList.add('is-locked');
        renumber();
        lis().forEach(function (li, i) {
          var idx = +li.dataset.idx;
          if (idx === i) mark(li, 'correct', 'Correct position', 'check');
          else mark(li, 'wrong', 'Belongs at ' + (idx + 1), 'cross');
        });
      }
    };
  }

  function matchHandler(q, ctx, seed, nth, onChange, labelId) {
    var n = q.pairs.length;
    var perm = nonIdentityShuffle(n, seed + ':m' + nth);
    var selects = [];
    var rows = [];
    function refreshUsed() {
      var chosen = selects.map(function (s) { return s.value; });
      selects.forEach(function (s, si) {
        Array.prototype.forEach.call(s.options, function (opt) {
          if (!opt.value) return;
          var usedElsewhere = chosen.some(function (c, ci) { return ci !== si && c === opt.value; });
          opt.textContent = G.md.text(q.pairs[+opt.value].r) + (usedElsewhere ? ' (used)' : '');
        });
      });
    }
    return {
      build: function (body) {
        var wrap = G.el('div', { class: 'g-match', role: 'group', 'aria-labelledby': labelId });
        q.pairs.forEach(function (pair, i) {
          var sid = ui.uid('m');
          var select = G.el('select', { class: 'g-select', id: sid, 'aria-label': 'Match for: ' + G.md.text(pair.l) },
            G.el('option', { value: '' }, 'Choose a match'));
          perm.forEach(function (ri) { select.appendChild(G.el('option', { value: String(ri) }, G.md.text(q.pairs[ri].r))); });
          select.addEventListener('change', function () { refreshUsed(); onChange(); });
          selects.push(select);
          var row = G.el('div', { class: 'g-match__row' },
            ui.mdEl('div', 'g-match__l', pair.l, ctx, 'inline'),
            G.el('span', { class: 'g-match__arrow', 'aria-hidden': 'true' }, ui.icon('arrow-right', 16)),
            G.el('div', { class: 'g-match__r' }, select, G.el('span', { class: 'g-mark g-match__mark' })));
          rows.push(row);
          wrap.appendChild(row);
        });
        body.appendChild(wrap);
      },
      value: function () { return selects.map(function (s) { return s.value === '' ? null : +s.value; }); },
      ready: function () { return this.value().every(function (v) { return v !== null; }); },
      result: function () { return { correct: this.value().every(function (v, i) { return v === i; }) }; },
      lock: function () {
        var v = this.value();
        selects.forEach(function (s) { s.disabled = true; });
        rows.forEach(function (row, i) {
          if (v[i] === i) mark(row, 'correct', 'Correct', 'check');
          else mark(row, 'wrong', 'Should be: ' + G.md.text(q.pairs[i].r), 'cross');
        });
      }
    };
  }

  function numericHandler(q, ctx, seed, nth, onChange, labelId) {
    var input = null, msg = null;
    var tol = Math.abs(+q.tolerancePct || 0);
    var lo = q.answer - Math.abs(q.answer) * tol / 100;
    var hi = q.answer + Math.abs(q.answer) * tol / 100;
    return {
      build: function (body, doCheck) {
        var inputId = ui.uid('num');
        var hintId = inputId + '-hint';
        input = G.el('input', {
          type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false', class: 'g-num__input',
          id: inputId, 'aria-labelledby': labelId, 'aria-describedby': hintId, placeholder: 'Type a number'
        });
        input.addEventListener('input', function () { msg.textContent = ''; onChange(); });
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); doCheck(); }
        });
        msg = G.el('div', { class: 'g-num__msg', role: 'alert' });
        var field = G.el('div', { class: 'g-num__field' }, input, q.unit ? G.el('span', { class: 'g-num__unit' }, q.unit) : null,
          G.el('span', { class: 'g-mark g-num__mark' }));
        var wrap = G.el('div', { class: 'g-num' }, field);
        if (q.hint) {
          var hint = ui.mdEl('div', 'g-num__hint', q.hint, ctx, 'inline');
          hint.id = hintId;
          hint.hidden = true;
          var btn = ui.button({ cls: 'g-btn--ghost g-btn--sm', icon: 'bulb', label: 'Show hint', attrs: { 'aria-expanded': 'false', 'aria-controls': hintId } });
          btn.addEventListener('click', function () {
            hint.hidden = !hint.hidden;
            btn.setAttribute('aria-expanded', hint.hidden ? 'false' : 'true');
            ui.setBtnLabel(btn, hint.hidden ? 'Show hint' : 'Hide hint');
          });
          wrap.appendChild(G.el('div', { class: 'g-num__hintrow' }, btn, hint));
        } else {
          input.removeAttribute('aria-describedby');
        }
        wrap.appendChild(msg);
        body.appendChild(wrap);
      },
      value: function () { return parseNum(input.value); },
      ready: function () { return input.value.trim() !== ''; },
      invalid: function () {
        if (isNaN(parseNum(input.value))) { msg.textContent = 'Enter a number, for example 1200 or 0.5.'; input.focus(); return true; }
        return false;
      },
      result: function () { var v = parseNum(input.value); return { correct: v >= lo - 1e-9 && v <= hi + 1e-9 }; },
      lock: function (res) {
        input.readOnly = true;
        var field = input.closest('.g-num__field');
        field.classList.add(res.correct ? 'is-correct' : 'is-wrong');
        mark(field, res.correct ? 'correct' : 'wrong', res.correct ? 'Within range' : 'Outside range', res.correct ? 'check' : 'cross');
      }
    };
  }

  var HANDLERS = { single: singleHandler, multi: multiHandler, order: orderHandler, match: matchHandler, numeric: numericHandler };

  /* ---------- correct answer text for feedback and answer key ---------- */
  function answerNode(q, ctx) {
    var box = G.el('div', { class: 'g-q__answer' });
    if (q.type === 'single') {
      box.appendChild(G.el('strong', null, 'Correct answer: '));
      box.appendChild(ui.mdEl('span', null, q.options[q.answer], ctx, 'inline'));
    } else if (q.type === 'multi') {
      box.appendChild(G.el('strong', null, 'Correct answers:'));
      var ul = G.el('ul', { class: 'g-q__answerlist' });
      q.answers.forEach(function (a) { ul.appendChild(ui.mdEl('li', null, q.options[a], ctx, 'inline')); });
      box.appendChild(ul);
    } else if (q.type === 'order') {
      box.appendChild(G.el('strong', null, 'Correct order:'));
      var ol = G.el('ol', { class: 'g-q__answerlist' });
      q.items.forEach(function (t) { ol.appendChild(ui.mdEl('li', null, t, ctx, 'inline')); });
      box.appendChild(ol);
    } else if (q.type === 'match') {
      box.appendChild(G.el('strong', null, 'Correct pairs:'));
      var pl = G.el('ul', { class: 'g-q__answerlist' });
      q.pairs.forEach(function (p) {
        var li = G.el('li');
        li.appendChild(ui.mdEl('span', null, p.l, ctx, 'inline'));
        li.appendChild(document.createTextNode(' \u2192 '));
        li.appendChild(ui.mdEl('span', null, p.r, ctx, 'inline'));
        pl.appendChild(li);
      });
      box.appendChild(pl);
    } else if (q.type === 'numeric') {
      var tol = Math.abs(+q.tolerancePct || 0);
      var span = Math.abs(q.answer) * tol / 100;
      box.appendChild(G.el('strong', null, 'Answer: '));
      box.appendChild(document.createTextNode(fmtNum(q.answer) + (q.unit ? ' ' + q.unit : '') +
        (tol ? ' (accepted ' + fmtNum(q.answer - span) + ' to ' + fmtNum(q.answer + span) + ', \u00B1' + tol + '%)' : '')));
    }
    return box;
  }

  /* ---------- mount ---------- */
  function mount(container, items, ctx) {
    ctx = ctx || {};
    items = (items || []).filter(function (q) {
      if (q && HANDLERS[q.type]) return true;
      console.warn('[quiz] skipped item with unknown type', q && q.id, q && q.type);
      return false;
    });
    var topicId = ctx.topicId || (ctx.topic && ctx.topic.id) || '';
    var isTopic = !!topicId && !ctx.level && !ctx.levelId;
    var levelId = ctx.levelId || (ctx.level && ctx.level.id) || '';
    var worldId = ctx.worldId || (ctx.world && ctx.world.id) || '';
    var level = ctx.level || { id: levelId, quiz: items, defend: ctx.hasDefend ? {} : null };
    var uid = ui.uid('quiz');
    var cards = [];
    var results = {};

    var root = G.el('div', { class: 'g-quiz g-scope' });
    var pips = G.el('ol', { class: 'g-pips', 'aria-label': 'Questions' });
    var summary = G.el('div', { class: 'g-qsum', hidden: true });
    var list = G.el('div', { class: 'g-quiz__list' });

    root.appendChild(G.el('div', { class: 'g-quiz__top' },
      G.el('p', { class: 'g-quiz__intro' },
        (isTopic ? 'Answer ' + (items.length === 1 ? 'this quick check' : 'all ' + items.length + ' quick checks') + ' to test yourself. Keys: ' : 'Answer all ' + items.length + ' to finish this level. Keys: '),
        G.el('kbd', null, '1'), ' to ', G.el('kbd', null, '5'), ' choose, ', G.el('kbd', null, 'Enter'), ' check.'),
      pips));
    root.appendChild(list);
    root.appendChild(summary);

    function stats() {
      var ids = Object.keys(results);
      var answered = ids.filter(function (k) { return results[k].answered; }).length;
      var correct = ids.filter(function (k) { return results[k].correct; }).length;
      var firstTry = ids.filter(function (k) { return results[k].firstTry; }).length;
      return { total: items.length, answered: answered, correct: correct, firstTry: firstTry,
        items: items.map(function (q) { return { id: q.id, answered: !!(results[q.id] && results[q.id].answered), correct: !!(results[q.id] && results[q.id].correct) }; }) };
    }

    function paintPips() {
      cards.forEach(function (c) {
        var r = results[c.q.id] || {};
        var state = !r.answered ? 'open' : r.correct ? 'correct' : 'wrong';
        c.pip.className = 'g-pip g-pip--' + state;
        c.pip.setAttribute('aria-label', 'Question ' + (c.index + 1) + ': ' + (state === 'open' ? 'not answered' : state === 'correct' ? 'correct' : 'incorrect'));
        c.pipMark.textContent = state === 'correct' ? '\u2713' : state === 'wrong' ? '\u2715' : '';
      });
    }

    function paintSummary(announce) {
      var s = stats();
      paintPips();
      if (!items.length) { summary.hidden = true; return; }
      var done = s.answered === s.total;
      G.clear(summary);
      summary.hidden = false;
      summary.className = 'g-qsum' + (done ? ' is-done' : '');
      var pct = s.total ? Math.round((s.correct / s.total) * 100) : 0;
      if (!done) {
        summary.appendChild(G.el('div', { class: 'g-qsum__progress' },
          G.el('div', { class: 'g-qsum__line' }, G.el('strong', null, s.answered + ' of ' + s.total + ' answered'), ' \u00B7 ' + s.correct + ' correct'),
          G.el('div', { class: 'g-bar' }, G.el('span', { class: 'g-bar__fill', style: { width: Math.round((s.answered / s.total) * 100) + '%' } }))));
        return;
      }
      var ring = G.el('div', { class: 'g-ring', role: 'img', 'aria-label': pct + ' percent correct' },
        G.el('span', { class: 'g-ring__num' }, pct + '%'));
      ring.style.setProperty('--p', String(pct));
      var verdict = pct === 100 ? 'Perfect round.' : pct >= 70 ? 'Solid. Review the misses below.' : 'Worth another pass. Read the explanations, then retry.';
      var again = ui.button({ cls: 'g-btn--primary', icon: 'refresh', label: 'Retry quiz', onClick: retryAll });
      var missed = ui.button({ cls: 'g-btn--ghost', icon: 'shuffle', label: 'Retry missed only', onClick: retryMissed });
      missed.hidden = s.correct === s.total;
      summary.appendChild(ring);
      summary.appendChild(G.el('div', { class: 'g-qsum__body' },
        G.el('div', { class: 'g-qsum__title' }, 'Quiz finished: ' + s.correct + ' of ' + s.total + ' correct'),
        G.el('div', { class: 'g-qsum__line' }, s.firstTry + ' right on the first try. ' + verdict),
        G.el('div', { class: 'g-qsum__actions' }, again, missed)));
      if (announce) ui.announce('Quiz finished. ' + s.correct + ' of ' + s.total + ' correct.');
    }

    function retryAll() {
      cards.forEach(function (c) { c.reset(true); });
      paintSummary(false);
      if (cards[0]) { cards[0].el.scrollIntoView({ block: 'start', behavior: ui.reducedMotion() ? 'auto' : 'smooth' }); cards[0].el.focus({ preventScroll: true }); }
    }
    function retryMissed() {
      var first = null;
      cards.forEach(function (c) {
        var r = results[c.q.id];
        if (r && r.answered && !r.correct) { c.reset(true); if (!first) first = c; }
      });
      paintSummary(false);
      if (first) { first.el.scrollIntoView({ block: 'center', behavior: ui.reducedMotion() ? 'auto' : 'smooth' }); first.el.focus({ preventScroll: true }); }
    }

    function createCard(q, index) {
      var qid = uid + '-' + index;
      var labelId = qid + '-q';
      var state = { checked: false, nth: 0, everChecked: false };
      var handler = null;
      results[q.id] = { answered: false, correct: false, firstTry: false };

      var tag = TAGS[q.tag] || [q.tag || 'Question', 'neutral'];
      var diff = Math.max(0, Math.min(3, +q.difficulty || 0));
      var head = G.el('div', { class: 'g-q__head' },
        G.el('span', { class: 'g-q__num' }, 'Question ' + (index + 1) + ' of ' + items.length),
        G.el('div', { class: 'g-q__chips' },
          ui.chip(tag[0], tag[1]),
          ui.chip(TYPES[q.type] || q.type, 'neutral'),
          diff ? G.el('span', { class: 'g-diff', title: 'Difficulty ' + diff + ' of 3' },
            G.el('span', { class: 'g-diff__dots', 'aria-hidden': 'true' }, '\u25CF'.repeat(diff) + '\u25CB'.repeat(3 - diff)),
            G.el('span', { class: 'sr-only' }, 'Difficulty ' + diff + ' of 3')) : null,
          (function () {
            var st = storeState();
            var prev = st && st.quiz && st.quiz[q.id];
            return prev && prev.correct ? ui.chip('Solved before', 'ok', 'check') : null;
          })()));
      var question = ui.mdEl('div', 'g-q__text', q.q, ctx, 'block');
      question.id = labelId;
      var codeWrap = q.code && q.code.code ? G.el('div', { class: 'g-q__code' }, codeEl(q.code)) : null;
      var body = G.el('div', { class: 'g-q__body' });
      var checkBtn = ui.button({ cls: 'g-btn--primary g-q__check', icon: 'check', label: 'Check answer' });
      var actions = G.el('div', { class: 'g-q__actions' }, checkBtn);
      var feedback = G.el('div', { class: 'g-q__feedback', role: 'status', 'aria-live': 'polite' });
      var key = G.el('div', { class: 'g-key', hidden: true },
        G.el('span', { class: 'g-key__badge' }, ui.icon('eye', 14), 'Answer key'),
        answerNode(q, ctx),
        ui.mdEl('div', 'g-key__explain', q.explain, ctx, 'block'));

      var card = G.el('article', { class: 'g-q', 'data-type': q.type, 'data-state': 'open', id: 'quiz-' + q.id, tabindex: '-1', 'aria-labelledby': labelId },
        head, question, codeWrap, body, actions, feedback, key);

      var pipMark = G.el('span', { class: 'g-pip__mark', 'aria-hidden': 'true' });
      var pip = G.el('button', { type: 'button', class: 'g-pip g-pip--open' }, G.el('span', { class: 'g-pip__n' }, String(index + 1)), pipMark);
      pip.addEventListener('click', function () {
        card.scrollIntoView({ block: 'start', behavior: ui.reducedMotion() ? 'auto' : 'smooth' });
        card.focus({ preventScroll: true });
      });
      pips.appendChild(G.el('li', null, pip));

      function refreshReady() { checkBtn.disabled = state.checked ? false : !(handler && handler.ready()); }
      function refreshKey() { key.hidden = !(ui.facilitator() && !state.checked); }

      function build() {
        G.clear(body);
        G.clear(feedback);
        handler = HANDLERS[q.type](q, ctx, q.id, state.nth, refreshReady, labelId);
        handler.build(body, doCheck);
        refreshReady();
      }

      function setButton(mode) {
        var old = checkBtn.querySelector('.g-ic');
        var fresh = ui.icon(mode === 'check' ? 'check' : 'refresh', 18);
        if (old) checkBtn.replaceChild(fresh, old); else checkBtn.insertBefore(fresh, checkBtn.firstChild);
        ui.setBtnLabel(checkBtn, mode === 'check' ? 'Check answer' : mode === 'again' ? 'Try again' : 'Practise again');
        checkBtn.classList.toggle('g-btn--primary', mode === 'check');
        checkBtn.classList.toggle('g-btn--ghost', mode !== 'check');
      }

      function reset(shuffle) {
        state.checked = false;
        if (shuffle) state.nth += 1;
        results[q.id] = { answered: false, correct: false, firstTry: false };
        card.dataset.state = 'open';
        setButton('check');
        build();
        refreshKey();
      }

      function doCheck() {
        if (state.checked) { reset(true); paintSummary(false); handlerFocus(); return; }
        if (!handler.ready()) return;
        if (handler.invalid && handler.invalid()) return;
        var res = handler.result();
        state.checked = true;
        var first = !state.everChecked;
        state.everChecked = true;
        results[q.id] = { answered: true, correct: res.correct, firstTry: res.correct && first };
        handler.lock(res);
        card.dataset.state = res.correct ? 'correct' : 'wrong';

        G.clear(feedback);
        feedback.className = 'g-q__feedback is-visible ' + (res.correct ? 'is-correct' : 'is-wrong');
        feedback.appendChild(G.el('div', { class: 'g-q__verdict' },
          ui.icon(res.correct ? 'check' : 'cross', 18),
          G.el('strong', null, res.correct ? 'Correct' : 'Not quite'),
          res.correct && first ? G.el('span', { class: 'g-chip g-chip--ok' }, 'First try') : null));
        if (!res.correct || q.type === 'numeric') feedback.appendChild(answerNode(q, ctx));
        feedback.appendChild(G.el('div', { class: 'g-q__explain' },
          G.el('div', { class: 'g-q__explain-label' }, 'Why'),
          ui.mdEl('div', null, q.explain, ctx, 'block')));
        var ref = q.ref && ctx.refs && ctx.refs[q.ref];
        if (ref && G.md.safeUrl(ref.url)) {
          var link = G.el('a', { href: ref.url, target: '_blank', rel: 'noopener noreferrer', class: 'g-q__src-link' }, ref.title || 'Reference');
          feedback.appendChild(G.el('div', { class: 'g-q__src' }, 'Source: ', link));
        }

        setButton(res.correct ? 'practise' : 'again');
        checkBtn.disabled = false;
        refreshKey();

        if (isTopic) {
          ui.storeCall('recordQuiz', q.id, res.correct, { topicId: topicId, worldId: worldId, tag: q.tag });
        } else {
          ui.storeCall('recordQuiz', q.id, res.correct, { levelId: levelId, worldId: worldId, tag: q.tag });
          completeIfMet(level, worldId);
        }
        paintSummary(true);
      }

      function handlerFocus() {
        var first = body.querySelector('input:not([disabled]), select:not([disabled]), button:not([disabled])');
        if (first) first.focus({ preventScroll: true });
      }

      checkBtn.addEventListener('click', doCheck);
      card.addEventListener('keydown', function (e) {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        var t = e.target;
        var tag = t.tagName;
        if (e.key === 'Enter') {
          if (state.checked) return;
          if (tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY' || tag === 'SELECT' || tag === 'TEXTAREA') return;
          if (tag === 'INPUT' && t.type === 'text') return;
          e.preventDefault();
          doCheck();
          return;
        }
        if (state.checked || !handler || !handler.key) return;
        if (tag === 'SELECT' || tag === 'TEXTAREA' || (tag === 'INPUT' && t.type === 'text')) return;
        if (/^[1-9]$/.test(e.key)) { e.preventDefault(); handler.key(+e.key); }
      });

      build();
      refreshKey();
      return { q: q, index: index, el: card, pip: pip, pipMark: pipMark, reset: reset, refreshKey: refreshKey };
    }

    items.forEach(function (q, i) {
      var c = createCard(q, i);
      cards.push(c);
      list.appendChild(c.el);
    });

    ui.subscribe(root, 'store:change', function () { cards.forEach(function (c) { c.refreshKey(); }); });

    G.clear(container);
    container.appendChild(root);
    paintSummary(false);

    return {
      destroy: function () { G.clear(container); },
      summary: stats
    };
  }

  G.quiz = { mount: mount, completionMet: completionMet, completeIfMet: completeIfMet };
})();
