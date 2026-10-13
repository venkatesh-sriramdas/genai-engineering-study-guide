/* Follow the Question: search. Owner: E1.
   Command palette (/ or Ctrl or Cmd K) and the full results view (#/search?q=).
   Fuzzy, AND-style matching over Guide.searchIndex plus a few commands. */
(function () {
  'use strict';

  const G = window.Guide;
  const el = G.el;
  const U = () => G.ui;
  G.views = G.views || {};

  const KIND_ORDER = ['action', 'world', 'topic', 'scenario', 'level', 'section', 'term', 'card', 'quiz', 'ref'];
  const KIND_LABEL = { action: 'Commands', world: 'Chapters', topic: 'Topics', scenario: 'Scenarios', level: 'Practice problems', section: 'Sections', term: 'Glossary terms', card: 'Flashcards', quiz: 'Quiz questions', ref: 'References' };
  const KIND_ICON = { action: 'sparkles', world: 'map', topic: 'layers', scenario: 'flip', level: 'flag', section: 'list', term: 'book', card: 'cards', quiz: 'target', ref: 'link' };
  const KIND_WEIGHT = { action: 1.7, world: 1.6, topic: 1.5, level: 1.3, term: 1.2, section: 1.15, scenario: 1.0, ref: 0.95, card: 0.95, quiz: 0.85 };

  let index = null;
  let actions = null;

  /* ---------- index ---------- */
  function actionList() {
    if (actions) return actions;
    const run = (fn) => ({ run: fn });
    actions = [
      { k: 'action', t: 'Browse all topics', x: 'topics index revise list every topic cheat sheet', href: '#/topics' },
      { k: 'action', t: 'Go to the journey map', x: 'home start chapters practice problems boss rounds', href: '#/' },
      { k: 'action', t: 'Review flashcards', x: 'cards spaced repetition due study', href: '#/cards' },
      { k: 'action', t: 'Open the labs', x: 'interactive simulator experiments', href: '#/labs' },
      { k: 'action', t: 'Open the reference library', x: 'links references sources reading', href: '#/library' },
      { k: 'action', t: 'Open the glossary', x: 'terms definitions dictionary', href: '#/glossary' },
      { k: 'action', t: 'Open bookmarks', x: 'saved favourites', href: '#/bookmarks' },
      { k: 'action', t: 'Open my progress', x: 'dashboard xp streak stats export import', href: '#/progress' },
      { k: 'action', t: 'How to use this guide', x: 'about help shortcuts keyboard facilitator', href: '#/about' },
      Object.assign({ k: 'action', t: 'Toggle light and dark theme', x: 'theme dark light appearance' }, run(() => G.shell.toggleTheme())),
      Object.assign({ k: 'action', t: 'Open settings', x: 'preferences text size facilitator name' }, run(() => G.shell.openSettings())),
      Object.assign({ k: 'action', t: 'Toggle facilitator mode', x: 'answers answer key coach' }, run(() => G.store.setSetting('facilitator', !G.store.get().settings.facilitator))),
      Object.assign({ k: 'action', t: 'Export my progress', x: 'download backup json save' }, run(() => G.shell.doExport()))
    ];
    return actions;
  }

  function buildIndex() {
    if (index) return index;
    const src = G.searchIndex || [];
    index = src.map((e) => ({ e: e, k: e.k, t: String(e.t || '').toLowerCase(), x: String(e.x || '').toLowerCase() }));
    return index;
  }

  /* ---------- matching ---------- */
  function subseq(hay, needle) {
    let i = 0;
    for (let j = 0; j < hay.length && i < needle.length; j++) if (hay.charCodeAt(j) === needle.charCodeAt(i)) i++;
    return i === needle.length;
  }
  function oneEdit(a, b) {
    if (Math.abs(a.length - b.length) > 1) return false;
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    if (i === a.length || i === b.length) return true;
    if (a.length === b.length) {
      if (a.slice(i + 1) === b.slice(i + 1)) return true;
      return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
    }
    return a.length > b.length ? a.slice(i + 1) === b.slice(i) : b.slice(i + 1) === a.slice(i);
  }
  function fuzzyWord(title, tok) {
    if (tok.length < 4) return false;
    const words = title.split(/[^a-z0-9]+/);
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (w.length >= 3 && oneEdit(w, tok)) return true;
      if (w.length > tok.length && oneEdit(w.slice(0, tok.length), tok)) return true;
    }
    return false;
  }

  function scoreRec(rec, tokens, joined) {
    let total = 0;
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      let s;
      const ti = rec.t.indexOf(tok);
      if (ti === 0) s = 12;
      else if (ti > 0) s = /[\s\-_/(:]/.test(rec.t.charAt(ti - 1)) ? 9 : 6;
      else if (rec.x.indexOf(tok) >= 0) s = 3;
      else if (tok.length >= 3 && subseq(rec.t, tok) && tok.length >= rec.t.length * 0.4) s = 1.5;
      else if (fuzzyWord(rec.t, tok)) s = 2;
      else return 0;
      total += s;
    }
    if (rec.t === joined) total += 12; else if (rec.t.indexOf(joined) === 0) total += 5;
    total += Math.max(0, 3 - rec.t.length / 40);
    return total * (KIND_WEIGHT[rec.k] || 1);
  }

  function tokensOf(q) { return String(q || '').toLowerCase().split(/[\s,;]+/).filter(Boolean).slice(0, 6); }

  /* Returns [{ e, score }] best first. opts: { kinds: [..], limit } */
  function query(q, opts) {
    opts = opts || {};
    const tokens = tokensOf(q);
    if (!tokens.length) return [];
    const joined = tokens.join(' ');
    const out = [];
    const kinds = opts.kinds && opts.kinds.length ? opts.kinds : null;
    if (!kinds || kinds.indexOf('action') >= 0) {
      actionList().forEach((a) => {
        const s = scoreRec({ k: 'action', t: a.t.toLowerCase(), x: a.x }, tokens, joined);
        if (s > 0) out.push({ e: a, score: s });
      });
    }
    buildIndex().forEach((rec) => {
      if (kinds && kinds.indexOf(rec.k) < 0) return;
      const s = scoreRec(rec, tokens, joined);
      if (s > 0) out.push({ e: rec.e, score: s });
    });
    out.sort((a, b) => b.score - a.score);
    return opts.limit ? out.slice(0, opts.limit) : out;
  }

  /* ---------- presentation ---------- */
  function hrefFor(e) {
    switch (e.k) {
      case 'world': return '#/w/' + e.w;
      case 'level': case 'quiz': case 'topic': return '#/w/' + e.w + '/' + e.l;
      case 'scenario': return '#/w/' + e.w + '/' + e.l + '?s=sec-scenarios';
      case 'section': return '#/w/' + e.w + '/' + e.l + '?s=' + encodeURIComponent(e.s);
      case 'card': return '#/cards/' + e.w;
      case 'ref': return '#/library?w=' + e.w + '&q=' + encodeURIComponent(e.t);
      case 'term': return '#/glossary?w=' + e.w + '&t=' + encodeURIComponent(e.t);
      default: return e.href || '#/';
    }
  }
  function whereOf(e) {
    if (e.k === 'action') return e.x ? '' : '';
    const w = U().worldMeta(e.w);
    if (!w) return '';
    let s = 'Chapter ' + U().worldNo(w.id) + ': ' + (w.short || w.title);
    if (e.k === 'topic') {
      const tf = U().findTopic(e.l);
      if (tf && tf.topic.group) s += ' › ' + tf.topic.group;
    } else if (e.l && e.k !== 'level') {
      const tf = U().findTopic(e.l);
      if (tf) s += ' › ' + tf.topic.title;
      else {
        const lv = G.content.findLevelMeta(e.l);
        if (lv) s += ' › ' + lv.level.title;
      }
    }
    return s;
  }

  function highlight(text, tokens) {
    const frag = document.createDocumentFragment();
    const s = String(text);
    const toks = (tokens || []).filter((t) => t.length > 0).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (!toks.length) { frag.appendChild(document.createTextNode(s)); return frag; }
    const re = new RegExp('(' + toks.join('|') + ')', 'ig');
    let last = 0, m;
    while ((m = re.exec(s))) {
      if (m.index > last) frag.appendChild(document.createTextNode(s.slice(last, m.index)));
      frag.appendChild(el('mark', null, m[0]));
      last = m.index + m[0].length;
      if (m[0].length === 0) re.lastIndex++;
    }
    if (last < s.length) frag.appendChild(document.createTextNode(s.slice(last)));
    return frag;
  }

  function kindIcon(k, e) {
    if (k === 'world' && e && e.w) return U().worldIcon(e.w, 18);
    return U().icon(KIND_ICON[k] || 'search', 18);
  }

  function go(entry) {
    if (entry.run) { entry.run(); return; }
    location.hash = hrefFor(entry);
  }

  /* ================================================================
     Command palette
     ================================================================ */
  let dlg = null, input = null, listEl = null, items = [], active = -1, lastQuery = '';
  const optId = (i) => 'palette-opt-' + i;

  /* Recently opened items that are not finished: topics and practice problems, newest first. */
  function recentLevels() {
    const st = G.store.get();
    const out = [];
    Object.keys(st.levels).forEach((id) => {
      if (st.levels[id].status === 'done') return;
      const f = G.content.findLevelMeta(id);
      if (f) out.push({ at: st.levels[id].lastSeen, e: { k: 'level', w: f.world.id, l: f.level.id, t: f.level.title, x: '' } });
    });
    Object.keys(st.topics || {}).forEach((id) => {
      if (st.topics[id].status === 'reviewed') return;
      const f = U().findTopic(id);
      if (f) out.push({ at: st.topics[id].lastSeen, e: { k: 'topic', w: f.world.id, l: f.topic.id, t: f.topic.title, x: '' } });
    });
    return out.sort((a, b) => b.at - a.at).slice(0, 5).map((x) => x.e);
  }

  function groupsFor(q) {
    const tokens = tokensOf(q);
    if (!tokens.length) {
      const g = [];
      const rec = recentLevels();
      if (rec.length) g.push({ k: 'recent', label: 'Jump back in', entries: rec });
      g.push({ k: 'action', label: 'Go to', entries: actionList().slice(0, 8) });
      return { groups: g, total: 0, tokens: tokens };
    }
    const res = query(q);
    const by = {};
    res.forEach((r) => { (by[r.e.k] = by[r.e.k] || []).push(r.e); });
    const groups = [];
    KIND_ORDER.forEach((k) => {
      if (by[k]) groups.push({ k: k, label: KIND_LABEL[k], entries: by[k].slice(0, k === 'action' ? 3 : 4), more: by[k].length - Math.min(by[k].length, k === 'action' ? 3 : 4) });
    });
    return { groups: groups, total: res.length, tokens: tokens };
  }

  function renderPalette(q) {
    lastQuery = q;
    const data = groupsFor(q);
    G.clear(listEl);
    items = [];
    if (!data.groups.length) {
      listEl.appendChild(el('div', { class: 'palette__empty' }, U().icon('search', 28), el('p', null, el('strong', null, 'No matches for "' + q + '"')), el('p', { class: 't-muted t-sm' }, 'Try fewer words, or search for a topic such as chunking, MCP or caching.')));
      input.setAttribute('aria-activedescendant', '');
      active = -1;
      return;
    }
    data.groups.forEach((g, gi) => {
      const gid = 'palette-grp-' + gi;
      const grp = el('div', { class: 'palette__group', role: 'group', 'aria-labelledby': gid }, el('div', { class: 'palette__label', id: gid }, g.label));
      g.entries.forEach((e) => {
        const idx = items.length;
        const where = whereOf(e);
        const row = el('div', { class: 'palette__opt', role: 'option', id: optId(idx), 'aria-selected': 'false', 'data-i': idx },
          el('span', { class: 'palette__ic', 'data-world': e.w || null }, kindIcon(e.k, e)),
          el('span', { class: 'palette__txt' },
            el('span', { class: 'palette__t' }, highlight(e.t, data.tokens)),
            where ? el('span', { class: 'palette__w' }, where) : null),
          el('span', { class: 'palette__k' }, (KIND_LABEL[e.k] || '').replace(/s$/, '')));
        row.addEventListener('mousemove', () => setActive(idx, false));
        row.addEventListener('click', () => { const ent = items[idx]; close(); go(ent); });
        items.push(e);
        grp.appendChild(row);
      });
      if (g.more > 0) grp.appendChild(el('div', { class: 'palette__more' }, '+' + g.more + ' more ' + g.label.toLowerCase()));
      listEl.appendChild(grp);
    });
    if (data.total) {
      const idx = items.length;
      const all = { k: 'action', t: 'See all ' + data.total + ' results', href: '#/search?q=' + encodeURIComponent(q) };
      const row = el('div', { class: 'palette__opt palette__opt--all', role: 'option', id: optId(idx), 'aria-selected': 'false', 'data-i': idx },
        el('span', { class: 'palette__ic' }, U().icon('arrow-right', 18)),
        el('span', { class: 'palette__txt' }, el('span', { class: 'palette__t' }, all.t, ' for "' + q + '"')),
        el('span', { class: 'palette__k' }, 'Enter'));
      row.addEventListener('mousemove', () => setActive(idx, false));
      row.addEventListener('click', () => { close(); go(all); });
      items.push(all);
      listEl.appendChild(el('div', { class: 'palette__group' }, row));
    }
    setActive(0, true);
  }

  function setActive(i, scroll) {
    if (!items.length) { active = -1; return; }
    active = (i + items.length) % items.length;
    Array.prototype.forEach.call(listEl.querySelectorAll('[role="option"]'), (n) => n.setAttribute('aria-selected', Number(n.dataset.i) === active ? 'true' : 'false'));
    input.setAttribute('aria-activedescendant', optId(active));
    if (scroll !== false) {
      const n = document.getElementById(optId(active));
      if (n) {
        const lr = listEl.getBoundingClientRect(), nr = n.getBoundingClientRect();
        if (nr.top < lr.top + 28) listEl.scrollTop -= (lr.top + 28 - nr.top);
        else if (nr.bottom > lr.bottom) listEl.scrollTop += nr.bottom - lr.bottom;
      }
    }
  }

  function buildPalette() {
    input = el('input', {
      class: 'palette__input', type: 'text', id: 'palette-input', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'palette-list', 'aria-autocomplete': 'list',
      'aria-label': 'Search the guide', placeholder: 'Search topics, scenarios, terms and commands', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'go'
    });
    listEl = el('div', { class: 'palette__list', id: 'palette-list', role: 'listbox', 'aria-label': 'Search results' });
    dlg = el('dialog', { class: 'palette', 'aria-label': 'Search the guide' },
      el('div', { class: 'palette__bar' }, U().icon('search', 20), input, el('button', { class: 'palette__esc', type: 'button', 'aria-label': 'Close search', on: { click: () => close() } }, 'Esc')),
      listEl,
      el('div', { class: 'palette__foot', 'aria-hidden': 'true' },
        el('span', null, el('kbd', { class: 'ui-kbd' }, '↑'), el('kbd', { class: 'ui-kbd' }, '↓'), ' move'),
        el('span', null, el('kbd', { class: 'ui-kbd' }, 'Enter'), ' open'),
        el('span', null, el('kbd', { class: 'ui-kbd' }, 'Esc'), ' close')));
    input.addEventListener('input', G.debounce(() => renderPalette(input.value), 60));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        if (lastQuery !== input.value) renderPalette(input.value);
        const ent = items[active];
        if (ent) { close(); go(ent); }
      }
    });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
    dlg.addEventListener('close', () => { dlg.remove(); });
    return dlg;
  }

  function open(prefill) {
    if (dlg && dlg.open) { input.focus(); input.select(); return; }
    buildPalette();
    (document.getElementById('dialog-root') || document.body).appendChild(dlg);
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    input.value = prefill || '';
    renderPalette(input.value);
    input.focus();
    if (prefill) input.select();
  }
  function close() { if (dlg && dlg.open) { try { dlg.close(); } catch (e) { dlg.removeAttribute('open'); dlg.remove(); } } }

  /* ================================================================
     Results view
     ================================================================ */
  G.views.search = function (route) {
    const root = el('div', { class: 'view view--narrow search-view' });
    let q = route.query.q || '';
    let kind = route.query.k || '';
    let shown = 30;
    const form = el('form', { class: 'search-form', role: 'search', 'aria-label': 'Search the guide' });
    const field = el('input', { class: 'ui-input search-form__input', type: 'search', name: 'q', 'aria-label': 'Search the guide', placeholder: 'Search topics, scenarios, terms and references', autocomplete: 'off', value: q });
    form.appendChild(U().icon('search', 20, 'search-form__ic'));
    form.appendChild(field);
    form.appendChild(el('button', { class: 'ui-btn ui-btn--primary', type: 'submit' }, 'Search'));
    const summary = el('p', { class: 'search-summary t-muted', role: 'status', 'aria-live': 'polite' });
    const chips = el('div', { class: 'cluster search-chips', role: 'group', 'aria-label': 'Filter by type' });
    const list = el('ol', { class: 'sr-list', role: 'list' });
    const more = el('div', { class: 'search-more' });

    root.appendChild(el('header', { class: 'view-head' }, el('p', { class: 'eyebrow' }, 'Search'), el('h1', null, 'Search the guide')));
    root.appendChild(form);
    root.appendChild(summary);
    root.appendChild(chips);
    root.appendChild(list);
    root.appendChild(more);

    function paint() {
      const tokens = tokensOf(q);
      G.clear(list); G.clear(chips); G.clear(more);
      if (!tokens.length) {
        summary.textContent = '';
        list.appendChild(el('li', null, U().emptyState({ icon: 'search', title: 'What are you looking for?', text: 'Type a topic such as chunking, MCP or prompt caching. Press / anywhere to open quick search.' })));
        return;
      }
      const all = query(q);
      const counts = {};
      all.forEach((r) => { counts[r.e.k] = (counts[r.e.k] || 0) + 1; });
      const res = kind ? all.filter((r) => r.e.k === kind) : all;
      summary.textContent = res.length + (res.length === 1 ? ' result' : ' results') + ' for "' + q + '"';
      if (all.length) {
        const mk = (k, label, n) => {
          const b = el('button', { class: 'ui-toggle', type: 'button', 'aria-pressed': String(kind === k) }, label, el('span', { class: 'count' }, String(n)));
          b.addEventListener('click', () => { kind = k; shown = 30; G.router.replaceQuery({ k: k }); paint(); });
          return b;
        };
        chips.appendChild(mk('', 'All', all.length));
        KIND_ORDER.forEach((k) => { if (counts[k]) chips.appendChild(mk(k, KIND_LABEL[k], counts[k])); });
      }
      if (!res.length) {
        list.appendChild(el('li', null, U().emptyState({ icon: 'search', title: 'No results', text: 'Try fewer or different words. Matching is tolerant of small typos.' })));
        return;
      }
      res.slice(0, shown).forEach((r) => {
        const e = r.e;
        const where = whereOf(e);
        const a = el('a', { class: 'sr', href: hrefFor(e), 'data-world': e.w || null },
          el('span', { class: 'sr__ic' }, kindIcon(e.k, e)),
          el('span', { class: 'sr__body' },
            el('span', { class: 'sr__title' }, highlight(e.t, tokens)),
            where ? el('span', { class: 'sr__where' }, where) : null,
            e.x && e.k !== 'action' ? el('span', { class: 'sr__snip' }, highlight(e.x, tokens)) : null),
          U().chip((KIND_LABEL[e.k] || e.k).replace(/s$/, ''), null));
        if (e.run) a.addEventListener('click', (ev) => { ev.preventDefault(); e.run(); });
        list.appendChild(el('li', { class: 'sr-li' }, a));
      });
      if (res.length > shown) {
        more.appendChild(U().btn({ text: 'Show ' + Math.min(30, res.length - shown) + ' more', onClick: () => { shown += 30; paint(); } }));
      }
    }

    form.addEventListener('submit', (e) => { e.preventDefault(); q = field.value.trim(); shown = 30; G.router.replaceQuery({ q: q }); paint(); });
    field.addEventListener('input', G.debounce(() => { q = field.value.trim(); shown = 30; G.router.replaceQuery({ q: q }); paint(); }, 160));
    paint();
    return {
      el: root,
      title: q ? 'Search: ' + q : 'Search',
      world: 'home',
      crumbs: [{ label: 'Journey', href: '#/' }, { label: 'Search' }],
      onQuery: (nq) => { q = nq.q || ''; kind = nq.k || ''; field.value = q; paint(); },
      afterMount: () => { if (!q) field.focus(); }
    };
  };

  G.search = { init: buildIndex, open: open, close: close, query: query, highlight: highlight, tokens: tokensOf, hrefFor: hrefFor, whereOf: whereOf };
})();
