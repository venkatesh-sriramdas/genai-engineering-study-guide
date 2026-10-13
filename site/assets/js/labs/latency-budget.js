/* Follow the Question: Latency budget builder lab. Owner: E3a.
   Part 1 is the pure model (also exported for Node tests). Part 2 is the UI.
   Defaults are illustrative, not measurements of any product. */
(function () {
  'use strict';

  /* ======================= Part 1: model ======================= */
  var Z95 = 1.6448536269514722;
  var DRAWS = 5000;

  var STAGES = [
    { id: 'auth', label: 'Authentication', short: 'Auth' },
    { id: 'rewrite', label: 'Query rewrite (LLM)', short: 'Rewrite (LLM)' },
    { id: 'embed', label: 'Embedding', short: 'Embedding' },
    { id: 'retrieve', label: 'Retrieval', short: 'Retrieval' },
    { id: 'rerank', label: 'Rerank', short: 'Rerank' },
    { id: 'inguard', label: 'Input guard', short: 'Input guard' },
    { id: 'assemble', label: 'Prompt assembly', short: 'Assembly' },
    { id: 'ttft', label: 'Model time to first token', short: 'Model TTFT' },
    { id: 'gen', label: 'Generation', short: 'Generation' },
    { id: 'outguard', label: 'Output guard', short: 'Output guard' },
    { id: 'network', label: 'Network', short: 'Network' }
  ];
  var BRANCH = ['rewrite', 'embed', 'retrieve', 'rerank'];
  var FIRST_TOKEN_IDS = ['auth', 'rewrite', 'embed', 'retrieve', 'rerank', 'inguard', 'assemble', 'ttft', 'network'];

  function mkPreset(id, name, note, ms, gen, toggles, target) {
    var stages = {};
    Object.keys(ms).forEach(function (k) { stages[k] = { p50: ms[k][0], p95: ms[k][1] }; });
    return {
      id: id, name: name, note: note, stages: stages, gen: gen, toggles: toggles, target: target,
      assume: { cacheCutPct: 50, smallTtft: 0.6, smallSpeed: 1.5 }
    };
  }

  var PRESETS = [
    mkPreset('chat', 'Interactive chat', 'Streaming RAG chat with a rewrite step and serial guards. Illustrative numbers in milliseconds.',
      { auth: [15, 40], rewrite: [400, 900], embed: [35, 80], retrieve: [60, 180], rerank: [110, 260], inguard: [90, 220],
        assemble: [8, 20], ttft: [550, 1400], outguard: [70, 180], network: [60, 160] },
      { tokens: 350, tps: 60, tpsSlow: 35 },
      { parallelGuard: false, stream: true, skipRewrite: false, cacheHit: false, smallModel: false },
      { first: 2500, total: 12000 }),
    mkPreset('voice', 'Voice', 'Short spoken answers: no rewrite, guard in parallel, fast stages. Text-to-speech time is not modelled.',
      { auth: [10, 25], rewrite: [300, 700], embed: [25, 60], retrieve: [40, 110], rerank: [60, 140], inguard: [40, 100],
        assemble: [5, 12], ttft: [300, 800], outguard: [30, 80], network: [40, 120] },
      { tokens: 60, tps: 80, tpsSlow: 50 },
      { parallelGuard: true, stream: true, skipRewrite: true, cacheHit: false, smallModel: false },
      { first: 1200, total: 3500 }),
    mkPreset('batch', 'Batch summarisation', 'Long input, long output, no retrieval, no streaming. Only the total matters.',
      { auth: [5, 15], rewrite: [300, 700], embed: [0, 0], retrieve: [0, 0], rerank: [0, 0], inguard: [100, 250],
        assemble: [30, 80], ttft: [1500, 4000], outguard: [150, 400], network: [30, 80] },
      { tokens: 1200, tps: 45, tpsSlow: 30 },
      { parallelGuard: false, stream: false, skipRewrite: true, cacheHit: false, smallModel: false },
      { first: 45000, total: 45000 })
  ];
  var BASE = PRESETS[0];

  function clampNum(v, lo, hi, d) {
    v = Number(v);
    if (!isFinite(v)) v = d;
    return Math.min(hi, Math.max(lo, v));
  }

  function sanitize(raw) {
    var r = raw || {}, s = { stages: {}, gen: {}, toggles: {}, assume: {}, target: {} };
    STAGES.forEach(function (st) {
      if (st.id === 'gen') return;
      var rs = (r.stages || {})[st.id] || {}, d = BASE.stages[st.id];
      s.stages[st.id] = { p50: clampNum(rs.p50, 0, 600000, d.p50), p95: clampNum(rs.p95, 0, 600000, d.p95) };
    });
    var g = r.gen || {};
    s.gen.tokens = Math.round(clampNum(g.tokens, 0, 100000, BASE.gen.tokens));
    s.gen.tps = clampNum(g.tps, 1, 10000, BASE.gen.tps);
    s.gen.tpsSlow = clampNum(g.tpsSlow, 1, 10000, BASE.gen.tpsSlow);
    ['parallelGuard', 'stream', 'skipRewrite', 'cacheHit', 'smallModel'].forEach(function (k) {
      s.toggles[k] = (r.toggles || {})[k] === undefined ? BASE.toggles[k] : !!(r.toggles || {})[k];
    });
    var a = r.assume || {};
    s.assume.cacheCutPct = clampNum(a.cacheCutPct, 0, 95, 50);
    s.assume.smallTtft = clampNum(a.smallTtft, 0.05, 1, 0.6);
    s.assume.smallSpeed = clampNum(a.smallSpeed, 1, 5, 1.5);
    var t = r.target || {};
    s.target.first = clampNum(t.first, 0, 3600000, BASE.target.first);
    s.target.total = clampNum(t.total, 0, 3600000, BASE.target.total);
    s.seed = Math.round(clampNum(r.seed, 1, 1e9, 11));
    s.preset = typeof r.preset === 'string' ? r.preset : 'custom';
    return s;
  }

  /* Per-stage p50 and p95 in ms after the toggles are applied. p95 is never below p50. */
  function stageDist(s) {
    var dist = {}, t = s.toggles, a = s.assume;
    STAGES.forEach(function (st) {
      if (st.id === 'gen') return;
      var p50 = s.stages[st.id].p50, p95 = Math.max(s.stages[st.id].p95, p50);
      if (st.id === 'rewrite' && t.skipRewrite) { p50 = 0; p95 = 0; }
      if (st.id === 'ttft') {
        var f = (t.cacheHit ? 1 - a.cacheCutPct / 100 : 1) * (t.smallModel ? a.smallTtft : 1);
        p50 *= f; p95 *= f;
      }
      dist[st.id] = { p50: p50, p95: p95 };
    });
    var speed = t.smallModel ? a.smallSpeed : 1, tps = s.gen.tps * speed, slow = Math.min(s.gen.tpsSlow, s.gen.tps) * speed;
    dist.gen = { p50: s.gen.tokens / tps * 1000, p95: s.gen.tokens / slow * 1000 };
    return dist;
  }

  function pick(dist, which) {
    var d = {};
    Object.keys(dist).forEach(function (k) { d[k] = dist[k][which]; });
    return d;
  }

  /* Lay stages on a timeline. d = durations in ms by stage id, o = { parallelGuard, stream }.
     With a parallel guard the retrieval branch (rewrite, embed, retrieve, rerank) and the input guard start together. */
  function schedule(d, o) {
    var at = {}, t = d.auth, onPath = {}, ttftEnd, total, guardOn = false;
    at.auth = [0, d.auth];
    STAGES.forEach(function (st) { onPath[st.id] = true; });
    if (o.parallelGuard) {
      var t0 = t, a = t0, sumA = 0;
      BRANCH.forEach(function (id) { sumA += d[id]; });
      guardOn = d.inguard > sumA;
      BRANCH.forEach(function (id) { at[id] = [a, a + d[id]]; a += d[id]; onPath[id] = !guardOn; });
      at.inguard = [t0, t0 + d.inguard];
      onPath.inguard = guardOn;
      t = t0 + Math.max(sumA, d.inguard);
    } else {
      ['rewrite', 'embed', 'retrieve', 'rerank', 'inguard'].forEach(function (id) { at[id] = [t, t + d[id]]; t += d[id]; });
    }
    ['assemble', 'ttft', 'gen', 'outguard', 'network'].forEach(function (id) {
      at[id] = [t, t + d[id]];
      t += d[id];
      if (id === 'ttft') ttftEnd = t;
    });
    total = t;
    return {
      at: at, onPath: onPath, ttftEnd: ttftEnd, total: total,
      first: o.stream ? ttftEnd + d.network : total
    };
  }

  /* Stage on the critical path with the largest duration; ids limits the candidates. */
  function bottleneck(sch, ids) {
    var best = null, bestD = 0;
    STAGES.forEach(function (st) {
      if (ids && ids.indexOf(st.id) < 0) return;
      if (!sch.onPath[st.id]) return;
      var dur = sch.at[st.id][1] - sch.at[st.id][0];
      if (dur > bestD) { bestD = dur; best = st.id; }
    });
    return best ? { id: best, ms: bestD } : null;
  }

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Lognormal with median p50 and 95th percentile p95: mu = ln p50, sigma = (ln p95 - ln p50) / z95. */
  function lognormalParams(p50, p95) {
    if (!(p50 > 0)) return { zero: true, mu: 0, sigma: 0 };
    return { zero: false, mu: Math.log(p50), sigma: p95 > p50 ? (Math.log(p95) - Math.log(p50)) / Z95 : 0 };
  }

  function percentile(sorted, q) {
    var n = sorted.length;
    if (!n) return 0;
    var pos = (n - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }

  function describeSamples(arr) {
    var sorted = Float64Array.from(arr).sort(), sum = 0;
    for (var i = 0; i < sorted.length; i++) sum += sorted[i];
    return { sorted: sorted, p50: percentile(sorted, 0.5), p95: percentile(sorted, 0.95), p99: percentile(sorted, 0.99), mean: sum / sorted.length };
  }

  /* Monte Carlo of the whole pipeline. dist = stageDist output. Returns samples for first visible token and complete answer. */
  function monteCarlo(dist, o, n, seed) {
    n = n || DRAWS;
    var rnd = mulberry32(seed || 1), params = {}, spare = null;
    STAGES.forEach(function (st) { params[st.id] = lognormalParams(dist[st.id].p50, dist[st.id].p95); });
    function normal() {
      if (spare !== null) { var z = spare; spare = null; return z; }
      var u = 1 - rnd(), v = rnd(), r = Math.sqrt(-2 * Math.log(u));
      spare = r * Math.sin(2 * Math.PI * v);
      return r * Math.cos(2 * Math.PI * v);
    }
    var firsts = new Float64Array(n), totals = new Float64Array(n), d = {};
    for (var i = 0; i < n; i++) {
      for (var j = 0; j < STAGES.length; j++) {
        var id = STAGES[j].id, p = params[id];
        d[id] = p.zero ? 0 : Math.exp(p.mu + p.sigma * normal());
      }
      var sch = schedule(d, o);
      firsts[i] = sch.first;
      totals[i] = sch.total;
    }
    return { n: n, first: describeSamples(firsts), total: describeSamples(totals) };
  }

  function analyze(s) {
    var dist = stageDist(s), o = { parallelGuard: s.toggles.parallelGuard, stream: s.toggles.stream };
    var s50 = schedule(pick(dist, 'p50'), o), s95 = schedule(pick(dist, 'p95'), o);
    return {
      dist: dist, opts: o, s50: s50, s95: s95, mc: monteCarlo(dist, o, DRAWS, s.seed),
      bottleFirst: bottleneck(s50, o.stream ? FIRST_TOKEN_IDS : null), bottleTotal: bottleneck(s50, null),
      tailFirst: bottleneck(s95, o.stream ? FIRST_TOKEN_IDS : null), tailTotal: bottleneck(s95, null)
    };
  }

  var model = {
    Z95: Z95, DRAWS: DRAWS, STAGES: STAGES, PRESETS: PRESETS, sanitize: sanitize, stageDist: stageDist, pick: pick, schedule: schedule,
    bottleneck: bottleneck, lognormalParams: lognormalParams, percentile: percentile, monteCarlo: monteCarlo, analyze: analyze, mulberry32: mulberry32
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = model;

  /* ======================= Part 2: UI ======================= */
  if (typeof window === 'undefined' || !window.Guide || !window.Guide.labs) return;

  var G = window.Guide;
  var P = 'lab-latency-budget-';
  var SVGNS = 'http://www.w3.org/2000/svg';

  var CSS = [
    '.lab-latency-budget-root{display:grid;gap:var(--sp-5);color:var(--text);font-family:var(--font-sans);font-size:calc(var(--fs-md) * var(--font-scale, 1));line-height:var(--lh-body);min-width:0}',
    '.lab-latency-budget-root *{box-sizing:border-box}',
    '.lab-latency-budget-root p{margin:0}',
    '.lab-latency-budget-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);box-shadow:var(--shadow-1);padding:var(--sp-4);min-width:0}',
    '.lab-latency-budget-card-accent{border-left:4px solid var(--accent-line, var(--accent))}',
    '.lab-latency-budget-h{margin:0 0 var(--sp-3);font-size:var(--fs-lg);line-height:var(--lh-tight);font-weight:650}',
    '.lab-latency-budget-sub{margin:var(--sp-4) 0 var(--sp-2);font-size:var(--fs-sm);font-weight:650;color:var(--text-2);text-transform:uppercase;letter-spacing:.04em}',
    '.lab-latency-budget-muted{color:var(--muted);font-size:var(--fs-sm)}',
    '.lab-latency-budget-caption{color:var(--muted);font-size:var(--fs-xs);margin-top:var(--sp-2)}',
    '.lab-latency-budget-code{display:block;margin:var(--sp-2) 0;padding:var(--sp-3);background:var(--code-bg);border:1px solid var(--border);border-radius:var(--r-sm);font-family:var(--font-mono);font-size:var(--fs-sm);overflow-x:auto;white-space:pre}',
    '.lab-latency-budget-layout{display:grid;gap:var(--sp-5);grid-template-columns:repeat(auto-fit,minmax(min(100%,26rem),1fr));align-items:start}',
    '.lab-latency-budget-row{display:flex;flex-wrap:wrap;gap:var(--sp-2);align-items:center}',
    '.lab-latency-budget-fields{display:grid;gap:var(--sp-3) var(--sp-4);grid-template-columns:repeat(auto-fit,minmax(9.5rem,1fr))}',
    '.lab-latency-budget-field{display:grid;gap:var(--sp-1);align-content:start;min-width:0}',
    '.lab-latency-budget-field label{font-size:var(--fs-sm);font-weight:600;color:var(--text)}',
    '.lab-latency-budget-unit{font-weight:400;color:var(--muted)}',
    '.lab-latency-budget-hint{font-size:var(--fs-xs);color:var(--muted)}',
    '.lab-latency-budget-input{font:inherit;font-size:var(--fs-sm);width:100%;min-height:2.25rem;padding:.35rem .55rem;color:var(--text);background:var(--surface);border:1px solid var(--border-strong);border-radius:var(--r-sm);font-variant-numeric:tabular-nums;transition:border-color var(--dur) var(--ease),background var(--dur) var(--ease)}',
    '.lab-latency-budget-input:hover{border-color:var(--accent);background:var(--surface-2)}',
    '.lab-latency-budget-input[aria-invalid="true"]{border-color:var(--bad);background:var(--bad-soft)}',
    '.lab-latency-budget-btn{font:inherit;font-size:var(--fs-sm);padding:.4rem .75rem;min-height:2.25rem;color:var(--text);background:var(--surface-2);border:1px solid var(--border-strong);border-radius:var(--r-sm);cursor:pointer;transition:background var(--dur) var(--ease),border-color var(--dur) var(--ease),transform var(--dur) var(--ease)}',
    '.lab-latency-budget-btn:hover{background:var(--surface-3);border-color:var(--accent)}',
    '.lab-latency-budget-btn:active{transform:translateY(1px)}',
    '.lab-latency-budget-btn[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}',
    '.lab-latency-budget-stagegrid{display:grid;grid-template-columns:minmax(0,1fr) 5.25rem 5.25rem;gap:var(--sp-2) var(--sp-2);align-items:center}',
    '.lab-latency-budget-colhead{font-size:var(--fs-xs);font-weight:650;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}',
    '.lab-latency-budget-stagename{font-size:var(--fs-sm);min-width:0}',
    '.lab-latency-budget-toggles{display:grid;gap:var(--sp-2)}',
    '.lab-latency-budget-check{display:flex;gap:var(--sp-2);align-items:flex-start;font-size:var(--fs-sm);cursor:pointer;min-height:1.75rem}',
    '.lab-latency-budget-check input{width:1.1rem;height:1.1rem;margin-top:.2rem;accent-color:var(--accent);flex:none;cursor:pointer}',
    '.lab-latency-budget-details{margin-top:var(--sp-3);border:1px solid var(--border);border-radius:var(--r-sm);padding:var(--sp-2) var(--sp-3);background:var(--surface-2)}',
    '.lab-latency-budget-details summary{cursor:pointer;font-size:var(--fs-sm);font-weight:600}',
    '.lab-latency-budget-chip{display:inline-block;padding:2px 10px;border-radius:var(--r-pill);font-size:var(--fs-xs);font-weight:600;background:var(--info-soft);color:var(--info);border:1px solid currentColor}',
    '.lab-latency-budget-chip-ok{background:var(--ok-soft);color:var(--ok)}',
    '.lab-latency-budget-chip-bad{background:var(--bad-soft);color:var(--bad)}',
    '.lab-latency-budget-chip-warn{background:var(--warn-soft);color:var(--warn)}',
    '.lab-latency-budget-tiles{display:grid;gap:var(--sp-3);grid-template-columns:repeat(auto-fit,minmax(8.25rem,1fr));margin:0}',
    '.lab-latency-budget-tile{background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-sm);padding:var(--sp-3);min-width:0}',
    '.lab-latency-budget-tile dt{font-size:var(--fs-xs);color:var(--muted);margin:0}',
    '.lab-latency-budget-tile dd{margin:2px 0 0;font-size:var(--fs-xl);font-weight:700;line-height:var(--lh-tight);font-variant-numeric:tabular-nums}',
    '.lab-latency-budget-tile dd small{display:block;font-size:var(--fs-xs);font-weight:500;color:var(--muted)}',
    '.lab-latency-budget-tablewrap{overflow-x:auto}',
    '.lab-latency-budget-table{width:100%;border-collapse:collapse;font-size:var(--fs-sm);font-variant-numeric:tabular-nums}',
    '.lab-latency-budget-table th,.lab-latency-budget-table td{padding:var(--sp-2);border-bottom:1px solid var(--border);text-align:right;white-space:nowrap}',
    '.lab-latency-budget-table th:first-child,.lab-latency-budget-table td:first-child{text-align:left;white-space:normal}',
    '.lab-latency-budget-table thead th{font-size:var(--fs-xs);color:var(--muted);font-weight:650}',
    '.lab-latency-budget-chart{width:100%;min-width:0}',
    '.lab-latency-budget-chart svg{display:block;max-width:100%}',
    '.lab-latency-budget-bar{fill:color-mix(in srgb,var(--accent) 26%,var(--surface));stroke:var(--accent);stroke-width:1.5}',
    '.lab-latency-budget-bar-bottle{fill:var(--warn-soft);stroke:var(--warn);stroke-width:2}',
    '.lab-latency-budget-bar-off{fill:var(--surface-3);stroke:var(--border-strong);stroke-width:1.5;stroke-dasharray:4 3}',
    '.lab-latency-budget-gridline{stroke:var(--border);stroke-width:1}',
    '.lab-latency-budget-first{stroke:var(--ok);stroke-width:2}',
    '.lab-latency-budget-budget{stroke:var(--bad);stroke-width:1.5;stroke-dasharray:5 4}',
    '.lab-latency-budget-hist{fill:color-mix(in srgb,var(--accent) 26%,var(--surface));stroke:var(--accent);stroke-width:1}',
    '.lab-latency-budget-m-sump50{stroke:var(--muted);stroke-width:2;stroke-dasharray:4 3}',
    '.lab-latency-budget-m-mc50{stroke:var(--info);stroke-width:2}',
    '.lab-latency-budget-m-mc95{stroke:var(--ok);stroke-width:2.5}',
    '.lab-latency-budget-m-sump95{stroke:var(--warn);stroke-width:2;stroke-dasharray:6 3}',
    '.lab-latency-budget-svgtext{fill:var(--text-2);font:11px var(--font-sans);paint-order:stroke;stroke:var(--surface);stroke-width:3px;stroke-linejoin:round}',
    '.lab-latency-budget-svgtext-b{fill:var(--text);font:600 11px var(--font-sans);paint-order:stroke;stroke:var(--surface);stroke-width:3px;stroke-linejoin:round}',
    '.lab-latency-budget-svgtext-ok{fill:var(--ok);font:600 11px var(--font-sans);paint-order:stroke;stroke:var(--surface);stroke-width:3px;stroke-linejoin:round}',
    '.lab-latency-budget-svgtext-bad{fill:var(--bad);font:600 11px var(--font-sans);paint-order:stroke;stroke:var(--surface);stroke-width:3px;stroke-linejoin:round}',
    '.lab-latency-budget-legend{display:flex;flex-wrap:wrap;gap:var(--sp-1) var(--sp-4);margin:var(--sp-2) 0 0;padding:0;list-style:none;font-size:var(--fs-xs);color:var(--text-2)}',
    '.lab-latency-budget-legend li{display:flex;align-items:center;gap:6px}',
    '.lab-latency-budget-swatch{width:12px;height:12px;border-radius:3px;border:1.5px solid;flex:none}',
    '.lab-latency-budget-sw-bar{background:color-mix(in srgb,var(--accent) 26%,var(--surface));border-color:var(--accent)}',
    '.lab-latency-budget-sw-bottle{background:var(--warn-soft);border-color:var(--warn)}',
    '.lab-latency-budget-sw-off{background:var(--surface-3);border-color:var(--border-strong);border-style:dashed}',
    '.lab-latency-budget-line{width:18px;height:0;border-top:3px solid;flex:none}',
    '.lab-latency-budget-ln-sump50{border-top-style:dashed;border-color:var(--muted)}',
    '.lab-latency-budget-ln-mc50{border-color:var(--info)}',
    '.lab-latency-budget-ln-mc95{border-color:var(--ok)}',
    '.lab-latency-budget-ln-sump95{border-top-style:dashed;border-color:var(--warn)}',
    '.lab-latency-budget-notice{margin:0;padding:0;list-style:none;display:grid;gap:var(--sp-3)}',
    '.lab-latency-budget-notice li{padding:var(--sp-3);background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-sm)}',
    '.lab-latency-budget-notice strong{display:block;margin-bottom:var(--sp-1)}',
    '.lab-latency-budget-result{margin-top:var(--sp-2);font-size:var(--fs-sm);color:var(--text-2)}',
    '.lab-latency-budget-result:empty{display:none}'
  ].join('\n');

  function injectStyle() {
    if (document.getElementById('lab-latency-budget-style')) return;
    var st = document.createElement('style');
    st.id = 'lab-latency-budget-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function svg(tag, attrs, kids) {
    var n = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, String(attrs[k])); });
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function fmt(n, d) {
    return Number(n).toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d === undefined ? 0 : d });
  }
  function ms(v) { return v >= 10000 ? fmt(v / 1000, 1) + ' s' : v >= 1000 ? fmt(v / 1000, 2) + ' s' : fmt(v, 0) + ' ms'; }
  function labelOf(id) { return STAGES.filter(function (s) { return s.id === id; })[0].label; }
  function niceStep(maxMs, targetTicks) {
    var raw = maxMs / targetTicks, pow = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / pow;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * pow;
  }

  function mount(container, api) {
    injectStyle();
    var uid = G.uid('lb');
    var state = sanitize(Object.assign({}, BASE, { preset: 'chat' }, api.load() || {}));
    var cur = analyze(state), view = 'p50', metric = 'first';
    var inputs = {}, toggleInputs = {}, presetBtns = {}, viewBtns = {}, metricBtns = {}, charts = [], timers = [], warnEls = {};
    var tiles, summary, table, genOut, presetNote, tailNote, budgetChips, bottleNote;

    function setPath(path, v) {
      var parts = path.split('.');
      var o = state;
      for (var i = 0; i < parts.length - 1; i++) o = o[parts[i]];
      o[parts[parts.length - 1]] = v;
    }
    function getPath(path) {
      return path.split('.').reduce(function (o, k) { return o[k]; }, state);
    }

    function numInput(path, aria, opts) {
      opts = opts || {};
      var input = G.el('input', { class: P + 'input', type: 'number', min: opts.min === undefined ? 0 : opts.min, max: opts.max === undefined ? 600000 : opts.max,
        step: opts.step || 'any', inputmode: 'decimal' });
      if (opts.id) input.id = opts.id;
      if (opts.labelledby) input.setAttribute('aria-labelledby', opts.labelledby); else input.setAttribute('aria-label', aria);
      input.value = getPath(path);
      input.addEventListener('input', function () {
        var v = parseFloat(input.value);
        if (!isFinite(v)) return;
        setPath(path, v);
        commit();
      });
      input.addEventListener('change', function () { input.value = getPath(path); });
      inputs[path] = input;
      return input;
    }
    function field(path, text, unit, opts) {
      opts = opts || {};
      var id = uid + '-' + path.replace(/\./g, '-');
      var input = numInput(path, text, { id: id, min: opts.min, max: opts.max, step: opts.step });
      input.removeAttribute('aria-label');
      return G.el('div', { class: P + 'field' },
        G.el('label', { for: id }, text, unit ? G.el('span', { class: P + 'unit' }, ' (' + unit + ')') : null), input,
        opts.hint ? G.el('p', { class: P + 'hint' }, opts.hint) : null);
    }
    function toggle(key, text, hint) {
      var id = uid + '-t-' + key;
      var input = G.el('input', { type: 'checkbox', id: id });
      input.checked = state.toggles[key];
      input.addEventListener('change', function () { state.toggles[key] = input.checked; commit(); });
      toggleInputs[key] = input;
      return G.el('label', { class: P + 'check', for: id }, input, G.el('span', null, G.el('strong', null, text), hint ? G.el('span', { class: P + 'hint' }, ' ' + hint) : null));
    }

    function syncInputs() {
      Object.keys(inputs).forEach(function (k) { if (document.activeElement !== inputs[k]) inputs[k].value = getPath(k); });
      Object.keys(toggleInputs).forEach(function (k) { toggleInputs[k].checked = state.toggles[k]; });
      Object.keys(presetBtns).forEach(function (id) { presetBtns[id].setAttribute('aria-pressed', String(state.preset === id)); });
      Object.keys(viewBtns).forEach(function (v) { viewBtns[v].setAttribute('aria-pressed', String(view === v)); });
      Object.keys(metricBtns).forEach(function (v) { metricBtns[v].setAttribute('aria-pressed', String(metric === v)); });
      STAGES.forEach(function (st) {
        if (st.id === 'gen') return;
        var bad = state.stages[st.id].p95 < state.stages[st.id].p50;
        inputs['stages.' + st.id + '.p95'].setAttribute('aria-invalid', String(bad));
        warnEls[st.id].hidden = !bad;
      });
      var p = PRESETS.filter(function (x) { return x.id === state.preset; })[0];
      presetNote.textContent = p ? p.note : 'Custom settings. All numbers are illustrative; replace them with measurements from your own traces.';
    }

    var saveTimer;
    function persist() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(function () { api.save(state); }, 250);
      timers.push(saveTimer);
    }
    function commit() {
      state.preset = 'custom';
      state = sanitize(state);
      syncInputs();
      update();
    }
    function applyPreset(id) {
      var p = PRESETS.filter(function (x) { return x.id === id; })[0];
      state = sanitize(Object.assign(JSON.parse(JSON.stringify(p)), { preset: id, seed: state.seed }));
      syncInputs();
      update();
    }

    function chartBox(renderFn) {
      var box = G.el('div', { class: P + 'chart' }), w = 0, ro = null;
      function draw() {
        var width = Math.floor(box.clientWidth) || 0;
        if (width < 200) return;
        w = width;
        G.clear(box);
        box.appendChild(renderFn(width));
      }
      box.redraw = draw;
      if (typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(function () { if (Math.floor(box.clientWidth) !== w) draw(); });
        ro.observe(box);
      }
      box.stop = function () { if (ro) ro.disconnect(); };
      charts.push(box);
      return box;
    }

    /* ---------- charts ---------- */
    function renderWaterfall(w) {
      var sch = view === 'p50' ? cur.s50 : cur.s95, d = {};
      STAGES.forEach(function (st) { d[st.id] = sch.at[st.id][1] - sch.at[st.id][0]; });
      var rowH = 26, top = 26, labelW = Math.max(88, Math.min(132, Math.round(w * 0.28))), right = 8;
      var H = top + rowH * STAGES.length + 30;
      var targets = [state.toggles.stream ? state.target.first : null, state.target.total].filter(function (x) { return x !== null && x > 0; });
      var tmax = Math.max.apply(null, [sch.total].concat(targets, [1])) * 1.04;
      var plotW = w - labelW - right, x = function (t) { return labelW + t / tmax * plotW; };
      var bt = bottleneck(sch, null);
      var el = svg('svg', { width: w, height: H, viewBox: '0 0 ' + w + ' ' + H, role: 'img',
        'aria-label': 'Waterfall at ' + (view === 'p50' ? 'typical (p50)' : 'p95 per stage') + ': first visible token at ' + ms(sch.first) + ', complete answer at ' + ms(sch.total) +
          (bt ? ', bottleneck ' + labelOf(bt.id) + ' at ' + ms(bt.ms) : '') + '.' });
      var step = niceStep(tmax, 5);
      for (var tk = 0; tk <= tmax; tk += step) {
        el.appendChild(svg('line', { x1: x(tk), x2: x(tk), y1: top - 4, y2: top + rowH * STAGES.length, class: P + 'gridline' }));
        el.appendChild(svg('text', { x: x(tk), y: H - 8, 'text-anchor': tk === 0 ? 'start' : 'middle', class: P + 'svgtext' }, [ms(tk)]));
      }
      var budgetY2 = top + rowH * STAGES.length;
      if (state.target.total > 0) {
        el.appendChild(svg('line', { x1: x(state.target.total), x2: x(state.target.total), y1: top - 4, y2: budgetY2, class: P + 'budget' }));
        if (!state.toggles.stream) el.appendChild(svg('text', { x: Math.min(x(state.target.total) + 4, w - 70), y: 10, class: P + 'svgtext-bad' }, ['budget ' + ms(state.target.total)]));
      }
      if (state.toggles.stream && state.target.first > 0) {
        el.appendChild(svg('line', { x1: x(state.target.first), x2: x(state.target.first), y1: top - 4, y2: budgetY2, class: P + 'budget' }));
      }
      if (state.toggles.stream) {
        el.appendChild(svg('line', { x1: x(sch.first), x2: x(sch.first), y1: top - 8, y2: budgetY2, class: P + 'first' }));
        el.appendChild(svg('text', { x: x(sch.first) + 4, y: 10, class: P + 'svgtext-ok' }, ['first token ' + ms(sch.first)]));
      }
      STAGES.forEach(function (st, i) {
        var y = top + i * rowH, a = sch.at[st.id], dur = d[st.id];
        el.appendChild(svg('text', { x: 0, y: y + rowH / 2 + 4, class: P + 'svgtext-b' }, [st.short]));
        if (dur <= 0) {
          el.appendChild(svg('text', { x: labelW + 4, y: y + rowH / 2 + 4, class: P + 'svgtext' }, [st.id === 'rewrite' && state.toggles.skipRewrite ? 'skipped' : 'not used']));
          return;
        }
        var bx = x(a[0]), bw = Math.max(2, x(a[1]) - x(a[0]));
        var cls = !sch.onPath[st.id] ? 'bar-off' : (bt && bt.id === st.id ? 'bar-bottle' : 'bar');
        el.appendChild(svg('rect', { x: bx, y: y + 4, width: bw, height: rowH - 8, rx: 3, class: P + cls }));
        var txt = ms(dur) + (sch.onPath[st.id] ? '' : ' (parallel)');
        var fitsRight = bx + bw + 8 + txt.length * 6.2 < w;
        el.appendChild(svg('text', { x: fitsRight ? bx + bw + 5 : bx - 5, y: y + rowH / 2 + 4, 'text-anchor': fitsRight ? 'start' : 'end', class: P + 'svgtext' }, [txt]));
      });
      return el;
    }

    function renderHistogram(w) {
      var set = cur.mc[metric], sum50 = (metric === 'first' ? cur.s50.first : cur.s50.total), sum95 = (metric === 'first' ? cur.s95.first : cur.s95.total);
      var H = 168, padT = 34, padB = 26, plotH = H - padT - padB;
      var lo = Math.max(0, Math.min(set.sorted[0], sum50) * 0.92), hi = Math.max(set.p99, sum95, set.p95) * 1.04;
      if (!(hi > lo)) hi = lo + 1;
      var bins = 44, counts = new Array(bins).fill(0), maxC = 1;
      for (var i = 0; i < set.sorted.length; i++) {
        var v = set.sorted[i];
        if (v > hi) continue;
        var b = Math.min(bins - 1, Math.floor((v - lo) / (hi - lo) * bins));
        counts[b]++;
        if (counts[b] > maxC) maxC = counts[b];
      }
      var x = function (t) { return (t - lo) / (hi - lo) * w; };
      var el = svg('svg', { width: w, height: H, viewBox: '0 0 ' + w + ' ' + H, role: 'img',
        'aria-label': 'Distribution of ' + (metric === 'first' ? 'time to first visible token' : 'time to complete answer') + ' over ' + fmt(cur.mc.n) + ' draws. Typical path ' + ms(sum50) +
          ', Monte Carlo p50 ' + ms(set.p50) + ', Monte Carlo p95 ' + ms(set.p95) + ', stage p95s added ' + ms(sum95) + '.' });
      var bw = w / bins;
      counts.forEach(function (c, k) {
        var bh = c / maxC * plotH;
        if (bh > 0) el.appendChild(svg('rect', { x: k * bw + 0.5, y: padT + plotH - bh, width: Math.max(1, bw - 1), height: bh, class: P + 'hist' }));
      });
      el.appendChild(svg('line', { x1: 0, x2: w, y1: padT + plotH, y2: padT + plotH, class: P + 'gridline' }));
      var marks = [['sump50', sum50, 'sum p50'], ['mc50', set.p50, 'MC p50'], ['mc95', set.p95, 'MC p95'], ['sump95', sum95, 'sum p95']]
        .sort(function (a, b) { return a[1] - b[1]; });
      marks.forEach(function (m, i) {
        var mx = x(m[1]), ty = 10 + (i % 2) * 12;
        el.appendChild(svg('line', { x1: mx, x2: mx, y1: ty + 3, y2: padT + plotH, class: P + 'm-' + m[0] }));
        el.appendChild(svg('text', { x: Math.min(Math.max(mx, 2), w - 2), y: ty, 'text-anchor': mx < 60 ? 'start' : mx > w - 60 ? 'end' : 'middle', class: P + 'svgtext' }, [m[2]]));
      });
      var step = niceStep(hi - lo, 5), first = Math.ceil(lo / step) * step;
      for (var tk = first; tk <= hi; tk += step) {
        el.appendChild(svg('text', { x: x(tk), y: H - 8, 'text-anchor': 'middle', class: P + 'svgtext' }, [ms(tk)]));
      }
      return el;
    }

    /* ---------- outputs ---------- */
    function tile(label, value, note) {
      return G.el('div', { class: P + 'tile' }, G.el('dt', null, label), G.el('dd', null, value, note ? G.el('small', null, note) : null));
    }
    function chip(kind, text) { return G.el('span', { class: P + 'chip ' + P + 'chip-' + kind }, text); }

    function update() {
      cur = analyze(state);
      var o = cur.opts, set = cur.mc[metric];
      var sum50 = metric === 'first' ? cur.s50.first : cur.s50.total, sum95 = metric === 'first' ? cur.s95.first : cur.s95.total;

      G.clear(summary);
      summary.appendChild(document.createTextNode((o.stream ? 'First visible token at about ' + ms(cur.s50.first) + ' (typical), ' : 'Nothing is visible until the whole answer is ready, ') +
        'complete answer at ' + ms(cur.s50.total) + '. Monte Carlo p95: ' + ms(cur.mc.first.p95) + ' to first token, ' + ms(cur.mc.total.p95) + ' to complete. '));

      G.clear(tiles);
      [
        tile('First visible token', ms(cur.s50.first), o.stream ? 'streaming, typical path' : 'not streaming: equals total'),
        tile('Complete answer', ms(cur.s50.total), 'typical path, stage p50s added'),
        tile('Monte Carlo p95, first token', ms(cur.mc.first.p95), 'sum of stage p95s: ' + ms(cur.s95.first)),
        tile('Monte Carlo p95, complete', ms(cur.mc.total.p95), 'sum of stage p95s: ' + ms(cur.s95.total))
      ].forEach(function (t) { tiles.appendChild(t); });

      G.clear(bottleNote);
      function bn(label, b, total) { return b ? label + ' ' + labelOf(b.id) + ', ' + ms(b.ms) + ' (' + fmt(b.ms / total * 100, 0) + '%)' : label + ' none'; }
      bottleNote.appendChild(chip('warn', bn('Bottleneck for first token:', cur.bottleFirst, cur.s50.first)));
      bottleNote.appendChild(document.createTextNode(' '));
      bottleNote.appendChild(chip('warn', bn('For complete answer:', cur.bottleTotal, cur.s50.total)));
      if (cur.tailTotal && cur.bottleTotal && cur.tailTotal.id !== cur.bottleTotal.id) {
        bottleNote.appendChild(document.createTextNode(' '));
        bottleNote.appendChild(chip('info', 'Tail driver: ' + labelOf(cur.tailTotal.id)));
      }

      G.clear(budgetChips);
      [['First visible token', cur.mc.first.p95, state.target.first, o.stream], ['Complete answer', cur.mc.total.p95, state.target.total, true]].forEach(function (b) {
        if (!b[3] || b[2] <= 0) return;
        var delta = b[1] - b[2];
        budgetChips.appendChild(chip(delta <= 0 ? 'ok' : 'bad', b[0] + ' p95 ' + (delta <= 0 ? 'within budget by ' + ms(-delta) : 'over budget by ' + ms(delta))));
        budgetChips.appendChild(document.createTextNode(' '));
      });

      G.clear(table);
      table.appendChild(G.el('thead', null, G.el('tr', null,
        G.el('th', { scope: 'col' }, 'Metric'), G.el('th', { scope: 'col' }, 'Typical path'), G.el('th', { scope: 'col' }, 'MC p50'),
        G.el('th', { scope: 'col' }, 'MC p95'), G.el('th', { scope: 'col' }, 'Sum of p95s'))));
      table.appendChild(G.el('tbody', null,
        [['First visible token', cur.s50.first, cur.mc.first, cur.s95.first], ['Complete answer', cur.s50.total, cur.mc.total, cur.s95.total]].map(function (r) {
          return G.el('tr', null, G.el('th', { scope: 'row' }, r[0]), G.el('td', null, ms(r[1])), G.el('td', null, ms(r[2].p50)), G.el('td', null, ms(r[2].p95)), G.el('td', null, ms(r[3])));
        })));

      var g = cur.dist.gen;
      genOut.textContent = 'Generation takes ' + ms(g.p50) + ' at typical speed and ' + ms(g.p95) + ' at the slow tail (' + fmt(state.gen.tokens) + ' tokens / tokens per second).';
      tailNote.textContent = 'For this metric the stage p95s add up to ' + ms(sum95) + ', but sampling every stage independently gives a p95 of ' + ms(set.p95) +
        '. That is ' + fmt((1 - set.p95 / sum95) * 100, 0) + '% lower, because slow tails rarely line up. It is still ' + ms(set.p95 - sum50) +
        ' above the typical path of ' + ms(sum50) + ': a serial chain widens the tail even when every stage is healthy.';

      charts.forEach(function (c) { c.redraw(); });
      syncInputs();
      persist();
    }

    /* ---------- experiments ---------- */
    function experiment(title, text, buttons) {
      var out = G.el('p', { class: P + 'result', role: 'status' });
      var row = G.el('div', { class: P + 'row' });
      buttons.forEach(function (b) {
        row.appendChild(G.el('button', { type: 'button', class: P + 'btn', on: { click: function () {
          var before = cur;
          state = sanitize(Object.assign({}, b.patch(JSON.parse(JSON.stringify(state))), { preset: 'custom' }));
          syncInputs();
          update();
          out.textContent = b.describe(before, cur);
        } } }, b.label));
      });
      return G.el('li', null, G.el('strong', null, title), G.el('span', null, text), row, out);
    }

    var experiments = [
      experiment('1. Run the guard beside retrieval',
        'The input guard only needs the user text, so it can run while the retrieval branch works. The path then costs the longer of the two, not the sum.', [
          { label: 'Turn parallel guard on', patch: function (s) { s.toggles.parallelGuard = true; return s; },
            describe: function (b, a) { return 'First token ' + ms(b.s50.first) + ' to ' + ms(a.s50.first) + ' (saved ' + ms(b.s50.first - a.s50.first) + '). The shorter of guard and retrieval branch is now hidden.'; } }
        ]),
      experiment('2. Streaming changes what the user waits for',
        'With streaming, generation no longer delays the first visible token. Total time stays the same.', [
          { label: 'Toggle streaming', patch: function (s) { s.toggles.stream = !s.toggles.stream; return s; },
            describe: function (b, a) { return 'Streaming ' + (a.opts.stream ? 'on' : 'off') + ': first token ' + ms(b.s50.first) + ' to ' + ms(a.s50.first) + ', complete answer ' + ms(b.s50.total) + ' to ' + ms(a.s50.total) + '.'; } }
        ]),
      experiment('3. Adding p95s overstates the tail; a chain still widens it',
        'Give every stage a long tail, then compare the sum of p95s with the Monte Carlo p95 and the typical path.', [
          { label: 'Set every p95 to 3x its p50', patch: function (s) {
              Object.keys(s.stages).forEach(function (k) { s.stages[k].p95 = s.stages[k].p50 * 3; });
              return s;
            },
            describe: function (b, a) {
              return 'Complete answer: typical path ' + ms(a.s50.total) + ', Monte Carlo p95 ' + ms(a.mc.total.p95) + ', sum of p95s ' + ms(a.s95.total) +
                '. The simulated tail sits between the other two.';
            } }
        ])
    ];

    /* ---------- layout ---------- */
    presetNote = G.el('p', { class: P + 'muted', 'aria-live': 'polite' });
    var presetRow = G.el('div', { class: P + 'row', role: 'group', 'aria-label': 'Presets' });
    PRESETS.forEach(function (p) {
      var b = G.el('button', { type: 'button', class: P + 'btn', 'aria-pressed': 'false', on: { click: function () { applyPreset(p.id); } } }, p.name);
      presetBtns[p.id] = b;
      presetRow.appendChild(b);
    });

    var headP50 = uid + '-hp50', headP95 = uid + '-hp95';
    var grid = G.el('div', { class: P + 'stagegrid', role: 'group', 'aria-label': 'Stage latencies in milliseconds' },
      G.el('span', { class: P + 'colhead' }, 'Stage'), G.el('span', { class: P + 'colhead', id: headP50 }, 'p50 ms'), G.el('span', { class: P + 'colhead', id: headP95 }, 'p95 ms'));
    STAGES.forEach(function (st) {
      if (st.id === 'gen') return;
      var nameId = uid + '-n-' + st.id;
      var warn = G.el('p', { class: P + 'hint', hidden: true, style: { gridColumn: '1 / -1', color: 'var(--bad)' } }, 'p95 is below p50, so p50 is used for both.');
      warnEls[st.id] = warn;
      grid.appendChild(G.el('span', { class: P + 'stagename', id: nameId }, st.label));
      grid.appendChild(numInput('stages.' + st.id + '.p50', st.label + ' p50 in milliseconds', { labelledby: nameId + ' ' + headP50 }));
      grid.appendChild(numInput('stages.' + st.id + '.p95', st.label + ' p95 in milliseconds', { labelledby: nameId + ' ' + headP95 }));
      grid.appendChild(warn);
    });

    genOut = G.el('p', { class: P + 'hint' });
    var controls = G.el('section', { class: P + 'card ' + P + 'card-accent', 'aria-labelledby': uid + '-ch' },
      G.el('h3', { class: P + 'h', id: uid + '-ch' }, 'Controls'),
      G.el('p', { class: P + 'muted' }, 'Start from a preset. Every number is an illustrative default in milliseconds; replace them with percentiles from your own traces.'),
      presetRow, presetNote,
      G.el('h4', { class: P + 'sub' }, 'Stage latencies'), grid,
      G.el('h4', { class: P + 'sub' }, 'Generation'),
      G.el('div', { class: P + 'fields' },
        field('gen.tokens', 'Output tokens', null, { min: 0, max: 100000, step: 1 }),
        field('gen.tps', 'Tokens per second', 'typical', { min: 1, max: 10000 }),
        field('gen.tpsSlow', 'Tokens per second', 'slow tail', { min: 1, max: 10000 })),
      genOut,
      G.el('h4', { class: P + 'sub' }, 'Options'),
      G.el('div', { class: P + 'toggles' },
        toggle('parallelGuard', 'Run input guard in parallel', 'with the retrieval branch (rewrite, embed, retrieve, rerank).'),
        toggle('stream', 'Stream the answer', 'first token is visible as soon as the model starts.'),
        toggle('skipRewrite', 'Skip query rewrite', 'removes the LLM rewrite call.'),
        toggle('cacheHit', 'Prompt cache hit', 'cuts model time to first token.'),
        toggle('smallModel', 'Use a smaller model', 'lower time to first token, faster tokens.')),
      G.el('details', { class: P + 'details' }, G.el('summary', null, 'Toggle assumptions'),
        G.el('div', { class: P + 'fields', style: { marginTop: 'var(--sp-3)' } },
          field('assume.cacheCutPct', 'Cache hit cuts TTFT by', '%', { min: 0, max: 95 }),
          field('assume.smallTtft', 'Smaller model TTFT multiplier', 'x', { min: 0.05, max: 1, step: 0.05 }),
          field('assume.smallSpeed', 'Smaller model speed multiplier', 'x', { min: 1, max: 5, step: 0.1 }))),
      G.el('h4', { class: P + 'sub' }, 'Budgets'),
      G.el('div', { class: P + 'fields' },
        field('target.first', 'First visible token budget', 'ms', { min: 0, max: 3600000 }),
        field('target.total', 'Complete answer budget', 'ms', { min: 0, max: 3600000 })));

    tiles = G.el('dl', { class: P + 'tiles' });
    summary = G.el('p', { 'aria-live': 'polite', 'aria-atomic': 'true' });
    bottleNote = G.el('p', { style: { marginTop: 'var(--sp-3)' } });
    budgetChips = G.el('p', { style: { marginTop: 'var(--sp-2)' } });
    table = G.el('table', { class: P + 'table' });
    tailNote = G.el('p', { class: P + 'muted' });
    var waterfallBox = chartBox(renderWaterfall), histBox = chartBox(renderHistogram);

    function toggleGroup(label, store, options, onPick) {
      var row = G.el('div', { class: P + 'row', role: 'group', 'aria-label': label });
      options.forEach(function (o) {
        var b = G.el('button', { type: 'button', class: P + 'btn', 'aria-pressed': 'false', on: { click: function () { onPick(o[0]); syncInputs(); update(); } } }, o[1]);
        store[o[0]] = b;
        row.appendChild(b);
      });
      return row;
    }
    var viewRow = toggleGroup('Waterfall view', viewBtns, [['p50', 'Typical (p50)'], ['p95', 'Each stage at p95']], function (v) { view = v; });
    var metricRow = toggleGroup('Distribution metric', metricBtns, [['first', 'First visible token'], ['total', 'Complete answer']], function (v) { metric = v; });

    var outputs = G.el('section', { class: P + 'card', 'aria-labelledby': uid + '-oh' },
      G.el('h3', { class: P + 'h', id: uid + '-oh' }, 'Live results'),
      summary, G.el('div', { style: { height: 'var(--sp-3)' } }), tiles, bottleNote, budgetChips,
      G.el('h4', { class: P + 'sub' }, 'Waterfall'), viewRow, G.el('div', { style: { height: 'var(--sp-2)' } }), waterfallBox,
      G.el('ul', { class: P + 'legend', 'aria-label': 'Waterfall legend' },
        G.el('li', null, G.el('span', { class: P + 'swatch ' + P + 'sw-bar' }), 'On the critical path'),
        G.el('li', null, G.el('span', { class: P + 'swatch ' + P + 'sw-bottle' }), 'Bottleneck'),
        G.el('li', null, G.el('span', { class: P + 'swatch ' + P + 'sw-off' }), 'Hidden by parallel work'),
        G.el('li', null, 'Green line: first visible token. Red dashes: budget.')),
      G.el('p', { class: P + 'caption' }, 'Network is counted once at the end of the answer and, when streaming, once more on the first token. With streaming on, the output guard is assumed to check chunks as they stream, so it only extends the total.'),
      G.el('h4', { class: P + 'sub' }, 'Summary'), G.el('div', { class: P + 'tablewrap' }, table),
      G.el('h4', { class: P + 'sub' }, 'Monte Carlo, ' + fmt(DRAWS) + ' draws'), metricRow, G.el('div', { style: { height: 'var(--sp-2)' } }), histBox,
      G.el('ul', { class: P + 'legend', 'aria-label': 'Distribution legend' },
        [['sump50', 'Sum of p50s'], ['mc50', 'Monte Carlo p50'], ['mc95', 'Monte Carlo p95'], ['sump95', 'Sum of p95s']].map(function (l) {
          return G.el('li', null, G.el('span', { class: P + 'line ' + P + 'ln-' + l[0] }), l[1]);
        })),
      tailNote,
      G.el('div', { class: P + 'row', style: { marginTop: 'var(--sp-2)' } },
        G.el('button', { type: 'button', class: P + 'btn', on: { click: function () { state.seed = state.seed + 1; update(); } } }, 'Resample ' + fmt(DRAWS) + ' draws')));

    var formula = G.el('section', { class: P + 'card', 'aria-labelledby': uid + '-fh' },
      G.el('h3', { class: P + 'h', id: uid + '-fh' }, 'The model'),
      G.el('code', { class: P + 'code' },
        'generation_ms = output_tokens / tokens_per_second x 1000\nstage ~ LogNormal(mu = ln p50, sigma = (ln p95 - ln p50) / 1.645)\nend_to_end = sum of stages, or max(guard, retrieval branch) when the guard runs in parallel\nfirst_visible = everything before generation + network (streaming), else end_to_end'),
      G.el('p', { class: P + 'caption' }, 'Source: lognormal quantile identity q = exp(mu + z sigma), where z = 1.645 is the 95th percentile of the standard normal. Stages are sampled independently; a shared slow dependency would correlate tails and widen the real p95 beyond this estimate.'));

    var notice = G.el('section', { class: P + 'card', 'aria-labelledby': uid + '-nh' },
      G.el('h3', { class: P + 'h', id: uid + '-nh' }, 'What to notice'),
      G.el('ul', { class: P + 'notice' }, experiments));

    var root = G.el('div', { class: P + 'root', dataset: { lab: 'latency-budget' } },
      G.el('p', { class: P + 'muted' }, 'Stack retrieval, guards, model time to first token and streaming into an end-to-end budget, then find the bottleneck. Defaults are illustrative, not measurements.'),
      formula,
      G.el('div', { class: P + 'layout' }, controls, outputs),
      notice);
    container.appendChild(root);

    syncInputs();
    update();

    return {
      destroy: function () {
        timers.forEach(clearTimeout);
        charts.forEach(function (c) { c.stop(); });
        G.clear(container);
      }
    };
  }

  window.Guide.labs.register('latency-budget', { mount: mount });
})();
