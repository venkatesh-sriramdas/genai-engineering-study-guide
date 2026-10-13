/* Follow the Question: progress dashboard and the flashcard review page. Owner: E1.
   Registers Guide.views.progress and Guide.views.cards. */
(function () {
  'use strict';

  const G = window.Guide;
  const el = G.el;
  const U = () => G.ui;
  const NS = 'http://www.w3.org/2000/svg';
  G.views = G.views || {};

  const TAGS = ['concept', 'diagnose', 'flip', 'bug', 'numeric', 'tradeoff', 'security', 'order'];
  const TAG_LABEL = { concept: 'Concept', diagnose: 'Diagnose', flip: 'Flip the dial', bug: 'Bug hunt', numeric: 'Numeric', tradeoff: 'Trade-off', security: 'Security', order: 'Order' };
  const BOX_HINT = ['Again, same day', 'Next day', 'In 3 days', 'In 7 days', 'In 21 days'];

  function svg(tag, attrs, text) {
    const n = document.createElementNS(NS, tag);
    if (attrs) Object.keys(attrs).forEach((k) => { if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]); });
    if (text !== undefined) n.textContent = text;
    return n;
  }
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const levelOfItem = (id) => { const m = /^(.+)-q\d+$/.exec(id); return m ? m[1] : ''; };
  const SCEN = /^(w\d+-t\d+)-s\d+$/;

  /* ---------- statistics ---------- */
  function quizStats(tagMap) {
    const q = G.store.get().quiz;
    const out = { answered: 0, firstTry: 0, correct: 0, byTag: {}, byWorld: {}, byLevel: {}, missingTags: [], scen: { n: 0, first: 0, ok: 0, partial: 0, byTopic: {}, byWorld: {} } };
    Object.keys(q).forEach((id) => {
      const r = q[id];
      const w = r.w || id.split('-')[0];
      const sm = SCEN.exec(id);
      if (sm) {
        const s = out.scen;
        const bump = (map, key) => { const m = (map[key] = map[key] || { n: 0, first: 0, ok: 0, partial: 0 }); m.n++; if (r.firstCorrect) m.first++; if (r.correct) m.ok++; else if (r.partial) m.partial++; };
        s.n++; if (r.firstCorrect) s.first++; if (r.correct) s.ok++; else if (r.partial) s.partial++;
        bump(s.byTopic, sm[1]); bump(s.byWorld, w);
        return;
      }
      const l = r.l || levelOfItem(id);
      const tag = r.tag || tagMap[id] || '';
      out.answered++;
      if (r.firstCorrect) out.firstTry++;
      if (r.correct) out.correct++;
      const add = (map, key) => {
        if (!key) return;
        const m = (map[key] = map[key] || { n: 0, first: 0, ok: 0 });
        m.n++; if (r.firstCorrect) m.first++; if (r.correct) m.ok++;
      };
      add(out.byWorld, w); add(out.byLevel, l); add(out.byTag, tag);
      if (!tag) out.missingTags.push(w);
    });
    return out;
  }

  function radar(values) {
    const size = 320, c = size / 2, R = 104;
    const n = TAGS.length;
    const ang = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const pt = (i, r) => [c + r * Math.cos(ang(i)), c + r * Math.sin(ang(i))];
    const root = svg('svg', { class: 'radar', viewBox: '0 0 ' + size + ' ' + size, role: 'img', 'aria-label': 'Radar chart of first-try accuracy by quiz tag. The list beside it gives the same numbers.' });
    [25, 50, 75, 100].forEach((p) => {
      root.appendChild(svg('polygon', { class: 'radar__ring', points: TAGS.map((_, i) => pt(i, (R * p) / 100).join(',')).join(' ') }));
    });
    TAGS.forEach((t, i) => {
      const [x, y] = pt(i, R);
      root.appendChild(svg('line', { class: 'radar__axis', x1: c, y1: c, x2: x, y2: y }));
      const [lx, ly] = pt(i, R + 20);
      const a = ang(i);
      const anchor = Math.abs(Math.cos(a)) < 0.2 ? 'middle' : Math.cos(a) > 0 ? 'start' : 'end';
      root.appendChild(svg('text', { class: 'radar__lbl', x: lx, y: ly + (Math.sin(a) > 0.5 ? 8 : Math.sin(a) < -0.5 ? -2 : 4), 'text-anchor': anchor }, TAG_LABEL[t]));
    });
    root.appendChild(svg('polygon', { class: 'radar__shape', points: TAGS.map((t, i) => pt(i, (R * (values[t] == null ? 0 : values[t])) / 100).join(',')).join(' ') }));
    TAGS.forEach((t, i) => {
      if (values[t] == null) return;
      const [x, y] = pt(i, (R * values[t]) / 100);
      root.appendChild(svg('circle', { class: 'radar__dot', cx: x, cy: y, r: 4 }));
    });
    [50, 100].forEach((p) => root.appendChild(svg('text', { class: 'radar__tick', x: c + 4, y: c - (R * p) / 100 + 11 }, p + '%')));
    return root;
  }

  /* ================================================================
     Progress dashboard
     ================================================================ */
  G.views.progress = function (route) {
    const root = el('div', { class: 'view dash' });
    const tagMap = {};
    const subs = [];

    const nameHead = el('h1', { class: 'dash-title' });
    const topHost = el('div', { class: 'dash-top' });
    const masteryHost = el('div');
    const tagHost = el('div');
    const boxHost = el('div');
    const weakHost = el('div');
    const recentHost = el('div');

    const sec = (id, title, intro, ...kids) => el('section', { class: 'dash-sec', id: id, 'aria-labelledby': id + '-h' },
      el('h2', { class: 'dash-sec__h', id: id + '-h' }, title), intro ? el('p', { class: 't-2 dash-sec__p' }, intro) : null, ...kids);

    function paintHead() {
      const nm = G.store.get().learner.name;
      nameHead.textContent = nm ? nm + '\'s progress' : 'Your progress';
    }

    /* ----- top cards ----- */
    function paintTop() {
      const st = G.store.get();
      const tp = G.store.totalProgress();
      const qs = quizStats(tagMap);
      const span = Math.max(1, tp.nextLevelXp - tp.floorXp);
      const into = tp.xp - tp.floorXp;
      G.clear(topHost);
      topHost.appendChild(el('div', { class: 'ui-card dash-card dash-card--rank' },
        el('p', { class: 'eyebrow' }, 'Rank'),
        el('p', { class: 'rank__name' }, tp.rank, el('span', { class: 'rank__lvl' }, 'Level ' + tp.level)),
        el('p', { class: 'rank__xp' }, el('b', null, U().fmtNum(tp.xp)), ' XP'),
        U().bar(pct(into, span), { cls: 'ui-bar--brand ui-bar--thick', label: 'Progress to the next rank' }),
        el('p', { class: 'rank__next' }, (tp.nextLevelXp - tp.xp) + ' XP to ' + tp.nextRank + ' at ' + U().fmtNum(tp.nextLevelXp) + ' XP')));
      topHost.appendChild(el('div', { class: 'ui-card dash-card dash-card--streak' },
        el('p', { class: 'eyebrow' }, 'Streak'),
        el('p', { class: 'streak__big' }, U().icon('flame', 34), el('b', null, String(tp.streak)), el('span', null, tp.streak === 1 ? 'day' : 'days')),
        el('p', { class: 't-2 t-sm' }, tp.streak ? 'Keep it going with one action today.' : 'Answer a quiz item or rate a card to start a streak.'),
        el('p', { class: 't-muted t-xs' }, 'Best streak: ' + U().plural(tp.streakBest, 'day') + ' · Today: ' + G.store.todayCount() + ' of ' + st.settings.dailyGoal + ' actions')));
      topHost.appendChild(el('div', { class: 'ui-card dash-card dash-card--ring' },
        el('p', { class: 'eyebrow' }, 'Topics reviewed'),
        el('div', { class: 'ringrow' }, U().ring({ pct: tp.topicsPct, size: 92, stroke: 9, text: tp.topicsPct + '%', fontSize: 20, label: tp.topicsReviewed + ' of ' + tp.topicsTotal + ' topics reviewed', color: 'var(--brand-1)' }),
          el('p', { class: 'ringrow__txt' }, el('b', null, String(tp.topicsReviewed)), ' of ' + tp.topicsTotal + ' topics')),
        el('p', { class: 't-muted t-xs' }, tp.levelsDone + ' of ' + tp.levelsTotal + ' practice problems done')));
      const acc = pct(qs.firstTry, qs.answered);
      const sc = qs.scen;
      topHost.appendChild(el('div', { class: 'ui-card dash-card dash-card--ring' },
        el('p', { class: 'eyebrow' }, 'First-try accuracy'),
        el('div', { class: 'ringrow' }, U().ring({ pct: acc, size: 92, stroke: 9, text: qs.answered ? acc + '%' : '-', fontSize: 20, label: qs.answered ? acc + ' percent correct on the first try' : 'No quiz items answered yet', color: 'var(--ok)' }),
          el('p', { class: 'ringrow__txt' }, qs.answered ? el('span', null, el('b', null, String(qs.firstTry)), ' of ' + qs.answered + ' right first time') : 'Answer quiz items to see this.')),
        el('p', { class: 't-muted t-xs' }, sc.n ? 'Scenarios: ' + sc.first + ' of ' + sc.n + ' best pick on the first try' : 'No scenario questions answered yet')));
    }

    /* ----- mastery by chapter ----- */
    function paintMastery() {
      const qs = quizStats(tagMap);
      const list = el('ul', { class: 'mastery', role: 'list' });
      U().worlds().forEach((w) => {
        const p = G.store.worldProgress(w.id);
        const q = qs.byWorld[w.id];
        const s = qs.scen.byWorld[w.id];
        const hasTopics = p.topics.total > 0;
        const a = el('a', { class: 'mastery__row', href: U().worldHref(w.id), 'data-world': w.id },
          el('span', { class: 'mastery__name' }, el('span', { class: 'ui-dot' }), el('span', { class: 'mastery__no' }, U().worldNo(w.id)), el('span', { class: 'mastery__t' }, w.short || w.title)),
          el('span', { class: 'mastery__bars' },
            U().bar(hasTopics ? p.topics.pct : p.pct, { cls: (hasTopics ? p.topics.pct : p.pct) === 100 ? 'ui-bar--ok' : '', label: w.short + (hasTopics ? ' topics reviewed' : ' boss rounds done') }),
            U().bar(hasTopics ? pct(p.scenarios.correct, p.scenarios.total) : pct(p.quizCorrect, p.quizTotal), { cls: 'ui-bar--thin ui-bar--brand' })),
          el('span', { class: 'mastery__stats' },
            el('span', null, hasTopics ? p.topics.reviewed + '/' + p.topics.total + ' topics · ' + p.done + '/' + p.total + ' practice' : p.done + '/' + p.total + ' boss rounds'),
            el('span', { class: 't-muted' }, hasTopics
              ? (s && s.n ? s.first + '/' + s.n + ' scenarios first try' : 'No scenarios yet')
              : (p.quizTotal ? p.quizCorrect + '/' + p.quizTotal + ' quiz' + (q && q.n ? ' · ' + pct(q.first, q.n) + '% first try' : '') : 'No quiz'))));
        list.appendChild(el('li', null, a));
      });
      G.clear(masteryHost).appendChild(list);
    }

    /* ----- accuracy by tag ----- */
    function paintTags() {
      const qs = quizStats(tagMap);
      const values = {};
      let have = 0;
      TAGS.forEach((t) => { const m = qs.byTag[t]; if (m && m.n) { values[t] = pct(m.first, m.n); have++; } });
      const list = el('ul', { class: 'tagacc', role: 'list' });
      TAGS.forEach((t) => {
        const m = qs.byTag[t];
        list.appendChild(el('li', { class: 'tagacc__row' },
          el('span', { class: 'tagacc__lbl' }, TAG_LABEL[t]),
          U().bar(m && m.n ? pct(m.first, m.n) : 0, { cls: 'ui-bar--thin ui-bar--brand' }),
          el('span', { class: 'tagacc__v' }, m && m.n ? pct(m.first, m.n) + '% · ' + m.n + ' answered' : 'No data yet')));
      });
      G.clear(tagHost);
      const body = el('div', { class: 'tagacc-wrap' });
      if (have >= 3) body.appendChild(el('div', { class: 'tagacc__chart' }, radar(values)));
      body.appendChild(list);
      tagHost.appendChild(body);
      if (have < 3) tagHost.appendChild(el('p', { class: 't-muted t-sm' }, 'The radar chart appears once you have answered items in three or more quiz tags.'));
      const unresolved = qs.missingTags.length;
      if (unresolved) tagHost.appendChild(el('p', { class: 't-muted t-xs' }, 'Reading tags for ' + unresolved + ' earlier answers.'));
    }

    /* ----- flashcard boxes ----- */
    function paintBoxes() {
      const d = G.store.dueSummary();
      const total = Math.max(1, d.total);
      const rows = el('ul', { class: 'boxrows', role: 'list' });
      const add = (label, hint, n, cls) => rows.appendChild(el('li', { class: 'boxrow' },
        el('span', { class: 'boxrow__lbl' }, label, el('small', null, hint)),
        el('span', { class: 'boxrow__bar' }, U().bar(pct(n, total), { cls: 'ui-bar--thick ' + (cls || '') })),
        el('span', { class: 'boxrow__n' }, U().fmtNum(n))));
      add('New', 'Not studied yet', d.fresh, '');
      d.boxes.forEach((n, i) => add('Box ' + (i + 1), BOX_HINT[i], n, 'ui-bar--brand'));
      G.clear(boxHost);
      boxHost.appendChild(rows);
      boxHost.appendChild(el('div', { class: 'cluster boxes-actions' },
        el('p', { class: 'boxes-due' }, el('b', null, String(d.due)), d.due === 1 ? ' card due now' : ' cards due now'),
        d.total ? U().btn({ text: d.due ? 'Review due cards' : (d.fresh ? 'Learn new cards' : 'Study ahead'), icon: 'cards', kind: 'primary sm', href: '#/cards' }) : null));
    }

    /* ----- weak topics (by scenario accuracy) and weak chapters (by quiz accuracy) ----- */
    function paintWeak() {
      const qs = quizStats(tagMap);
      G.clear(weakHost);
      const topicRows = [];
      Object.keys(qs.scen.byTopic).forEach((id) => {
        const m = qs.scen.byTopic[id];
        const f = U().findTopic(id);
        if (!f || m.n < 1) return;
        const acc = (m.first + m.partial * 0.5) / m.n;
        if (m.first < m.n) topicRows.push({ f: f, m: m, acc: acc });
      });
      topicRows.sort((a, b) => a.acc - b.acc || b.m.n - a.m.n);
      const rows = [];
      Object.keys(qs.byWorld).forEach((id) => {
        const m = qs.byWorld[id];
        if (m.n >= 3 && U().worldMeta(id)) rows.push({ id: id, m: m, acc: m.first / m.n });
      });
      rows.sort((a, b) => a.acc - b.acc);
      const weak = rows.filter((r) => r.acc < 0.8).slice(0, 3);

      weakHost.appendChild(el('h3', { class: 'weak__sub' }, 'Topics to revisit'));
      if (!Object.keys(qs.scen.byTopic).length) {
        weakHost.appendChild(el('p', { class: 't-2' }, 'Answer scenario questions inside a topic and the topics where your pick missed the best option show up here.'));
      } else if (!topicRows.length) {
        weakHost.appendChild(el('p', { class: 't-2' }, 'Every scenario you have answered was a best pick on the first try. Keep going.'));
      } else {
        const ul = el('ul', { class: 'weak', role: 'list' });
        topicRows.slice(0, 5).forEach((r) => {
          const w = r.f.world;
          ul.appendChild(el('li', { class: 'weak__row', 'data-world': w.id },
            el('div', { class: 'weak__main' },
              el('a', { class: 'weak__t', href: U().topicHref(w.id, r.f.topic.id) }, el('span', { class: 'ui-dot' }), r.f.topic.title),
              el('span', { class: 'weak__d' }, 'Chapter ' + U().worldNo(w.id) + ': ' + (w.short || w.title) + ' · ' + r.m.first + ' of ' + r.m.n + ' scenarios best on the first try' + (r.m.partial ? ', ' + r.m.partial + ' good but not best' : ''))),
            U().btn({ text: 'Practise', icon: 'arrow-right', kind: 'sm', href: U().topicHref(w.id, r.f.topic.id, 'sec-scenarios') })));
        });
        weakHost.appendChild(ul);
      }

      if (weak.length) {
        weakHost.appendChild(el('h3', { class: 'weak__sub' }, 'Chapters with the most quiz retries'));
        const ul = el('ul', { class: 'weak', role: 'list' });
        weak.forEach((r) => {
          const w = U().worldMeta(r.id);
          let worst = null;
          w.levels.forEach((l) => { const m = qs.byLevel[l.id]; if (m && m.n && (!worst || m.first / m.n < worst.acc)) worst = { l: l, acc: m.first / m.n }; });
          const target = worst ? U().levelHref(w.id, worst.l.id) : U().worldHref(w.id);
          ul.appendChild(el('li', { class: 'weak__row', 'data-world': w.id },
            el('div', { class: 'weak__main' },
              el('a', { class: 'weak__t', href: U().worldHref(w.id) }, el('span', { class: 'ui-dot' }), 'Chapter ' + U().worldNo(w.id) + ': ' + (w.short || w.title)),
              el('span', { class: 'weak__d' }, Math.round(r.acc * 100) + '% first try. ' + (r.m.n - r.m.first) + ' of ' + r.m.n + ' needed a retry.' + (worst ? ' Weakest practice problem: ' + worst.l.title : ''))),
            U().btn({ text: 'Practise', icon: 'arrow-right', kind: 'sm', href: target })));
        });
        weakHost.appendChild(ul);
      }
    }

    /* ----- recent activity ----- */
    function paintRecent() {
      const h = G.store.get().history.slice(-8).reverse();
      G.clear(recentHost);
      if (!h.length) { recentHost.appendChild(el('p', { class: 't-2' }, 'Nothing yet. Open a topic, answer a scenario or mark a topic as reviewed to start your log.')); return; }
      const ul = el('ul', { class: 'recent', role: 'list' });
      h.forEach((e) => {
        let text = '', sub = '', ic = 'check', href = '#/', cls = '';
        if (e.type === 'quiz') {
          const sm = SCEN.exec(e.id);
          const tm = /^(w\d+-t\d+)-q\d+$/.exec(e.id);
          const tf = U().findTopic(sm ? sm[1] : tm ? tm[1] : '');
          if (tf) {
            text = sm ? (e.ok ? 'Picked the best option in a scenario' : 'Scenario pick that was not the best') : (e.ok ? 'Answered a topic quick check correctly' : 'Missed a topic quick check');
            sub = tf.topic.title; ic = e.ok ? 'check' : 'cross'; cls = e.ok ? 'is-ok' : 'is-bad';
            href = U().topicHref(tf.world.id, tf.topic.id, sm ? 'sec-scenarios' : 'sec-check');
          } else {
            const lid = levelOfItem(e.id);
            const f = G.content.findLevelMeta(lid);
            text = e.ok ? 'Answered a quiz item correctly' : 'Missed a quiz item';
            sub = f ? f.level.title : e.id; ic = e.ok ? 'check' : 'cross'; cls = e.ok ? 'is-ok' : 'is-bad';
            href = f ? U().levelHref(f.world.id, f.level.id) : '#/';
          }
        } else if (e.type === 'topic') {
          const tf = U().findTopic(e.id);
          text = 'Reviewed a topic'; sub = tf ? tf.topic.title : e.id; ic = 'layers'; cls = 'is-gold';
          href = tf ? U().topicHref(tf.world.id, tf.topic.id) : '#/topics';
        } else if (e.type === 'card') {
          text = e.ok ? 'Rated a flashcard Good or Easy' : 'Rated a flashcard Again or Hard';
          sub = 'Chapter ' + U().worldNo(e.id.split('-')[0]); ic = 'cards'; cls = e.ok ? 'is-ok' : '';
          href = '#/cards/' + e.id.split('-')[0];
        } else if (e.type === 'level') {
          const f = G.content.findLevelMeta(e.id);
          text = 'Completed a practice problem'; sub = f ? f.level.title : e.id; ic = 'trophy'; cls = 'is-gold';
          href = f ? U().levelHref(f.world.id, f.level.id) : '#/';
        } else if (e.type === 'defend') {
          const f = G.content.findLevelMeta(e.id);
          text = 'Saved a defend self score'; sub = f ? f.level.title : e.id; ic = 'shield';
          href = f ? U().levelHref(f.world.id, f.level.id) : '#/';
        } else { text = e.type; sub = e.id; }
        ul.appendChild(el('li', { class: 'recent__row ' + cls },
          el('span', { class: 'recent__ic' }, U().icon(ic, 16)),
          el('a', { class: 'recent__txt', href: href }, el('strong', null, text), el('span', null, sub)),
          el('span', { class: 'recent__t' }, U().fmtAgo(e.ts))));
      });
      recentHost.appendChild(ul);
    }

    function paintAll() { paintHead(); paintTop(); paintMastery(); paintTags(); paintBoxes(); paintWeak(); paintRecent(); }

    /* ----- export and import ----- */
    const result = el('div', { class: 'imp-result', 'aria-live': 'polite' });
    const previewHost = el('div');
    const fileInput = el('input', { type: 'file', accept: '.json,application/json', class: 'sr-only', id: 'imp-file', tabindex: '-1', 'aria-label': 'Choose a progress file to import' });
    const drop = el('div', { class: 'dropzone', role: 'button', tabindex: '0' },
      U().icon('upload', 28), el('strong', null, 'Drop a progress file here'), el('span', null, 'or press Enter to choose one. Files exported from this guide end in .json.'));
    drop.addEventListener('click', () => fileInput.click());
    drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
    fileInput.addEventListener('change', () => { if (fileInput.files && fileInput.files[0]) readFile(fileInput.files[0]); fileInput.value = ''; });

    function showError(msg) {
      G.clear(result);
      G.clear(previewHost);
      result.appendChild(el('div', { class: 'banner banner--warn imp-error', role: 'alert' }, U().icon('warn', 20), el('p', { class: 'banner__txt' }, msg)));
    }

    function readFile(file) {
      G.clear(result);
      if (file.size > 8 * 1024 * 1024) { showError('This file is larger than 8 MB, so it is not a progress export.'); return; }
      const read = file.text ? file.text() : new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(fr.error); fr.readAsText(file); });
      read.then((text) => preview(text, file.name)).catch(() => showError('The file could not be read.'));
    }

    function preview(text, fileName) {
      const pv = G.store.previewImport(text);
      if (!pv.ok) { showError(pv.error); return; }
      G.clear(result); G.clear(previewHost);
      const mode = { v: 'merge' };
      const cols = [
        ['Learner', (s) => s.name || '(no name)'], ['XP', (s) => U().fmtNum(s.xp)], ['Topics reviewed', (s) => String(s.topicsReviewed || 0)], ['Practice problems done', (s) => String(s.levelsDone)],
        ['Quiz items answered', (s) => String(s.quizAnswered)], ['Flashcards tracked', (s) => String(s.cards)], ['Bookmarks', (s) => String(s.bookmarks)], ['Streak (days)', (s) => String(s.streak)]
      ];
      const afterHead = el('th', { scope: 'col' }, 'After merge');
      const tbody = el('tbody');
      const rows = cols.map((c) => {
        const after = el('td', { class: 'imp-after' });
        const tr = el('tr', null, el('th', { scope: 'row' }, c[0]), el('td', null, c[1](pv.current)), el('td', null, c[1](pv.incoming)), after);
        tbody.appendChild(tr);
        return { c: c, after: after };
      });
      const chg = pv.changes;
      const bits = [];
      if (chg.topicsNew) bits.push(U().plural(chg.topicsNew, 'new topic record'));
      if (chg.topicsUpgraded) bits.push(U().plural(chg.topicsUpgraded, 'topic') + ' marked reviewed');
      if (chg.levelsNew) bits.push(U().plural(chg.levelsNew, 'new practice problem'));
      if (chg.levelsUpgraded) bits.push(U().plural(chg.levelsUpgraded, 'practice problem') + ' marked done');
      if (chg.quizNew) bits.push(U().plural(chg.quizNew, 'new quiz record'));
      if (chg.quizImproved) bits.push(U().plural(chg.quizImproved, 'quiz record') + ' improved');
      if (chg.cardsNew) bits.push(U().plural(chg.cardsNew, 'new card'));
      if (chg.cardsNewer) bits.push(U().plural(chg.cardsNewer, 'card') + ' with newer reviews');
      if (chg.bookmarksNew) bits.push(U().plural(chg.bookmarksNew, 'bookmark'));
      const mergeRadio = el('input', { type: 'radio', name: 'imp-mode', value: 'merge', checked: true });
      const replaceRadio = el('input', { type: 'radio', name: 'imp-mode', value: 'replace' });
      const paintAfter = () => {
        afterHead.textContent = mode.v === 'merge' ? 'After merge' : 'After replace';
        rows.forEach((r) => { r.after.textContent = r.c[1](mode.v === 'merge' ? pv.merged : pv.incoming); });
      };
      mergeRadio.addEventListener('change', () => { mode.v = 'merge'; paintAfter(); });
      replaceRadio.addEventListener('change', () => { mode.v = 'replace'; paintAfter(); });
      paintAfter();
      const apply = U().btn({
        text: 'Apply import', icon: 'check', kind: 'primary',
        onClick: () => {
          const run = () => {
            const r = G.store.importJSON(text, mode.v);
            if (!r.ok) { showError(r.error); return; }
            G.clear(previewHost); G.clear(result);
            G.shell.toast(r.mode === 'merge' ? 'Progress merged. Your XP is now ' + U().fmtNum(r.after.xp) + '.' : 'Progress replaced with the file.', { kind: 'ok', icon: 'upload' });
          };
          if (mode.v === 'replace') {
            U().confirm({ title: 'Replace all progress?', message: 'This removes the progress now stored in this browser and uses the file instead. Export first if you want a copy.', confirmText: 'Replace progress', danger: true }).then((ok) => { if (ok) run(); });
          } else run();
        }
      });
      const cancel = U().btn({ text: 'Cancel', onClick: () => { G.clear(previewHost); drop.focus(); } });
      previewHost.appendChild(el('div', { class: 'ui-card ui-card--pad imp', role: 'region', 'aria-label': 'Import preview' },
        el('h3', { class: 'imp__h' }, 'Import preview'),
        el('p', { class: 't-2 t-sm' }, fileName + (pv.exportedAt ? ' · exported ' + U().fmtDate(pv.exportedAt) : '')),
        el('div', { class: 'table-wrap' }, el('table', { class: 'imp-table' }, el('thead', null, el('tr', null, el('th', { scope: 'col' }, ''), el('th', { scope: 'col' }, 'This browser now'), el('th', { scope: 'col' }, 'In the file'), afterHead)), tbody)),
        el('p', { class: 'imp__chg' }, bits.length ? 'Merging would add: ' + bits.join(', ') + '.' : 'Merging would not change anything. This browser already has everything in the file.'),
        el('fieldset', { class: 'imp-mode' },
          el('legend', null, 'How should it be imported?'),
          el('label', { class: 'imp-opt' }, mergeRadio, el('span', null, el('strong', null, 'Merge'), ' (recommended). Keep the best of both. Higher XP, reviewed topics, finished practice problems, better quiz results and newer card reviews win.')),
          el('label', { class: 'imp-opt' }, replaceRadio, el('span', null, el('strong', null, 'Replace'), '. Discard what is in this browser and use the file.'))),
        el('div', { class: 'cluster' }, apply, cancel)));
      apply.focus();
    }

    const onDragOver = (e) => { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) { e.preventDefault(); drop.classList.add('is-over'); } };
    const onDragLeave = (e) => { if (!e.relatedTarget) drop.classList.remove('is-over'); };
    const onDrop = (e) => {
      if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
      e.preventDefault();
      drop.classList.remove('is-over');
      readFile(e.dataTransfer.files[0]);
    };
    document.addEventListener('dragover', onDragOver);
    document.addEventListener('dragleave', onDragLeave);
    document.addEventListener('drop', onDrop);

    /* ----- settings and reset ----- */
    const settings = G.shell.buildSettings();
    const resetBtn = U().btn({
      text: 'Reset progress', icon: 'trash', kind: 'danger',
      onClick: () => U().confirm({
        title: 'Reset all progress?',
        message: 'This deletes XP, streak, quiz history, flashcard schedule, bookmarks and notes from this browser. Your name and settings stay. It cannot be undone.',
        confirmText: 'Reset progress', danger: true
      }).then((ok) => { if (ok) { G.store.reset(); G.shell.toast('Progress was reset.', { icon: 'trash' }); } })
    });

    root.appendChild(el('header', { class: 'view-head', id: 'overview' }, el('p', { class: 'eyebrow' }, 'Dashboard'), nameHead,
      el('p', { class: 'lead view-head__lead' }, 'Your XP, streak and mastery live in this browser. Export a file to back them up or to move them to another device.')));
    const tocSlot = el('div', { class: 'toc-slot' });
    root.appendChild(tocSlot);
    root.appendChild(topHost);
    root.appendChild(sec('mastery', 'Mastery by chapter', 'The thick bar is topics reviewed. The thin bar is scenarios answered with the best option (quiz items for chapters without topics). Select a row to open the chapter.', masteryHost));
    root.appendChild(el('div', { class: 'dash-cols' },
      sec('quiz-tags', 'Accuracy by quiz tag', 'Share of items you got right on the first try, grouped by the kind of skill each item tests.', tagHost),
      sec('cards-boxes', 'Flashcard boxes', 'Cards move up a box when you rate them Good or Easy. A higher box means a longer wait before the next review.', boxHost)));
    root.appendChild(el('div', { class: 'dash-cols' },
      sec('weak', 'Weakest topics', 'Topics where your scenario picks missed the best option, with a link straight to the scenarios.', weakHost),
      sec('recent', 'Recent activity', null, recentHost)));
    root.appendChild(sec('backup', 'Back up and restore', 'Export saves a .json file with all of your progress. Import reads one back, with a preview of what will change.',
      el('div', { class: 'cluster backup-actions' }, U().btn({ text: 'Export progress', icon: 'download', kind: 'primary', onClick: () => G.shell.doExport() })),
      drop, fileInput, result, previewHost));
    root.appendChild(sec('settings', 'Settings', null, el('div', { class: 'ui-card ui-card--pad' }, settings.el)));
    root.appendChild(sec('reset', 'Reset', 'Start again from zero. Consider exporting first.', el('div', { class: 'ui-card ui-card--pad danger-zone' }, el('p', { class: 'danger-zone__p' }, 'Clears XP, streak, quiz results, card schedule, bookmarks and notes in this browser.'), resetBtn)));

    paintAll();

    let queued = false;
    const onStore = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; paintAll(); });
    };
    G.store.on(onStore);
    subs.push(() => G.store.off(onStore));

    // read tags for earlier answers that did not record one
    const need = Array.from(new Set(quizStats(tagMap).missingTags)).filter((id) => U().worldMeta(id));
    if (need.length) {
      Promise.all(need.map((id) => G.content.load(id).catch(() => null))).then((ws) => {
        ws.forEach((w) => { if (w) { (w.levels || []).forEach((l) => (l.quiz || []).forEach((q) => { tagMap[q.id] = q.tag; })); (w.topics || []).forEach((t) => (t.quiz || []).forEach((q) => { tagMap[q.id] = q.tag; })); } });
        paintTags();
      });
    }

    const toc = [['overview', 'Overview'], ['mastery', 'Mastery by chapter'], ['quiz-tags', 'Accuracy by quiz tag'], ['cards-boxes', 'Flashcard boxes'], ['weak', 'Weakest topics'], ['recent', 'Recent activity'], ['backup', 'Back up and restore'], ['settings', 'Settings'], ['reset', 'Reset']].map((t) => ({ id: t[0], text: t[1], level: 2 }));
    return {
      el: root, title: 'Your progress', world: 'home', toc: toc, tocSlot: tocSlot,
      crumbs: [{ label: 'Journey', href: '#/' }, { label: 'Progress' }],
      afterMount: () => { if (route.query.focus === 'name') { settings.input.scrollIntoView({ block: 'center' }); settings.input.focus(); } },
      destroy: () => {
        subs.forEach((f) => f());
        settings.destroy();
        document.removeEventListener('dragover', onDragOver);
        document.removeEventListener('dragleave', onDragLeave);
        document.removeEventListener('drop', onDrop);
      }
    };
  };

  /* ================================================================
     Flashcard review page
     ================================================================ */
  G.views.cards = function (route) {
    const worldId = route.params.world || null;
    const meta = worldId ? U().worldMeta(worldId) : null;
    if (worldId && !meta) return G.views.notfound(route);
    const targets = meta ? [meta] : U().worlds();
    return Promise.all(targets.map((w) => G.content.load(w.id))).then(() => {
      const root = el('div', { class: 'view cards-view', 'data-world': meta ? meta.id : null });
      const host = el('div', { class: 'cards-host' });

      root.appendChild(el('header', { class: 'view-head' },
        el('p', { class: 'eyebrow' }, meta ? 'Chapter ' + U().worldNo(meta.id) + ' flashcards' : 'Flashcards'),
        el('h1', null, meta ? meta.short || meta.title : 'Review your flashcards'),
        el('p', { class: 'lead view-head__lead' }, 'Short prompts with spaced repetition. Press Space to flip, then rate how well you knew it. Cards you miss come back sooner.'),
        meta ? el('p', { class: 'cards-back' }, U().icon('arrow-left', 16), el('a', { href: U().worldHref(meta.id) }, 'Back to the chapter'), ' · ', el('a', { href: '#/cards' }, 'Review every chapter')) : null));
      root.appendChild(host);

      let handle = null;
      try {
        if (G.flashcards && G.flashcards.mountReview) handle = G.flashcards.mountReview(host, worldId ? { worldId: worldId } : {});
        else host.appendChild(U().emptyState({ icon: 'cards', title: 'The flashcard player is not loaded', text: 'The flashcard module is missing from this build, so cards cannot be reviewed yet.' }));
      } catch (err) {
        console.error(err);
        host.appendChild(U().emptyState({ error: true, icon: 'warn', title: 'Flashcards could not start', text: err && err.message ? err.message : String(err) }));
      }
      return {
        el: root, title: meta ? (meta.short || meta.title) + ' flashcards' : 'Flashcards', world: meta ? meta.id : 'home',
        crumbs: [{ label: 'Journey', href: '#/' }, meta ? { label: 'Flashcards', href: '#/cards' } : null, { label: meta ? (meta.short || meta.title) : 'Flashcards' }].filter(Boolean),
        destroy: () => { if (handle && typeof handle.destroy === 'function') handle.destroy(); }
      };
    });
  };
})();
