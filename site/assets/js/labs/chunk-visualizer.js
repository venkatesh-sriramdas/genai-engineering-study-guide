/* Chunking visualizer lab. Owner: E3b.
   Pure model first (testable in Node through tools/test-labs-b.mjs), UI after. */
(function () {
  'use strict';
  var G = window.Guide;
  var ID = 'chunk-visualizer';
  var P = 'lab-chunk-visualizer-';

  /* ================= model ================= */
  var CPT = 4; // characters per token, rule of thumb for English prose
  function tokOf(chars) { return Math.ceil(chars / CPT); }

  var SEPARATORS = [
    { id: 'para', label: 'Paragraph break', value: '\n\n' },
    { id: 'line', label: 'Line break', value: '\n' },
    { id: 'sent', label: 'Sentence end', value: '. ' },
    { id: 'clause', label: 'Clause (comma)', value: ', ' },
    { id: 'space', label: 'Space', value: ' ' }
  ];
  var DEFAULT_SEPS = ['para', 'line', 'sent', 'space'];

  var STOP = {};
  ('a an and are as at be but by can for from has have how if in is it its of on or so that the their them then there ' +
   'these they this to was were what when which while who will with you your not no do does did than into over under ' +
   'after before per i we our us me my should would could may might must about up out also any each every more most ' +
   'one two many much').split(' ').forEach(function (w) { STOP[w] = 1; });
  function stem(w) {
    if (w.length > 4 && /ies$/.test(w)) w = w.slice(0, -3) + 'y';
    else if (w.length > 5 && /ing$/.test(w)) w = w.slice(0, -3);
    else if (w.length > 4 && /ed$/.test(w)) w = w.slice(0, -2);
    else if (w.length > 3 && /s$/.test(w) && !/ss$/.test(w)) w = w.slice(0, -1);
    if (w.length > 4 && /e$/.test(w)) w = w.slice(0, -1);
    return w;
  }
  function termsOf(s) {
    var m = String(s).toLowerCase().match(/[a-z0-9]+/g) || [];
    return m.filter(function (w) { return w.length > 1 && !STOP[w]; }).map(stem);
  }

  /* Contiguous sentence-ish atoms that tile the text exactly (whitespace stays attached to the atom before it). */
  var ABBR = { 'e.g': 1, 'i.e': 1, dr: 1, mr: 1, mrs: 1, ms: 1, vs: 1, etc: 1, fig: 1, no: 1, approx: 1, inc: 1, st: 1 };
  function sentenceAtoms(text) {
    var atoms = [], n = text.length, pos = 0, cursor = 0;
    while (pos < n) {
      var nl = text.indexOf('\n', pos);
      var lineEnd = nl === -1 ? n : nl + 1;
      var line = text.slice(pos, lineEnd);
      if (line.trim() === '') {
        if (atoms.length) { atoms[atoms.length - 1].end = lineEnd; cursor = lineEnd; }
        pos = lineEnd; continue;
      }
      var re = /[.!?]+["'\u201d\u2019)\]]*[ \t]+/g, m;
      while ((m = re.exec(line)) !== null) {
        var endIdx = m.index + m[0].length;
        if (endIdx >= line.length) continue;
        if (/[a-z]/.test(line.charAt(endIdx))) continue;
        var before = line.slice(0, m.index);
        var w = before.match(/([A-Za-z.]+)$/);
        if (m[0].charAt(0) === '.' && (/^\s*\d+$/.test(before) || (w && (ABBR[w[1].toLowerCase()] || /^[A-Z]$/.test(w[1]))))) continue;
        atoms.push({ start: cursor, end: pos + endIdx });
        cursor = pos + endIdx;
      }
      atoms.push({ start: cursor, end: lineEnd });
      cursor = lineEnd;
      pos = lineEnd;
    }
    if (atoms.length && atoms[atoms.length - 1].end < n) atoms[atoms.length - 1].end = n;
    return atoms;
  }
  function atomsInRange(text, s, e) {
    return sentenceAtoms(text.slice(s, e)).map(function (a) { return { start: a.start + s, end: a.end + s }; });
  }

  /* Greedy merge of contiguous parts up to size chars, carrying a tail of whole parts (<= overlap chars) into the next chunk. */
  function mergeParts(parts, size, overlap) {
    var out = [], cur = [], total = 0;
    function len(p) { return p.end - p.start; }
    parts.forEach(function (p) {
      var l = len(p);
      if (cur.length && total + l > size) {
        out.push({ start: cur[0].start, end: cur[cur.length - 1].end });
        while (cur.length && (total > overlap || (total + l > size && total > 0))) { total -= len(cur[0]); cur.shift(); }
      }
      cur.push(p); total += l;
    });
    if (cur.length) out.push({ start: cur[0].start, end: cur[cur.length - 1].end });
    return out;
  }

  function fixedRange(start, end, size, overlap) {
    var out = [], step = Math.max(1, size - overlap), s = start;
    while (s < end) {
      var e = Math.min(s + size, end);
      out.push({ start: s, end: e });
      if (e >= end) break;
      s += step;
    }
    return out;
  }
  function chunkFixed(text, sizeTok, overlapTok) {
    var size = Math.max(1, sizeTok * CPT), overlap = Math.min(Math.max(0, overlapTok * CPT), size - 1);
    return fixedRange(0, text.length, size, overlap);
  }

  function chunkRecursive(text, sizeTok, overlapTok, seps) {
    var size = Math.max(1, sizeTok * CPT), overlap = Math.min(Math.max(0, overlapTok * CPT), size - 1);
    seps = (seps && seps.length ? seps : ['\n\n', '\n', ' ']).filter(function (s) { return s.length > 0; });
    function splitKeep(start, end, sep) {
      var parts = [], i = start;
      while (i < end) {
        var j = text.indexOf(sep, i);
        if (j === -1 || j + sep.length > end) { parts.push({ start: i, end: end }); break; }
        parts.push({ start: i, end: j + sep.length });
        i = j + sep.length;
      }
      return parts;
    }
    function rec(start, end, idx) {
      if (end - start <= size) return [{ start: start, end: end }];
      var k = idx, seg = text.slice(start, end);
      while (k < seps.length && seg.indexOf(seps[k]) === -1) k++;
      if (k >= seps.length) return fixedRange(start, end, size, overlap);
      var parts = splitKeep(start, end, seps[k]), out = [], good = [];
      parts.forEach(function (p) {
        if (p.end - p.start <= size) { good.push(p); return; }
        if (good.length) { out = out.concat(mergeParts(good, size, overlap)); good = []; }
        out = out.concat(rec(p.start, p.end, k + 1));
      });
      if (good.length) out = out.concat(mergeParts(good, size, overlap));
      return out;
    }
    return rec(0, text.length, 0);
  }

  function chunkSentences(text, sizeTok, overlapTok) {
    var size = Math.max(1, sizeTok * CPT), overlap = Math.min(Math.max(0, overlapTok * CPT), size - 1);
    return mergeParts(sentenceAtoms(text), size, overlap);
  }

  /* Markdown-ish blocks that tile the text: headings, tables, fenced code, list items, paragraphs. */
  function mdBlocks(text) {
    var lines = [], pos = 0, n = text.length;
    while (pos < n) {
      var nl = text.indexOf('\n', pos), e = nl === -1 ? n : nl + 1;
      lines.push({ s: pos, e: e, t: text.slice(pos, e) });
      pos = e;
    }
    var blocks = [], i = 0;
    function isBlank(l) { return l.t.trim() === ''; }
    function isHeading(l) { return /^#{1,6}\s/.test(l.t); }
    function isTable(l) { return /^\s*\|/.test(l.t); }
    function isItem(l) { return /^\s*([-*+]|\d+[.)])\s/.test(l.t); }
    function isFence(l) { return /^\s*```/.test(l.t); }
    while (i < lines.length) {
      var l = lines[i];
      if (isBlank(l)) { if (blocks.length) blocks[blocks.length - 1].end = l.e; else blocks.push({ start: 0, end: l.e, type: 'blank' }); i++; continue; }
      var b = { start: l.s, end: l.e, type: 'para' };
      if (blocks.length === 1 && blocks[0].type === 'blank') { b.start = 0; blocks.pop(); }
      if (isFence(l)) {
        b.type = 'code'; i++;
        while (i < lines.length && !isFence(lines[i])) { b.end = lines[i].e; i++; }
        if (i < lines.length) { b.end = lines[i].e; i++; }
      } else if (isHeading(l)) {
        b.type = 'heading'; b.level = l.t.match(/^#+/)[0].length; i++;
      } else if (isTable(l)) {
        b.type = 'table'; i++;
        while (i < lines.length && isTable(lines[i])) { b.end = lines[i].e; i++; }
      } else if (isItem(l)) {
        b.type = 'item'; i++;
        while (i < lines.length && !isBlank(lines[i]) && !isItem(lines[i]) && !isHeading(lines[i]) && /^\s+\S/.test(lines[i].t)) { b.end = lines[i].e; i++; }
      } else {
        i++;
        while (i < lines.length && !isBlank(lines[i]) && !isHeading(lines[i]) && !isTable(lines[i]) && !isItem(lines[i]) && !isFence(lines[i])) { b.end = lines[i].e; i++; }
      }
      blocks.push(b);
    }
    if (blocks.length && blocks[0].type === 'blank') blocks[0].type = 'para';
    return blocks;
  }

  /* Structure-aware: sections start at headings, tables and code stay whole, oversized paragraphs fall back to sentences. */
  function chunkStructure(text, sizeTok, overlapTok) {
    var size = Math.max(1, sizeTok * CPT), overlap = Math.min(Math.max(0, overlapTok * CPT), size - 1);
    var blocks = mdBlocks(text), sections = [], stack = [], cur = { path: [], atoms: [] };
    blocks.forEach(function (b) {
      if (b.type === 'heading') {
        if (cur.atoms.length) sections.push(cur);
        var title = text.slice(b.start, b.end).replace(/^#+\s*/, '').trim();
        stack = stack.filter(function (h) { return h.level < b.level; });
        stack.push({ level: b.level, title: title });
        cur = { path: stack.map(function (h) { return h.title; }), atoms: [] };
        cur.atoms.push({ start: b.start, end: b.end, type: 'heading' });
        return;
      }
      if (b.end - b.start <= size || b.type === 'table' || b.type === 'code') { cur.atoms.push(b); return; }
      mergeParts(atomsInRange(text, b.start, b.end), size, overlap).forEach(function (piece) {
        cur.atoms.push({ start: piece.start, end: piece.end, type: 'piece' });
      });
    });
    if (cur.atoms.length) sections.push(cur);
    var out = [];
    sections.forEach(function (sec) {
      var g = null;
      function close() { if (g) out.push({ start: g.start, end: g.end, path: sec.path }); g = null; }
      sec.atoms.forEach(function (a) {
        if (g && !g.headingOnly && a.end - g.start > size) close();
        if (!g) g = { start: a.start, end: a.end, headingOnly: a.type === 'heading' };
        else { g.end = Math.max(g.end, a.end); if (a.type !== 'heading') g.headingOnly = false; }
      });
      close();
    });
    return out;
  }

  function cosine(a, b) {
    var dot = 0, na = 0, nb = 0, k;
    for (k in a) { na += a[k] * a[k]; if (b[k]) dot += a[k] * b[k]; }
    for (k in b) nb += b[k] * b[k];
    return na && nb ? dot / Math.sqrt(na * nb) : 0;
  }
  function tf(termList) { var o = {}; termList.forEach(function (t) { o[t] = (o[t] || 0) + 1; }); return o; }

  /* Approximate "semantic" splitter: a boundary opens where lexical similarity between the sentences on each side of a gap is low. */
  function semanticGaps(text, win) {
    var atoms = sentenceAtoms(text), w = win || 2, terms = atoms.map(function (a) { return termsOf(text.slice(a.start, a.end)); });
    var sims = [];
    for (var g = 1; g < atoms.length; g++) {
      var L = [], R = [], i;
      for (i = Math.max(0, g - w); i < g; i++) L = L.concat(terms[i]);
      for (i = g; i < Math.min(atoms.length, g + w); i++) R = R.concat(terms[i]);
      sims.push(cosine(tf(L), tf(R)));
    }
    return { atoms: atoms, sims: sims };
  }
  function chunkSemantic(text, sizeTok, overlapTok, threshold) {
    var size = Math.max(1, sizeTok * CPT), overlap = Math.min(Math.max(0, overlapTok * CPT), size - 1);
    var sg = semanticGaps(text), atoms = sg.atoms, sims = sg.sims, minLen = Math.max(1, Math.floor(size * 0.3));
    var groups = [], start = 0, breaks = [];
    for (var g = 1; g < atoms.length; g++) {
      if (sims[g - 1] < threshold && atoms[g - 1].end - atoms[start].start >= minLen) { groups.push([start, g - 1]); breaks.push(g); start = g; }
    }
    if (atoms.length) groups.push([start, atoms.length - 1]);
    var pieces = [];
    groups.forEach(function (gr) {
      var parts = atoms.slice(gr[0], gr[1] + 1);
      mergeParts(parts, size, 0).forEach(function (c) { pieces.push(c); });
    });
    var out = pieces.map(function (c, i) {
      if (i === 0 || overlap === 0) return { start: c.start, end: c.end };
      var s = c.start, k;
      for (k = atoms.length - 1; k >= 0; k--) {
        if (atoms[k].end <= c.start && c.start - atoms[k].start <= overlap) s = atoms[k].start;
        else if (atoms[k].end <= c.start) break;
      }
      return { start: s, end: c.end };
    });
    return { chunks: out, sims: sims, breaks: breaks, atoms: atoms };
  }

  function mergeIntervals(chunks) {
    var iv = chunks.map(function (c) { return [c.start, c.end]; }).sort(function (a, b) { return a[0] - b[0]; });
    var total = 0, curS = null, curE = null;
    iv.forEach(function (x) {
      if (curS === null) { curS = x[0]; curE = x[1]; }
      else if (x[0] <= curE) curE = Math.max(curE, x[1]);
      else { total += curE - curS; curS = x[0]; curE = x[1]; }
    });
    if (curS !== null) total += curE - curS;
    return total;
  }

  function isSentenceBoundary(text, atoms, b) {
    if (b <= 0 || b >= text.length) return true;
    for (var i = 0; i < atoms.length; i++) {
      var a = atoms[i];
      if (b >= a.start && b <= a.end) {
        return b === a.start || b === a.end || text.slice(b, a.end).trim() === '' || text.slice(a.start, b).trim() === '';
      }
    }
    return true;
  }
  function snippet(text, b) {
    var l = text.slice(Math.max(0, b - 22), b).replace(/\s+/g, ' '), r = text.slice(b, b + 22).replace(/\s+/g, ' ');
    return (b > 22 ? '...' : '') + l + ' | ' + r + (b + 22 < text.length ? '...' : '');
  }
  function tableRanges(text) {
    return mdBlocks(text).filter(function (b) { return b.type === 'table'; }).map(function (b) { return [b.start, b.end]; });
  }

  /* Boundary and heading checks. Returns [{type, chunk, pos, message}], one per unique problem. */
  function findIssues(text, chunks) {
    var atoms = sentenceAtoms(text), tables = tableRanges(text), issues = [], seen = {};
    function add(type, chunk, pos, msg) {
      var key = type + ':' + pos;
      if (seen[key]) { seen[key].chunks.push(chunk); return; }
      var it = { type: type, chunk: chunk, chunks: [chunk], pos: pos, message: msg };
      seen[key] = it; issues.push(it);
    }
    function checkBoundary(pos, chunk, role) {
      if (pos <= 0 || pos >= text.length) return;
      for (var t = 0; t < tables.length; t++) {
        if (pos > tables[t][0] && pos < tables[t][1]) {
          var midRow = text.charAt(pos - 1) !== '\n';
          add('split-table', chunk, pos, midRow ? 'A table row is cut in half: ' + snippet(text, pos) : 'A table is split between rows, so the header and some rows land in different chunks: ' + snippet(text, pos));
          return;
        }
      }
      if (!isSentenceBoundary(text, atoms, pos)) add('mid-sentence', chunk, pos, 'Chunk ' + (chunk + 1) + (role === 'end' ? ' ends' : ' starts') + ' mid-sentence: ' + snippet(text, pos));
    }
    chunks.forEach(function (c, i) {
      if (i < chunks.length - 1) checkBoundary(c.end, i, 'end');
      if (i > 0) checkBoundary(c.start, i, 'start');
      if (i < chunks.length - 1) {
        var lines = text.slice(c.start, c.end).replace(/\s+$/, '').split('\n');
        var last = lines[lines.length - 1];
        if (/^#{1,6}\s/.test(last)) add('orphan-heading', i, c.end, 'Chunk ' + (i + 1) + ' ends with the heading "' + last.replace(/^#+\s*/, '') + '", separated from the text it introduces.');
      }
    });
    return issues;
  }

  /* TF-IDF cosine ranking of chunk texts for a query. Terms absent from every chunk are ignored. */
  function rankChunks(docs, query) {
    var N = docs.length, dts = docs.map(function (d) { return termsOf(d); }), df = {};
    dts.forEach(function (ts) { var seen = {}; ts.forEach(function (t) { if (!seen[t]) { seen[t] = 1; df[t] = (df[t] || 0) + 1; } }); });
    function idf(t) { return Math.log((N + 1) / ((df[t] || 0) + 1)) + 1; }
    function vec(ts) { var c = tf(ts), v = {}; Object.keys(c).forEach(function (t) { if (df[t]) v[t] = (1 + Math.log(c[t])) * idf(t); }); return v; }
    var q = vec(termsOf(query));
    return docs.map(function (d, i) { return { index: i, score: cosine(q, vec(dts[i])) }; })
      .sort(function (a, b) { return b.score - a.score || a.index - b.index; });
  }

  /* Smallest run of up to 5 consecutive sentences that covers >= 70% of the query's term weight in the document. */
  function findEvidence(text, query) {
    var atoms = sentenceAtoms(text), N = atoms.length, terms = atoms.map(function (a) { return termsOf(text.slice(a.start, a.end)); });
    var df = {}, qt = {};
    terms.forEach(function (ts) { var s = {}; ts.forEach(function (t) { if (!s[t]) { s[t] = 1; df[t] = (df[t] || 0) + 1; } }); });
    termsOf(query).forEach(function (t) { if (df[t]) qt[t] = Math.log((N + 1) / (df[t] + 1)) + 1; });
    var W = 0; Object.keys(qt).forEach(function (t) { W += qt[t]; });
    if (!W) return null;
    var best = null;
    for (var s = 1; s <= 5; s++) {
      for (var i = 0; i + s <= N; i++) {
        var present = {}, cov = 0;
        for (var j = i; j < i + s; j++) terms[j].forEach(function (t) { if (qt[t] && !present[t]) { present[t] = 1; cov += qt[t]; } });
        if (cov / W >= 0.7) return finish(i, s, cov);
        if (!best || cov > best.cov + 1e-9) best = { cov: cov, s: s, i: i };
      }
    }
    return finish(best.i, best.s, best.cov);
    function finish(i, s, cov) {
      var seg = text.slice(atoms[i].start, atoms[i + s - 1].end);
      var lead = seg.length - seg.replace(/^\s+/, '').length, trail = seg.length - seg.replace(/\s+$/, '').length;
      return { start: atoms[i].start + lead, end: atoms[i + s - 1].end - trail, sentences: s, coverage: cov / W };
    }
  }

  function probe(text, chunks, query, indexTexts) {
    var q = String(query || '').trim();
    if (!q || !chunks.length) return null;
    var ranking = rankChunks(indexTexts || chunks.map(function (c) { return text.slice(c.start, c.end); }), q);
    var ev = findEvidence(text, q), contained = [];
    if (ev) chunks.forEach(function (c, i) { if (c.start <= ev.start && c.end >= ev.end) contained.push(i); });
    var touched = [];
    if (ev) chunks.forEach(function (c, i) { if (c.start < ev.end && c.end > ev.start) touched.push(i); });
    var bestRank = null;
    if (contained.length) {
      ranking.forEach(function (r, pos) { if (bestRank === null && contained.indexOf(r.index) !== -1) bestRank = pos + 1; });
    }
    return { ranking: ranking, evidence: ev, contained: contained, touched: touched, straddles: !!ev && contained.length === 0, containingRank: bestRank };
  }

  function analyze(text, p) {
    var strategy = p.strategy || 'recursive', raw, sims = null, breaks = null, atoms = null;
    var sizeTok = Math.max(1, p.size || 100), overlapTok = Math.max(0, p.overlap || 0);
    if (strategy === 'fixed') raw = chunkFixed(text, sizeTok, overlapTok);
    else if (strategy === 'sentence') raw = chunkSentences(text, sizeTok, overlapTok);
    else if (strategy === 'structure') raw = chunkStructure(text, sizeTok, overlapTok);
    else if (strategy === 'semantic') { var sm = chunkSemantic(text, sizeTok, overlapTok, p.threshold == null ? 0.15 : p.threshold); raw = sm.chunks; sims = sm.sims; breaks = sm.breaks; atoms = sm.atoms; }
    else raw = chunkRecursive(text, sizeTok, overlapTok, (p.separators || DEFAULT_SEPS.map(function (id) { return sepValue(id); })));
    raw = raw.filter(function (c) { return text.slice(c.start, c.end).trim() !== ''; });
    var chunks = raw.map(function (c, i) {
      var body = text.slice(c.start, c.end), header = (p.prependHeaders && c.path && c.path.length) ? c.path.join(' > ') : '';
      var tokens = tokOf(body.length) + (header ? tokOf(header.length + 1) : 0);
      var prevEnd = i > 0 ? raw[i - 1].end : 0;
      return { index: i, start: c.start, end: c.end, text: body, chars: body.length, tokens: tokens, header: header, path: c.path || null,
               overlapChars: Math.max(0, prevEnd - c.start), oversize: tokens > sizeTok };
    });
    var toks = chunks.map(function (c) { return c.tokens; }), total = toks.reduce(function (a, b) { return a + b; }, 0);
    var sumLen = chunks.reduce(function (a, c) { return a + c.chars; }, 0), covered = mergeIntervals(chunks);
    var docTokens = tokOf(text.length);
    var stats = {
      count: chunks.length,
      mean: chunks.length ? total / chunks.length : 0,
      min: chunks.length ? Math.min.apply(null, toks) : 0,
      max: chunks.length ? Math.max.apply(null, toks) : 0,
      docTokens: docTokens,
      totalTokens: total,
      duplicationPct: covered ? 100 * (sumLen - covered) / covered : 0,
      inflation: docTokens ? total / docTokens : 0
    };
    var issues = findIssues(text, chunks);
    return { chunks: chunks, stats: stats, issues: issues, sims: sims, breaks: breaks, atoms: atoms };
  }
  function sepValue(id) { for (var i = 0; i < SEPARATORS.length; i++) if (SEPARATORS[i].id === id) return SEPARATORS[i].value; return ''; }

  var model = {
    CPT: CPT, tokOf: tokOf, termsOf: termsOf, sentenceAtoms: sentenceAtoms, mdBlocks: mdBlocks, mergeParts: mergeParts,
    chunkFixed: chunkFixed, chunkRecursive: chunkRecursive, chunkSentences: chunkSentences, chunkStructure: chunkStructure,
    chunkSemantic: chunkSemantic, semanticGaps: semanticGaps, findIssues: findIssues, rankChunks: rankChunks,
    findEvidence: findEvidence, probe: probe, analyze: analyze, SEPARATORS: SEPARATORS, DEFAULT_SEPS: DEFAULT_SEPS, sepValue: sepValue
  };

  /* ================= samples ================= */
  var SAMPLES = [
    { id: 'prose', label: 'Flowing prose',
      query: 'How many days do pallet items get for returns and who pays freight?',
      text:
'Customers can return most items within 30 days of delivery for a full refund. The clock starts on the day the carrier marks the parcel as delivered, not on the day the order was placed. Items must be unused and in their original packaging, although we accept opened packaging for electronics if the product was only powered on once to test it. Refunds are issued to the original payment method and usually appear within five to seven business days after the warehouse scans the returned parcel.\n\n' +
'Some products follow different rules. Perishable goods, custom engraved items and gift cards cannot be returned. Large items that ship on a pallet can be returned within 14 days, and the customer pays the freight cost unless the item arrived damaged. If an item arrives damaged, photograph the box and the product, then contact support within 48 hours of delivery so that a prepaid label can be generated.\n\n' +
'Exchanges are handled as a return followed by a new order. This keeps stock levels accurate and lets the customer choose a different size or colour without waiting for the first parcel to come back. When stock for the replacement is limited, the system reserves one unit for up to 24 hours while the return is in transit. After that the reservation is released and the item goes back on sale.\n\n' +
'International customers should know that import duties are not refundable once the parcel has cleared customs. Return shipping from abroad is arranged through a partner carrier, and the label is available in the customer account under the order history page. Refunds for international orders are converted at the rate in effect on the day the refund is approved, which can differ slightly from the rate at purchase.\n' },
    { id: 'markdown', label: 'Markdown with a table',
      query: 'hotel limit receipt',
      text:
'# Expense policy\n\n' +
'This policy explains what employees can claim and how to submit a claim.\n\n' +
'## Eligible expenses\n\n' +
'Employees can claim travel, meals and equipment when the spending is needed for work. Personal items and fines are never eligible, even when they occur during a business trip.\n\n' +
'### Daily limits\n\n' +
'The table lists the daily limit for each category. Limits apply per person and are shown in local currency units.\n\n' +
'| Category | Daily limit | Receipt required |\n| --- | --- | --- |\n| Meals | 60 | Over 25 |\n| Local transport | 40 | Always |\n| Hotel | 180 | Always |\n| Client entertainment | 120 | Always |\n| Equipment | 500 | Always |\n\n' +
'Anything above the limit needs written approval from a manager before the claim is submitted.\n\n' +
'## Submitting a claim\n\n' +
'Submit the claim in the finance portal within 30 days of the expense. Attach every required receipt as a photo or PDF. Claims without receipts are returned to the sender.\n\n' +
'### Approval and payment\n\n' +
'Managers review claims within five working days. Approved claims are paid with the next payroll run. If a claim is rejected, the portal shows the reason and the employee can resubmit once.\n' },
    { id: 'procedure', label: 'Numbered procedure',
      query: 'When do I revoke the old version?',
      text:
'Rotating a service credential\n\n' +
'Follow these steps in order. Do not skip the verification step, because an unverified rotation can lock the service out of its database.\n\n' +
'1. Open the secrets console and find the credential named in the ticket. Check that the ticket lists an owner and an expiry date.\n' +
'2. Create a new version of the credential. Copy the generated value into the vault only. Never paste it into chat or email.\n' +
'3. Grant the new version read access to the service identity. The old version keeps its access for now so that running instances do not fail.\n' +
'4. Restart one instance of the service and watch its health endpoint for two minutes. If the instance reports unhealthy, stop and go to the rollback section.\n' +
'5. Restart the remaining instances in batches of two. Wait for each batch to report healthy before starting the next.\n' +
'6. Verify that the service can read from the database by running the smoke test. The test must report all checks passed.\n' +
'7. Revoke the old version only after the smoke test passes. Record the revocation time in the ticket.\n\n' +
'Rollback\n\n' +
'If any health check fails, point the service identity back to the old version, restart the affected instances and open an incident. Do not revoke the old version until the incident is closed.\n' }
  ];
  function sampleById(id) { for (var i = 0; i < SAMPLES.length; i++) if (SAMPLES[i].id === id) return SAMPLES[i]; return null; }

  var STRATEGIES = [
    { id: 'fixed', label: 'Fixed size', desc: 'Cuts every N tokens, ignores meaning. Cheap and predictable.' },
    { id: 'recursive', label: 'Recursive', desc: 'Tries paragraph, line, sentence and space separators in order.' },
    { id: 'sentence', label: 'Sentence groups', desc: 'Packs whole sentences up to the size limit.' },
    { id: 'structure', label: 'Structure-aware', desc: 'Splits at markdown headings and keeps tables whole.' },
    { id: 'semantic', label: 'Semantic (approximate)', desc: 'Breaks where lexical similarity between neighbouring sentences drops. Not embeddings.' }
  ];

  var EXPERIMENTS = [
    { id: 'overlap', title: 'Overlap buys boundary safety and costs index size',
      body: 'Start with fixed 80-token chunks and no overlap. The probe shows the answer split across two chunks. Add 16 tokens of overlap and one chunk holds it, but duplication and index inflation climb to about 22% and 1.22x.',
      buttons: [
        { label: 'Fixed 80, no overlap', set: { sample: 'prose', strategy: 'fixed', size: 80, overlap: 0 } },
        { label: 'Add 16 tokens overlap', set: { sample: 'prose', strategy: 'fixed', size: 80, overlap: 16 } }
      ] },
    { id: 'tables', title: 'Structure-aware keeps meaning, sizes get uneven',
      body: 'Fixed chunks cut through the expense table and the probe loses the header row. Switch to structure-aware: the table stays whole and the warnings clear, but chunk sizes now range from about 23 to 55 tokens.',
      buttons: [
        { label: 'Fixed 64 on markdown', set: { sample: 'markdown', strategy: 'fixed', size: 64, overlap: 0 } },
        { label: 'Structure-aware 64', set: { sample: 'markdown', strategy: 'structure', size: 64, overlap: 0 } }
      ] },
    { id: 'semantic', title: 'Semantic splitting follows topic shifts, not length',
      body: 'Sentence groups cut wherever the size limit falls. The approximate semantic splitter cuts where neighbouring sentences share few words, so cut points drift toward paragraph topics. Raise the threshold for more, smaller chunks. It is lexical, so it can also cut inside a topic.',
      buttons: [
        { label: 'Sentence groups 64', set: { sample: 'prose', strategy: 'sentence', size: 64, overlap: 0 } },
        { label: 'Semantic, threshold 0.15', set: { sample: 'prose', strategy: 'semantic', size: 160, overlap: 0, threshold: 0.15 } },
        { label: 'Semantic, threshold 0.25', set: { sample: 'prose', strategy: 'semantic', size: 160, overlap: 0, threshold: 0.25 } }
      ] }
  ];

  /* ================= UI ================= */
  var PALETTE = ['--info', '--ok', '--warn', '--preview', '--brand-2', '--brand-1'];
  function mix(i, pct) { return 'color-mix(in srgb, var(' + PALETTE[i % PALETTE.length] + ') ' + pct + '%, var(--surface))'; }

  var CSS = [
    '.P-root{display:grid;gap:var(--sp-4);color:var(--text);font-family:var(--font-sans);font-size:var(--fs-sm);line-height:1.5;min-width:0}',
    '.P-root *{box-sizing:border-box}',
    '.P-root [hidden]{display:none!important}',
    '.P-card{background:var(--surface);border:1px solid var(--border);border-left:4px solid var(--accent);border-radius:var(--r-md);box-shadow:var(--shadow-1);padding:var(--sp-4);min-width:0}',
    '.P-card>h3,.P-card>h4{margin:0 0 var(--sp-3);font-size:var(--fs-md);line-height:var(--lh-tight);color:var(--text)}',
    '.P-grid{display:grid;gap:var(--sp-4);grid-template-columns:repeat(auto-fit,minmax(min(100%,18rem),1fr));align-items:start}',
    '.P-row{display:flex;flex-wrap:wrap;gap:var(--sp-2);align-items:center}',
    '.P-muted{color:var(--muted)}',
    '.P-caption{color:var(--muted);font-size:var(--fs-xs);margin:var(--sp-3) 0 0}',
    '.P-seg{display:flex;flex-wrap:wrap;gap:var(--sp-2);border:0;margin:0 0 var(--sp-3);padding:0}',
    '.P-seg legend{padding:0;margin:0 0 var(--sp-2);font-weight:600;color:var(--text-2)}',
    '.P-btn{font:inherit;color:var(--text);background:var(--surface-2);border:1px solid var(--border-strong);border-radius:var(--r-pill);padding:var(--sp-1) var(--sp-3);cursor:pointer;transition:background var(--dur) var(--ease),transform var(--dur) var(--ease)}',
    '.P-btn:hover{background:var(--surface-3)}',
    '.P-btn:active{transform:translateY(1px)}',
    '.P-btn[aria-pressed="true"],.P-btn.is-on{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}',
    '.P-text{width:100%;min-height:9rem;max-height:18rem;resize:vertical;font:var(--fs-sm)/1.5 var(--font-mono);color:var(--text);background:var(--code-bg);border:1px solid var(--border-strong);border-radius:var(--r-sm);padding:var(--sp-3)}',
    '.P-input{font:inherit;color:var(--text);background:var(--surface);border:1px solid var(--border-strong);border-radius:var(--r-sm);padding:var(--sp-1) var(--sp-2);min-width:0}',
    '.P-input:hover{border-color:var(--accent)}',
    '.P-opts{display:grid;gap:var(--sp-2);grid-template-columns:repeat(auto-fit,minmax(min(100%,11rem),1fr));margin-bottom:var(--sp-3)}',
    '.P-opt{position:relative;display:block;cursor:pointer}',
    '.P-opt input{position:absolute;opacity:0;inset:0;margin:0;cursor:pointer}',
    '.P-optbody{display:block;height:100%;padding:var(--sp-2) var(--sp-3);background:var(--surface);border:1px solid var(--border);border-radius:var(--r-sm);transition:background var(--dur) var(--ease),border-color var(--dur) var(--ease)}',
    '.P-optbody b{display:block;color:var(--text)}',
    '.P-optbody span{display:block;color:var(--muted);font-size:var(--fs-xs)}',
    '.P-opt:hover .P-optbody{background:var(--surface-2)}',
    '.P-opt input:checked+.P-optbody{border-color:var(--accent);background:var(--accent-soft,var(--surface-2));box-shadow:inset 0 0 0 1px var(--accent)}',
    '.P-opt input:focus-visible+.P-optbody{outline:3px solid var(--focus);outline-offset:2px}',
    '.P-field{display:grid;gap:var(--sp-1);margin-bottom:var(--sp-3)}',
    '.P-field label{font-weight:600;color:var(--text-2)}',
    '.P-fieldrow{display:flex;gap:var(--sp-3);align-items:center}',
    '.P-fieldrow input[type=range]{flex:1;min-width:0;accent-color:var(--accent)}',
    '.P-fieldrow input[type=number]{width:5rem}',
    '.P-checks{display:flex;flex-wrap:wrap;gap:var(--sp-2) var(--sp-4)}',
    '.P-checks label{display:flex;gap:var(--sp-2);align-items:center;cursor:pointer}',
    '.P-checks input{accent-color:var(--accent);width:1rem;height:1rem}',
    '.P-stats{display:grid;gap:var(--sp-3);grid-template-columns:repeat(auto-fit,minmax(7.5rem,1fr))}',
    '.P-stat{background:var(--surface-2);border-radius:var(--r-sm);padding:var(--sp-2) var(--sp-3)}',
    '.P-stat b{display:block;font-size:var(--fs-xl);line-height:1.2;color:var(--text)}',
    '.P-stat span{color:var(--muted);font-size:var(--fs-xs)}',
    '.P-doc{white-space:pre-wrap;word-break:break-word;font:var(--fs-sm)/1.75 var(--font-mono);background:var(--code-bg);border:1px solid var(--border);border-radius:var(--r-sm);padding:var(--sp-3);max-height:26rem;overflow:auto;margin:0}',
    '.P-seg-t{border-radius:2px}',
    '.P-ev{text-decoration:underline;text-decoration-thickness:2px;text-underline-offset:3px;text-decoration-color:var(--text)}',
    '.P-mark{display:inline-block;font:700 var(--fs-xs)/1 var(--font-sans);padding:2px 5px;margin:0 2px;border-radius:var(--r-pill);color:var(--text);border:1px solid var(--border-strong);vertical-align:1px;user-select:none}',
    '.P-legend{display:flex;flex-wrap:wrap;gap:var(--sp-3);margin:var(--sp-2) 0 0;color:var(--muted);font-size:var(--fs-xs)}',
    '.P-chip{display:inline-block;font-size:var(--fs-xs);font-weight:600;padding:1px 8px;border-radius:var(--r-pill);border:1px solid var(--border-strong)}',
    '.P-chip.warn{color:var(--warn);background:var(--warn-soft);border-color:var(--warn)}',
    '.P-chip.info{color:var(--info);background:var(--info-soft);border-color:var(--info)}',
    '.P-chip.ok{color:var(--ok);background:var(--ok-soft);border-color:var(--ok)}',
    '.P-list{list-style:none;margin:0;padding:0;display:grid;gap:var(--sp-2)}',
    '.P-issue{padding:var(--sp-2) var(--sp-3);border-radius:var(--r-sm);background:var(--warn-soft);color:var(--text);border-left:3px solid var(--warn)}',
    '.P-issue b{color:var(--warn)}',
    '.P-chunk{border:1px solid var(--border);border-radius:var(--r-sm);padding:var(--sp-2) var(--sp-3);background:var(--surface)}',
    '.P-chunk header{display:flex;flex-wrap:wrap;gap:var(--sp-2);align-items:center;margin-bottom:var(--sp-1)}',
    '.P-swatch{width:.9rem;height:.9rem;border-radius:3px;border:1px solid var(--border-strong);flex:none}',
    '.P-bar{height:6px;border-radius:3px;background:var(--surface-3);overflow:hidden;flex:1;min-width:4rem}',
    '.P-bar i{display:block;height:100%;background:var(--accent)}',
    '.P-ctext{margin:0;font:var(--fs-xs)/1.5 var(--font-mono);white-space:pre-wrap;word-break:break-word;color:var(--text-2);max-height:5.5rem;overflow:auto}',
    '.P-verdict{padding:var(--sp-3);border-radius:var(--r-sm);border-left:4px solid var(--info);background:var(--info-soft);color:var(--text);margin-top:var(--sp-3)}',
    '.P-verdict.bad{border-color:var(--bad);background:var(--bad-soft)}',
    '.P-verdict.good{border-color:var(--ok);background:var(--ok-soft)}',
    '.P-rank{display:grid;grid-template-columns:2.2rem 1fr 3.6rem;gap:var(--sp-2);align-items:center}',
    '.P-svg{width:100%;height:auto;display:block}',
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

  var MAX_CHARS = 20000;

  function mount(container, api) {
    injectStyle();
    var h = G.el;
    var saved = api.load() || {};
    var def = sampleById('prose');
    var state = {
      sample: saved.sample || 'prose', text: typeof saved.text === 'string' ? saved.text : def.text,
      strategy: saved.strategy || 'recursive', size: saved.size || 80, overlap: saved.overlap == null ? 12 : saved.overlap,
      seps: Array.isArray(saved.seps) ? saved.seps : DEFAULT_SEPS.slice(), threshold: saved.threshold == null ? 0.15 : saved.threshold,
      prependHeaders: !!saved.prependHeaders, query: typeof saved.query === 'string' ? saved.query : def.query
    };
    if (state.sample !== 'custom' && !sampleById(state.sample)) state.sample = 'prose';
    var timer = null;

    function persist() { api.save({ sample: state.sample, text: state.text, strategy: state.strategy, size: state.size, overlap: state.overlap, seps: state.seps, threshold: state.threshold, prependHeaders: state.prependHeaders, query: state.query }); }

    /* ---- controls ---- */
    var sampleBtns = {};
    var sampleRow = h('div', { class: P + 'row', role: 'group', 'aria-label': 'Sample document' });
    SAMPLES.concat([{ id: 'custom', label: 'Pasted text' }]).forEach(function (s) {
      var b = h('button', { type: 'button', class: P + 'btn', 'aria-pressed': 'false', on: { click: function () {
        if (s.id === 'custom') { state.sample = 'custom'; ta.focus(); }
        else { state.sample = s.id; state.text = s.text; state.query = s.query; ta.value = s.text; queryInput.value = s.query; }
        refresh();
      } } }, s.label);
      sampleBtns[s.id] = b; sampleRow.appendChild(b);
    });
    var taId = G.uid(P + 'ta');
    var ta = h('textarea', { id: taId, class: P + 'text', spellcheck: 'false', 'aria-describedby': taId + '-n' });
    ta.value = state.text;
    var counter = h('p', { class: P + 'caption', id: taId + '-n' });
    ta.addEventListener('input', function () {
      var v = ta.value; if (v.length > MAX_CHARS) { v = v.slice(0, MAX_CHARS); ta.value = v; }
      state.text = v; state.sample = 'custom'; schedule();
    });

    var stratRadios = {};
    var stratName = G.uid('strat');
    var stratBox = h('div', { class: P + 'opts' });
    STRATEGIES.forEach(function (s) {
      var r = h('input', { type: 'radio', name: stratName, value: s.id, on: { change: function () { state.strategy = s.id; refresh(); } } });
      stratRadios[s.id] = r;
      stratBox.appendChild(h('label', { class: P + 'opt' }, r, h('span', { class: P + 'optbody' }, h('b', null, s.label), h('span', null, s.desc))));
    });

    function numField(label, min, max, step, key, extra) {
      var id = G.uid(P + 'f');
      var range = h('input', { type: 'range', id: id, min: min, max: max, step: step });
      var num = h('input', { type: 'number', class: P + 'input', min: min, max: max, step: step, 'aria-label': label + ' value' });
      function set(v) { range.value = v; num.value = v; }
      function onVal(v) { v = Number(v); if (!isFinite(v)) return; v = G.clamp(v, min, max); state[key] = v; set(v); if (extra) extra(); refresh(); }
      range.addEventListener('input', function () { onVal(range.value); });
      num.addEventListener('change', function () { onVal(num.value); });
      return { el: h('div', { class: P + 'field' }, h('label', { for: id }, label), h('div', { class: P + 'fieldrow' }, range, num)), set: set, range: range, num: num };
    }
    var sizeF = numField('Chunk size (tokens, about characters divided by 4)', 16, 400, 4, 'size');
    var overlapF = numField('Overlap (tokens)', 0, 100, 2, 'overlap');
    var thrF = numField('Similarity threshold (lower splits less)', 0, 0.6, 0.01, 'threshold');
    var sepBox = h('fieldset', { class: P + 'seg' }, h('legend', null, 'Separators, tried in this order'), h('div', { class: P + 'checks' }));
    SEPARATORS.forEach(function (s) {
      var cb = h('input', { type: 'checkbox', value: s.id, on: { change: function () {
        state.seps = SEPARATORS.map(function (x) { return x.id; }).filter(function (id) { return sepBox.querySelector('input[value="' + id + '"]').checked; });
        refresh();
      } } });
      sepBox.lastChild.appendChild(h('label', null, cb, s.label));
    });
    var hdrCb = h('input', { type: 'checkbox', on: { change: function () { state.prependHeaders = hdrCb.checked; refresh(); } } });
    var hdrBox = h('div', { class: P + 'checks' }, h('label', null, hdrCb, 'Prepend heading path to each chunk (adds tokens)'));

    var controls = h('section', { class: P + 'card', 'aria-labelledby': taId + '-h' },
      h('h3', { id: taId + '-h' }, 'Document and strategy'),
      h('fieldset', { class: P + 'seg' }, h('legend', null, 'Sample document'), sampleRow),
      h('label', { for: taId, class: P + 'sr' }, h('span', { class: 'sr-only' }, 'Document text')),
      ta, counter,
      h('fieldset', { class: P + 'seg', style: { marginTop: 'var(--sp-4)' } }, h('legend', null, 'Chunking strategy'), stratBox),
      sizeF.el, overlapF.el, thrF.el, sepBox, hdrBox);

    /* ---- outputs ---- */
    var statsBox = h('div', { class: P + 'stats', 'aria-live': 'polite' });
    var issuesBox = h('div');
    var docBox = h('div');
    var simBox = h('div');
    var listBox = h('ol', { class: P + 'list' });
    var verdictBox = h('div', { 'aria-live': 'polite' });
    var rankBox = h('ol', { class: P + 'list', style: { marginTop: 'var(--sp-3)' } });
    var qId = G.uid(P + 'q');
    var queryInput = h('input', { type: 'text', id: qId, class: P + 'input', style: { width: '100%' }, placeholder: 'Ask a question about the document' });
    queryInput.value = state.query;
    queryInput.addEventListener('input', function () { state.query = queryInput.value; schedule(); });

    var outputs = h('section', { class: P + 'card', 'aria-labelledby': taId + '-o' },
      h('h3', { id: taId + '-o' }, 'Chunks and statistics'),
      statsBox,
      h('h4', { style: { margin: 'var(--sp-4) 0 var(--sp-2)' } }, 'Boundary warnings'), issuesBox,
      h('h4', { style: { margin: 'var(--sp-4) 0 var(--sp-2)' } }, 'Document with chunk spans'), docBox, simBox,
      h('h4', { style: { margin: 'var(--sp-4) 0 var(--sp-2)' } }, 'Chunk list'), listBox);

    var probeCard = h('section', { class: P + 'card', 'aria-labelledby': qId + '-h' },
      h('h3', { id: qId + '-h' }, 'Query probe'),
      h('label', { for: qId, style: { display: 'block', fontWeight: '600', color: 'var(--text-2)', marginBottom: 'var(--sp-1)' } }, 'Question'),
      queryInput, verdictBox, rankBox,
      h('p', { class: P + 'caption' }, 'Ranking: TF-IDF cosine similarity between the question and each chunk (term weight (1 + ln tf) x idf, idf = ln((N + 1) / (df + 1)) + 1). Evidence is the shortest run of up to 5 sentences covering at least 70% of the question term weight. Teaching simplification, not a production retriever.'));

    var notice = h('section', { class: P + 'card', 'aria-labelledby': taId + '-w' },
      h('h3', { id: taId + '-w' }, 'What to notice'),
      h('ol', { class: P + 'notice' }, EXPERIMENTS.map(function (ex) {
        return h('li', null, h('h4', null, ex.title), h('p', null, ex.body),
          h('div', { class: P + 'row' }, ex.buttons.map(function (bt) {
            return h('button', { type: 'button', class: P + 'btn', on: { click: function () { applyPreset(bt.set); } } }, bt.label);
          })));
      })),
      h('p', { class: P + 'caption' }, 'Token counts are characters divided by 4, a rule of thumb for English text. Recursive splitting follows the separator-fallback and greedy-merge approach used by common open-source text splitters. The semantic splitter is a lexical approximation, not an embedding model.'));

    var root = h('div', { class: P + 'root', 'data-lab': ID }, h('div', { class: P + 'grid' }, controls, probeCard), outputs, notice);
    container.appendChild(root);

    function applyPreset(set) {
      if (set.sample) { var s = sampleById(set.sample); state.sample = s.id; state.text = s.text; state.query = set.query || s.query; ta.value = s.text; queryInput.value = state.query; }
      ['strategy', 'size', 'overlap', 'threshold'].forEach(function (k) { if (set[k] != null) state[k] = set[k]; });
      refresh();
    }

    function schedule() { clearTimeout(timer); timer = setTimeout(refresh, 120); }

    function f1(x) { return x.toFixed(1); }

    function renderDoc(text, res, pr) {
      var ev = pr && pr.evidence, cuts = { 0: 1 }; cuts[text.length] = 1;
      res.chunks.forEach(function (c) { cuts[c.start] = 1; cuts[c.end] = 1; });
      if (ev) { cuts[ev.start] = 1; cuts[ev.end] = 1; }
      var pts = Object.keys(cuts).map(Number).sort(function (a, b) { return a - b; });
      var pre = h('pre', { class: P + 'doc', tabindex: '0', 'aria-label': 'Document text with chunk spans highlighted' });
      var starts = {};
      res.chunks.forEach(function (c) { (starts[c.start] = starts[c.start] || []).push(c.index); });
      for (var i = 0; i < pts.length - 1; i++) {
        var a = pts[i], b = pts[i + 1];
        (starts[a] || []).forEach(function (ci) {
          pre.appendChild(h('span', { class: P + 'mark', style: { background: mix(ci, 35) }, 'aria-label': 'Chunk ' + (ci + 1) + ' starts' }, '#' + (ci + 1)));
        });
        var inC = res.chunks.filter(function (c) { return c.start <= a && c.end >= b; }).map(function (c) { return c.index; });
        var style = {};
        if (inC.length === 1) style.background = mix(inC[0], 30);
        else if (inC.length > 1) style.background = 'repeating-linear-gradient(135deg,' + mix(inC[0], 45) + ' 0 6px,' + mix(inC[1], 45) + ' 6px 12px)';
        var inEv = ev && ev.start <= a && ev.end >= b;
        pre.appendChild(h('span', { class: P + 'seg-t' + (inEv ? ' ' + P + 'ev' : ''), style: style, title: inC.length > 1 ? 'Overlap: chunks ' + inC.map(function (x) { return x + 1; }).join(' and ') : (inC.length ? 'Chunk ' + (inC[0] + 1) : '') }, text.slice(a, b)));
      }
      var legend = h('p', { class: P + 'legend' },
        h('span', null, 'Numbered pills mark where each chunk starts.'),
        h('span', null, 'Hatched text is covered by two chunks (overlap).'),
        ev ? h('span', null, 'Underlined text is the answer evidence for the probe question.') : null);
      return [pre, legend];
    }

    function renderSims(res) {
      G.clear(simBox);
      if (state.strategy !== 'semantic' || !res.sims || !res.sims.length) return;
      var n = res.sims.length, W = 560, H = 110, bw = Math.max(2, Math.min(18, (W - 20) / n - 2)), gap = (W - 20 - bw * n) / Math.max(1, n - 1);
      var NS = 'http://www.w3.org/2000/svg';
      function s(tag, attrs) { var e = document.createElementNS(NS, tag); Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); }); return e; }
      var svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, class: P + 'svg', role: 'img', 'aria-label': 'Lexical similarity between sentence neighbourhoods at each gap. Bars below the threshold line are candidate boundaries.' });
      var maxV = Math.max(0.6, Math.max.apply(null, res.sims));
      res.sims.forEach(function (v, i) {
        var bh = (v / maxV) * (H - 30), x = 10 + i * (bw + gap), isBreak = res.breaks.indexOf(i + 1) !== -1;
        var r = s('rect', { x: x, y: H - 20 - bh, width: bw, height: Math.max(1, bh), rx: 2 });
        r.style.fill = isBreak ? 'var(--bad)' : 'var(--accent)'; r.style.opacity = isBreak ? '1' : '0.55';
        var t = s('title'); t.textContent = 'Gap ' + (i + 1) + ': similarity ' + v.toFixed(2) + (isBreak ? ' (boundary)' : ''); r.appendChild(t);
        svg.appendChild(r);
      });
      var ty = H - 20 - (state.threshold / maxV) * (H - 30);
      var line = s('line', { x1: 0, x2: W, y1: ty, y2: ty, 'stroke-dasharray': '5 4', 'stroke-width': 1.5 }); line.style.stroke = 'var(--text-2)'; svg.appendChild(line);
      var lab = s('text', { x: W - 4, y: ty - 4, 'text-anchor': 'end', 'font-size': 11 }); lab.style.fill = 'var(--text-2)'; lab.textContent = 'threshold ' + state.threshold.toFixed(2); svg.appendChild(lab);
      var ax = s('text', { x: 10, y: H - 4, 'font-size': 11 }); ax.style.fill = 'var(--muted)'; ax.textContent = 'similarity at each sentence gap (red = boundary)'; svg.appendChild(ax);
      simBox.appendChild(h('div', { style: { marginTop: 'var(--sp-3)' } }, svg));
    }

    function refresh() {
      state.size = G.clamp(Math.round(state.size) || 16, 16, 400);
      var maxOv = Math.floor(state.size / 2);
      state.overlap = G.clamp(Math.round(state.overlap) || 0, 0, maxOv);
      overlapF.range.max = maxOv; overlapF.num.max = maxOv;
      sizeF.set(state.size); overlapF.set(state.overlap); thrF.set(state.threshold);
      Object.keys(sampleBtns).forEach(function (id) { sampleBtns[id].setAttribute('aria-pressed', String(id === state.sample)); });
      Object.keys(stratRadios).forEach(function (id) { stratRadios[id].checked = id === state.strategy; });
      sepBox.hidden = state.strategy !== 'recursive';
      thrF.el.hidden = state.strategy !== 'semantic';
      hdrBox.hidden = state.strategy !== 'structure';
      Array.prototype.forEach.call(sepBox.querySelectorAll('input'), function (cb) { cb.checked = state.seps.indexOf(cb.value) !== -1; });
      hdrCb.checked = state.prependHeaders;
      counter.textContent = state.text.length + ' characters, about ' + tokOf(state.text.length) + ' tokens. Limit ' + MAX_CHARS + ' characters.';

      var text = state.text;
      if (!text.trim()) {
        [statsBox, issuesBox, docBox, simBox, listBox, verdictBox, rankBox].forEach(G.clear);
        docBox.appendChild(h('p', { class: P + 'muted' }, 'Paste or pick a document to see chunks.'));
        persist(); return;
      }
      var res = analyze(text, { strategy: state.strategy, size: state.size, overlap: state.overlap, threshold: state.threshold, prependHeaders: state.prependHeaders,
        separators: state.seps.map(sepValue) });
      var indexTexts = res.chunks.map(function (c) { return (c.header ? c.header + ' ' : '') + c.text; });
      var pr = probe(text, res.chunks, state.query, indexTexts);

      /* stats */
      G.clear(statsBox);
      var s = res.stats;
      [['Chunks', String(s.count)], ['Mean tokens', f1(s.mean)], ['Min / max tokens', s.min + ' / ' + s.max],
       ['Overlap duplication', f1(s.duplicationPct) + '%'], ['Index size inflation', (Math.round(s.inflation * 100) / 100).toFixed(2) + 'x']]
        .forEach(function (x) { statsBox.appendChild(h('div', { class: P + 'stat' }, h('b', null, x[1]), h('span', null, x[0]))); });

      /* issues */
      G.clear(issuesBox);
      if (!res.issues.length) issuesBox.appendChild(h('p', null, h('span', { class: P + 'chip ok' }, 'Clean'), ' No mid-sentence cuts, split tables or orphaned headings.'));
      else {
        var ul = h('ul', { class: P + 'list' });
        res.issues.slice(0, 12).forEach(function (is) {
          var label = is.type === 'split-table' ? 'Split table' : is.type === 'orphan-heading' ? 'Orphan heading' : 'Mid-sentence cut';
          ul.appendChild(h('li', { class: P + 'issue' }, h('b', null, label + ': '), is.message));
        });
        issuesBox.appendChild(ul);
        if (res.issues.length > 12) issuesBox.appendChild(h('p', { class: P + 'caption' }, (res.issues.length - 12) + ' more not shown.'));
      }

      /* document */
      G.clear(docBox); renderDoc(text, res, pr).forEach(function (n) { docBox.appendChild(n); });
      renderSims(res);

      /* list */
      G.clear(listBox);
      var maxTok = Math.max.apply(null, res.chunks.map(function (c) { return c.tokens; }).concat([1]));
      res.chunks.slice(0, 80).forEach(function (c) {
        var chips = [];
        if (c.overlapChars) chips.push(h('span', { class: P + 'chip info' }, 'overlap ' + tokOf(c.overlapChars) + ' tok'));
        if (c.oversize) chips.push(h('span', { class: P + 'chip info' }, 'over size, kept whole'));
        res.issues.forEach(function (is) { if (is.chunks.indexOf(c.index) !== -1) chips.push(h('span', { class: P + 'chip warn' }, is.type === 'split-table' ? 'split table' : is.type === 'orphan-heading' ? 'orphan heading' : 'mid-sentence cut')); });
        listBox.appendChild(h('li', { class: P + 'chunk' },
          h('header', null, h('span', { class: P + 'swatch', style: { background: mix(c.index, 45) }, 'aria-hidden': 'true' }), h('b', null, 'Chunk ' + (c.index + 1)),
            h('span', { class: P + 'muted' }, c.tokens + ' tokens, characters ' + c.start + ' to ' + c.end),
            h('span', { class: P + 'bar', 'aria-hidden': 'true' }, h('i', { style: { width: Math.round(100 * c.tokens / maxTok) + '%' } })), chips),
          c.header ? h('p', { class: P + 'muted', style: { margin: '0 0 var(--sp-1)' } }, 'Header: ' + c.header) : null,
          h('pre', { class: P + 'ctext', tabindex: '0' }, c.text.replace(/\s+$/, ''))));
      });
      if (res.chunks.length > 80) listBox.appendChild(h('li', { class: P + 'caption' }, (res.chunks.length - 80) + ' more chunks not listed.'));

      /* probe */
      G.clear(verdictBox); G.clear(rankBox);
      if (!pr) verdictBox.appendChild(h('p', { class: P + 'muted' }, 'Type a question to see which chunk a TF-IDF retriever would return.'));
      else if (!pr.evidence) verdictBox.appendChild(h('div', { class: P + 'verdict' }, 'No question words appear in the document, so there is no evidence span to test.'));
      else {
        var ev = pr.evidence, top = pr.ranking[0].index;
        var cls = P + 'verdict', msg;
        if (pr.straddles) { cls += ' bad'; msg = 'The answer evidence straddles a boundary. It is split across chunks ' + pr.touched.map(function (x) { return x + 1; }).join(' and ') + ', and no single chunk holds all of it. Retrieval can return only part of the answer.'; }
        else if (pr.contained.indexOf(top) !== -1) { cls += ' good'; msg = 'Chunk ' + (top + 1) + ' holds the whole evidence and ranks first.'; }
        else { msg = 'Chunk ' + (pr.contained[0] + 1) + ' holds the whole evidence but ranks ' + pr.containingRank + ', so the top result misses it.'; }
        verdictBox.appendChild(h('div', { class: cls, role: 'status' }, msg + ' (Evidence: ' + ev.sentences + (ev.sentences === 1 ? ' sentence' : ' sentences') + ', ' + Math.round(ev.coverage * 100) + '% of question term weight.)'));
        pr.ranking.slice(0, 3).forEach(function (r, pos) {
          var inEv = pr.contained.indexOf(r.index) !== -1 || pr.touched.indexOf(r.index) !== -1;
          rankBox.appendChild(h('li', { class: P + 'rank' }, h('span', { class: P + 'muted' }, '#' + (pos + 1)),
            h('span', null, 'Chunk ' + (r.index + 1) + (inEv ? ' (has evidence)' : '')),
            h('span', { class: P + 'muted', style: { textAlign: 'right' } }, r.score.toFixed(3))));
        });
      }
      persist();
    }

    refresh();
    return { destroy: function () { clearTimeout(timer); G.clear(container); } };
  }

  G.labs.register(ID, { mount: mount, model: model, samples: SAMPLES, experiments: EXPERIMENTS });
})();
