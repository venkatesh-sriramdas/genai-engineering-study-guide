/* Follow the Question: progress store. Owner: E1.
   State lives under localStorage['ftq.v1'] as JSON. If storage is unavailable the store keeps state in memory,
   sets Guide.store.persistent = false and the shell asks the learner to export.

   Beyond the contract API this module adds: previewImport, dueSummary, todayCount, rankInfo, constants. */
(function () {
  'use strict';

  const G = (window.Guide = window.Guide || {});

  const KEY = 'ftq.v1';
  const SCHEMA = 1;
  const DAY = 86400000;
  const INTERVALS = [0, 1, 3, 7, 21]; // days, indexed by box - 1
  const RANKS = ['Intern', 'Apprentice', 'Builder', 'Engineer', 'Senior', 'Staff', 'Architect', 'Principal'];
  const XP = { first: 10, later: 4, level: 50, defend: 40, card: 2, day: 5, topic: 15, scenBest: 12, scenGood: 6 };
  const SIDEBAR_MODES = ['topics', 'journey'];
  const TOPIC_ITEM = /^(w\d+-t\d+)-(q|s)\d+$/; // topic quiz item (q) or scenario (s)
  const THEMES = ['auto', 'light', 'dark'];
  const MAX_HISTORY = 400;
  const MAX_TEXT = 20000;
  const BAD_KEYS = { __proto__: 1, constructor: 1, prototype: 1 };

  /* ---------- tiny helpers ---------- */
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const nonNeg = (v) => Math.max(0, Math.floor(num(v, 0)));
  const str = (v, max) => (typeof v === 'string' ? v.slice(0, max || 200) : '');
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const safeKey = (k) => typeof k === 'string' && k.length > 0 && k.length <= 120 && !BAD_KEYS[k] && /^[A-Za-z0-9._#:\-]+$/.test(k);
  const isDay = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const today = () => (G.today ? G.today() : new Date().toISOString().slice(0, 10));

  function dayShift(dayStr, n) {
    const p = dayStr.split('-').map(Number);
    const d = new Date(p[0], p[1] - 1, p[2] + n);
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  function uuid() {
    try {
      if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
      const b = new Uint8Array(16);
      window.crypto.getRandomValues(b);
      b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
      const h = Array.prototype.map.call(b, (x) => ('0' + x.toString(16)).slice(-2)).join('');
      return [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20)].join('-');
    } catch (e) {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
    }
  }

  /* ---------- state shape ---------- */
  function defaults() {
    return {
      v: SCHEMA,
      learner: { name: '', id: uuid(), createdAt: new Date().toISOString() },
      xp: 0,
      streak: { days: 0, last: '', best: 0 },
      levels: {},
      topics: {},
      quiz: {},
      cards: {},
      dials: {},
      labs: {},
      bookmarks: [],
      settings: { theme: 'auto', fontScale: 1, facilitator: false, sidebarCollapsed: false, sidebarMode: 'topics', dailyGoal: 10 },
      history: [],
      daily: { date: '', n: 0 }
    };
  }

  function normSettings(s) {
    const d = defaults().settings;
    if (!isObj(s)) return d;
    return {
      theme: THEMES.indexOf(s.theme) >= 0 ? s.theme : d.theme,
      fontScale: Math.min(1.5, Math.max(0.8, num(s.fontScale, 1))),
      facilitator: s.facilitator === true,
      sidebarCollapsed: s.sidebarCollapsed === true,
      sidebarMode: SIDEBAR_MODES.indexOf(s.sidebarMode) >= 0 ? s.sidebarMode : d.sidebarMode,
      dailyGoal: Math.min(100, Math.max(1, Math.floor(num(s.dailyGoal, d.dailyGoal))))
    };
  }

  function normDefend(d) {
    if (!isObj(d)) return null;
    return {
      score: nonNeg(d.score), max: nonNeg(d.max),
      checked: Array.isArray(d.checked) ? d.checked.filter((n) => Number.isInteger(n) && n >= 0 && n < 200).slice(0, 60) : [],
      answer: str(d.answer, MAX_TEXT),
      scored: d.scored === true || nonNeg(d.max) > 0,
      awarded: d.awarded === true
    };
  }

  /* Defensive normalisation: anything malformed is dropped, never thrown. Used for load, cross-tab sync and import. */
  function normalize(raw) {
    const s = defaults();
    if (!isObj(raw)) return s;
    if (isObj(raw.learner)) {
      s.learner.name = str(raw.learner.name, 60).trim();
      s.learner.id = str(raw.learner.id, 80) || s.learner.id;
      s.learner.createdAt = str(raw.learner.createdAt, 40) || s.learner.createdAt;
    }
    s.xp = nonNeg(raw.xp);
    if (isObj(raw.streak)) {
      s.streak.days = nonNeg(raw.streak.days);
      s.streak.last = isDay(raw.streak.last) ? raw.streak.last : '';
      s.streak.best = Math.max(nonNeg(raw.streak.best), s.streak.days);
    }
    if (isObj(raw.levels)) {
      Object.keys(raw.levels).forEach((id) => {
        const r = raw.levels[id];
        if (!safeKey(id) || !isObj(r)) return;
        const rec = {
          status: r.status === 'done' ? 'done' : 'started',
          firstSeen: num(r.firstSeen, 0), lastSeen: num(r.lastSeen, 0),
          sections: Array.isArray(r.sections) ? r.sections.filter((x) => typeof x === 'string' && x.length < 120).slice(0, 300) : []
        };
        if (r.status === 'done') rec.doneAt = num(r.doneAt, rec.lastSeen);
        const d = normDefend(r.defend);
        if (d) rec.defend = d;
        if (typeof r.note === 'string' && r.note) rec.note = r.note.slice(0, MAX_TEXT);
        s.levels[id] = rec;
      });
    }
    if (isObj(raw.topics)) {
      Object.keys(raw.topics).forEach((id) => {
        const r = raw.topics[id];
        if (!safeKey(id) || !isObj(r)) return;
        const rec = { status: r.status === 'reviewed' ? 'reviewed' : 'seen', firstSeen: num(r.firstSeen, 0), lastSeen: num(r.lastSeen, 0) };
        if (rec.status === 'reviewed') rec.reviewedAt = num(r.reviewedAt, rec.lastSeen);
        if (r.awarded === true || rec.status === 'reviewed') rec.awarded = true;
        s.topics[id] = rec;
      });
    }
    if (isObj(raw.quiz)) {
      Object.keys(raw.quiz).forEach((id) => {
        const r = raw.quiz[id];
        if (!safeKey(id) || !isObj(r)) return;
        const rec = { attempts: Math.max(1, nonNeg(r.attempts)), correct: r.correct === true, firstCorrect: r.firstCorrect === true, last: num(r.last, 0) };
        if (typeof r.tag === 'string' && r.tag.length < 24) rec.tag = r.tag;
        if (typeof r.w === 'string' && r.w.length < 12) rec.w = r.w;
        if (typeof r.l === 'string' && r.l.length < 40) rec.l = r.l;
        if (typeof r.tp === 'string' && r.tp.length < 40) rec.tp = r.tp;
        if (r.partial === true) rec.partial = true;
        s.quiz[id] = rec;
      });
    }
    if (isObj(raw.cards)) {
      Object.keys(raw.cards).forEach((id) => {
        const r = raw.cards[id];
        if (!safeKey(id) || !isObj(r)) return;
        s.cards[id] = { box: Math.min(5, Math.max(1, Math.floor(num(r.box, 1)))), due: num(r.due, 0), reps: nonNeg(r.reps), lapses: nonNeg(r.lapses), last: num(r.last, 0) };
      });
    }
    ['dials', 'labs'].forEach((k) => {
      if (!isObj(raw[k])) return;
      Object.keys(raw[k]).forEach((id) => {
        if (safeKey(id) && isObj(raw[k][id])) {
          try { s[k][id] = clone(raw[k][id]); } catch (e) { /* skip */ }
        }
      });
    });
    if (Array.isArray(raw.bookmarks)) {
      const seen = {};
      raw.bookmarks.forEach((b) => { if (typeof b === 'string' && b.length < 160 && !seen[b]) { seen[b] = 1; s.bookmarks.push(b); } });
      s.bookmarks = s.bookmarks.slice(0, 500);
    }
    s.settings = normSettings(raw.settings);
    if (Array.isArray(raw.history)) {
      s.history = raw.history.filter((h) => isObj(h) && typeof h.type === 'string' && typeof h.id === 'string')
        .map((h) => {
          const o = { ts: num(h.ts, 0), type: h.type.slice(0, 16), id: h.id.slice(0, 120) };
          if (typeof h.ok === 'boolean') o.ok = h.ok;
          return o;
        }).slice(-MAX_HISTORY);
    }
    if (isObj(raw.daily) && isDay(raw.daily.date)) s.daily = { date: raw.daily.date, n: nonNeg(raw.daily.n) };
    return s;
  }

  /* ---------- storage layer ---------- */
  let backend = null;
  try {
    const ls = window.localStorage;
    ls.setItem(KEY + '.probe', '1');
    ls.removeItem(KEY + '.probe');
    backend = ls;
  } catch (e) { backend = null; }

  let state = null;
  let loadNotice = '';
  const listeners = [];
  let saveTimer = null;
  let dirty = false;

  function readFromBackend() {
    if (!backend) return null;
    let raw = null;
    try { raw = backend.getItem(KEY); } catch (e) { return null; }
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!isObj(parsed) || (parsed.v !== undefined && num(parsed.v, 0) > SCHEMA)) throw new Error('unsupported');
      return normalize(parsed);
    } catch (e) {
      try { backend.setItem(KEY + '.corrupt.' + Date.now(), raw); } catch (e2) { /* ignore */ }
      loadNotice = 'Saved progress could not be read, so the guide started fresh. A backup of the unreadable data was kept in this browser.';
      return null;
    }
  }

  function persist() {
    dirty = false;
    if (!backend) return;
    try { backend.setItem(KEY, JSON.stringify(state)); } catch (e) {
      backend = null;
      store.persistent = false;
      emit('persistent');
    }
  }
  function scheduleSave() {
    dirty = true;
    if (saveTimer) return;
    saveTimer = setTimeout(() => { saveTimer = null; persist(); }, 120);
  }
  function flush() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    if (dirty) persist();
  }
  window.addEventListener('pagehide', flush);
  window.addEventListener('beforeunload', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

  function emit(path, extra) {
    const evt = Object.assign({ path: path }, extra || {});
    listeners.slice().forEach((fn) => { try { fn(evt); } catch (e) { console.error('[store]', e); } });
    if (G.bus) G.bus.emit('store:change', evt);
  }
  function commit(path, extra) { scheduleSave(); emit(path, extra); }

  /* ---------- rank and XP ---------- */
  function rankInfo(xp) {
    const level = Math.floor(Math.sqrt(Math.max(0, xp) / 50)) + 1;
    return {
      level: level,
      rank: RANKS[Math.min(level - 1, RANKS.length - 1)],
      floorXp: 50 * (level - 1) * (level - 1),
      nextLevelXp: 50 * level * level,
      nextRank: RANKS[Math.min(level, RANKS.length - 1)]
    };
  }
  function addXp(n, reason) {
    if (!n) return;
    const before = rankInfo(state.xp).level;
    state.xp += n;
    const after = rankInfo(state.xp).level;
    if (G.bus) {
      G.bus.emit('xp:gain', { amount: n, reason: reason, xp: state.xp });
      if (after > before) G.bus.emit('rank:up', { level: after, rank: rankInfo(state.xp).rank });
    }
  }

  function pushHistory(type, id, ok) {
    const h = { ts: Date.now(), type: type, id: id };
    if (typeof ok === 'boolean') h.ok = ok;
    state.history.push(h);
    if (state.history.length > MAX_HISTORY) state.history.splice(0, state.history.length - MAX_HISTORY);
  }

  /* A study day counts when any quiz or scenario answer, card rating, topic review or level completion occurs. */
  function studyAction() {
    const t = today();
    const st = state.streak;
    if (st.last !== t) {
      st.days = st.last === dayShift(t, -1) ? st.days + 1 : 1;
      st.last = t;
      st.best = Math.max(st.best || 0, st.days);
      addXp(XP.day, 'study-day');
    }
    if (state.daily.date !== t) state.daily = { date: t, n: 0 };
    state.daily.n++;
  }
  function currentStreak() {
    const st = state.streak;
    if (!st.last) return 0;
    const t = today();
    return st.last === t || st.last === dayShift(t, -1) ? st.days : 0;
  }

  /* ---------- manifest lookups ---------- */
  function worldMeta(id) {
    const m = G.manifest;
    if (!m) return null;
    for (let i = 0; i < m.worlds.length; i++) if (m.worlds[i].id === id) return m.worlds[i];
    return null;
  }
  function levelMeta(levelId) {
    const f = G.content && G.content.findLevelMeta ? G.content.findLevelMeta(levelId) : null;
    return f ? f.level : null;
  }
  function worldOfLevel(levelId) { return String(levelId).split('-')[0]; }
  function levelOfItem(itemId) { const m = /^(.+)-q\d+$/.exec(itemId); return m && !TOPIC_ITEM.test(itemId) ? m[1] : ''; }
  function topicOfItem(itemId) { const m = TOPIC_ITEM.exec(itemId); return m ? m[1] : ''; }
  const isScenarioId = (id) => /^w\d+-t\d+-s\d+$/.test(id);
  function topicsOfWorld(worldId) { const w = worldMeta(worldId); return w && w.topics ? w.topics : []; }

  function answeredCount(levelId) {
    const prefix = levelId + '-q';
    let n = 0;
    Object.keys(state.quiz).forEach((id) => { if (id.indexOf(prefix) === 0 && /^\d+$/.test(id.slice(prefix.length))) n++; });
    return n;
  }

  /* Completion rule: every quiz item answered at least once and, if the level has a defend task, a saved self-score.
     Levels with neither complete only through the explicit "Mark as done" button. */
  function evaluateCompletion(levelId, worldId) {
    const meta = levelMeta(levelId);
    if (!meta) return;
    const rec = state.levels[levelId];
    if (rec && rec.status === 'done') return;
    const hasQuiz = meta.quizCount > 0;
    if (!hasQuiz && !meta.hasDefend) return;
    if (hasQuiz && answeredCount(levelId) < meta.quizCount) return;
    if (meta.hasDefend && !(rec && rec.defend && rec.defend.scored)) return;
    store.completeLevel(levelId, worldId || worldOfLevel(levelId));
  }

  /* ---------- merge ---------- */
  function levelRank(r) { return r.status === 'done' ? 2 : 1; }
  function ratio(d) { return d && d.max > 0 ? d.score / d.max : -1; }

  function mergeLevel(a, b) {
    const out = clone(a);
    out.status = levelRank(b) > levelRank(a) ? 'done' : a.status;
    out.firstSeen = Math.min(a.firstSeen || Infinity, b.firstSeen || Infinity);
    if (!isFinite(out.firstSeen)) out.firstSeen = 0;
    out.lastSeen = Math.max(a.lastSeen || 0, b.lastSeen || 0);
    if (out.status === 'done') out.doneAt = Math.max(a.doneAt || 0, b.doneAt || 0) || out.lastSeen;
    out.sections = Array.from(new Set((a.sections || []).concat(b.sections || []))).slice(0, 300);
    const da = a.defend, db = b.defend;
    if (da || db) {
      const pick = !da ? db : !db ? da : (ratio(db) > ratio(da) || (ratio(db) === ratio(da) && (db.answer || '').length > (da.answer || '').length)) ? db : da;
      out.defend = clone(pick);
      out.defend.awarded = !!((da && da.awarded) || (db && db.awarded));
    }
    if (!out.note && b.note) out.note = b.note;
    else if (b.note && (b.lastSeen || 0) > (a.lastSeen || 0)) out.note = b.note;
    return out;
  }
  function quizScore(r) { return (r.correct ? 2 : 0) + (r.firstCorrect ? 1 : 0) + (r.partial && !r.correct ? 0.5 : 0); }
  function mergeTopic(a, b) {
    const out = clone(a);
    const reviewed = a.status === 'reviewed' || b.status === 'reviewed';
    out.status = reviewed ? 'reviewed' : 'seen';
    out.firstSeen = Math.min(a.firstSeen || Infinity, b.firstSeen || Infinity);
    if (!isFinite(out.firstSeen)) out.firstSeen = 0;
    out.lastSeen = Math.max(a.lastSeen || 0, b.lastSeen || 0);
    if (reviewed) out.reviewedAt = Math.max(a.reviewedAt || 0, b.reviewedAt || 0) || out.lastSeen;
    if (a.awarded || b.awarded || reviewed) out.awarded = true;
    return out;
  }
  function mergeStates(a, b) {
    const out = clone(a);
    out.xp = Math.max(a.xp, b.xp);
    const sa = a.streak, sb = b.streak;
    out.streak = (sb.last > sa.last || (sb.last === sa.last && sb.days > sa.days)) ? clone(sb) : clone(sa);
    out.streak.best = Math.max(sa.best || 0, sb.best || 0, out.streak.days);
    Object.keys(b.levels).forEach((id) => { out.levels[id] = out.levels[id] ? mergeLevel(out.levels[id], b.levels[id]) : clone(b.levels[id]); });
    out.topics = out.topics || {};
    Object.keys(b.topics || {}).forEach((id) => { out.topics[id] = out.topics[id] ? mergeTopic(out.topics[id], b.topics[id]) : clone(b.topics[id]); });
    Object.keys(b.quiz).forEach((id) => {
      const x = out.quiz[id], y = b.quiz[id];
      if (!x) { out.quiz[id] = clone(y); return; }
      const best = quizScore(y) > quizScore(x) || (quizScore(y) === quizScore(x) && y.last > x.last) ? y : x;
      out.quiz[id] = Object.assign(clone(best), { attempts: Math.max(x.attempts, y.attempts), last: Math.max(x.last, y.last) });
    });
    Object.keys(b.cards).forEach((id) => {
      const x = out.cards[id], y = b.cards[id];
      if (!x || y.last > x.last || (y.last === x.last && y.box > x.box)) out.cards[id] = clone(y);
    });
    ['dials', 'labs'].forEach((k) => { Object.keys(b[k]).forEach((id) => { if (!out[k][id]) out[k][id] = clone(b[k][id]); }); });
    out.bookmarks = Array.from(new Set(a.bookmarks.concat(b.bookmarks))).slice(0, 500);
    const seen = {};
    out.history = a.history.concat(b.history).filter((h) => { const k = h.ts + '|' + h.type + '|' + h.id; if (seen[k]) return false; seen[k] = 1; return true; })
      .sort((x, y) => x.ts - y.ts).slice(-MAX_HISTORY);
    if (!out.learner.name && b.learner.name) out.learner.name = b.learner.name;
    if (b.daily.date === out.daily.date) out.daily.n = Math.max(out.daily.n, b.daily.n);
    return out;
  }

  /* ---------- import validation ---------- */
  function parseIncoming(textOrObject) {
    let obj = textOrObject;
    if (typeof textOrObject === 'string') {
      try { obj = JSON.parse(textOrObject); } catch (e) { return { ok: false, error: 'This file is not valid JSON. Choose a progress file exported from Follow the Question.' }; }
    }
    if (!isObj(obj)) return { ok: false, error: 'This file does not contain a progress export. Choose a file exported from Follow the Question.' };
    if (obj.v === undefined) return { ok: false, error: 'This file has no version number, so it is probably not a Follow the Question export.' };
    if (typeof obj.v !== 'number' || !isFinite(obj.v) || obj.v < 1) return { ok: false, error: 'The version field in this file is not valid.' };
    if (obj.v > SCHEMA) return { ok: false, error: 'This file was exported by a newer version of the guide (format ' + obj.v + '). Update the guide, then import again.' };
    const shapes = ['levels', 'topics', 'quiz', 'cards', 'dials', 'labs'];
    for (let i = 0; i < shapes.length; i++) {
      if (obj[shapes[i]] !== undefined && !isObj(obj[shapes[i]])) return { ok: false, error: 'The "' + shapes[i] + '" section of this file is malformed.' };
    }
    if (obj.bookmarks !== undefined && !Array.isArray(obj.bookmarks)) return { ok: false, error: 'The "bookmarks" section of this file is malformed.' };
    if (obj.xp !== undefined && (typeof obj.xp !== 'number' || !isFinite(obj.xp))) return { ok: false, error: 'The XP value in this file is not a number.' };
    return { ok: true, state: normalize(obj), exportedAt: str(obj.exportedAt, 40) };
  }

  function summarise(s) {
    const done = Object.keys(s.levels).filter((id) => s.levels[id].status === 'done').length;
    const topics = s.topics || {};
    return {
      name: s.learner.name, xp: s.xp, levelsDone: done, levelsStarted: Object.keys(s.levels).length,
      topicsReviewed: Object.keys(topics).filter((id) => topics[id].status === 'reviewed').length, topicsSeen: Object.keys(topics).length,
      quizAnswered: Object.keys(s.quiz).length, quizCorrect: Object.keys(s.quiz).filter((k) => s.quiz[k].correct).length,
      cards: Object.keys(s.cards).length, bookmarks: s.bookmarks.length, streak: s.streak.days
    };
  }

  /* ---------- the store ---------- */
  state = readFromBackend() || defaults();

  const store = {
    persistent: !!backend,
    loadNotice: loadNotice,
    key: KEY,
    constants: { XP: XP, RANKS: RANKS, INTERVALS: INTERVALS },

    get: () => state,
    on: (fn) => { if (typeof fn === 'function' && listeners.indexOf(fn) < 0) listeners.push(fn); },
    off: (fn) => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); },
    flush: flush,
    rankInfo: rankInfo,

    setLearnerName(name) {
      state.learner.name = str(name, 60).trim();
      commit('learner.name');
    },

    touchLevel(levelId) {
      if (!safeKey(levelId)) return;
      const now = Date.now();
      let rec = state.levels[levelId];
      const isNew = !rec;
      if (!rec) rec = state.levels[levelId] = { status: 'started', firstSeen: now, lastSeen: now, sections: [] };
      rec.lastSeen = now;
      scheduleSave();
      if (isNew) emit('levels.' + levelId + '.status');
    },

    markSection(levelId, sectionId) {
      if (!safeKey(levelId) || typeof sectionId !== 'string' || !sectionId || sectionId.length > 120) return;
      let rec = state.levels[levelId];
      if (!rec) { const now = Date.now(); rec = state.levels[levelId] = { status: 'started', firstSeen: now, lastSeen: now, sections: [] }; }
      if (rec.sections.indexOf(sectionId) < 0 && rec.sections.length < 300) { rec.sections.push(sectionId); scheduleSave(); }
    },

    recordQuiz(itemId, correct, meta) {
      if (!safeKey(itemId)) return;
      meta = meta || {};
      // topic quiz items (<topic>-q<n>) and scenarios (<topic>-s<n>) belong to a topic, not to a practice problem
      const topicId = (typeof meta.topicId === 'string' && safeKey(meta.topicId) ? meta.topicId : '') || topicOfItem(itemId);
      const levelId = topicId ? '' : (meta.levelId || levelOfItem(itemId));
      const worldId = meta.worldId || (topicId ? worldOfLevel(topicId) : levelId ? worldOfLevel(levelId) : '');
      const scenario = isScenarioId(itemId) || meta.kind === 'scenario';
      const verdict = meta.verdict === 'good' || meta.partial === true ? 'good' : (correct ? 'best' : 'poor');
      const now = Date.now();
      const isRight = !!correct && verdict !== 'good';
      let rec = state.quiz[itemId];
      if (!rec) rec = state.quiz[itemId] = { attempts: 0, correct: false, firstCorrect: false, last: 0 };
      rec.attempts++;
      rec.last = now;
      if (typeof meta.tag === 'string' && meta.tag.length < 24) rec.tag = meta.tag;
      if (worldId) rec.w = worldId;
      if (levelId) rec.l = levelId;
      if (topicId) rec.tp = topicId;
      if (isRight) {
        if (rec.attempts === 1) { rec.firstCorrect = true; rec.correct = true; addXp(scenario ? XP.scenBest : XP.first, scenario ? 'scenario-best' : 'quiz-first'); }
        else if (!rec.correct) { rec.correct = true; addXp(XP.later, 'quiz-later'); }
      } else if (scenario && verdict === 'good' && !rec.partial && !rec.correct) {
        rec.partial = true;
        addXp(XP.scenGood, 'scenario-good');
      }
      studyAction();
      pushHistory('quiz', itemId, isRight);
      if (levelId) {
        const lr = state.levels[levelId];
        if (!lr) state.levels[levelId] = { status: 'started', firstSeen: now, lastSeen: now, sections: [] };
        else lr.lastSeen = now;
      }
      if (topicId) {
        const tr = state.topics[topicId];
        if (!tr) state.topics[topicId] = { status: 'seen', firstSeen: now, lastSeen: now };
        else tr.lastSeen = now;
      }
      commit('quiz.' + itemId);
      if (G.bus) G.bus.emit('quiz:answered', { itemId: itemId, correct: isRight, levelId: levelId, topicId: topicId, worldId: worldId, scenario: scenario, verdict: verdict });
      if (levelId) evaluateCompletion(levelId, worldId);
    },

    touchTopic(topicId) {
      if (!safeKey(topicId)) return;
      const now = Date.now();
      let rec = state.topics[topicId];
      const isNew = !rec;
      if (!rec) rec = state.topics[topicId] = { status: 'seen', firstSeen: now, lastSeen: now };
      rec.lastSeen = now;
      scheduleSave();
      if (isNew) emit('topics.' + topicId + '.status');
    },

    /* Marks a topic reviewed. Idempotent. XP is awarded once per topic, even if the mark is removed and set again. */
    markTopic(topicId, worldId) {
      if (!safeKey(topicId)) return false;
      const now = Date.now();
      let rec = state.topics[topicId];
      if (rec && rec.status === 'reviewed') return false;
      if (!rec) rec = state.topics[topicId] = { status: 'seen', firstSeen: now, lastSeen: now };
      rec.status = 'reviewed';
      rec.reviewedAt = now;
      rec.lastSeen = now;
      const gained = !rec.awarded;
      if (gained) { rec.awarded = true; addXp(XP.topic, 'topic'); }
      studyAction();
      pushHistory('topic', topicId);
      commit('topics.' + topicId + '.status', { xp: gained });
      if (G.bus) G.bus.emit('topic:reviewed', { topicId: topicId, worldId: worldId || worldOfLevel(topicId), xp: gained });
      return true;
    },

    unmarkTopic(topicId) {
      const rec = state.topics[topicId];
      if (!rec || rec.status !== 'reviewed') return false;
      rec.status = 'seen';
      delete rec.reviewedAt;
      commit('topics.' + topicId + '.status');
      return true;
    },

    topicStatus(topicId) {
      const r = state.topics[topicId];
      return !r ? 'new' : r.status === 'reviewed' ? 'reviewed' : 'seen';
    },

    /* Scenario accuracy per topic: { n answered, first first-try best picks, ok best picks, partial good picks, total scenarios in the topic } */
    topicScenarioStats(topicId) {
      const out = { n: 0, first: 0, ok: 0, partial: 0 };
      Object.keys(state.quiz).forEach((id) => {
        if (id.indexOf(topicId + '-s') !== 0 || !isScenarioId(id)) return;
        const r = state.quiz[id];
        out.n++;
        if (r.firstCorrect) out.first++;
        if (r.correct) out.ok++;
        else if (r.partial) out.partial++;
      });
      return out;
    },

    topicProgress(worldId) {
      const list = topicsOfWorld(worldId);
      let reviewed = 0, seen = 0;
      list.forEach((t) => { const r = state.topics[t.id]; if (r) { seen++; if (r.status === 'reviewed') reviewed++; } });
      let scenariosCorrect = 0, scenariosFirstTry = 0, scenariosAnswered = 0;
      const prefix = worldId + '-t';
      Object.keys(state.quiz).forEach((id) => {
        if (id.indexOf(prefix) !== 0 || !isScenarioId(id)) return;
        scenariosAnswered++;
        if (state.quiz[id].correct) scenariosCorrect++;
        if (state.quiz[id].firstCorrect) scenariosFirstTry++;
      });
      const w = worldMeta(worldId);
      return {
        reviewed: reviewed, seen: seen, total: list.length, pct: list.length ? Math.round((reviewed / list.length) * 100) : 0,
        scenariosCorrect: scenariosCorrect, scenariosFirstTry: scenariosFirstTry, scenariosAnswered: scenariosAnswered, scenariosTotal: w ? (w.scenarioCount || 0) : 0
      };
    },

    completeLevel(levelId, worldId) {
      if (!safeKey(levelId)) return false;
      const now = Date.now();
      let rec = state.levels[levelId];
      if (rec && rec.status === 'done') return false;
      if (!rec) rec = state.levels[levelId] = { status: 'started', firstSeen: now, lastSeen: now, sections: [] };
      rec.status = 'done';
      rec.doneAt = now;
      rec.lastSeen = now;
      addXp(XP.level, 'level');
      studyAction();
      pushHistory('level', levelId);
      commit('levels.' + levelId + '.status');
      if (G.bus) G.bus.emit('level:complete', { levelId: levelId, worldId: worldId || worldOfLevel(levelId) });
      return true;
    },

    levelStatus(levelId) {
      const r = state.levels[levelId];
      return !r ? 'new' : r.status === 'done' ? 'done' : 'started';
    },

    worldProgress(worldId) {
      const w = worldMeta(worldId);
      const total = w ? w.levels.length : 0;
      let done = 0;
      if (w) w.levels.forEach((l) => { if (state.levels[l.id] && state.levels[l.id].status === 'done') done++; });
      let quizCorrect = 0, firstTry = 0, answered = 0;
      const prefix = worldId + '-';
      Object.keys(state.quiz).forEach((id) => {
        if (id.indexOf(prefix) !== 0 || isScenarioId(id)) return; // scenarios are counted by topicProgress
        answered++;
        if (state.quiz[id].correct) quizCorrect++;
        if (state.quiz[id].firstCorrect) firstTry++;
      });
      const tp = store.topicProgress(worldId);
      return {
        done: done, total: total, pct: total ? Math.round((done / total) * 100) : 0,
        quizCorrect: quizCorrect, quizTotal: w ? w.quizCount : 0, quizAnswered: answered, quizFirstTry: firstTry,
        started: !!(w && (w.levels.some((l) => state.levels[l.id]) || tp.seen > 0)),
        topics: { reviewed: tp.reviewed, total: tp.total, pct: tp.pct, seen: tp.seen },
        scenarios: { correct: tp.scenariosCorrect, answered: tp.scenariosAnswered, total: tp.scenariosTotal }
      };
    },

    totalProgress() {
      const m = G.manifest;
      let total = 0, done = 0, topicsTotal = 0, topicsReviewed = 0, scenariosTotal = 0;
      if (m) m.worlds.forEach((w) => {
        total += w.levels.length;
        w.levels.forEach((l) => { if (state.levels[l.id] && state.levels[l.id].status === 'done') done++; });
        (w.topics || []).forEach((t) => { topicsTotal++; if (state.topics[t.id] && state.topics[t.id].status === 'reviewed') topicsReviewed++; });
        scenariosTotal += w.scenarioCount || 0;
      });
      let scenariosAnswered = 0, scenariosCorrect = 0;
      Object.keys(state.quiz).forEach((id) => { if (isScenarioId(id)) { scenariosAnswered++; if (state.quiz[id].correct) scenariosCorrect++; } });
      const r = rankInfo(state.xp);
      return {
        levelsDone: done, levelsTotal: total, pct: total ? Math.round((done / total) * 100) : 0,
        topicsReviewed: topicsReviewed, topicsTotal: topicsTotal, topicsPct: topicsTotal ? Math.round((topicsReviewed / topicsTotal) * 100) : 0,
        scenariosAnswered: scenariosAnswered, scenariosCorrect: scenariosCorrect, scenariosTotal: scenariosTotal,
        overallPct: (total + topicsTotal) ? Math.round(((done + topicsReviewed) / (total + topicsTotal)) * 100) : 0,
        xp: state.xp, level: r.level, rank: r.rank, floorXp: r.floorXp, nextLevelXp: r.nextLevelXp, nextRank: r.nextRank,
        streak: currentStreak(), streakBest: state.streak.best || 0
      };
    },

    getDials(boardId) { return state.dials[boardId] ? clone(state.dials[boardId]) : {}; },
    setDials(boardId, obj) {
      if (!safeKey(boardId) || !isObj(obj)) return;
      state.dials[boardId] = clone(obj);
      commit('dials.' + boardId);
    },

    saveDefend(levelId, d) {
      if (!safeKey(levelId) || !isObj(d)) return;
      const now = Date.now();
      let rec = state.levels[levelId];
      if (!rec) rec = state.levels[levelId] = { status: 'started', firstSeen: now, lastSeen: now, sections: [] };
      const prev = rec.defend || { score: 0, max: 0, checked: [], answer: '', scored: false, awarded: false };
      const merged = normDefend(Object.assign({}, prev, d, { scored: prev.scored || nonNeg(d.max) > 0 })) || prev;
      merged.awarded = prev.awarded;
      rec.defend = merged;
      rec.lastSeen = now;
      let gained = false;
      if (merged.scored && merged.max > 0 && merged.score / merged.max >= 0.7 && !merged.awarded) {
        merged.awarded = true;
        addXp(XP.defend, 'defend');
        gained = true;
      }
      if (nonNeg(d.max) > 0) { studyAction(); pushHistory('defend', levelId); }
      commit('levels.' + levelId + '.defend', { xp: gained });
      if (merged.scored) evaluateCompletion(levelId, worldOfLevel(levelId));
    },

    getDefend(levelId) { const r = state.levels[levelId]; return r && r.defend ? clone(r.defend) : null; },

    getNote(levelId) { const r = state.levels[levelId]; return r && r.note ? r.note : ''; },
    setNote(levelId, text) {
      if (!safeKey(levelId)) return;
      const now = Date.now();
      let rec = state.levels[levelId];
      if (!rec) rec = state.levels[levelId] = { status: 'started', firstSeen: now, lastSeen: now, sections: [] };
      rec.note = str(text, MAX_TEXT);
      if (!rec.note) delete rec.note;
      commit('levels.' + levelId + '.note');
    },

    getLab(id) { return state.labs[id] ? clone(state.labs[id]) : null; },
    setLab(id, obj) {
      if (!safeKey(id) || !isObj(obj)) return;
      try { state.labs[id] = clone(obj); } catch (e) { return; }
      commit('labs.' + id);
    },

    rateCard(cardId, grade) {
      if (!safeKey(cardId)) return;
      const g = Math.min(3, Math.max(0, Math.floor(num(grade, 0))));
      const now = Date.now();
      const rec = state.cards[cardId] || { box: 1, due: now, reps: 0, lapses: 0, last: 0 };
      const isNewCard = !state.cards[cardId];
      if (g === 0) { rec.box = 1; if (!isNewCard) rec.lapses++; }
      else if (g === 2) rec.box = Math.min(5, rec.box + 1);
      else if (g === 3) rec.box = Math.min(5, rec.box + 2);
      rec.reps++;
      rec.last = now;
      rec.due = now + INTERVALS[rec.box - 1] * DAY;
      state.cards[cardId] = rec;
      if (g >= 2) addXp(XP.card, 'card');
      studyAction();
      pushHistory('card', cardId, g >= 2);
      commit('cards.' + cardId);
      if (G.bus) G.bus.emit('card:rated', { cardId: cardId, box: rec.box, grade: g });
    },

    /* Reviewed cards that are due now (oldest first), then unseen cards from worlds whose content is loaded.
       worldId limits to one chapter; topicId (optional) limits to the flashcards of one topic. */
    dueCards(worldId, topicId) {
      const now = Date.now();
      const due = [];
      const keep = (id) => (!worldId || id.indexOf(worldId + '-') === 0) && (!topicId || id.indexOf(topicId + '-') === 0);
      Object.keys(state.cards).forEach((id) => {
        if (state.cards[id].due <= now && keep(id)) due.push([state.cards[id].due, id]);
      });
      due.sort((a, b) => a[0] - b[0]);
      const ids = due.map((x) => x[1]);
      const loaded = (G.content && G.content._worlds) || {};
      Object.keys(loaded).sort().forEach((w) => {
        if (worldId && w !== worldId) return;
        (loaded[w].flashcards || []).forEach((c) => { if (!state.cards[c.id] && keep(c.id)) ids.push(c.id); });
      });
      return ids;
    },

    /* Counts that do not need world content: uses manifest totals. */
    dueSummary(worldId) {
      const now = Date.now();
      let total = 0;
      const m = G.manifest;
      if (m) m.worlds.forEach((w) => { if (!worldId || w.id === worldId) total += w.flashcardCount || 0; });
      let due = 0, studied = 0;
      const boxes = [0, 0, 0, 0, 0];
      Object.keys(state.cards).forEach((id) => {
        if (worldId && id.indexOf(worldId + '-') !== 0) return;
        studied++;
        boxes[state.cards[id].box - 1]++;
        if (state.cards[id].due <= now) due++;
      });
      return { total: total, studied: studied, due: due, fresh: Math.max(0, total - studied), boxes: boxes };
    },

    todayCount() { return state.daily.date === today() ? state.daily.n : 0; },

    toggleBookmark(id) {
      if (typeof id !== 'string' || !id || id.length > 160) return false;
      const i = state.bookmarks.indexOf(id);
      if (i >= 0) state.bookmarks.splice(i, 1); else state.bookmarks.push(id);
      commit('bookmarks');
      return i < 0;
    },
    isBookmarked(id) { return state.bookmarks.indexOf(id) >= 0; },

    setSetting(key, value) {
      const s = state.settings;
      if (key === 'theme' && THEMES.indexOf(value) >= 0) s.theme = value;
      else if (key === 'fontScale' && typeof value === 'number' && isFinite(value)) s.fontScale = Math.min(1.5, Math.max(0.8, value));
      else if (key === 'facilitator') s.facilitator = !!value;
      else if (key === 'sidebarCollapsed') s.sidebarCollapsed = !!value;
      else if (key === 'sidebarMode' && SIDEBAR_MODES.indexOf(value) >= 0) s.sidebarMode = value;
      else if (key === 'dailyGoal' && typeof value === 'number' && isFinite(value)) s.dailyGoal = Math.min(100, Math.max(1, Math.floor(value)));
      else return false;
      commit('settings.' + key);
      return true;
    },

    exportJSON() {
      flush();
      const name = G.slug ? G.slug(state.learner.name || 'learner') : 'learner';
      const filename = 'ftq-progress-' + name + '-' + today() + '.json';
      const payload = Object.assign({}, state, { exportedAt: new Date().toISOString(), app: 'follow-the-question', appVersion: G.version || '' });
      if (G.download) G.download(filename, JSON.stringify(payload, null, 2), 'application/json');
      return filename;
    },

    /* Returns { ok:true, summary } or { ok:false, error }. mode: 'merge' (default) or 'replace'. */
    importJSON(textOrObject, mode) {
      const parsed = parseIncoming(textOrObject);
      if (!parsed.ok) return parsed;
      const before = summarise(state);
      if (mode === 'replace') {
        state = parsed.state;
      } else {
        state = mergeStates(state, parsed.state);
      }
      commit('*', { imported: true });
      return { ok: true, mode: mode === 'replace' ? 'replace' : 'merge', before: before, after: summarise(state) };
    },

    /* Describes what an import would change without applying it. */
    previewImport(textOrObject) {
      const parsed = parseIncoming(textOrObject);
      if (!parsed.ok) return parsed;
      const cur = state, inc = parsed.state;
      const merged = mergeStates(cur, inc);
      const changes = { levelsNew: 0, levelsUpgraded: 0, topicsNew: 0, topicsUpgraded: 0, quizNew: 0, quizImproved: 0, cardsNew: 0, cardsNewer: 0, bookmarksNew: 0 };
      Object.keys(inc.levels).forEach((id) => {
        if (!cur.levels[id]) changes.levelsNew++;
        else if (levelRank(inc.levels[id]) > levelRank(cur.levels[id])) changes.levelsUpgraded++;
      });
      Object.keys(inc.topics || {}).forEach((id) => {
        if (!cur.topics[id]) changes.topicsNew++;
        else if (inc.topics[id].status === 'reviewed' && cur.topics[id].status !== 'reviewed') changes.topicsUpgraded++;
      });
      Object.keys(inc.quiz).forEach((id) => {
        if (!cur.quiz[id]) changes.quizNew++;
        else if (quizScore(inc.quiz[id]) > quizScore(cur.quiz[id])) changes.quizImproved++;
      });
      Object.keys(inc.cards).forEach((id) => {
        if (!cur.cards[id]) changes.cardsNew++;
        else if (inc.cards[id].last > cur.cards[id].last) changes.cardsNewer++;
      });
      inc.bookmarks.forEach((b) => { if (cur.bookmarks.indexOf(b) < 0) changes.bookmarksNew++; });
      return {
        ok: true, exportedAt: parsed.exportedAt,
        current: summarise(cur), incoming: summarise(inc), merged: summarise(merged), changes: changes
      };
    },

    /* Clears progress. Settings and the learner name are kept unless opts.all is true. */
    reset(opts) {
      const keep = !(opts && opts.all);
      const old = state;
      state = defaults();
      if (keep) { state.settings = old.settings; state.learner.name = old.learner.name; }
      commit('*', { reset: true });
    }
  };

  /* Cross-tab sync: another tab wrote new state. */
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY || !backend) return;
    if (e.newValue === null) { state = defaults(); } else {
      try { state = normalize(JSON.parse(e.newValue)); } catch (err) { return; }
    }
    emit('*', { external: true });
  });

  G.store = store;
})();
