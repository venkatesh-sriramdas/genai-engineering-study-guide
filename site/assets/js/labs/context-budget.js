/* Context budget planner lab. Owner: E3b.
   Pure model first (testable in Node through tools/test-labs-b.mjs), UI after.
   All token counts and windows are illustrative inputs, not vendor figures. */
(function () {
  'use strict';
  var G = window.Guide;
  var ID = 'context-budget';
  var P = 'lab-context-budget-';

  /* ================= model ================= */
  var SEGS = [
    { id: 'system', label: 'System instructions', short: 'System', vol: 'stable', colour: '--brand-1' },
    { id: 'tools', label: 'Tool definitions', short: 'Tools', vol: 'stable', colour: '--info' },
    { id: 'memory', label: 'Memory', short: 'Memory', vol: 'stable', colour: '--preview' },
    { id: 'history', label: 'Conversation history', short: 'History', vol: 'append', colour: '--warn' },
    { id: 'retrieval', label: 'Retrieved chunks', short: 'Retrieval', vol: 'volatile', colour: '--ok' },
    { id: 'results', label: 'Tool results', short: 'Results', vol: 'volatile', colour: '--brand-2' },
    { id: 'output', label: 'Reserved output', short: 'Output', vol: 'none', colour: '--muted' }
  ];
  var VOL_NOTE = { stable: 'stable', append: 'grows at the end', volatile: 'changes every request', none: 'not part of the input' };
  function segById(id) { for (var i = 0; i < SEGS.length; i++) if (SEGS[i].id === id) return SEGS[i]; return null; }

  /* Order a prompt is assembled in. The naive order injects retrieval right after the instructions. */
  var NAIVE_ORDER = ['system', 'retrieval', 'memory', 'tools', 'history', 'results'];
  var FRIENDLY_ORDER = ['system', 'tools', 'memory', 'history', 'retrieval', 'results'];

  var STRATEGIES = [
    { id: 'toolSearch', label: 'Tool search (load fewer definitions)', applyOrder: 0,
      risk: 'The model must find the right tool through search, which adds a round trip and can miss similar tools. Names and descriptions need to be searchable.' },
    { id: 'reduceK', label: 'Reduce retrieved chunks (lower k)', applyOrder: 1,
      risk: 'Fewer chunks lowers recall: the supporting passage may fall outside the top k. Check retrieval metrics before lowering k.' },
    { id: 'trimResults', label: 'Trim tool results', applyOrder: 2,
      risk: 'Large tool outputs often hide one useful field. Blind truncation can cut the answer, so keep identifiers and error text and drop the bulk.' },
    { id: 'dropOldest', label: 'Drop oldest turns', applyOrder: 3,
      risk: 'Cheapest option, but the model forgets early instructions, decisions and preferences. Pin what must survive. Rewriting history also breaks the cached history prefix.' },
    { id: 'summarise', label: 'Summarise history', applyOrder: 4,
      risk: 'Summaries lose exact wording, numbers and rare constraints. It costs an extra model call, and rewritten history is a cache miss for that segment.' }
  ];
  function stratById(id) { for (var i = 0; i < STRATEGIES.length; i++) if (STRATEGIES[i].id === id) return STRATEGIES[i]; return null; }

  function num(x) { x = Number(x); return isFinite(x) && x > 0 ? x : 0; }
  function stateOf(p) {
    var turns = Math.round(num(p.turns)), tpt = num(p.turnTokens);
    return { toolCount: Math.round(num(p.toolCount)), k: Math.round(num(p.k)), resultTokens: num(p.resultTokens), turns: turns, historyTokens: turns * tpt };
  }
  function tokensOf(s, p) {
    return { system: num(p.system), tools: s.toolCount * num(p.toolTokens), memory: num(p.memory), history: Math.round(s.historyTokens),
             retrieval: s.k * num(p.chunkTokens), results: Math.round(s.resultTokens), output: num(p.outputReserve) };
  }
  function budgetOf(tokens, window) {
    var input = 0; SEGS.forEach(function (sg) { if (sg.id !== 'output') input += tokens[sg.id]; });
    var used = input + tokens.output;
    return { tokens: tokens, input: input, used: used, window: window, free: Math.max(0, window - used), overflow: Math.max(0, used - window), util: window > 0 ? used / window : 0 };
  }
  function budget(p) { return budgetOf(tokensOf(stateOf(p), p), num(p.window)); }

  function applyOne(id, s, p) {
    var n = { toolCount: s.toolCount, k: s.k, resultTokens: s.resultTokens, turns: s.turns, historyTokens: s.historyTokens };
    var tpt = num(p.turnTokens);
    if (id === 'toolSearch') n.toolCount = Math.min(s.toolCount, Math.round(num(p.toolsLoaded)) + 1);
    else if (id === 'reduceK') n.k = Math.min(s.k, Math.round(num(p.kNew)));
    else if (id === 'trimResults') n.resultTokens = s.resultTokens * (1 - num(p.trimPct) / 100);
    else if (id === 'dropOldest') {
      var keep = Math.min(s.turns, Math.round(num(p.dropKeep)));
      n.historyTokens = s.turns > 0 ? s.historyTokens * keep / s.turns : 0; n.turns = keep;
    } else if (id === 'summarise') {
      var keepR = Math.min(s.turns, Math.round(num(p.keepRecent))), old = s.turns - keepR;
      n.historyTokens = keepR * tpt + old * tpt * (num(p.summaryPct) / 100);
    }
    return n;
  }

  /* Tokens recovered by each strategy on its own, measured against the starting state. */
  function standalone(p) {
    var s0 = stateOf(p), b0 = budgetOf(tokensOf(s0, p), num(p.window)), out = {};
    STRATEGIES.forEach(function (st) {
      var b1 = budgetOf(tokensOf(applyOne(st.id, s0, p), p), num(p.window));
      out[st.id] = Math.round(b0.used - b1.used);
    });
    return out;
  }

  /* Apply the chosen strategies in a fixed order (tools, retrieval, results, drop, summarise). Overlaps are not double counted. */
  function compact(p, selected) {
    var s = stateOf(p), before = budgetOf(tokensOf(s, p), num(p.window)), prev = before.used, steps = [];
    STRATEGIES.slice().sort(function (a, b) { return a.applyOrder - b.applyOrder; }).forEach(function (st) {
      if (selected.indexOf(st.id) === -1) return;
      s = applyOne(st.id, s, p);
      var used = budgetOf(tokensOf(s, p), num(p.window)).used;
      steps.push({ id: st.id, recovered: Math.round(prev - used), usedAfter: Math.round(used) });
      prev = used;
    });
    var after = budgetOf(tokensOf(s, p), num(p.window));
    return { before: before, after: after, steps: steps, recovered: Math.round(before.used - after.used), fits: after.overflow === 0 };
  }

  /* Smallest greedy set (largest standalone saving first) that brings the window under budget, or null when nothing fits. */
  function suggest(p) {
    var b = budget(p);
    if (b.overflow === 0) return [];
    var sa = standalone(p), ranked = STRATEGIES.map(function (s) { return s.id; }).filter(function (id) { return sa[id] > 0; })
      .sort(function (a, c) { return sa[c] - sa[a]; });
    var chosen = [];
    for (var i = 0; i < ranked.length; i++) { chosen.push(ranked[i]); if (compact(p, chosen).fits) return chosen; }
    return null;
  }

  /* Longest identical prefix a provider could reuse. Stable segments count fully, history counts without its newest turn
     and ends the prefix, any non-empty volatile segment ends it. A prefix under the minimum cacheable length caches nothing. */
  function cacheStats(p, order, tokens) {
    var prefix = 0, ids = [], breaksAt = null;
    for (var i = 0; i < order.length; i++) {
      var id = order[i], t = tokens[id], v = segById(id).vol;
      if (t <= 0) continue;
      if (v === 'stable') { prefix += t; ids.push(id); continue; }
      if (v === 'append') { prefix += Math.max(0, t - num(p.turnTokens)); ids.push(id); breaksAt = id; break; }
      breaksAt = id; break;
    }
    var input = 0; order.forEach(function (id) { input += tokens[id]; });
    var cached = prefix >= num(p.minCache) ? prefix : 0, share = input > 0 ? cached / input : 0;
    return { prefixTokens: prefix, cached: cached, input: input, share: share, relCost: 1 - share * num(p.discount) / 100, breaksAt: breaksAt, ids: ids };
  }

  var DEFAULTS = { window: 128000, system: 1500, toolCount: 80, toolTokens: 500, memory: 2000, k: 6, chunkTokens: 800, turns: 40, turnTokens: 900, resultTokens: 42000, outputReserve: 8000,
                   keepRecent: 2, summaryPct: 20, dropKeep: 6, trimPct: 60, kNew: 3, toolsLoaded: 8, minCache: 1024, discount: 50 };
  var PRESETS = [
    { id: 'chat', label: 'Simple chat', note: 'No tools, a little retrieval and a short history. Plenty of headroom.',
      values: { window: 16000, system: 400, toolCount: 0, toolTokens: 300, memory: 200, k: 3, chunkTokens: 300, turns: 8, turnTokens: 250, resultTokens: 0, outputReserve: 1500 } },
    { id: 'agent', label: 'Tool-heavy agent', note: 'Many tool definitions, long history and big tool outputs push the request over the window.',
      values: { window: 128000, system: 1500, toolCount: 80, toolTokens: 500, memory: 2000, k: 6, chunkTokens: 800, turns: 40, turnTokens: 900, resultTokens: 42000, outputReserve: 8000 } },
    { id: 'research', label: 'Long-running research agent', note: 'Hours of work: a very long history, large retrieval and heavy tool output.',
      values: { window: 200000, system: 2000, toolCount: 20, toolTokens: 400, memory: 6000, k: 20, chunkTokens: 1000, turns: 120, turnTokens: 900, resultTokens: 60000, outputReserve: 16000 } }
  ];
  function presetById(id) { for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === id) return PRESETS[i]; return null; }

  var EXPERIMENTS = [
    { id: 'tools', title: 'Tool definitions are a fixed tax paid on every request',
      body: 'The tool-heavy agent spends 40,000 tokens, 31% of its window, on 80 tool definitions before the user says anything, and the request overflows by 6,300. Apply tool search and it loads 8 definitions plus the search tool, recovering 35,500 tokens.',
      buttons: [
        { label: 'Tool-heavy agent', set: { preset: 'agent', apply: [] } },
        { label: 'Apply tool search', set: { preset: 'agent', apply: ['toolSearch'] } }
      ] },
    { id: 'history', title: 'Summarise keeps a trace, dropping keeps nothing',
      body: 'The research agent overflows by 20,000 tokens because of 120 turns of history. Summarising keeps 2 recent turns and shrinks the rest to 20%. Dropping keeps only 6 turns and recovers more tokens but forgets everything older. Compare recovered tokens and the risk notes.',
      buttons: [
        { label: 'Research agent', set: { preset: 'research', apply: [] } },
        { label: 'Summarise history', set: { preset: 'research', apply: ['summarise'] } },
        { label: 'Drop oldest turns', set: { preset: 'research', apply: ['dropOldest'] } }
      ] },
    { id: 'cache', title: 'Order decides how much of the prompt can be cached',
      body: 'Providers reuse the longest identical prefix. With retrieval injected right after the instructions, only the 1,500-token system prompt is stable before the first changing segment. Put stable segments first and about 62% of input tokens can be a cache hit. The saving shown assumes the discount you set.',
      buttons: [
        { label: 'Naive order', set: { preset: 'agent', apply: [], friendly: false } },
        { label: 'Cache-friendly order', set: { preset: 'agent', apply: [], friendly: true } }
      ] }
  ];

  var model = {
    SEGS: SEGS, STRATEGIES: STRATEGIES, NAIVE_ORDER: NAIVE_ORDER, FRIENDLY_ORDER: FRIENDLY_ORDER, DEFAULTS: DEFAULTS,
    stateOf: stateOf, tokensOf: tokensOf, budget: budget, standalone: standalone, compact: compact, suggest: suggest, cacheStats: cacheStats
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
    '.P-group{border:0;margin:0 0 var(--sp-3);padding:0}',
    '.P-group legend{padding:0;margin:0 0 var(--sp-2);font-weight:700;color:var(--text);font-size:var(--fs-sm)}',
    '.P-note{padding:var(--sp-3);background:var(--surface-2);border-radius:var(--r-sm);margin:var(--sp-3) 0 0}',
    '.P-status{display:flex;flex-wrap:wrap;gap:var(--sp-2) var(--sp-4);align-items:center;padding:var(--sp-3);border-radius:var(--r-sm);background:var(--ok-soft);border-left:4px solid var(--ok);margin-bottom:var(--sp-3)}',
    '.P-status.over{background:var(--bad-soft);border-color:var(--bad)}',
    '.P-status.tight{background:var(--warn-soft);border-color:var(--warn)}',
    '.P-status b{font-size:var(--fs-lg)}',
    '.P-svg{width:100%;height:auto;display:block}',
    '.P-legend{list-style:none;margin:var(--sp-3) 0 0;padding:0;display:grid;gap:var(--sp-1) var(--sp-4);grid-template-columns:repeat(auto-fit,minmax(min(100%,15rem),1fr))}',
    '.P-legend li{display:flex;gap:var(--sp-2);align-items:baseline}',
    '.P-swatch{display:inline-block;width:.8rem;height:.8rem;border-radius:3px;flex:none;align-self:center}',
    '.P-legend .P-n{margin-left:auto;font-family:var(--font-mono);color:var(--text-2);white-space:nowrap}',
    '.P-tablewrap{overflow-x:auto}',
    '.P-table{width:100%;border-collapse:collapse;font-size:var(--fs-xs)}',
    '.P-table th{text-align:left;color:var(--muted);font-weight:600;padding:var(--sp-1) var(--sp-2);border-bottom:1px solid var(--border-strong);white-space:nowrap}',
    '.P-table td{padding:var(--sp-2);border-bottom:1px solid var(--border);vertical-align:top}',
    '.P-table tr:last-child td{border-bottom:0}',
    '.P-num{font-family:var(--font-mono);white-space:nowrap}',
    '.P-checks{display:flex;gap:var(--sp-2);align-items:center;cursor:pointer;font-weight:600;color:var(--text-2)}',
    '.P-checks input{accent-color:var(--accent);width:1rem;height:1rem;flex:none}',
    '.P-chip{display:inline-block;font-size:var(--fs-xs);font-weight:600;padding:0 7px;border-radius:var(--r-pill);border:1px solid var(--border-strong);white-space:nowrap}',
    '.P-chip.ok{color:var(--ok);background:var(--ok-soft);border-color:var(--ok)}',
    '.P-chip.bad{color:var(--bad);background:var(--bad-soft);border-color:var(--bad)}',
    '.P-chip.warn{color:var(--warn);background:var(--warn-soft);border-color:var(--warn)}',
    '.P-order{display:flex;flex-wrap:wrap;gap:var(--sp-1);margin:var(--sp-1) 0}',
    '.P-order span{display:inline-flex;gap:var(--sp-1);align-items:center;padding:1px 8px;border-radius:var(--r-pill);border:1px solid var(--border-strong);font-size:var(--fs-xs);background:var(--surface)}',
    '.P-order span.cut{border-color:var(--bad);color:var(--bad)}',
    '.P-order span.hit{border-color:var(--ok);color:var(--ok)}',
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
  function fmt(n) { return Math.round(n).toLocaleString('en-US'); }
  function pc(x, d) { return (x * 100).toFixed(d == null ? 0 : d) + '%'; }

  function mount(container, api) {
    injectStyle();
    var h = G.el, uid = G.uid('ctx');
    var saved = api.load() || {};
    var startPreset = presetById(saved.preset) || PRESETS[1];
    var state = { preset: startPreset.id, p: Object.assign({}, DEFAULTS, startPreset.values, saved.p || {}),
                  apply: Array.isArray(saved.apply) ? saved.apply.filter(stratById) : [], friendly: !!saved.friendly };
    var timer = null, fields = {}, applyBoxes = {};

    function persist() { api.save({ preset: state.preset, p: state.p, apply: state.apply, friendly: state.friendly }); }

    function field(key, label, min, max, step, opts) {
      opts = opts || {};
      var id = G.uid(P + 'f'), log = !!opts.log;
      var range = h('input', { type: 'range', id: id, min: log ? Math.log10(min) : min, max: log ? Math.log10(max) : max, step: log ? 0.01 : step });
      var number = h('input', { type: 'number', class: P + 'input', min: min, max: max, step: step, 'aria-label': label + ' value' });
      function sync() { var v = state.p[key]; range.value = log ? Math.log10(Math.max(v, min)) : v; number.value = v; }
      function set(v) {
        v = G.clamp(v, min, max);
        v = log ? Math.round(v / 100) * 100 : Math.round(v / step) * step;
        state.p[key] = Number(v.toPrecision(8)); sync(); changed();
      }
      range.addEventListener('input', function () { var v = Number(range.value); set(log ? Math.pow(10, v) : v); });
      number.addEventListener('change', function () { var v = Number(number.value); if (isFinite(v)) set(v); else sync(); });
      fields[key] = { sync: sync };
      return h('div', { class: P + 'field' }, h('label', { for: id }, label), h('div', { class: P + 'fieldrow' }, range, number));
    }

    var presetBtns = {}, presetRow = h('div', { class: P + 'row', role: 'group', 'aria-label': 'Workload preset' });
    PRESETS.forEach(function (pr) {
      var b = h('button', { type: 'button', class: P + 'btn', 'aria-pressed': 'false', on: { click: function () { applySet({ preset: pr.id, apply: [] }); } } }, pr.label);
      presetBtns[pr.id] = b; presetRow.appendChild(b);
    });
    var presetNote = h('p', { class: P + 'note' });

    var controls = h('section', { class: P + 'card', 'aria-labelledby': uid + '-h1' },
      h('h3', { id: uid + '-h1' }, 'Window and segments (tokens)'),
      presetRow, presetNote,
      h('div', { class: P + 'cols' },
      h('fieldset', { class: P + 'group' }, h('legend', null, 'Window'),
        field('window', 'Context window', 4000, 2000000, 1000, { log: true }),
        field('outputReserve', 'Reserved output', 0, 128000, 500)),
      h('fieldset', { class: P + 'group' }, h('legend', null, 'Instructions, tools and memory'),
        field('system', 'System instructions', 0, 30000, 100),
        field('toolCount', 'Number of tools', 0, 300, 1),
        field('toolTokens', 'Tokens per tool definition', 50, 2500, 10),
        field('memory', 'Memory', 0, 40000, 100)),
      h('fieldset', { class: P + 'group' }, h('legend', null, 'Retrieval, history and tool output'),
        field('k', 'Retrieved chunks (k)', 0, 60, 1),
        field('chunkTokens', 'Tokens per chunk', 50, 3000, 10),
        field('turns', 'History turns', 0, 400, 1),
        field('turnTokens', 'Tokens per turn', 50, 4000, 10),
        field('resultTokens', 'Tool results', 0, 200000, 500)),
      h('fieldset', { class: P + 'group' }, h('legend', null, 'Compaction settings'),
        field('toolsLoaded', 'Tool search: definitions loaded', 1, 60, 1),
        field('kNew', 'Reduce k to', 0, 60, 1),
        field('trimPct', 'Trim tool results by (%)', 5, 95, 5),
        field('dropKeep', 'Drop oldest: turns kept', 0, 100, 1),
        field('keepRecent', 'Summarise: recent turns kept verbatim', 0, 30, 1),
        field('summaryPct', 'Summarise: summary size (% of old turns)', 5, 80, 5)),
      h('fieldset', { class: P + 'group' }, h('legend', null, 'Caching assumptions (illustrative)'),
        field('minCache', 'Minimum cacheable prefix (tokens)', 0, 4096, 128),
        field('discount', 'Cached-read discount (%)', 0, 95, 5))));

    /* outputs */
    var statusBox = h('div', { 'aria-live': 'polite' });
    var barBox = h('div');
    var legendBox = h('ul', { class: P + 'legend' });
    var afterBox = h('div');
    var compactBox = h('div', { class: P + 'tablewrap' });
    var appliedBox = h('div', { 'aria-live': 'polite' });
    var suggestBtn = h('button', { type: 'button', class: P + 'btn', on: { click: function () {
      var s = suggest(state.p);
      if (s && s.length) state.apply = s;
      render(); } } }, 'Suggest the smallest set that fits');
    var friendlyCb = h('input', { type: 'checkbox', on: { change: function () { state.friendly = friendlyCb.checked; render(); } } });
    var cacheBox = h('div', { class: P + 'tablewrap' });

    var outputs = h('section', { class: P + 'card', 'aria-labelledby': uid + '-h2' },
      h('h3', { id: uid + '-h2' }, 'Where the window goes'),
      statusBox,
      h('label', { class: P + 'checks', style: { marginBottom: 'var(--sp-2)' } }, friendlyCb, 'Cache-friendly ordering (stable segments first)'),
      barBox, legendBox, afterBox,
      h('h4', { style: { margin: 'var(--sp-5) 0 var(--sp-2)', fontSize: 'var(--fs-md)' } }, 'Compaction'),
      h('div', { class: P + 'row', style: { marginBottom: 'var(--sp-2)' } }, suggestBtn),
      compactBox, appliedBox,
      h('h4', { style: { margin: 'var(--sp-5) 0 var(--sp-2)', fontSize: 'var(--fs-md)' } }, 'Prompt-cache effect of ordering'),
      cacheBox,
      h('p', { class: P + 'caption' }, 'In the order chips, green means inside the cacheable prefix, \u2702 means the prefix ends inside that segment (history keeps all but its newest turn), and \u2715 means the prefix ends before it.'),
      h('p', { class: P + 'caption' }, 'Illustrative planner, not a tokenizer. Segment sizes, windows and the cached-read discount are inputs you control; use your provider\'s tokenizer and pricing for real numbers. Utilisation = (input segments + reserved output) / window. Strategies are applied in this order when combined: tool search, lower k, trim results, drop oldest, summarise; savings that overlap are not double counted. Cacheable prefix = leading stable segments, plus history without its newest turn, stopping at the first segment that changes every request; below the minimum prefix nothing is cached. Cost factor = 1 - cached share x discount.'));

    var notice = h('section', { class: P + 'card', 'aria-labelledby': uid + '-h3' },
      h('h3', { id: uid + '-h3' }, 'What to notice'),
      h('ol', { class: P + 'notice' }, EXPERIMENTS.map(function (ex) {
        return h('li', null, h('h4', null, ex.title), h('p', null, ex.body),
          h('div', { class: P + 'row' }, ex.buttons.map(function (bt) {
            return h('button', { type: 'button', class: P + 'btn', on: { click: function () { applySet(bt.set); } } }, bt.label);
          })));
      })));

    container.appendChild(h('div', { class: P + 'root', 'data-lab': ID }, controls, outputs, notice));

    function applySet(set) {
      if (set.preset) { var pr = presetById(set.preset); state.preset = pr.id; state.p = Object.assign({}, DEFAULTS, pr.values); }
      if (set.apply) state.apply = set.apply.slice();
      if (set.friendly != null) state.friendly = set.friendly;
      else if (set.preset) state.friendly = false;
      Object.keys(fields).forEach(function (k) { fields[k].sync(); });
      render();
    }
    function changed() { clearTimeout(timer); timer = setTimeout(render, 60); }

    function stackedBar(b, order, label, windowTok, showWindowLine) {
      var segs = order.map(function (id) { return { id: id, t: b.tokens[id] }; }).concat([{ id: 'output', t: b.tokens.output }]).filter(function (s) { return s.t > 0; });
      var total = Math.max(b.used, windowTok), W = 600, H = 78, x0 = 4, span = W - 8, y = 20, bh = 34;
      var svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, class: P + 'svg', role: 'img',
        'aria-label': label + ': ' + segs.map(function (s) { return segById(s.id).label + ' ' + fmt(s.t) + ' tokens'; }).join(', ') + '. Window ' + fmt(windowTok) + ' tokens, ' + pc(b.util) + ' used' + (b.overflow ? ', over by ' + fmt(b.overflow) : '') + '.' });
      svg.appendChild(sv('rect', { x: x0, y: y, width: span * windowTok / total, height: bh, rx: 4 }, { fill: 'var(--surface-3)' }));
      var x = x0, cut = x0 + span * windowTok / total;
      segs.forEach(function (s, i) {
        var w = span * s.t / total, over = x + w > cut + 0.5;
        var r = sv('rect', { x: x, y: y, width: Math.max(0.5, w - (w > 3 ? 1 : 0)), height: bh }, { fill: 'var(' + segById(s.id).colour + ')', opacity: s.id === 'output' ? '0.55' : '1' });
        var t = sv('title'); t.textContent = segById(s.id).label + ': ' + fmt(s.t) + ' tokens (' + pc(s.t / windowTok, 1) + ' of window)'; r.appendChild(t);
        svg.appendChild(r);
        if (over) {
          var ox = Math.max(x, cut), ow = x + w - ox;
          svg.appendChild(sv('rect', { x: ox, y: y, width: ow, height: bh }, { fill: 'var(--bad)', opacity: '0.9' }));
        }
        x += w;
      });
      if (showWindowLine) {
        svg.appendChild(sv('line', { x1: cut, x2: cut, y1: y - 6, y2: y + bh + 6, 'stroke-width': 2.5 }, { stroke: 'var(--text)' }));
        var tx = sv('text', { x: Math.min(cut, W - 6), y: y - 8, 'font-size': 11, 'text-anchor': cut > W - 90 ? 'end' : 'middle' }, { fill: 'var(--text)', fontWeight: '600' }); tx.textContent = 'window ' + fmt(windowTok); svg.appendChild(tx);
      }
      var ut = sv('text', { x: x0, y: H - 6, 'font-size': 11 }, { fill: 'var(--text-2)' }); ut.textContent = label + ': ' + fmt(b.used) + ' of ' + fmt(windowTok) + ' tokens (' + pc(b.util) + ')'; svg.appendChild(ut);
      return svg;
    }

    function render() {
      var p = state.p;
      if (p.kNew > p.k) { p.kNew = p.k; fields.kNew.sync(); }
      Object.keys(presetBtns).forEach(function (id) { presetBtns[id].setAttribute('aria-pressed', String(id === state.preset)); });
      var pr = presetById(state.preset);
      presetNote.textContent = (pr ? pr.note : '') + ' Illustrative numbers; edit any field.';
      friendlyCb.checked = state.friendly;

      var b = budget(p), order = state.friendly ? FRIENDLY_ORDER : NAIVE_ORDER;
      var cls = P + 'status' + (b.overflow ? ' over' : b.util > 0.85 ? ' tight' : '');
      G.clear(statusBox);
      statusBox.appendChild(h('div', { class: cls, role: b.overflow ? 'alert' : 'status' },
        h('b', null, pc(b.util) + ' used'),
        b.overflow ? h('span', null, 'Overflow: ' + fmt(b.overflow) + ' tokens over the window. The request will be rejected or truncated, compact before sending.')
          : h('span', null, fmt(b.free) + ' tokens free' + (b.util > 0.85 ? '. Tight: long answers or one more tool result may not fit.' : '.')),
        h('span', { class: P + 'muted' }, 'Input ' + fmt(b.input) + ' + reserved output ' + fmt(b.tokens.output))));

      G.clear(barBox); barBox.appendChild(stackedBar(b, order, 'Before compaction', p.window, true));
      G.clear(legendBox);
      order.concat(['output']).forEach(function (id) {
        var sg = segById(id), t = b.tokens[id];
        legendBox.appendChild(h('li', null, h('span', { class: P + 'swatch', style: { background: 'var(' + sg.colour + ')' }, 'aria-hidden': 'true' }), h('span', null, sg.label),
          h('span', { class: P + 'n' }, fmt(t) + ' (' + pc(t / p.window, 1) + ')')));
      });

      /* compaction table */
      var sa = standalone(p), res = compact(p, state.apply);
      var stepMap = {}; res.steps.forEach(function (s) { stepMap[s.id] = s; });
      var tb = h('tbody');
      STRATEGIES.forEach(function (st) {
        var id = G.uid(P + 'c'), box = h('input', { type: 'checkbox', id: id, on: { change: function () {
          state.apply = STRATEGIES.map(function (x) { return x.id; }).filter(function (x) { return x === st.id ? box.checked : state.apply.indexOf(x) !== -1; });
          render(); } } });
        box.checked = state.apply.indexOf(st.id) !== -1;
        tb.appendChild(h('tr', null,
          h('td', null, h('label', { class: P + 'checks', for: id, style: { fontWeight: '600' } }, box, st.label)),
          h('td', { class: P + 'num' }, '\u2212' + fmt(sa[st.id])),
          h('td', { class: P + 'num' }, stepMap[st.id] ? '\u2212' + fmt(stepMap[st.id].recovered) : 'n/a'),
          h('td', null, st.risk)));
      });
      G.clear(compactBox);
      compactBox.appendChild(h('table', { class: P + 'table' },
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Apply'), h('th', { scope: 'col' }, 'Alone'), h('th', { scope: 'col' }, 'In combination'), h('th', { scope: 'col' }, 'Risk'))), tb));

      G.clear(afterBox);
      if (state.apply.length) {
        var oa = state.friendly ? FRIENDLY_ORDER : NAIVE_ORDER;
        afterBox.appendChild(h('div', { style: { marginTop: 'var(--sp-3)' } }, stackedBar(res.after, oa, 'After compaction', p.window, true)));
      }
      G.clear(appliedBox);
      if (state.apply.length) {
        appliedBox.appendChild(h('div', { class: P + 'status' + (res.fits ? '' : ' over'), style: { marginTop: 'var(--sp-3)' }, role: 'status' },
          h('b', null, 'Recovered ' + fmt(res.recovered) + ' tokens'),
          h('span', null, 'New utilisation ' + pc(res.after.util) + '. ' + (res.fits ? 'The request fits.' : 'Still over by ' + fmt(res.after.overflow) + ' tokens. Add another strategy or shrink a segment.'))));
      } else if (b.overflow) {
        appliedBox.appendChild(h('p', { class: P + 'caption' }, 'Tick one or more strategies, or use the suggestion button, to see tokens recovered.'));
      }

      /* cache panel */
      var naive = cacheStats(p, NAIVE_ORDER, b.tokens), friendly = cacheStats(p, FRIENDLY_ORDER, b.tokens);
      function orderCell(ord, cs) {
        var wrap = h('div', { class: P + 'order' });
        ord.forEach(function (id) {
          var t = b.tokens[id]; if (t <= 0) return;
          var inPrefix = cs.ids.indexOf(id) !== -1, isCut = cs.breaksAt === id;
          wrap.appendChild(h('span', { class: (cs.cached && inPrefix ? 'hit' : '') + (isCut && !inPrefix ? ' cut' : '') , title: VOL_NOTE[segById(id).vol] },
            h('span', { class: P + 'swatch', style: { background: 'var(' + segById(id).colour + ')' }, 'aria-hidden': 'true' }), segById(id).short, isCut ? (inPrefix ? ' \u2702' : ' \u2715') : ''));
        });
        return wrap;
      }
      function row(label, ord, cs, active) {
        return h('tr', null,
          h('td', null, h('b', null, label), active ? h('div', null, h('span', { class: P + 'chip ok' }, 'shown above')) : null, orderCell(ord, cs)),
          h('td', { class: P + 'num' }, fmt(cs.cached) + (cs.prefixTokens > cs.cached ? ' (prefix ' + fmt(cs.prefixTokens) + ' is under the minimum)' : '')),
          h('td', { class: P + 'num' }, pc(cs.share)),
          h('td', { class: P + 'num' }, cs.relCost.toFixed(2) + 'x'),
          h('td', null, cs.breaksAt ? 'Prefix ends at ' + segById(cs.breaksAt).label.toLowerCase() + ' (' + VOL_NOTE[segById(cs.breaksAt).vol] + ').' : 'Whole input is a stable prefix.'));
      }
      G.clear(cacheBox);
      cacheBox.appendChild(h('table', { class: P + 'table' },
        h('thead', null, h('tr', null, ['Order', 'Cacheable tokens', 'Share of input', 'Input cost factor', 'Why'].map(function (c) { return h('th', { scope: 'col' }, c); }))),
        h('tbody', null, row('Naive: retrieval right after instructions', NAIVE_ORDER, naive, !state.friendly), row('Cache-friendly: stable first, volatile last', FRIENDLY_ORDER, friendly, state.friendly))));
      persist();
    }

    Object.keys(fields).forEach(function (k) { fields[k].sync(); });
    render();
    return { destroy: function () { clearTimeout(timer); G.clear(container); } };
  }

  G.labs.register(ID, { mount: mount, model: model, presets: PRESETS, experiments: EXPERIMENTS });
})();
