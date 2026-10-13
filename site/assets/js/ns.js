/* Follow the Question: shared namespace and helpers. FROZEN after wave 0. Owner: orchestrator.
   Classic script (no ES modules) so the site works from file://. Load FIRST. */
(function () {
  'use strict';

  var G = (window.Guide = window.Guide || {});
  G.version = '1.0.0';

  /* ---------- DOM helper ----------
     G.el('div', {class:'x', dataset:{a:1}, on:{click:fn}, 'aria-label':'y'}, 'text', childNode, [more])
     Strings become text nodes (never HTML). Use G.html(el, trustedHtml) only for output of Guide.md. */
  G.el = function (tag, attrs) {
    var node = document.createElement(tag);
    if (attrs && typeof attrs === 'object' && !(attrs instanceof Node) && !Array.isArray(attrs)) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') node.className = v;
        else if (k === 'dataset') Object.keys(v).forEach(function (d) { node.dataset[d] = v[d]; });
        else if (k === 'on') Object.keys(v).forEach(function (ev) { node.addEventListener(ev, v[ev]); });
        else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
        else if (k === 'text') node.textContent = v;
        else if (v === true) node.setAttribute(k, '');
        else node.setAttribute(k, String(v));
      });
      appendKids(node, Array.prototype.slice.call(arguments, 2));
    } else {
      appendKids(node, Array.prototype.slice.call(arguments, 1));
    }
    return node;
  };
  function appendKids(node, kids) {
    kids.forEach(function (k) {
      if (k === null || k === undefined || k === false) return;
      if (Array.isArray(k)) appendKids(node, k);
      else if (k instanceof Node) node.appendChild(k);
      else node.appendChild(document.createTextNode(String(k)));
    });
  }
  /* Set trusted HTML (only ever pass output of Guide.md.* which escapes input). */
  G.html = function (node, trustedHtml) { node.innerHTML = trustedHtml; return node; };
  G.clear = function (node) { while (node.firstChild) node.removeChild(node.firstChild); return node; };

  /* ---------- small utilities ---------- */
  G.esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  G.slug = function (s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'x';
  };
  G.clamp = function (n, lo, hi) { return Math.min(hi, Math.max(lo, n)); };
  G.debounce = function (fn, ms) {
    var t; return function () { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms); };
  };
  /* Deterministic shuffle (seeded) so a question keeps its order within a session. */
  G.shuffle = function (arr, seedStr) {
    var a = arr.slice(), h = 2166136261;
    String(seedStr || 'seed').split('').forEach(function (ch) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); });
    function rnd() { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; }
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  };
  G.today = function () { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); };
  G.fmtMin = function (m) { return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60 ? (m % 60) + ' min' : ''); };
  G.uid = function (p) { return (p || 'id') + '-' + Math.random().toString(36).slice(2, 9); };
  G.download = function (filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
  /* Inject a script tag and resolve when loaded (works on file://). */
  G.loadScript = function (src) {
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-src="' + src + '"]');
      if (existing && existing.dataset.done) return resolve();
      var s = existing || document.createElement('script');
      s.dataset.src = src;
      s.onload = function () { s.dataset.done = '1'; resolve(); };
      s.onerror = function () { reject(new Error('Failed to load ' + src)); };
      if (!existing) { s.src = src; document.head.appendChild(s); }
    });
  };

  /* ---------- event bus ----------
     Events used across modules:
       'store:change'   {path}                 progress or settings changed
       'route:change'   {name, params, query}  after the router rendered a view
       'theme:change'   {theme}                'light' | 'dark'
       'quiz:answered'  {itemId, correct, levelId, worldId}
       'level:complete' {levelId, worldId}
       'card:rated'     {cardId, box}
  */
  var handlers = {};
  G.bus = {
    on: function (evt, fn) {
      (handlers[evt] = handlers[evt] || []).push(fn);
      return function off() { handlers[evt] = (handlers[evt] || []).filter(function (f) { return f !== fn; }); };
    },
    emit: function (evt, data) {
      (handlers[evt] || []).slice().forEach(function (fn) { try { fn(data); } catch (e) { console.error('[bus]', evt, e); } });
    }
  };

  /* ---------- content registry ----------
     content/manifest.js     sets Guide.manifest            (loaded eagerly by index.html)
     content/search-index.js sets Guide.searchIndex         (loaded eagerly)
     content/refs-all.js     sets Guide.refsAll             (loaded by the library view)
     content/<worldId>.js    calls Guide.content._register  (loaded lazily through Guide.content.load) */
  G.content = {
    _worlds: {},
    _register: function (id, data) { this._worlds[id] = data; },
    get: function (id) { return this._worlds[id] || null; },
    load: function (id) {
      var self = this;
      if (self._worlds[id]) return Promise.resolve(self._worlds[id]);
      return G.loadScript('content/' + id + '.js').then(function () {
        if (!self._worlds[id]) throw new Error('World ' + id + ' did not register');
        return self._worlds[id];
      });
    },
    /* Find a level in the manifest only: returns {world, level} summary objects (no blocks). */
    findLevelMeta: function (levelId) {
      var m = G.manifest; if (!m) return null;
      for (var i = 0; i < m.worlds.length; i++) {
        var w = m.worlds[i];
        for (var j = 0; j < w.levels.length; j++) if (w.levels[j].id === levelId) return { world: w, level: w.levels[j] };
      }
      return null;
    }
  };
})();
