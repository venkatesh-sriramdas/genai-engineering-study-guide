/* Follow the Question: Defend it (interview style boss). Owner: E2.
   Guide.defend.mount(container, defend, ctx) -> { destroy }
   ctx = { world, level, refs, levelId, worldId }
   The answer draft autosaves through Guide.store.saveDefend; the rubric score is saved with the button. */
(function () {
  'use strict';
  var G = (window.Guide = window.Guide || {});
  var ui = G.kit;

  var METHOD = ['Clarify the dials', 'List the options', 'Pick and say what flips it', 'Name failure modes', 'Name metrics and rollout'];

  function parseSeconds(timebox) {
    var m = String(timebox || '').match(/(\d+(?:\.\d+)?)\s*(min|minutes?|m|sec|seconds?|s)\b/i);
    if (!m) return 0;
    var n = parseFloat(m[1]);
    return /^s/i.test(m[2]) ? Math.round(n) : Math.round(n * 60);
  }
  function clock(sec) {
    sec = Math.max(0, sec);
    return ('0' + Math.floor(sec / 60)).slice(-2) + ':' + ('0' + (sec % 60)).slice(-2);
  }

  function mount(container, defend, ctx) {
    ctx = ctx || {};
    defend = defend || {};
    var levelId = ctx.levelId || (ctx.level && ctx.level.id) || '';
    var worldId = ctx.worldId || (ctx.world && ctx.world.id) || '';
    var level = ctx.level || { id: levelId, quiz: [], defend: defend };
    var rubric = defend.rubric || [];
    var totalWeight = rubric.reduce(function (s, r) { return s + (+r.w || 1); }, 0);
    var uid = ui.uid('df');
    var saved = ui.storeCall('getDefend', levelId) || null;
    var checked = {};
    ((saved && saved.checked) || []).forEach(function (i) { checked[i] = true; });
    var scored = !!(saved && saved.scored);
    var manualReveal = scored;
    var clarifyOpen = false;
    var timerHandle = null;

    var root = G.el('section', { class: 'g-df g-scope', 'aria-labelledby': uid + '-title' });

    /* ---------- 1. the question ---------- */
    var seconds = parseSeconds(defend.timebox);
    var remaining = seconds;
    var endAt = 0;
    var running = false;
    var timeText = G.el('span', { class: 'g-timer__time', role: 'timer', 'aria-live': 'off' }, clock(seconds));
    var timeFill = G.el('span', { class: 'g-bar__fill g-timer__fill', style: { width: '100%' } });
    var startBtn = ui.button({ cls: 'g-btn--primary g-btn--sm', icon: 'play', label: 'Start timer' });
    var resetBtn = ui.button({ cls: 'g-btn--ghost g-btn--sm', icon: 'refresh', label: 'Reset' });
    var timerNote = G.el('span', { class: 'g-timer__note' }, defend.timebox ? 'Timebox ' + defend.timebox : '');

    function paintTimer() {
      timeText.textContent = clock(remaining);
      timeFill.style.width = seconds ? Math.max(0, Math.round((remaining / seconds) * 100)) + '%' : '0%';
      if (timer) {
        timer.classList.toggle('is-low', seconds > 0 && remaining <= Math.min(30, seconds * 0.2) && remaining > 0);
        timer.classList.toggle('is-over', seconds > 0 && remaining <= 0);
      }
    }
    function stopTimer() {
      if (timerHandle) { window.clearInterval(timerHandle); timerHandle = null; }
      running = false;
      ui.setBtnLabel(startBtn, remaining === seconds ? 'Start timer' : 'Resume');
    }
    function tick() {
      if (!root.isConnected) { stopTimer(); return; }
      remaining = Math.max(0, Math.round((endAt - Date.now()) / 1000));
      paintTimer();
      if (remaining <= 0) {
        stopTimer();
        ui.setBtnLabel(startBtn, 'Start timer');
        timerNote.textContent = 'Time is up. Finish your thought, then compare.';
        ui.announce('Time is up.');
      }
    }
    startBtn.addEventListener('click', function () {
      if (running) { stopTimer(); ui.setBtnLabel(startBtn, 'Resume'); return; }
      if (remaining <= 0) remaining = seconds;
      endAt = Date.now() + remaining * 1000;
      running = true;
      ui.setBtnLabel(startBtn, 'Pause');
      timerNote.textContent = 'Timebox ' + defend.timebox;
      timerHandle = window.setInterval(tick, 250);
    });
    resetBtn.addEventListener('click', function () {
      stopTimer();
      remaining = seconds;
      timerNote.textContent = 'Timebox ' + defend.timebox;
      ui.setBtnLabel(startBtn, 'Start timer');
      paintTimer();
    });

    var timer = seconds ? G.el('div', { class: 'g-timer' },
      G.el('div', { class: 'g-timer__head' }, ui.icon('clock', 18), timeText, timerNote),
      G.el('div', { class: 'g-bar g-timer__bar', 'aria-hidden': 'true' }, timeFill),
      G.el('div', { class: 'g-timer__btns' }, startBtn, resetBtn)) : null;

    root.appendChild(G.el('div', { class: 'g-df__ask' },
      G.el('div', { class: 'g-df__avatar', 'aria-hidden': 'true' }, ui.icon('user', 26)),
      G.el('div', { class: 'g-df__askbody' },
        G.el('div', { class: 'g-df__who', id: uid + '-title' }, 'The interviewer asks'),
        ui.mdEl('div', 'g-df__prompt', defend.prompt || '', ctx, 'block'),
        timer)));

    /* ---------- 2. method strip ---------- */
    root.appendChild(G.el('ol', { class: 'g-method', 'aria-label': 'Dial and Defend answer method' },
      METHOD.map(function (m, i) {
        return G.el('li', { class: 'g-method__step' }, G.el('span', { class: 'g-method__n', 'aria-hidden': 'true' }, String(i + 1)), m);
      })));

    /* ---------- 3. clarify ---------- */
    var clarify = defend.clarify || [];
    var clarifyList = G.el('ul', { class: 'g-df__clarify', id: uid + '-clarify', hidden: true });
    clarify.forEach(function (c) { clarifyList.appendChild(G.el('li', null, ui.icon('check', 16), ui.mdEl('span', null, c, ctx, 'inline'))); });
    var clarifyBtn = ui.button({ cls: 'g-btn--ghost', icon: 'eye', label: 'Reveal clarifying questions', attrs: { 'aria-expanded': 'false', 'aria-controls': uid + '-clarify' } });
    if (clarify.length) {
      clarifyBtn.addEventListener('click', function () { clarifyOpen = !clarifyOpen; syncClarify(); });
      root.appendChild(G.el('div', { class: 'g-df__step' },
        G.el('div', { class: 'g-df__steptitle' }, G.el('span', { class: 'g-df__stepn' }, '1'), 'Ask before you answer'),
        G.el('p', { class: 'g-df__help' }, 'Strong candidates clarify the dials first. Think of your own questions, then compare.'),
        clarifyBtn, clarifyList));
    }
    function syncClarify() {
      var open = clarifyOpen || ui.facilitator();
      clarifyList.hidden = !open;
      clarifyBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      ui.setBtnLabel(clarifyBtn, open ? 'Hide clarifying questions' : 'Reveal clarifying questions');
    }

    /* ---------- 4. your answer ---------- */
    var ta = G.el('textarea', {
      class: 'g-df__textarea', id: uid + '-answer', rows: '9', spellcheck: 'true',
      placeholder: 'Write your answer as you would say it. Start with the questions you would ask, then give options, your pick, what would flip it, failure modes and metrics.'
    });
    ta.value = saved && saved.answer ? saved.answer : '';
    var count = G.el('span', { class: 'g-df__count' });
    var draftStatus = G.el('span', { class: 'g-df__draft', role: 'status', 'aria-live': 'polite' });
    function paintCount() {
      var words = ta.value.trim() ? ta.value.trim().split(/\s+/).length : 0;
      count.textContent = words + (words === 1 ? ' word' : ' words');
    }
    var autosave = ui.debounce(function () {
      ui.storeCall('saveDefend', levelId, { answer: ta.value });
      draftStatus.textContent = 'Draft saved';
    }, 700);
    ta.addEventListener('input', function () { paintCount(); draftStatus.textContent = 'Saving draft'; autosave(); });
    ta.addEventListener('blur', function () { if (draftStatus.textContent === 'Saving draft') { ui.storeCall('saveDefend', levelId, { answer: ta.value }); draftStatus.textContent = 'Draft saved'; } });
    paintCount();

    var revealBtn = ui.button({ cls: 'g-btn--primary', icon: 'eye', label: 'Reveal model answer', attrs: { 'aria-expanded': 'false', 'aria-controls': uid + '-reveal' } });
    var revealNote = G.el('p', { class: 'g-df__nudge', hidden: true }, 'Tip: write a first attempt before you read the model answer. Comparing is where the learning happens.');
    root.appendChild(G.el('div', { class: 'g-df__step' },
      G.el('div', { class: 'g-df__steptitle' }, G.el('span', { class: 'g-df__stepn' }, clarify.length ? '2' : '1'), 'Your answer'),
      G.el('label', { class: 'sr-only', for: uid + '-answer' }, 'Your answer'),
      ta,
      G.el('div', { class: 'g-df__taFoot' }, count, draftStatus),
      G.el('div', { class: 'g-df__revealrow' }, revealBtn), revealNote));

    /* ---------- 5. reveal area ---------- */
    var reveal = G.el('div', { class: 'g-df__reveal', id: uid + '-reveal', hidden: true });
    var keyBadge = G.el('span', { class: 'g-key__badge', hidden: true }, ui.icon('eye', 14), 'Answer key');
    var revealTitle = G.el('h3', { class: 'g-df__revealtitle', tabindex: '-1' }, 'Compare with the model answer', ' ', keyBadge);
    reveal.appendChild(revealTitle);

    var opts = defend.options || [];
    if (opts.length) {
      var optGrid = G.el('div', { class: 'g-df__opts' });
      opts.forEach(function (o, i) {
        optGrid.appendChild(G.el('article', { class: 'g-df__opt' },
          G.el('div', { class: 'g-df__optname' }, G.el('span', { class: 'g-df__optletter', 'aria-hidden': 'true' }, String.fromCharCode(65 + i)), o.name),
          G.el('div', { class: 'g-df__optrow' }, G.el('span', { class: 'g-df__optlabel' }, 'Fits when'), ui.mdEl('div', null, o.when || '', ctx, 'inline')),
          G.el('div', { class: 'g-df__optrow' }, G.el('span', { class: 'g-df__optlabel' }, 'Trade-off'), ui.mdEl('div', null, o.tradeoff || '', ctx, 'inline'))));
      });
      reveal.appendChild(G.el('div', { class: 'g-df__block' }, G.el('div', { class: 'g-df__blocktitle' }, 'Options on the table'), optGrid));
    }

    var answerBox = G.el('div', { class: 'g-df__model' });
    if (G.render && G.render.blocks) {
      answerBox.appendChild(G.render.blocks(defend.modelAnswer || [], { world: ctx.world, level: ctx.level, refs: ctx.refs || {} }));
    } else {
      (defend.modelAnswer || []).forEach(function (b) { if (b.md) answerBox.appendChild(ui.mdEl('div', null, b.md, ctx, 'block')); });
    }
    reveal.appendChild(G.el('div', { class: 'g-df__block' }, G.el('div', { class: 'g-df__blocktitle' }, 'Model answer'), answerBox));

    var flags = defend.redFlags || [];
    if (flags.length) {
      var flagList = G.el('ul', { class: 'g-df__flags' });
      flags.forEach(function (f) { flagList.appendChild(G.el('li', null, ui.icon('flag', 16), ui.mdEl('span', null, f, ctx, 'inline'))); });
      reveal.appendChild(G.el('div', { class: 'g-df__block g-df__block--flags' }, G.el('div', { class: 'g-df__blocktitle' }, 'Red flags to avoid'), flagList));
    }

    /* rubric */
    var scoreNum = G.el('span', { class: 'g-score__num' });
    var scorePct = G.el('span', { class: 'g-score__pct' });
    var scoreFill = G.el('span', { class: 'g-bar__fill' });
    var verdict = G.el('p', { class: 'g-score__verdict', role: 'status', 'aria-live': 'polite' });
    var saveStatus = G.el('span', { class: 'g-df__saved' });
    var saveBtn = ui.button({ cls: 'g-btn--primary', icon: 'check', label: 'Save self-score' });
    var rubricList = G.el('ul', { class: 'g-rubric' });
    rubric.forEach(function (r, i) {
      var w = Math.max(1, Math.min(3, +r.w || 1));
      var input = G.el('input', { type: 'checkbox', class: 'sr-only', value: String(i) });
      input.checked = !!checked[i];
      input.addEventListener('change', function () {
        if (input.checked) checked[i] = true; else delete checked[i];
        paintScore(true);
      });
      rubricList.appendChild(G.el('li', null,
        G.el('label', { class: 'g-rubric__item' }, input,
          G.el('span', { class: 'g-rubric__box', 'aria-hidden': 'true' }, ui.icon('check', 14)),
          ui.mdEl('span', 'g-rubric__text', r.pt, ctx, 'inline'),
          G.el('span', { class: 'g-rubric__w', title: 'Worth ' + w + (w === 1 ? ' point' : ' points') },
            G.el('span', { 'aria-hidden': 'true' }, '\u25CF'.repeat(w) + '\u25CB'.repeat(3 - w)),
            G.el('span', { class: 'sr-only' }, w + (w === 1 ? ' point' : ' points'))),
          G.el('span', { class: 'g-opt__ring', 'aria-hidden': 'true' }))));
    });
    function currentScore() {
      return rubric.reduce(function (s, r, i) { return s + (checked[i] ? (+r.w || 1) : 0); }, 0);
    }
    function paintScore(dirty) {
      var s = currentScore();
      var pct = totalWeight ? Math.round((s / totalWeight) * 100) : 0;
      scoreNum.textContent = s + ' / ' + totalWeight;
      scorePct.textContent = pct + '%';
      scoreFill.style.width = pct + '%';
      scoreFill.parentNode.classList.toggle('is-good', pct >= 70);
      verdict.textContent = pct >= 70 ? 'Strong. A score of 70% or more earns bonus XP when you save it.'
        : pct >= 40 ? 'Getting there. Read the model answer again and note what you missed.'
          : 'Tick what your answer covered. Be honest, the score is only for you.';
      if (dirty && scored) saveStatus.textContent = 'Unsaved changes';
    }
    saveBtn.addEventListener('click', function () {
      var idx = Object.keys(checked).map(Number).sort(function (a, b) { return a - b; });
      ui.storeCall('saveDefend', levelId, { score: currentScore(), max: totalWeight, checked: idx, answer: ta.value });
      scored = true;
      var pct = totalWeight ? Math.round((currentScore() / totalWeight) * 100) : 0;
      saveStatus.textContent = 'Saved: ' + currentScore() + ' of ' + totalWeight + ' (' + pct + '%)';
      ui.announce('Self-score saved. ' + pct + ' percent.');
      if (G.quiz && G.quiz.completeIfMet) G.quiz.completeIfMet(level, worldId);
    });
    if (rubric.length) {
      reveal.appendChild(G.el('div', { class: 'g-df__block' },
        G.el('div', { class: 'g-df__blocktitle' }, 'Score yourself'),
        G.el('p', { class: 'g-df__help' }, 'Tick every point your answer made. Heavier points count more.'),
        rubricList,
        G.el('div', { class: 'g-score' },
          G.el('div', { class: 'g-score__line' }, G.el('span', { class: 'g-score__label' }, 'Your score'), scoreNum, scorePct),
          G.el('div', { class: 'g-bar g-score__bar', 'aria-hidden': 'true' }, scoreFill),
          verdict,
          G.el('div', { class: 'g-score__actions' }, saveBtn, saveStatus))));
      if (scored && saved) saveStatus.textContent = 'Saved: ' + saved.score + ' of ' + saved.max + ' (' + (saved.max ? Math.round((saved.score / saved.max) * 100) : 0) + '%)';
      paintScore(false);
    }

    /* follow ups */
    var followUps = defend.followUps || [];
    if (followUps.length) {
      var fuGrid = G.el('div', { class: 'g-follow' });
      followUps.forEach(function (f, i) {
        var qFace = G.el('div', { class: 'g-follow__face g-follow__q' }, G.el('div', { class: 'g-fc__label' }, 'Follow-up ' + (i + 1)), ui.mdEl('div', 'g-follow__text', f.q, ctx, 'block'));
        var aFace = G.el('div', { class: 'g-follow__face g-follow__a', tabindex: '-1' }, G.el('div', { class: 'g-fc__label' }, 'A strong answer'), ui.mdEl('div', 'g-follow__text', f.a, ctx, 'block'));
        aFace.inert = true;
        aFace.setAttribute('aria-hidden', 'true');
        var inner = G.el('div', { class: 'g-follow__inner' }, qFace, aFace);
        var btn = ui.button({ cls: 'g-btn--ghost g-btn--sm', icon: 'flip', label: 'Show answer', attrs: { 'aria-pressed': 'false' } });
        var flipped = false;
        function toggle() {
          flipped = !flipped;
          inner.classList.toggle('is-flipped', flipped);
          btn.setAttribute('aria-pressed', flipped ? 'true' : 'false');
          ui.setBtnLabel(btn, flipped ? 'Show question' : 'Show answer');
          aFace.inert = !flipped;
          qFace.inert = flipped;
          if (flipped) aFace.removeAttribute('aria-hidden'); else aFace.setAttribute('aria-hidden', 'true');
          if (flipped) qFace.setAttribute('aria-hidden', 'true'); else qFace.removeAttribute('aria-hidden');
        }
        btn.addEventListener('click', toggle);
        inner.addEventListener('click', function (e) { if (!e.target.closest('a, button')) toggle(); });
        fuGrid.appendChild(G.el('div', { class: 'g-follow__card' }, inner, G.el('div', { class: 'g-follow__btn' }, btn)));
      });
      reveal.appendChild(G.el('div', { class: 'g-df__block' }, G.el('div', { class: 'g-df__blocktitle' }, 'Follow-up questions'),
        G.el('p', { class: 'g-df__help' }, 'The interviewer pushes back. Answer aloud, then flip the card.'), fuGrid));
    }
    root.appendChild(reveal);

    /* ---------- reveal state ---------- */
    function syncReveal(focus) {
      var key = ui.facilitator();
      var open = manualReveal || key;
      reveal.hidden = !open;
      revealBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      ui.setBtnLabel(revealBtn, open && manualReveal ? 'Hide model answer' : 'Reveal model answer');
      revealBtn.hidden = key && !manualReveal;
      keyBadge.hidden = !key;
      syncClarify();
      if (open && focus) revealTitle.focus({ preventScroll: false });
    }
    revealBtn.addEventListener('click', function () {
      manualReveal = !manualReveal;
      revealNote.hidden = !(manualReveal && !ta.value.trim());
      syncReveal(manualReveal);
    });
    ui.subscribe(root, 'store:change', function () { syncReveal(false); });

    G.clear(container);
    container.appendChild(root);
    syncReveal(false);

    return {
      destroy: function () { stopTimer(); autosave.flush(); G.clear(container); }
    };
  }

  G.defend = { mount: mount };
})();
