/* Follow the Question: app shell (top bar, sidebar, right rail, footer, banners, toasts, settings) and Guide.ui helpers.
   Owner: E1. Guide.ui is shared by every view. It is only used at render time, so load order does not matter. */
(function () {
  'use strict';

  const G = window.Guide;
  const el = G.el;
  const $ = (id) => document.getElementById(id);
  const html = document.documentElement;

  /* ================================================================
     Guide.ui: small shared helpers
     ================================================================ */
  const FALLBACK_ICONS = {
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    'chevron-right': '<path d="m9 6 6 6-6 6"/>',
    'chevron-left': '<path d="m15 6-6 6 6 6"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    check: '<path d="m5 12 5 5L20 7"/>',
    cross: '<path d="M6 6l12 12M18 6 6 18"/>',
    bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>',
    'bookmark-fill': '<path d="M6 3h12v18l-6-4-6 4z" fill="currentColor"/>',
    'arrow-right': '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    'arrow-left': '<path d="M19 12H5m6-6-6 6 6 6"/>',
    download: '<path d="M12 3v12m0 0-4-4m4 4 4-4M4 21h16"/>',
    upload: '<path d="M12 15V3m0 0L8 7m4-4 4 4M4 21h16"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
    flame: '<path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4v2a3 3 0 0 0 4 3M16 6h4v2a3 3 0 0 1-4 3M12 13v4m-4 4h8"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'
  };

  function iconSvg(name, size) {
    let s = '';
    try { if (G.icons && G.icons.svg) s = G.icons.svg(name, { size: size || 20 }) || ''; } catch (e) { s = ''; }
    if (!s && FALLBACK_ICONS[name]) {
      s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="' + (size || 20) + '" height="' + (size || 20) +
        '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + FALLBACK_ICONS[name] + '</svg>';
    }
    return s;
  }
  function icon(name, size, cls) {
    const span = el('span', { class: 'ui-icon' + (cls ? ' ' + cls : ''), 'aria-hidden': 'true' });
    if (size) span.style.setProperty('--s', size + 'px');
    span.innerHTML = iconSvg(name, size || 20);
    return span;
  }
  function worldIcon(id, size) {
    let s = '';
    try { if (G.icons && G.icons.world) s = G.icons.world(id, { size: size || 24 }) || ''; } catch (e) { s = ''; }
    const span = el('span', { class: 'ui-icon', 'aria-hidden': 'true' });
    if (size) span.style.setProperty('--s', size + 'px');
    if (s) span.innerHTML = s;
    else span.appendChild(el('span', { class: 'ui-icon__txt' }, String(id).replace(/^w/, '')));
    return span;
  }
  function regionIcon(id, size) {
    let s = '';
    try { if (G.icons && G.icons.region) s = G.icons.region(id, { size: size || 22 }) || ''; } catch (e) { s = ''; }
    const span = el('span', { class: 'ui-icon', 'aria-hidden': 'true' });
    if (size) span.style.setProperty('--s', size + 'px');
    span.innerHTML = s || iconSvg('map', size || 22);
    return span;
  }

  const KINDS = {
    problem: { label: 'Practice problem', icon: 'target', cls: 'info' },
    concept: { label: 'Concept', icon: 'bulb', cls: 'accent' },
    lab: { label: 'Lab', icon: 'flask', cls: 'preview' },
    boss: { label: 'Boss round', icon: 'trophy', cls: 'gold' }
  };
  const REF_STATUS = {
    ga: { label: 'GA', cls: 'ok' },
    preview: { label: 'Preview', cls: 'preview' },
    deprecated: { label: 'Deprecated', cls: 'bad' },
    'n/a': { label: 'n/a', cls: '' }
  };
  const REF_TYPES = {
    spec: { label: 'Spec', icon: 'shield' },
    doc: { label: 'Docs', icon: 'book' },
    paper: { label: 'Paper', icon: 'quote' },
    blog: { label: 'Blog', icon: 'list' },
    course: { label: 'Course', icon: 'cards' },
    video: { label: 'Video', icon: 'play' },
    repo: { label: 'Repo', icon: 'layers' },
    tool: { label: 'Tool', icon: 'flask' }
  };

  function plainText(s) {
    return String(s == null ? '' : s)
      .replace(/\[\[(r\d+)\]\]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_`=]/g, '').replace(/\s+/g, ' ').trim();
  }
  function mdInline(s, ctx) {
    try { if (G.md && G.md.inline) return G.md.inline(String(s == null ? '' : s), ctx || {}); } catch (e) { /* fall through */ }
    return G.esc(plainText(s));
  }
  function mdBlock(s, ctx) {
    try { if (G.md && G.md.block) return G.md.block(String(s == null ? '' : s), ctx || {}); } catch (e) { /* fall through */ }
    return String(s == null ? '' : s).split(/\n\s*\n/).map((p) => '<p>' + G.esc(plainText(p)) + '</p>').join('');
  }

  function chip(text, kind, opts) {
    opts = opts || {};
    const c = el('span', { class: 'ui-chip' + (kind ? ' ui-chip--' + kind : '') + (opts.cls ? ' ' + opts.cls : ''), title: opts.title });
    if (opts.icon) c.appendChild(icon(opts.icon, 14));
    c.appendChild(document.createTextNode(text));
    return c;
  }
  function kindBadge(kind) {
    const k = KINDS[kind] || KINDS.problem;
    return chip(k.label, k.cls, { icon: k.icon });
  }
  function statusChip(status) {
    const s = REF_STATUS[status] || REF_STATUS['n/a'];
    return chip(s.label, s.cls || null);
  }
  function levelStatusChip(status) {
    if (status === 'done') return chip('Done', 'ok', { icon: 'check' });
    if (status === 'started') return chip('In progress', 'warn', { icon: 'play' });
    return chip('New', null);
  }
  function topicStatusChip(status) {
    if (status === 'reviewed') return chip('Reviewed', 'ok', { icon: 'check' });
    if (status === 'seen') return chip('Opened', 'warn', { icon: 'eye' });
    return chip('Not reviewed', null);
  }
  function difficultyChip(d) {
    return d === 'advanced' ? chip('Advanced', 'preview', { icon: 'sparkles' }) : chip('Core', 'info', { icon: 'star' });
  }

  function ring(o) {
    const size = o.size || 48, stroke = o.stroke || 5;
    const r = (size - stroke) / 2, c = 2 * Math.PI * r;
    const pct = Math.max(0, Math.min(100, o.pct || 0));
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'ui-ring');
    svg.setAttribute('width', size); svg.setAttribute('height', size);
    svg.setAttribute('viewBox', '0 0 ' + size + ' ' + size);
    if (o.label) { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', o.label); } else svg.setAttribute('aria-hidden', 'true');
    const mk = (cls) => {
      const ci = document.createElementNS(NS, 'circle');
      ci.setAttribute('class', cls); ci.setAttribute('cx', size / 2); ci.setAttribute('cy', size / 2); ci.setAttribute('r', r);
      ci.setAttribute('stroke-width', stroke);
      return ci;
    };
    const fill = mk('ring-fill');
    fill.setAttribute('stroke-dasharray', c.toFixed(2));
    fill.setAttribute('stroke-dashoffset', (c * (1 - pct / 100)).toFixed(2));
    fill.setAttribute('transform', 'rotate(-90 ' + size / 2 + ' ' + size / 2 + ')');
    if (o.color) fill.style.stroke = o.color;
    svg.appendChild(mk('ring-track')); svg.appendChild(fill);
    if (o.text !== undefined) {
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('x', size / 2); t.setAttribute('y', size / 2); t.setAttribute('text-anchor', 'middle'); t.setAttribute('dominant-baseline', 'central');
      t.setAttribute('font-size', o.fontSize || Math.round(size * 0.26));
      t.textContent = o.text;
      svg.appendChild(t);
    }
    return svg;
  }
  function bar(pct, o) {
    o = o || {};
    const b = el('div', { class: 'ui-bar' + (o.cls ? ' ' + o.cls : ''), role: o.label ? 'progressbar' : null, 'aria-label': o.label, 'aria-valuemin': o.label ? 0 : null, 'aria-valuemax': o.label ? 100 : null, 'aria-valuenow': o.label ? Math.round(pct) : null });
    const f = el('span');
    f.style.setProperty('--p', Math.max(0, Math.min(100, pct)));
    b.appendChild(f);
    if (o.color) b.style.setProperty('--bar', o.color);
    return b;
  }
  function setBar(b, pct) {
    const f = b.firstElementChild;
    if (f) f.style.setProperty('--p', Math.max(0, Math.min(100, pct)));
    if (b.hasAttribute('aria-valuenow')) b.setAttribute('aria-valuenow', Math.round(pct));
  }

  function btn(o) {
    const tag = o.href ? 'a' : 'button';
    const cls = 'ui-btn' + (o.kind ? ' ui-btn--' + String(o.kind).split(' ').join(' ui-btn--') : '') + (o.cls ? ' ' + o.cls : '');
    const a = el(tag, { class: cls, href: o.href, type: o.href ? null : (o.type || 'button'), title: o.title, 'aria-label': o.ariaLabel, id: o.id, on: o.onClick ? { click: o.onClick } : null });
    if (o.icon) a.appendChild(icon(o.icon, o.iconSize || 18));
    if (o.text) a.appendChild(document.createTextNode(o.text));
    return a;
  }

  function emptyState(o) {
    const wrap = el('div', { class: 'ui-empty' + (o.error ? ' ui-empty--error' : '') });
    wrap.appendChild(el('div', { class: 'ui-empty__icon' }, icon(o.icon || 'info', 32)));
    wrap.appendChild(el('h2', null, o.title));
    if (o.text) wrap.appendChild(el('p', null, o.text));
    if (o.actions && o.actions.length) wrap.appendChild(el('div', { class: 'cluster', style: { justifyContent: 'center' } }, o.actions));
    return wrap;
  }

  function dialog(o) {
    const root = $('dialog-root') || document.body;
    const tid = G.uid('dlg');
    const d = el('dialog', { class: 'ui-dialog' + (o.wide ? ' ui-dialog--wide' : '') + (o.cls ? ' ' + o.cls : ''), 'aria-labelledby': tid });
    const closeBtn = el('button', { class: 'ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm', type: 'button', 'aria-label': 'Close dialog', on: { click: () => api.close('dismiss') } }, icon('close', 18));
    d.appendChild(el('div', { class: 'ui-dialog__head' }, el('h2', { id: tid }, o.title), closeBtn));
    const body = el('div', { class: 'ui-dialog__body' }, o.body);
    d.appendChild(body);
    let foot = null;
    if (o.footer && o.footer.length) { foot = el('div', { class: 'ui-dialog__foot' }, o.footer); d.appendChild(foot); }
    const api = {
      el: d, body: body, foot: foot,
      close: (v) => { try { d.close(v); } catch (e) { d.removeAttribute('open'); } },
      open: () => { root.appendChild(d); if (d.showModal) d.showModal(); else d.setAttribute('open', ''); }
    };
    d.addEventListener('click', (e) => { if (e.target === d) api.close('dismiss'); });
    d.addEventListener('close', () => { if (o.onClose) o.onClose(d.returnValue); setTimeout(() => d.remove(), 0); });
    return api;
  }

  function confirmDialog(o) {
    return new Promise((resolve) => {
      if (!document.createElement('dialog').showModal) { resolve(window.confirm(o.message || o.title)); return; }
      const ok = btn({ text: o.confirmText || 'Confirm', kind: o.danger ? 'danger-solid' : 'primary', onClick: () => dlg.close('ok') });
      const cancel = btn({ text: o.cancelText || 'Cancel', onClick: () => dlg.close('cancel') });
      const body = el('div', { class: 'stack', style: { '--gap': '0.75rem' } }, el('p', { style: { margin: 0 } }, o.message));
      if (o.extra) body.appendChild(o.extra);
      const dlg = dialog({ title: o.title, body: body, footer: [cancel, ok], onClose: (v) => resolve(v === 'ok') });
      dlg.open();
      cancel.focus();
    });
  }

  function fallbackCopy(text) {
    const ta = el('textarea', { 'aria-hidden': 'true', tabindex: '-1', style: { position: 'fixed', opacity: '0', top: '0', left: '0' } });
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }
  function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).then(() => true, () => fallbackCopy(text));
      }
    } catch (e) { /* fall through */ }
    return Promise.resolve(fallbackCopy(text));
  }

  function fmtNum(n) { try { return Number(n).toLocaleString(); } catch (e) { return String(n); } }
  function fmtDate(ts) {
    try { return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); } catch (e) { return ''; }
  }
  function fmtAgo(ts) {
    const d = Date.now() - ts;
    if (d < 60000) return 'just now';
    if (d < 3600000) return Math.floor(d / 60000) + ' min ago';
    if (d < 86400000) return Math.floor(d / 3600000) + ' h ago';
    if (d < 172800000) return 'yesterday';
    if (d < 7 * 86400000) return Math.floor(d / 86400000) + ' days ago';
    return fmtDate(ts);
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }

  /* One reference as a list item. opts.world = show the world as a chip. */
  function refItem(ref, opts) {
    opts = opts || {};
    const type = REF_TYPES[ref.type] || { label: ref.type || 'Link', icon: 'link' };
    const safeUrl = /^https?:\/\//i.test(String(ref.url || ''));
    const a = el(safeUrl ? 'a' : 'span', { class: 'ref__title', href: safeUrl ? ref.url : null, target: safeUrl ? '_blank' : null, rel: safeUrl ? 'noopener noreferrer' : null }, ref.title, safeUrl ? icon('external', 14) : null);
    const w = opts.world && ref.w ? worldMeta(ref.w) : null;
    return el('li', { class: 'ref' },
      el('div', { class: 'ref__main' },
        a,
        el('div', { class: 'ref__meta' },
          chip(type.label, null, { icon: type.icon }),
          statusChip(ref.status),
          w ? el('a', { class: 'ref__world', href: '#/w/' + w.id, 'data-world': w.id }, el('span', { class: 'ui-dot' }), 'Chapter ' + worldNo(w.id)) : null,
          ref.publisher ? el('span', { class: 'ref__pub' }, ref.publisher) : null,
          ref.verified ? el('span', { class: 'ref__ver' }, 'Checked ' + ref.verified) : null),
        ref.note ? el('p', { class: 'ref__note' }, ref.note) : null));
  }

  /* ---------- journey helpers ---------- */
  function manifestWorlds() { return (G.manifest && G.manifest.worlds ? G.manifest.worlds.slice() : []).sort((a, b) => a.order - b.order); }
  function worldMeta(id) { return manifestWorlds().filter((w) => w.id === id)[0] || null; }
  function regionMeta(id) { return (G.manifest && G.manifest.regions || []).filter((r) => r.id === id)[0] || null; }
  function flatLevels() {
    const out = [];
    manifestWorlds().forEach((w) => w.levels.slice().sort((a, b) => a.order - b.order).forEach((l) => out.push({ world: w, level: l })));
    return out;
  }
  function worldNo(id) { return String(id).replace(/^w/, ''); }
  function levelHref(w, l, s) { return '#/w/' + w + '/' + l + (s ? '?s=' + encodeURIComponent(s) : ''); }
  function worldHref(w) { return '#/w/' + w; }
  function topicHref(w, t, s) { return '#/w/' + w + '/' + t + (s ? '?s=' + encodeURIComponent(s) : ''); }

  /* ---------- topic helpers (manifest only, no content load) ---------- */
  function topicsOf(w) { return (w.topics || []).slice().sort((a, b) => a.order - b.order); }
  function flatTopics() {
    const out = [];
    manifestWorlds().forEach((w) => topicsOf(w).forEach((t) => out.push({ world: w, topic: t })));
    return out;
  }
  function findTopic(topicId) {
    const wid = String(topicId).split('-')[0];
    const w = worldMeta(wid);
    if (!w) return null;
    const t = (w.topics || []).filter((x) => x.id === topicId)[0];
    return t ? { world: w, topic: t } : null;
  }
  /* The topic to resume: most recently opened unreviewed topic, else the first unreviewed topic in curriculum order. */
  function continueTopic() {
    const st = G.store.get();
    const flat = flatTopics();
    let best = null;
    flat.forEach((x) => {
      const r = st.topics && st.topics[x.topic.id];
      if (r && r.status !== 'reviewed' && (!best || r.lastSeen > best.r.lastSeen)) best = { x: x, r: r };
    });
    if (best) return { kind: 'resume', world: best.x.world, topic: best.x.topic };
    const next = flat.filter((x) => G.store.topicStatus(x.topic.id) !== 'reviewed')[0];
    if (!next) return { kind: flat.length ? 'done' : 'none' };
    const any = Object.keys(st.topics || {}).length;
    return { kind: any ? 'next' : 'start', world: next.world, topic: next.topic };
  }
  function topicMark(status) {
    const label = status === 'reviewed' ? 'Reviewed' : status === 'seen' ? 'Opened, not yet reviewed' : 'Not reviewed';
    const m = el('span', { class: 'mark mark--' + (status === 'reviewed' ? 'done' : status === 'seen' ? 'started' : 'new'), role: 'img', 'aria-label': label, title: label });
    if (status === 'reviewed') m.appendChild(icon('check', 12));
    return m;
  }
  function diffDot(d) {
    const label = d === 'advanced' ? 'Advanced' : 'Core';
    return el('span', { class: 'dd dd--' + (d === 'advanced' ? 'advanced' : 'core'), role: 'img', 'aria-label': label, title: label });
  }

  /* The level to resume: the most recently seen unfinished level, else the first unfinished level in journey order. */
  function continueTarget() {
    const st = G.store.get();
    const flat = flatLevels();
    let best = null;
    flat.forEach((x) => {
      const r = st.levels[x.level.id];
      if (r && r.status !== 'done' && (!best || r.lastSeen > best.r.lastSeen)) best = { x: x, r: r };
    });
    if (best) return { kind: 'resume', world: best.x.world, level: best.x.level };
    const next = flat.filter((x) => !st.levels[x.level.id] || st.levels[x.level.id].status !== 'done')[0];
    if (!next) return { kind: flat.length ? 'done' : 'none' };
    return { kind: Object.keys(st.levels).length ? 'next' : 'start', world: next.world, level: next.level };
  }
  function nextRecommended() {
    const st = G.store.get();
    const next = flatLevels().filter((x) => !st.levels[x.level.id] || st.levels[x.level.id].status !== 'done')[0];
    return next || null;
  }

  function statusMark(status) {
    const label = status === 'done' ? 'Done' : status === 'started' ? 'In progress' : 'Not started';
    const m = el('span', { class: 'mark mark--' + status, role: 'img', 'aria-label': label, title: label });
    if (status === 'done') m.appendChild(icon('check', 12));
    return m;
  }

  G.ui = {
    icon: icon, iconSvg: iconSvg, worldIcon: worldIcon, regionIcon: regionIcon,
    KINDS: KINDS, REF_STATUS: REF_STATUS, REF_TYPES: REF_TYPES,
    plainText: plainText, mdInline: mdInline, mdBlock: mdBlock,
    chip: chip, kindBadge: kindBadge, statusChip: statusChip, levelStatusChip: levelStatusChip, topicStatusChip: topicStatusChip, difficultyChip: difficultyChip,
    ring: ring, bar: bar, setBar: setBar, btn: btn, emptyState: emptyState,
    dialog: dialog, confirm: confirmDialog, copy: copyText,
    fmtNum: fmtNum, fmtDate: fmtDate, fmtAgo: fmtAgo, plural: plural, refItem: refItem,
    worlds: manifestWorlds, worldMeta: worldMeta, regionMeta: regionMeta, flatLevels: flatLevels, worldNo: worldNo,
    levelHref: levelHref, worldHref: worldHref, continueTarget: continueTarget, nextRecommended: nextRecommended, statusMark: statusMark,
    topicHref: topicHref, topicsOf: topicsOf, flatTopics: flatTopics, findTopic: findTopic, continueTopic: continueTopic, topicMark: topicMark, diffDot: diffDot
  };

  /* ================================================================
     Shell
     ================================================================ */
  const Shell = (G.shell = {});
  const mqNarrow = window.matchMedia ? window.matchMedia('(max-width: 899.98px)') : { matches: false, addEventListener() {} };
  const mqDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : { matches: false, addEventListener() {} };

  let menuBtn, themeBtn, xpChip, searchBtn, facChip;
  let sidebarRefs = { regions: {}, worlds: {}, ch: {}, tools: {}, overall: null, panels: {}, seg: [], filter: null, status: null, empty: null };
  const openRegions = new Set();
  const openWorlds = new Set();
  const openChapters = new Set();
  let filterText = '';
  let currentRoute = null;
  let drawerOpen = false;
  let lastFocus = null;
  let spy = null;
  let rankSeen = null;

  /* ---------- settings ---------- */
  function resolvedTheme() {
    const pref = G.store.get().settings.theme;
    return pref === 'auto' ? (mqDark.matches ? 'dark' : 'light') : pref;
  }
  function applySettings() {
    const s = G.store.get().settings;
    const theme = resolvedTheme();
    html.setAttribute('data-theme-pref', s.theme);
    if (html.getAttribute('data-theme') !== theme) {
      html.setAttribute('data-theme', theme);
      G.bus.emit('theme:change', { theme: theme });
    }
    html.style.setProperty('--font-scale', String(s.fontScale));
    if (s.facilitator) html.setAttribute('data-facilitator', 'on'); else html.removeAttribute('data-facilitator');
    if (s.sidebarCollapsed) html.setAttribute('data-sidebar', 'collapsed'); else html.removeAttribute('data-sidebar');
    updateThemeButton();
    updateNavButton();
    if (facChip) facChip.hidden = !s.facilitator;
    if (appliedMode !== sidebarMode()) { appliedMode = sidebarMode(); applySidebarMode(); }
  }
  let appliedMode = null;
  function updateThemeButton() {
    if (!themeBtn) return;
    const dark = resolvedTheme() === 'dark';
    themeBtn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    themeBtn.title = dark ? 'Switch to light theme (T)' : 'Switch to dark theme (T)';
    G.clear(themeBtn).appendChild(icon(dark ? 'sun' : 'moon', 20));
  }
  function toggleTheme() { G.store.setSetting('theme', resolvedTheme() === 'dark' ? 'light' : 'dark'); }

  /* ---------- navigation drawer and collapse ---------- */
  function updateNavButton() {
    if (!menuBtn) return;
    const expanded = mqNarrow.matches ? drawerOpen : !G.store.get().settings.sidebarCollapsed;
    menuBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    menuBtn.setAttribute('aria-label', mqNarrow.matches ? (drawerOpen ? 'Close navigation' : 'Open navigation') : (expanded ? 'Collapse navigation' : 'Expand navigation'));
  }
  function focusables(root) {
    return Array.prototype.slice.call(root.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'))
      .filter((n) => n.offsetParent !== null || n === document.activeElement);
  }
  function openDrawer() {
    if (drawerOpen) return;
    drawerOpen = true;
    lastFocus = document.activeElement;
    $('sidebar').classList.add('is-open');
    $('sidebar-scrim').hidden = false;
    html.classList.add('is-locked');
    $('content-col').setAttribute('inert', '');
    const rail = $('rail'); if (rail) rail.setAttribute('inert', '');
    updateNavButton();
    const f = focusables($('sidebar'));
    scrollActiveIntoView();
    const activeLink = $('sidebar').querySelector('[aria-current="page"]');
    if (activeLink && activeLink.offsetParent !== null) activeLink.focus({ preventScroll: true });
    else if (f[0]) f[0].focus();
  }
  function closeDrawer(restore) {
    if (!drawerOpen) return;
    drawerOpen = false;
    $('sidebar').classList.remove('is-open');
    $('sidebar-scrim').hidden = true;
    html.classList.remove('is-locked');
    $('content-col').removeAttribute('inert');
    const rail = $('rail'); if (rail) rail.removeAttribute('inert');
    updateNavButton();
    if (restore !== false && lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function toggleNav() {
    if (mqNarrow.matches) { if (drawerOpen) closeDrawer(); else openDrawer(); }
    else G.store.setSetting('sidebarCollapsed', !G.store.get().settings.sidebarCollapsed);
  }
  function onNarrowChange() { if (!mqNarrow.matches && drawerOpen) closeDrawer(false); updateNavButton(); }

  /* ---------- top bar ---------- */
  function buildTopbar() {
    const top = $('topbar');
    G.clear(top);
    menuBtn = el('button', { class: 'ui-btn ui-btn--ghost ui-btn--icon', id: 'menu-btn', type: 'button', 'aria-controls': 'sidebar', 'aria-expanded': 'true', 'aria-keyshortcuts': '[', on: { click: toggleNav } }, icon('menu', 22));
    let logo = '';
    try { logo = G.icons && G.icons.logo ? G.icons.logo({ size: 30 }) : ''; } catch (e) { logo = ''; }
    const logoEl = el('span', { class: 'brand__logo', 'aria-hidden': 'true' });
    if (logo) logoEl.innerHTML = logo; else logoEl.classList.add('brand__logo--fallback');
    const brand = el('a', { class: 'brand', href: '#/', title: 'Follow the Question home' },
      logoEl,
      el('span', { class: 'brand__txt' }, el('span', { class: 'brand__name' }, 'Follow the Question'), el('span', { class: 'brand__sub' }, 'GenAI field guide')));
    searchBtn = el('button', { class: 'search-trigger', type: 'button', 'aria-label': 'Search the guide', 'aria-keyshortcuts': '/ Control+K Meta+K', on: { click: () => G.search && G.search.open() } },
      icon('search', 18), el('span', { class: 'search-trigger__txt' }, 'Search the guide'), el('span', { class: 'search-trigger__keys', 'aria-hidden': 'true' }, el('kbd', { class: 'ui-kbd' }, '/')));
    facChip = el('a', { class: 'ui-chip ui-chip--gold fac-chip', href: '#/about?s=facilitator', title: 'Facilitator mode is on. Answers are visible.' }, icon('eye', 14), 'Answer key on');
    facChip.hidden = true;
    xpChip = el('a', { class: 'xp-chip', href: '#/progress' });
    themeBtn = el('button', { class: 'ui-btn ui-btn--ghost ui-btn--icon', type: 'button', 'aria-keyshortcuts': 't', on: { click: toggleTheme } });
    const settingsBtn = el('button', { class: 'ui-btn ui-btn--ghost ui-btn--icon', type: 'button', 'aria-label': 'Settings', title: 'Settings', on: { click: openSettings } }, icon('settings', 20));
    top.appendChild(menuBtn);
    top.appendChild(brand);
    top.appendChild(searchBtn);
    top.appendChild(el('span', { class: 'spacer' }));
    top.appendChild(facChip);
    top.appendChild(xpChip);
    top.appendChild(themeBtn);
    top.appendChild(settingsBtn);
    updateXpChip();
    updateThemeButton();
    updateNavButton();
  }
  function updateXpChip() {
    if (!xpChip) return;
    const p = G.store.totalProgress();
    G.clear(xpChip);
    xpChip.title = p.rank + ' (level ' + p.level + '), ' + p.xp + ' XP, ' + plural(p.streak, 'day') + ' streak';
    xpChip.appendChild(el('span', { class: 'xp-chip__streak' + (p.streak ? ' is-on' : '') }, icon('flame', 16), el('span', { class: 'sr-only' }, 'Day streak '), el('b', null, String(p.streak)), ' '));
    xpChip.appendChild(el('span', { class: 'xp-chip__xp' }, el('b', null, fmtNum(p.xp)), ' XP '));
    xpChip.appendChild(el('span', { class: 'xp-chip__rank' }, p.rank));
  }

  /* ---------- sidebar ---------- */
  const TOOLS = [
    { name: 'home', href: '#/', label: 'Home', icon: 'map' },
    { name: 'topics', href: '#/topics', label: 'All topics', icon: 'layers' },
    { name: 'cards', href: '#/cards', label: 'Flashcards', icon: 'cards', badge: true },
    { name: 'labs', href: '#/labs', label: 'Labs', icon: 'flask' },
    { name: 'library', href: '#/library', label: 'References', icon: 'book' },
    { name: 'glossary', href: '#/glossary', label: 'Glossary', icon: 'list' },
    { name: 'bookmarks', href: '#/bookmarks', label: 'Bookmarks', icon: 'bookmark' },
    { name: 'progress', href: '#/progress', label: 'Progress', icon: 'trophy' },
    { name: 'about', href: '#/about', label: 'How to use', icon: 'info' }
  ];

  const sidebarMode = () => (G.store.get().settings.sidebarMode === 'journey' ? 'journey' : 'topics');

  function buildModeSwitch() {
    const name = G.uid('sbmode');
    const seg = el('div', { class: 'ui-seg nav-seg', role: 'radiogroup', 'aria-label': 'Sidebar view' });
    [['topics', 'Topics'], ['journey', 'Journey']].forEach((o) => {
      const input = el('input', { type: 'radio', name: name, value: o[0], 'aria-label': o[1] === 'Topics' ? 'Topics: every topic by chapter' : 'Journey: practice problems and boss rounds' });
      input.addEventListener('change', () => { if (input.checked) G.store.setSetting('sidebarMode', o[0]); });
      seg.appendChild(el('label', null, input, el('span', null, o[1])));
      sidebarRefs.seg.push(input);
    });
    return seg;
  }

  function buildFilter() {
    const input = el('input', { class: 'nav-filter__input', type: 'search', id: 'nav-filter', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Filter topics', placeholder: 'Filter topics' });
    const status = el('p', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
    input.addEventListener('input', () => { filterText = input.value; applyFilter(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && input.value) { e.preventDefault(); e.stopPropagation(); input.value = ''; filterText = ''; applyFilter(); }
      else if (e.key === 'Enter') {
        const first = visibleLinks(sidebarRefs.panels[sidebarMode()]).filter((a) => a.classList.contains('nav-topic') || a.classList.contains('nav-level'))[0];
        if (first) { e.preventDefault(); first.click(); }
      } else if (e.key === 'ArrowDown') {
        const first = visibleLinks(sidebarRefs.panels[sidebarMode()])[0];
        if (first) { e.preventDefault(); first.focus(); }
      }
    });
    sidebarRefs.filter = input;
    sidebarRefs.status = status;
    return el('div', { class: 'nav-filter' }, icon('search', 16, 'nav-filter__ic'), input, status);
  }

  function visibleLinks(panel) {
    if (!panel) return [];
    return Array.prototype.slice.call(panel.querySelectorAll('a.nav-world__link, a.nav-topic, a.nav-level, a.nav-sub, button.nav-world__toggle'))
      .filter((n) => n.offsetParent !== null);
  }
  function onTreeKey(e) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
    const t = e.target;
    if (!t || !t.closest || !t.closest('a, button')) return;
    const links = visibleLinks(e.currentTarget);
    const i = links.indexOf(t);
    if (i < 0) return;
    let to = null;
    if (e.key === 'ArrowDown') to = links[i + 1];
    else if (e.key === 'ArrowUp') to = i === 0 ? sidebarRefs.filter : links[i - 1];
    else if (e.key === 'Home') to = links[0];
    else to = links[links.length - 1];
    if (to) { e.preventDefault(); to.focus(); }
  }

  /* Topics mode: chapters (collapsible), topic groups, then every topic. Chapters without topics list their boss rounds. */
  function buildTopicsPanel() {
    const panel = el('div', { class: 'nav-panel nav-panel--topics', id: 'nav-panel-topics' });
    const regions = (G.manifest && G.manifest.regions) || [];
    regions.forEach((r) => {
      const worlds = r.worlds.map(worldMeta).filter(Boolean);
      if (!worlds.length) return;
      const head = el('h2', { class: 'nav-regionlbl' }, regionIcon(r.id, 16), el('span', null, r.label));
      const ul = el('ul', { class: 'nav-chapters', role: 'list' });
      const region = { head: head, ul: ul, chapters: [] };
      worlds.forEach((w) => {
        const listId = 'nav-topics-' + w.id;
        const link = el('a', { class: 'nav-world__link', href: worldHref(w.id), title: w.title },
          el('span', { class: 'ui-dot' }), el('span', { class: 'nav-world__no' }, worldNo(w.id)), el('span', { class: 'nav-world__lbl' }, w.short || w.title));
        const count = el('span', { class: 'nav-world__pct' });
        const toggle = el('button', { class: 'nav-world__toggle', type: 'button', 'aria-expanded': 'false', 'aria-controls': listId, 'aria-label': 'Show topics of ' + (w.short || w.title) }, icon('chevron-right', 14, 'nav-chev'));
        const wbar = bar(0, { cls: 'ui-bar--thin' });
        const list = el('div', { class: 'nav-topics', id: listId });
        const refs = { li: null, link: link, count: count, bar: wbar, toggle: toggle, list: list, items: [], groups: [], region: region, hay: ((w.short || '') + ' ' + w.title).toLowerCase(), hasTopics: !!(w.topics && w.topics.length) };

        const quick = el('div', { class: 'nav-quick' },
          el('a', { class: 'nav-sub', href: worldHref(w.id) }, 'Overview'),
          refs.hasTopics ? el('a', { class: 'nav-sub', href: '#/w/' + w.id + '/cheatsheet' }, 'Cheat sheet') : null);
        list.appendChild(quick);
        refs.quick = quick;

        const source = refs.hasTopics
          ? topicsOf(w).map((t) => ({ id: t.id, title: t.title, group: t.group || 'Topics', diff: t.difficulty, href: topicHref(w.id, t.id), level: false }))
          : w.levels.slice().sort((a, b) => a.order - b.order).map((l) => ({ id: l.id, title: l.title, group: 'Boss rounds and practice', diff: null, href: levelHref(w.id, l.id), level: true }));
        let lastGroup = null, group = null;
        source.forEach((s) => {
          if (s.group !== lastGroup) {
            lastGroup = s.group;
            const gid = 'nav-g-' + w.id + '-' + refs.groups.length;
            const gul = el('ul', { class: 'nav-group__list', role: 'list', 'aria-labelledby': gid });
            const gel = el('div', { class: 'nav-group' }, el('div', { class: 'nav-group__h', id: gid }, s.group), gul);
            group = { el: gel, ul: gul, items: [] };
            refs.groups.push(group);
            list.appendChild(gel);
          }
          const status = s.level ? G.store.levelStatus(s.id) : G.store.topicStatus(s.id);
          const mk = s.level ? statusMark(status) : topicMark(status);
          const a = el('a', { class: 'nav-topic', href: s.href }, mk, el('span', { class: 'nav-topic__t' }, s.title), s.diff ? diffDot(s.diff) : null);
          const li = el('li', null, a);
          group.ul.appendChild(li);
          const item = { id: s.id, a: a, li: li, mark: mk, status: status, level: s.level, group: group, hay: (s.title + ' ' + s.group).toLowerCase() };
          group.items.push(item);
          refs.items.push(item);
        });

        const li = el('li', { class: 'nav-world', 'data-world': w.id }, el('div', { class: 'nav-world__row' }, link, count, toggle), wbar, list);
        refs.li = li;
        toggle.addEventListener('click', () => setChapterOpen(w.id, toggle.getAttribute('aria-expanded') !== 'true'));
        sidebarRefs.ch[w.id] = refs;
        region.chapters.push(refs);
        ul.appendChild(li);
      });
      panel.appendChild(el('section', { class: 'nav-region-block', 'aria-label': r.label }, head, ul));
      sidebarRefs.regions['t-' + r.id] = region;
    });
    sidebarRefs.empty = el('p', { class: 'nav-empty', hidden: true }, 'No topics match. Try fewer words.');
    panel.appendChild(sidebarRefs.empty);
    panel.addEventListener('keydown', onTreeKey);
    return panel;
  }

  /* Journey mode: chapters with their practice problems and boss rounds, grouped by region. */
  function buildJourneyPanel() {
    const panel = el('div', { class: 'nav-panel nav-panel--journey', id: 'nav-panel-journey' });
    const regions = (G.manifest && G.manifest.regions) || [];
    regions.forEach((r) => {
      const worlds = r.worlds.map(worldMeta).filter(Boolean);
      if (!worlds.length) return;
      const listId = 'nav-region-' + r.id;
      const toggle = el('button', { class: 'nav-region__btn', type: 'button', 'aria-expanded': 'false', 'aria-controls': listId },
        regionIcon(r.id, 18), el('span', { class: 'nav-region__lbl' }, r.label), el('span', { class: 'nav-region__count' }, String(worlds.length)), icon('chevron-down', 16, 'nav-chev'));
      const list = el('ul', { class: 'nav-worlds', id: listId, role: 'list' });
      const sec = el('section', { class: 'nav-region', 'aria-label': r.label }, toggle, list);
      toggle.addEventListener('click', () => setRegionOpen(r.id, toggle.getAttribute('aria-expanded') !== 'true'));
      sidebarRefs.regions[r.id] = { sec: sec, toggle: toggle, list: list };

      worlds.forEach((w) => {
        const lvListId = 'nav-levels-' + w.id;
        const link = el('a', { class: 'nav-world__link', href: worldHref(w.id), title: w.title },
          el('span', { class: 'ui-dot' }), el('span', { class: 'nav-world__no' }, worldNo(w.id)), el('span', { class: 'nav-world__lbl' }, w.short || w.title));
        const pct = el('span', { class: 'nav-world__pct' });
        const chev = el('button', { class: 'nav-world__toggle', type: 'button', 'aria-expanded': 'false', 'aria-controls': lvListId, 'aria-label': 'Show practice problems of ' + (w.short || w.title) }, icon('chevron-right', 14, 'nav-chev'));
        const wbar = bar(0, { cls: 'ui-bar--thin' });
        const levels = el('ol', { class: 'nav-levels', id: lvListId, role: 'list' });
        const refs = { li: null, link: link, pct: pct, bar: wbar, toggle: chev, list: levels, levels: [], hay: ((w.short || '') + ' ' + w.title).toLowerCase() };
        w.levels.slice().sort((a, b) => a.order - b.order).forEach((l) => {
          const mk = statusMark('new');
          const la = el('a', { class: 'nav-level', href: levelHref(w.id, l.id) }, mk, el('span', { class: 'nav-level__t' }, l.title));
          const lli = el('li', null, la);
          refs.levels.push({ id: l.id, a: la, li: lli, mark: mk, status: 'new', hay: l.title.toLowerCase() });
          levels.appendChild(lli);
        });
        const li = el('li', { class: 'nav-world', 'data-world': w.id }, el('div', { class: 'nav-world__row' }, link, pct, chev), wbar, levels);
        refs.li = li;
        chev.addEventListener('click', () => setWorldOpen(w.id, chev.getAttribute('aria-expanded') !== 'true'));
        sidebarRefs.worlds[w.id] = refs;
        list.appendChild(li);
      });
      panel.appendChild(sec);
    });
    panel.addEventListener('keydown', onTreeKey);
    return panel;
  }

  function buildSidebar() {
    const nav = $('sidebar');
    G.clear(nav);
    sidebarRefs = { regions: {}, worlds: {}, ch: {}, tools: {}, overall: null, panels: {}, seg: [], filter: null, status: null, empty: null };
    const inner = el('div', { class: 'sidebar__inner' });
    inner.appendChild(el('div', { class: 'sidebar__drawer-head' },
      el('span', { class: 'sidebar__drawer-title' }, 'Navigation'),
      el('button', { class: 'ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm', type: 'button', 'aria-label': 'Close navigation', on: { click: () => closeDrawer() } }, icon('close', 18))));

    const tools = el('ul', { class: 'nav-list nav-list--grid', role: 'list' });
    TOOLS.forEach((t) => {
      const badge = t.badge ? el('span', { class: 'nav-badge', hidden: true }) : null;
      const a = el('a', { class: 'nav-link', href: t.href }, icon(t.icon, 16), el('span', { class: 'nav-link__txt' }, t.label), badge);
      sidebarRefs.tools[t.name] = { a: a, badge: badge };
      tools.appendChild(el('li', null, a));
    });
    inner.appendChild(tools);

    inner.appendChild(el('div', { class: 'nav-top' }, buildModeSwitch(), buildFilter()));

    const overallBar = bar(0, { cls: 'ui-bar--brand', label: 'Overall progress' });
    const overallTxt = el('span', { class: 'nav-overall__txt' });
    const overallHead = el('span', { class: 'nav-heading' }, 'Topics reviewed');
    sidebarRefs.overall = { bar: overallBar, txt: overallTxt, head: overallHead };
    inner.appendChild(el('div', { class: 'nav-overall' }, el('div', { class: 'nav-overall__row' }, overallHead, overallTxt), overallBar));

    sidebarRefs.panels.topics = buildTopicsPanel();
    sidebarRefs.panels.journey = buildJourneyPanel();
    inner.appendChild(sidebarRefs.panels.topics);
    inner.appendChild(sidebarRefs.panels.journey);
    nav.appendChild(inner);
    applySidebarMode();
    updateSidebar();
  }

  function applySidebarMode() {
    if (!sidebarRefs.panels.topics) return;
    const mode = sidebarMode();
    sidebarRefs.panels.topics.hidden = mode !== 'topics';
    sidebarRefs.panels.journey.hidden = mode !== 'journey';
    sidebarRefs.seg.forEach((i) => { i.checked = i.value === mode; });
    const label = mode === 'topics' ? 'Filter topics' : 'Filter practice problems';
    sidebarRefs.filter.placeholder = label;
    sidebarRefs.filter.setAttribute('aria-label', label);
    applyFilter();
    updateSidebar();
    scrollActiveIntoView();
  }

  /* Instant filter: every typed word must appear in the title (topics mode also matches the group and chapter name). */
  function applyFilter() {
    const tokens = filterText.toLowerCase().split(/\s+/).filter(Boolean);
    const mode = sidebarMode();
    if (!sidebarRefs.panels.topics) return;
    const filtering = tokens.length > 0;
    sidebarRefs.panels.topics.classList.toggle('is-filtering', filtering);
    sidebarRefs.panels.journey.classList.toggle('is-filtering', filtering);
    let shown = 0;
    const hit = (hay) => tokens.every((t) => hay.indexOf(t) >= 0);
    if (mode === 'topics') {
      Object.keys(sidebarRefs.regions).forEach((k) => {
        if (k.indexOf('t-') !== 0) return;
        const region = sidebarRefs.regions[k];
        let regionHits = 0;
        region.chapters.forEach((c) => {
          let n = 0;
          c.groups.forEach((g) => {
            let gn = 0;
            g.items.forEach((it) => { const ok = !filtering || hit(c.hay + ' ' + it.hay); it.li.hidden = !ok; if (ok) gn++; });
            g.el.hidden = gn === 0;
            n += gn;
          });
          c.li.hidden = n === 0;
          c.quick.hidden = filtering;
          if (n) regionHits++;
          shown += n;
        });
        region.head.hidden = regionHits === 0;
        region.ul.hidden = regionHits === 0;
      });
      sidebarRefs.empty.hidden = shown > 0 || !filtering;
    } else {
      Object.keys(sidebarRefs.worlds).forEach((id) => {
        const wr = sidebarRefs.worlds[id];
        let n = 0;
        wr.levels.forEach((lv) => { const ok = !filtering || hit(wr.hay + ' ' + lv.hay); lv.li.hidden = !ok; if (ok) n++; });
        wr.li.hidden = filtering && n === 0;
        shown += n;
      });
    }
    sidebarRefs.status.textContent = filtering ? shown + (mode === 'topics' ? (shown === 1 ? ' topic matches' : ' topics match') : (shown === 1 ? ' practice problem matches' : ' practice problems match')) : '';
  }

  function setRegionOpen(id, open) {
    const r = sidebarRefs.regions[id];
    if (!r) return;
    if (open) openRegions.add(id); else openRegions.delete(id);
    r.toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    r.sec.classList.toggle('is-open', open);
  }
  function setWorldOpen(id, open) {
    const w = sidebarRefs.worlds[id];
    if (!w) return;
    if (open) openWorlds.add(id); else openWorlds.delete(id);
    w.toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    w.li.classList.toggle('is-open', open);
  }
  function setChapterOpen(id, open) {
    const c = sidebarRefs.ch[id];
    if (!c) return;
    if (open) openChapters.add(id); else openChapters.delete(id);
    c.toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    c.li.classList.toggle('is-open', open);
  }

  function updateSidebar() {
    const st = G.store;
    Object.keys(sidebarRefs.worlds).forEach((id) => {
      const refs = sidebarRefs.worlds[id];
      const ch = sidebarRefs.ch[id];
      const p = st.worldProgress(id);
      refs.pct.textContent = p.pct ? p.pct + '%' : '';
      refs.pct.classList.toggle('is-done', p.pct === 100);
      G.ui.setBar(refs.bar, p.pct);
      refs.li.classList.toggle('is-complete', p.pct === 100);
      refs.levels.forEach((lv) => {
        const s = st.levelStatus(lv.id);
        if (s !== lv.status) {
          lv.status = s;
          const mk = statusMark(s);
          lv.mark.replaceWith(mk);
          lv.mark = mk;
        }
      });
      if (!ch) return;
      const q = ch.hasTopics ? p.topics : { reviewed: p.done, total: p.total, pct: p.pct };
      ch.count.textContent = q.total ? q.reviewed + '/' + q.total : '';
      ch.count.title = ch.hasTopics ? q.reviewed + ' of ' + q.total + ' topics reviewed' : q.reviewed + ' of ' + q.total + ' done';
      ch.count.classList.toggle('is-done', q.total > 0 && q.reviewed === q.total);
      G.ui.setBar(ch.bar, q.pct);
      ch.li.classList.toggle('is-complete', q.total > 0 && q.reviewed === q.total);
      ch.items.forEach((it) => {
        const s = it.level ? st.levelStatus(it.id) : st.topicStatus(it.id);
        if (s !== it.status) {
          it.status = s;
          const mk = it.level ? statusMark(s) : topicMark(s);
          it.mark.replaceWith(mk);
          it.mark = mk;
        }
      });
    });
    const t = st.totalProgress();
    if (sidebarRefs.overall) {
      const topics = sidebarMode() === 'topics';
      sidebarRefs.overall.head.textContent = topics ? 'Topics reviewed' : 'Practice problems';
      sidebarRefs.overall.txt.textContent = topics ? t.topicsReviewed + ' of ' + t.topicsTotal : t.levelsDone + ' of ' + t.levelsTotal;
      G.ui.setBar(sidebarRefs.overall.bar, topics ? t.topicsPct : t.pct);
    }
    const cards = sidebarRefs.tools.cards;
    if (cards && cards.badge) {
      const d = st.dueSummary().due;
      cards.badge.hidden = !d;
      cards.badge.textContent = d > 99 ? '99+' : String(d);
      cards.badge.setAttribute('aria-label', d + ' cards due');
    }
  }

  function scrollActiveIntoView() {
    const sb = $('sidebar');
    const panel = sidebarRefs.panels && sidebarRefs.panels[sidebarMode()];
    const active = panel && panel.querySelector('[aria-current="page"]');
    if (!active || active.offsetParent === null) return;
    const top = sb.querySelector('.nav-top');
    const sr = sb.getBoundingClientRect();
    const floor = (top ? top.getBoundingClientRect().bottom : sr.top) + 8;
    const ar = active.getBoundingClientRect();
    if (ar.top >= floor && ar.bottom <= sr.bottom - 40) return;
    // keep the chapter heading in view when the chapter is short enough to fit with the active item
    const chapter = active.closest('.nav-world');
    const cr = chapter ? chapter.getBoundingClientRect() : null;
    if (cr && ar.bottom - cr.top < sr.bottom - floor - 40) sb.scrollTop += cr.top - floor;
    else sb.scrollTop += ar.top - sr.top - sr.height / 3;
  }

  function setActive(route) {
    currentRoute = route;
    Object.keys(sidebarRefs.tools).forEach((k) => {
      const a = sidebarRefs.tools[k].a;
      const on = route && (route.name === k || (k === 'labs' && route.name === 'lab'));
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    const inWorld = route && (route.name === 'world' || route.name === 'level' || route.name === 'topic' || route.name === 'cheatsheet');
    const activeWorld = inWorld ? route.params.world : null;
    const activeItem = route && route.name === 'topic' ? route.params.topic : route && route.name === 'level' ? route.params.level : null;
    Object.keys(sidebarRefs.worlds).forEach((id) => {
      const refs = sidebarRefs.worlds[id];
      const ch = sidebarRefs.ch[id];
      const isWorld = route && route.name === 'world' && route.params.world === id;
      refs.li.classList.toggle('is-active', id === activeWorld);
      if (isWorld) refs.link.setAttribute('aria-current', 'page'); else refs.link.removeAttribute('aria-current');
      refs.levels.forEach((lv) => {
        if (route && route.name === 'level' && activeItem === lv.id) lv.a.setAttribute('aria-current', 'page'); else lv.a.removeAttribute('aria-current');
      });
      if (ch) {
        ch.li.classList.toggle('is-active', id === activeWorld);
        if (isWorld) ch.link.setAttribute('aria-current', 'page'); else ch.link.removeAttribute('aria-current');
        ch.items.forEach((it) => {
          if (activeItem === it.id) it.a.setAttribute('aria-current', 'page'); else it.a.removeAttribute('aria-current');
        });
      }
    });
    if (activeWorld && sidebarRefs.worlds[activeWorld]) {
      const regionId = (worldMeta(activeWorld) || {}).region;
      if (regionId) setRegionOpen(regionId, true);
      setWorldOpen(activeWorld, true);
      setChapterOpen(activeWorld, true);
    } else {
      if (!openRegions.size) {
        const first = (G.manifest.regions || []).filter((r) => r.worlds.length)[0];
        if (first) setRegionOpen(first.id, true);
      }
      if (!openChapters.size) {
        const c = continueTopic();
        if (c.world) setChapterOpen(c.world.id, true);
      }
    }
    // restore the user's expanded state after a rebuild
    openRegions.forEach((id) => setRegionOpen(id, true));
    openWorlds.forEach((id) => setWorldOpen(id, true));
    openChapters.forEach((id) => setChapterOpen(id, true));
    scrollActiveIntoView();
    if (mqNarrow.matches) closeDrawer(false);
  }

  /* ---------- breadcrumbs ---------- */
  function setCrumbs(items) {
    const nav = $('crumbs');
    G.clear(nav);
    if (!items || !items.length) { nav.hidden = true; return; }
    nav.hidden = false;
    const ol = el('ol', { class: 'crumbs__list' });
    items.forEach((it, i) => {
      const last = i === items.length - 1;
      const inner = last ? el('span', { class: 'crumbs__cur', 'aria-current': 'page' }, it.label) : !it.href ? el('span', { class: 'crumbs__txt' }, it.label) : el('a', { href: it.href }, it.label);
      ol.appendChild(el('li', { class: 'crumbs__item' }, inner, last ? null : icon('chevron-right', 14, 'crumbs__sep')));
    });
    nav.appendChild(ol);
  }

  /* ---------- right rail and in-page contents ---------- */
  function cssEsc(s) { return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/[^\w-]/g, '\\$&'); }
  function findSection(id) {
    const main = $('main');
    return main.querySelector('[id="' + cssEsc(id) + '"]');
  }

  function buildTocList(toc, cls) {
    const ol = el('ol', { class: cls, role: 'list' });
    toc.forEach((t) => {
      const a = el('a', { class: 'toc__link toc__link--l' + (t.level === 3 ? '3' : '2'), href: '#' + (currentRoute ? currentRoute.path : '/') + '?s=' + encodeURIComponent(t.id), 'data-id': t.id }, t.text);
      a.addEventListener('click', (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
        e.preventDefault();
        if (G.router) G.router.scrollToSection(t.id, { focus: true, updateUrl: true });
        const panel = a.closest('details');
        if (panel) panel.open = false;
      });
      ol.appendChild(el('li', null, a));
    });
    return ol;
  }

  function setToc(toc, slot) {
    stopSpy();
    const rail = $('rail'), app = $('app');
    G.clear(rail);
    if (!toc || !toc.length) { rail.hidden = true; app.classList.remove('has-rail'); return; }
    rail.hidden = false;
    app.classList.add('has-rail');
    const railList = buildTocList(toc, 'toc__list');
    rail.appendChild(el('div', { class: 'rail__inner' }, el('h2', { class: 'rail__title', id: 'rail-title' }, 'On this page'), railList));
    rail.setAttribute('aria-labelledby', 'rail-title');
    let panelLabel = null, panelList = null;
    if (slot) {
      panelLabel = el('span', { class: 'toc-panel__cur' });
      panelList = buildTocList(toc, 'toc__list');
      slot.appendChild(el('details', { class: 'toc-panel' },
        el('summary', null, icon('list', 18), el('span', { class: 'toc-panel__lbl' }, 'On this page'), panelLabel, icon('chevron-down', 16, 'toc-panel__chev')),
        panelList));
    }
    startSpy(toc, [railList, panelList].filter(Boolean), panelLabel);
  }

  function startSpy(toc, lists, panelLabel) {
    const items = toc.map((t) => ({ id: t.id, text: t.text, node: null }));
    let ticking = false, activeId = null;
    const rail = $('rail');
    function update() {
      ticking = false;
      const limit = 96;
      let current = null;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!it.node || !it.node.isConnected) it.node = findSection(it.id);
        if (!it.node) continue;
        if (it.node.getBoundingClientRect().top <= limit) current = it; else break;
      }
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (atBottom && items.length) current = items[items.length - 1];
      if (!current) current = items[0];
      const id = current ? current.id : null;
      if (id === activeId) return;
      activeId = id;
      lists.forEach((list) => {
        Array.prototype.forEach.call(list.querySelectorAll('.toc__link'), (a) => {
          if (a.dataset.id === id) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current');
        });
      });
      if (panelLabel) panelLabel.textContent = current ? current.text : '';
      const link = lists[0] && lists[0].querySelector('[aria-current="location"]');
      if (link && rail.scrollHeight > rail.clientHeight) {
        const lr = link.getBoundingClientRect(), rr = rail.getBoundingClientRect();
        if (lr.top < rr.top + 60 || lr.bottom > rr.bottom - 20) rail.scrollTop += lr.top - rr.top - rr.height / 3;
      }
    }
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    const timer = setTimeout(update, 60);
    const late = setTimeout(update, 700);
    spy = { stop: () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); clearTimeout(timer); clearTimeout(late); }, refresh: update };
  }
  function stopSpy() { if (spy) { spy.stop(); spy = null; } }

  /* ---------- footer and banners ---------- */
  let footerRefs = null;
  function buildFooter() {
    const f = $('footer');
    G.clear(f);
    const name = el('a', { class: 'app-footer__name', href: '#/progress?focus=name' });
    const stats = el('span', { class: 'app-footer__stats' });
    const save = el('span', { class: 'app-footer__save' });
    const exportBtn = btn({ text: 'Export progress', icon: 'download', kind: 'sm', onClick: () => doExport() });
    f.appendChild(el('div', { class: 'app-footer__inner' },
      el('div', { class: 'app-footer__who' }, icon('user', 18), name, stats),
      el('div', { class: 'app-footer__right' }, save, exportBtn)));
    footerRefs = { name: name, stats: stats, save: save };
    updateFooter();
  }
  function updateFooter() {
    if (!footerRefs) return;
    const s = G.store.get(), p = G.store.totalProgress();
    footerRefs.name.textContent = s.learner.name || 'Add your name';
    footerRefs.name.classList.toggle('is-empty', !s.learner.name);
    footerRefs.stats.textContent = p.rank + ' · ' + fmtNum(p.xp) + ' XP';
    footerRefs.save.textContent = G.store.persistent ? 'Saved in this browser' : 'Not saved: storage is blocked';
    footerRefs.save.classList.toggle('is-warn', !G.store.persistent);
  }
  function doExport() {
    const name = G.store.exportJSON();
    toast('Progress exported as ' + name, { kind: 'ok', icon: 'download' });
  }

  let storageBannerDismissed = false;
  function updateBanners() {
    const root = $('banners');
    G.clear(root);
    if (!G.store.persistent && !storageBannerDismissed) {
      root.appendChild(el('div', { class: 'banner banner--warn', role: 'alert' },
        icon('warn', 20),
        el('p', { class: 'banner__txt' }, el('strong', null, 'Progress is not being saved. '), 'This browser blocks local storage for this page, so your progress will be lost when you close the tab. Export it to keep a copy.'),
        btn({ text: 'Export now', icon: 'download', kind: 'sm', onClick: doExport }),
        el('button', { class: 'ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm', type: 'button', 'aria-label': 'Dismiss warning', on: { click: () => { storageBannerDismissed = true; updateBanners(); } } }, icon('close', 16))));
    }
    if (G.store.loadNotice && !Shell._noticeDismissed) {
      root.appendChild(el('div', { class: 'banner banner--info', role: 'status' },
        icon('info', 20), el('p', { class: 'banner__txt' }, G.store.loadNotice),
        el('button', { class: 'ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm', type: 'button', 'aria-label': 'Dismiss notice', on: { click: () => { Shell._noticeDismissed = true; updateBanners(); } } }, icon('close', 16))));
    }
  }

  /* ---------- toasts ---------- */
  function toast(message, o) {
    o = o || {};
    const host = $('toasts');
    const t = el('div', { class: 'ui-toast' + (o.kind ? ' ui-toast--' + o.kind : ''), role: 'status' },
      o.icon ? icon(o.icon, 20) : null,
      el('div', null, o.title ? el('strong', null, o.title) : null, message));
    host.appendChild(t);
    const kill = () => { t.classList.add('is-leaving'); setTimeout(() => t.remove(), 260); };
    const timer = setTimeout(kill, o.timeout || 4200);
    t.addEventListener('click', () => { clearTimeout(timer); kill(); });
    while (host.children.length > 4) host.firstChild.remove();
    return t;
  }

  /* ---------- settings panel (dialog and dashboard share it) ---------- */
  function buildSettings() {
    const uid = G.uid('set');
    const wrap = el('div', { class: 'settings' });
    const store = G.store;
    const refs = [];

    function segment(label, key, options, hint) {
      const group = el('div', { class: 'ui-field', role: 'radiogroup', 'aria-label': label });
      group.appendChild(el('span', { class: 'ui-label' }, label));
      const seg = el('div', { class: 'ui-seg' });
      options.forEach((o) => {
        const input = el('input', { type: 'radio', name: uid + key, value: String(o[0]), 'aria-label': o[1] });
        input.addEventListener('change', () => store.setSetting(key, key === 'fontScale' ? Number(o[0]) : o[0]));
        seg.appendChild(el('label', null, input, el('span', null, o[1])));
        refs.push(() => { input.checked = String(store.get().settings[key]) === String(o[0]); });
      });
      group.appendChild(seg);
      if (hint) group.appendChild(el('p', { class: 'ui-hint' }, hint));
      return group;
    }
    function toggle(label, hint, key) {
      const input = el('input', { type: 'checkbox', role: 'switch' });
      input.addEventListener('change', () => store.setSetting(key, input.checked));
      refs.push(() => { input.checked = !!store.get().settings[key]; });
      return el('label', { class: 'ui-switch' }, input, el('span', { class: 'track' }), el('span', { class: 'txt' }, label, hint ? el('small', null, hint) : null));
    }

    wrap.appendChild(segment('Theme', 'theme', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']], 'Auto follows your operating system.'));
    wrap.appendChild(segment('Text size', 'fontScale', [[0.9, 'Small'], [1, 'Default'], [1.15, 'Large'], [1.3, 'Largest']]));
    wrap.appendChild(toggle('Facilitator mode', 'Shows quiz answers and model answers with an Answer key badge. Printing includes them.', 'facilitator'));
    wrap.appendChild(toggle('Collapse the sidebar', 'Gives lessons more room on wide screens.', 'sidebarCollapsed'));

    const goalId = uid + 'goal';
    const goal = el('select', { class: 'ui-select', id: goalId });
    [5, 10, 15, 20, 30].forEach((n) => goal.appendChild(el('option', { value: String(n) }, n + ' actions')));
    goal.addEventListener('change', () => store.setSetting('dailyGoal', Number(goal.value)));
    refs.push(() => {
      const v = String(store.get().settings.dailyGoal);
      if (!Array.prototype.some.call(goal.options, (o) => o.value === v)) goal.appendChild(el('option', { value: v }, v + ' actions'));
      goal.value = v;
    });
    wrap.appendChild(el('div', { class: 'ui-field' }, el('label', { class: 'ui-label', for: goalId }, 'Daily goal'),
      goal, el('p', { class: 'ui-hint' }, 'An action is a quiz or scenario answer, a card rating, a reviewed topic or a finished practice problem.')));

    const nameId = uid + 'name';
    const nameInput = el('input', { class: 'ui-input', id: nameId, type: 'text', maxlength: '60', autocomplete: 'name', placeholder: 'Your name' });
    const saveName = G.debounce(() => store.setLearnerName(nameInput.value), 300);
    nameInput.addEventListener('input', saveName);
    nameInput.addEventListener('blur', () => store.setLearnerName(nameInput.value));
    wrap.appendChild(el('div', { class: 'ui-field' }, el('label', { class: 'ui-label', for: nameId }, 'Your name'), nameInput,
      el('p', { class: 'ui-hint' }, 'Used in the export file name and the footer. It stays in this browser.')));

    const sync = () => {
      refs.forEach((fn) => fn());
      if (document.activeElement !== nameInput) nameInput.value = store.get().learner.name;
    };
    const onChange = (e) => { if (!e || !e.path || /^settings|^learner|^\*/.test(e.path)) sync(); };
    store.on(onChange);
    sync();
    return { el: wrap, input: nameInput, destroy: () => store.off(onChange) };
  }

  let settingsDlg = null;
  function openSettings() {
    if (settingsDlg) return;
    const panel = buildSettings();
    const done = btn({ text: 'Done', kind: 'primary', onClick: () => settingsDlg && settingsDlg.close('ok') });
    const more = el('a', { class: 'ui-btn', href: '#/progress' }, 'Open progress dashboard');
    more.addEventListener('click', () => settingsDlg && settingsDlg.close('nav'));
    panel.el.classList.add('settings--dialog');
    settingsDlg = dialog({ title: 'Settings', body: panel.el, footer: [more, done], onClose: () => { panel.destroy(); settingsDlg = null; } });
    settingsDlg.open();
  }

  /* ---------- show a routed view ---------- */
  function show(res, route) {
    const main = $('main');
    currentRoute = route;
    stopSpy();
    G.clear(main);
    main.removeAttribute('aria-busy');
    main.dataset.view = route.name;
    $('app').dataset.world = res.world || 'home';
    main.appendChild(res.el);
    setCrumbs(res.crumbs);
    setToc(res.toc, res.tocSlot);
    setActive(route);
    updateSidebar();
  }
  function showLoading() {
    const main = $('main');
    stopSpy();
    main.setAttribute('aria-busy', 'true');
    G.clear(main);
    const sk = el('div', { class: 'view view--loading', role: 'status', 'aria-label': 'Loading' },
      el('span', { class: 'ui-skel', style: { height: '9rem', borderRadius: 'var(--r-lg)' } }),
      el('span', { class: 'ui-skel', style: { height: '1.4rem', width: '60%' } }),
      el('span', { class: 'ui-skel', style: { height: '1rem', width: '90%' } }),
      el('span', { class: 'ui-skel', style: { height: '1rem', width: '80%' } }),
      el('div', { class: 'skel-grid' }, el('span', { class: 'ui-skel', style: { height: '7rem' } }), el('span', { class: 'ui-skel', style: { height: '7rem' } }), el('span', { class: 'ui-skel', style: { height: '7rem' } })));
    main.appendChild(sk);
    setToc(null);
  }
  function announce(text) {
    const a = $('route-announcer');
    a.textContent = '';
    setTimeout(() => { a.textContent = text; }, 40);
  }

  /* ---------- global keys ---------- */
  function onKey(e) {
    if (e.defaultPrevented) return;
    const t = e.target;
    const typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      if (G.search) G.search.open();
      return;
    }
    if (e.key === 'Escape' && drawerOpen) { e.preventDefault(); closeDrawer(); return; }
    if (e.key === 'Tab' && drawerOpen) {
      const f = focusables($('sidebar'));
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      else if (!$('sidebar').contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      return;
    }
    if (typing || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('dialog[open]')) return;
    if (e.key === '/') { e.preventDefault(); if (G.search) G.search.open(); }
    else if (e.key === '?') { e.preventDefault(); location.hash = '#/about?s=keys'; }
    else if (e.key === '[') { e.preventDefault(); toggleNav(); }
    else if (e.key === 't' || e.key === 'T') { e.preventDefault(); toggleTheme(); }
  }

  /* ---------- store and bus reactions ---------- */
  let refreshQueued = false;
  function onStore(evt) {
    if (evt.path && /^settings/.test(evt.path) || evt.path === '*') applySettings();
    if (refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(() => {
      refreshQueued = false;
      updateXpChip();
      updateFooter();
      updateSidebar();
      updateBanners();
    });
  }

  Shell.init = function () {
    applySettings();
    buildTopbar();
    buildSidebar();
    buildFooter();
    updateBanners();
    $('sidebar-scrim').addEventListener('click', () => closeDrawer());
    $('skip-link').addEventListener('click', (e) => { e.preventDefault(); const m = $('main'); m.focus({ preventScroll: false }); m.scrollIntoView(); });
    document.addEventListener('keydown', onKey);
    if (mqNarrow.addEventListener) mqNarrow.addEventListener('change', onNarrowChange);
    if (mqDark.addEventListener) mqDark.addEventListener('change', () => { if (G.store.get().settings.theme === 'auto') applySettings(); });
    G.store.on(onStore);
    rankSeen = G.store.rankInfo(G.store.get().xp).level;
    G.bus.on('level:complete', (d) => {
      const lv = G.content.findLevelMeta(d.levelId);
      toast(lv ? lv.level.title : d.levelId, { kind: 'gold', icon: 'trophy', title: 'Practice problem complete, +50 XP' });
    });
    G.bus.on('topic:reviewed', (d) => {
      const f = findTopic(d.topicId);
      toast(f ? f.topic.title : d.topicId, { kind: 'ok', icon: 'check', title: d.xp === false ? 'Topic reviewed' : 'Topic reviewed, +15 XP' });
    });
    G.bus.on('xp:gain', (d) => {
      if (d.reason === 'defend') toast('You scored 70 percent or more on your own rubric.', { kind: 'ok', icon: 'star', title: 'Strong defend, +40 XP' });
    });
    G.bus.on('rank:up', (d) => toast('You are now ' + (/^[aeiou]/i.test(d.rank) ? 'an ' : 'a ') + d.rank + '.', { kind: 'gold', icon: 'sparkles', title: 'Rank up', timeout: 6000 }));
  };

  Shell.show = show;
  Shell.showLoading = showLoading;
  Shell.setCrumbs = setCrumbs;
  Shell.setActive = setActive;
  Shell.toast = toast;
  Shell.announce = announce;
  Shell.openSettings = openSettings;
  Shell.buildSettings = buildSettings;
  Shell.toggleTheme = toggleTheme;
  Shell.doExport = doExport;
  Shell.refreshSpy = () => { if (spy) spy.refresh(); };
  Shell.closeDrawer = closeDrawer;
  Shell.findSection = findSection;
  Shell.updateAll = () => { updateXpChip(); updateFooter(); updateSidebar(); updateBanners(); };
})();
