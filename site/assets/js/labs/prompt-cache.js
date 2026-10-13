/* Follow the Question: Prompt cache savings lab. Owner: E3a.
   Part 1 is the pure model (also exported for Node tests). Part 2 is the UI.
   Defaults are illustrative, not vendor pricing or benchmarks. */
(function () {
  'use strict';

  /* ======================= Part 1: model ======================= */
  var MINUTES_PER_MONTH = 30 * 24 * 60;
  var BURST_SIZE = 10;
  var BURST_SPACING_MIN = 0.05;
  var TTFT_SHARE = [0.3, 0.8];
  var PATTERNS = ['steady', 'bursty', 'sparse'];

  var BASE = {
    rpm: 10, pattern: 'sparse', keys: 50, prefixTokens: 6000, variableTokens: 600, outputTokens: 400, minTokens: 1024,
    inPrice: 2.5, outPrice: 10, discountPct: 50, writePremiumPct: 25, ttlMin: 5, brokenPct: 5, satThreshold: 15
  };

  var PRESETS = [
    { id: 'tenants', name: 'Many tenants, low traffic', note: '50 tenants, each with its own prefix and about 0.2 requests per minute. Random gaps run into the 5 minute lifetime.',
      values: { rpm: 10, pattern: 'sparse', keys: 50, brokenPct: 5, ttlMin: 5 } },
    { id: 'hot', name: 'One hot prefix', note: '120 requests per minute on a single key. Far above the roughly 15 per minute per key at which OpenAI and Azure document misses.',
      values: { rpm: 120, pattern: 'steady', keys: 1, brokenPct: 0, ttlMin: 5 } },
    { id: 'steady', name: 'Steady support bot', note: '60 requests per minute spread over 4 keys, evenly spaced, with a rare unstable prefix.',
      values: { rpm: 60, pattern: 'steady', keys: 4, brokenPct: 2, ttlMin: 5 } }
  ];

  var LIMITS = {
    rpm: [0.01, 100000], keys: [1, 100000], prefixTokens: [0, 1000000], variableTokens: [0, 1000000], outputTokens: [0, 100000],
    minTokens: [0, 100000], inPrice: [0, 1000], outPrice: [0, 1000], discountPct: [0, 100], writePremiumPct: [0, 300],
    ttlMin: [0.5, 1440], brokenPct: [0, 100], satThreshold: [1, 10000]
  };
  var INTS = { keys: 1, prefixTokens: 1, variableTokens: 1, outputTokens: 1, minTokens: 1 };

  function clampNum(v, lo, hi, d) {
    v = Number(v);
    if (!isFinite(v)) v = d;
    return Math.min(hi, Math.max(lo, v));
  }

  function sanitize(raw) {
    var r = raw || {}, s = {};
    Object.keys(LIMITS).forEach(function (k) {
      var v = clampNum(r[k] === undefined ? BASE[k] : r[k], LIMITS[k][0], LIMITS[k][1], BASE[k]);
      s[k] = INTS[k] ? Math.round(v) : v;
    });
    s.pattern = PATTERNS.indexOf(r.pattern) >= 0 ? r.pattern : BASE.pattern;
    s.preset = typeof r.preset === 'string' ? r.preset : 'custom';
    return s;
  }

  function perKeyRate(s) { return s.rpm / s.keys; }
  function isCacheable(s) { return s.prefixTokens >= s.minTokens && s.prefixTokens > 0; }

  /* Expected steady-state hit probability per request. Hit requires: prefix is stable, request is routed to the
     machine that holds the entry, and the previous such request on this key was within the lifetime (sliding). */
  function hitModel(s) {
    var lam = perKeyRate(s), T = s.ttlMin, b = s.brokenPct / 100;
    var stableRate = lam * (1 - b);
    var routed = stableRate > 0 ? Math.min(1, s.satThreshold / stableRate) : 1;
    var p = (1 - b) * routed;
    var out = { perKey: lam, stableRate: stableRate, routed: routed, p: p, cacheable: isCacheable(s), hit: 0 };
    if (!out.cacheable || p <= 0 || lam <= 0) {
      out.shares = out.cacheable
        ? { hit: 0, expired: 0, broken: b, overflow: 1 - b - p > 0 ? 1 - b - p : 0, below: 0 }
        : { hit: 0, expired: 0, broken: 0, overflow: 0, below: 1 };
      return out;
    }
    var h;
    if (s.pattern === 'steady') {
      var slots = Math.floor(T * lam + 1e-9);
      h = p * (1 - Math.pow(1 - p, slots));
    } else if (s.pattern === 'sparse') {
      h = p * (1 - Math.exp(-lam * p * T));
    } else {
      var c = 1 - Math.pow(1 - p, BURST_SIZE);
      h = p - (c / BURST_SIZE) * Math.exp(-lam * c * T / BURST_SIZE);
    }
    out.hit = Math.max(0, Math.min(1, h));
    out.shares = { hit: out.hit, expired: p - out.hit, broken: b, overflow: (1 - b) * (1 - routed), below: 0 };
    return out;
  }

  /* Expected input cost multiplier on the cacheable prefix: m = h(1-d) + (1-h)(1+w). */
  function prefixMultiplier(hit, d, w) { return hit * (1 - d) + (1 - hit) * (1 + w); }

  /* Hit rate at which caching costs the same as no caching: h* = w / (d + w). */
  function breakEven(d, w) { return d + w > 0 ? w / (d + w) : null; }

  function costs(s, hit) {
    var d = s.discountPct / 100, w = s.writePremiumPct / 100, pin = s.inPrice / 1e6, pout = s.outPrice / 1e6;
    var cacheable = isCacheable(s);
    var reqs = s.rpm * MINUTES_PER_MONTH;
    var mult = cacheable ? prefixMultiplier(hit, d, w) : 1;
    var P = s.prefixTokens, V = s.variableTokens;
    var perReqPlain = (P + V) * pin;
    var perReqCached = (P * mult + V) * pin;
    var out = {
      requestsPerMonth: reqs, multiplier: mult,
      perReqPlain: perReqPlain, perReqCached: perReqCached,
      inputPlain: reqs * perReqPlain, inputCached: reqs * perReqCached, output: reqs * s.outputTokens * pout,
      parts: {
        variable: reqs * V * pin,
        reads: cacheable ? reqs * hit * P * pin * (1 - d) : 0,
        misses: cacheable ? reqs * (1 - hit) * P * pin : reqs * P * pin,
        premium: cacheable ? reqs * (1 - hit) * P * pin * w : 0
      }
    };
    out.inputSaved = out.inputPlain - out.inputCached;
    out.inputSavedPct = out.inputPlain > 0 ? out.inputSaved / out.inputPlain : 0;
    out.totalPlain = out.inputPlain + out.output;
    out.totalCached = out.inputCached + out.output;
    out.totalSavedPct = out.totalPlain > 0 ? (out.totalPlain - out.totalCached) / out.totalPlain : 0;
    return out;
  }

  /* Heuristic estimate only: cached share of the prompt times the share of time to first token that is prefill. */
  function ttftEstimate(s, hit) {
    if (!isCacheable(s)) return { cachedFraction: 0, onHit: [0, 0], average: [0, 0] };
    var f = s.prefixTokens / (s.prefixTokens + s.variableTokens);
    return {
      cachedFraction: f,
      onHit: [f * TTFT_SHARE[0], f * TTFT_SHARE[1]],
      average: [hit * f * TTFT_SHARE[0], hit * f * TTFT_SHARE[1]]
    };
  }

  function analyze(s) {
    var hm = hitModel(s);
    return {
      hm: hm, hit: hm.hit, breakEven: breakEven(s.discountPct / 100, s.writePremiumPct / 100),
      costs: costs(s, hm.hit), ttft: ttftEstimate(s, hm.hit)
    };
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

  /* Event-by-event simulation of one key. o = { seed, windowMin, maxEvents }. */
  function simulate(s, o) {
    o = o || {};
    var rnd = mulberry32(o.seed || 1), lam = perKeyRate(s), T = s.ttlMin, b = s.brokenPct / 100;
    var stableRate = lam * (1 - b), routed = stableRate > 0 ? Math.min(1, s.satThreshold / stableRate) : 1;
    var cacheable = isCacheable(s), maxEvents = o.maxEvents || 200, windowMin = o.windowMin === undefined ? Infinity : o.windowMin;
    var events = [], counts = { hit: 0, expired: 0, broken: 0, overflow: 0, below: 0 }, last = -Infinity, k = 0, base = 0;

    function add(time) {
      var kind;
      if (!cacheable) kind = 'below';
      else if (rnd() < b) kind = 'broken';
      else if (rnd() >= routed) kind = 'overflow';
      else { kind = time - last <= T + 1e-9 ? 'hit' : 'expired'; last = time; }
      counts[kind]++;
      events.push({ t: time, kind: kind });
    }
    while (events.length < maxEvents) {
      if (s.pattern === 'steady') {
        k++;
        var ts = k / lam;
        if (ts > windowMin) break;
        add(ts);
      } else if (s.pattern === 'sparse') {
        base += -Math.log(1 - rnd()) / lam;
        if (base > windowMin) break;
        add(base);
      } else {
        base += -Math.log(1 - rnd()) * BURST_SIZE / lam;
        if (base > windowMin) break;
        for (var i = 0; i < BURST_SIZE && events.length < maxEvents; i++) {
          var tb = base + i * BURST_SPACING_MIN;
          if (tb > windowMin) break;
          add(tb);
        }
      }
    }
    return { events: events, counts: counts, n: events.length, hitRate: events.length ? counts.hit / events.length : 0 };
  }

  /* Window for the timeline: shows the lifetime scale but keeps the marker count readable. */
  function timelineWindow(s) {
    var lam = perKeyRate(s);
    return Math.min(Math.max(12 * s.ttlMin, 40 / lam), 120 / lam);
  }

  var model = {
    MINUTES_PER_MONTH: MINUTES_PER_MONTH, BURST_SIZE: BURST_SIZE, TTFT_SHARE: TTFT_SHARE, BASE: BASE, PRESETS: PRESETS,
    sanitize: sanitize, perKeyRate: perKeyRate, hitModel: hitModel, prefixMultiplier: prefixMultiplier, breakEven: breakEven,
    costs: costs, ttftEstimate: ttftEstimate, analyze: analyze, simulate: simulate, timelineWindow: timelineWindow, mulberry32: mulberry32
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = model;

  /* ======================= Part 2: UI ======================= */
  if (typeof window === 'undefined' || !window.Guide || !window.Guide.labs) return;

  var G = window.Guide;
  var P = 'lab-prompt-cache-';
  var SVGNS = 'http://www.w3.org/2000/svg';

  var KINDS = {
    hit: { label: 'Hit', lane: 0, cls: 'ok' },
    expired: { label: 'Miss: lifetime expired', lane: 1, cls: 'bad' },
    broken: { label: 'Miss: unstable prefix', lane: 1, cls: 'warn' },
    overflow: { label: 'Miss: key overflow', lane: 1, cls: 'preview' },
    below: { label: 'Not cacheable: below minimum', lane: 1, cls: 'muted' }
  };

  var CSS = [
    '.lab-prompt-cache-root{display:grid;gap:var(--sp-5);color:var(--text);font-family:var(--font-sans);font-size:calc(var(--fs-md) * var(--font-scale, 1));line-height:var(--lh-body);min-width:0}',
    '.lab-prompt-cache-root *{box-sizing:border-box}',
    '.lab-prompt-cache-root p{margin:0}',
    '.lab-prompt-cache-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);box-shadow:var(--shadow-1);padding:var(--sp-4);min-width:0}',
    '.lab-prompt-cache-card-accent{border-left:4px solid var(--accent-line, var(--accent))}',
    '.lab-prompt-cache-h{margin:0 0 var(--sp-3);font-size:var(--fs-lg);line-height:var(--lh-tight);font-weight:650}',
    '.lab-prompt-cache-sub{margin:var(--sp-4) 0 var(--sp-2);font-size:var(--fs-sm);font-weight:650;color:var(--text-2);text-transform:uppercase;letter-spacing:.04em}',
    '.lab-prompt-cache-muted{color:var(--muted);font-size:var(--fs-sm)}',
    '.lab-prompt-cache-caption{color:var(--muted);font-size:var(--fs-xs);margin-top:var(--sp-2)}',
    '.lab-prompt-cache-code{display:block;margin:var(--sp-2) 0;padding:var(--sp-3);background:var(--code-bg);border:1px solid var(--border);border-radius:var(--r-sm);font-family:var(--font-mono);font-size:var(--fs-sm);overflow-x:auto;white-space:pre}',
    '.lab-prompt-cache-layout{display:grid;gap:var(--sp-5);grid-template-columns:repeat(auto-fit,minmax(min(100%,24rem),1fr));align-items:start}',
    '.lab-prompt-cache-row{display:flex;flex-wrap:wrap;gap:var(--sp-2);align-items:center}',
    '.lab-prompt-cache-fields{display:grid;gap:var(--sp-3) var(--sp-4);grid-template-columns:repeat(auto-fit,minmax(9.5rem,1fr))}',
    '.lab-prompt-cache-field{display:grid;gap:var(--sp-1);align-content:start;min-width:0}',
    '.lab-prompt-cache-field label{font-size:var(--fs-sm);font-weight:600;color:var(--text)}',
    '.lab-prompt-cache-unit{font-weight:400;color:var(--muted)}',
    '.lab-prompt-cache-hint{font-size:var(--fs-xs);color:var(--muted)}',
    '.lab-prompt-cache-input{font:inherit;font-size:var(--fs-sm);width:100%;min-height:2.25rem;padding:.35rem .55rem;color:var(--text);background:var(--surface);border:1px solid var(--border-strong);border-radius:var(--r-sm);transition:border-color var(--dur) var(--ease),background var(--dur) var(--ease)}',
    '.lab-prompt-cache-input:hover{border-color:var(--accent);background:var(--surface-2)}',
    '.lab-prompt-cache-range{width:100%;accent-color:var(--accent);min-height:2rem}',
    '.lab-prompt-cache-btn{font:inherit;font-size:var(--fs-sm);padding:.4rem .75rem;min-height:2.25rem;color:var(--text);background:var(--surface-2);border:1px solid var(--border-strong);border-radius:var(--r-sm);cursor:pointer;transition:background var(--dur) var(--ease),border-color var(--dur) var(--ease),transform var(--dur) var(--ease)}',
    '.lab-prompt-cache-btn:hover{background:var(--surface-3);border-color:var(--accent)}',
    '.lab-prompt-cache-btn:active{transform:translateY(1px)}',
    '.lab-prompt-cache-btn[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}',
    '.lab-prompt-cache-tiles{display:grid;gap:var(--sp-3);grid-template-columns:repeat(auto-fit,minmax(8.25rem,1fr));margin:0}',
    '.lab-prompt-cache-tile{background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-sm);padding:var(--sp-3);min-width:0}',
    '.lab-prompt-cache-tile dt{font-size:var(--fs-xs);color:var(--muted);margin:0}',
    '.lab-prompt-cache-tile dd{margin:2px 0 0;font-size:var(--fs-xl);font-weight:700;line-height:var(--lh-tight);font-variant-numeric:tabular-nums}',
    '.lab-prompt-cache-tile dd small{display:block;font-size:var(--fs-xs);font-weight:500;color:var(--muted)}',
    '.lab-prompt-cache-chip{display:inline-block;padding:2px 10px;border-radius:var(--r-pill);font-size:var(--fs-xs);font-weight:600;background:var(--info-soft);color:var(--info);border:1px solid currentColor}',
    '.lab-prompt-cache-chip-ok{background:var(--ok-soft);color:var(--ok)}',
    '.lab-prompt-cache-chip-bad{background:var(--bad-soft);color:var(--bad)}',
    '.lab-prompt-cache-chip-warn{background:var(--warn-soft);color:var(--warn)}',
    '.lab-prompt-cache-chart{width:100%;min-width:0}',
    '.lab-prompt-cache-chart svg{display:block;max-width:100%;margin:0 auto}',
    '.lab-prompt-cache-seg{stroke-width:1.5}',
    '.lab-prompt-cache-seg-variable{fill:var(--surface-3);stroke:var(--border-strong)}',
    '.lab-prompt-cache-seg-full{fill:var(--warn-soft);stroke:var(--warn)}',
    '.lab-prompt-cache-seg-reads{fill:var(--ok-soft);stroke:var(--ok)}',
    '.lab-prompt-cache-seg-premium{fill:var(--bad-soft);stroke:var(--bad)}',
    '.lab-prompt-cache-track{fill:none;stroke:var(--surface-3);stroke-width:16;stroke-linecap:round}',
    '.lab-prompt-cache-gauge{fill:none;stroke-width:16;stroke-linecap:round}',
    '.lab-prompt-cache-gauge-ok{stroke:var(--ok)}',
    '.lab-prompt-cache-gauge-bad{stroke:var(--bad)}',
    '.lab-prompt-cache-gauge-warn{stroke:var(--warn)}',
    '.lab-prompt-cache-be{stroke:var(--text);stroke-width:2.5}',
    '.lab-prompt-cache-axis{stroke:var(--border-strong);stroke-width:1}',
    '.lab-prompt-cache-lane{fill:var(--surface-2)}',
    '.lab-prompt-cache-m-ok{fill:var(--ok);stroke:var(--surface);stroke-width:1}',
    '.lab-prompt-cache-m-bad{fill:var(--bad);stroke:var(--surface);stroke-width:1}',
    '.lab-prompt-cache-m-warn{fill:var(--warn);stroke:var(--surface);stroke-width:1}',
    '.lab-prompt-cache-m-preview{fill:var(--preview);stroke:var(--surface);stroke-width:1}',
    '.lab-prompt-cache-m-muted{fill:var(--muted);stroke:var(--surface);stroke-width:1}',
    '.lab-prompt-cache-svgtext{fill:var(--text-2);font:11px var(--font-sans)}',
    '.lab-prompt-cache-svgtext-big{fill:var(--text);font:700 28px var(--font-sans)}',
    '.lab-prompt-cache-legend{display:flex;flex-wrap:wrap;gap:var(--sp-1) var(--sp-4);margin:var(--sp-2) 0 0;padding:0;list-style:none;font-size:var(--fs-xs);color:var(--text-2)}',
    '.lab-prompt-cache-legend li{display:flex;align-items:center;gap:6px}',
    '.lab-prompt-cache-swatch{width:12px;height:12px;border-radius:3px;border:1.5px solid;flex:none}',
    '.lab-prompt-cache-sw-variable{background:var(--surface-3);border-color:var(--border-strong)}',
    '.lab-prompt-cache-sw-full{background:var(--warn-soft);border-color:var(--warn)}',
    '.lab-prompt-cache-sw-reads{background:var(--ok-soft);border-color:var(--ok)}',
    '.lab-prompt-cache-sw-premium{background:var(--bad-soft);border-color:var(--bad)}',
    '.lab-prompt-cache-checks{margin:0;padding:0;list-style:none;display:grid;gap:var(--sp-2)}',
    '.lab-prompt-cache-checks li{display:flex;flex-wrap:wrap;gap:var(--sp-2);align-items:baseline;padding:var(--sp-2) var(--sp-3);background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-sm)}',
    '.lab-prompt-cache-checks strong{flex:none}',
    '.lab-prompt-cache-checks span.t{flex:1 1 14rem;font-size:var(--fs-sm);color:var(--text-2)}',
    '.lab-prompt-cache-notice{margin:0;padding:0;list-style:none;display:grid;gap:var(--sp-3)}',
    '.lab-prompt-cache-notice li{padding:var(--sp-3);background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-sm)}',
    '.lab-prompt-cache-notice strong{display:block;margin-bottom:var(--sp-1)}',
    '.lab-prompt-cache-result{margin-top:var(--sp-2);font-size:var(--fs-sm);color:var(--text-2)}',
    '.lab-prompt-cache-result:empty{display:none}'
  ].join('\n');

  function injectStyle() {
    if (document.getElementById('lab-prompt-cache-style')) return;
    var st = document.createElement('style');
    st.id = 'lab-prompt-cache-style';
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
  function pct(x, d) { return fmt(x * 100, d === undefined ? 0 : d) + '%'; }
  function money(n) { return '$' + (Math.abs(n) >= 1000 ? fmt(n, 0) : Math.abs(n) >= 1 ? fmt(n, 2) : fmt(n, 4)); }
  function minutes(m) {
    if (m < 1) return fmt(m * 60, 0) + ' s';
    if (m < 120) return fmt(m, m < 10 ? 1 : 0) + ' min';
    return fmt(m / 60, 1) + ' h';
  }

  /* Marker shapes double up colour: circle = hit, square = expired, triangle = unstable prefix, diamond = overflow, bar = below minimum. */
  function markerShape(kind, x, y) {
    var cls = P + 'm-' + KINDS[kind].cls, r = 4;
    if (kind === 'hit') return svg('circle', { cx: x, cy: y, r: r, class: cls });
    if (kind === 'expired') return svg('rect', { x: x - r, y: y - r, width: 2 * r, height: 2 * r, class: cls });
    if (kind === 'broken') return svg('path', { d: 'M' + x + ' ' + (y - r - 1) + 'L' + (x + r + 1) + ' ' + (y + r) + 'L' + (x - r - 1) + ' ' + (y + r) + 'Z', class: cls });
    if (kind === 'overflow') return svg('path', { d: 'M' + x + ' ' + (y - r - 1) + 'L' + (x + r + 1) + ' ' + y + 'L' + x + ' ' + (y + r + 1) + 'L' + (x - r - 1) + ' ' + y + 'Z', class: cls });
    return svg('rect', { x: x - 1.5, y: y - r - 1, width: 3, height: 2 * r + 2, class: cls });
  }

  function mount(container, api) {
    injectStyle();
    var uid = G.uid('pc');
    var state = sanitize(Object.assign({}, BASE, { preset: 'tenants' }, api.load() || {}));
    var cur = analyze(state), sim = null, seed = 7;
    var inputs = {}, presetBtns = {}, charts = [], timers = [];
    var tiles, summary, derived, checks, presetNote, simNote, costNote;

    function labelFor(id, text, unit) {
      return G.el('label', { for: id }, text, unit ? G.el('span', { class: P + 'unit' }, ' (' + unit + ')') : null);
    }
    function numField(key, text, opts) {
      opts = opts || {};
      var id = uid + '-' + key;
      var input = G.el('input', { class: P + 'input', id: id, type: 'number', min: LIMITS[key][0], max: LIMITS[key][1],
        step: opts.step || (INTS[key] ? 1 : 'any'), inputmode: INTS[key] ? 'numeric' : 'decimal' });
      input.value = state[key];
      input.addEventListener('input', function () {
        var v = parseFloat(input.value);
        if (!isFinite(v)) return;
        state[key] = v;
        commit();
      });
      input.addEventListener('change', function () { input.value = state[key]; });
      inputs[key] = input;
      var hintId = id + '-hint';
      if (opts.hint) input.setAttribute('aria-describedby', hintId);
      return G.el('div', { class: P + 'field' }, labelFor(id, text, opts.unit), input,
        opts.hint ? G.el('p', { class: P + 'hint', id: hintId }, opts.hint) : null);
    }
    function selectField(key, text, options) {
      var id = uid + '-' + key;
      var sel = G.el('select', { class: P + 'input', id: id }, options.map(function (o) { return G.el('option', { value: o[0] }, o[1]); }));
      sel.value = state[key];
      sel.addEventListener('change', function () { state[key] = sel.value; commit(); });
      inputs[key] = sel;
      return G.el('div', { class: P + 'field' }, labelFor(id, text), sel);
    }
    function rangeField(key, text, unit) {
      var id = uid + '-' + key;
      var out = G.el('output', { for: id, class: P + 'unit' });
      var input = G.el('input', { class: P + 'range', id: id, type: 'range', min: LIMITS[key][0], max: LIMITS[key][1], step: 1 });
      input.value = state[key];
      input._show = function () { out.textContent = ' ' + fmt(state[key]) + unit; };
      input.addEventListener('input', function () { state[key] = parseFloat(input.value); commit(); });
      inputs[key] = input;
      input._show();
      return G.el('div', { class: P + 'field' }, G.el('label', { for: id }, text, out), input);
    }

    function syncInputs() {
      Object.keys(inputs).forEach(function (k) {
        if (document.activeElement !== inputs[k]) inputs[k].value = state[k];
        if (inputs[k]._show) inputs[k]._show();
      });
      Object.keys(presetBtns).forEach(function (id) { presetBtns[id].setAttribute('aria-pressed', String(state.preset === id)); });
      var p = PRESETS.filter(function (x) { return x.id === state.preset; })[0];
      presetNote.textContent = p ? p.note : 'Custom settings. Prices and discounts are illustrative; use your provider\'s current pricing page for real numbers.';
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
      state = sanitize(Object.assign({}, BASE, p.values, { preset: id }));
      syncInputs();
      update();
    }

    function chartBox(renderFn) {
      var box = G.el('div', { class: P + 'chart' }), w = 0, ro = null;
      function draw() {
        var width = Math.floor(box.clientWidth) || 0;
        if (width < 120) return;
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
    function renderGauge(w) {
      var gw = Math.min(w, 340), H = Math.round(gw / 2) + 62, cx = w / 2, R = gw / 2 - 24, cy = R + 20;
      var h = cur.hit, be = cur.breakEven;
      var status = h > 0 && (be === null || h >= be) ? 'ok' : (h === 0 && (be === null || be === 0) ? 'warn' : 'bad');
      function pt(frac, rad) { var th = Math.PI * (1 - frac); return [cx + rad * Math.cos(th), cy - rad * Math.sin(th)]; }
      var a = pt(0, R), b = pt(1, R), e = pt(h, R);
      var label = 'Hit rate ' + pct(h, 1) + (be === null ? '' : ', break-even ' + pct(be, 1)) + '.';
      var el = svg('svg', { width: w, height: H, viewBox: '0 0 ' + w + ' ' + H, role: 'img', 'aria-label': label });
      el.appendChild(svg('path', { d: 'M' + a[0] + ' ' + a[1] + 'A' + R + ' ' + R + ' 0 0 1 ' + b[0] + ' ' + b[1], class: P + 'track' }));
      if (h > 0.0005) el.appendChild(svg('path', { d: 'M' + a[0] + ' ' + a[1] + 'A' + R + ' ' + R + ' 0 0 1 ' + e[0] + ' ' + e[1], class: P + 'gauge ' + P + 'gauge-' + status }));
      if (be !== null && be > 0) {
        var i1 = pt(be, R - 14), i2 = pt(be, R + 14);
        el.appendChild(svg('line', { x1: i1[0], y1: i1[1], x2: i2[0], y2: i2[1], class: P + 'be' }));
        el.appendChild(svg('text', { x: cx, y: cy + 38, 'text-anchor': 'middle', class: P + 'svgtext' }, ['tick = break-even hit rate ' + pct(be, 0)]));
      }
      el.appendChild(svg('text', { x: cx, y: cy - 4, 'text-anchor': 'middle', class: P + 'svgtext-big' }, [pct(h, 0)]));
      el.appendChild(svg('text', { x: cx, y: cy + 16, 'text-anchor': 'middle', class: P + 'svgtext' }, ['expected hit rate']));
      el.appendChild(svg('text', { x: a[0], y: cy + 16, 'text-anchor': 'middle', class: P + 'svgtext' }, ['0%']));
      el.appendChild(svg('text', { x: b[0], y: cy + 16, 'text-anchor': 'middle', class: P + 'svgtext' }, ['100%']));
      return el;
    }

    function renderCosts(w) {
      var c = cur.costs, rowH = 56, H = rowH * 2 + 4, max = Math.max(c.inputPlain, c.inputCached, 1e-9), k = w / max;
      var rows = [
        { t: 'No caching', total: c.inputPlain, segs: [['variable', c.parts.variable], ['full', c.inputPlain - c.parts.variable]] },
        { t: 'With caching', total: c.inputCached, segs: [['variable', c.parts.variable], ['reads', c.parts.reads],
          ['full', c.parts.misses], ['premium', c.parts.premium]] }
      ];
      var el = svg('svg', { width: w, height: H, viewBox: '0 0 ' + w + ' ' + H, role: 'img',
        'aria-label': 'Monthly input cost: ' + money(c.inputPlain) + ' without caching, ' + money(c.inputCached) + ' with caching.' });
      rows.forEach(function (r, i) {
        var y = i * rowH, x = 0;
        el.appendChild(svg('text', { x: 0, y: y + 12, class: P + 'svgtext' }, [r.t]));
        el.appendChild(svg('text', { x: w, y: y + 12, 'text-anchor': 'end', class: P + 'svgtext' }, [money(r.total) + ' per month']));
        r.segs.forEach(function (sg) {
          var sw = Math.max(0, sg[1] * k);
          if (sw <= 0.05) return;
          el.appendChild(svg('rect', { x: x, y: y + 20, width: sw, height: 24, class: P + 'seg ' + P + 'seg-' + sg[0] }));
          x += sw;
        });
      });
      return el;
    }

    function renderTimeline(w) {
      var H = 120, win = timelineWindow(state), padL = 4, padR = 4, span = w - padL - padR;
      var el = svg('svg', { width: w, height: H, viewBox: '0 0 ' + w + ' ' + H, role: 'img',
        'aria-label': 'Request timeline for one key over ' + minutes(win) + ': ' + sim.counts.hit + ' hits and ' + (sim.n - sim.counts.hit) + ' misses out of ' + sim.n + ' requests.' });
      el.appendChild(svg('rect', { x: padL, y: 4, width: span, height: 42, rx: 4, class: P + 'lane' }));
      el.appendChild(svg('rect', { x: padL, y: 52, width: span, height: 42, rx: 4, class: P + 'lane' }));
      el.appendChild(svg('text', { x: padL + 6, y: 17, class: P + 'svgtext' }, ['hits']));
      el.appendChild(svg('text', { x: padL + 6, y: 65, class: P + 'svgtext' }, ['misses']));
      sim.events.forEach(function (ev) {
        var x = padL + (ev.t / win) * span, y = KINDS[ev.kind].lane === 0 ? 33 : 81;
        el.appendChild(markerShape(ev.kind, x, y));
      });
      el.appendChild(svg('line', { x1: padL, x2: w - padR, y1: 100, y2: 100, class: P + 'axis' }));
      [0, 0.5, 1].forEach(function (f) {
        var x = padL + f * span;
        el.appendChild(svg('line', { x1: x, x2: x, y1: 100, y2: 105, class: P + 'axis' }));
        el.appendChild(svg('text', { x: x, y: 117, 'text-anchor': f === 0 ? 'start' : f === 1 ? 'end' : 'middle', class: P + 'svgtext' }, [minutes(win * f)]));
      });
      return el;
    }

    /* ---------- outputs ---------- */
    function tile(label, value, note) {
      return G.el('div', { class: P + 'tile' }, G.el('dt', null, label), G.el('dd', null, value, note ? G.el('small', null, note) : null));
    }

    function status(kind, text) { return G.el('span', { class: P + 'chip ' + P + 'chip-' + kind }, text); }

    function update() {
      cur = analyze(state);
      var c = cur.costs, hm = cur.hm, be = cur.breakEven;
      sim = simulate(state, { seed: seed, windowMin: timelineWindow(state), maxEvents: 150 });

      G.clear(derived);
      derived.appendChild(document.createTextNode('Per-key rate: ' + fmt(hm.perKey, 2) + ' req/min, mean gap ' + minutes(1 / hm.perKey) +
        ' against a ' + minutes(state.ttlMin) + ' lifetime. Stable-prefix rate per key: ' + fmt(hm.stableRate, 2) + ' req/min' +
        (hm.routed < 1 ? ', above the ' + fmt(state.satThreshold) + ' threshold so only ' + pct(hm.routed, 0) + ' are routed to the cached entry.' : '.')));

      G.clear(summary);
      summary.appendChild(document.createTextNode(hm.cacheable
        ? 'Expected hit rate ' + pct(cur.hit, 1) + ': input cost goes from ' + money(c.inputPlain) + ' to ' + money(c.inputCached) + ' per month (' +
          (c.inputSaved >= 0 ? 'saves ' + pct(c.inputSavedPct, 1) : 'costs ' + pct(-c.inputSavedPct, 1) + ' more') + '). '
        : 'The prefix (' + fmt(state.prefixTokens) + ' tokens) is below the ' + fmt(state.minTokens) + ' token minimum, so nothing is cached. '));
      summary.appendChild(!hm.cacheable ? status('warn', 'No caching applied')
        : be === null ? status('warn', 'No discount and no premium: caching changes nothing')
          : cur.hit >= be && cur.hit > 0 ? status('ok', 'Above break-even') : status(c.inputSaved < 0 ? 'bad' : 'warn', c.inputSaved < 0 ? 'Below break-even: caching costs more' : 'No hits yet'));

      G.clear(tiles);
      [
        tile('Input, no caching', money(c.inputPlain), 'per month'),
        tile('Input, with caching', money(c.inputCached), 'per month'),
        tile('Input saved', (c.inputSaved >= 0 ? '' : '-') + money(Math.abs(c.inputSaved)), pct(c.inputSavedPct, 1) + ' of input'),
        tile('Whole bill saved', pct(c.totalSavedPct, 1), money(c.totalPlain) + ' to ' + money(c.totalCached) + ' with output'),
        tile('Break-even hit rate', be === null ? 'n/a' : pct(be, 1), be === 0 ? 'no write premium: any hit saves' : 'w / (d + w)'),
        tile('Time to first token', cur.hit > 0 && hm.cacheable ? '-' + pct(cur.ttft.onHit[0], 0) + ' to -' + pct(cur.ttft.onHit[1], 0) : 'no change', 'estimate, on a hit')
      ].forEach(function (t) { tiles.appendChild(t); });

      costNote.textContent = 'Monthly input = requests (' + fmt(c.requestsPerMonth) + ' in a 30 day month) x tokens x price. Prefix multiplier m = ' + fmt(c.multiplier, 3) +
        '. Output (' + money(c.output) + ' per month) is not cached and is the same either way.';
      simNote.textContent = 'Sample of ' + sim.n + ' requests on one key (seed ' + seed + '): ' + sim.counts.hit + ' hits, ' + pct(sim.hitRate, 0) +
        '. The model says ' + pct(cur.hit, 0) + ' over the long run.';

      G.clear(checks);
      var cap = state.satThreshold;
      [
        ['Static prefix first', 'Instructions, tool definitions and examples come before anything that changes.', null],
        ['Stable tool order', 'Serialise tools and schemas in a fixed order; reordering changes the prefix.', null],
        ['No timestamps early', state.brokenPct === 0 ? 'No unstable elements are modelled.' : pct(state.brokenPct / 100, 0) + ' of requests break the prefix, so they miss' + (state.writePremiumPct > 0 ? ' and still pay the write premium.' : '.'),
          state.brokenPct === 0 ? 'ok' : 'warn'],
        ['Keep above the minimum', hm.cacheable ? 'Prefix ' + fmt(state.prefixTokens) + ' tokens, minimum ' + fmt(state.minTokens) + '.' : 'Prefix ' + fmt(state.prefixTokens) + ' tokens is below the ' + fmt(state.minTokens) + ' minimum.',
          hm.cacheable ? 'ok' : 'bad'],
        ['Use a key to group related requests', hm.stableRate <= cap ? 'Stable-prefix rate per key is ' + fmt(hm.stableRate, 2) + ' req/min, within about ' + fmt(cap) + '.' : fmt(hm.stableRate, 1) + ' req/min per key exceeds about ' + fmt(cap) + '. Spread load over more keys with a stable key-to-prefix mapping.',
          hm.stableRate <= cap ? 'ok' : 'warn'],
        ['Measure cached_tokens', 'Compare the cached token count in the response usage with this model\'s hit rate. Trust measurements over this estimate.', null]
      ].forEach(function (it) {
        checks.appendChild(G.el('li', null, G.el('strong', null, it[0]), G.el('span', { class: 't' }, it[1]),
          it[2] ? status(it[2], it[2] === 'ok' ? 'OK' : it[2] === 'warn' ? 'Check' : 'Fix') : null));
      });

      charts.forEach(function (ch) { ch.redraw(); });
      persist();
    }

    /* ---------- guided experiments ---------- */
    function experiment(title, text, buttons) {
      var out = G.el('p', { class: P + 'result', role: 'status' });
      var row = G.el('div', { class: P + 'row' });
      buttons.forEach(function (b) {
        row.appendChild(G.el('button', { type: 'button', class: P + 'btn', on: { click: function () {
          var before = cur, bState = state;
          state = sanitize(Object.assign({}, state, b.patch(state), { preset: 'custom' }));
          syncInputs();
          update();
          out.textContent = b.describe(before, cur, bState, state);
        } } }, b.label));
      });
      return G.el('li', null, G.el('strong', null, title), G.el('span', null, text), row, out);
    }
    function hitText(b, a) { return 'hit rate ' + pct(b.hit, 1) + ' to ' + pct(a.hit, 1) + ', input cost ' + money(b.costs.inputCached) + ' to ' + money(a.costs.inputCached) + ' per month (no caching: ' + money(a.costs.inputPlain) + ').'; }

    var experiments = [
      experiment('1. Lifetime has to beat the gap between requests',
        'Hits need the next request on a key to arrive before the entry expires. Shrink or stretch the lifetime and compare.', [
          { label: 'Lifetime 1 min', patch: function () { return { ttlMin: 1 }; }, describe: function (b, a) { return 'Lifetime 1 min: ' + hitText(b, a); } },
          { label: 'Lifetime 30 min', patch: function () { return { ttlMin: 30 }; }, describe: function (b, a) { return 'Lifetime 30 min: ' + hitText(b, a); } }
        ]),
      experiment('2. An unstable prefix wastes the write premium',
        'A timestamp near the top changes the prefix on most requests. They miss, and with a write premium they still pay it.', [
          { label: 'Break the prefix on 70% of requests', patch: function () { return { brokenPct: 70 }; },
            describe: function (b, a) { return 'Unstable prefix: ' + hitText(b, a) + (a.costs.inputSaved < 0 ? ' Caching now costs more than not caching.' : ''); } }
        ]),
      experiment('3. One hot key saturates; more keys spread the load',
        'Above roughly 15 requests per minute per key, OpenAI and Azure document that some requests miss. Send heavy traffic to one key, then spread it.', [
          { label: '120 req/min on 1 key', patch: function () { return { rpm: 120, keys: 1, pattern: 'steady', brokenPct: 0 }; },
            describe: function (b, a) { return 'One key: ' + hitText(b, a) + ' Routed to the cached entry: ' + pct(a.hm.routed, 0) + '.'; } },
          { label: 'Spread over 20 keys', patch: function () { return { keys: 20 }; },
            describe: function (b, a) { return '20 keys, ' + fmt(a.hm.perKey, 1) + ' req/min each: ' + hitText(b, a); } }
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
    derived = G.el('p', { class: P + 'hint' });

    var controls = G.el('section', { class: P + 'card ' + P + 'card-accent', 'aria-labelledby': uid + '-ch' },
      G.el('h3', { class: P + 'h', id: uid + '-ch' }, 'Controls'),
      G.el('p', { class: P + 'muted' }, 'Prices, discounts and lifetimes are illustrative defaults. Replace them with your provider\'s current numbers.'),
      presetRow, presetNote,
      G.el('h4', { class: P + 'sub' }, 'Traffic'),
      G.el('div', { class: P + 'fields' },
        numField('rpm', 'Requests per minute', { unit: 'total' }),
        selectField('pattern', 'Arrival pattern', [['steady', 'Steady (evenly spaced)'], ['bursty', 'Bursty (clusters of about 10)'], ['sparse', 'Sparse (random gaps)']]),
        numField('keys', 'Distinct cache keys', { hint: 'Tenants, prompts or prompt_cache_key values.' })),
      derived,
      G.el('h4', { class: P + 'sub' }, 'Prompt'),
      G.el('div', { class: P + 'fields' },
        numField('prefixTokens', 'Stable prefix', { unit: 'tokens' }),
        numField('variableTokens', 'Variable tokens', { unit: 'per request' }),
        numField('outputTokens', 'Output tokens', { unit: 'per request' }),
        numField('minTokens', 'Minimum cacheable', { unit: 'tokens', hint: 'Often 1,024. Below it, nothing is cached.' })),
      G.el('h4', { class: P + 'sub' }, 'Pricing (illustrative)'),
      G.el('div', { class: P + 'fields' },
        numField('inPrice', 'Input price', { unit: '$ per 1M tokens', step: 'any' }),
        numField('outPrice', 'Output price', { unit: '$ per 1M tokens', step: 'any' }),
        numField('discountPct', 'Cached-read discount', { unit: '%', hint: 'Cached tokens cost price x (1 - discount).' }),
        numField('writePremiumPct', 'Cache-write premium', { unit: '%', hint: '0 for providers that do not charge for writes.' })),
      G.el('h4', { class: P + 'sub' }, 'Cache behaviour'),
      G.el('div', { class: P + 'fields' },
        numField('ttlMin', 'Cache lifetime', { unit: 'minutes', step: 'any', hint: 'Assumed to refresh on every hit.' }),
        rangeField('brokenPct', 'Prefix broken by an unstable element', '% of requests'),
        numField('satThreshold', 'Per-key saturation point', { unit: 'req/min', hint: 'Azure OpenAI documents about 15 per prefix and key.' })));

    tiles = G.el('dl', { class: P + 'tiles' });
    summary = G.el('p', { 'aria-live': 'polite', 'aria-atomic': 'true' });
    costNote = G.el('p', { class: P + 'muted' });
    simNote = G.el('p', { class: P + 'muted' });
    checks = G.el('ul', { class: P + 'checks' });
    var gaugeBox = chartBox(renderGauge), costBox = chartBox(renderCosts), lineBox = chartBox(renderTimeline);

    var legendKinds = ['hit', 'expired', 'broken', 'overflow', 'below'];
    var timelineLegend = G.el('ul', { class: P + 'legend', 'aria-label': 'Timeline legend' }, legendKinds.map(function (kd) {
      var icon = svg('svg', { width: 14, height: 14, viewBox: '0 0 14 14', 'aria-hidden': 'true' }, [markerShape(kd, 7, 7)]);
      return G.el('li', null, icon, KINDS[kd].label);
    }));

    var outputs = G.el('section', { class: P + 'card', 'aria-labelledby': uid + '-oh' },
      G.el('h3', { class: P + 'h', id: uid + '-oh' }, 'Live results'),
      summary,
      gaugeBox,
      G.el('div', { style: { height: 'var(--sp-2)' } }),
      tiles,
      G.el('h4', { class: P + 'sub' }, 'Monthly input cost'),
      costBox,
      G.el('ul', { class: P + 'legend', 'aria-label': 'Cost legend' },
        [['variable', 'Variable tokens'], ['reads', 'Cached reads'], ['full', 'Full-price prefix'], ['premium', 'Write premium']].map(function (l) {
          return G.el('li', null, G.el('span', { class: P + 'swatch ' + P + 'sw-' + l[0] }), l[1]);
        })),
      costNote,
      G.el('h4', { class: P + 'sub' }, 'Request timeline for one key'),
      lineBox, timelineLegend, simNote,
      G.el('div', { class: P + 'row', style: { marginTop: 'var(--sp-2)' } },
        G.el('button', { type: 'button', class: P + 'btn', on: { click: function () { seed = seed + 1; update(); } } }, 'Resample timeline')),
      G.el('p', { class: P + 'caption' }, 'Time to first token range is a heuristic, not a benchmark: cached share of the prompt x ' + pct(TTFT_SHARE[0], 0) + ' to ' + pct(TTFT_SHARE[1], 0) +
        ' (prefill is only part of the wait). Measure on your own traffic.'));

    var formula = G.el('section', { class: P + 'card', 'aria-labelledby': uid + '-fh' },
      G.el('h3', { class: P + 'h', id: uid + '-fh' }, 'The model'),
      G.el('code', { class: P + 'code' },
        'hit  = P(stable) x P(routed) x P(next request within lifetime)\nm    = hit x (1 - d) + (1 - hit) x (1 + w)     prefix cost multiplier\nbreak-even hit rate = w / (d + w)'),
      G.el('p', { class: P + 'muted' }, 'd is the cached-read discount and w the write premium. A hit pays the discounted price on the prefix; any miss pays full price plus the premium, including requests whose broken prefix was written for nothing. Variable and output tokens are never cached.'),
      G.el('p', { class: P + 'caption' }, 'Source: derived in this lab from the pricing rules above, not a provider formula. Billing and routing differ by provider. Per-key saturation after Azure OpenAI prompt caching guidance (about 15 requests per minute per prefix and prompt_cache_key; checked 2026-10-13). Some providers round the cached prefix down to a block size; this lab uses the full prefix.'));

    var checklist = G.el('section', { class: P + 'card', 'aria-labelledby': uid + '-kh' },
      G.el('h3', { class: P + 'h', id: uid + '-kh' }, 'Checklist for a cache-friendly prompt'), checks);

    var notice = G.el('section', { class: P + 'card', 'aria-labelledby': uid + '-nh' },
      G.el('h3', { class: P + 'h', id: uid + '-nh' }, 'What to notice'),
      G.el('ul', { class: P + 'notice' }, experiments));

    var root = G.el('div', { class: P + 'root', dataset: { lab: 'prompt-cache' } },
      G.el('p', { class: P + 'muted' }, 'Model hit rate, prefix stability, write charges and lifetime to see what prompt caching really saves. Defaults are illustrative, not vendor pricing.'),
      formula,
      G.el('div', { class: P + 'layout' }, controls, outputs),
      checklist, notice);
    container.appendChild(root);

    syncInputs();
    update();

    return {
      destroy: function () {
        timers.forEach(clearTimeout);
        charts.forEach(function (ch) { ch.stop(); });
        G.clear(container);
      }
    };
  }

  window.Guide.labs.register('prompt-cache', { mount: mount });
})();
