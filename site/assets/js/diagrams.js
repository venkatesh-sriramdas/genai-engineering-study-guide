/* Follow the Question: Mermaid diagrams. Owner: E2.
   Lazy loads assets/vendor/mermaid.min.js on the first diagram, themes it from the CSS tokens,
   re-renders on 'theme:change', and falls back to the source plus alt text if rendering fails.
   Card states are exposed as [data-state="loading|ready|error"] on .g-diagram. */
(function () {
  'use strict';
  var G = (window.Guide = window.Guide || {});
  var ui = G.kit;

  var MERMAID_SRC = 'assets/vendor/mermaid.min.js';
  var loadPromise = null;
  var instances = [];
  var seq = 0;

  /* ---------- colour helpers (Mermaid needs concrete colours, not var() or color-mix()) ---------- */
  function parseColor(s) {
    s = String(s || '').trim();
    var m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (m) {
      var h = m[1];
      if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
    m = s.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
    return m ? [+m[1], +m[2], +m[3]] : null;
  }
  function toHex(rgb) {
    return '#' + rgb.map(function (c) { return ('0' + Math.max(0, Math.min(255, Math.round(c))).toString(16)).slice(-2); }).join('');
  }
  /* weight is the share of colour a */
  function mix(a, b, weight) {
    var x = parseColor(a), y = parseColor(b);
    if (!x || !y) return a;
    return toHex([0, 1, 2].map(function (i) { return x[i] * weight + y[i] * (1 - weight); }));
  }
  function luminance(c) {
    var rgb = parseColor(c) || [255, 255, 255];
    var l = rgb.map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
  }

  function readTokens(scopeEl) {
    var cs = window.getComputedStyle(scopeEl && scopeEl.isConnected ? scopeEl : document.documentElement);
    function v(name, fallback) {
      var raw = cs.getPropertyValue(name).trim();
      return parseColor(raw) ? toHex(parseColor(raw)) : fallback;
    }
    return {
      bg: v('--bg', '#f5f6fb'), surface: v('--surface', '#ffffff'), surface2: v('--surface-2', '#eef0f8'),
      surface3: v('--surface-3', '#e4e8f4'), border: v('--border', '#d9deec'), borderStrong: v('--border-strong', '#b9c1da'),
      text: v('--text', '#141a2e'), text2: v('--text-2', '#444d6b'), muted: v('--muted', '#646c8c'),
      accent: v('--accent', '#4f46e5'), onAccent: v('--on-accent', '#ffffff'),
      ok: v('--ok', '#15803d'), warn: v('--warn', '#b45309'), bad: v('--bad', '#b91c1c'), info: v('--info', '#1d4ed8'),
      font: cs.getPropertyValue('--font-sans').trim() || 'ui-sans-serif, system-ui, sans-serif'
    };
  }

  function buildConfig(scopeEl) {
    var t = readTokens(scopeEl);
    var dark = luminance(t.surface) < 0.4;
    var nodeFill = mix(t.accent, t.surface, dark ? 0.24 : 0.12);
    var nodeBorder = mix(t.accent, t.borderStrong, 0.55);
    var noteFill = mix(t.warn, t.surface, dark ? 0.22 : 0.14);
    return {
      startOnLoad: false,
      theme: 'base',
      securityLevel: 'strict',
      suppressErrorRendering: true,
      logLevel: 'fatal',
      fontFamily: t.font,
      themeVariables: {
        darkMode: dark,
        background: t.surface,
        fontFamily: t.font,
        fontSize: '15px',
        primaryColor: nodeFill,
        primaryTextColor: t.text,
        primaryBorderColor: nodeBorder,
        secondaryColor: t.surface2,
        secondaryTextColor: t.text,
        secondaryBorderColor: t.borderStrong,
        tertiaryColor: t.surface2,
        tertiaryTextColor: t.text,
        tertiaryBorderColor: t.border,
        lineColor: t.text2,
        textColor: t.text,
        mainBkg: nodeFill,
        nodeBorder: nodeBorder,
        nodeTextColor: t.text,
        clusterBkg: t.surface2,
        clusterBorder: t.borderStrong,
        defaultLinkColor: t.text2,
        titleColor: t.text,
        edgeLabelBackground: t.surface,
        noteBkgColor: noteFill,
        noteTextColor: t.text,
        noteBorderColor: t.warn,
        actorBkg: nodeFill,
        actorBorder: nodeBorder,
        actorTextColor: t.text,
        actorLineColor: t.muted,
        signalColor: t.text2,
        signalTextColor: t.text,
        labelBoxBkgColor: t.surface2,
        labelBoxBorderColor: t.borderStrong,
        labelTextColor: t.text,
        loopTextColor: t.text,
        activationBkgColor: t.surface3,
        activationBorderColor: t.borderStrong,
        sequenceNumberColor: t.onAccent,
        stateBkg: nodeFill,
        stateLabelColor: t.text,
        labelColor: t.text,
        altBackground: t.surface2,
        compositeBackground: t.surface2,
        compositeTitleBackground: t.surface3,
        compositeBorder: t.borderStrong,
        transitionColor: t.text2,
        transitionLabelColor: t.text,
        specialStateColor: t.text2,
        innerEndBackground: nodeBorder
      },
      flowchart: { htmlLabels: true, curve: 'basis', useMaxWidth: true, padding: 14, nodeSpacing: 42, rankSpacing: 46 },
      sequence: { useMaxWidth: true, mirrorActors: false, actorMargin: 48, boxMargin: 8, noteMargin: 10, messageMargin: 34 },
      state: { useMaxWidth: true }
    };
  }

  /* ---------- loading ---------- */
  function loadMermaid() {
    if (window.mermaid && typeof window.mermaid.render === 'function') return Promise.resolve(window.mermaid);
    if (!loadPromise) {
      loadPromise = G.loadScript(MERMAID_SRC).then(function () {
        if (!window.mermaid || typeof window.mermaid.render !== 'function') throw new Error('Mermaid did not initialise');
        return window.mermaid;
      }).catch(function (err) { loadPromise = null; throw err; });
    }
    return loadPromise;
  }

  /* ---------- rendering ---------- */
  function setState(inst, state) {
    inst.card.dataset.state = state;
    inst.card.setAttribute('aria-busy', state === 'loading' ? 'true' : 'false');
  }

  function showFallback(inst, err) {
    var spec = inst.spec;
    G.clear(inst.stage);
    inst.stage.removeAttribute('role');
    inst.stage.removeAttribute('aria-label');
    var box = G.el('div', { class: 'g-diagram__fallback' },
      G.el('p', { class: 'g-diagram__fallback-msg' }, ui.icon('warn', 18), 'This diagram could not be drawn. Here is what it shows.'),
      spec.alt ? G.el('p', { class: 'g-diagram__alt' }, spec.alt) : null,
      G.el('pre', { class: 'g-diagram__source', tabindex: '0' }, G.el('code', null, String(spec.src || '')))
    );
    inst.stage.appendChild(box);
    inst.tools.hidden = true;
    setState(inst, 'error');
    if (err) console.warn('[diagrams] ' + (spec.id || 'diagram') + ':', err && err.message ? err.message : err);
  }

  function renderInst(inst) {
    var token = ++inst.token;
    if (!inst.stage.firstChild) setState(inst, 'loading');
    return loadMermaid().then(function (mm) {
      if (token !== inst.token) return null;
      mm.initialize(buildConfig(inst.card));
      return mm.render('g-mmd-' + (++seq), String(inst.spec.src || ''));
    }).then(function (res) {
      if (!res || token !== inst.token) return;
      inst.stage.innerHTML = res.svg;
      var svg = inst.stage.querySelector('svg');
      if (!svg) throw new Error('Mermaid returned no SVG');
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', inst.spec.alt || inst.spec.title || 'Diagram');
      svg.removeAttribute('aria-roledescription');
      svg.setAttribute('focusable', 'false');
      var vb = svg.viewBox && svg.viewBox.baseVal;
      inst.natural = vb && vb.width ? vb.width : svg.getBoundingClientRect().width || 600;
      svg.style.minWidth = Math.min(inst.natural, 520) + 'px';
      inst.stage.removeAttribute('role');
      inst.stage.removeAttribute('aria-label');
      inst.tools.hidden = false;
      if (typeof res.bindFunctions === 'function') res.bindFunctions(inst.stage);
      setState(inst, 'ready');
    }).catch(function (err) {
      if (token !== inst.token) return;
      showFallback(inst, err);
    });
  }

  function rerenderAll() {
    instances = instances.filter(function (inst) {
      if (inst.card.isConnected) inst.seen = true;
      return inst.card.isConnected || !inst.seen;
    });
    instances.forEach(function (inst) { if (inst.card.dataset.state !== 'error') renderInst(inst); });
  }

  /* ---------- zoom dialog ---------- */
  function openZoom(inst) {
    var svg = inst.stage.querySelector('svg');
    if (!svg) return;
    var opener = document.activeElement;
    var clone = svg.cloneNode(true);
    clone.style.minWidth = '0';
    clone.style.maxWidth = 'none';
    clone.removeAttribute('width');
    clone.removeAttribute('height');
    var scroller = G.el('div', { class: 'g-zoom__scroll', tabindex: '0', role: 'group', 'aria-label': 'Diagram, scrollable' }, clone);
    var natural = inst.natural || 600;
    var zoom = 1;
    var pct = G.el('span', { class: 'g-zoom__pct', 'aria-live': 'polite' }, '100%');

    function apply() {
      clone.style.width = Math.round(natural * zoom) + 'px';
      clone.style.height = 'auto';
      pct.textContent = Math.round(zoom * 100) + '%';
    }
    function fit() {
      var avail = Math.max(240, scroller.clientWidth - 32);
      zoom = Math.max(0.4, Math.min(2.4, avail / natural));
      apply();
    }
    function step(f) { zoom = Math.max(0.3, Math.min(5, zoom * f)); apply(); }

    var close = ui.button({ cls: 'g-btn--ghost g-btn--sm', icon: 'close', label: 'Close', attrs: { 'aria-label': 'Close enlarged diagram' } });
    var zoomOut = ui.button({ cls: 'g-btn--ghost g-btn--sm', label: '\u2212', attrs: { 'aria-label': 'Zoom out' }, onClick: function () { step(1 / 1.25); } });
    var zoomIn = ui.button({ cls: 'g-btn--ghost g-btn--sm', label: '+', attrs: { 'aria-label': 'Zoom in' }, onClick: function () { step(1.25); } });
    var fitBtn = ui.button({ cls: 'g-btn--ghost g-btn--sm', label: 'Fit', attrs: { 'aria-label': 'Fit to width' }, onClick: fit });
    var titleId = ui.uid('g-zoom-title');
    var dialog = G.el('div', { class: 'g-zoom__dialog g-scope', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
      G.el('div', { class: 'g-zoom__bar' },
        G.el('div', { class: 'g-zoom__title', id: titleId }, inst.spec.title || 'Diagram'),
        G.el('div', { class: 'g-zoom__tools' }, zoomOut, pct, zoomIn, fitBtn, close)),
      scroller,
      G.el('p', { class: 'g-zoom__hint' }, 'Drag to pan. Keys: plus, minus, 0 to fit, Escape to close.'));
    var overlay = G.el('div', { class: 'g-zoom' }, dialog);
    var world = inst.card.closest('[data-world]');
    if (world) overlay.dataset.world = world.dataset.world;

    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); shut(); return; }
      if (e.key === '+' || e.key === '=') { e.preventDefault(); step(1.25); return; }
      if (e.key === '-' || e.key === '_') { e.preventDefault(); step(1 / 1.25); return; }
      if (e.key === '0') { e.preventDefault(); fit(); return; }
      if (e.key === 'Tab') {
        var f = Array.prototype.slice.call(dialog.querySelectorAll('button, [tabindex="0"]'));
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    function shut() {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      document.documentElement.classList.remove('g-no-scroll');
      if (opener && opener.focus) opener.focus();
    }
    close.addEventListener('click', shut);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) shut(); });

    var drag = null;
    scroller.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY, l: scroller.scrollLeft, t: scroller.scrollTop };
      scroller.setPointerCapture(e.pointerId);
      scroller.classList.add('is-dragging');
    });
    scroller.addEventListener('pointermove', function (e) {
      if (!drag) return;
      scroller.scrollLeft = drag.l - (e.clientX - drag.x);
      scroller.scrollTop = drag.t - (e.clientY - drag.y);
    });
    function endDrag() { drag = null; scroller.classList.remove('is-dragging'); }
    scroller.addEventListener('pointerup', endDrag);
    scroller.addEventListener('pointercancel', endDrag);

    document.body.appendChild(overlay);
    document.documentElement.classList.add('g-no-scroll');
    document.addEventListener('keydown', onKey, true);
    fit();
    close.focus();
  }

  /* ---------- public render ---------- */
  function render(container, spec) {
    spec = spec || {};
    var titleText = spec.title || 'Diagram';
    var stage = G.el('div', { class: 'g-diagram__stage', role: 'img', 'aria-label': spec.alt || titleText },
      G.el('div', { class: 'g-skeleton g-diagram__skeleton', 'aria-hidden': 'true' },
        G.el('span'), G.el('span'), G.el('span')));
    var expand = ui.button({
      cls: 'g-btn--ghost g-btn--sm g-btn--icon', icon: 'search', label: 'Enlarge',
      attrs: { 'aria-label': 'Enlarge diagram: ' + titleText }
    });
    var tools = G.el('div', { class: 'g-diagram__tools', hidden: true }, expand);
    var card = G.el('figure', { class: 'g-diagram g-scope', 'data-state': 'loading', 'aria-busy': 'true' },
      G.el('div', { class: 'g-diagram__head' },
        G.el('div', { class: 'g-diagram__title' }, titleText),
        tools),
      stage);
    if (spec.id) card.id = 'diagram-' + spec.id;
    if (spec.caption) {
      var cap = G.el('figcaption', { class: 'g-diagram__caption' });
      ui.setMd(cap, spec.caption, null, 'inline');
      card.appendChild(cap);
    }
    var inst = { card: card, stage: stage, tools: tools, spec: spec, token: 0, natural: 600, seen: false };
    expand.addEventListener('click', function () { openZoom(inst); });
    instances.push(inst);
    if (container) container.appendChild(card);
    inst.ready = renderInst(inst);
    return { el: card, ready: inst.ready };
  }

  G.bus.on('theme:change', function () {
    window.requestAnimationFrame(rerenderAll);
  });
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var onScheme = function () {
      if (!document.documentElement.getAttribute('data-theme')) window.requestAnimationFrame(rerenderAll);
    };
    if (mq.addEventListener) mq.addEventListener('change', onScheme);
    else if (mq.addListener) mq.addListener(onScheme);
  }

  G.diagrams = { render: render, load: loadMermaid, rerenderAll: rerenderAll };
})();
