/* Follow the Question: flashcard review. Owner: E2.
   Guide.flashcards.mountReview(container, scope)  scope = { worldId?, tag?, limit? }
   Space or Enter flips, keys 1 to 4 grade (Again, Hard, Good, Easy). Spacing is handled by Guide.store.rateCard. */
(function () {
  'use strict';
  var G = (window.Guide = window.Guide || {});
  var ui = G.kit;

  var GRADES = [
    { g: 0, label: 'Again', hint: 'Forgot it', tone: 'bad' },
    { g: 1, label: 'Hard', hint: 'Struggled', tone: 'warn' },
    { g: 2, label: 'Good', hint: 'Got it', tone: 'ok' },
    { g: 3, label: 'Easy', hint: 'Instant', tone: 'info' }
  ];
  var DEFAULT_LIMIT = 20;

  function storeCards() {
    var st = G.store && G.store.get ? G.store.get() : null;
    return (st && st.cards) || {};
  }
  function worldMetas() { return (G.manifest && G.manifest.worlds) || []; }
  function untilText(ts) {
    var ms = ts - Date.now();
    if (ms <= 60000) return 'in under a minute';
    var min = Math.round(ms / 60000);
    if (min < 60) return 'in ' + min + ' min';
    var h = Math.round(min / 60);
    if (h < 24) return 'in ' + h + ' h';
    var d = Math.round(h / 24);
    return 'in ' + d + (d === 1 ? ' day' : ' days');
  }

  function mountReview(container, scope) {
    scope = scope || {};
    var uid = ui.uid('fc');
    var filter = { worldId: scope.worldId || '', tag: scope.tag || '' };
    /* The world filter is hidden when the caller fixes a world, or passes worldFilter: false because it has its own scope control. */
    var showWorldFilter = scope.worldFilter === undefined ? !scope.worldId : !!scope.worldFilter;
    var limit = scope.limit || DEFAULT_LIMIT;
    var pool = {};          // worldId -> array of card objects
    var loading = false;
    var loadError = [];
    var session = null;     // { mode, queue, idx, flipped, stats, requeued, total }
    var destroyed = false;

    var root = G.el('section', { class: 'g-fc g-scope', 'aria-label': 'Flashcard review' });
    var filters = G.el('div', { class: 'g-fc__filters' });
    var main = G.el('div', { class: 'g-fc__main' });
    root.appendChild(filters);
    root.appendChild(main);
    G.clear(container);
    container.appendChild(root);

    /* ---------- data ---------- */
    function wantedWorlds() {
      if (filter.worldId) return [filter.worldId];
      return worldMetas().map(function (w) { return w.id; });
    }
    function ensureLoaded() {
      var need = wantedWorlds().filter(function (id) { return !pool[id]; });
      if (!need.length) { loading = false; return Promise.resolve(); }
      loading = true;
      render();
      return Promise.all(need.map(function (id) {
        return G.content.load(id).then(function (w) {
          pool[id] = (w.flashcards || []).map(function (c) {
            return { id: c.id, front: c.front, back: c.back, tags: c.tags || [], worldId: id, worldShort: w.short || w.title || id, refs: refMap(w) };
          });
        }).catch(function () { pool[id] = []; loadError.push(id); });
      })).then(function () { loading = false; });
    }
    function refMap(w) {
      var m = {};
      (w.references || []).forEach(function (r) { m[r.id] = r; });
      return m;
    }
    function scoped() {
      var out = [];
      wantedWorlds().forEach(function (id) { (pool[id] || []).forEach(function (c) { out.push(c); }); });
      return out;
    }
    function filtered() {
      return scoped().filter(function (c) { return !filter.tag || c.tags.indexOf(filter.tag) !== -1; });
    }
    function byId(cards) {
      var m = {};
      cards.forEach(function (c) { m[c.id] = c; });
      return m;
    }
    function dueList(cards) {
      var map = byId(cards);
      var ids = ui.storeCall('dueCards', filter.worldId || undefined) || [];
      var seen = {};
      var out = [];
      ids.forEach(function (id) { if (map[id] && !seen[id]) { seen[id] = true; out.push(map[id]); } });
      var rec = storeCards();
      cards.forEach(function (c) { if (!seen[c.id] && !rec[c.id]) { seen[c.id] = true; out.push(c); } });
      return out;
    }
    function aheadList(cards) {
      var rec = storeCards();
      var now = Date.now();
      return cards.filter(function (c) { return rec[c.id] && rec[c.id].due > now; })
        .sort(function (a, b) { return rec[a.id].due - rec[b.id].due; });
    }
    function counts(cards) {
      var rec = storeCards();
      var due = dueList(cards);
      var fresh = cards.filter(function (c) { return !rec[c.id]; }).length;
      return { total: cards.length, due: due.length, fresh: fresh, learning: cards.length - fresh };
    }

    /* ---------- filters ---------- */
    function renderFilters() {
      G.clear(filters);
      var worldSel = G.el('select', { class: 'g-select', id: uid + '-world' }, G.el('option', { value: '' }, 'All worlds'));
      worldMetas().forEach(function (w) {
        var o = G.el('option', { value: w.id }, w.short || w.title);
        if (w.id === filter.worldId) o.selected = true;
        worldSel.appendChild(o);
      });
      var tags = {};
      scoped().forEach(function (c) { c.tags.forEach(function (t) { tags[t] = (tags[t] || 0) + 1; }); });
      var tagSel = G.el('select', { class: 'g-select', id: uid + '-tag' }, G.el('option', { value: '' }, 'All topics'));
      Object.keys(tags).sort().forEach(function (t) {
        var o = G.el('option', { value: t }, t + ' (' + tags[t] + ')');
        if (t === filter.tag) o.selected = true;
        tagSel.appendChild(o);
      });
      worldSel.addEventListener('change', function () {
        filter.worldId = worldSel.value;
        filter.tag = '';
        session = null;
        ensureLoaded().then(render);
      });
      tagSel.addEventListener('change', function () { filter.tag = tagSel.value; session = null; render(); });
      if (showWorldFilter) filters.appendChild(G.el('div', { class: 'g-field' }, G.el('label', { for: uid + '-world' }, 'World'), worldSel));
      filters.appendChild(G.el('div', { class: 'g-field' }, G.el('label', { for: uid + '-tag' }, 'Topic'), tagSel));
    }

    /* ---------- views ---------- */
    function renderLoading() {
      G.clear(main);
      main.appendChild(G.el('div', { class: 'g-fc__loading', role: 'status' },
        G.el('div', { class: 'g-skeleton g-fc__skeleton', 'aria-hidden': 'true' }, G.el('span'), G.el('span'), G.el('span')),
        G.el('span', { class: 'sr-only' }, 'Loading cards')));
    }

    function stat(label, value, tone) {
      return G.el('div', { class: 'g-stat g-stat--' + (tone || 'plain') },
        G.el('div', { class: 'g-stat__value' }, String(value)), G.el('div', { class: 'g-stat__label' }, label));
    }

    function renderHome() {
      var cards = filtered();
      var c = counts(cards);
      var ahead = aheadList(cards);
      G.clear(main);
      var wrap = G.el('div', { class: 'g-fc__home' });
      wrap.appendChild(G.el('div', { class: 'g-fc__stats' },
        stat('Due now', c.due, 'accent'), stat('New', c.fresh), stat('In review', c.learning), stat('In this set', c.total)));
      if (loadError.length) {
        wrap.appendChild(G.el('p', { class: 'g-fc__warn' }, ui.icon('warn', 16), 'Some worlds could not be loaded: ' + loadError.join(', ') + '.'));
      }
      if (!c.total) {
        wrap.appendChild(emptyBlock('cards', 'No cards match these filters', 'Pick another world or topic.', null));
      } else if (c.due === 0) {
        var rec = storeCards();
        var next = ahead.length ? rec[ahead[0].id].due : 0;
        wrap.appendChild(emptyBlock('trophy', 'You are all caught up',
          next ? 'The next card is due ' + untilText(next) + '. You can study ahead to get a head start.' : 'Nothing is waiting for review.',
          ahead.length ? ui.button({ cls: 'g-btn--primary', icon: 'play', label: 'Study ahead', onClick: function () { start('ahead'); } }) : null));
      } else {
        var n = Math.min(c.due, limit);
        wrap.appendChild(G.el('div', { class: 'g-fc__cta' },
          G.el('div', { class: 'g-fc__cta-text' },
            G.el('div', { class: 'g-fc__cta-title' }, c.due + (c.due === 1 ? ' card is' : ' cards are') + ' ready'),
            G.el('div', { class: 'g-fc__cta-sub' }, 'A session shows up to ' + limit + ' cards. Cards you miss come back before the end.')),
          ui.button({ cls: 'g-btn--primary g-btn--lg', icon: 'play', label: 'Start ' + n + ' card' + (n === 1 ? '' : 's'), onClick: function () { start('due'); } })));
        if (ahead.length) {
          wrap.appendChild(G.el('div', { class: 'g-fc__more' },
            ui.button({ cls: 'g-btn--ghost g-btn--sm', icon: 'clock', label: 'Study ahead instead', onClick: function () { start('ahead'); } })));
        }
      }
      main.appendChild(wrap);
    }

    function emptyBlock(iconName, title, text, action) {
      return G.el('div', { class: 'g-fc__empty' },
        G.el('div', { class: 'g-fc__empty-icon' }, ui.icon(iconName, 40)),
        G.el('div', { class: 'g-fc__empty-title' }, title),
        G.el('p', { class: 'g-fc__empty-text' }, text),
        action);
    }

    function start(mode) {
      var cards = filtered();
      var list = mode === 'ahead' ? aheadList(cards) : dueList(cards);
      list = list.slice(0, limit);
      if (!list.length) { session = null; render(); return; }
      session = { mode: mode, queue: list.slice(), idx: 0, flipped: false, stats: [0, 0, 0, 0], requeued: {}, total: list.length, done: 0 };
      render();
    }

    function currentCard() { return session.queue[session.idx]; }

    function renderSession() {
      var card = currentCard();
      if (!card) return renderSummary();
      G.clear(main);
      var rec = storeCards()[card.id];
      var pct = Math.round((session.done / Math.max(1, session.queue.length)) * 100);
      var progress = G.el('div', { class: 'g-fc__progress' },
        G.el('div', { class: 'g-fc__progress-text', 'aria-live': 'off' },
          G.el('strong', null, 'Card ' + (session.idx + 1) + ' of ' + session.queue.length),
          session.mode === 'ahead' ? G.el('span', { class: 'g-chip g-chip--info' }, 'Studying ahead') : null),
        G.el('div', { class: 'g-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct), 'aria-label': 'Session progress' },
          G.el('span', { class: 'g-bar__fill', style: { width: pct + '%' } })));

      var ctx = { refs: card.refs };
      var box = rec ? rec.box : 0;
      var meta = G.el('div', { class: 'g-fc__meta' },
        G.el('span', { class: 'g-chip g-chip--accent' }, card.worldShort),
        card.tags.slice(0, 3).map(function (t) { return G.el('span', { class: 'g-chip g-chip--neutral' }, t); }),
        G.el('span', { class: 'g-boxes', title: box ? 'Box ' + box + ' of 5' : 'New card' },
          [1, 2, 3, 4, 5].map(function (n) { return G.el('span', { class: 'g-boxes__dot' + (n <= box ? ' is-on' : ''), 'aria-hidden': 'true' }); }),
          G.el('span', { class: 'sr-only' }, box ? 'Box ' + box + ' of 5' : 'New card')));

      var front = G.el('div', { class: 'g-fc__face g-fc__front' },
        G.el('div', { class: 'g-fc__label' }, 'Question'),
        ui.mdEl('div', 'g-fc__content', card.front, ctx, 'block'));
      var backContent = ui.mdEl('div', 'g-fc__content', card.back, ctx, 'block');
      var back = G.el('div', { class: 'g-fc__face g-fc__back', tabindex: '-1', 'aria-label': 'Answer' },
        G.el('div', { class: 'g-fc__label' }, 'Answer'),
        G.el('div', { class: 'g-fc__recap' }, G.md.text(card.front)),
        backContent);
      back.setAttribute('aria-hidden', 'true');
      back.inert = true;
      var face = G.el('div', { class: 'g-fc__card' }, front, back);
      var scene = G.el('div', { class: 'g-fc__scene' }, face);
      var stage = G.el('div', { class: 'g-fc__stage g-fc__enter' }, meta, scene);

      var showBtn = ui.button({ cls: 'g-btn--primary g-btn--lg g-fc__show', icon: 'flip', label: 'Show answer' });
      var gradeRow = G.el('div', { class: 'g-grades', role: 'group', 'aria-label': 'How well did you recall it?', hidden: true });
      GRADES.forEach(function (gr) {
        var b = G.el('button', { type: 'button', class: 'g-grade g-grade--' + gr.tone, 'data-grade': String(gr.g) },
          G.el('span', { class: 'g-grade__key', 'aria-hidden': 'true' }, String(gr.g + 1)),
          G.el('span', { class: 'g-grade__label' }, gr.label),
          G.el('span', { class: 'g-grade__hint' }, gr.hint));
        b.addEventListener('click', function () { grade(gr.g); });
        gradeRow.appendChild(b);
      });
      var controls = G.el('div', { class: 'g-fc__controls' }, showBtn, gradeRow);
      var keys = G.el('p', { class: 'g-fc__keys' },
        G.el('kbd', null, 'Space'), ' flip \u00B7 ', G.el('kbd', null, '1'), ' to ', G.el('kbd', null, '4'), ' grade');

      main.appendChild(progress);
      main.appendChild(stage);
      main.appendChild(controls);
      main.appendChild(keys);

      session.ui = { face: face, front: front, back: back, showBtn: showBtn, gradeRow: gradeRow };
      session.flipped = false;
      showBtn.addEventListener('click', flipCard);
      showBtn.focus({ preventScroll: true });
    }

    function flipCard() {
      if (!session || !session.ui || session.flipped) return;
      session.flipped = true;
      var u = session.ui;
      u.face.classList.add('is-flipped');
      u.back.inert = false;
      u.back.removeAttribute('aria-hidden');
      u.front.inert = true;
      u.front.setAttribute('aria-hidden', 'true');
      u.showBtn.hidden = true;
      u.gradeRow.hidden = false;
      u.back.focus({ preventScroll: true });
    }

    function grade(g) {
      if (!session || !session.flipped) return;
      var card = currentCard();
      ui.storeCall('rateCard', card.id, g);
      session.stats[g] += 1;
      session.done += 1;
      if (g === 0 && !session.requeued[card.id]) {
        session.requeued[card.id] = true;
        session.queue.push(card);
      }
      session.idx += 1;
      session.flipped = false;
      renderSession();
      if (session.idx < session.queue.length) ui.announce('Card ' + (session.idx + 1) + ' of ' + session.queue.length);
    }

    function renderSummary() {
      G.clear(main);
      var s = session.stats;
      var total = s[0] + s[1] + s[2] + s[3];
      var recalled = s[2] + s[3];
      var pct = total ? Math.round((recalled / total) * 100) : 0;
      var cards = filtered();
      var moreDue = dueList(cards).length;
      var xp = recalled * 2;
      var wrap = G.el('div', { class: 'g-fc__summary' },
        G.el('div', { class: 'g-fc__empty-icon' }, ui.icon('trophy', 44)),
        G.el('h3', { class: 'g-fc__summary-title' }, 'Session complete'),
        G.el('p', { class: 'g-fc__summary-sub' }, total + ' reviews \u00B7 ' + pct + '% recalled' + (xp ? ' \u00B7 +' + xp + ' XP' : '')),
        G.el('div', { class: 'g-fc__stats' },
          stat('Again', s[0], 'bad'), stat('Hard', s[1], 'warn'), stat('Good', s[2], 'ok'), stat('Easy', s[3], 'info')),
        G.el('div', { class: 'g-fc__summary-actions' },
          moreDue ? ui.button({ cls: 'g-btn--primary', icon: 'play', label: 'Review ' + Math.min(moreDue, limit) + ' more', onClick: function () { start('due'); } }) : null,
          ui.button({ cls: 'g-btn--ghost', icon: 'clock', label: 'Study ahead', onClick: function () { start('ahead'); } }),
          ui.button({ cls: 'g-btn--ghost', icon: 'arrow-left', label: 'Back to overview', onClick: function () { session = null; render(); } })));
      main.appendChild(wrap);
      ui.announce('Session complete. ' + pct + ' percent recalled.');
      var heading = wrap.querySelector('h3');
      if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
    }

    function render() {
      if (destroyed) return;
      if (session && !loading) G.clear(filters); else renderFilters();
      if (loading) return renderLoading();
      if (session) return session.idx >= session.queue.length ? renderSummary() : renderSession();
      renderHome();
    }

    /* ---------- keyboard ---------- */
    function onKey(e) {
      if (destroyed) return;
      if (!root.isConnected) { document.removeEventListener('keydown', onKey); return; }
      if (e.ctrlKey || e.metaKey || e.altKey || !session || session.idx >= session.queue.length) return;
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (document.querySelector('.g-zoom, [role="dialog"][aria-modal="true"]')) return;
      if (/^[1-4]$/.test(e.key) && session.flipped) { e.preventDefault(); grade(+e.key - 1); return; }
      if ((e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter') && !session.flipped) {
        if (t && t.closest && t.closest('button, a, summary, select')) return;
        e.preventDefault();
        flipCard();
      }
    }
    document.addEventListener('keydown', onKey);

    /* ---------- boot ---------- */
    loading = true;
    render();
    ensureLoaded().then(function () { loading = false; render(); });

    return {
      destroy: function () { destroyed = true; document.removeEventListener('keydown', onKey); G.clear(container); }
    };
  }

  G.flashcards = { mountReview: mountReview };
})();
