/* Follow the Question: reference library, glossary, bookmarks and the About view. Owner: E1.
   Registers Guide.views.library, glossary, bookmarks and about. */
(function () {
  'use strict';

  const G = window.Guide;
  const el = G.el;
  const U = () => G.ui;
  G.views = G.views || {};

  function viewHead(eyebrow, title, text, extra) {
    return el('header', { class: 'view-head' },
      el('p', { class: 'eyebrow' }, eyebrow),
      el('h1', null, title),
      text ? el('p', { class: 'lead view-head__lead' }, text) : null,
      extra || null);
  }
  function setOf(str) { return new Set(String(str || '').split(',').filter(Boolean)); }
  function listOf(set) { return Array.from(set).join(','); }

  /* ================================================================
     Library
     ================================================================ */
  function ensureRefs() {
    if (G.refsAll) return Promise.resolve();
    return G.loadScript('content/refs-all.js').then(() => { if (!G.refsAll) throw new Error('The reference list is missing from this build.'); });
  }

  G.views.library = function (route) {
    return ensureRefs().then(() => {
      const refs = G.refsAll.slice();
      const worlds = U().worlds().filter((w) => refs.some((r) => r.w === w.id));
      const order = {};
      worlds.forEach((w, i) => { order[w.id] = i; });
      const state = { w: setOf(route.query.w), type: setOf(route.query.type), status: setOf(route.query.status), q: route.query.q || '' };
      const typeKeys = Object.keys(U().REF_TYPES).filter((t) => refs.some((r) => r.type === t));
      const statusKeys = ['ga', 'preview', 'deprecated', 'n/a'].filter((s) => refs.some((r) => r.status === s));

      const root = el('div', { class: 'view library' });
      const countEl = el('p', { class: 'lib-count', role: 'status', 'aria-live': 'polite' });
      const results = el('div', { class: 'lib-results' });
      let filtered = [];

      const qInput = el('input', { class: 'ui-input', type: 'search', id: 'lib-q', placeholder: 'Filter by title, publisher or note', value: state.q, autocomplete: 'off' });
      const copyBtn = U().btn({ text: 'Copy as Markdown', icon: 'copy', kind: 'sm', onClick: copyMd });
      const clearBtn = U().btn({ text: 'Clear filters', icon: 'refresh', kind: 'ghost sm', onClick: () => { state.w.clear(); state.type.clear(); state.status.clear(); state.q = ''; qInput.value = ''; sync(); } });

      function chipGroup(label, keys, set, labelFor, countFor, dotFor) {
        const wrap = el('div', { class: 'lib-group', role: 'group', 'aria-label': label });
        keys.forEach((k) => {
          const b = el('button', { class: 'ui-toggle', type: 'button', 'aria-pressed': String(set.has(k)), 'data-world': dotFor ? k : null },
            dotFor ? el('span', { class: 'ui-dot' }) : null, labelFor(k), el('span', { class: 'count' }, String(countFor(k))));
          b.addEventListener('click', () => { if (set.has(k)) set.delete(k); else set.add(k); sync(); });
          b.dataset.key = k;
          wrap.appendChild(b);
        });
        return wrap;
      }
      const typeGroup = chipGroup('Type', typeKeys, state.type, (k) => U().REF_TYPES[k].label, (k) => refs.filter((r) => r.type === k).length);
      const statusGroup = chipGroup('Status', statusKeys, state.status, (k) => U().REF_STATUS[k].label, (k) => refs.filter((r) => r.status === k).length);
      const worldGroup = chipGroup('Chapter', worlds.map((w) => w.id), state.w, (k) => 'Ch ' + U().worldNo(k) + ' ' + (U().worldMeta(k).short || ''), (k) => refs.filter((r) => r.w === k).length, true);
      const worldDetails = el('details', { class: 'lib-worlds' }, el('summary', null, 'Chapters', el('span', { class: 'lib-worlds__n' })), worldGroup);
      if (state.w.size) worldDetails.open = true;

      root.appendChild(viewHead('Reference library', 'Every source in one place',
        refs.length + ' references from ' + worlds.length + (worlds.length === 1 ? ' chapter' : ' chapters') + '. Each link was checked on the date shown. Filter by chapter, type and status, then copy the list into your notes.'));
      root.appendChild(el('section', { class: 'lib-bar ui-card ui-card--pad', 'aria-label': 'Filters' },
        el('div', { class: 'ui-field' }, el('label', { class: 'ui-label', for: 'lib-q' }, 'Filter references'), qInput),
        el('div', { class: 'lib-filters' },
          el('div', null, el('span', { class: 'ui-label' }, 'Type'), typeGroup),
          el('div', null, el('span', { class: 'ui-label' }, 'Status'), statusGroup)),
        worldDetails,
        el('div', { class: 'cluster lib-actions' }, countEl, el('span', { class: 'spacer' }), clearBtn, copyBtn)));
      root.appendChild(results);

      function apply() {
        const q = state.q.trim().toLowerCase();
        filtered = refs.filter((r) =>
          (!state.w.size || state.w.has(r.w)) && (!state.type.size || state.type.has(r.type)) && (!state.status.size || state.status.has(r.status)) &&
          (!q || (r.title + ' ' + (r.publisher || '') + ' ' + (r.note || '')).toLowerCase().indexOf(q) >= 0));
      }

      function paint() {
        G.clear(results);
        const by = {};
        filtered.forEach((r) => { (by[r.w] = by[r.w] || []).push(r); });
        const ids = Object.keys(by).sort((a, b) => order[a] - order[b]);
        countEl.textContent = filtered.length + ' of ' + refs.length + ' references';
        if (!filtered.length) {
          results.appendChild(U().emptyState({ icon: 'search', title: 'No references match', text: 'Remove a filter or shorten the text to see more.', actions: [U().btn({ text: 'Clear filters', kind: 'primary', onClick: () => clearBtn.click() })] }));
          return;
        }
        ids.forEach((id) => {
          const w = U().worldMeta(id);
          const list = el('ul', { class: 'ref-list', role: 'list' });
          by[id].forEach((r) => list.appendChild(U().refItem(r)));
          results.appendChild(el('section', { class: 'lib-world', 'data-world': id, 'aria-labelledby': 'lib-w-' + id },
            el('h2', { class: 'lib-world__h', id: 'lib-w-' + id }, el('span', { class: 'ui-dot' }), 'Chapter ' + U().worldNo(id) + ': ' + (w ? w.title : id), el('span', { class: 'lib-world__n' }, String(by[id].length))),
            list));
        });
      }

      function sync() {
        apply();
        Array.prototype.forEach.call(root.querySelectorAll('.lib-group .ui-toggle'), (b) => {
          const grp = b.parentNode.getAttribute('aria-label');
          const set = grp === 'Type' ? state.type : grp === 'Status' ? state.status : state.w;
          b.setAttribute('aria-pressed', String(set.has(b.dataset.key)));
        });
        const nW = state.w.size;
        worldDetails.querySelector('.lib-worlds__n').textContent = nW ? ' (' + nW + ' selected)' : ' (all)';
        clearBtn.hidden = !(state.w.size || state.type.size || state.status.size || state.q);
        paint();
        G.router.replaceQuery({ w: listOf(state.w), type: listOf(state.type), status: listOf(state.status), q: state.q });
      }

      function copyMd() {
        const by = {};
        filtered.forEach((r) => { (by[r.w] = by[r.w] || []).push(r); });
        const lines = [];
        Object.keys(by).sort((a, b) => order[a] - order[b]).forEach((id) => {
          const w = U().worldMeta(id);
          lines.push('## Chapter ' + U().worldNo(id) + ': ' + (w ? w.title : id), '');
          by[id].forEach((r) => {
            const st = (U().REF_STATUS[r.status] || {}).label || r.status;
            lines.push('- [' + String(r.title).replace(/([\[\]])/g, '\\$1') + '](' + r.url + ') (' + [r.publisher, r.type, st, r.verified ? 'checked ' + r.verified : ''].filter(Boolean).join(', ') + ').' + (r.note ? ' ' + r.note : ''));
          });
          lines.push('');
        });
        U().copy(lines.join('\n').trim() + '\n').then((ok) => {
          G.shell.toast(ok ? filtered.length + ' references copied as Markdown.' : 'Copy was blocked by the browser. Select the list and copy it by hand.', { kind: ok ? 'ok' : 'warn', icon: ok ? 'copy' : 'warn' });
        });
      }

      qInput.addEventListener('input', G.debounce(() => { state.q = qInput.value; sync(); }, 150));
      apply();
      paint();
      clearBtn.hidden = !(state.w.size || state.type.size || state.status.size || state.q);
      worldDetails.querySelector('.lib-worlds__n').textContent = state.w.size ? ' (' + state.w.size + ' selected)' : ' (all)';
      return {
        el: root, title: 'Reference library', world: 'home',
        crumbs: [{ label: 'Journey', href: '#/' }, { label: 'Reference library' }],
        onQuery: (q) => {
          state.w = setOf(q.w); state.type = setOf(q.type); state.status = setOf(q.status); state.q = q.q || ''; qInput.value = state.q;
          if (state.w.size) worldDetails.open = true;
          apply(); sync();
        }
      };
    });
  };

  /* ================================================================
     Glossary
     ================================================================ */
  G.views.glossary = function (route) {
    const worlds = U().worlds();
    return Promise.all(worlds.map((w) => G.content.load(w.id))).then((loaded) => {
      const entries = [];
      loaded.forEach((w) => (w.glossary || []).forEach((g) => entries.push({ term: g.term, def: g.def, w: w.id })));
      entries.sort((a, b) => a.term.toLowerCase().localeCompare(b.term.toLowerCase()) || a.w.localeCompare(b.w));
      const letterOf = (t) => { const c = t.trim().charAt(0).toUpperCase(); return /[A-Z]/.test(c) ? c : '#'; };
      const letters = ['#'].concat('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''));
      const withTerms = {};
      entries.forEach((e) => { withTerms[letterOf(e.term)] = true; });

      const state = { q: '', w: route.query.w || '' };
      const root = el('div', { class: 'view view--narrow glossary' });
      const qInput = el('input', { class: 'ui-input', type: 'search', id: 'gl-q', placeholder: 'Filter terms and definitions', autocomplete: 'off' });
      const wSel = el('select', { class: 'ui-select', id: 'gl-w' }, el('option', { value: '' }, 'All chapters'));
      worlds.filter((w) => entries.some((e) => e.w === w.id)).forEach((w) => wSel.appendChild(el('option', { value: w.id }, 'Chapter ' + U().worldNo(w.id) + ': ' + (w.short || w.title))));
      wSel.value = state.w;
      const countEl = el('p', { class: 'lib-count', role: 'status', 'aria-live': 'polite' });
      const jump = el('nav', { class: 'az', 'aria-label': 'Jump to letter' });
      const body = el('div', { class: 'gl-body' });

      root.appendChild(viewHead('Glossary', 'Terms used across the guide', entries.length + ' terms from ' + loaded.length + (loaded.length === 1 ? ' chapter' : ' chapters') + '. The same term can be defined in more than one chapter, so each definition names its world.'));
      root.appendChild(el('div', { class: 'gl-tools ui-card ui-card--pad' },
        el('div', { class: 'gl-fields' },
          el('div', { class: 'ui-field' }, el('label', { class: 'ui-label', for: 'gl-q' }, 'Filter'), qInput),
          el('div', { class: 'ui-field' }, el('label', { class: 'ui-label', for: 'gl-w' }, 'Chapter'), wSel)),
        jump, countEl));
      root.appendChild(body);

      function paint() {
        const q = state.q.trim().toLowerCase();
        const list = entries.filter((e) => (!state.w || e.w === state.w) && (!q || (e.term + ' ' + U().plainText(e.def)).toLowerCase().indexOf(q) >= 0));
        const present = {};
        list.forEach((e) => { present[letterOf(e.term)] = true; });
        G.clear(jump);
        letters.forEach((l) => {
          if (!withTerms[l]) return;
          if (present[l]) jump.appendChild(el('a', { class: 'az__l', href: '#letter-' + (l === '#' ? 'num' : l.toLowerCase()), 'aria-label': 'Jump to ' + (l === '#' ? 'numbers and symbols' : l) }, l));
          else jump.appendChild(el('span', { class: 'az__l is-off', 'aria-hidden': 'true' }, l));
        });
        countEl.textContent = list.length + ' of ' + entries.length + ' terms';
        G.clear(body);
        if (!list.length) { body.appendChild(U().emptyState({ icon: 'search', title: 'No terms match', text: 'Try a shorter filter or pick all chapters.' })); return; }
        let cur = '', dl = null;
        list.forEach((e, i) => {
          const l = letterOf(e.term);
          if (l !== cur) {
            cur = l;
            const sec = el('section', { class: 'gl-letter', 'aria-labelledby': 'letter-' + (l === '#' ? 'num' : l.toLowerCase()) },
              el('h2', { class: 'gl-letter__h', id: 'letter-' + (l === '#' ? 'num' : l.toLowerCase()) }, l));
            dl = el('dl', { class: 'gl-list' });
            sec.appendChild(dl);
            body.appendChild(sec);
          }
          const w = U().worldMeta(e.w);
          const dd = el('dd', { class: 'gl-def' });
          dd.innerHTML = U().mdInline(e.def, {});
          dl.appendChild(el('div', { class: 'gl-entry', id: 'term-' + G.slug(e.term) + '-' + e.w, 'data-term': e.term.toLowerCase(), 'data-world': e.w },
            el('dt', { class: 'gl-term' }, e.term, el('a', { class: 'gl-world', href: '#/w/' + e.w, title: w ? w.title : e.w }, el('span', { class: 'ui-dot' }), 'Chapter ' + U().worldNo(e.w))),
            dd));
        });
      }

      qInput.addEventListener('input', G.debounce(() => { state.q = qInput.value; paint(); }, 120));
      wSel.addEventListener('change', () => { state.w = wSel.value; G.router.replaceQuery({ w: state.w }); paint(); });
      paint();

      function focusTerm(t) {
        if (!t) return;
        const key = String(t).toLowerCase();
        const node = Array.prototype.filter.call(body.querySelectorAll('.gl-entry'), (n) => n.dataset.term === key)[0];
        if (node) G.router.scrollToSection(node.id, { focus: true });
      }
      return {
        el: root, title: 'Glossary', world: 'home',
        crumbs: [{ label: 'Journey', href: '#/' }, { label: 'Glossary' }],
        afterMount: () => focusTerm(route.query.t),
        onQuery: (q) => { state.w = q.w || ''; wSel.value = state.w; paint(); focusTerm(q.t); }
      };
    });
  };

  /* ================================================================
     Bookmarks
     ================================================================ */
  function findHeading(blocks, id) {
    let hit = null;
    (function walk(list) {
      (list || []).forEach((b) => {
        if (hit) return;
        if (b.t === 'h' && b.id === id) hit = b;
        if (b.t === 'tabs') b.tabs.forEach((t) => walk(t.blocks));
        if (b.t === 'accordion') b.items.forEach((i) => walk(i.blocks));
      });
    })(blocks);
    return hit;
  }

  G.views.bookmarks = function () {
    const root = el('div', { class: 'view view--narrow bookmarks' });
    const host = el('div', { tabindex: '-1', class: 'bm-host' });
    root.appendChild(viewHead('Bookmarks', 'Saved topics, practice problems and sections', 'Use the Bookmark button on any topic or practice problem to save it here.'));
    root.appendChild(host);

    function parse(id) {
      const [levelId, sec] = String(id).split('#');
      const tf = U().findTopic(levelId);
      const f = tf ? { world: tf.world, level: tf.topic } : G.content.findLevelMeta(levelId);
      return { id: id, levelId: levelId, sec: sec || null, found: f, isTopic: !!tf };
    }

    let titles = null;
    function paint() {
      const headings = titles;
      G.clear(host);
      const items = G.store.get().bookmarks.map(parse);
      if (!items.length) {
        host.appendChild(U().emptyState({
          icon: 'bookmark', title: 'No bookmarks yet', text: 'Open any topic and choose Bookmark to keep it close. Bookmarks stay in this browser and travel with your exported progress.',
          actions: [U().btn({ text: 'Browse all topics', icon: 'layers', kind: 'primary', href: '#/topics' })]
        }));
        return;
      }
      const topicItems = items.filter((i) => !i.sec && i.isTopic), levels = items.filter((i) => !i.sec && !i.isTopic), sections = items.filter((i) => i.sec);
      const group = (title, list) => {
        if (!list.length) return null;
        const ul = el('ul', { class: 'bm-list', role: 'list' });
        list.forEach((i) => {
          const f = i.found;
          const heading = i.sec && headings && headings[i.id];
          const label = f ? (i.sec ? (heading || i.sec.replace(/^sec-/, '').replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase())) : f.level.title) : i.id;
          const where = f ? 'Chapter ' + U().worldNo(f.world.id) + ': ' + (f.world.short || f.world.title) + (i.sec ? ' › ' + f.level.title : '') : 'No longer in this build';
          const href = f ? (i.isTopic ? U().topicHref(f.world.id, f.level.id, i.sec) : U().levelHref(f.world.id, f.level.id, i.sec)) : null;
          const a = el('a', { class: 'bm__link', href: href, 'data-world': f ? f.world.id : null },
            el('span', { class: 'ui-dot' }),
            el('span', { class: 'bm__txt' }, el('strong', null, label), el('span', { class: 'bm__where' }, where)));
          const rm = el('button', { class: 'ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm', type: 'button', 'aria-label': 'Remove bookmark: ' + label, title: 'Remove bookmark', on: { click: () => { G.store.toggleBookmark(i.id); paint(); host.focus(); G.shell.toast('Bookmark removed.', { icon: 'bookmark' }); } } }, U().icon('bookmark-fill', 18));
          ul.appendChild(el('li', { class: 'bm ui-card' + (f ? '' : ' is-stale'), 'data-world': f ? f.world.id : null },
            f ? a : el('div', { class: 'bm__link' }, el('span', { class: 'bm__txt' }, el('strong', null, label), el('span', { class: 'bm__where' }, where))),
            f && !i.sec ? (i.isTopic ? U().topicStatusChip(G.store.topicStatus(i.levelId)) : U().levelStatusChip(G.store.levelStatus(i.levelId))) : null, rm));
        });
        return el('section', { class: 'bm-group' }, el('h2', { class: 'bm-group__h' }, title, el('span', { class: 'lib-world__n' }, String(list.length))), ul);
      };
      [group('Topics', topicItems), group('Practice problems', levels), group('Sections', sections)].forEach((g) => { if (g) host.appendChild(g); });
    }

    paint();
    // resolve section titles in the background
    const need = Array.from(new Set(G.store.get().bookmarks.filter((b) => b.indexOf('#') > 0).map((b) => (G.content.findLevelMeta(b.split('#')[0]) || {}).world).filter(Boolean).map((w) => w.id)));
    if (need.length) {
      Promise.all(need.map((id) => G.content.load(id))).then((ws) => {
        const map = {};
        G.store.get().bookmarks.filter((b) => b.indexOf('#') > 0).forEach((b) => {
          const [lid, sid] = b.split('#');
          ws.forEach((w) => (w.levels || []).forEach((l) => { if (l.id === lid) { const h = findHeading(l.blocks, sid); if (h) map[b] = h.text; } }));
        });
        titles = map;
        paint();
      }).catch(() => { /* titles stay as ids */ });
    }
    const onStore = (e) => { if (e.path === 'bookmarks' || e.path === '*' || /status$/.test(e.path || '')) paint(); };
    G.store.on(onStore);
    return { el: root, title: 'Bookmarks', world: 'home', crumbs: [{ label: 'Journey', href: '#/' }, { label: 'Bookmarks' }], destroy: () => G.store.off(onStore) };
  };

  /* ================================================================
     About
     ================================================================ */
  const LOOP = [
    ['flag', 'Brief', 'Read a problem whose constraints are left open on purpose.'],
    ['layers', 'Options board', 'Compare every sensible option, including the boring one, with pros, cons, when it wins and when to avoid it.'],
    ['flip', 'Flip the dials', 'Change scale, permissions, latency, risk or cost and watch the ranking and the reasons change.'],
    ['warn', 'Failure modes', 'Study the symptom, the root cause and the fix for what usually goes wrong.'],
    ['target', 'Quiz', 'Answer single choice, multi select, ordering, matching, numeric and bug-spotting items.'],
    ['shield', 'Defend it', 'Write an interview-style answer, reveal the model answer and score yourself against a rubric.'],
    ['cards', 'Flashcards', 'Review spaced-repetition cards that build up across chapters.'],
    ['book', 'References', 'Follow dated links to specs, vendor docs, papers and courses.']
  ];
  const METHOD = [
    ['Clarify the dials', 'Ask about corpus, update rate, permission model, tenancy, latency, risk and cost before you choose anything.'],
    ['List the options', 'Name every sensible option, including the boring one.'],
    ['Pick for the stated dials', 'Choose, then say what would flip the choice.'],
    ['Name failure modes', 'Say how each one would show up and how you would detect it.'],
    ['Name metrics and rollout', 'State what you will measure and how you would roll it out safely.']
  ];
  /* Each row: alternatives (arrays of keys pressed together), then what they do. */
  const KEYS = [
    [[['/'], ['Ctrl', 'K'], ['Cmd', 'K']], 'Open quick search'],
    [[['Esc']], 'Close search, a dialog or the navigation drawer'],
    [[['[']], 'Show or hide the sidebar'],
    [[['↑'], ['↓']], 'Sidebar: move through the chapters and topics, also from the filter box'],
    [[['t']], 'Switch between light and dark theme'],
    [[['?']], 'Open this page at the shortcuts'],
    [[['1-5']], 'Quiz: choose an option. Enter checks the answer'],
    [[['Space']], 'Flashcards: flip the card. Keys 1 to 4 grade it'],
    [[['←'], ['→']], 'Tabs: move between variants']
  ];

  G.views.about = function (route) {
    const meta = G.manifest;
    const root = el('div', { class: 'view view--narrow about' });
    const sec = (id, title, ...kids) => el('section', { class: 'about-sec', id: id, 'aria-labelledby': id + '-h' }, el('h2', { id: id + '-h' }, title), ...kids);

    root.appendChild(viewHead('How to use this guide', 'Revise by topic, or follow the question through the system',
      'Every topic stands on its own: what it is, where and when to use it, how it compares and scenario questions with trade-offs. Practice problems and boss rounds are an optional journey that applies the topics.'));
    const tocSlot = el('div', { class: 'toc-slot' });
    root.appendChild(tocSlot);

    const TOPIC_PARTS = [
      ['sparkles', 'At a glance', 'What it is in one or two sentences, one line on when to use it and one on when to avoid it.'],
      ['layers', 'How it works', 'A short explanation with a diagram, table or formula where the topic has structure.'],
      ['map', 'Where to use it', 'Concrete places and contexts where the idea earns its keep.'],
      ['check', 'When to use it', 'Use it when, avoid it when, and the dial change that flips the choice.'],
      ['grid', 'Compared with alternatives', 'A table of neighbouring options, including when each one loses.'],
      ['warn', 'Pitfalls', 'Symptom, cause and fix for what usually goes wrong.'],
      ['target', 'Scenarios', 'Short situations. Pick an option, then see every option rated with its trade-off.'],
      ['cards', 'Check yourself', 'Quick quiz items and flashcards. Mark the topic as reviewed when you are done.']
    ];
    const parts = el('ol', { class: 'loop', role: 'list' });
    TOPIC_PARTS.forEach((s, i) => parts.appendChild(el('li', { class: 'loop__step' },
      el('span', { class: 'loop__ic' }, U().icon(s[0], 22), el('span', { class: 'loop__n' }, String(i + 1))),
      el('div', null, el('strong', null, s[1]), el('p', null, s[2])))));
    root.appendChild(sec('topics', 'How a topic page works', el('p', null, 'Open any topic from the left menu. The menu has two views: Topics lists every topic by chapter and group with a filter box, and Journey lists the practice problems and boss rounds. Use All topics for one page with every topic, and the cheat sheet of a chapter for a printable summary.'), parts));

    const steps = el('ol', { class: 'loop', role: 'list' });
    LOOP.forEach((s, i) => steps.appendChild(el('li', { class: 'loop__step' },
      el('span', { class: 'loop__ic' }, U().icon(s[0], 22), el('span', { class: 'loop__n' }, String(i + 1))),
      el('div', null, el('strong', null, s[1]), el('p', null, s[2])))));
    root.appendChild(sec('how', 'How a practice problem works', steps));

    const m = el('ol', { class: 'method', role: 'list' });
    METHOD.forEach((s) => m.appendChild(el('li', null, el('strong', null, s[0]), el('span', null, s[1]))));
    root.appendChild(sec('method', 'The Dial-and-Defend method', el('p', null, 'This is the answer shape for every defend task and for a real design review. Chapter 0 teaches it in full.'), m));

    const tb = el('tbody');
    KEYS.forEach((k) => {
      const kc = el('td', { class: 'keys__k' });
      k[0].forEach((alt, ai) => {
        if (ai) kc.appendChild(document.createTextNode(' or '));
        alt.forEach((x, i) => { if (i) kc.appendChild(document.createTextNode(' + ')); kc.appendChild(el('kbd', { class: 'ui-kbd' }, x)); });
      });
      tb.appendChild(el('tr', null, kc, el('td', null, k[1])));
    });
    root.appendChild(sec('keys', 'Keyboard shortcuts', el('div', { class: 'table-wrap' }, el('table', { class: 'keys' }, el('thead', null, el('tr', null, el('th', { scope: 'col' }, 'Keys'), el('th', { scope: 'col' }, 'What they do'))), tb))));

    const facInput = el('input', { type: 'checkbox', role: 'switch' });
    facInput.checked = !!G.store.get().settings.facilitator;
    facInput.addEventListener('change', () => G.store.setSetting('facilitator', facInput.checked));
    const onStore = (e) => { if (!e.path || /facilitator|^\*/.test(e.path)) facInput.checked = !!G.store.get().settings.facilitator; };
    G.store.on(onStore);
    const run = el('ol', { class: 'fac-steps', role: 'list' });
    [
      ['Choose the scope', 'Pick one chapter per session. Most chapters take 60 to 90 minutes. Ask learners to open the guide from the same zip so everyone sees the same content.'],
      ['Turn on facilitator mode', 'It shows quiz answers, scenario verdicts and model answers with an Answer key badge. Keep it off on the learners\' screens.'],
      ['Run each practice problem in four moves', 'Read the brief aloud for 3 minutes. Let pairs flip the dials and argue for 10. Take the quiz for 5. Run the defend task with its timebox, then compare against the rubric.'],
      ['Debrief with the flip question', 'Ask what would change the choice. Good answers name a dial and a threshold.'],
      ['Collect evidence', 'Ask each learner to export progress and share the file. The dashboard shows weak topics to coach next.']
    ].forEach((s) => run.appendChild(el('li', null, el('strong', null, s[0]), el('span', null, s[1]))));
    root.appendChild(sec('facilitator', 'Facilitator guide',
      el('p', null, 'Use the guide as the spine of a workshop. Facilitator mode reveals answers and includes them when you print a topic or practice problem.'),
      el('div', { class: 'ui-card ui-card--pad fac-toggle' }, el('label', { class: 'ui-switch' }, facInput, el('span', { class: 'track' }), el('span', { class: 'txt' }, 'Facilitator mode', el('small', null, 'Reveals quiz answers and model answers. Saved in this browser.')))),
      run));

    root.appendChild(sec('data', 'Your data and privacy',
      el('p', null, 'Everything stays on this computer. The guide saves your progress in this browser\'s local storage and never sends it anywhere. It works with no network.'),
      el('ul', { class: 'about-list' },
        el('li', null, 'Clearing site data or switching browsers removes your progress. Export first from the footer or the Progress page.'),
        el('li', null, 'To move to another browser or computer, export a file and import it there. Importing can merge with existing progress or replace it.'),
        el('li', null, 'If this browser blocks local storage, a banner tells you and the guide keeps progress in memory until you export.')),
      el('div', { class: 'cluster' }, U().btn({ text: 'Open my progress', icon: 'trophy', kind: 'primary', href: '#/progress' }), U().btn({ text: 'Export now', icon: 'download', onClick: () => G.shell.doExport() }))));

    root.appendChild(el('p', { class: 't-muted t-sm about-ver' }, meta.title + ' version ' + meta.version + ' · ' + meta.totals.worlds + ' chapters · ' + (meta.totals.topics || 0) + ' topics · ' + (meta.totals.scenarios || 0) + ' scenarios · ' + meta.totals.levels + ' practice problems · ' + meta.totals.quiz + ' quiz items · built ' + String(meta.generated || '').slice(0, 10)));

    const toc = [['topics', 'How a topic page works'], ['how', 'How a practice problem works'], ['method', 'Dial-and-Defend method'], ['keys', 'Keyboard shortcuts'], ['facilitator', 'Facilitator guide'], ['data', 'Your data and privacy']].map((t) => ({ id: t[0], text: t[1], level: 2 }));
    return {
      el: root, title: 'How to use', world: 'home', toc: toc, tocSlot: tocSlot,
      crumbs: [{ label: 'Journey', href: '#/' }, { label: 'How to use' }],
      destroy: () => G.store.off(onStore)
    };
  };
})();
