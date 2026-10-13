/* ACL filter simulator lab. Owner: E3b.
   Pure model first (testable in Node through tools/test-labs-b.mjs), UI after.
   Teaching simplification: relevance is independent of permission, so candidates are exchangeable. */
(function () {
  'use strict';
  var G = window.Guide;
  var ID = 'acl-simulator';
  var P = 'lab-acl-simulator-';

  /* ================= model ================= */
  var R_MAX = 0.98;            // recall with no filter at all (assumption)
  var EXTRA_CAND_MS = 0.05;    // cost per extra candidate fetched by over-fetching (assumption)
  var LIVE_SIGMA = 0.4;        // lognormal spread of one live permission check (assumption)
  var QUERIES = 2000;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function normal(rnd) { var u = 1 - rnd(), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  /* Bernoulli loop for small n, geometric skipping above that (expected work n * min(p, 1 - p)). */
  function binom(rnd, n, p) {
    if (n <= 0 || p <= 0) return 0;
    if (p >= 1) return n;
    var x, i;
    if (n <= 64) { x = 0; for (i = 0; i < n; i++) if (rnd() < p) x++; return x; }
    if (p > 0.5) return n - binom(rnd, n, 1 - p);
    var lq = Math.log(1 - p), pos = 0; x = 0;
    for (;;) { pos += Math.floor(Math.log(1 - rnd()) / lq) + 1; if (pos > n) break; x++; }
    return x;
  }
  /* Draw c items without replacement from a population of n holding v marked items; returns the marked count.
     Exact sequential draw, except for a large sample from a much larger population (c > 64 and c / n <= 5%) where the
     binomial limit is used. */
  function hyper(rnd, n, v, c) {
    if (v <= 0 || c <= 0) return 0;
    if (v >= n) return Math.min(c, n);
    if (c > 64 && c / n <= 0.05) return binom(rnd, c, v / n);
    var x = 0, pop = n, marked = v;
    for (var i = 0; i < c && pop > 0; i++) { if (rnd() * pop < marked) { x++; marked--; } pop--; }
    return x;
  }
  function pctile(sorted, q) { var n = sorted.length; return n ? sorted[Math.min(n - 1, Math.max(0, Math.ceil(q * n) - 1))] : 0; }

  /* ANN recall under a filter: floor + (R_MAX - floor) * f ^ gamma. Falls as the visible fraction f shrinks. */
  function annRecall(f, rFloor, gamma) { f = Math.min(1, Math.max(0, f)); return rFloor + (R_MAX - rFloor) * Math.pow(f, gamma); }
  /* Chance a grant was revoked inside the sync window: 1 - exp(-lambda * lag), lambda = revocations per grant per hour. */
  function staleProb(revPctPerDay, lagHours) { return 1 - Math.exp(-(revPctPerDay / 100 / 24) * lagHours); }
  /* P(no visible document among c drawn from n holding v visible). */
  function postEmptyProb(n, v, c) {
    var pr = 1; for (var i = 0; i < c; i++) { if (n - i <= 0) break; pr *= Math.max(0, (n - v - i)) / (n - i); } return pr;
  }
  function dots(n) { return new Array(n + 1).join('\u25cf') + new Array(6 - n).join('\u25cb'); }

  var STRATEGIES = [
    { id: 'post', label: 'Post-filter', colour: '--warn' },
    { id: 'pre', label: 'Pre-filter in the index', colour: '--info' },
    { id: 'prelive', label: 'Pre-filter + live check', colour: '--ok' },
    { id: 'tenant', label: 'Per-tenant index', colour: '--preview' }
  ];

  function derive(p) {
    var N = Math.max(1, Math.round(p.N)), V = Math.min(N, Math.max(0, Math.round(N * p.f)));
    var k = Math.max(1, Math.round(p.k)), m = Math.max(1, Math.round(p.m));
    return { N: N, V: V, k: k, m: m, C: Math.min(N, k * m), r: annRecall(V / N, p.rFloor, p.gamma), ps: staleProb(p.revPct, p.lagH),
             liveTop: Math.min(k, Math.max(1, Math.round(p.liveTop))), par: Math.max(1, Math.round(p.par)), copies: Math.max(1, p.G * p.f) };
  }

  function costIndicator(p) {
    var d = derive(p), out = {};
    out.post = { level: 1 + (d.m >= 5 ? 1 : 0) + (d.m >= 15 ? 1 : 0), note: 'One shared index. Cost is wasted compute: ' + d.C + ' candidates fetched to keep ' + d.k + '.' };
    out.pre = { level: 2, note: 'One shared index with filterable ACL fields and a filter-aware ANN. Recall under the filter must be measured.' };
    out.prelive = { level: 3 + (d.liveTop >= 20 ? 1 : 0), note: 'Pre-filter plus one call to the permission source per checked hit (' + d.liveTop + ' per query).' };
    var lvl = Math.min(5, Math.max(1, 1 + Math.ceil(Math.log(p.G + 1) / Math.LN10) + (d.copies >= 3 ? 1 : 0)));
    out.tenant = { level: lvl, note: Math.round(p.G) + ' indexes to operate. Each document is stored in about ' + (Math.round(d.copies * 10) / 10) + ' of them.' };
    return out;
  }

  /* Closed-form expectations used to sanity check the Monte Carlo output. */
  function analytic(p) {
    var d = derive(p);
    return {
      stale: d.ps, recall: d.r,
      postExpectedVisible: d.C * d.V / d.N,
      postEmpty: postEmptyProb(d.N, d.V, d.C),
      preExpected: Math.min(d.k, d.V) * d.r,
      leakPerResult: d.ps,
      leakPerQueryAtK: 1 - Math.pow(1 - d.ps, d.k),
      liveMeanMs: Math.exp(LIVE_SIGMA * LIVE_SIGMA / 2)
    };
  }

  function simulate(p, opts) {
    opts = opts || {};
    var Q = opts.queries || QUERIES, seed = opts.seed == null ? 20260713 : opts.seed, d = derive(p), costs = costIndicator(p);
    var mu = Math.log(Math.max(0.001, p.liveMs));
    var out = [];
    STRATEGIES.forEach(function (st, si) {
      var rnd = mulberry32(seed + si * 7919), counts = [], lats = [], leakQ = 0, leakSum = 0, resSum = 0, empty = 0;
      for (var q = 0; q < Q; q++) {
        var results = 0, leaks = 0, lat = 0, i;
        if (st.id === 'post') {
          results = Math.min(d.k, hyper(rnd, d.N, d.V, d.C));
          leaks = binom(rnd, results, d.ps);
          lat = EXTRA_CAND_MS * Math.max(0, d.C - d.k);
        } else if (st.id === 'pre') {
          results = binom(rnd, Math.min(d.k, d.V), d.r);
          leaks = binom(rnd, results, d.ps);
        } else if (st.id === 'prelive') {
          var found = binom(rnd, Math.min(d.k, d.V), d.r), checked = Math.min(found, d.liveTop), revoked = binom(rnd, checked, d.ps);
          results = found - revoked;
          leaks = binom(rnd, found - checked, d.ps);
          for (i = 0; i < checked; i += d.par) {
            var batch = Math.min(d.par, checked - i), worst = 0;
            for (var b = 0; b < batch; b++) worst = Math.max(worst, Math.exp(mu + LIVE_SIGMA * normal(rnd)));
            lat += worst;
          }
        } else {
          results = Math.min(d.k, d.V);
          leaks = binom(rnd, results, d.ps);
        }
        counts.push(results); lats.push(lat);
        if (results === 0) empty++;
        if (leaks > 0) leakQ++;
        leakSum += leaks; resSum += results;
      }
      var sc = counts.slice().sort(function (a, b) { return a - b; }), sl = lats.slice().sort(function (a, b) { return a - b; });
      out.push({
        id: st.id, label: st.label, colour: st.colour,
        median: pctile(sc, 0.5), p10: pctile(sc, 0.1), p90: pctile(sc, 0.9), mean: resSum / Q,
        emptyRate: empty / Q, leakQueryRate: leakQ / Q, leakResultRate: resSum ? leakSum / resSum : 0,
        latP50: pctile(sl, 0.5), latP95: pctile(sl, 0.95), latMean: lats.reduce(function (a, b) { return a + b; }, 0) / Q,
        cost: costs[st.id]
      });
    });
    return { strategies: out, derived: d, analytic: analytic(p), queries: Q };
  }

  var DEFAULTS = { N: 2000000, G: 120, f: 0.05, k: 10, m: 3, rFloor: 0.55, gamma: 0.5, lagH: 6, revPct: 2, liveMs: 20, liveTop: 5, par: 1 };
  var PRESETS = [
    { id: 'broad', label: 'Broad access', note: 'Most documents are visible to most callers, such as a company wiki.',
      values: { N: 200000, G: 12, f: 0.6, k: 10, m: 3, rFloor: 0.7, gamma: 0.5, lagH: 6, revPct: 1, liveMs: 20, liveTop: 5, par: 1 } },
    { id: 'group', label: 'Group based', note: 'Access follows team and project groups. A caller sees a few percent of the corpus.',
      values: { N: 2000000, G: 120, f: 0.05, k: 10, m: 3, rFloor: 0.55, gamma: 0.5, lagH: 6, revPct: 2, liveMs: 20, liveTop: 5, par: 1 } },
    { id: 'doc', label: 'Per document', note: 'Every document has its own ACL. A caller sees a tiny slice of a large corpus.',
      values: { N: 5000000, G: 50000, f: 0.0005, k: 10, m: 3, rFloor: 0.55, gamma: 0.5, lagH: 6, revPct: 2, liveMs: 20, liveTop: 5, par: 1 } }
  ];
  function presetById(id) { for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === id) return PRESETS[i]; return null; }

  var EXPERIMENTS = [
    { id: 'starve', title: 'Post-filter starves when the caller sees little',
      body: 'On broad access, post-filtering returns the full 10 results. Move to group based, where the caller sees 5%, and the median drops to 1 with about 22% of queries empty. Over-fetching 50 times fixes the count but fetches 500 candidates for 10 results.',
      buttons: [
        { label: 'Broad access', set: { preset: 'broad' } },
        { label: 'Group based', set: { preset: 'group' } },
        { label: 'Group based, over-fetch 50', set: { preset: 'group', m: 50 } }
      ] },
    { id: 'recall', title: 'Pre-filter trades empty answers for filtered recall',
      body: 'On the group-based preset the pre-filter returns about 6 or 7 of 10 because recall under a restrictive filter degrades. Lower the recall floor to 0.2 and it returns fewer. Always measure recall at the filter selectivity you will run.',
      buttons: [
        { label: 'Recall floor 0.55', set: { preset: 'group', rFloor: 0.55 } },
        { label: 'Recall floor 0.2', set: { preset: 'group', rFloor: 0.2 } }
      ] },
    { id: 'stale', title: 'Sync lag leaks revoked access, a live check closes it',
      body: 'Every index-side ACL is a copy that can go stale. With 1 hour of lag and 1% daily revocations, well under 1% of queries leak a revoked document. At 24 hours and 5% a day, up to 4 in 10 do (the per-tenant row, which returns all 10 hits). Live-checking all 10 hits takes the pre-filter plus live check row to 0% leakage, and the table shows the latency you pay.',
      buttons: [
        { label: 'Lag 1 h, 1% a day', set: { lagH: 1, revPct: 1, liveTop: 5 } },
        { label: 'Lag 24 h, 5% a day', set: { lagH: 24, revPct: 5, liveTop: 5 } },
        { label: 'Live-check all 10 hits', set: { lagH: 24, revPct: 5, liveTop: 10 } }
      ] }
  ];

  var model = {
    mulberry32: mulberry32, hyper: hyper, binom: binom, pctile: pctile, annRecall: annRecall, staleProb: staleProb, postEmptyProb: postEmptyProb,
    derive: derive, costIndicator: costIndicator, analytic: analytic, simulate: simulate, STRATEGIES: STRATEGIES, DEFAULTS: DEFAULTS,
    R_MAX: R_MAX, EXTRA_CAND_MS: EXTRA_CAND_MS, LIVE_SIGMA: LIVE_SIGMA
  };

  /* ================= UI ================= */
  var CSS = [
    '.P-root{display:grid;gap:var(--sp-4);color:var(--text);font-family:var(--font-sans);font-size:var(--fs-sm);line-height:1.5;min-width:0}',
    '.P-root *{box-sizing:border-box}',
    '.P-root [hidden]{display:none!important}',
    '.P-cols{display:grid;gap:var(--sp-2) var(--sp-5);grid-template-columns:repeat(auto-fit,minmax(min(100%,16rem),1fr));margin-top:var(--sp-4)}',
    '.P-card{background:var(--surface);border:1px solid var(--border);border-left:4px solid var(--accent);border-radius:var(--r-md);box-shadow:var(--shadow-1);padding:var(--sp-4);min-width:0}',
    '.P-card>h3,.P-card>h4{margin:0 0 var(--sp-3);font-size:var(--fs-md);line-height:var(--lh-tight);color:var(--text)}',
    '.P-grid{display:grid;gap:var(--sp-4);grid-template-columns:repeat(auto-fit,minmax(min(100%,17rem),1fr));align-items:start}',
    '.P-row{display:flex;flex-wrap:wrap;gap:var(--sp-2);align-items:center}',
    '.P-muted{color:var(--muted)}',
    '.P-caption{color:var(--muted);font-size:var(--fs-xs);margin:var(--sp-3) 0 0}',
    '.P-btn{font:inherit;color:var(--text);background:var(--surface-2);border:1px solid var(--border-strong);border-radius:var(--r-pill);padding:var(--sp-1) var(--sp-3);cursor:pointer;transition:background var(--dur) var(--ease),transform var(--dur) var(--ease)}',
    '.P-btn:hover{background:var(--surface-3)}',
    '.P-btn:active{transform:translateY(1px)}',
    '.P-btn[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}',
    '.P-input{font:inherit;color:var(--text);background:var(--surface);border:1px solid var(--border-strong);border-radius:var(--r-sm);padding:var(--sp-1) var(--sp-2);min-width:0;max-width:100%}',
    '.P-input:hover{border-color:var(--accent)}',
    '.P-field{display:grid;gap:var(--sp-1);margin-bottom:var(--sp-3)}',
    '.P-field label{font-weight:600;color:var(--text-2)}',
    '.P-fieldrow{display:flex;gap:var(--sp-3);align-items:center}',
    '.P-fieldrow input[type=range]{flex:1;min-width:0;accent-color:var(--accent)}',
    '.P-fieldrow input[type=number]{width:6.5rem}',
    '.P-hint{color:var(--muted);font-size:var(--fs-xs)}',
    '.P-group{border:0;margin:0 0 var(--sp-3);padding:0}',
    '.P-group legend{padding:0;margin:0 0 var(--sp-2);font-weight:700;color:var(--text);font-size:var(--fs-sm)}',
    '.P-note{padding:var(--sp-3);background:var(--surface-2);border-radius:var(--r-sm);margin:var(--sp-3) 0 0}',
    '.P-summary{padding:var(--sp-3);border-radius:var(--r-sm);background:var(--info-soft);border-left:4px solid var(--info);margin-bottom:var(--sp-3)}',
    '.P-svg{width:100%;height:auto;display:block}',
    '.P-tablewrap{overflow-x:auto}',
    '.P-table{width:100%;border-collapse:collapse;font-size:var(--fs-xs)}',
    '.P-table th{text-align:left;color:var(--muted);font-weight:600;padding:var(--sp-1) var(--sp-2);border-bottom:1px solid var(--border-strong);white-space:nowrap}',
    '.P-table td{padding:var(--sp-2);border-bottom:1px solid var(--border);vertical-align:top}',
    '.P-table tr:last-child td{border-bottom:0}',
    '.P-num{font-family:var(--font-mono);white-space:nowrap}',
    '.P-swatch{display:inline-block;width:.8rem;height:.8rem;border-radius:3px;margin-right:var(--sp-2);vertical-align:-1px}',
    '.P-dots{letter-spacing:2px;color:var(--text);white-space:nowrap}',
    '.P-chip{display:inline-block;font-size:var(--fs-xs);font-weight:600;padding:0 7px;border-radius:var(--r-pill);border:1px solid var(--border-strong);white-space:nowrap}',
    '.P-chip.bad{color:var(--bad);background:var(--bad-soft);border-color:var(--bad)}',
    '.P-chip.ok{color:var(--ok);background:var(--ok-soft);border-color:var(--ok)}',
    '.P-chip.warn{color:var(--warn);background:var(--warn-soft);border-color:var(--warn)}',
    '.P-notice{margin:0;padding:0;list-style:none;display:grid;gap:var(--sp-3)}',
    '.P-notice li{padding:var(--sp-3);background:var(--surface-2);border-radius:var(--r-sm)}',
    '.P-notice h4{margin:0 0 var(--sp-1);font-size:var(--fs-sm);color:var(--text)}',
    '.P-notice p{margin:0 0 var(--sp-2);color:var(--text-2)}',
    '@media (max-width:480px){.P-card{padding:var(--sp-3)}.P-fieldrow{flex-wrap:wrap}}'
  ].join('\n').replace(/\.P-/g, '.' + P);

  function injectStyle() {
    if (document.getElementById(P + 'style')) return;
    var s = document.createElement('style'); s.id = P + 'style'; s.textContent = CSS; document.head.appendChild(s);
  }
  var NS = 'http://www.w3.org/2000/svg';
  function sv(tag, attrs, style) {
    var e = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    Object.keys(style || {}).forEach(function (k) { e.style[k] = style[k]; });
    return e;
  }
  function svgText(x, y, str, size, fill, anchor, weight) {
    var t = sv('text', { x: x, y: y, 'font-size': size, 'text-anchor': anchor || 'start' }, { fill: fill || 'var(--text-2)', fontWeight: weight || '400' }); t.textContent = str; return t;
  }
  function fmtN(n) { return n >= 1e6 ? (Math.round(n / 1e5) / 10) + 'M' : n >= 1e3 ? (Math.round(n / 100) / 10) + 'k' : String(Math.round(n)); }
  function pc(x, d) { return (x * 100).toFixed(d == null ? 1 : d) + '%'; }

  function mount(container, api) {
    injectStyle();
    var h = G.el, uid = G.uid('acl');
    var saved = api.load() || {};
    var state = { preset: saved.preset || 'group', p: Object.assign({}, DEFAULTS, (presetById(saved.preset || 'group') || PRESETS[1]).values, saved.p || {}) };
    var timer = null;

    function persist() { api.save({ preset: state.preset, p: state.p }); }

    var fields = {};
    function field(key, label, min, max, step, opts) {
      opts = opts || {};
      var id = G.uid(P + 'f'), log = !!opts.log;
      var range = h('input', { type: 'range', id: id, min: log ? Math.log10(min) : min, max: log ? Math.log10(max) : max, step: log ? 0.01 : step });
      var num = h('input', { type: 'number', class: P + 'input', min: min, max: max, step: opts.numStep || step, 'aria-label': label + ' value' });
      var hint = opts.hint ? h('span', { class: P + 'hint' }, opts.hint) : null;
      function sync() { var v = state.p[key]; range.value = log ? Math.log10(v) : v; num.value = v; }
      function set(v) {
        v = G.clamp(v, min, max);
        if (opts.integer) v = Math.round(v); else if (!log) v = Math.round(v / step) * step;
        state.p[key] = Number(v.toPrecision(6)); sync(); changed();
      }
      range.addEventListener('input', function () { var v = Number(range.value); set(log ? Math.pow(10, v) : v); });
      num.addEventListener('change', function () { var v = Number(num.value); if (isFinite(v)) set(v); else sync(); });
      fields[key] = { sync: sync, num: num, range: range };
      return h('div', { class: P + 'field' }, h('label', { for: id }, label), h('div', { class: P + 'fieldrow' }, range, num), hint);
    }

    var presetBtns = {}, presetRow = h('div', { class: P + 'row', role: 'group', 'aria-label': 'Access pattern preset' });
    PRESETS.forEach(function (pr) {
      var b = h('button', { type: 'button', class: P + 'btn', 'aria-pressed': 'false', on: { click: function () { applySet({ preset: pr.id }); } } }, pr.label);
      presetBtns[pr.id] = b; presetRow.appendChild(b);
    });
    var presetNote = h('p', { class: P + 'note' });

    var controls = h('section', { class: P + 'card', 'aria-labelledby': uid + '-h1' },
      h('h3', { id: uid + '-h1' }, 'Corpus, caller and retrieval'),
      presetRow, presetNote,
      h('div', { class: P + 'cols' },
      h('fieldset', { class: P + 'group' }, h('legend', null, 'Corpus and caller'),
        field('N', 'Corpus size (chunks)', 1000, 100000000, 1, { log: true, integer: true }),
        field('G', 'Number of groups', 1, 1000000, 1, { log: true, integer: true, hint: 'Drives per-tenant index count only.' }),
        field('f', 'Visible fraction for the caller', 0.0001, 1, 0.0001, { log: true, hint: 'Share of the corpus this caller may read.' })),
      h('fieldset', { class: P + 'group' }, h('legend', null, 'Retrieval'),
        field('k', 'Top-k wanted', 1, 50, 1, { integer: true }),
        field('m', 'Post-filter over-fetch multiplier', 1, 50, 1, { integer: true, hint: 'Candidates fetched = k x multiplier.' }),
        field('rFloor', 'Filtered ANN recall floor (visible fraction near 0)', 0, 0.98, 0.01, { hint: 'Recall with no filter is fixed at 0.98.' }),
        field('gamma', 'Recall curve exponent', 0.1, 2, 0.05, { hint: 'Higher values degrade recall sooner as the filter tightens.' })),
      h('fieldset', { class: P + 'group' }, h('legend', null, 'ACL freshness and live check'),
        field('lagH', 'ACL sync lag (hours)', 0, 168, 0.5),
        field('revPct', 'Revocation rate (% of grants per day)', 0, 20, 0.1),
        field('liveMs', 'Live-check latency per hit (ms, median)', 1, 500, 1),
        field('liveTop', 'Top hits live-checked', 1, 50, 1, { integer: true }),
        field('par', 'Live checks in parallel', 1, 16, 1, { integer: true }))));

    var summaryBox = h('div', { 'aria-live': 'polite' });
    var chartBox = h('div', { style: { maxWidth: '44rem' } });
    var tableBox = h('div', { class: P + 'tablewrap' });
    var checkBox = h('p', { class: P + 'caption' });
    var curveBox = h('div');
    var barsBox = h('div', { style: { display: 'grid', gap: 'var(--sp-4)' } });
    var results = h('section', { class: P + 'card', 'aria-labelledby': uid + '-h2' },
      h('h3', { id: uid + '-h2' }, 'Monte Carlo results, ' + QUERIES + ' queries per strategy'),
      summaryBox,
      h('h4', { style: { margin: '0 0 var(--sp-2)', fontSize: 'var(--fs-sm)' } }, 'Results returned out of k (bar = 10th to 90th percentile, tick = median)'), chartBox,
      h('h4', { style: { margin: 'var(--sp-4) 0 var(--sp-2)', fontSize: 'var(--fs-sm)' } }, 'Comparison table'), tableBox, checkBox,
      h('div', { class: P + 'grid', style: { marginTop: 'var(--sp-4)' } },
        h('div', null, h('h4', { style: { margin: '0 0 var(--sp-2)', fontSize: 'var(--fs-sm)' } }, 'Assumed ANN recall under the filter'), curveBox),
        h('div', null, barsBox)),
      h('p', { class: P + 'caption' }, 'Teaching simplification, not a benchmark. Relevance is assumed independent of permission, so candidates are exchangeable and a post-filter sees visible documents in proportion to the visible fraction (hypergeometric draw). Pre-filter returns each wanted result with the filtered recall chance. Stale ACL: a grant is wrongly visible with probability 1 - exp(-lambda x lag), lambda = daily revocation rate / 24. A live check queries the permission source and drops revoked hits. Latency constants are illustrative: ' + EXTRA_CAND_MS + ' ms per extra candidate, live checks lognormal with sigma ' + LIVE_SIGMA + '. Seeded random numbers, so results are repeatable.'));

    var notice = h('section', { class: P + 'card', 'aria-labelledby': uid + '-h3' },
      h('h3', { id: uid + '-h3' }, 'What to notice'),
      h('ol', { class: P + 'notice' }, EXPERIMENTS.map(function (ex) {
        return h('li', null, h('h4', null, ex.title), h('p', null, ex.body),
          h('div', { class: P + 'row' }, ex.buttons.map(function (bt) {
            return h('button', { type: 'button', class: P + 'btn', on: { click: function () { applySet(bt.set); } } }, bt.label);
          })));
      })));

    container.appendChild(h('div', { class: P + 'root', 'data-lab': ID }, controls, results, notice));

    function applySet(set) {
      if (set.preset) { var pr = presetById(set.preset); state.preset = pr.id; state.p = Object.assign({}, DEFAULTS, pr.values); }
      Object.keys(set).forEach(function (k) { if (k !== 'preset') state.p[k] = set[k]; });
      Object.keys(fields).forEach(function (k) { fields[k].sync(); });
      changed(true);
    }
    function changed(now) { if (now) refresh(); else { clearTimeout(timer); timer = setTimeout(refresh, 90); } }

    function resultsChart(sim, k) {
      var W = 560, rowH = 46, H = 28 + rowH * sim.strategies.length, x0 = 12, x1 = W - 16;
      var svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, class: P + 'svg', role: 'img',
        'aria-label': 'Results returned per strategy out of ' + k + ': ' + sim.strategies.map(function (s) { return s.label + ' median ' + s.median + ', 10th percentile ' + s.p10 + ', 90th percentile ' + s.p90; }).join('; ') });
      function X(v) { return x0 + (v / k) * (x1 - x0); }
      sim.strategies.forEach(function (s, i) {
        var y = 6 + i * rowH;
        svg.appendChild(svgText(x0, y + 12, s.label + (s.emptyRate >= 0.005 ? '  (empty answers ' + pc(s.emptyRate, 0) + ')' : ''), 12, 'var(--text)', 'start', '600'));
        svg.appendChild(sv('rect', { x: x0, y: y + 20, width: x1 - x0, height: 14, rx: 4 }, { fill: 'var(--surface-3)' }));
        var a = X(s.p10), b = X(s.p90);
        svg.appendChild(sv('rect', { x: a, y: y + 20, width: Math.max(4, b - a), height: 14, rx: 4 }, { fill: 'var(' + s.colour + ')', opacity: '0.85' }));
        svg.appendChild(sv('rect', { x: X(s.median) - 1.5, y: y + 17, width: 3, height: 20, rx: 1 }, { fill: 'var(--text)' }));
      });
      var ay = 6 + sim.strategies.length * rowH + 6;
      [0, 0.5, 1].forEach(function (t) { svg.appendChild(svgText(X(t * k), ay + 10, String(Math.round(t * k)), 11, 'var(--muted)', t === 0 ? 'start' : t === 1 ? 'end' : 'middle')); });
      svg.appendChild(sv('line', { x1: X(k), x2: X(k), y1: 2, y2: ay - 2, 'stroke-dasharray': '4 3', 'stroke-width': 1.5 }, { stroke: 'var(--text-2)' }));
      return svg;
    }

    function curveChart(p) {
      var W = 340, H = 210, l = 36, r = 16, t = 10, b = 44, lo = -4, hi = 0;
      var rec = annRecall(p.f, p.rFloor, p.gamma);
      var svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, class: P + 'svg', role: 'img', 'aria-label': 'Assumed filtered ANN recall against visible fraction on a log axis. At the current visible fraction of ' + pc(p.f, 3) + ' recall is ' + rec.toFixed(2) + '.' });
      function X(lf) { return l + (lf - lo) / (hi - lo) * (W - l - r); }
      function Y(v) { return t + (1 - v) * (H - t - b); }
      [0, 0.25, 0.5, 0.75, 1].forEach(function (v) {
        svg.appendChild(sv('line', { x1: l, x2: W - r, y1: Y(v), y2: Y(v), 'stroke-width': 1 }, { stroke: 'var(--border)' }));
        svg.appendChild(svgText(l - 5, Y(v) + 4, v.toFixed(2).replace(/0$/, ''), 10, 'var(--muted)', 'end'));
      });
      [-4, -3, -2, -1, 0].forEach(function (e) { svg.appendChild(svgText(X(e), H - 26, e === 0 ? '100%' : (e === -1 ? '10%' : e === -2 ? '1%' : e === -3 ? '0.1%' : '0.01%'), 10, 'var(--muted)', e === 0 ? 'end' : 'middle')); });
      var pts = [], i;
      for (i = 0; i <= 80; i++) { var lf = lo + (hi - lo) * i / 80; pts.push(X(lf).toFixed(1) + ',' + Y(annRecall(Math.pow(10, lf), p.rFloor, p.gamma)).toFixed(1)); }
      svg.appendChild(sv('polyline', { points: pts.join(' '), fill: 'none', 'stroke-width': 2.5 }, { stroke: 'var(--accent)' }));
      var lf0 = Math.log10(Math.max(1e-4, p.f)), mx = X(lf0), my = Y(rec);
      svg.appendChild(sv('circle', { cx: mx, cy: my, r: 5.5 }, { fill: 'var(--bad)', stroke: 'var(--surface)', strokeWidth: '2' }));
      var leftSide = mx > l + 70;
      svg.appendChild(svgText(leftSide ? mx - 9 : mx + 9, leftSide ? my - 9 : my + 17, 'now ' + rec.toFixed(2), 11, 'var(--text)', leftSide ? 'end' : 'start', '600'));
      svg.appendChild(svgText((l + W - r) / 2, H - 6, 'visible fraction of the corpus (log scale)', 10, 'var(--muted)', 'middle'));
      return svg;
    }

    function miniBars(title, items, unitFmt, ariaUnit) {
      var W = 300, rowH = 26, H = 8 + rowH * items.length, max = Math.max.apply(null, items.map(function (i) { return i.v; }).concat([1e-9]));
      var svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, class: P + 'svg', role: 'img', 'aria-label': title + ': ' + items.map(function (i) { return i.label + ' ' + unitFmt(i.v); }).join('; ') });
      items.forEach(function (it, i) {
        var y = 4 + i * rowH, w = Math.max(it.v > 0 ? 3 : 0, (it.v / max) * (W - 108 - 70));
        svg.appendChild(svgText(0, y + 14, it.label, 11, 'var(--text-2)'));
        svg.appendChild(sv('rect', { x: 108, y: y + 3, width: w, height: 14, rx: 3 }, { fill: 'var(' + it.colour + ')' }));
        svg.appendChild(svgText(108 + w + 5, y + 14, unitFmt(it.v), 11, 'var(--text)', 'start', '600'));
      });
      return h('div', null, h('h4', { style: { margin: '0 0 var(--sp-2)', fontSize: 'var(--fs-sm)' } }, title), svg);
    }

    function refresh() {
      var p = state.p;
      Object.keys(presetBtns).forEach(function (id) { presetBtns[id].setAttribute('aria-pressed', String(id === state.preset)); });
      var pr = presetById(state.preset);
      presetNote.textContent = pr ? pr.note + ' Sliders below can override any value.' : 'Custom settings.';
      fields.liveTop.num.max = p.k; fields.liveTop.range.max = p.k;
      if (p.liveTop > p.k) { p.liveTop = p.k; fields.liveTop.sync(); }
      var sim = simulate(p), d = sim.derived, a = sim.analytic;
      var S = {}; sim.strategies.forEach(function (s) { S[s.id] = s; });

      G.clear(summaryBox);
      summaryBox.appendChild(h('div', { class: P + 'summary', role: 'status' },
        'The caller can see ' + fmtN(d.V) + ' of ' + fmtN(d.N) + ' chunks. Post-filter fetches ' + d.C + ' candidates and keeps about ' + (Math.round(a.postExpectedVisible * 10) / 10) + ' visible ones on average (median ' + S.post.median + ' of ' + d.k + ', empty ' + pc(S.post.emptyRate, 0) + '). Pre-filter median ' + S.pre.median + '. Stale-ACL chance per returned result: ' + pc(d.ps, 2) + '.'));

      G.clear(chartBox); chartBox.appendChild(resultsChart(sim, d.k));

      var tbl = h('table', { class: P + 'table' }, h('thead', null, h('tr', null,
        ['Strategy', 'Median', 'p10', 'p90', 'Empty', 'Leak / query', 'Leak / result', 'Latency p50 / p95', 'Cost'].map(function (c) { return h('th', { scope: 'col' }, c); }))));
      var tb = h('tbody');
      sim.strategies.forEach(function (s) {
        var leakCls = s.leakQueryRate === 0 ? 'ok' : s.leakQueryRate >= 0.05 ? 'bad' : 'warn';
        tb.appendChild(h('tr', null,
          h('td', null, h('span', { class: P + 'swatch', style: { background: 'var(' + s.colour + ')' }, 'aria-hidden': 'true' }), h('b', null, s.label)),
          h('td', { class: P + 'num' }, String(s.median)), h('td', { class: P + 'num' }, String(s.p10)), h('td', { class: P + 'num' }, String(s.p90)),
          h('td', { class: P + 'num' }, pc(s.emptyRate)),
          h('td', null, h('span', { class: P + 'chip ' + leakCls }, pc(s.leakQueryRate))),
          h('td', { class: P + 'num' }, pc(s.leakResultRate, 2)),
          h('td', { class: P + 'num' }, s.latP50.toFixed(1) + ' / ' + s.latP95.toFixed(1) + ' ms'),
          h('td', null, h('span', { class: P + 'dots', 'aria-label': 'Cost indicator ' + s.cost.level + ' of 5' }, dots(s.cost.level)), h('div', { class: P + 'hint' }, s.cost.note))));
      });
      tbl.appendChild(tb); G.clear(tableBox); tableBox.appendChild(tbl);

      checkBox.textContent = 'Closed-form check (no simulation): post-filter expects k x multiplier x visible fraction = ' + a.postExpectedVisible.toFixed(2) + ' visible candidates and returns nothing with probability ' + pc(a.postEmpty, 2) +
        '. Pre-filter expects min(k, visible) x recall = ' + a.preExpected.toFixed(2) + ' results. Per-query leak chance with k results and no live check is 1 - (1 - ' + pc(d.ps, 2) + ')^k = ' + pc(a.leakPerQueryAtK, 1) + '. Cost dots are an indicator, not a price.';

      G.clear(curveBox); curveBox.appendChild(curveChart(p));
      G.clear(barsBox);
      barsBox.appendChild(miniBars('Queries leaking a revoked document', sim.strategies.map(function (s) { return { label: s.label.replace('Pre-filter in the index', 'Pre-filter').replace('Pre-filter + live check', 'Pre + live'), v: s.leakQueryRate, colour: s.colour }; }), function (v) { return pc(v, 1); }));
      barsBox.appendChild(miniBars('Added latency, p95', sim.strategies.map(function (s) { return { label: s.label.replace('Pre-filter in the index', 'Pre-filter').replace('Pre-filter + live check', 'Pre + live'), v: s.latP95, colour: s.colour }; }), function (v) { return v.toFixed(1) + ' ms'; }));
      persist();
    }

    Object.keys(fields).forEach(function (k) { fields[k].sync(); });
    refresh();
    return { destroy: function () { clearTimeout(timer); G.clear(container); } };
  }

  G.labs.register(ID, { mount: mount, model: model, presets: PRESETS, experiments: EXPERIMENTS });
})();
