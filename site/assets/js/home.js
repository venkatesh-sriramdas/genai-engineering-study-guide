/* Follow the Question: home (journey map), world overview and level views. Owner: E1.
   Registers Guide.views.home, Guide.views.world and Guide.views.level. */
(function () {
  'use strict';

  const G = window.Guide;
  const el = G.el;
  const U = () => G.ui;
  const NS = 'http://www.w3.org/2000/svg';
  G.views = G.views || {};

  function svg(tag, attrs) {
    const n = document.createElementNS(NS, tag);
    if (attrs) Object.keys(attrs).forEach((k) => { if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]); });
    for (let i = 2; i < arguments.length; i++) {
      const k = arguments[i];
      if (k === null || k === undefined || k === false) continue;
      n.appendChild(typeof k === 'string' ? document.createTextNode(k) : k);
    }
    return n;
  }

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

  function wrapLabel(text, max) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let cur = '';
    words.forEach((w) => {
      if (!cur) cur = w;
      else if ((cur + ' ' + w).length <= max) cur += ' ' + w;
      else { lines.push(cur); cur = w; }
    });
    if (cur) lines.push(cur);
    if (lines.length > 2) { lines.length = 2; lines[1] = lines[1].replace(/.{1}$/, '') + '…'; }
    return lines;
  }

  function sumMinutes(worlds) { return worlds.reduce((a, w) => a + (w.minutes || 0), 0); }

  /* ================================================================
     Home
     ================================================================ */
  function heroSection(parts) {
    const m = G.manifest;
    const words = m.title.split(' ');
    const last = words.pop();
    const target = U().continueTarget();
    const ct = U().continueTopic();
    const st = G.store.totalProgress();
    const flat = U().flatLevels();
    const first = flat[0];

    const cta = el('div', { class: 'hero__cta' });
    cta.appendChild(U().btn({ text: 'Browse all topics', icon: 'layers', kind: 'primary lg', href: '#/topics' }));
    let journeyHref = '#journey', journeyText = 'Follow the journey';
    if (target.kind === 'resume' || target.kind === 'next') { journeyHref = U().levelHref(target.world.id, target.level.id); journeyText = target.kind === 'resume' ? 'Continue the journey' : 'Follow the journey'; }
    else if (target.kind === 'start' || (first && target.kind === 'done')) { journeyHref = first ? U().levelHref(first.world.id, first.level.id) : '#journey'; }
    cta.appendChild(U().btn({ text: journeyText, icon: 'map', kind: 'lg', href: journeyHref }));

    const resume = [];
    if (ct.world && ct.topic) {
      resume.push(el('p', { class: 'hero__resume' },
        el('span', { class: 'hero__resume-k' }, ct.kind === 'resume' ? 'Topic you left open' : ct.kind === 'next' ? 'Next topic' : 'Start with'),
        el('a', { href: U().topicHref(ct.world.id, ct.topic.id) }, 'Chapter ' + U().worldNo(ct.world.id) + ' · ' + ct.world.short + ': ' + ct.topic.title)));
    }
    if (target.world && target.level && (target.kind === 'resume' || target.kind === 'next')) {
      resume.push(el('p', { class: 'hero__resume' },
        el('span', { class: 'hero__resume-k' }, target.kind === 'resume' ? 'Practice problem open' : 'Next practice problem'),
        el('a', { href: U().levelHref(target.world.id, target.level.id) }, 'Chapter ' + U().worldNo(target.world.id) + ' · ' + target.world.short + ': ' + target.level.title)));
    }

    let art = '';
    try { art = G.icons && G.icons.hero ? G.icons.hero() : ''; } catch (e) { art = ''; }
    const artBox = el('div', { class: 'hero__art', 'aria-hidden': 'true' });
    if (art) artBox.innerHTML = art; else artBox.classList.add('hero__art--fallback');

    const meta = el('p', { class: 'hero__meta' },
      el('span', null, el('b', null, st.topicsReviewed), ' of ' + st.topicsTotal + ' topics reviewed'),
      el('span', { class: 'hero__sep', 'aria-hidden': 'true' }, '·'),
      el('span', null, el('b', null, st.levelsDone), ' of ' + st.levelsTotal + ' practice problems done'),
      el('span', { class: 'hero__sep', 'aria-hidden': 'true' }, '·'),
      el('span', null, st.rank + ', ' + U().fmtNum(st.xp) + ' XP'),
      st.streak ? el('span', { class: 'hero__sep', 'aria-hidden': 'true' }, '·') : null,
      st.streak ? el('span', { class: 'hero__streak' }, U().icon('flame', 16), U().plural(st.streak, 'day') + ' streak') : null);

    return el('section', { class: 'hero', 'aria-labelledby': 'hero-title' },
      artBox,
      el('div', { class: 'hero__body' },
        el('div', { class: 'hero__head' },
          el('p', { class: 'eyebrow' }, 'A field guide to GenAI and AI engineering'),
          el('h1', { class: 'hero__title', id: 'hero-title' }, words.join(' ') + ' ', el('span', { class: 'hero__grad' }, last)),
          el('p', { class: 'hero__sub' }, m.subtitle)),
        el('div', { class: 'hero__foot' },
          el('p', { class: 'hero__lead' }, 'Every topic stands on its own: what it is, where and when to use it, how it compares with the alternatives, and scenario questions that test the trade-offs. Open any one from the left menu, in any order. Prefer a guided route? Follow one question through the whole system.'),
          cta,
          resume,
          meta)));
  }

  function statTiles() {
    const t = G.manifest.totals;
    const labs = G.labs && G.labs.manifest ? G.labs.manifest.length : t.labs;
    const items = [
      ['map', t.worlds, t.worlds === 1 ? 'Chapter' : 'Chapters'], ['layers', t.topics || 0, (t.topics || 0) === 1 ? 'Topic' : 'Topics'], ['target', t.scenarios || 0, (t.scenarios || 0) === 1 ? 'Scenario question' : 'Scenario questions'],
      ['flag', t.levels, t.levels === 1 ? 'Practice problem' : 'Practice problems'], ['cards', t.flashcards, t.flashcards === 1 ? 'Flashcard' : 'Flashcards'], ['flask', labs, labs === 1 ? 'Interactive lab' : 'Interactive labs']
    ];
    const ul = el('ul', { class: 'stat-grid', role: 'list', 'aria-label': 'What is in the guide' });
    items.forEach((it) => {
      ul.appendChild(el('li', { class: 'stat' },
        el('span', { class: 'stat__icon' }, U().icon(it[0], 22)),
        el('span', { class: 'stat__num' }, U().fmtNum(it[1])),
        el('span', { class: 'stat__lbl' }, it[2])));
    });
    return ul;
  }

  /* ---------- journey map ---------- */
  const MAP = { W: 1080, GAP: 188, R: 94, XMIN: 110, XMAX: 970, XA: 175, XB: 905, TOP: 108, ZTOP: 88, ZBOT: 84, MAXSTEP: 250, SR: 34 };

  function layoutRows() {
    const regions = (G.manifest.regions || []).slice();
    const rows = [];
    regions.forEach((reg) => {
      const worlds = reg.worlds.map(U().worldMeta).filter(Boolean);
      for (let i = 0; i < worlds.length; i += 6) {
        rows.push({ region: reg, worlds: worlds.slice(i, i + 6), first: i === 0, all: worlds });
      }
    });
    rows.forEach((row, r) => {
      row.y = MAP.TOP + r * MAP.GAP;
      row.dir = r % 2 === 0 ? 1 : -1;
      const n = row.worlds.length;
      const step = n > 1 ? Math.min(MAP.MAXSTEP, (MAP.XB - MAP.XA) / (n - 1)) : 0;
      const span = step * (n - 1);
      const start = (MAP.W / 2) - span / 2;
      const xs = row.worlds.map((_, i) => start + step * i);
      if (row.dir < 0) xs.reverse();
      row.stations = row.worlds.map((w, i) => ({ world: w, x: xs[i], y: row.y }));
    });
    // journey order: row by row, in world order inside the row
    const order = [];
    rows.forEach((row) => row.stations.forEach((s) => order.push(s)));
    return { rows: rows, order: order };
  }

  function segmentPath(a, b, rows) {
    if (a.y === b.y) return 'M' + a.x + ' ' + a.y + ' H' + b.x;
    const dir = a.y < b.y ? (rows.filter((r) => r.y === a.y)[0].dir) : 1;
    const edge = dir > 0 ? MAP.XMAX : MAP.XMIN;
    return 'M' + a.x + ' ' + a.y + ' H' + edge + ' A' + MAP.R + ' ' + MAP.R + ' 0 0 ' + (dir > 0 ? 1 : 0) + ' ' + edge + ' ' + b.y + ' H' + b.x;
  }
  function trackPath(rows, order) {
    const first = order[0], lastS = order[order.length - 1];
    let d = 'M' + first.x + ' ' + first.y;
    rows.forEach((row, r) => {
      const edge = row.dir > 0 ? MAP.XMAX : MAP.XMIN;
      if (r < rows.length - 1) d += ' H' + edge + ' A' + MAP.R + ' ' + MAP.R + ' 0 0 ' + (row.dir > 0 ? 1 : 0) + ' ' + edge + ' ' + (row.y + MAP.GAP);
      else d += ' H' + lastS.x;
    });
    return d;
  }

  function worldState(p) { return p.pct === 100 ? 'done' : (p.pct > 0 || p.started) ? 'started' : 'new'; }

  function buildJourney() {
    const lay = layoutRows();
    const rows = lay.rows, order = lay.order;
    const next = U().nextRecommended();
    const nextWorld = next ? next.world.id : null;
    const st = G.store;

    const wrap = el('div', { class: 'journey-wrap' });
    if (!order.length) { wrap.appendChild(U().emptyState({ icon: 'map', title: 'No chapters yet', text: 'Build the content with node tools/build.mjs and reload.' })); return wrap; }

    const H = MAP.TOP + (rows.length - 1) * MAP.GAP + MAP.ZBOT + 20;
    const root = svg('svg', { class: 'jm', viewBox: '0 0 ' + MAP.W + ' ' + H, role: 'group', 'aria-label': 'Journey map. Each station is a chapter. Use Tab to move between chapters.', focusable: 'false' });

    rows.forEach((row) => {
      const done = row.all.filter((w) => st.worldProgress(w.id).pct === 100).length;
      root.appendChild(svg('rect', { class: 'jm-zone', x: 70, y: row.y - MAP.ZTOP, width: 940, height: MAP.ZTOP + MAP.ZBOT, rx: 28 }));
      if (row.first) {
        const g = svg('g', { class: 'jm-banner', transform: 'translate(100 ' + (row.y - MAP.ZTOP + 30) + ')' });
        const ic = svg('g', { class: 'jm-banner__icon', transform: 'translate(0 -16)' });
        try { ic.innerHTML = G.icons && G.icons.region ? G.icons.region(row.region.id, { size: 22 }) : ''; } catch (e) { /* no icon */ }
        g.appendChild(ic);
        g.appendChild(svg('text', { class: 'jm-banner__txt', x: 32, y: 0 }, row.region.label, svg('tspan', { class: 'jm-banner__sub', dx: 12 }, done + ' of ' + row.all.length + (row.all.length === 1 ? ' chapter' : ' chapters') + ' complete')));
        root.appendChild(g);
      }
    });

    const track = trackPath(rows, order);
    root.appendChild(svg('path', { class: 'jm-road', d: track }));
    root.appendChild(svg('path', { class: 'jm-dots', d: track }));
    for (let i = 0; i < order.length - 1; i++) {
      const p = st.worldProgress(order[i].world.id);
      if (p.pct === 100) root.appendChild(svg('path', { class: 'jm-done', d: segmentPath(order[i], order[i + 1], rows) }));
    }

    const box = el('div', { class: 'jm-box' });
    const tip = el('div', { class: 'ui-tip', role: 'presentation', 'aria-hidden': 'true' });

    function showTip(station, node) {
      const w = station.world;
      const p = st.worldProgress(w.id);
      G.clear(tip);
      tip.appendChild(el('div', { class: 'tip__head', 'data-world': w.id }, el('span', { class: 'tip__ic' }, U().worldIcon(w.id, 20)), el('strong', null, w.title)));
      tip.appendChild(el('p', { class: 'tip__line' }, w.tagline));
      tip.appendChild(el('p', { class: 'tip__meta' }, p.topics.reviewed + ' of ' + p.topics.total + ' topics · ' + p.done + ' of ' + p.total + ' practice problems · ' + G.fmtMin(w.minutes)));
      if (w.id === nextWorld && next) tip.appendChild(el('p', { class: 'tip__next' }, U().icon('arrow-right', 14), 'Up next: ' + next.level.title));
      tip.classList.add('is-on');
      const b = box.getBoundingClientRect(), r = node.getBoundingClientRect();
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      let left = r.left - b.left + r.width / 2 - tw / 2;
      left = Math.max(4, Math.min(b.width - tw - 4, left));
      let top = r.top - b.top - th - 10;
      if (top < 4) top = r.bottom - b.top + 10;
      tip.style.left = left + 'px';
      tip.style.top = top + 'px';
    }
    function hideTip() { tip.classList.remove('is-on'); }

    order.forEach((s, idx) => {
      const w = s.world;
      const p = st.worldProgress(w.id);
      const state = worldState(p);
      const isNext = w.id === nextWorld;
      const lines = wrapLabel(w.short || w.title, 15);
      const visible = U().worldNo(w.id) + ' ' + lines.join(' ') + (isNext ? ' Up next' : '');
      const label = visible + '. Chapter ' + U().worldNo(w.id) + ' of the journey. ' + p.done + ' of ' + p.total + ' practice problems done.';
      const R = MAP.SR, C = 2 * Math.PI * R;
      const a = svg('a', { class: 'jm-station is-' + state + (isNext ? ' is-next' : ''), href: U().worldHref(w.id), 'data-world': w.id, 'aria-label': label });
      if (isNext) a.appendChild(svg('circle', { class: 'jm-halo', r: R + 11 }));
      a.appendChild(svg('circle', { class: 'jm-focus', r: R + 8 }));
      a.appendChild(svg('circle', { class: 'jm-track', r: R }));
      const arc = svg('circle', { class: 'jm-arc', r: R, 'stroke-dasharray': C.toFixed(1), 'stroke-dashoffset': (C * (1 - p.pct / 100)).toFixed(1), transform: 'rotate(-90)' });
      a.appendChild(arc);
      a.appendChild(svg('circle', { class: 'jm-core', r: R - 7 }));
      const ic = svg('g', { class: 'jm-icon' });
      try { ic.innerHTML = G.icons && G.icons.world ? G.icons.world(w.id, { size: 28 }) : ''; } catch (e) { /* no icon */ }
      if (ic.firstElementChild) { ic.firstElementChild.setAttribute('x', -14); ic.firstElementChild.setAttribute('y', -14); }
      else ic.appendChild(svg('text', { class: 'jm-icon__fallback', 'text-anchor': 'middle', y: 5, 'aria-hidden': 'true' }, U().worldNo(w.id)));
      a.appendChild(ic);
      a.appendChild(svg('circle', { class: 'jm-no-bg', cx: -26, cy: -26, r: 12 }));
      a.appendChild(svg('text', { class: 'jm-no', x: -26, y: -22, 'text-anchor': 'middle' }, U().worldNo(w.id) + ' '));
      if (state === 'done') {
        const badge = svg('g', { class: 'jm-check', transform: 'translate(25 25)' }, svg('circle', { r: 11 }));
        const ck = svg('g', { transform: 'translate(-7 -7)' });
        try { ck.innerHTML = U().iconSvg('check', 14); } catch (e) { /* ignore */ }
        badge.appendChild(ck);
        a.appendChild(badge);
      }
      const lab = svg('text', { class: 'jm-label', 'text-anchor': 'middle', y: R + 24 });
      lines.forEach((ln, i) => lab.appendChild(svg('tspan', { x: 0, dy: i ? 16 : 0 }, ln + ' ')));
      a.appendChild(lab);
      if (isNext) {
        const flag = svg('g', { class: 'jm-flag', transform: 'translate(' + (R + 12) + ' ' + (-R - 12) + ')' }, svg('rect', { x: -32, y: -13, width: 64, height: 24, rx: 12 }), svg('text', { 'text-anchor': 'middle', y: 4 }, 'Up next'));
        a.appendChild(flag);
      }
      const g = svg('g', { transform: 'translate(' + s.x + ' ' + s.y + ')', 'data-world': w.id }, a);
      root.appendChild(g);
      a.addEventListener('mouseenter', () => showTip(s, a));
      a.addEventListener('focus', () => showTip(s, a));
      a.addEventListener('mouseleave', hideTip);
      a.addEventListener('blur', hideTip);
    });

    box.appendChild(root);
    box.appendChild(tip);
    wrap.appendChild(box);

    // vertical timeline for narrow containers
    const tl = el('ol', { class: 'jt', 'aria-label': 'Journey as a list' });
    (G.manifest.regions || []).forEach((reg) => {
      const worlds = reg.worlds.map(U().worldMeta).filter(Boolean);
      if (!worlds.length) return;
      const done = worlds.filter((w) => st.worldProgress(w.id).pct === 100).length;
      tl.appendChild(el('li', { class: 'jt__region' }, U().regionIcon(reg.id, 20), el('span', { class: 'jt__region-lbl' }, reg.label), el('span', { class: 'jt__region-cnt' }, done + ' of ' + worlds.length)));
      worlds.forEach((w) => {
        const p = st.worldProgress(w.id);
        const state = worldState(p);
        const isNext = w.id === nextWorld;
        const node = el('span', { class: 'jt__node' }, U().ring({ pct: p.pct, size: 46, stroke: 4 }), U().worldIcon(w.id, 20));
        const a = el('a', { class: 'jt__item is-' + state + (isNext ? ' is-next' : ''), href: U().worldHref(w.id), 'data-world': w.id },
          node,
          el('span', { class: 'jt__body' },
            el('strong', { class: 'jt__title' }, el('span', { class: 'jt__no' }, U().worldNo(w.id)), w.short || w.title),
            el('span', { class: 'jt__line' }, w.tagline),
            el('span', { class: 'jt__meta' }, p.topics.total ? p.topics.reviewed + '/' + p.topics.total + ' topics · ' + p.done + '/' + p.total + ' practice · ' + G.fmtMin(w.minutes) : p.done + ' of ' + p.total + ' boss rounds · ' + G.fmtMin(w.minutes))),
          isNext ? U().chip('Up next', 'accent') : (state === 'done' ? U().chip('Done', 'ok', { icon: 'check' }) : null));
        tl.appendChild(el('li', { class: 'jt__li' }, a));
      });
    });
    wrap.appendChild(tl);
    return wrap;
  }

  function journeySection() {
    const sec = el('section', { class: 'journey', id: 'journey', 'aria-labelledby': 'journey-h' });
    const body = el('div', { class: 'journey__body' });
    sec.appendChild(el('header', { class: 'section-head' },
      el('div', null,
        el('p', { class: 'eyebrow' }, 'The journey'),
        el('h2', { id: 'journey-h' }, 'Follow one question through the system'),
        el('p', { class: 't-2 section-head__p' }, 'Pick any station. The path shows the order the question travels, and the ring shows what you have finished.')),
      el('ul', { class: 'legend', role: 'list', 'aria-label': 'Map legend' },
        el('li', null, el('span', { class: 'legend__sw legend__sw--done' }), 'Complete'),
        el('li', null, el('span', { class: 'legend__sw legend__sw--started' }), 'In progress'),
        el('li', null, el('span', { class: 'legend__sw legend__sw--new' }), 'Not started'),
        el('li', null, el('span', { class: 'legend__sw legend__sw--next' }), 'Up next'))));
    sec.appendChild(body);
    return { el: sec, body: body };
  }

  function dueTile() {
    const d = G.store.dueSummary();
    const box = el('section', { class: 'ui-card ui-card--pad tile tile--cards', 'aria-labelledby': 'tile-due-h' });
    box.appendChild(el('div', { class: 'tile__head' }, el('span', { class: 'tile__icon' }, U().icon('cards', 22)), el('h3', { id: 'tile-due-h', class: 'tile__title' }, 'Due flashcards')));
    const big = el('p', { class: 'tile__big' }, el('b', null, U().fmtNum(d.due)), el('span', null, d.due === 1 ? ' card due' : ' cards due'));
    box.appendChild(big);
    const bars = el('div', { class: 'boxes', role: 'img', 'aria-label': 'Cards per Leitner box: ' + d.boxes.map((n, i) => 'box ' + (i + 1) + ': ' + n).join(', ') });
    const max = Math.max(1, Math.max.apply(null, d.boxes));
    d.boxes.forEach((n, i) => bars.appendChild(el('span', { class: 'boxes__col' }, el('span', { class: 'boxes__bar', style: { height: Math.max(6, n / max * 100) + '%' } }), el('span', { class: 'boxes__lbl' }, 'Box ' + (i + 1)))));
    if (d.studied) box.appendChild(bars);
    let text, label;
    if (!d.total) { text = 'This build has no flashcards.'; label = null; }
    else if (d.due > 0) { text = d.fresh ? d.fresh + ' more new cards are waiting.' : 'Reviewing now keeps them in memory.'; label = 'Review ' + d.due + (d.due === 1 ? ' card' : ' cards'); }
    else if (d.fresh > 0) { text = 'Nothing is due. ' + U().fmtNum(d.fresh) + ' new cards are ready to learn.'; label = 'Learn new cards'; }
    else { text = 'You are up to date. Study ahead if you want extra practice.'; label = 'Study ahead'; }
    box.appendChild(el('p', { class: 'tile__txt' }, text));
    if (label) box.appendChild(U().btn({ text: label, icon: 'arrow-right', kind: 'primary', href: '#/cards' }));
    return box;
  }

  function goalTile() {
    const goal = G.store.get().settings.dailyGoal;
    const n = G.store.todayCount();
    const pct = Math.min(100, Math.round((n / goal) * 100));
    const met = n >= goal;
    const tp = G.store.totalProgress();
    const box = el('section', { class: 'ui-card ui-card--pad tile tile--goal', 'aria-labelledby': 'tile-goal-h' });
    box.appendChild(el('div', { class: 'tile__head' }, el('span', { class: 'tile__icon' }, U().icon(met ? 'trophy' : 'target', 22)), el('h3', { id: 'tile-goal-h', class: 'tile__title' }, 'Daily goal')));
    box.appendChild(el('div', { class: 'goal' },
      U().ring({ pct: pct, size: 84, stroke: 8, text: n + '/' + goal, fontSize: 18, label: n + ' of ' + goal + ' actions today', color: met ? 'var(--ok)' : 'var(--brand-1)' }),
      el('div', { class: 'goal__txt' },
        el('p', { class: 'goal__state' }, met ? 'Goal met for today' : (goal - n) + ' more to go'),
        el('p', { class: 'tile__txt' }, 'A quiz or scenario answer, a card rating, a reviewed topic or a finished practice problem each count as one action.'))));
    box.appendChild(el('p', { class: 'goal__streak' }, U().icon('flame', 18), el('span', null, tp.streak ? U().plural(tp.streak, 'day') + ' in a row' : 'Start a streak today'), tp.streakBest > 1 ? el('span', { class: 't-muted' }, ' · best ' + tp.streakBest) : null));
    return box;
  }

  function regionCards() {
    const grid = el('div', { class: 'region-grid' });
    (G.manifest.regions || []).forEach((reg) => {
      const worlds = reg.worlds.map(U().worldMeta).filter(Boolean);
      if (!worlds.length) return;
      const st = G.store;
      let done = 0, total = 0;
      worlds.forEach((w) => { const p = st.worldProgress(w.id); done += p.done; total += p.total; });
      const pct = total ? Math.round(done / total * 100) : 0;
      const nextW = worlds.filter((w) => st.worldProgress(w.id).pct < 100)[0] || worlds[0];
      const dots = el('span', { class: 'region__dots', 'aria-hidden': 'true' });
      worlds.forEach((w) => dots.appendChild(el('span', { class: 'region__dot' + (st.worldProgress(w.id).pct === 100 ? ' is-done' : ''), 'data-world': w.id })));
      const a = el('a', { class: 'ui-card ui-card--link region', href: U().worldHref(nextW.id) },
        el('span', { class: 'region__head' }, el('span', { class: 'region__icon' }, U().regionIcon(reg.id, 24)), el('h3', { class: 'region__title' }, reg.label)),
        el('span', { class: 'region__blurb' }, reg.blurb),
        dots,
        U().bar(pct, { cls: 'ui-bar--brand' }),
        el('span', { class: 'region__meta' }, U().plural(worlds.length, 'chapter') + ' · ' + G.fmtMin(sumMinutes(worlds)) + ' · ' + done + '/' + total + ' practice problems'));
      grid.appendChild(a);
    });
    return grid;
  }

  function storyCard() {
    return el('section', { class: 'story', 'aria-labelledby': 'story-h' },
      el('div', { class: 'story__mark', 'aria-hidden': 'true' }, U().icon('quote', 36)),
      el('div', { class: 'story__body' },
        el('p', { class: 'eyebrow' }, 'The idea'),
        el('h2', { id: 'story-h' }, 'One question, every stop'),
        el('p', null, 'A person types a question. That is all you know at the start. It becomes tokens, then a call to a model. Before the model can answer well, the system has to find the right facts, check who may see them and decide which tools to use.'),
        el('p', null, 'At every stop something breaks or forces a choice. The answer is too slow. A reply cites a document the user should never see. An agent loops. A bill arrives.'),
        el('p', null, 'You do not learn these stops as a list of products. You learn them as options. Each practice problem states a problem, leaves the constraints open and asks you to flip the dials: scale, permissions, latency, risk and cost. Then you defend your pick the way you would in an architecture review.')));
  }

  G.views.home = function () {
    const root = el('div', { class: 'view home' });
    const heroSlot = el('div');
    const journey = journeySection();
    const belowSlot = el('div', { class: 'home-below' });
    const tilesSlot = el('div', { class: 'home-tiles' });
    const regionSlot = el('div');
    belowSlot.appendChild(regionSlot);
    belowSlot.appendChild(tilesSlot);

    function paint() {
      G.clear(heroSlot).appendChild(heroSection());
      G.clear(journey.body).appendChild(buildJourney());
      G.clear(regionSlot).appendChild(regionCards());
      G.clear(tilesSlot);
      tilesSlot.appendChild(dueTile());
      tilesSlot.appendChild(goalTile());
    }
    paint();
    root.appendChild(heroSlot);
    root.appendChild(statTiles());
    root.appendChild(journey.el);
    root.appendChild(belowSlot);
    root.appendChild(storyCard());
    const off = subscribeStore(() => {
      const open = document.activeElement && root.contains(document.activeElement);
      if (open && document.activeElement.closest('.journey')) return; // keep focus stable while the learner is on the map
      paint();
    });
    return { el: root, title: null, world: 'home', crumbs: null, destroy: off };
  };

  /* ================================================================
     World overview
     ================================================================ */
  function levelCard(world, lv, index) {
    const status = G.store.levelStatus(lv.id);
    const rec = G.store.get().levels[lv.id];
    const num = el('span', { class: 'lvl__num' }, status === 'done' ? U().icon('check', 20) : String(index + 1));
    const brief = U().plainText(lv.brief);
    return el('li', { class: 'lvl-li' },
      el('a', { class: 'ui-card ui-card--link lvl is-' + status + (lv.kind === 'boss' ? ' is-boss' : ''), href: U().levelHref(world.id, lv.id), 'data-level': lv.id },
        num,
        el('span', { class: 'lvl__body' },
          el('span', { class: 'lvl__top' }, U().kindBadge(lv.kind), U().levelStatusChip(status)),
          el('strong', { class: 'lvl__title' }, lv.title),
          el('span', { class: 'lvl__brief' }, brief),
          el('span', { class: 'lvl__meta' },
            el('span', null, U().icon('clock', 14), lv.minutes + ' min'),
            lv.quizCount ? el('span', null, U().icon('target', 14), U().plural(lv.quizCount, 'quiz item')) : null,
            lv.hasDefend ? el('span', null, U().icon('shield', 14), 'Defend it') : null,
            rec && rec.defend && rec.defend.scored ? el('span', null, U().icon('star', 14), 'Self score ' + rec.defend.score + '/' + rec.defend.max) : null)),
        el('span', { class: 'lvl__go' }, U().icon('chevron-right', 20))));
  }

  G.views.world = function (route) {
    const meta = U().worldMeta(route.params.world);
    if (!meta) return G.views.notfound(route);
    return G.content.load(meta.id).then((world) => {
      const region = U().regionMeta(meta.region);
      const levels = meta.levels.slice().sort((a, b) => a.order - b.order);
      const root = el('div', { class: 'view world', 'data-world': meta.id });

      const header = el('header', { class: 'world-hero' });
      const art = el('div', { class: 'world-hero__art', 'aria-hidden': 'true' }, U().worldIcon(meta.id, 220));
      const progWrap = el('div', { class: 'world-hero__prog' });
      const actionsWrap = el('div', { class: 'world-hero__actions cluster' });
      const topics = U().topicsOf(meta);
      const chips = el('div', { class: 'world-hero__chips' },
        topics.length ? U().chip(U().plural(topics.length, 'topic'), 'on-accent', { icon: 'layers' }) : null,
        topics.length ? U().chip(U().plural(meta.scenarioCount || 0, 'scenario'), 'on-accent', { icon: 'target' }) : null,
        U().chip(U().plural(levels.length, levels.length && levels.every((l) => l.kind === 'boss') ? 'boss round' : 'practice problem'), 'on-accent', { icon: 'flag' }),
        U().chip(G.fmtMin(meta.minutes), 'on-accent', { icon: 'clock' }),
        U().chip(U().plural(meta.flashcardCount, 'card'), 'on-accent', { icon: 'cards' }));
      header.appendChild(art);
      header.appendChild(el('div', { class: 'world-hero__body' },
        el('p', { class: 'world-hero__eyebrow' }, 'Chapter ' + U().worldNo(meta.id) + (region ? ' · ' + region.label : '')),
        el('h1', { class: 'world-hero__title' }, meta.title),
        el('p', { class: 'world-hero__tag' }, meta.tagline),
        chips, progWrap, actionsWrap));
      root.appendChild(header);

      const topicHost = el('div', { class: 'tx-groups' });
      const listHost = el('ol', { class: 'lvl-list', role: 'list', 'aria-label': 'Practice problems' });
      const cardsHost = el('div');

      function paintTopics() {
        G.clear(topicHost);
        let last = null, ul = null;
        topics.forEach((t) => {
          if (t.group !== last) {
            last = t.group;
            const gid = 'wt-g-' + meta.id + '-' + topicHost.children.length;
            ul = el('ul', { class: 'tx-list', role: 'list', 'aria-labelledby': gid });
            topicHost.appendChild(el('div', { class: 'tx-group' }, el('h3', { class: 'tx-group__h', id: gid }, t.group || 'Topics'), ul));
          }
          ul.appendChild(G.topicRow(meta, t).row);
        });
      }

      function paint() {
        const p = G.store.worldProgress(meta.id);
        G.clear(progWrap).appendChild(el('div', { class: 'wprog' },
          U().bar(topics.length ? p.topics.pct : p.pct, { cls: 'ui-bar--thick wprog__bar', label: 'Chapter progress' }),
          el('span', { class: 'wprog__txt' },
            topics.length ? el('b', null, p.topics.reviewed + ' of ' + p.topics.total) : el('b', null, p.pct + '%'),
            topics.length ? ' topics reviewed' : ' done',
            topics.length && p.scenarios.total ? ' · ' + p.scenarios.correct + '/' + p.scenarios.total + ' scenarios best pick' : '',
            ' · ' + p.done + ' of ' + p.total + (topics.length ? ' practice problems done' : ' boss rounds done'))));
        G.clear(actionsWrap);
        const nextTopic = topics.filter((t) => G.store.topicStatus(t.id) !== 'reviewed')[0];
        const anyTopic = topics.some((t) => G.store.topicStatus(t.id) !== 'new');
        if (topics.length) {
          actionsWrap.appendChild(U().btn({
            text: nextTopic ? (anyTopic ? 'Continue: ' + nextTopic.title : 'Start with: ' + topics[0].title) : 'Revisit topic 1',
            icon: 'arrow-right', kind: 'on-accent lg', href: U().topicHref(meta.id, (nextTopic || topics[0]).id)
          }));
          actionsWrap.appendChild(U().btn({ text: 'Cheat sheet', icon: 'list', kind: 'ghost-on-accent lg', href: '#/w/' + meta.id + '/cheatsheet' }));
        } else {
          const nextLv = levels.filter((l) => G.store.levelStatus(l.id) !== 'done')[0] || levels[0];
          const started = levels.some((l) => G.store.levelStatus(l.id) !== 'new');
          if (nextLv) actionsWrap.appendChild(U().btn({ text: p.pct === 100 ? 'Revisit the first boss round' : (started ? 'Continue: ' + nextLv.title : 'Start the first boss round'), icon: 'arrow-right', kind: 'on-accent lg', href: U().levelHref(meta.id, p.pct === 100 ? levels[0].id : nextLv.id) }));
        }
        if (meta.flashcardCount) actionsWrap.appendChild(U().btn({ text: 'Review cards', icon: 'cards', kind: 'ghost-on-accent lg', href: '#/cards/' + meta.id }));
        paintTopics();
        G.clear(listHost);
        levels.forEach((lv, i) => listHost.appendChild(levelCard(meta, lv, i)));
        G.clear(cardsHost).appendChild(cardTile());
      }

      function cardTile() {
        const d = G.store.dueSummary(meta.id);
        const tile = el('div', { class: 'side-card ui-card ui-card--pad' },
          el('h3', { class: 'side-card__title' }, U().icon('cards', 18), 'Flashcards'),
          el('p', { class: 't-2' }, meta.flashcardCount + ' cards in this chapter. ' + (d.due ? d.due + ' due now.' : d.studied ? 'None due right now.' : 'You have not started them yet.')),
          el('div', { class: 'cluster' }, U().btn({ text: d.due ? 'Review ' + d.due + ' due' : 'Review cards', icon: 'cards', kind: 'primary sm', href: '#/cards/' + meta.id })));
        return tile;
      }

      const grid = el('div', { class: 'world-grid' });
      const main = el('div', { class: 'world-main' });
      const side = el('aside', { class: 'world-side', 'aria-label': 'About this chapter' });

      if (topics.length) {
        main.appendChild(el('section', { class: 'world-section world-section--topics', id: 'topics', 'aria-labelledby': 'wt-h' },
          el('div', { class: 'world-section__bar' },
            el('h2', { class: 'world-section__h', id: 'wt-h' }, 'Topics'),
            el('a', { class: 'world-section__link', href: '#/w/' + meta.id + '/cheatsheet' }, U().icon('list', 16), 'Printable cheat sheet')),
          el('p', { class: 't-2 world-section__p' }, 'Each topic opens on its own: what it is, where and when to use it, how it compares, pitfalls and scenario questions with trade-offs. Read them in any order.'),
          topicHost));
      }

      const storyP = el('p', { class: 'world-story' });
      storyP.innerHTML = U().mdInline(world.story || meta.story, {});
      main.appendChild(el('section', { class: 'world-section' },
        el('h2', { class: 'world-section__h' }, 'Where the question is'),
        storyP,
        el('blockquote', { class: 'world-oneliner' }, el('span', { class: 'eyebrow' }, 'In one sentence'), el('p', null, world.oneLiner || meta.oneLiner))));

      if (world.youWillLearn && world.youWillLearn.length) {
        const ul = el('ul', { class: 'learn-list', role: 'list' });
        world.youWillLearn.forEach((t) => { const li = el('li'); li.appendChild(U().icon('check', 18)); const sp = el('span'); sp.innerHTML = U().mdInline(t); li.appendChild(sp); ul.appendChild(li); });
        main.appendChild(el('section', { class: 'world-section' }, el('h2', { class: 'world-section__h' }, 'You will learn'), ul));
      }

      main.appendChild(el('section', { class: 'world-section' },
        el('h2', { class: 'world-section__h' }, levels.length && levels.every((l) => l.kind === 'boss') ? 'Boss rounds' : 'Practice problems'),
        topics.length ? el('p', { class: 't-2 world-section__p' }, 'Optional. Each practice problem applies the topics above to one situation and ends with a defend task or a quiz.') : null,
        listHost));

      const refs = world.references || [];
      if (refs.length) {
        const refList = el('ul', { class: 'ref-list', role: 'list' });
        refs.forEach((r) => refList.appendChild(U().refItem(r)));
        main.appendChild(el('section', { class: 'world-section' },
          el('h2', { class: 'world-section__h' }, 'References'),
          el('p', { class: 't-2 world-section__p' }, 'Each link was checked on the date shown. Open them in a new tab.'),
          refList,
          el('p', null, el('a', { href: '#/library?w=' + meta.id }, 'See these in the reference library'))));
      }

      side.appendChild(cardsHost);
      const labs = (G.labs && G.labs.manifest ? G.labs.manifest : []).filter((l) => l.world === meta.id);
      if (labs.length) {
        const box = el('div', { class: 'side-card ui-card ui-card--pad' }, el('h3', { class: 'side-card__title' }, U().icon('flask', 18), 'Labs in this chapter'));
        labs.forEach((l) => box.appendChild(el('a', { class: 'side-lab', href: '#/labs/' + l.id }, el('strong', null, l.title), el('span', null, l.blurb), el('span', { class: 'side-lab__go' }, 'Open lab', U().icon('arrow-right', 14)))));
        side.appendChild(box);
      }
      const pre = (meta.prereqs || []).map(U().worldMeta).filter(Boolean);
      if (pre.length) {
        const box = el('div', { class: 'side-card ui-card ui-card--pad' }, el('h3', { class: 'side-card__title' }, U().icon('flag', 18), 'Before you start'), el('p', { class: 't-2 t-sm' }, 'These chapters set up ideas this one builds on.'));
        const ul = el('ul', { class: 'pre-list', role: 'list' });
        pre.forEach((w) => {
          const pp = G.store.worldProgress(w.id);
          ul.appendChild(el('li', null, el('a', { href: U().worldHref(w.id), 'data-world': w.id }, el('span', { class: 'ui-dot' }), el('span', { class: 'pre-list__t' }, 'Chapter ' + U().worldNo(w.id) + ': ' + w.short), pp.pct === 100 ? U().chip('Done', 'ok', { icon: 'check' }) : el('span', { class: 't-muted t-xs' }, (pp.topics.total ? pp.topics.pct : pp.pct) + '%'))));
        });
        box.appendChild(ul);
        side.appendChild(box);
      }
      const gl = (world.glossary || []).length;
      if (gl) side.appendChild(el('div', { class: 'side-card ui-card ui-card--pad' }, el('h3', { class: 'side-card__title' }, U().icon('list', 18), 'Glossary'), el('p', { class: 't-2 t-sm' }, gl + ' terms are defined for this chapter.'), el('a', { href: '#/glossary?w=' + meta.id }, 'Open the glossary')));

      grid.appendChild(main);
      grid.appendChild(side);
      root.appendChild(grid);
      paint();
      const off = subscribeStore(paint);
      return {
        el: root, title: 'Chapter ' + U().worldNo(meta.id) + ': ' + meta.title, world: meta.id, destroy: off,
        crumbs: [{ label: topics.length ? 'Topics' : 'Journey', href: topics.length ? '#/topics' : '#/' }, { label: 'Chapter ' + U().worldNo(meta.id) + ': ' + (meta.short || meta.title) }]
      };
    });
  };

  /* ================================================================
     Level view
     ================================================================ */
  function placeholderLevel(world, level) {
    const ctx = { refs: {} };
    (world.references || []).forEach((r) => { ctx.refs[r.id] = r; });
    const art = el('article', { class: 'level-fallback' });
    const toc = [];
    art.appendChild(el('div', { class: 'ui-card ui-card--pad level-fallback__note', role: 'note' },
      el('strong', null, 'Renderer not loaded. '),
      'The practice problem renderer (render.js) is not available, so this is a plain preview of its content.'));
    const brief = el('p', { class: 'lead' }); brief.innerHTML = U().mdInline(level.brief, ctx); art.appendChild(brief);
    (level.blocks || []).forEach((b) => {
      if (b.t === 'h') {
        const h = el(b.level === 3 ? 'h3' : 'h2', { id: b.id }, b.text);
        toc.push({ id: b.id, text: b.text, level: b.level === 3 ? 3 : 2 });
        art.appendChild(h);
      } else if (b.t === 'p') {
        const p = el('p'); p.innerHTML = U().mdInline(b.md, ctx); art.appendChild(p);
      } else {
        art.appendChild(el('div', { class: 'ui-card ui-card--pad level-fallback__block' }, el('code', null, b.t), ' ' + (b.title || b.id || '')));
      }
    });
    art.appendChild(el('p', { class: 't-muted' }, U().plural((level.quiz || []).length, 'quiz item') + (level.defend ? ' and a defend task' : '') + ' in this practice problem.'));
    art.appendChild(el('div', { class: 'cluster' }, U().btn({
      text: 'Mark as done', icon: 'check', kind: 'primary',
      onClick: () => { G.store.touchLevel(level.id); G.store.completeLevel(level.id, world.id); }
    })));
    return { el: art, toc: toc };
  }

  G.views.level = function (route) {
    const levelId = route.params.level;
    const found = G.content.findLevelMeta(levelId);
    if (!found || found.world.id !== route.params.world) return G.views.notfound(route);
    return G.content.load(found.world.id).then((world) => {
      const level = (world.levels || []).filter((l) => l.id === levelId)[0];
      if (!level) return G.views.notfound(route);
      const meta = found.world;
      const region = U().regionMeta(meta.region);
      const levels = meta.levels.slice().sort((a, b) => a.order - b.order);
      const idx = levels.findIndex((l) => l.id === levelId);
      const flat = U().flatLevels();
      const gi = flat.findIndex((x) => x.level.id === levelId);
      const nb = (x) => x ? { title: (x.world.id !== meta.id ? x.world.short + ': ' : '') + x.level.title, href: U().levelHref(x.world.id, x.level.id), world: x.world.id, kind: x.level.kind } : null;
      const opts = { prev: nb(flat[gi - 1]), next: nb(flat[gi + 1]), index: idx + 1, count: levels.length };

      const root = el('div', { class: 'view level', 'data-world': meta.id });
      const statusHost = el('span', { class: 'level-head__status' });
      const bmBtn = el('button', { class: 'ui-btn ui-btn--sm', type: 'button', 'aria-pressed': 'false', on: { click: () => { G.store.toggleBookmark(levelId); paintBm(); } } });
      const printBtn = el('button', { class: 'ui-btn ui-btn--sm', type: 'button', on: { click: () => window.print() } }, U().icon('print', 16), 'Print');
      function paintBm() {
        const on = G.store.isBookmarked(levelId);
        bmBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
        G.clear(bmBtn).appendChild(U().icon(on ? 'bookmark-fill' : 'bookmark', 16));
        bmBtn.appendChild(document.createTextNode(on ? 'Bookmarked' : 'Bookmark'));
      }
      function paintStatus() { G.clear(statusHost).appendChild(U().levelStatusChip(G.store.levelStatus(levelId))); }
      paintBm(); paintStatus();

      const tocSlot = el('div', { class: 'toc-slot' });
      root.appendChild(el('header', { class: 'level-head' },
        el('div', { class: 'level-head__top' },
          U().kindBadge(level.kind),
          el('span', { class: 'level-head__pos' }, 'Chapter ' + U().worldNo(meta.id) + ' · ' + (level.kind === 'boss' ? 'Boss round' : 'Practice problem') + ' ' + (idx + 1) + ' of ' + levels.length),
          U().chip(level.minutes + ' min', null, { icon: 'clock' }),
          U().chip('+50 XP', 'gold', { icon: 'star', title: 'XP for completing this practice problem' }),
          statusHost),
        el('h1', { class: 'level-head__title' }, level.title),
        el('div', { class: 'level-head__actions cluster' }, bmBtn, printBtn)));
      root.appendChild(el('p', { class: 'print-only print-head' }, 'Follow the Question · Chapter ' + U().worldNo(meta.id) + ': ' + meta.title + ' · ' + level.title));
      root.appendChild(tocSlot);

      let result = null;
      try {
        if (G.render && G.render.levelPage) result = G.render.levelPage(world, level, opts);
      } catch (err) {
        console.error(err);
        result = null;
        root.appendChild(el('div', { class: 'ui-card ui-card--pad level-error', role: 'alert' }, el('strong', null, 'This practice problem could not be rendered. '), err && err.message ? err.message : String(err)));
      }
      if (!result || !result.el) result = placeholderLevel(world, level);
      root.appendChild(el('div', { class: 'level-body' }, result.el));
      paintStatus(); paintBm();

      const off = subscribeStore(() => { paintStatus(); paintBm(); });
      const toc = Array.isArray(result.toc) ? result.toc : [];
      return {
        el: root, title: level.title + ' (Chapter ' + U().worldNo(meta.id) + ')', world: meta.id, toc: toc, tocSlot: tocSlot,
        crumbs: [{ label: 'Journey', href: '#/' }, region ? { label: region.label, href: '#/' } : null, { label: meta.short || meta.title, href: U().worldHref(meta.id) }, { label: level.title }].filter(Boolean),
        destroy: () => { off(); if (result && typeof result.destroy === 'function') result.destroy(); }
      };
    });
  };
})();
