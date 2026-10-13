/* Follow the Question: topic views. Owner: E1.
   Registers Guide.views.topic (one topic), Guide.views.topics (all-topics index) and Guide.views.cheatsheet (printable chapter table).
   Topic pages are drawn by Guide.render.topicPage (E2). A plain placeholder shows if that renderer is missing. */
(function () {
  'use strict';

  const G = window.Guide;
  const el = G.el;
  const U = () => G.ui;
  G.views = G.views || {};

  function subscribeStore(fn) {
    let queued = false;
    const handler = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; fn(); });
    };
    G.store.on(handler);
    return () => G.store.off(handler);
  }
  const chapterName = (w) => 'Chapter ' + U().worldNo(w.id) + ': ' + (w.short || w.title);

  /* ================================================================
     One topic
     ================================================================ */
  function placeholderTopic(world, topic, opts) {
    const ctx = { refs: {} };
    (world.references || []).forEach((r) => { ctx.refs[r.id] = r; });
    const md = (s) => U().mdInline(s, ctx);
    const art = el('article', { class: 'level-fallback topic-fallback' });
    art.appendChild(el('div', { class: 'ui-card ui-card--pad level-fallback__note', role: 'note' },
      el('strong', null, 'Topic renderer not loaded. '), 'Showing a plain preview of this topic. Reload the page if this persists.'));
    const put = (h, html) => { const d = el('div', { class: 'topic-fallback__sec' }, el('h2', null, h)); const p = el('div'); p.innerHTML = html; d.appendChild(p); art.appendChild(d); };
    put('At a glance', '<p>' + md(topic.summary) + '</p><p><strong>Use it when:</strong> ' + md(topic.useIf) + '</p><p><strong>Avoid it when:</strong> ' + md(topic.avoidIf) + '</p>');
    if (topic.whereToUse && topic.whereToUse.length) put('Where to use it', '<ul>' + topic.whereToUse.map((t) => '<li>' + md(t) + '</li>').join('') + '</ul>');
    const wt = topic.whenToUse || {};
    ['use', 'avoid', 'flips'].forEach((k) => {
      if (wt[k] && wt[k].length) put({ use: 'Use it when', avoid: 'Avoid it when', flips: 'What flips the choice' }[k], '<ul>' + wt[k].map((t) => '<li>' + md(t) + '</li>').join('') + '</ul>');
    });
    if (topic.scenarios && topic.scenarios.length) put('Scenarios', '<ul>' + topic.scenarios.map((s) => '<li>' + G.esc(s.title || s.id) + '</li>').join('') + '</ul>');
    const reviewed = () => G.store.topicStatus(topic.id) === 'reviewed';
    const btn = U().btn({ text: 'Mark as reviewed', icon: 'check', kind: 'primary', onClick: () => { G.store.markTopic(topic.id, world.id); btn.hidden = true; } });
    btn.hidden = reviewed();
    G.store.touchTopic(topic.id);
    art.appendChild(el('div', { class: 'cluster' }, btn,
      opts.prev ? U().btn({ text: 'Previous: ' + opts.prev.title, href: opts.prev.href }) : null,
      opts.next ? U().btn({ text: 'Next: ' + opts.next.title, href: opts.next.href }) : null));
    return { el: art, toc: [] };
  }

  G.views.topic = function (route) {
    const found = U().findTopic(route.params.topic);
    if (!found || found.world.id !== route.params.world) return G.views.notfound(route);
    return G.content.load(found.world.id).then((world) => {
      const topic = (world.topics || []).filter((t) => t.id === route.params.topic)[0];
      if (!topic) return G.views.notfound(route);
      const meta = found.world;
      const list = U().topicsOf(meta);
      const idx = list.findIndex((t) => t.id === topic.id);
      const flat = U().flatTopics();
      const gi = flat.findIndex((x) => x.topic.id === topic.id);
      const nb = (x) => x ? { title: (x.world.id !== meta.id ? x.world.short + ': ' : '') + x.topic.title, href: U().topicHref(x.world.id, x.topic.id), world: x.world.id, kind: 'topic' } : null;
      const opts = { prev: nb(flat[gi - 1]), next: nb(flat[gi + 1]), index: idx + 1, count: list.length };

      const root = el('div', { class: 'view level topic-view', 'data-world': meta.id, 'data-topic': topic.id });
      const tocSlot = el('div', { class: 'toc-slot' });
      root.appendChild(el('p', { class: 'print-only print-head' }, 'Follow the Question · ' + chapterName(meta) + ' · ' + topic.title));
      root.appendChild(tocSlot);

      let result = null;
      try {
        if (G.render && G.render.topicPage) result = G.render.topicPage(world, topic, opts);
      } catch (err) {
        console.error(err);
        result = null;
        root.appendChild(el('div', { class: 'ui-card ui-card--pad level-error', role: 'alert' }, el('strong', null, 'This topic could not be rendered. '), err && err.message ? err.message : String(err)));
      }
      if (!result || !result.el) result = placeholderTopic(world, topic, opts);
      root.appendChild(el('div', { class: 'level-body' }, result.el));

      return {
        el: root, title: topic.title + ' (Chapter ' + U().worldNo(meta.id) + ')', world: meta.id, toc: Array.isArray(result.toc) ? result.toc : [], tocSlot: tocSlot,
        crumbs: [
          { label: 'Topics', href: '#/topics' },
          { label: chapterName(meta), href: U().worldHref(meta.id) },
          topic.group ? { label: topic.group } : null,
          { label: topic.title }
        ].filter(Boolean),
        destroy: () => { if (result && typeof result.destroy === 'function') result.destroy(); }
      };
    });
  };

  /* ================================================================
     All topics index
     ================================================================ */
  const plain = (s) => U().plainText(s);

  function topicRow(w, t) {
    const status = G.store.topicStatus(t.id);
    const mark = U().topicMark(status);
    const href = U().topicHref(w.id, t.id);
    const useEl = el('div', { class: 'tx-cell tx-cell--use' }, el('span', { class: 'tx-label tx-label--use' }, U().icon('check', 14), 'Use it when'), el('span', { class: 'tx-text' }));
    const avoidEl = el('div', { class: 'tx-cell tx-cell--avoid' }, el('span', { class: 'tx-label tx-label--avoid' }, U().icon('warn', 14), 'Avoid it when'), el('span', { class: 'tx-text' }));
    useEl.lastChild.innerHTML = U().mdInline(t.useIf);
    avoidEl.lastChild.innerHTML = U().mdInline(t.avoidIf);
    const sum = el('p', { class: 'tx-summary' });
    sum.innerHTML = U().mdInline(t.summary);
    const row = el('li', { class: 'tx-row is-' + status, 'data-world': w.id, id: 'tx-' + t.id },
      el('div', { class: 'tx-main' },
        el('span', { class: 'tx-mark' }, mark),
        el('div', { class: 'tx-head' },
          el('a', { class: 'tx-title', href: href }, t.title),
          sum,
          el('div', { class: 'tx-meta' },
            U().difficultyChip(t.difficulty),
            el('span', { class: 'tx-min' }, U().icon('clock', 13), (t.minutes || 0) + ' min'),
            t.scenarioCount ? el('span', { class: 'tx-min', title: t.scenarioCount + ' scenario questions' }, U().icon('target', 13), U().plural(t.scenarioCount, 'scenario')) : null))),
      useEl, avoidEl);
    return { row: row, mark: mark, status: status, hay: (t.title + ' ' + (t.group || '') + ' ' + plain(t.summary) + ' ' + plain(t.useIf) + ' ' + plain(t.avoidIf) + ' ' + w.title + ' ' + w.short).toLowerCase(), t: t, w: w };
  }

  G.topicRow = topicRow; // shared with the chapter overview in home.js

  G.views.topics = function (route) {
    const worlds = U().worlds().filter((w) => (w.topics || []).length);
    const total = worlds.reduce((a, w) => a + w.topics.length, 0);
    const root = el('div', { class: 'view view--wide topics-index' });
    const q0 = route.query || {};
    const state = { q: q0.q || '', d: q0.d === 'core' || q0.d === 'advanced' ? q0.d : '', u: q0.u === '1' };

    root.appendChild(el('header', { class: 'view-head' },
      el('p', { class: 'eyebrow' }, 'Revise by topic'),
      el('h1', null, 'All topics'),
      el('p', { class: 'view-head__lead t-2' }, total + ' topics in ' + worlds.length + ' chapters. Open any topic on its own, in any order. Every row says when to use the idea and when to leave it alone.')));

    /* sticky controls */
    const search = el('input', { class: 'ui-input tx-search', type: 'search', 'aria-label': 'Filter topics', placeholder: 'Filter by title, idea or when to use it', autocomplete: 'off', value: state.q });
    const diffBtns = {};
    const diffGroup = el('div', { class: 'cluster tx-diff', role: 'group', 'aria-label': 'Difficulty' });
    [['', 'All'], ['core', 'Core'], ['advanced', 'Advanced']].forEach((o) => {
      const b = el('button', { class: 'ui-toggle', type: 'button', 'aria-pressed': 'false' }, o[1]);
      b.addEventListener('click', () => { state.d = o[0]; sync(); });
      diffBtns[o[0]] = b;
      diffGroup.appendChild(b);
    });
    const unrevBtn = el('button', { class: 'ui-toggle', type: 'button', 'aria-pressed': 'false' }, U().icon('check', 14), 'Not yet reviewed');
    unrevBtn.addEventListener('click', () => { state.u = !state.u; sync(); });
    const count = el('p', { class: 'tx-count t-muted', role: 'status', 'aria-live': 'polite' });
    const jump = el('nav', { class: 'tx-jump', 'aria-label': 'Jump to a chapter' });
    root.appendChild(el('div', { class: 'tx-bar' },
      el('div', { class: 'tx-controls' }, el('div', { class: 'tx-search-wrap' }, U().icon('search', 16, 'tx-search-ic'), search), diffGroup, unrevBtn, count),
      jump));

    /* body */
    const body = el('div', { class: 'tx-body' });
    const chapters = [];
    worlds.forEach((w) => {
      const sec = el('section', { class: 'tx-chapter', id: 'tx-ch-' + w.id, 'data-world': w.id, 'aria-labelledby': 'tx-h-' + w.id });
      const prog = el('span', { class: 'tx-chapter__prog' });
      const bar = U().bar(0, { cls: 'ui-bar--thin tx-chapter__bar' });
      sec.appendChild(el('header', { class: 'tx-chapter__head' },
        el('span', { class: 'tx-chapter__ic', 'aria-hidden': 'true' }, U().worldIcon(w.id, 26)),
        el('div', { class: 'tx-chapter__titles' },
          el('h2', { class: 'tx-chapter__h', id: 'tx-h-' + w.id }, el('span', { class: 'tx-chapter__no' }, 'Chapter ' + U().worldNo(w.id)), w.title),
          el('p', { class: 'tx-chapter__tag t-2' }, w.tagline)),
        el('div', { class: 'tx-chapter__side' }, prog, bar,
          el('span', { class: 'tx-chapter__links' },
            el('a', { href: U().worldHref(w.id) }, 'Overview'), el('a', { href: '#/w/' + w.id + '/cheatsheet' }, 'Cheat sheet')))));
      const groups = [];
      let lastGroup = null, ul = null, gEl = null;
      const rows = [];
      U().topicsOf(w).forEach((t) => {
        if (t.group !== lastGroup) {
          lastGroup = t.group;
          const gid = 'tx-g-' + w.id + '-' + groups.length;
          ul = el('ul', { class: 'tx-list', role: 'list', 'aria-labelledby': gid });
          gEl = el('div', { class: 'tx-group' }, el('h3', { class: 'tx-group__h', id: gid }, t.group || 'Topics'), ul);
          groups.push({ el: gEl, rows: [] });
          sec.appendChild(gEl);
        }
        const r = topicRow(w, t);
        ul.appendChild(r.row);
        groups[groups.length - 1].rows.push(r);
        rows.push(r);
      });
      const chip = el('a', { class: 'tx-chip', href: '#tx-ch-' + w.id, 'data-world': w.id, title: w.title },
        el('span', { class: 'tx-chip__no' }, U().worldNo(w.id)), el('span', { class: 'tx-chip__t' }, w.short || w.title), el('span', { class: 'tx-chip__n' }));
      jump.appendChild(chip);
      chapters.push({ w: w, sec: sec, rows: rows, groups: groups, prog: prog, bar: bar, chip: chip, chipN: chip.lastChild });
      body.appendChild(sec);
    });
    const empty = el('div', { class: 'tx-empty', hidden: true }, U().emptyState({
      icon: 'search', title: 'No topics match', text: 'Try fewer words, or clear the difficulty and review filters.',
      actions: [U().btn({ text: 'Clear filters', icon: 'refresh', onClick: () => { state.q = ''; state.d = ''; state.u = false; search.value = ''; sync(); } })]
    }));
    root.appendChild(body);
    root.appendChild(empty);

    function applyFilters() {
      const tokens = state.q.toLowerCase().split(/\s+/).filter(Boolean);
      let shown = 0;
      chapters.forEach((c) => {
        let n = 0;
        c.groups.forEach((g) => {
          let gn = 0;
          g.rows.forEach((r) => {
            const ok = (!state.d || r.t.difficulty === state.d) && (!state.u || r.status !== 'reviewed') && tokens.every((t) => r.hay.indexOf(t) >= 0);
            r.row.hidden = !ok;
            if (ok) gn++;
          });
          g.el.hidden = gn === 0;
          n += gn;
        });
        c.sec.hidden = n === 0;
        c.chip.classList.toggle('is-dim', n === 0);
        c.chipN.textContent = n && n !== c.rows.length ? String(n) : '';
        shown += n;
      });
      count.textContent = shown === total ? total + ' topics' : shown + ' of ' + total + ' topics';
      empty.hidden = shown > 0;
    }

    function paintStatus() {
      chapters.forEach((c) => {
        let reviewed = 0;
        c.rows.forEach((r) => {
          const s = G.store.topicStatus(r.t.id);
          if (s === 'reviewed') reviewed++;
          if (s !== r.status) {
            r.status = s;
            r.row.className = 'tx-row is-' + s;
            const mk = U().topicMark(s);
            r.mark.replaceWith(mk);
            r.mark = mk;
          }
        });
        c.prog.textContent = reviewed + ' of ' + c.rows.length + ' reviewed';
        U().setBar(c.bar, c.rows.length ? (reviewed / c.rows.length) * 100 : 0);
        c.sec.classList.toggle('is-complete', reviewed === c.rows.length);
      });
    }

    function sync(fromQuery) {
      Object.keys(diffBtns).forEach((k) => diffBtns[k].setAttribute('aria-pressed', String(state.d === k)));
      unrevBtn.setAttribute('aria-pressed', String(state.u));
      applyFilters();
      if (!fromQuery && G.router) G.router.replaceQuery({ q: state.q, d: state.d, u: state.u ? '1' : '' });
    }
    search.addEventListener('input', G.debounce(() => { state.q = search.value.trim(); sync(); }, 90));
    search.addEventListener('keydown', (e) => { if (e.key === 'Escape' && search.value) { e.stopPropagation(); search.value = ''; state.q = ''; sync(); } });

    paintStatus();
    sync(true);

    /* scroll spy for the chapter jump bar */
    let ticking = false, activeChip = null;
    function spy() {
      ticking = false;
      let cur = null;
      for (let i = 0; i < chapters.length; i++) {
        const c = chapters[i];
        if (c.sec.hidden) continue;
        if (c.sec.getBoundingClientRect().top <= 170) cur = c; else break;
      }
      if (cur === activeChip) return;
      activeChip = cur;
      chapters.forEach((c) => { if (c === cur) c.chip.setAttribute('aria-current', 'location'); else c.chip.removeAttribute('aria-current'); });
      if (cur && jump.scrollWidth > jump.clientWidth) {
        const jr = jump.getBoundingClientRect(), cr = cur.chip.getBoundingClientRect();
        if (cr.left < jr.left + 8 || cr.right > jr.right - 8) jump.scrollLeft += cr.left - jr.left - jr.width / 3;
      }
    }
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(spy); } };
    window.addEventListener('scroll', onScroll, { passive: true });
    const off = subscribeStore(() => { paintStatus(); applyFilters(); });

    return {
      el: root, title: 'All topics', world: 'home',
      crumbs: [{ label: 'Home', href: '#/' }, { label: 'All topics' }],
      onQuery: (nq) => {
        state.q = nq.q || ''; state.d = nq.d === 'core' || nq.d === 'advanced' ? nq.d : ''; state.u = nq.u === '1';
        search.value = state.q; sync(true);
        if (nq.s) G.router.scrollToSection(nq.s, { focus: true });
      },
      afterMount: spy,
      destroy: () => { off(); window.removeEventListener('scroll', onScroll); }
    };
  };

  /* ================================================================
     Chapter cheat sheet
     ================================================================ */
  G.views.cheatsheet = function (route) {
    const meta = U().worldMeta(route.params.world);
    if (!meta) return G.views.notfound(route);
    const topics = U().topicsOf(meta);
    const root = el('div', { class: 'view view--wide cheatsheet', 'data-world': meta.id });
    root.appendChild(el('p', { class: 'print-only print-head' }, 'Follow the Question · ' + chapterName(meta) + ' · Cheat sheet'));
    root.appendChild(el('header', { class: 'view-head cs-head' },
      el('p', { class: 'eyebrow' }, 'Chapter ' + U().worldNo(meta.id) + ' cheat sheet'),
      el('h1', null, meta.title),
      el('p', { class: 'view-head__lead t-2' }, topics.length
        ? topics.length + ' topics on one page: what each one is, when to use it and when to avoid it. Print it or save it as a PDF for a last read before an interview.'
        : 'This chapter has no topics, only boss rounds and practice problems.'),
      el('div', { class: 'cluster cs-actions' },
        U().btn({ text: 'Print or save as PDF', icon: 'print', kind: 'primary', onClick: () => window.print() }),
        U().btn({ text: 'Chapter overview', icon: 'arrow-left', href: U().worldHref(meta.id) }),
        U().btn({ text: 'All topics', icon: 'layers', href: '#/topics' }))));

    if (!topics.length) {
      root.appendChild(U().emptyState({ icon: 'info', title: 'No topics to list', text: 'Open the chapter overview to see its boss rounds.', actions: [U().btn({ text: 'Chapter overview', kind: 'primary', href: U().worldHref(meta.id) })] }));
    } else {
      const wrap = el('div', { class: 'table-wrap cs-wrap' });
      const table = el('table', { class: 'cs-table' });
      table.appendChild(el('caption', { class: 'sr-only' }, chapterName(meta) + ': topic, what it is, use it when, avoid it when'));
      table.appendChild(el('thead', null, el('tr', null,
        el('th', { scope: 'col', class: 'cs-col-topic' }, 'Topic'), el('th', { scope: 'col' }, 'What it is'),
        el('th', { scope: 'col', class: 'cs-col-use' }, 'Use it when'), el('th', { scope: 'col', class: 'cs-col-avoid' }, 'Avoid it when'))));
      const tb = el('tbody');
      let last = null;
      topics.forEach((t) => {
        if (t.group !== last) {
          last = t.group;
          tb.appendChild(el('tr', { class: 'cs-group' }, el('th', { scope: 'colgroup', colspan: '4' }, t.group || 'Topics')));
        }
        const cell = (cls, html) => { const td = el('td', { class: cls }); td.innerHTML = html; return td; };
        const rowStatus = G.store.topicStatus(t.id);
        tb.appendChild(el('tr', { class: 'cs-row' },
          el('th', { scope: 'row', class: 'cs-topic' },
            el('a', { href: U().topicHref(meta.id, t.id) }, t.title),
            el('span', { class: 'cs-topic__meta' }, (t.difficulty === 'advanced' ? 'Advanced' : 'Core') + (rowStatus === 'reviewed' ? ' · reviewed' : ''))),
          cell('cs-sum', U().mdInline(t.summary)), cell('cs-use', U().mdInline(t.useIf)), cell('cs-avoid', U().mdInline(t.avoidIf))));
      });
      table.appendChild(tb);
      wrap.appendChild(table);
      root.appendChild(wrap);
    }
    return {
      el: root, title: chapterName(meta) + ' cheat sheet', world: meta.id,
      crumbs: [{ label: 'Topics', href: '#/topics' }, { label: chapterName(meta), href: U().worldHref(meta.id) }, { label: 'Cheat sheet' }]
    };
  };
})();
