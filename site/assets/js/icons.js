/* Follow the Question: icon library. Owner: V1.
   Classic script. Provides Guide.icons (see CONTRACT.md). Every icon is an inline SVG string:
   24 x 24 viewBox, 2 px stroke, round caps and joins, currentColor. No network, no external <use>.
   Reference copies of every icon live in assets/img/icons/*.svg. Visual rules: assets/img/BRAND.md. */
(function () {
  'use strict';

  var G = (window.Guide = window.Guide || {});

  /* A dot is a near zero length stroke, so it keeps the same weight and round cap as every line. */
  function dot(x, y) { return '<path d="M' + x + ' ' + y + 'h.01"/>'; }

  /* ---------- UI icons (order matches CONTRACT.md) ---------- */
  var UI = {
    'check': '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    'cross': '<path d="M5.5 5.5l13 13M18.5 5.5l-13 13"/>',
    'info': '<circle cx="12" cy="12" r="9.5"/><path d="M12 11v5.5"/>' + dot(12, 7.5),
    'warn': '<path d="M12 3.5L2.8 19.8a.9.9 0 0 0 .8 1.2h16.8a.9.9 0 0 0 .8-1.2z"/><path d="M12 9.5v4.5"/>' + dot(12, 17.5),
    'bulb': '<path d="M9 17v-.8c0-1-.6-1.7-1.3-2.4A6 6 0 1 1 16.3 13.8c-.7.7-1.3 1.4-1.3 2.4V17z"/><path d="M9.5 20.5h5"/>',
    'lock': '<rect x="4.5" y="10.5" width="15" height="11" rx="2.5"/><path d="M8 10.5v-3a4 4 0 0 1 8 0v3"/><path d="M12 15v2.5"/>',
    'flag': '<path d="M5.5 21.5v-18"/><path d="M5.5 4.5h12.5l-2.5 4 2.5 4H5.5"/>',
    'star': '<path d="M12 3.2l2.7 5.68 6.24.82-4.57 4.32 1.16 6.18L12 17.2l-5.53 3 1.16-6.18L3.06 9.7l6.24-.82z"/>',
    'bookmark': '<path d="M7 3.5h10A1.5 1.5 0 0 1 18.5 5v16l-6.5-4.5L5.5 21V5A1.5 1.5 0 0 1 7 3.5z"/>',
    'bookmark-fill': '<path fill="currentColor" d="M7 3.5h10A1.5 1.5 0 0 1 18.5 5v16l-6.5-4.5L5.5 21V5A1.5 1.5 0 0 1 7 3.5z"/>',
    'search': '<circle cx="10.5" cy="10.5" r="7"/><path d="M15.7 15.7L21 21"/>',
    'menu': '<path d="M4 6h16M4 12h16M4 18h16"/>',
    'close': '<path d="M6 6l12 12M18 6L6 18"/>',
    'sun': '<circle cx="12" cy="12" r="4"/><path d="M12 2.5V5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
    'moon': '<path d="M20.5 14.2A8.8 8.8 0 1 1 9.8 3.5a7 7 0 0 0 10.7 10.7z"/>',
    'contrast': '<circle cx="12" cy="12" r="9.5"/><path fill="currentColor" d="M12 2.5a9.5 9.5 0 0 1 0 19z"/>',
    'download': '<path d="M12 3.5v11"/><path d="M7.5 10.5l4.5 4.5 4.5-4.5"/><path d="M4.5 19.5h15"/>',
    'upload': '<path d="M12 15.5v-12"/><path d="M7.5 8L12 3.5 16.5 8"/><path d="M4.5 19.5h15"/>',
    'print': '<path d="M7 8V3.5h10V8"/><rect x="3" y="8" width="18" height="9" rx="2"/><path d="M7 14h10v6.5H7z"/>' + dot(17, 11.5),
    'settings': '<path d="M9.8 5.14l.29-2.55h3.82l.29 2.55 1.1.46 2-1.6 2.7 2.7-1.6 2 .46 1.1 2.55.29v3.82l-2.55.29-.46 1.1 1.6 2-2.7 2.7-2-1.6-1.1.46-.29 2.55h-3.82l-.29-2.55-1.1-.46-2 1.6L4 17.3l1.6-2-.46-1.1-2.55-.29v-3.82l2.55-.29.46-1.1L4 6.7 6.7 4l2 1.6z"/><circle cx="12" cy="12" r="3"/>',
    'chevron-right': '<path d="M9.5 5l7 7-7 7"/>',
    'chevron-down': '<path d="M5 9.5l7 7 7-7"/>',
    'chevron-left': '<path d="M14.5 5l-7 7 7 7"/>',
    'play': '<path d="M7.5 4.5v15l12-7.5z"/>',
    'flip': '<path d="M4 8h14"/><path d="M14.5 4.5L18 8l-3.5 3.5"/><path d="M20 16H6"/><path d="M9.5 12.5L6 16l3.5 3.5"/>',
    'trophy': '<path d="M7 3.5h10V9a5 5 0 0 1-10 0z"/><path d="M7 5.5H4.5a1 1 0 0 0-1 1V8A3.5 3.5 0 0 0 7 11.5M17 5.5h2.5a1 1 0 0 1 1 1V8a3.5 3.5 0 0 1-3.5 3.5"/><path d="M12 14v4M8.5 21h7M9.5 18h5"/>',
    'flame': '<path d="M12 21.5a6.5 6.5 0 0 0 6.5-6.5c0-3.6-2.6-5.4-3.6-8.2-.5 1.5-1.5 2.4-2.6 3C12.4 8.4 12.6 5 10 2.5c-.5 3.6-4.5 6-4.5 12.5a6.5 6.5 0 0 0 6.5 6.5z"/><path d="M12 21.5c-1.7 0-3-1.2-3-2.8 0-1.8 1.8-2.6 3-4.5 1.2 1.9 3 2.7 3 4.5 0 1.6-1.3 2.8-3 2.8z"/>',
    'link': '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    'copy': '<rect x="8.5" y="8.5" width="12" height="12" rx="2.5"/><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5"/>',
    'eye': '<path d="M2 12C4 8 7.5 5.5 12 5.5S20 8 22 12c-2 4-5.5 6.5-10 6.5S4 16 2 12z"/><circle cx="12" cy="12" r="3"/>',
    'eye-off': '<path d="M9.6 5.8A10 10 0 0 1 12 5.5c4.5 0 8 2.5 10 6.5a15 15 0 0 1-2.6 3.5"/><path d="M6.6 7.4A14.7 14.7 0 0 0 2 12c2 4 5.5 6.5 10 6.5 1.3 0 2.5-.2 3.6-.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="M3.5 3.5l17 17"/>',
    'shuffle': '<path d="M3 6.5h3c3.5 0 5 3 6.5 5.5s3 5.5 6 5.5H20"/><path d="M17.5 15l3 2.5-3 2.5"/><path d="M3 17.5h3c1.5 0 2.7-.7 3.6-1.8"/><path d="M14.4 8.3C15.2 7.2 16.3 6.5 18 6.5h2"/><path d="M17.5 4l3 2.5-3 2.5"/>',
    'list': '<path d="M9 6h11.5M9 12h11.5M9 18h11.5"/>' + dot(4, 6) + dot(4, 12) + dot(4, 18),
    'grid': '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
    'map': '<path d="M3.5 6.5L9 4.5l6 2 5.5-2v13l-5.5 2-6-2-5.5 2z"/><path d="M9 4.5v13M15 6.5v13"/>',
    'book': '<path d="M5 19.5v-14A2.5 2.5 0 0 1 7.5 3h12v14h-12A2.5 2.5 0 0 0 5 19.5 2.5 2.5 0 0 0 7.5 22h12v-5"/>',
    'cards': '<rect x="7.5" y="8" width="13" height="13" rx="2"/><path d="M4 16.5v-11a2 2 0 0 1 2-2h10.5"/><path d="M11.5 13h5M11.5 16.5h3"/>',
    'flask': '<path d="M9.5 3h5M10.5 3v6.2L4.8 19a1.7 1.7 0 0 0 1.5 2.5h11.4a1.7 1.7 0 0 0 1.5-2.5L13.5 9.2V3"/><path d="M7.5 15h9"/>',
    'shield': '<path d="M12 2.5l-7.5 3v6c0 5 3.3 8.5 7.5 10 4.2-1.5 7.5-5 7.5-10v-6z"/>',
    'target': '<circle cx="12" cy="12" r="9.5"/><circle cx="12" cy="12" r="5"/>' + dot(12, 12),
    'clock': '<circle cx="12" cy="12" r="9.5"/><path d="M12 6.5V12l3.5 2"/>',
    'user': '<circle cx="12" cy="8" r="4"/><path d="M4.5 21c0-4.2 3.4-7 7.5-7s7.5 2.8 7.5 7"/>',
    'refresh': '<path d="M20 12a8 8 0 0 1-14 5.3"/><path d="M4 12a8 8 0 0 1 14-5.3"/><path d="M18 2.5V7h-4.5"/><path d="M6 21.5V17h4.5"/>',
    'arrow-right': '<path d="M4 12h16"/><path d="M14 6l6 6-6 6"/>',
    'arrow-left': '<path d="M20 12H4"/><path d="M10 6l-6 6 6 6"/>',
    'sparkles': '<path d="M10 3.5c.7 4.6 2.4 6.6 7 8-4.6 1.4-6.3 3.4-7 8-.7-4.6-2.4-6.6-7-8 4.6-1.4 6.3-3.4 7-8z"/><path d="M19 2.5c.2 1.6.9 2.3 2.5 2.5-1.6.2-2.3.9-2.5 2.5-.2-1.6-.9-2.3-2.5-2.5 1.6-.2 2.3-.9 2.5-2.5z"/><path d="M18.5 16.5c.2 1.4.8 2 2.2 2.2-1.4.2-2 .8-2.2 2.2-.2-1.4-.8-2-2.2-2.2 1.4-.2 2-.8 2.2-2.2z"/>',
    'external': '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
    'keyboard': '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M8 14.5h8"/>' + dot(7, 10) + dot(10.5, 10) + dot(14, 10) + dot(17.5, 10),
    'trash': '<path d="M4 6.5h16M9.5 6.5V4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2.5"/><path d="M6 6.5l.9 13a1.5 1.5 0 0 0 1.5 1.4h7.2a1.5 1.5 0 0 0 1.5-1.4l.9-13"/><path d="M10 11v5.5M14 11v5.5"/>',
    'layers': '<path d="M12 3L3 7.5l9 4.5 9-4.5z"/><path d="M3 12l9 4.5 9-4.5"/><path d="M3 16.5L12 21l9-4.5"/>',
    'quote': '<path d="M10.5 13.5v-5a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2zM10.5 13.5c0 2.2-1 3.8-4 4.8"/><path d="M20 13.5v-5a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2zM20 13.5c0 2.2-1 3.8-4 4.8"/>'
  };

  /* ---------- World icons (w00 to w19) ---------- */
  var WORLD = {
    /* compass */
    w00: '<circle cx="12" cy="12" r="9.5"/><path d="M8 16l2.65-5.35L16 8l-2.65 5.35z"/>',
    /* sliders */
    w01: '<path d="M3 6h10M19 6h2M3 12h2M11 12h10M3 18h7M16 18h5"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="13" cy="18" r="2"/>',
    /* stopwatch with lightning */
    w02: '<circle cx="12" cy="14" r="8"/><path d="M12 6V2.5M9.5 2.5h5M18.5 6.2L20 4.7"/><path d="M13 9.5L10 14h4l-3 4.5"/>',
    /* funnel with incoming data */
    w03: '<path d="M4 8.5h16l-5.5 6V21h-5v-6.5z"/>' + dot(8, 4) + dot(12, 4) + dot(16, 4),
    /* puzzle piece */
    w04: '<path d="M3.5 8h4a2.5 2.5 0 1 1 4 0H16v2.5a2.5 2.5 0 1 1 0 4V20H3.5v-4.5a2.5 2.5 0 1 0 0-4z"/>',
    /* magnifier over layers */
    w05: '<path d="M9.5 2.5L2.5 6l7 3.5L16.5 6z"/><path d="M2.5 10.5l6 3"/><circle cx="15.5" cy="15.5" r="4.5"/><path d="M19 19l2.5 2.5"/>',
    /* shield with check */
    w06: '<path d="M12 2.5l-7.5 3v6c0 5 3.3 8.5 7.5 10 4.2-1.5 7.5-5 7.5-10v-6z"/><path d="M8.5 12l2.4 2.4 4.6-4.8"/>',
    /* padlock and key */
    w07: '<rect x="2.5" y="11" width="11" height="10" rx="2"/><path d="M5 11V8a3 3 0 0 1 6 0v3"/>' + dot(8, 16) + '<circle cx="18.5" cy="5.5" r="2.5"/><path d="M18.5 8v13M18.5 16H21M18.5 19.5H21"/>',
    /* plug */
    w08: '<path d="M9 2.5v5M15 2.5v5"/><path d="M6 7.5h12V11a6 6 0 0 1-12 0z"/><path d="M12 17v4.5"/>',
    /* two linked nodes */
    w09: '<circle cx="6" cy="6.5" r="3"/><circle cx="18" cy="17.5" r="3"/><path d="M9 6.5c4.5 0 1.5 11 6 11"/>',
    /* network of agents */
    w10: '<circle cx="12" cy="12.5" r="2.5"/><circle cx="12" cy="4.5" r="2"/><circle cx="4.5" cy="19" r="2"/><circle cx="19.5" cy="19" r="2"/><path d="M12 10V6.5M10.1 14.1L6 17.7M13.9 14.1L18 17.7"/>',
    /* framework scaffold */
    w11: '<path d="M6 2.5v19M18 2.5v19M2.5 7h19M2.5 17h19"/><path d="M6 7l12 10M18 7L6 17"/>',
    /* cloud with agent badge */
    w12: '<path d="M12 18H7a4.5 4.5 0 0 1-.7-8.95A6 6 0 0 1 17.8 8.7a4.3 4.3 0 0 1 2.7 3.8"/><rect x="12" y="14.5" width="9" height="7" rx="2"/>' + dot(15.5, 18) + dot(18.5, 18),
    /* eye and waveform */
    w13: '<path d="M2 12C4 8 7.5 5.5 12 5.5S20 8 22 12c-2 4-5.5 6.5-10 6.5S4 16 2 12z"/><path d="M8.5 10.5v3M12 8.5v7M15.5 10.5v3"/>',
    /* checklist with gauge */
    w14: '<path d="M3 4.5L4.5 6 7 3M11 4.5h10M3 10l1.5 1.5L7 8.5M11 10h10"/><path d="M5.5 21a6.5 6.5 0 0 1 13 0"/><path d="M12 21l2.5-3.5"/>',
    /* telescope */
    w15: '<path d="M3.2 12.4L18.1 2.25l3.8 7.5L4.8 15.6z"/><path d="M13.35 12.7L9 21.5M13.35 12.7l3.15 8.8"/>',
    /* overlapping coins */
    w16: '<circle cx="9.5" cy="14.5" r="5.5"/><path d="M9.5 12.5v4"/><path d="M9.02 9.02A5.5 5.5 0 1 1 14.98 14.98"/>',
    /* balance scale */
    w17: '<path d="M12 3v18M8 21h8M5.5 7h13"/><path d="M5.5 7l-3 7a3.2 3.2 0 0 0 6 0z"/><path d="M18.5 7l-3 7a3.2 3.2 0 0 0 6 0z"/>',
    /* notebook with sparkle */
    w18: '<rect x="3" y="3" width="12" height="18" rx="2"/><path d="M7 3v18M10.5 8h2M10.5 12h2"/><path d="M19.5 2.5c.2 1.3.7 1.8 2 2-1.3.2-1.8.7-2 2-.2-1.3-.7-1.8-2-2 1.3-.2 1.8-.7 2-2z"/>',
    /* trophy */
    w19: '<path d="M7 3.5h10V9a5 5 0 0 1-10 0z"/><path d="M7 5.5H4.5a1 1 0 0 0-1 1V8A3.5 3.5 0 0 0 7 11.5M17 5.5h2.5a1 1 0 0 1 1 1V8a3.5 3.5 0 0 1-3.5 3.5"/><path d="M12 14v4M8.5 21h7M9.5 18h5"/>'
  };

  /* ---------- Region icons ---------- */
  var REGION = {
    /* building blocks */
    foundations: '<rect x="3" y="14" width="8" height="7" rx="1.5"/><rect x="13" y="14" width="8" height="7" rx="1.5"/><rect x="8" y="5" width="8" height="7" rx="1.5"/>',
    /* open book */
    knowledge: '<path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5z"/><path d="M12 6.5v13"/>',
    /* bot */
    agents: '<rect x="4" y="8.5" width="16" height="11.5" rx="3"/><path d="M12 8.5v-3"/><circle cx="12" cy="4" r="1.5"/>' + dot(9, 14) + dot(15, 14) + '<path d="M2.5 13v2M21.5 13v2"/>',
    /* viewfinder */
    senses: '<path d="M4 8.5v-3A1.5 1.5 0 0 1 5.5 4h3M15.5 4h3A1.5 1.5 0 0 1 20 5.5v3M20 15.5v3a1.5 1.5 0 0 1-1.5 1.5h-3M8.5 20h-3A1.5 1.5 0 0 1 4 18.5v-3"/><circle cx="12" cy="12" r="3"/>',
    /* server rack */
    operate: '<rect x="3" y="4" width="18" height="6.5" rx="2"/><rect x="3" y="13.5" width="18" height="6.5" rx="2"/>' + dot(7, 7.25) + dot(7, 16.75) + '<path d="M12 7.25h5M12 16.75h5"/>',
    /* summit flag */
    finale: '<path d="M2.5 21L9 9.5l4 7 2-3.5 6.5 8z"/><path d="M9 9.5v-6l4.5 1.5L9 6.5"/>'
  };

  var uid = 0;

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function num(v, d) {
    var n = parseFloat(v);
    return isFinite(n) && n > 0 ? n : d;
  }

  function wrap(body, name, o, defSize) {
    o = o || {};
    var size = num(o.size, defSize);
    var a11y = o.title ? ' role="img" aria-label="' + esc(o.title) + '"' : ' aria-hidden="true"';
    return '<svg xmlns="http://www.w3.org/2000/svg" class="gi gi-' + name + (o.cls ? ' ' + esc(o.cls) : '') +
      '" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor"' +
      ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' + a11y + ' focusable="false">' +
      (o.title ? '<title>' + esc(o.title) + '</title>' : '') + body + '</svg>';
  }

  /* ---------- Logo: a question mark whose dot travels a path of nodes ---------- */
  var HOOK = 'M11.5 18.5C11.5 13.5 15 10.5 19.5 10.5S27.5 13.4 27.5 17.6C27.5 22.6 19.5 22.4 19.5 28.5';
  var TRAIL = '<path d="M22.6 37H27M31.9 34.7l3.8-4.9"/><circle cx="30" cy="37" r="2"/>';

  function logo(o) {
    o = o || {};
    var size = num(o.size, 40);
    var id = 'gl' + (++uid);
    var a11y = o.title ? ' role="img" aria-label="' + esc(o.title) + '"' : ' aria-hidden="true"';
    var head = '<svg xmlns="http://www.w3.org/2000/svg" class="gi gi-logo' + (o.cls ? ' ' + esc(o.cls) : '') +
      '" width="' + size + '" height="' + size + '" viewBox="0 0 48 48" fill="none"' + a11y + ' focusable="false">' +
      (o.title ? '<title>' + esc(o.title) + '</title>' : '');
    var ink = o.mono ? 'currentColor' : '#fff';
    var mark = '<g stroke="' + ink + '" stroke-linecap="round" stroke-linejoin="round">' +
      '<path stroke-width="4.4" d="' + HOOK + '"/><circle cx="19.5" cy="37" r="2.6" fill="' + ink + '" stroke="none"/>' +
      '<g stroke-width="2" opacity=".72">' + TRAIL + '</g>' +
      '<circle cx="38" cy="27" r="2.6" fill="' + ink + '" stroke="none"/></g>';
    if (o.mono) return head + mark + '</svg>';
    return head +
      '<defs><linearGradient id="' + id + '" gradientUnits="userSpaceOnUse" x1="4" y1="2" x2="46" y2="48">' +
      '<stop offset="0" style="stop-color:var(--brand-1,#6d5efc)"/><stop offset=".55" stop-color="#8b5cf6"/>' +
      '<stop offset="1" style="stop-color:var(--brand-2,#22d3ee)"/></linearGradient></defs>' +
      '<rect width="48" height="48" rx="12" fill="url(#' + id + ')"/>' + mark + '</svg>';
  }

  /* ---------- Hero: a question bubble entering a pipeline of six stations ---------- */
  var MODEL = '<rect x="6" y="6" width="12" height="12" rx="2.5"/><path d="M9.5 2.5V6M14.5 2.5V6M9.5 18v3.5M14.5 18v3.5M2.5 9.5H6M2.5 14.5H6M18 9.5h3.5M18 14.5h3.5"/><path d="M12 9.2c.3 1.8 1 2.5 2.8 2.8-1.8.3-2.5 1-2.8 2.8-.3-1.8-1-2.5-2.8-2.8 1.8-.3 2.5-1 2.8-2.8z"/>';
  var STATIONS = [
    { x: 240, y: 252, label: 'Data', body: WORLD.w03 },
    { x: 358, y: 172, label: 'Retrieval', body: WORLD.w05 },
    { x: 476, y: 252, label: 'Model', body: MODEL },
    { x: 594, y: 172, label: 'Tools', body: WORLD.w08 },
    { x: 712, y: 252, label: 'Agents', body: WORLD.w10 },
    { x: 830, y: 172, label: 'Evaluation', body: WORLD.w14 }
  ];
  var PIPE = 'M130 212C185 212 190 252 240 252C299 252 299 172 358 172C417 172 417 252 476 252C535 252 535 172 594 172C653 172 653 252 712 252C771 252 771 172 830 172C868 172 872 212 905 212';

  function hero() {
    var s = '<svg xmlns="http://www.w3.org/2000/svg" class="gi gi-hero" viewBox="0 0 960 420" width="960" height="420" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false"><defs><style>' +
      '.gi-hero{--h-t:var(--text,#141a2e);--h-t2:var(--text-2,#444d6b);--h-s:var(--surface,#fff);--h-s3:var(--surface-3,#e4e8f4);--h-bd:var(--border,#d9deec);--h-bd2:var(--border-strong,#b9c1da);--h-ok:var(--ok,#15803d);--h-1:var(--brand-1,#6d5efc);--h-2:var(--brand-2,#22d3ee)}' +
      '@media (prefers-color-scheme:dark){.gi-hero{--h-t:var(--text,#e9edfb);--h-t2:var(--text-2,#b7bfdc);--h-s:var(--surface,#121a33);--h-s3:var(--surface-3,#212d5c);--h-bd:var(--border,#27335f);--h-bd2:var(--border-strong,#3a4880);--h-ok:var(--ok,#4ade80)}}' +
      '.fh-s1{stop-color:var(--h-1)}.fh-s2{stop-color:var(--h-2)}' +
      '.fh-pp{fill:none;stroke-linecap:round}.fh-p0{stroke:var(--h-s3)}.fh-p1{stroke:var(--h-s)}' +
      '.fh-orb{fill:none;stroke:var(--h-bd);stroke-width:1.5;stroke-linecap:round;stroke-dasharray:1 9}' +
      '.fh-st{fill:var(--h-s);stroke:var(--h-bd);stroke-width:1.5}' +
      '.fh-ic{fill:none;stroke:var(--h-t);stroke-width:1.35;stroke-linecap:round;stroke-linejoin:round}' +
      '.fh-lab{font:650 20px var(--font-sans,system-ui,sans-serif);fill:var(--h-t2);text-anchor:middle}' +
      '@media (prefers-reduced-motion:no-preference){.fh-flow{animation:fh-dash 1.8s linear infinite}.fh-halo{animation:fh-halo 4.5s ease-in-out infinite;transform-box:fill-box;transform-origin:center}}' +
      '@keyframes fh-dash{to{stroke-dashoffset:-20}}@keyframes fh-halo{50%{opacity:.55;transform:scale(1.08)}}' +
      '</style>' +
      '<linearGradient id="fh-g" gradientUnits="userSpaceOnUse" x1="40" y1="0" x2="940" y2="0"><stop offset="0" class="fh-s1"/><stop offset=".5" stop-color="#8b5cf6"/><stop offset="1" class="fh-s2"/></linearGradient>' +
      '<radialGradient id="fh-r"><stop offset="0" class="fh-s1" stop-opacity=".3"/><stop offset="1" class="fh-s1" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="fh-bg"><stop offset="0" class="fh-s2" stop-opacity=".16"/><stop offset="1" class="fh-s2" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="fh-m"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient>' +
      '<mask id="fh-mk"><rect width="960" height="420" fill="url(#fh-m)"/></mask>' +
      '<pattern id="fh-d" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.2" style="fill:var(--h-bd2)"/></pattern>' +
      '<path id="fh-pipe" d="' + PIPE + '"/></defs>' +
      '<rect width="960" height="420" fill="url(#fh-d)" mask="url(#fh-mk)" opacity=".55"/>' +
      '<ellipse cx="480" cy="212" rx="470" ry="150" fill="url(#fh-bg)"/>' +
      '<ellipse class="fh-orb" cx="480" cy="212" rx="455" ry="175"/><ellipse class="fh-orb" cx="480" cy="212" rx="380" ry="120"/>' +
      '<circle cx="86" cy="124.5" r="4" fill="url(#fh-g)" opacity=".7"/><circle cx="828.5" cy="99.5" r="5" fill="url(#fh-g)" opacity=".7"/>' +
      '<circle cx="187.5" cy="346" r="3.5" fill="url(#fh-g)" opacity=".7"/><circle cx="741" cy="355" r="4.5" fill="url(#fh-g)" opacity=".7"/>' +
      '<use href="#fh-pipe" class="fh-pp fh-p0" stroke-width="20"/><use href="#fh-pipe" class="fh-pp fh-p1" stroke-width="14"/>' +
      '<use href="#fh-pipe" class="fh-pp" stroke="url(#fh-g)" stroke-width="3"/>' +
      '<use href="#fh-pipe" class="fh-pp fh-p1 fh-flow" stroke-width="3" stroke-dasharray="2 18"/>';

    for (var m = 0; m < 5; m++) s += '<circle cx="' + (299 + m * 118) + '" cy="212" r="4.5" fill="url(#fh-g)"/>';

    STATIONS.forEach(function (st, i) {
      var up = st.y < 212;
      s += '<g><circle class="fh-halo" cx="' + st.x + '" cy="' + st.y + '" r="78" fill="url(#fh-r)"' + (i % 2 ? ' style="animation-delay:-2.2s"' : '') + '/>' +
        '<circle class="fh-st" cx="' + st.x + '" cy="' + st.y + '" r="38"/>' +
        '<circle cx="' + st.x + '" cy="' + st.y + '" r="34" fill="none" stroke="url(#fh-g)" stroke-width="3"/>' +
        '<g class="fh-ic" transform="translate(' + (st.x - 20.4) + ' ' + (st.y - 20.4) + ') scale(1.7)">' + st.body + '</g>' +
        '<text class="fh-lab" x="' + st.x + '" y="' + (up ? st.y - 52 : st.y + 66) + '">' + st.label + '</text></g>';
    });

    return s +
      '<g transform="translate(88 212)"><circle r="84" fill="none" stroke="url(#fh-g)" stroke-width="1.5" stroke-dasharray="2 8" stroke-linecap="round" opacity=".5"/>' +
      '<ellipse rx="76" ry="66" fill="url(#fh-r)"/>' +
      '<g transform="scale(1.2)"><path d="M-22 -34H22A20 20 0 0 1 42 -14V14A20 20 0 0 1 22 34H-2L-22 50V34A20 20 0 0 1 -42 14V-14A20 20 0 0 1 -22 -34z" fill="url(#fh-g)"/>' +
      '<path d="M-10 -8C-10 -17 -4 -21 1 -21C7 -21 11 -17 11 -11C11 -3 1 -4 1 5" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="1" cy="16" r="3.8" fill="#fff"/></g></g>' +
      '<g transform="translate(922 212)"><circle r="31" fill="none" stroke="var(--h-ok)" stroke-width="1.5" stroke-dasharray="2 8" stroke-linecap="round" opacity=".5"/><circle r="21" fill="var(--h-ok)"/>' +
      '<path d="M-8 .5L-2.5 6 8.5-5.5" fill="none" stroke="var(--h-s)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></g></svg>';
  }

  G.icons = {
    names: Object.keys(UI),

    /* UI icon by name. Also resolves world ids (w00..w19) and region ids for convenience. '' if unknown. */
    svg: function (name, o) {
      var body = UI[name] || WORLD[name] || REGION[name];
      return body ? wrap(body, name, o, 20) : '';
    },

    world: function (id, o) {
      return WORLD[id] ? wrap(WORLD[id], id, o, 28) : '';
    },

    region: function (id, o) {
      return REGION[id] ? wrap(REGION[id], 'region-' + id, o, 24) : '';
    },

    /* { size, cls, title, mono }. Default: gradient tile, white glyph. mono: tile-less currentColor mark. */
    logo: logo,

    hero: hero
  };
})();
