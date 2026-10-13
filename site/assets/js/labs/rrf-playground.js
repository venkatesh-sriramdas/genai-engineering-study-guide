/* RRF fusion playground lab. Owner: E3b.
   Pure model first (testable in Node through tools/test-labs-b.mjs), UI after. */
(function () {
  'use strict';
  var G = window.Guide;
  var ID = 'rrf-playground';
  var P = 'lab-rrf-playground-';

  /* ================= model ================= */
  function naturalCmp(a, b) {
    var na = parseInt(String(a).replace(/\D+/g, ''), 10), nb = parseInt(String(b).replace(/\D+/g, ''), 10);
    if (isFinite(na) && isFinite(nb) && na !== nb) return na - nb;
    return a < b ? -1 : a > b ? 1 : 0;
  }
  function cmpFused(a, b) {
    if (Math.abs(a.score - b.score) > 1e-12) return b.score - a.score;
    if (a.nLists !== b.nLists) return b.nLists - a.nLists;
    if (a.bestRank !== b.bestRank) return a.bestRank - b.bestRank;
    return naturalCmp(a.id, b.id);
  }
  function wOf(weights, i) { return weights && weights[i] != null ? weights[i] : 1; }

  /* RRF(d) = sum over lists of weight / (k + rank). Ranks start at 1. lists: array of arrays of ids, best first. */
  function rrf(lists, k, weights) {
    var map = {}, order = [];
    lists.forEach(function (list, li) {
      var w = wOf(weights, li), seen = {};
      list.forEach(function (id, i) {
        if (seen[id]) return; seen[id] = 1;
        var rank = i + 1, c = w / (k + rank);
        if (!map[id]) { map[id] = { id: id, score: 0, contribs: [], nLists: 0, bestRank: Infinity }; order.push(id); }
        var d = map[id]; d.score += c; d.contribs.push({ list: li, rank: rank, contribution: c }); d.nLists++; d.bestRank = Math.min(d.bestRank, rank);
      });
    });
    var out = order.map(function (id) { return map[id]; }).sort(cmpFused);
    out.forEach(function (d, i) { d.rank = i + 1; });
    return out;
  }

  /* Naive score fusion: min-max normalise each list's raw scores to [0,1], then weighted sum. A missing document adds 0.
     lists: arrays of ids. scores: parallel arrays of raw scores (score at index i belongs to the doc at rank i + 1). */
  function minMaxFuse(lists, scores, weights) {
    var map = {}, order = [], norms = [];
    lists.forEach(function (list, li) {
      var sc = list.map(function (_, i) { return scores[li][i]; });
      var lo = Math.min.apply(null, sc), hi = Math.max.apply(null, sc), range = hi - lo, w = wOf(weights, li), seen = {};
      norms.push({ min: lo, max: hi });
      list.forEach(function (id, i) {
        if (seen[id]) return; seen[id] = 1;
        var norm = range > 0 ? (sc[i] - lo) / range : 1, c = w * norm;
        if (!map[id]) { map[id] = { id: id, score: 0, contribs: [], nLists: 0, bestRank: Infinity }; order.push(id); }
        var d = map[id]; d.score += c; d.contribs.push({ list: li, rank: i + 1, raw: sc[i], norm: norm, contribution: c }); d.nLists++; d.bestRank = Math.min(d.bestRank, i + 1);
      });
    });
    var out = order.map(function (id) { return map[id]; }).sort(cmpFused);
    out.forEach(function (d, i) { d.rank = i + 1; });
    out.norms = norms;
    return out;
  }

  /* Each list can contribute at most weight / (k + 1) to a fused score. */
  function maxScore(k, weights, nLists) {
    var t = 0; for (var i = 0; i < nLists; i++) t += wOf(weights, i) / (k + 1); return t;
  }
  function rankMap(fused) { var m = {}; fused.forEach(function (d) { m[d.id] = d.rank; }); return m; }
  function topOverlap(a, b, n) {
    var sa = {}; a.slice(0, n).forEach(function (d) { sa[d.id] = 1; });
    return b.slice(0, n).filter(function (d) { return sa[d.id]; }).length;
  }
  function moveItem(arr, from, to) {
    var a = arr.slice();
    if (from < 0 || from >= a.length) return a;
    to = Math.max(0, Math.min(a.length - 1, to));
    var it = a.splice(from, 1)[0]; a.splice(to, 0, it); return a;
  }
  /* Keep a slot score array monotone non-increasing and padded to n slots (each extra slot decays 8 percent). */
  function normaliseScores(sc, n) {
    var a = sc.map(Number).filter(function (x) { return isFinite(x); }).sort(function (x, y) { return y - x; });
    if (!a.length) a = [1];
    while (a.length < n) a.push(Math.round(a[a.length - 1] * 0.92 * 1000) / 1000);
    return a.slice(0, Math.max(n, sc.length));
  }

  var model = { rrf: rrf, minMaxFuse: minMaxFuse, maxScore: maxScore, rankMap: rankMap, topOverlap: topOverlap, moveItem: moveItem, normaliseScores: normaliseScores, naturalCmp: naturalCmp };

  /* ================= data ================= */
  var LIST_META = [
    { id: 'kw', name: 'Keyword (BM25-style)', short: 'KW', colour: '--info', unit: 'BM25-style score, unbounded' },
    { id: 'vec', name: 'Vector (cosine)', short: 'VEC', colour: '--ok', unit: 'cosine similarity' },
    { id: 'rr', name: 'Reranker output', short: 'RR', colour: '--preview', unit: 'reranker relevance 0 to 1' }
  ];
  var DOCS = {
    D1: 'Runbook: ERR_4021 gateway timeout', D2: 'Error code catalog ERR_4000 to ERR_4099', D3: 'Postmortem: ERR_4021 traffic spike',
    D4: 'Retry and backoff policy for the gateway', D5: 'Troubleshooting slow upstream responses', D6: 'Gateway configuration reference',
    D7: 'Release notes: ERR_4017 fixed in 5.2', D8: 'Autoscaling and capacity planning', D9: 'Client and server timeout settings',
    D10: 'Backpressure and queue limits', D11: 'On-call onboarding guide', D12: 'Latency dashboards and alerts',
    D13: 'Glossary of platform terms', D14: 'Circuit breaker pattern notes'
  };
  var PRESETS = [
    { id: 'exact', label: 'Exact identifier', query: 'ERR_4021',
      note: 'Keyword search finds the identifier, vector search finds topical neighbours and buries it. BM25 scores are unbounded, here one document scores 48.0.',
      lists: [['D1', 'D3', 'D2', 'D7', 'D6', 'D9', 'D4', 'D5', 'D12'], ['D9', 'D5', 'D4', 'D1', 'D12', 'D8', 'D6', 'D14', 'D10', 'D3'], ['D1', 'D3', 'D2', 'D4', 'D9', 'D6', 'D7', 'D5']],
      scores: [[48.0, 9.8, 9.1, 4.4, 2.3, 1.9, 1.5, 1.2, 1.0], [0.84, 0.83, 0.82, 0.81, 0.80, 0.78, 0.77, 0.75, 0.74, 0.72], [0.97, 0.81, 0.62, 0.41, 0.33, 0.21, 0.18, 0.12]] },
    { id: 'concept', label: 'Conceptual paraphrase', query: 'why does my service stall when traffic spikes',
      note: 'No shared vocabulary with the best pages, so keyword scores are low, flat and led by noise (D11, D13) while vector similarity separates well.',
      lists: [['D11', 'D13', 'D5', 'D9', 'D12', 'D6', 'D4', 'D3'], ['D10', 'D8', 'D14', 'D4', 'D5', 'D9', 'D12', 'D6', 'D3'], ['D10', 'D8', 'D14', 'D4', 'D5', 'D12', 'D9', 'D6']],
      scores: [[6.4, 6.1, 5.9, 5.6, 5.4, 5.2, 5.0, 4.8], [0.88, 0.86, 0.83, 0.81, 0.80, 0.77, 0.73, 0.70, 0.69], [0.93, 0.90, 0.71, 0.55, 0.48, 0.20, 0.15, 0.10]] },
    { id: 'mixed', label: 'Mixed query', query: 'ERR_4021 retry backoff guidance',
      note: 'An identifier plus a concept. The keyword list favours the runbook, the vector list favours a retry page, and D10 appears only in the vector list.',
      lists: [['D1', 'D3', 'D2', 'D4', 'D7', 'D6', 'D9', 'D14'], ['D10', 'D14', 'D4', 'D1', 'D9', 'D5', 'D8', 'D6', 'D3'], ['D4', 'D1', 'D14', 'D3', 'D10', 'D9', 'D6', 'D5']],
      scores: [[31.0, 18.2, 14.6, 8.3, 5.1, 3.9, 2.2, 1.8], [0.87, 0.85, 0.83, 0.80, 0.79, 0.77, 0.75, 0.72, 0.70], [0.95, 0.90, 0.66, 0.52, 0.30, 0.22, 0.14, 0.10]] }
  ];
  function presetById(id) { for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === id) return PRESETS[i]; return PRESETS[0]; }
  var MAX_LIST = 10;

  var EXPERIMENTS = [
    { id: 'k', title: 'Small k rewards the top spot, large k rewards agreement',
      body: 'On the mixed query, D10 appears only in the vector list, at rank 1. With k = 1 it takes 2nd place, because a first place is worth 1/2. At k = 60 or 200 it falls to 7th, below every document that both lists found. Small k trusts top ranks, large k trusts agreement.',
      buttons: [
        { label: 'k = 1', set: { preset: 'mixed', k: 1 } },
        { label: 'k = 60 (default)', set: { preset: 'mixed', k: 60 } },
        { label: 'k = 200', set: { preset: 'mixed', k: 200 } }
      ] },
    { id: 'scale', title: 'Raw scores do not share a scale',
      body: 'On the exact identifier query one keyword score is an outlier (48.0). Min-max squeezes the rest of the keyword list toward 0, so the vector list decides the order and D3, an ID page, lands 9th. RRF uses ranks only and puts D3 5th.',
      buttons: [{ label: 'Load exact identifier', set: { preset: 'exact', k: 60 } }] },
    { id: 'weights', title: 'Weights express trust, rerankers add a third voice',
      body: 'On the conceptual query the keyword list is led by noise (D11, D13). With equal weights D11 ties the best vector hit for 7th place. Cut the keyword weight to 0.3 and D11 and D13 drop to the bottom. Then add the reranker list as a third voice and watch D10 and D8 climb.',
      buttons: [
        { label: 'Equal weights', set: { preset: 'concept', k: 60, weights: [1, 1, 1], rerank: false } },
        { label: 'Keyword weight 0.3', set: { preset: 'concept', k: 60, weights: [0.3, 1, 1], rerank: false } },
        { label: 'Add reranker list', set: { preset: 'concept', k: 60, weights: [0.3, 1, 1], rerank: true } }
      ] }
  ];

  /* ================= UI ================= */
  var CSS = [
    '.P-root{display:grid;gap:var(--sp-4);color:var(--text);font-family:var(--font-sans);font-size:var(--fs-sm);line-height:1.5;min-width:0}',
    '.P-root *{box-sizing:border-box}',
    '.P-root [hidden]{display:none!important}',
    '.P-params{display:grid;gap:0 var(--sp-5);grid-template-columns:repeat(auto-fit,minmax(min(100%,14rem),1fr))}',
    '.P-card{background:var(--surface);border:1px solid var(--border);border-left:4px solid var(--accent);border-radius:var(--r-md);box-shadow:var(--shadow-1);padding:var(--sp-4);min-width:0}',
    '.P-card>h3,.P-card>h4{margin:0 0 var(--sp-3);font-size:var(--fs-md);line-height:var(--lh-tight);color:var(--text)}',
    '.P-grid{display:grid;gap:var(--sp-4);grid-template-columns:repeat(auto-fit,minmax(min(100%,19rem),1fr));align-items:start}',
    '.P-row{display:flex;flex-wrap:wrap;gap:var(--sp-2);align-items:center}',
    '.P-muted{color:var(--muted)}',
    '.P-caption{color:var(--muted);font-size:var(--fs-xs);margin:var(--sp-3) 0 0}',
    '.P-formula{font:var(--fs-md)/1.4 var(--font-mono);padding:var(--sp-3);background:var(--code-bg);border-radius:var(--r-sm);margin:0 0 var(--sp-3);overflow-x:auto}',
    '.P-btn{font:inherit;color:var(--text);background:var(--surface-2);border:1px solid var(--border-strong);border-radius:var(--r-pill);padding:var(--sp-1) var(--sp-3);cursor:pointer;transition:background var(--dur) var(--ease),transform var(--dur) var(--ease)}',
    '.P-btn:hover{background:var(--surface-3)}',
    '.P-btn:active{transform:translateY(1px)}',
    '.P-btn[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}',
    '.P-icon{font:inherit;line-height:1;width:1.9rem;height:1.9rem;display:inline-flex;align-items:center;justify-content:center;color:var(--text);background:var(--surface);border:1px solid var(--border-strong);border-radius:var(--r-sm);cursor:pointer;padding:0}',
    '.P-icon:hover:not(:disabled){background:var(--surface-3)}',
    '.P-icon:active:not(:disabled){transform:translateY(1px)}',
    '.P-icon:disabled{opacity:.4;cursor:not-allowed}',
    '.P-input{font:inherit;color:var(--text);background:var(--surface);border:1px solid var(--border-strong);border-radius:var(--r-sm);padding:var(--sp-1) var(--sp-2);min-width:0;max-width:100%}',
    '.P-input:hover{border-color:var(--accent)}',
    '.P-field{display:grid;gap:var(--sp-1);margin-bottom:var(--sp-3)}',
    '.P-field label{font-weight:600;color:var(--text-2)}',
    '.P-fieldrow{display:flex;gap:var(--sp-3);align-items:center}',
    '.P-fieldrow input[type=range]{flex:1;min-width:0;accent-color:var(--accent)}',
    '.P-fieldrow input[type=number]{width:5rem}',
    '.P-checks{display:flex;gap:var(--sp-2);align-items:center;cursor:pointer;font-weight:600;color:var(--text-2)}',
    '.P-checks input{accent-color:var(--accent);width:1rem;height:1rem}',
    '.P-query{padding:var(--sp-3);background:var(--surface-2);border-radius:var(--r-sm);margin:var(--sp-3) 0 0}',
    '.P-query code{font:var(--fs-sm) var(--font-mono);color:var(--text)}',
    '.P-list{list-style:none;margin:0;padding:0;display:grid;gap:var(--sp-1)}',
    '.P-item{display:grid;grid-template-columns:1.6rem minmax(0,1fr) auto;gap:var(--sp-2);align-items:center;padding:var(--sp-1) var(--sp-2);border:1px solid var(--border);border-radius:var(--r-sm);background:var(--surface);cursor:grab}',
    '.P-item.is-drag{opacity:.45}',
    '.P-item.is-over{border-color:var(--accent);box-shadow:0 0 0 2px var(--accent-soft-2,var(--surface-3))}',
    '.P-rankno{font-weight:700;color:var(--muted);text-align:center}',
    '.P-doc{min-width:0}',
    '.P-doc b{font-weight:700;color:var(--text)}',
    '.P-doc span{display:block;color:var(--text-2);font-size:var(--fs-xs);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.P-tools{display:flex;gap:var(--sp-1);align-items:center;flex-wrap:wrap;grid-column:2 / 4}',
    '.P-score{width:4.6rem;font:var(--fs-xs) var(--font-mono)}',
    '.P-swatch{display:inline-block;width:.8rem;height:.8rem;border-radius:3px;margin-right:var(--sp-2);vertical-align:-1px}',
    '.P-tablewrap{overflow-x:auto}',
    '.P-table{width:100%;border-collapse:collapse;font-size:var(--fs-xs)}',
    '.P-table th{text-align:left;color:var(--muted);font-weight:600;padding:var(--sp-1) var(--sp-2);border-bottom:1px solid var(--border-strong);white-space:nowrap}',
    '.P-table td{padding:var(--sp-2);border-bottom:1px solid var(--border);vertical-align:middle}',
    '.P-table tr:last-child td{border-bottom:0}',
    '.P-num{font-family:var(--font-mono);white-space:nowrap}',
    '.P-stack{display:flex;height:.7rem;min-width:6rem;background:var(--surface-3);border-radius:4px;overflow:hidden}',
    '.P-stack i{display:block;height:100%}',
    '.P-chip{display:inline-block;font-size:var(--fs-xs);font-weight:600;padding:0 7px;border-radius:var(--r-pill);border:1px solid var(--border-strong);white-space:nowrap}',
    '.P-chip.warn{color:var(--warn);background:var(--warn-soft);border-color:var(--warn)}',
    '.P-chip.ok{color:var(--ok);background:var(--ok-soft);border-color:var(--ok)}',
    '.P-chip.bad{color:var(--bad);background:var(--bad-soft);border-color:var(--bad)}',
    '.P-chip.info{color:var(--info);background:var(--info-soft);border-color:var(--info)}',
    '.P-mismatch{display:grid;gap:var(--sp-2);margin:0;padding:0;list-style:none}',
    '.P-mismatch li{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:var(--sp-2);padding:var(--sp-2) var(--sp-3);background:var(--surface-2);border-radius:var(--r-sm)}',
    '.P-summary{padding:var(--sp-3);border-radius:var(--r-sm);background:var(--info-soft);border-left:4px solid var(--info);margin-bottom:var(--sp-3)}',
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

  function mount(container, api) {
    injectStyle();
    var h = G.el;
    var saved = api.load() || {};
    var state;
    function fromPreset(id) {
      var p = presetById(id);
      return { preset: p.id, lists: p.lists.map(function (l) { return l.slice(); }), scores: p.scores.map(function (s) { return normaliseScores(s, MAX_LIST); }) };
    }
    var base = fromPreset(saved.preset || 'mixed');
    state = {
      preset: base.preset, k: typeof saved.k === 'number' ? saved.k : 60,
      weights: Array.isArray(saved.weights) && saved.weights.length === 3 ? saved.weights : [1, 1, 1],
      rerank: !!saved.rerank, lists: base.lists, scores: base.scores
    };
    if (Array.isArray(saved.lists) && saved.lists.length === 3 && saved.lists.every(function (l) { return Array.isArray(l) && l.every(function (d) { return DOCS[d]; }); })) {
      state.lists = saved.lists;
      if (Array.isArray(saved.scores) && saved.scores.length === 3) state.scores = saved.scores.map(function (s) { return normaliseScores(s, MAX_LIST); });
    }
    var focusKey = null, dragFrom = null, uid = G.uid('rrf');

    function persist() { api.save({ preset: state.preset, k: state.k, weights: state.weights, rerank: state.rerank, lists: state.lists, scores: state.scores }); }
    function active() { return state.rerank ? [0, 1, 2] : [0, 1]; }

    /* ---- controls ---- */
    var presetBtns = {}, presetRow = h('div', { class: P + 'row', role: 'group', 'aria-label': 'Query preset' });
    PRESETS.forEach(function (p) {
      var b = h('button', { type: 'button', class: P + 'btn', 'aria-pressed': 'false', on: { click: function () { loadPreset(p.id); } } }, p.label);
      presetBtns[p.id] = b; presetRow.appendChild(b);
    });
    var queryBox = h('p', { class: P + 'query' });

    function numRow(label, min, max, step, get, set) {
      var id = G.uid(P + 'n');
      var range = h('input', { type: 'range', id: id, min: min, max: max, step: step });
      var num = h('input', { type: 'number', class: P + 'input', min: min, max: max, step: step, 'aria-label': label + ' value' });
      function sync() { range.value = get(); num.value = get(); }
      function onVal(v) { v = Number(v); if (!isFinite(v)) return; set(G.clamp(v, min, max)); sync(); render(); }
      range.addEventListener('input', function () { onVal(range.value); });
      num.addEventListener('change', function () { onVal(num.value); });
      return { el: h('div', { class: P + 'field' }, h('label', { for: id }, label), h('div', { class: P + 'fieldrow' }, range, num)), sync: sync };
    }
    var kRow = numRow('k (rank smoothing constant)', 1, 200, 1, function () { return state.k; }, function (v) { state.k = Math.round(v); });
    var wRows = LIST_META.map(function (m, i) {
      return numRow('Weight: ' + m.name, 0, 3, 0.1, function () { return state.weights[i]; }, function (v) { state.weights[i] = Math.round(v * 10) / 10; });
    });
    var rrCb = h('input', { type: 'checkbox', on: { change: function () { state.rerank = rrCb.checked; render(); } } });
    var rrLabel = h('label', { class: P + 'checks' }, rrCb, 'Include reranker output as a third list');

    var controls = h('section', { class: P + 'card', 'aria-labelledby': uid + '-h1' },
      h('h3', { id: uid + '-h1' }, 'Query and parameters'),
      presetRow, queryBox,
      h('p', { class: P + 'formula', 'aria-label': 'RRF formula' }, 'RRF(d) = sum over lists of  w / (k + rank)'),
      h('div', { class: P + 'params' }, kRow.el, wRows[0].el, wRows[1].el, wRows[2].el), rrLabel);

    /* ---- lists ---- */
    var listsHost = h('div', { class: P + 'grid' });
    var listsCard = h('section', { class: P + 'card', 'aria-labelledby': uid + '-h2' },
      h('h3', { id: uid + '-h2' }, 'Input rankings: drag rows or use the arrow buttons'), listsHost,
      h('p', { class: P + 'caption' }, 'Raw scores stay with rank positions, so a document that moves up takes the higher score. Editing a score re-sorts the column. RRF ignores raw scores and uses ranks only. Min-max fusion uses the scores.'));

    function move(li, from, to) {
      var list = state.lists[li];
      if (to < 0 || to >= list.length) return;
      state.lists[li] = moveItem(list, from, to);
      focusKey = li + ':' + list[from] + ':' + (to > from ? 'down' : 'up');
      render();
    }
    function renderLists() {
      G.clear(listsHost);
      active().forEach(function (li) {
        var meta = LIST_META[li], list = state.lists[li];
        var ul = h('ul', { class: P + 'list', 'aria-label': meta.name + ' ranking' });
        list.forEach(function (id, i) {
          var item = h('li', { class: P + 'item', draggable: 'true', dataset: { list: li, index: i } });
          item.addEventListener('dragstart', function (e) { dragFrom = { list: li, index: i }; item.classList.add('is-drag'); if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); } });
          item.addEventListener('dragend', function () { dragFrom = null; item.classList.remove('is-drag'); });
          item.addEventListener('dragover', function (e) { if (dragFrom && dragFrom.list === li) { e.preventDefault(); item.classList.add('is-over'); } });
          item.addEventListener('dragleave', function () { item.classList.remove('is-over'); });
          item.addEventListener('drop', function (e) { e.preventDefault(); item.classList.remove('is-over'); if (dragFrom && dragFrom.list === li && dragFrom.index !== i) { var f = dragFrom.index; dragFrom = null; focusKey = null; state.lists[li] = moveItem(state.lists[li], f, i); render(); } });
          var up = h('button', { type: 'button', class: P + 'icon', 'aria-label': 'Move ' + id + ' up in ' + meta.name, disabled: i === 0, dataset: { key: li + ':' + id + ':up' }, on: { click: function () { move(li, i, i - 1); } } }, '\u2191');
          var dn = h('button', { type: 'button', class: P + 'icon', 'aria-label': 'Move ' + id + ' down in ' + meta.name, disabled: i === list.length - 1, dataset: { key: li + ':' + id + ':down' }, on: { click: function () { move(li, i, i + 1); } } }, '\u2193');
          var rm = h('button', { type: 'button', class: P + 'icon', 'aria-label': 'Remove ' + id + ' from ' + meta.name, disabled: list.length <= 3, on: { click: function () { state.lists[li] = list.filter(function (x) { return x !== id; }); focusKey = null; render(); } } }, '\u00d7');
          var sc = h('input', { type: 'number', class: P + 'input ' + P + 'score', step: 'any', min: 0, value: state.scores[li][i], 'aria-label': 'Raw score at rank ' + (i + 1) + ' in ' + meta.name,
            on: { change: function (e) { var v = Number(e.target.value); if (isFinite(v) && v >= 0) { state.scores[li][i] = v; state.scores[li] = normaliseScores(state.scores[li], MAX_LIST); } render(); } } });
          item.appendChild(h('span', { class: P + 'rankno' }, String(i + 1)));
          item.appendChild(h('span', { class: P + 'doc' }, h('b', null, id), h('span', { title: DOCS[id] }, DOCS[id])));
          item.appendChild(h('span', null, sc));
          item.appendChild(h('span', { class: P + 'tools' }, up, dn, rm));
          ul.appendChild(item);
        });
        var present = {}; list.forEach(function (d) { present[d] = 1; });
        var addId = G.uid(P + 'add');
        var sel = h('select', { id: addId, class: P + 'input', disabled: list.length >= MAX_LIST, 'aria-label': 'Add a document to ' + meta.name });
        sel.appendChild(h('option', { value: '' }, list.length >= MAX_LIST ? 'List is full (' + MAX_LIST + ')' : 'Add a document at the bottom'));
        Object.keys(DOCS).forEach(function (d) { if (!present[d]) sel.appendChild(h('option', { value: d }, d + ': ' + DOCS[d])); });
        sel.addEventListener('change', function () { if (sel.value && list.length < MAX_LIST) { state.lists[li] = list.concat([sel.value]); focusKey = null; render(); } });
        listsHost.appendChild(h('div', null,
          h('h4', { style: { margin: '0 0 var(--sp-2)', fontSize: 'var(--fs-sm)' } }, h('span', { class: P + 'swatch', style: { background: 'var(' + meta.colour + ')' }, 'aria-hidden': 'true' }), meta.name),
          h('p', { class: P + 'caption', style: { margin: '0 0 var(--sp-2)' } }, 'Scores: ' + meta.unit), ul, h('div', { style: { marginTop: 'var(--sp-2)' } }, sel)));
      });
    }

    /* ---- results ---- */
    var summaryBox = h('div', { 'aria-live': 'polite' });
    var rrfBox = h('div', { class: P + 'tablewrap' });
    var mmBox = h('div', { class: P + 'tablewrap' });
    var mismatchBox = h('div');
    var results = h('section', { class: P + 'card', 'aria-labelledby': uid + '-h3' },
      h('h3', { id: uid + '-h3' }, 'Fused results'), summaryBox,
      h('h4', { style: { margin: '0 0 var(--sp-2)', fontSize: 'var(--fs-sm)' } }, 'Reciprocal rank fusion'), rrfBox,
      h('h4', { style: { margin: 'var(--sp-4) 0 var(--sp-2)', fontSize: 'var(--fs-sm)' } }, 'Naive min-max score fusion'), mmBox,
      h('h4', { style: { margin: 'var(--sp-4) 0 var(--sp-2)', fontSize: 'var(--fs-sm)' } }, 'Why scores do not mix'), mismatchBox,
      h('p', { class: P + 'caption' }, 'Formula: RRF(d) = sum over lists of w / (k + rank), ranks start at 1. Cormack, Clarke and Buettcher, "Reciprocal rank fusion outperforms Condorcet and individual rank learning methods", SIGIR 2009, which used k = 60. Azure AI Search describes the same 1 / (rank + k) scoring and a k of 60 in "Relevance scoring in hybrid search using Reciprocal Rank Fusion (RRF)" on Microsoft Learn. Per-list weights are an extension, not part of the original formula. Min-max: each list is rescaled to 0 to 1, then summed with the same weights; a document missing from a list adds 0.'));

    var notice = h('section', { class: P + 'card', 'aria-labelledby': uid + '-h4' },
      h('h3', { id: uid + '-h4' }, 'What to notice'),
      h('ol', { class: P + 'notice' }, EXPERIMENTS.map(function (ex) {
        return h('li', null, h('h4', null, ex.title), h('p', null, ex.body),
          h('div', { class: P + 'row' }, ex.buttons.map(function (bt) {
            return h('button', { type: 'button', class: P + 'btn', on: { click: function () { applySet(bt.set); } } }, bt.label);
          })));
      })));

    var root = h('div', { class: P + 'root', 'data-lab': ID }, controls, listsCard, results, notice);
    container.appendChild(root);

    function loadPreset(id) { var b = fromPreset(id); state.preset = b.preset; state.lists = b.lists; state.scores = b.scores; render(); }
    function applySet(set) {
      if (set.preset) { var b = fromPreset(set.preset); state.preset = b.preset; state.lists = b.lists; state.scores = b.scores; }
      if (set.k != null) state.k = set.k;
      state.weights = (set.weights || [1, 1, 1]).slice();
      state.rerank = !!set.rerank;
      render();
    }

    function ruleOf(vals) { return vals.join(' + '); }
    function fmt(x, d) { return x.toFixed(d == null ? 4 : d); }

    function renderResults() {
      var act = active(), lists = act.map(function (i) { return state.lists[i]; }), scores = act.map(function (i) { return state.scores[i]; }), w = act.map(function (i) { return state.weights[i]; });
      var fused = rrf(lists, state.k, w), mm = minMaxFuse(lists, scores, w);
      var rmRank = rankMap(mm), rrRank = rankMap(fused), maxS = maxScore(state.k, w, act.length) || 1;

      G.clear(summaryBox);
      var overlap = topOverlap(fused, mm, 3);
      summaryBox.appendChild(h('div', { class: P + 'summary', role: 'status' },
        'RRF top 3: ' + fused.slice(0, 3).map(function (d) { return d.id; }).join(', ') + '. Min-max top 3: ' + mm.slice(0, 3).map(function (d) { return d.id; }).join(', ') +
        '. Top-3 agreement: ' + overlap + ' of 3. Maximum possible RRF score with these weights and k: ' + fmt(maxS, 4) + '.'));

      /* RRF table */
      var tbl = h('table', { class: P + 'table' }, h('thead', null, h('tr', null,
        h('th', { scope: 'col' }, '#'), h('th', { scope: 'col' }, 'Document'), h('th', { scope: 'col' }, 'RRF score'), h('th', { scope: 'col' }, 'Contributions'), h('th', { scope: 'col' }, 'In'), h('th', { scope: 'col' }, 'vs min-max'))));
      var tb = h('tbody');
      fused.forEach(function (d) {
        var bar = h('div', { class: P + 'stack', role: 'img', 'aria-label': 'Contribution bar: ' + d.contribs.map(function (c) { return LIST_META[act[c.list]].short + ' ' + fmt(c.contribution); }).join(', ') });
        d.contribs.forEach(function (c) { bar.appendChild(h('i', { style: { width: (100 * c.contribution / maxS) + '%', background: 'var(' + LIST_META[act[c.list]].colour + ')' } })); });
        var detail = h('div', { class: P + 'muted', style: { fontSize: 'var(--fs-xs)', marginTop: '2px' } },
          d.contribs.map(function (c) { return LIST_META[act[c.list]].short + ' #' + c.rank + ': ' + (state.weights[act[c.list]] === 1 ? '' : state.weights[act[c.list]] + ' x ') + '1/(' + state.k + '+' + c.rank + ') = ' + fmt(c.contribution); }).join('; '));
        var delta = rmRank[d.id] - d.rank, deltaEl;
        if (delta > 0) deltaEl = h('span', { class: P + 'chip ok', title: 'Ranked ' + delta + ' places higher by RRF than by min-max' }, '\u25b2 ' + delta);
        else if (delta < 0) deltaEl = h('span', { class: P + 'chip bad', title: 'Ranked ' + (-delta) + ' places lower by RRF than by min-max' }, '\u25bc ' + (-delta));
        else deltaEl = h('span', { class: P + 'chip' }, 'same');
        var only = d.nLists === 1 ? h('span', { class: P + 'chip warn', title: 'Present in one list only' }, 'only ' + LIST_META[act[d.contribs[0].list]].short) : h('span', { class: P + 'chip info' }, d.nLists + ' lists');
        tb.appendChild(h('tr', null, h('td', { class: P + 'num' }, String(d.rank)),
          h('td', null, h('b', null, d.id), h('div', { class: P + 'muted', style: { fontSize: 'var(--fs-xs)' } }, DOCS[d.id])),
          h('td', { class: P + 'num' }, fmt(d.score)), h('td', { style: { minWidth: '11rem' } }, bar, detail), h('td', null, only), h('td', null, deltaEl)));
      });
      tbl.appendChild(tb); G.clear(rrfBox); rrfBox.appendChild(tbl);

      /* min-max table */
      var t2 = h('table', { class: P + 'table' }, h('thead', null, h('tr', null,
        h('th', { scope: 'col' }, '#'), h('th', { scope: 'col' }, 'Document'), h('th', { scope: 'col' }, 'Fused score'), h('th', { scope: 'col' }, 'Normalised per list'), h('th', { scope: 'col' }, 'vs RRF'))));
      var tb2 = h('tbody');
      mm.forEach(function (d) {
        var dd = d.rank - rrRank[d.id], el;
        if (dd > 0) el = h('span', { class: P + 'chip bad', title: 'Ranked ' + dd + ' places lower by min-max than by RRF' }, '\u25bc ' + dd);
        else if (dd < 0) el = h('span', { class: P + 'chip ok', title: 'Ranked ' + (-dd) + ' places higher by min-max than by RRF' }, '\u25b2 ' + (-dd));
        else el = h('span', { class: P + 'chip' }, 'same');
        tb2.appendChild(h('tr', null, h('td', { class: P + 'num' }, String(d.rank)),
          h('td', null, h('b', null, d.id), h('div', { class: P + 'muted', style: { fontSize: 'var(--fs-xs)' } }, DOCS[d.id])),
          h('td', { class: P + 'num' }, fmt(d.score, 3)),
          h('td', { class: P + 'num' }, ruleOf(d.contribs.map(function (c) { return LIST_META[act[c.list]].short + ' ' + fmt(c.norm, 2); }))), h('td', null, el)));
      });
      t2.appendChild(tb2); G.clear(mmBox); mmBox.appendChild(t2);

      /* scale mismatch */
      var ul = h('ul', { class: P + 'mismatch' });
      act.forEach(function (li, j) {
        var sc = scores[j].slice(0, lists[j].length), lo = Math.min.apply(null, sc), hi = Math.max.apply(null, sc);
        var second = sc.length > 1 ? sc[1] : sc[0], rest = sc.length > 1 ? (second - lo) / ((hi - lo) || 1) : 1;
        ul.appendChild(h('li', null,
          h('span', null, h('span', { class: P + 'swatch', style: { background: 'var(' + LIST_META[li].colour + ')' }, 'aria-hidden': 'true' }), h('b', null, LIST_META[li].name + ': '), 'raw range ' + lo + ' to ' + hi + '. After min-max, rank 2 scores ' + fmt(rest, 2) + '.'),
          h('span', { class: P + 'muted' }, LIST_META[li].unit)));
      });
      G.clear(mismatchBox); mismatchBox.appendChild(ul);
    }

    function render() {
      Object.keys(presetBtns).forEach(function (id) { presetBtns[id].setAttribute('aria-pressed', String(id === state.preset)); });
      var p = presetById(state.preset);
      G.clear(queryBox); queryBox.appendChild(document.createTextNode('Query: ')); queryBox.appendChild(h('code', null, p.query)); queryBox.appendChild(h('span', { class: P + 'muted' }, ' ' + p.note));
      kRow.sync(); wRows.forEach(function (r) { r.sync(); }); rrCb.checked = state.rerank;
      wRows[2].el.hidden = !state.rerank;
      renderLists(); renderResults(); persist();
      if (focusKey) {
        var t = listsHost.querySelector('[data-key="' + focusKey + '"]');
        if (t && !t.disabled) t.focus(); else { var alt = listsHost.querySelector('[data-key="' + focusKey.replace(/:(up|down)$/, function (m, d) { return d === 'up' ? ':down' : ':up'; }) + '"]'); if (alt) alt.focus(); }
        focusKey = null;
      }
    }

    render();
    return { destroy: function () { G.clear(container); } };
  }

  G.labs.register(ID, { mount: mount, model: model, presets: PRESETS, docs: DOCS, experiments: EXPERIMENTS });
})();
