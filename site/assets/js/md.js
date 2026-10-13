/* Follow the Question: inline markdown. Owner: E2.
   Everything is HTML-escaped first, then a small set of rules is applied to the escaped text.
   Output is safe to assign with innerHTML. Supported: **bold**, *italic*, `code`, ==highlight==,
   [text](https://url), [[r3]] citation badges, blank line = paragraph break. */
(function () {
  'use strict';
  var G = (window.Guide = window.Guide || {});

  var OPEN = '\uE000';
  var CLOSE = '\uE001';
  var PRIVATE_RE = /[\uE000\uE001]/g;
  var RESTORE_RE = /\uE000(\d+)\uE001/g;
  var HTTP_RE = /^https?:\/\/[^\s<>"'`]+$/i;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* Accepts only absolute http and https URLs. Takes a raw (unescaped) URL, returns it or ''. */
  function safeUrl(url) {
    var u = String(url == null ? '' : url).trim();
    return HTTP_RE.test(u) ? u : '';
  }

  function citeHtml(id, ctx) {
    var ref = ctx && ctx.refs && ctx.refs[id];
    var label = esc(/^tr\d+$/.test(id) ? 'T' + id.slice(2) : (String(id).match(/\d+/) || [id])[0]);
    var url = ref ? safeUrl(ref.url) : '';
    if (ref && url) {
      var title = ref.title ? esc(ref.title) : 'Reference ' + label;
      return '<a class="g-cite" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer" title="' + title +
        '" aria-label="Reference ' + label + ': ' + title + ' (opens in a new tab)">' + label + '</a>';
    }
    return '<span class="g-cite g-cite--missing" title="Reference ' + label + '">' + label + '</span>';
  }

  function emphasis(s) {
    return s
      .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
      .replace(/==(?=\S)([\s\S]*?\S)==/g, '<mark>$1</mark>')
      .replace(/(^|[^*])\*(?=[^\s*])([^*]*?[^\s*])\*(?!\*)/g, '$1<em>$2</em>');
  }

  function inline(str, ctx) {
    var s = esc(String(str == null ? '' : str).replace(PRIVATE_RE, ''));
    var stash = [];
    function hold(html) { stash.push(html); return OPEN + (stash.length - 1) + CLOSE; }

    s = s.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, function (m, ticks, body) {
      return hold('<code>' + body + '</code>');
    });
    s = s.replace(/\[\[([A-Za-z][\w-]*)\]\]/g, function (m, id) { return hold(citeHtml(id, ctx)); });
    s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/(?:[^\s()]|\([^\s()]*\))+)\)/gi, function (m, text, url) {
      var link = '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + emphasis(text) + '</a>';
      return hold(link);
    });
    s = emphasis(s);

    for (var depth = 0; depth < 6 && s.indexOf(OPEN) !== -1; depth++) {
      s = s.replace(RESTORE_RE, function (m, i) { return stash[+i] || ''; });
    }
    return s.replace(PRIVATE_RE, '');
  }

  function block(str, ctx) {
    var parts = String(str == null ? '' : str).replace(/\r\n?/g, '\n').split(/\n{2,}/);
    var out = [];
    parts.forEach(function (part) {
      var t = part.trim();
      if (!t) return;
      out.push('<p>' + inline(t, ctx).replace(/\n/g, '<br>') + '</p>');
    });
    return out.join('');
  }

  function text(str) {
    return String(str == null ? '' : str)
      .replace(/\[\[[^\]]+\]\]/g, '')
      .replace(/\[([^\]\n]+)\]\((?:[^\s()]|\([^\s()]*\))+\)/g, '$1')
      .replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, '$2')
      .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '$1')
      .replace(/==(?=\S)([\s\S]*?\S)==/g, '$1')
      .replace(/(^|[^*])\*(?=[^\s*])([^*]*?[^\s*])\*(?!\*)/g, '$1$2')
      .replace(/\s+/g, ' ')
      .trim();
  }

  G.md = { inline: inline, block: block, text: text, esc: esc, safeUrl: safeUrl };

  /* ---------- Shared UI helpers for the E2 modules (render, dials, quiz, flashcards, defend, diagrams) ---------- */
  var GLYPH = {
    check: '\u2713', cross: '\u2715', info: 'i', warn: '!', bulb: '\u2605', flag: '\u2691', sparkles: '\u2726',
    target: '\u25CE', user: '\u263A', quote: '\u201C', 'chevron-right': '\u203A', 'chevron-down': '\u2304',
    refresh: '\u21BB', flip: '\u21C4', copy: '\u29C9', link: '#', eye: '\u25C9', play: '\u25B6', 'arrow-right': '\u2192',
    'arrow-left': '\u2190', external: '\u2197', close: '\u2715', clock: '\u25F7', trophy: '\u2605', shuffle: '\u21C6',
    flask: '\u2697', layers: '\u2261', lock: '\u25A3', shield: '\u25C6', star: '\u2605', map: '\u25A4', list: '\u2630', bookmark: '\u2606', 'bookmark-fill': '\u2605', print: '\u2399'
  };

  var ui = {
    GLYPH: GLYPH,
    icon: function (name, size) {
      var span = document.createElement('span');
      span.className = 'g-ic g-ic--' + name;
      span.setAttribute('aria-hidden', 'true');
      var svg = G.icons && G.icons.svg ? G.icons.svg(name, { size: size || 18 }) : '';
      if (svg) span.innerHTML = svg; else span.textContent = GLYPH[name] || '';
      return span;
    },
    /* Fills node with trusted markdown output. mode 'inline' or 'block'. */
    setMd: function (node, str, ctx, mode) {
      node.innerHTML = mode === 'inline' ? inline(str, ctx) : block(str, ctx);
      return node;
    },
    mdEl: function (tag, cls, str, ctx, mode) {
      var n = document.createElement(tag);
      if (cls) n.className = cls;
      return ui.setMd(n, str, ctx, mode || 'block');
    },
    chip: function (label, tone, iconName) {
      var c = document.createElement('span');
      c.className = 'g-chip' + (tone ? ' g-chip--' + tone : '');
      if (iconName) c.appendChild(ui.icon(iconName, 14));
      c.appendChild(document.createTextNode(label));
      return c;
    },
    /* Button with optional leading icon. opts: {cls, icon, label, onClick, attrs} */
    button: function (opts) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'g-btn ' + (opts.cls || '');
      if (opts.icon) b.appendChild(ui.icon(opts.icon, opts.iconSize || 18));
      var t = document.createElement('span');
      t.className = 'g-btn__label';
      t.textContent = opts.label || '';
      b.appendChild(t);
      if (opts.attrs) Object.keys(opts.attrs).forEach(function (k) { b.setAttribute(k, opts.attrs[k]); });
      if (opts.onClick) b.addEventListener('click', opts.onClick);
      return b;
    },
    setBtnLabel: function (b, label) {
      var t = b.querySelector('.g-btn__label');
      if (t) t.textContent = label; else b.textContent = label;
    },
    facilitator: function () {
      var st = G.store && G.store.get ? G.store.get() : null;
      return !!(st && st.settings && st.settings.facilitator);
    },
    reducedMotion: function () {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    },
    /* Bus subscription that removes itself after root has been attached and then removed. */
    subscribe: function (root, evt, fn) {
      var seen = false;
      var off = null;
      if (!G.bus) return function () {};
      off = G.bus.on(evt, function (data) {
        if (root.isConnected) seen = true;
        else if (seen) { if (off) off(); return; }
        fn(data);
      });
      return function () { if (off) off(); };
    },
    /* Polite screen reader announcement through one shared live region. */
    announce: function (msg) {
      var live = document.getElementById('g-announcer');
      if (!live) {
        live = document.createElement('div');
        live.id = 'g-announcer';
        live.className = 'sr-only';
        live.setAttribute('role', 'status');
        live.setAttribute('aria-live', 'polite');
        document.body.appendChild(live);
      }
      live.textContent = '';
      window.setTimeout(function () { live.textContent = msg; }, 40);
    },
    copy: function (str) {
      function legacy() {
        var ta = document.createElement('textarea');
        ta.value = str;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
        document.body.appendChild(ta);
        ta.select();
        var ok = false;
        try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        ta.remove();
        return ok ? Promise.resolve() : Promise.reject(new Error('copy failed'));
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(str).catch(legacy);
      }
      return legacy();
    },
    storeCall: function (method) {
      var args = Array.prototype.slice.call(arguments, 1);
      try {
        if (G.store && typeof G.store[method] === 'function') return G.store[method].apply(G.store, args);
      } catch (e) { console.error('[store.' + method + ']', e); }
      return undefined;
    },
    debounce: function (fn, ms) {
      var t = null;
      var d = function () { var a = arguments; clearTimeout(t); t = setTimeout(function () { fn.apply(null, a); }, ms); };
      d.flush = function () { if (t) { clearTimeout(t); t = null; fn(); } };
      return d;
    },
    uid: (function () { var n = 0; return function (p) { n += 1; return (p || 'g') + '-' + n; }; })()
  };
  G.kit = ui;
})();
