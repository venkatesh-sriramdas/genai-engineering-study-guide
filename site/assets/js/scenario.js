/* Follow the Question: scenario trade-off cards. Owner: E2.
   Guide.scenario.mount(container, item, ctx) -> { destroy, state }
   ctx = { world, topic, refs, topicId, worldId }
   The learner reads the situation, picks one option, checks, and then sees the verdict (Best, Good, Poor),
   the reasoning and the trade-off of EVERY option, the flips and the takeaway. Records through
   Guide.store.recordQuiz(item.id, pickedVerdict === 'best', { topicId, worldId }). */
(function () {
  'use strict';
  var G = (window.Guide = window.Guide || {});
  var ui = G.kit;

  var VERDICT = {
    best: { label: 'Best', icon: 'star', say: 'Best fit for these constraints' },
    good: { label: 'Good', icon: 'check', say: 'Good, but it has a cost' },
    poor: { label: 'Poor', icon: 'cross', say: 'Poor fit here' }
  };

  function storeRecord(id) {
    var st = G.store && G.store.get ? G.store.get() : null;
    return st && st.quiz ? st.quiz[id] : null;
  }

  function order(n, seed) {
    var ids = [], i;
    for (i = 0; i < n; i++) ids.push(i);
    if (n < 2) return ids;
    for (var t = 0; t < 12; t++) {
      var s = G.shuffle(ids, seed + ':' + t);
      if (s.some(function (v, k) { return v !== k; })) return s;
    }
    return ids.slice().reverse();
  }

  function badge(verdict) {
    var v = VERDICT[verdict];
    var b = G.el('span', { class: 'g-vd g-vd--' + verdict });
    b.appendChild(ui.icon(v.icon, 14));
    b.appendChild(G.el('span', { class: 'g-vd__text' }, v.label));
    return b;
  }

  function mount(container, item, ctx) {
    ctx = ctx || {};
    item = item || {};
    var worldId = ctx.worldId || (ctx.world && ctx.world.id) || '';
    var topicId = ctx.topicId || (ctx.topic && ctx.topic.id) || String(item.id || '').replace(/-s\d+$/, '');
    if (!ctx.refs) {
      ctx = Object.assign({}, ctx, { refs: {} });
      ((ctx.world && ctx.world.references) || []).forEach(function (r) { ctx.refs[r.id] = r; });
    }
    var opts = (item.options || []).filter(function (o) { return o && VERDICT[o.verdict]; });
    var uid = ui.uid('scn');
    var qId = uid + '-q';
    var state = { picked: null, checked: false, nth: 0 };
    var inputs = [];
    var cards = [];

    var root = G.el('article', { class: 'g-sc g-scope', 'data-state': 'open', id: 'scn-' + item.id, 'aria-labelledby': uid + '-t' });

    /* head */
    var solved = storeRecord(item.id);
    var title = ui.mdEl('h3', 'g-sc__title', item.title || 'Scenario', ctx, 'inline');
    title.id = uid + '-t';
    var keyBadge = G.el('span', { class: 'g-key__badge g-sc__keybadge', hidden: true }, ui.icon('eye', 14), 'Answer key');
    root.appendChild(G.el('header', { class: 'g-sc__head' },
      G.el('div', { class: 'g-sc__heading' },
        G.el('div', { class: 'g-eyebrow' }, ui.icon('target', 14), ctx.index ? 'Scenario ' + ctx.index + ' of ' + ctx.count : 'Scenario'), title),
      G.el('div', { class: 'g-sc__flags' }, solved && solved.correct ? ui.chip('Solved before', 'ok', 'check') : null, keyBadge)));

    /* situation and constraints */
    if (item.situation) root.appendChild(ui.mdEl('div', 'g-sc__situation', item.situation, ctx, 'block'));
    if (item.constraints && item.constraints.length) {
      var chips = G.el('ul', { class: 'g-sc__chips' });
      item.constraints.forEach(function (c) {
        chips.appendChild(G.el('li', { class: 'g-sc__chip' }, ui.icon('lock', 14), ui.mdEl('span', null, c, ctx, 'inline')));
      });
      root.appendChild(G.el('div', { class: 'g-sc__constraints' },
        G.el('div', { class: 'g-sc__label' }, 'Fixed in this scenario'), chips));
    }
    if (item.unknowns && item.unknowns.length) {
      var ul = G.el('ul', { class: 'g-sc__unklist' });
      item.unknowns.forEach(function (u) { ul.appendChild(ui.mdEl('li', null, u, ctx, 'inline')); });
      root.appendChild(G.el('details', { class: 'g-sc__unk' },
        G.el('summary', { class: 'g-sc__unksum' },
          G.el('span', { class: 'g-sc__unkchev' }, ui.icon('chevron-right', 16)),
          ui.icon('search', 16),
          G.el('span', null, 'Questions to ask first'),
          G.el('span', { class: 'g-sc__count' }, String(item.unknowns.length))),
        G.el('div', { class: 'g-sc__unkbody' },
          G.el('p', { class: 'g-sc__unkhint' }, 'Facts the scenario does not give are the dials. A strong candidate asks:'), ul)));
    }

    /* question and options */
    var questionText = ui.mdEl('div', 'g-sc__question', item.question || 'What would you do?', ctx, 'block');
    questionText.id = qId;
    root.appendChild(G.el('div', { class: 'g-sc__ask' }, G.el('div', { class: 'g-sc__label' }, 'The question'), questionText));

    var list = G.el('div', { class: 'g-sc__opts', role: 'radiogroup', 'aria-labelledby': qId });
    root.appendChild(list);

    var checkBtn = ui.button({ cls: 'g-btn--primary g-sc__check', icon: 'check', label: 'Check my choice' });
    checkBtn.disabled = true;
    var hint = G.el('span', { class: 'g-sc__keys' }, 'Keys ', G.el('kbd', null, '1'), ' to ', G.el('kbd', null, String(Math.max(2, opts.length))), ' choose, ', G.el('kbd', null, 'Enter'), ' checks');
    root.appendChild(G.el('div', { class: 'g-sc__actions' }, checkBtn, hint));
    var feedback = G.el('div', { class: 'g-sc__feedback', role: 'status', 'aria-live': 'polite' });
    root.appendChild(feedback);

    /* flips and takeaway (shown after the reveal) */
    var after = G.el('div', { class: 'g-sc__after', hidden: true });
    if (item.flips && item.flips.length) {
      var fl = G.el('ul', { class: 'g-sc__flips' });
      item.flips.forEach(function (f) {
        fl.appendChild(G.el('li', { class: 'g-sc__flip' },
          G.el('div', { class: 'g-sc__if' }, G.el('span', { class: 'g-sc__tag' }, 'If'), ui.mdEl('span', null, f['if'], ctx, 'inline')),
          G.el('div', { class: 'g-sc__then' }, G.el('span', { class: 'g-sc__tag g-sc__tag--then' }, ui.icon('arrow-right', 14), 'Then'), ui.mdEl('span', null, f.then, ctx, 'inline'))));
      });
      after.appendChild(G.el('div', { class: 'g-sc__flipbox' },
        G.el('div', { class: 'g-sc__label g-sc__label--flip' }, ui.icon('refresh', 14), 'What flips the answer'), fl));
    }
    if (item.takeaway) {
      after.appendChild(G.el('div', { class: 'g-takeaway g-sc__takeaway' }, ui.icon('bulb', 18),
        G.el('div', null, G.el('strong', null, 'Takeaway: '), ui.mdEl('span', null, item.takeaway, ctx, 'inline'))));
    }
    root.appendChild(after);

    /* ---------- options ---------- */
    function build() {
      G.clear(list);
      inputs = [];
      cards = [];
      var perm = order(opts.length, item.id || uid);
      if (state.nth > 0) perm = G.shuffle(perm, (item.id || uid) + ':' + state.nth);
      var name = ui.uid('scno');
      perm.forEach(function (orig, pos) {
        var o = opts[orig];
        var input = G.el('input', { type: 'radio', class: 'sr-only', name: name, value: String(orig) });
        input.addEventListener('change', function () { state.picked = orig; paintPick(); });
        inputs.push(input);
        var why = G.el('div', { class: 'g-sco__why' }, G.el('div', { class: 'g-sco__rlabel' }, 'Why'), ui.mdEl('div', null, o.why || '', ctx, 'block'));
        var trade = G.el('div', { class: 'g-sco__trade' }, G.el('div', { class: 'g-sco__rlabel' }, ui.icon('flip', 12), 'Trade-off'), ui.mdEl('div', null, o.tradeoff || '', ctx, 'block'));
        var reveal = G.el('div', { class: 'g-sco__reveal', hidden: true }, why, trade);
        var verdict = G.el('span', { class: 'g-sco__verdict', hidden: true });
        var mine = G.el('span', { class: 'g-sco__mine', hidden: true }, ui.icon('user', 14), 'Your choice');
        var label = G.el('label', { class: 'g-sco__label' }, input,
          G.el('span', { class: 'g-sco__key', 'aria-hidden': 'true' }, String(pos + 1)),
          ui.mdEl('span', 'g-sco__name', o.name, ctx, 'inline'),
          G.el('span', { class: 'g-sco__badges' }, verdict, mine));
        var card = G.el('div', { class: 'g-sco', 'data-orig': String(orig) }, label, reveal);
        cards.push({ card: card, orig: orig, verdict: verdict, mine: mine, reveal: reveal, input: input });
        list.appendChild(card);
      });
    }

    function paintPick() {
      cards.forEach(function (c) { c.card.classList.toggle('is-selected', state.picked === c.orig); });
      if (!state.checked) checkBtn.disabled = state.picked === null;
    }

    function setBtn(mode) {
      var old = checkBtn.querySelector('.g-ic');
      var fresh = ui.icon(mode === 'check' ? 'check' : 'refresh', 18);
      if (old) checkBtn.replaceChild(fresh, old); else checkBtn.insertBefore(fresh, checkBtn.firstChild);
      ui.setBtnLabel(checkBtn, mode === 'check' ? 'Check my choice' : 'Try again');
      checkBtn.classList.toggle('g-btn--primary', mode === 'check');
      checkBtn.classList.toggle('g-btn--ghost', mode !== 'check');
    }

    /* Draws the reveal. Called after a check and whenever facilitator mode changes. */
    function paintReveal() {
      var key = ui.facilitator();
      var show = state.checked || key;
      root.dataset.state = state.checked ? 'checked' : key ? 'key' : 'open';
      keyBadge.hidden = state.checked || !key;
      after.hidden = !show;
      cards.forEach(function (c) {
        var o = opts[c.orig];
        c.reveal.hidden = !show;
        c.verdict.hidden = !show;
        G.clear(c.verdict);
        if (show) c.verdict.appendChild(badge(o.verdict));
        c.card.classList.remove('is-best', 'is-good', 'is-poor');
        if (show) c.card.classList.add('is-' + o.verdict);
        var mine = state.checked && state.picked === c.orig;
        c.mine.hidden = !mine;
        c.card.classList.toggle('is-mine', mine);
      });
      hint.hidden = state.checked;
    }

    function check() {
      if (state.checked || state.picked === null) return;
      var o = opts[state.picked];
      var best = o.verdict === 'best';
      state.checked = true;
      inputs.forEach(function (i) { i.disabled = true; });
      paintReveal();
      setBtn('again');
      checkBtn.disabled = false;

      var v = VERDICT[o.verdict];
      var bestOpt = opts.filter(function (x) { return x.verdict === 'best'; })[0];
      G.clear(feedback);
      feedback.className = 'g-sc__feedback is-visible is-' + o.verdict;
      feedback.appendChild(G.el('div', { class: 'g-sc__result' }, ui.icon(v.icon, 18),
        G.el('strong', null, v.say + '.'),
        best ? null : G.el('span', { class: 'g-sc__bestline' }, 'The best fit here: ', ui.mdEl('strong', null, bestOpt ? bestOpt.name : '', ctx, 'inline'))));
      var partial = o.verdict === 'good' ? ' A good choice earns partial credit.' : '';
      ui.announce('Your choice, ' + G.md.text(o.name) + ', is rated ' + v.label + '. ' + (best ? '' : 'The best fit is ' + (bestOpt ? G.md.text(bestOpt.name) : 'another option') + '. ') +
        'Every option is explained below.' + partial);
      ui.storeCall('recordQuiz', item.id, best, { topicId: topicId, worldId: worldId, tag: 'tradeoff', verdict: o.verdict });
    }

    function retry() {
      state.checked = false;
      state.picked = null;
      state.nth += 1;
      G.clear(feedback);
      feedback.className = 'g-sc__feedback';
      build();
      setBtn('check');
      checkBtn.disabled = true;
      paintReveal();
      var first = inputs[0];
      if (first) first.focus({ preventScroll: true });
    }

    checkBtn.addEventListener('click', function () { if (state.checked) retry(); else check(); });
    root.addEventListener('keydown', function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var t = e.target, tag = t.tagName;
      if (e.key === 'Enter') {
        if (state.checked || state.picked === null) return;
        if (tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY') return;
        e.preventDefault();
        check();
        return;
      }
      if (state.checked) return;
      if (/^[1-4]$/.test(e.key)) {
        var input = inputs[+e.key - 1];
        if (!input || input.disabled) return;
        e.preventDefault();
        input.checked = true;
        input.focus();
        state.picked = +input.value;
        paintPick();
      }
    });

    build();
    paintReveal();
    ui.subscribe(root, 'store:change', paintReveal);

    G.clear(container);
    container.appendChild(root);

    return {
      destroy: function () { G.clear(container); },
      state: function () { return { picked: state.picked, checked: state.checked }; }
    };
  }

  G.scenario = { mount: mount };
})();
