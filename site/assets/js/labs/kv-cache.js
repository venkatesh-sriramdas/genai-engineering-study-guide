/* Follow the Question: KV cache sizer lab. Owner: E3a.
   Part 1 is the pure model (also exported for Node tests). Part 2 is the UI.
   All numbers are illustrative shapes, never a specific vendor model. */
(function () {
  'use strict';

  /* ======================= Part 1: model ======================= */
  var GIB = 1073741824;
  var BLOCK_TOKENS = 16;
  var KV_BYTES = { fp16: 2, fp8: 1, int4: 0.5 };
  var W_BYTES = { fp16: 2, fp8: 1, int4: 0.5 };

  var PRESETS = [
    { id: 'mha7', name: '7B-class, MHA', note: '32 layers, 32 heads, 32 kv heads, head dim 128, fp16 weights on one 80 GiB GPU. Illustrative shape.',
      layers: 32, heads: 32, kvHeads: 32, headDim: 128, kvPrecision: 'fp16', context: 4096, sequences: 16,
      gpuGiB: 80, paramsB: 7, weightPrecision: 'fp16', reservePct: 10, actualTokens: 1500, prefixPct: 50 },
    { id: 'gqa7', name: '7B-class, GQA 8 kv heads', note: 'Same body as the MHA preset but 8 kv heads and an 8,192 token context. Illustrative shape.',
      layers: 32, heads: 32, kvHeads: 8, headDim: 128, kvPrecision: 'fp16', context: 8192, sequences: 32,
      gpuGiB: 80, paramsB: 7, weightPrecision: 'fp16', reservePct: 10, actualTokens: 1500, prefixPct: 50 },
    { id: 'gqa70', name: '70B-class, GQA 8 kv heads', note: '80 layers, 64 heads, 8 kv heads, head dim 128, fp16 weights spread over 4 x 80 GiB of GPU memory. Illustrative shape.',
      layers: 80, heads: 64, kvHeads: 8, headDim: 128, kvPrecision: 'fp16', context: 32768, sequences: 8,
      gpuGiB: 320, paramsB: 70, weightPrecision: 'fp16', reservePct: 10, actualTokens: 4000, prefixPct: 50 }
  ];

  var LIMITS = {
    layers: [1, 256, 32], heads: [1, 256, 32], kvHeads: [1, 256, 32], headDim: [8, 512, 128],
    context: [16, 4000000, 4096], sequences: [1, 100000, 16], gpuGiB: [1, 10000, 80],
    paramsB: [0.1, 5000, 7], reservePct: [0, 50, 10], actualTokens: [1, 4000000, 1500], prefixPct: [0, 90, 50]
  };
  var INTS = { layers: 1, heads: 1, kvHeads: 1, headDim: 1, context: 1, sequences: 1, actualTokens: 1 };

  function clampNum(v, lo, hi, d) {
    v = Number(v);
    if (!isFinite(v)) v = d;
    return Math.min(hi, Math.max(lo, v));
  }

  /* Coerce any object (typed input, saved state) into a valid state. */
  function sanitize(raw) {
    var base = PRESETS[0], r = raw || {}, s = {};
    Object.keys(LIMITS).forEach(function (k) {
      var lim = LIMITS[k], v = clampNum(r[k] === undefined ? base[k] : r[k], lim[0], lim[1], base[k]);
      s[k] = INTS[k] ? Math.round(v) : v;
    });
    s.kvHeads = Math.min(s.kvHeads, s.heads);
    s.actualTokens = Math.min(s.actualTokens, s.context);
    s.kvPrecision = KV_BYTES[r.kvPrecision] ? r.kvPrecision : base.kvPrecision;
    s.weightPrecision = W_BYTES[r.weightPrecision] ? r.weightPrecision : base.weightPrecision;
    s.preset = typeof r.preset === 'string' ? r.preset : 'custom';
    return s;
  }

  function kvBytesPerToken(s) { return 2 * s.layers * s.kvHeads * s.headDim * KV_BYTES[s.kvPrecision]; }
  function kvTotalBytes(perToken, contextTokens, sequences) { return perToken * contextTokens * sequences; }
  function weightsBytes(paramsB, precision) { return paramsB * 1e9 * W_BYTES[precision]; }

  /* Contiguous preallocation, 16-token paged blocks, and paged blocks with a shared prefix. */
  function paging(s, perTok, kvBudget) {
    var B = BLOCK_TOKENS;
    var a = Math.min(s.actualTokens, s.context);
    var pagedTok = Math.ceil(a / B) * B;
    var sharedTok = Math.floor(Math.floor(a * s.prefixPct / 100) / B) * B;
    var privTok = pagedTok - sharedTok;
    var S = s.sequences;
    var used = S * a * perTok;
    var frag = S * (pagedTok - a) * perTok;
    var contigAlloc = S * s.context * perTok;
    var pagedAlloc = S * pagedTok * perTok;
    var sharedAlloc = (sharedTok + S * privTok) * perTok;
    var sharedBytes = sharedTok * perTok;
    return {
      actual: a, blockTokens: B, pagedTok: pagedTok, sharedTok: sharedTok, privTok: privTok,
      used: used, contigAlloc: contigAlloc, contigWaste: contigAlloc - used,
      pagedAlloc: pagedAlloc, pagedWaste: frag,
      sharedAlloc: sharedAlloc, sharedWaste: frag, sharedSaved: pagedAlloc - sharedAlloc,
      contigWastePct: s.context > 0 ? (s.context - a) / s.context : 0,
      pagedWastePct: pagedTok > 0 ? (pagedTok - a) / pagedTok : 0,
      maxSeqContig: Math.floor(kvBudget / (s.context * perTok) + 1e-9),
      maxSeqPaged: Math.floor(kvBudget / (pagedTok * perTok) + 1e-9),
      maxSeqShared: kvBudget < sharedBytes ? 0 : Math.floor((kvBudget - sharedBytes) / (privTok * perTok) + 1e-9)
    };
  }

  function compute(s) {
    var perTok = kvBytesPerToken(s);
    var perSeq = perTok * s.context;
    var kvTotal = kvTotalBytes(perTok, s.context, s.sequences);
    var weights = weightsBytes(s.paramsB, s.weightPrecision);
    var gpu = s.gpuGiB * GIB;
    var reserve = gpu * s.reservePct / 100;
    var kvBudget = Math.max(0, gpu - reserve - weights);
    var out = {
      perTok: perTok, perSeq: perSeq, kvTotal: kvTotal, weights: weights, gpu: gpu, reserve: reserve,
      kvBudget: kvBudget, free: gpu - reserve - weights - kvTotal,
      maxSeq: Math.floor(kvBudget / perSeq + 1e-9),
      gqaFactor: s.heads / s.kvHeads,
      precFactor: KV_BYTES.fp16 / KV_BYTES[s.kvPrecision],
      attn: s.kvHeads === 1 ? 'MQA' : (s.kvHeads === s.heads ? 'MHA' : 'GQA')
    };
    out.paging = paging(s, perTok, kvBudget);
    return out;
  }

  var model = {
    GIB: GIB, BLOCK_TOKENS: BLOCK_TOKENS, KV_BYTES: KV_BYTES, W_BYTES: W_BYTES, PRESETS: PRESETS,
    sanitize: sanitize, kvBytesPerToken: kvBytesPerToken, kvTotalBytes: kvTotalBytes,
    weightsBytes: weightsBytes, paging: paging, compute: compute
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = model;

  /* ======================= Part 2: UI ======================= */
  if (typeof window === 'undefined' || !window.Guide || !window.Guide.labs) return;

  var G = window.Guide;
  var P = 'lab-kv-cache-';
  var SVGNS = 'http://www.w3.org/2000/svg';

  var CSS = [
    '.lab-kv-cache-root{display:grid;gap:var(--sp-5);color:var(--text);font-family:var(--font-sans);font-size:calc(var(--fs-md) * var(--font-scale, 1));line-height:var(--lh-body);min-width:0}',
    '.lab-kv-cache-root *{box-sizing:border-box}',
    '.lab-kv-cache-root p{margin:0}',
    '.lab-kv-cache-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);box-shadow:var(--shadow-1);padding:var(--sp-4);min-width:0}',
    '.lab-kv-cache-card-accent{border-left:4px solid var(--accent-line, var(--accent))}',
    '.lab-kv-cache-h{margin:0 0 var(--sp-3);font-size:var(--fs-lg);line-height:var(--lh-tight);font-weight:650}',
    '.lab-kv-cache-sub{margin:var(--sp-4) 0 var(--sp-2);font-size:var(--fs-sm);font-weight:650;color:var(--text-2);text-transform:uppercase;letter-spacing:.04em}',
    '.lab-kv-cache-muted{color:var(--muted);font-size:var(--fs-sm)}',
    '.lab-kv-cache-caption{color:var(--muted);font-size:var(--fs-xs);margin-top:var(--sp-2)}',
    '.lab-kv-cache-code{display:block;margin:var(--sp-2) 0;padding:var(--sp-3);background:var(--code-bg);border:1px solid var(--border);border-radius:var(--r-sm);font-family:var(--font-mono);font-size:var(--fs-sm);overflow-x:auto;white-space:pre}',
    '.lab-kv-cache-layout{display:grid;gap:var(--sp-5);grid-template-columns:repeat(auto-fit,minmax(min(100%,24rem),1fr));align-items:start}',
    '.lab-kv-cache-row{display:flex;flex-wrap:wrap;gap:var(--sp-2);align-items:center}',
    '.lab-kv-cache-fields{display:grid;gap:var(--sp-3) var(--sp-4);grid-template-columns:repeat(auto-fit,minmax(9.5rem,1fr))}',
    '.lab-kv-cache-field{display:grid;gap:var(--sp-1);align-content:start;min-width:0}',
    '.lab-kv-cache-field label{font-size:var(--fs-sm);font-weight:600;color:var(--text)}',
    '.lab-kv-cache-unit{font-weight:400;color:var(--muted)}',
    '.lab-kv-cache-hint{font-size:var(--fs-xs);color:var(--muted)}',
    '.lab-kv-cache-input{font:inherit;font-size:var(--fs-sm);width:100%;min-height:2.25rem;padding:.35rem .55rem;color:var(--text);background:var(--surface);border:1px solid var(--border-strong);border-radius:var(--r-sm);transition:border-color var(--dur) var(--ease),background var(--dur) var(--ease)}',
    '.lab-kv-cache-input:hover{border-color:var(--accent);background:var(--surface-2)}',
    '.lab-kv-cache-range{width:100%;accent-color:var(--accent);min-height:2rem}',
    '.lab-kv-cache-btn{font:inherit;font-size:var(--fs-sm);padding:.4rem .75rem;min-height:2.25rem;color:var(--text);background:var(--surface-2);border:1px solid var(--border-strong);border-radius:var(--r-sm);cursor:pointer;transition:background var(--dur) var(--ease),border-color var(--dur) var(--ease),transform var(--dur) var(--ease)}',
    '.lab-kv-cache-btn:hover{background:var(--surface-3);border-color:var(--accent)}',
    '.lab-kv-cache-btn:active{transform:translateY(1px)}',
    '.lab-kv-cache-btn[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}',
    '.lab-kv-cache-btn-sm{padding:.2rem .55rem;min-height:1.9rem;font-size:var(--fs-xs)}',
    '.lab-kv-cache-tiles{display:grid;gap:var(--sp-3);grid-template-columns:repeat(auto-fit,minmax(8.25rem,1fr));margin:0}',
    '.lab-kv-cache-tile{background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-sm);padding:var(--sp-3);min-width:0}',
    '.lab-kv-cache-tile dt{font-size:var(--fs-xs);color:var(--muted);margin:0}',
    '.lab-kv-cache-tile dd{margin:2px 0 0;font-size:var(--fs-xl);font-weight:700;line-height:var(--lh-tight);font-variant-numeric:tabular-nums}',
    '.lab-kv-cache-tile dd small{font-size:var(--fs-xs);font-weight:500;color:var(--muted)}',
    '.lab-kv-cache-chip{display:inline-block;padding:2px 10px;border-radius:var(--r-pill);font-size:var(--fs-xs);font-weight:600;background:var(--info-soft);color:var(--info);border:1px solid currentColor}',
    '.lab-kv-cache-chip-ok{background:var(--ok-soft);color:var(--ok)}',
    '.lab-kv-cache-chip-bad{background:var(--bad-soft);color:var(--bad)}',
    '.lab-kv-cache-chip-warn{background:var(--warn-soft);color:var(--warn)}',
    '.lab-kv-cache-chart{width:100%;min-width:0}',
    '.lab-kv-cache-chart svg{display:block;max-width:100%}',
    '.lab-kv-cache-seg{stroke-width:1.5}',
    '.lab-kv-cache-seg-weights{fill:var(--info-soft);stroke:var(--info)}',
    '.lab-kv-cache-seg-kv{fill:color-mix(in srgb,var(--accent) 26%,var(--surface));stroke:var(--accent)}',
    '.lab-kv-cache-seg-reserve{fill:var(--surface-3);stroke:var(--border-strong)}',
    '.lab-kv-cache-seg-free{fill:var(--ok-soft);stroke:var(--ok)}',
    '.lab-kv-cache-seg-over{fill:var(--bad-soft);stroke:var(--bad)}',
    '.lab-kv-cache-seg-useful{fill:color-mix(in srgb,var(--accent) 26%,var(--surface));stroke:var(--accent)}',
    '.lab-kv-cache-seg-waste{fill:var(--warn-soft);stroke:var(--warn)}',
    '.lab-kv-cache-seg-saved{fill:none;stroke:var(--border-strong);stroke-dasharray:4 3}',
    '.lab-kv-cache-limit{stroke:var(--bad);stroke-width:2;stroke-dasharray:4 3}',
    '.lab-kv-cache-svgtext{fill:var(--text-2);font:11px var(--font-sans)}',
    '.lab-kv-cache-svgtext-in{fill:var(--text);font:600 11px var(--font-sans)}',
    '.lab-kv-cache-svgtext-bad{fill:var(--bad);font:600 11px var(--font-sans)}',
    '.lab-kv-cache-legend{display:flex;flex-wrap:wrap;gap:var(--sp-1) var(--sp-4);margin:var(--sp-2) 0 0;padding:0;list-style:none;font-size:var(--fs-xs);color:var(--text-2)}',
    '.lab-kv-cache-legend li{display:flex;align-items:center;gap:6px}',
    '.lab-kv-cache-swatch{width:12px;height:12px;border-radius:3px;border:1.5px solid;flex:none}',
    '.lab-kv-cache-sw-weights{background:var(--info-soft);border-color:var(--info)}',
    '.lab-kv-cache-sw-kv{background:color-mix(in srgb,var(--accent) 26%,var(--surface));border-color:var(--accent)}',
    '.lab-kv-cache-sw-reserve{background:var(--surface-3);border-color:var(--border-strong)}',
    '.lab-kv-cache-sw-free{background:var(--ok-soft);border-color:var(--ok)}',
    '.lab-kv-cache-sw-waste{background:var(--warn-soft);border-color:var(--warn)}',
    '.lab-kv-cache-maxrow{display:grid;gap:var(--sp-2);grid-template-columns:repeat(auto-fit,minmax(8rem,1fr));margin-top:var(--sp-3)}',
    '.lab-kv-cache-maxrow div{background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-sm);padding:var(--sp-2) var(--sp-3);font-size:var(--fs-xs);color:var(--muted)}',
    '.lab-kv-cache-maxrow strong{display:block;font-size:var(--fs-lg);color:var(--text);font-variant-numeric:tabular-nums}',
    '.lab-kv-cache-notice{margin:0;padding:0;list-style:none;display:grid;gap:var(--sp-3)}',
    '.lab-kv-cache-notice li{padding:var(--sp-3);background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-sm)}',
    '.lab-kv-cache-notice strong{display:block;margin-bottom:var(--sp-1)}',
    '.lab-kv-cache-result{margin-top:var(--sp-2);font-size:var(--fs-sm);color:var(--text-2)}',
    '.lab-kv-cache-result:empty{display:none}'
  ].join('\n');

  function injectStyle() {
    if (document.getElementById('lab-kv-cache-style')) return;
    var st = document.createElement('style');
    st.id = 'lab-kv-cache-style';
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
  function gib(b, d) { return fmt(b / GIB, d === undefined ? 2 : d); }
  function bytes(b) {
    if (b >= 1048576) return fmt(b / 1048576, 2) + ' MiB';
    if (b >= 1024) return fmt(b / 1024, 1) + ' KiB';
    return fmt(b, 1) + ' B';
  }

  function mount(container, api) {
    injectStyle();
    var uid = G.uid('kvc');
    var state = sanitize(Object.assign({}, PRESETS[0], { preset: 'mha7' }, api.load() || {}));
    var cur = compute(state);
    var inputs = {}, presetBtns = {}, charts = [], timers = [];
    var tiles, summary, formulaLive, attnNote, precNote, maxRow, pageNote, presetNote;

    /* ---------- field builders ---------- */
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
    function selectField(key, text, options, hintEl) {
      var id = uid + '-' + key;
      var sel = G.el('select', { class: P + 'input', id: id },
        options.map(function (o) { return G.el('option', { value: o[0] }, o[1]); }));
      sel.value = state[key];
      sel.addEventListener('change', function () { state[key] = sel.value; commit(); });
      inputs[key] = sel;
      if (hintEl) sel.setAttribute('aria-describedby', hintEl.id);
      return G.el('div', { class: P + 'field' }, labelFor(id, text), sel, hintEl);
    }
    function rangeField(key, text, unit) {
      var id = uid + '-' + key;
      var out = G.el('output', { for: id, class: P + 'unit' });
      var input = G.el('input', { class: P + 'range', id: id, type: 'range', min: LIMITS[key][0], max: LIMITS[key][1], step: 1 });
      input.value = state[key];
      function show() { out.textContent = ' ' + fmt(state[key]) + unit; }
      input.addEventListener('input', function () { state[key] = parseFloat(input.value); commit(); });
      input._show = show;
      inputs[key] = input;
      show();
      return G.el('div', { class: P + 'field' }, G.el('label', { for: id }, text, out), input);
    }

    function syncInputs() {
      Object.keys(inputs).forEach(function (k) {
        if (document.activeElement !== inputs[k]) inputs[k].value = state[k];
        if (inputs[k]._show) inputs[k]._show();
      });
      inputs.kvHeads.max = state.heads;
      inputs.actualTokens.max = state.context;
      Object.keys(presetBtns).forEach(function (id) { presetBtns[id].setAttribute('aria-pressed', String(state.preset === id)); });
      var p = PRESETS.filter(function (x) { return x.id === state.preset; })[0];
      presetNote.textContent = p ? p.note : 'Custom settings. All values stay illustrative until you plug in your own model card.';
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
      state = sanitize(Object.assign({}, p, { preset: id }));
      syncInputs();
      update();
    }

    /* ---------- chart wrapper (re-renders at the measured width) ---------- */
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

    function renderStack(w) {
      var H = 88, by = 20, bh = 36, total = Math.max(cur.gpu, cur.weights + cur.kvTotal + cur.reserve), k = w / total, x = 0;
      var over = cur.free < 0;
      var label = 'GPU memory: weights ' + gib(cur.weights) + ' GiB, KV cache ' + gib(cur.kvTotal) + ' GiB, reserve ' + gib(cur.reserve) +
        ' GiB, ' + (over ? 'over capacity by ' + gib(-cur.free) : 'free ' + gib(cur.free)) + ' GiB.';
      var el = svg('svg', { width: w, height: H, viewBox: '0 0 ' + w + ' ' + H, role: 'img', 'aria-label': label });
      [['weights', cur.weights], ['kv', cur.kvTotal], ['reserve', cur.reserve], ['free', Math.max(0, cur.free)]].forEach(function (sg) {
        var sw = sg[1] * k;
        if (sw <= 0) return;
        el.appendChild(svg('rect', { x: x, y: by, width: sw, height: bh, rx: 3, class: P + 'seg ' + P + 'seg-' + sg[0] }));
        if (sw > 52) el.appendChild(svg('text', { x: x + sw / 2, y: by + bh / 2 + 4, 'text-anchor': 'middle', class: P + 'svgtext-in' }, [gib(sg[1], 1)]));
        x += sw;
      });
      if (over) {
        var lx = cur.gpu * k;
        el.appendChild(svg('line', { x1: lx, x2: lx, y1: by - 8, y2: by + bh + 8, class: P + 'limit' }));
        el.appendChild(svg('text', { x: lx - 4, y: 12, 'text-anchor': 'end', class: P + 'svgtext-bad' }, ['GPU limit ' + gib(cur.gpu, 0) + ' GiB']));
      }
      el.appendChild(svg('text', { x: 0, y: by + bh + 18, class: P + 'svgtext' }, ['0']));
      el.appendChild(svg('text', { x: w, y: by + bh + 18, 'text-anchor': 'end', class: over ? P + 'svgtext-bad' : P + 'svgtext' },
        [over ? 'needs ' + gib(total, 1) + ' GiB' : gib(cur.gpu, 0) + ' GiB GPU']));
      return el;
    }

    function renderPaging(w) {
      var pg = cur.paging, rowH = 56, H = rowH * 3 + 4;
      var max = Math.max(pg.contigAlloc, pg.pagedAlloc, pg.sharedAlloc, 1), k = w / max;
      var rows = [
        { t: 'Contiguous (max length)', alloc: pg.contigAlloc, waste: pg.contigWaste },
        { t: 'Paged (' + pg.blockTokens + '-token blocks)', alloc: pg.pagedAlloc, waste: pg.pagedWaste },
        { t: 'Paged + shared prefix', alloc: pg.sharedAlloc, waste: pg.sharedWaste, saved: pg.sharedSaved }
      ];
      var el = svg('svg', { width: w, height: H, viewBox: '0 0 ' + w + ' ' + H, role: 'img',
        'aria-label': 'Allocated KV memory for ' + fmt(state.sequences) + ' sequences. Contiguous ' + gib(pg.contigAlloc) + ' GiB, paged ' +
          gib(pg.pagedAlloc) + ' GiB, paged with shared prefix ' + gib(pg.sharedAlloc) + ' GiB. Wasted: ' + gib(pg.contigWaste) + ', ' +
          gib(pg.pagedWaste) + ' and ' + gib(pg.sharedWaste) + ' GiB.' });
      rows.forEach(function (r, i) {
        var y = i * rowH, useful = r.alloc - r.waste;
        el.appendChild(svg('text', { x: 0, y: y + 12, class: P + 'svgtext' }, [r.t]));
        el.appendChild(svg('text', { x: w, y: y + 12, 'text-anchor': 'end', class: P + 'svgtext' },
          [gib(r.alloc) + ' GiB, ' + gib(r.waste) + ' wasted']));
        el.appendChild(svg('rect', { x: 0, y: y + 20, width: Math.max(0, useful * k), height: 24, rx: 3, class: P + 'seg ' + P + 'seg-useful' }));
        if (r.waste > 0) el.appendChild(svg('rect', { x: useful * k, y: y + 20, width: Math.max(1, r.waste * k), height: 24, rx: 3, class: P + 'seg ' + P + 'seg-waste' }));
        if (r.saved > 0) el.appendChild(svg('rect', { x: r.alloc * k, y: y + 20, width: Math.max(1, r.saved * k), height: 24, rx: 3, class: P + 'seg ' + P + 'seg-saved' }));
      });
      return el;
    }

    /* ---------- outputs ---------- */
    function tile(label, value, unit) {
      return G.el('div', { class: P + 'tile' }, G.el('dt', null, label), G.el('dd', null, value, unit ? G.el('small', null, ' ' + unit) : null));
    }

    function update() {
      cur = compute(state);
      var pg = cur.paging, over = cur.free < 0;
      G.clear(tiles);
      [
        tile('KV per token', bytes(cur.perTok)),
        tile('KV per sequence', gib(cur.perSeq), 'GiB'),
        tile('Model weights', gib(cur.weights), 'GiB'),
        tile('KV budget after weights', gib(cur.kvBudget), 'GiB'),
        tile('Max concurrent sequences', fmt(cur.maxSeq), 'at full context'),
        tile('KV for requested', gib(cur.kvTotal), 'GiB')
      ].forEach(function (t) { tiles.appendChild(t); });

      var fit = G.el('span', { class: P + 'chip ' + (over ? P + 'chip-bad' : P + 'chip-ok') },
        over ? 'Over by ' + gib(-cur.free) + ' GiB' : 'Fits, ' + gib(cur.free) + ' GiB free');
      G.clear(summary);
      summary.appendChild(document.createTextNode('At ' + fmt(state.context) + ' tokens each sequence needs ' + gib(cur.perSeq) + ' GiB of KV cache. The GPU holds at most ' +
        fmt(cur.maxSeq) + ' of them; ' + fmt(state.sequences) + ' requested need ' + gib(cur.kvTotal) + ' GiB. '));
      summary.appendChild(fit);

      formulaLive.textContent = '2 x ' + state.layers + ' layers x ' + state.kvHeads + ' kv heads x ' + state.headDim + ' dim x ' + KV_BYTES[state.kvPrecision] +
        ' B = ' + fmt(cur.perTok) + ' B per token';
      attnNote.textContent = cur.attn + ': heads / kv_heads = ' + state.heads + ' / ' + state.kvHeads + ' = ' + fmt(cur.gqaFactor, 2) + 'x smaller KV than MHA. ' +
        'Precision factor vs fp16: ' + fmt(cur.precFactor, 2) + 'x. Combined: ' + fmt(cur.gqaFactor * cur.precFactor, 2) + 'x smaller than fp16 MHA.';
      precNote.textContent = state.kvPrecision === 'fp16' ? 'Baseline precision, 2 bytes per element.'
        : state.kvPrecision === 'fp8' ? 'Halves KV memory versus fp16. Lower precision can cost accuracy, so validate on your own evals.'
          : 'Quarters KV memory versus fp16, with the highest accuracy risk. Validate on your own evals; scale metadata overhead is not modelled.';

      G.clear(maxRow);
      [['Contiguous', pg.maxSeqContig], ['Paged', pg.maxSeqPaged], ['Paged + shared prefix', pg.maxSeqShared]].forEach(function (m) {
        maxRow.appendChild(G.el('div', null, G.el('strong', null, fmt(m[1])), 'max sequences, ' + m[0].toLowerCase()));
      });
      pageNote.textContent = 'Typical sequences use ' + fmt(pg.actual) + ' of ' + fmt(state.context) + ' tokens. Contiguous preallocation wastes ' + fmt(pg.contigWastePct * 100, 1) +
        '% of each reservation (' + gib(pg.contigWaste) + ' GiB across ' + fmt(state.sequences) + ' sequences). Paging wastes only the unfilled tail of the last block, ' +
        fmt(pg.pagedWastePct * 100, 2) + '% (' + gib(pg.pagedWaste) + ' GiB). Sharing a ' + fmt(pg.sharedTok) + ' token prefix saves a further ' + gib(pg.sharedSaved) + ' GiB.';

      charts.forEach(function (c) { c.redraw(); });
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
    function changeText(b, a) {
      var r = a.perSeq / b.perSeq;
      return gib(b.perSeq) + ' to ' + gib(a.perSeq) + ' GiB per sequence, ' + (r < 1 ? 'cut ' + fmt(1 / r, 2) + 'x' : r > 1 ? 'grew ' + fmt(r, 2) + 'x' : 'unchanged') + '.';
    }

    var experiments = [
      experiment('1. GQA cuts KV by heads over kv_heads',
        'Reduce kv heads and watch KV per sequence fall by exactly heads / kv_heads versus MHA.', [
          { label: 'Set kv heads to heads / 4', patch: function (s) { return { kvHeads: Math.max(1, Math.floor(s.heads / 4)) }; },
            describe: function (b, a, bs, as) {
              return bs.kvHeads === as.kvHeads ? 'kv heads already at ' + as.kvHeads + '. Pick the MHA preset first.'
                : 'kv heads ' + bs.kvHeads + ' to ' + as.kvHeads + ': ' + changeText(b, a) + ' (' + bs.kvHeads + ' / ' + as.kvHeads + ').';
            } }
        ]),
      experiment('2. Precision and context scale KV linearly',
        'Halve the bytes per element, then double the context. KV halves, then doubles.', [
          { label: 'Lower KV precision one step', patch: function (s) { return { kvPrecision: s.kvPrecision === 'fp16' ? 'fp8' : 'int4' }; },
            describe: function (b, a, bs, as) {
              return bs.kvPrecision === as.kvPrecision ? 'Already at int4, the lowest option here.'
                : bs.kvPrecision + ' to ' + as.kvPrecision + ': ' + changeText(b, a) + ' Check accuracy before shipping.';
            } },
          { label: 'Double the context', patch: function (s) { return { context: s.context * 2 }; },
            describe: function (b, a, bs, as) { return fmt(bs.context) + ' to ' + fmt(as.context) + ' tokens: ' + changeText(b, a); } }
        ]),
      experiment('3. At long contexts, KV limits concurrency, not weights',
        'Stretch the context 8x. Weights are a fixed cost; KV per sequence grows until it caps the batch.', [
          { label: 'Multiply context by 8', patch: function (s) { return { context: s.context * 8 }; },
            describe: function (b, a, bs, as) {
              return 'Context ' + fmt(bs.context) + ' to ' + fmt(as.context) + ': max sequences ' + fmt(b.maxSeq) + ' to ' + fmt(a.maxSeq) + '. Weights stayed at ' +
                gib(a.weights) + ' GiB, but one sequence now needs ' + gib(a.perSeq) + ' GiB of KV.';
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
    presetRow.appendChild(G.el('button', { type: 'button', class: P + 'btn', on: { click: function () { applyPreset(state.preset === 'custom' ? 'mha7' : state.preset); } } }, 'Reset'));

    attnNote = G.el('p', { class: P + 'hint', id: uid + '-attn' });
    precNote = G.el('p', { class: P + 'hint', id: uid + '-prec' });
    var kvQuick = G.el('div', { class: P + 'row' },
      G.el('button', { type: 'button', class: P + 'btn ' + P + 'btn-sm', on: { click: function () { state.kvHeads = state.heads; commit(); } } }, 'MHA'),
      G.el('button', { type: 'button', class: P + 'btn ' + P + 'btn-sm', on: { click: function () { state.kvHeads = Math.min(8, state.heads); commit(); } } }, 'GQA 8'),
      G.el('button', { type: 'button', class: P + 'btn ' + P + 'btn-sm', on: { click: function () { state.kvHeads = 1; commit(); } } }, 'MQA'));

    var controls = G.el('section', { class: P + 'card ' + P + 'card-accent', 'aria-labelledby': uid + '-ch' },
      G.el('h3', { class: P + 'h', id: uid + '-ch' }, 'Controls'),
      G.el('p', { class: P + 'muted' }, 'Start from a preset. These are illustrative shapes, not any vendor\'s model.'),
      presetRow, presetNote,
      G.el('h4', { class: P + 'sub' }, 'Model shape'),
      G.el('div', { class: P + 'fields' },
        numField('layers', 'Layers'),
        numField('heads', 'Attention heads'),
        G.el('div', { class: P + 'field' }, numField('kvHeads', 'KV heads', { hint: 'MHA = heads, GQA = fewer, MQA = 1.' }), kvQuick),
        numField('headDim', 'Head dimension'),
        selectField('kvPrecision', 'KV precision', [['fp16', 'fp16 (2 bytes)'], ['fp8', 'fp8 (1 byte)'], ['int4', 'int4 (0.5 byte)']], precNote)),
      attnNote,
      G.el('h4', { class: P + 'sub' }, 'Workload and hardware'),
      G.el('div', { class: P + 'fields' },
        numField('context', 'Context length', { unit: 'tokens' }),
        numField('sequences', 'Concurrent sequences'),
        numField('gpuGiB', 'GPU memory', { unit: 'GiB, total', hint: 'Sum across GPUs if you shard the model.' }),
        numField('paramsB', 'Parameters', { unit: 'billions', step: 'any' }),
        selectField('weightPrecision', 'Weight precision', [['fp16', 'fp16 / bf16 (2 bytes)'], ['fp8', 'fp8 (1 byte)'], ['int4', 'int4 (0.5 byte)']]),
        rangeField('reservePct', 'Utilisation reserve', '%')),
      G.el('h4', { class: P + 'sub' }, 'Paging and prefix sharing'),
      G.el('div', { class: P + 'fields' },
        numField('actualTokens', 'Typical actual tokens', { unit: 'per sequence', hint: 'Prompt plus output so far, at most the context length.' }),
        rangeField('prefixPct', 'Shared prefix', '% of actual tokens')));

    tiles = G.el('dl', { class: P + 'tiles' });
    summary = G.el('p', { 'aria-live': 'polite', 'aria-atomic': 'true' });
    maxRow = G.el('div', { class: P + 'maxrow' });
    pageNote = G.el('p', { class: P + 'muted' });
    var stackBox = chartBox(renderStack), pagingBox = chartBox(renderPaging);

    var outputs = G.el('section', { class: P + 'card', 'aria-labelledby': uid + '-oh' },
      G.el('h3', { class: P + 'h', id: uid + '-oh' }, 'Live results'),
      summary,
      G.el('div', { style: { height: 'var(--sp-3)' } }),
      tiles,
      G.el('h4', { class: P + 'sub' }, 'GPU memory'),
      stackBox,
      G.el('ul', { class: P + 'legend', 'aria-label': 'Legend' },
        [['weights', 'Weights'], ['kv', 'KV cache (requested)'], ['reserve', 'Reserve'], ['free', 'Free']].map(function (l) {
          return G.el('li', null, G.el('span', { class: P + 'swatch ' + P + 'sw-' + l[0] }), l[1]);
        })),
      G.el('h4', { class: P + 'sub' }, 'Contiguous vs paged KV memory'),
      pagingBox,
      G.el('ul', { class: P + 'legend', 'aria-label': 'Legend' },
        G.el('li', null, G.el('span', { class: P + 'swatch ' + P + 'sw-kv' }), 'Tokens in use'),
        G.el('li', null, G.el('span', { class: P + 'swatch ' + P + 'sw-waste' }), 'Wasted'),
        G.el('li', null, 'Dashed outline: saved by sharing')),
      maxRow, pageNote,
      G.el('p', { class: P + 'caption' }, 'Paging: blocks of ' + BLOCK_TOKENS + ' tokens, as in PagedAttention (Kwon et al., 2023). Only the last block of each sequence can be partly empty; shared prefix blocks are stored once.'));

    formulaLive = G.el('p', { class: P + 'muted' });
    var formula = G.el('section', { class: P + 'card', 'aria-labelledby': uid + '-fh' },
      G.el('h3', { class: P + 'h', id: uid + '-fh' }, 'The formula'),
      G.el('code', { class: P + 'code' }, 'kv_bytes_per_token = 2 * layers * kv_heads * head_dim * bytes_per_element\nkv_total = kv_bytes_per_token * context_tokens * sequences'),
      G.el('p', { class: P + 'muted' }, 'The leading 2 counts one key vector and one value vector per head per layer.'),
      formulaLive,
      G.el('p', { class: P + 'caption' }, 'Source: standard transformer KV cache accounting. Fewer kv heads: multi-query attention (Shazeer, 2019) and grouped-query attention (Ainslie et al., 2023). Memory in GiB (2^30 bytes). Weights = parameters x bytes per weight.'));

    var notice = G.el('section', { class: P + 'card', 'aria-labelledby': uid + '-nh' },
      G.el('h3', { class: P + 'h', id: uid + '-nh' }, 'What to notice'),
      G.el('ul', { class: P + 'notice' }, experiments));

    var root = G.el('div', { class: P + 'root', dataset: { lab: 'kv-cache' } },
      G.el('p', { class: P + 'muted' }, 'Size the KV cache for a model shape, then see how GQA, quantization and paging change what fits on a GPU. All defaults are illustrative, not vendor benchmarks.'),
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

  window.Guide.labs.register('kv-cache', { mount: mount });
})();
