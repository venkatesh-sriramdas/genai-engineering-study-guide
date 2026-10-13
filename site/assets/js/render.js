/* Follow the Question: content renderer. Owner: E2.
   Guide.render.levelPage(world, level, opts) -> { el, toc, destroy }
   Guide.render.topicPage(world, topic, opts) -> { el, toc, destroy }  (opts: { prev, next } as { title, href })
   Guide.render.blocks(blocks, ctx)           -> DocumentFragment
   Guide.render.refList(world, ids)           -> element
   Also exposed for other modules: Guide.render.code(spec), Guide.render.block(block, ctx). */
(function () {
  'use strict';
  var G = (window.Guide = window.Guide || {});
  var ui = G.kit;
  var esc = G.md.esc;

  var CALLOUTS = {
    tip: { label: 'Tip', icon: 'bulb' },
    gotcha: { label: 'Gotcha', icon: 'flag' },
    warn: { label: 'Warning', icon: 'warn' },
    preview: { label: 'Preview', icon: 'sparkles' },
    interview: { label: 'Interview', icon: 'target' },
    why: { label: 'Why', icon: 'info' },
    note: { label: 'Note', icon: 'quote' }
  };
  var REF_TYPES = { spec: 'Spec', doc: 'Docs', paper: 'Paper', blog: 'Blog', course: 'Course', video: 'Video', repo: 'Repo', tool: 'Tool' };
  var PROSE = { h: 1, p: 1, list: 1, callout: 1 };

  /* ---------- small helpers ---------- */
  function md(node, str, ctx, mode) { return ui.setMd(node, str, ctx, mode); }
  function mdBlock(cls, str, ctx) { return ui.mdEl('div', cls, str, ctx, 'block'); }
  function mdInline(tag, cls, str, ctx) { return ui.mdEl(tag, cls, str, ctx, 'inline'); }
  function titleOf(ctx) { return ctx && ctx.level ? ctx.level.title : ''; }
  function routeFor(ctx, sectionId) {
    var w = ctx && ctx.world && ctx.world.id;
    var item = ctx && (ctx.level || ctx.topic);
    var l = item && item.id;
    return w && l ? '#/w/' + w + '/' + l + '?s=' + encodeURIComponent(sectionId) : '#' + sectionId;
  }
  function tagTone(tag) {
    var t = String(tag || '').toLowerCase();
    if (t === 'ga') return 'ok';
    if (t === 'preview') return 'preview';
    if (t === 'deprecated') return 'bad';
    return 'accent';
  }

  /* ---------- light syntax colouring (small, safe: output is escaped piece by piece) ---------- */
  var KW = {
    python: 'and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield self',
    js: 'async await break case catch class const continue default delete do else export extends finally for function if import in instanceof let new of return super switch this throw try typeof var void while yield interface type enum implements readonly public private protected static',
    csharp: 'abstract as async await base break case catch class const continue default do else enum event finally for foreach if in interface internal is lock namespace new override private protected public readonly record ref return sealed static struct switch this throw try using var virtual void while yield',
    java: 'abstract boolean break case catch class continue default do else enum extends final finally for if implements import instanceof interface new package private protected public return static super switch this throw throws try void volatile while',
    go: 'break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var',
    bash: 'if then else elif fi for in do done while until case esac function export local return echo cd source set unset',
    sql: 'select from where group by order having join left right inner outer on as and or not in is null insert into values update set delete create table index drop alter limit offset union all distinct case when then else end',
    lit: 'true false null None True False nil undefined NaN'
  };
  function words(list) { return '\\b(?:' + list.trim().split(/\s+/).join('|') + ')\\b'; }
  var STR_DQ = '"(?:\\\\.|[^"\\\\\\n])*"';
  var STR_SQ = "'(?:\\\\.|[^'\\\\\\n])*'";
  var STR_BT = '`(?:\\\\.|[^`\\\\])*`';
  var NUM = '\\b\\d[\\d_]*(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b';
  function make(comment, str, kw, ci) {
    return new RegExp('(' + comment + ')|(' + str + ')|(' + NUM + ')|(' + words(kw) + ')|(' + words(KW.lit) + ')', 'g' + (ci ? 'i' : ''));
  }
  var CLIKE_C = '\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/';
  var SPECS = {
    python: make('#[^\\n]*', '"""[\\s\\S]*?"""|\'\'\'[\\s\\S]*?\'\'\'|' + STR_DQ + '|' + STR_SQ, KW.python),
    js: make(CLIKE_C, STR_DQ + '|' + STR_SQ + '|' + STR_BT, KW.js),
    csharp: make(CLIKE_C, '@"(?:""|[^"])*"|\\$?' + STR_DQ + '|' + STR_SQ, KW.csharp),
    java: make(CLIKE_C, STR_DQ + '|' + STR_SQ, KW.java),
    go: make(CLIKE_C, STR_DQ + '|' + STR_SQ + '|' + STR_BT, KW.go),
    bash: make('#[^\\n]*', STR_DQ + '|' + STR_SQ, KW.bash),
    sql: make('--[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/', STR_SQ + '|' + STR_DQ, KW.sql, true),
    json: make('(?!x)x', STR_DQ, 'zzzznotakeyword'),
    yaml: make('#[^\\n]*', STR_DQ + '|' + STR_SQ, 'zzzznotakeyword')
  };
  var LANG_ALIAS = {
    py: 'python', python3: 'python', javascript: 'js', jsx: 'js', ts: 'js', typescript: 'js', tsx: 'js', node: 'js',
    cs: 'csharp', 'c#': 'csharp', dotnet: 'csharp', sh: 'bash', shell: 'bash', zsh: 'bash', yml: 'yaml', jsonc: 'json', kotlin: 'java'
  };
  function highlight(code, lang) {
    var key = String(lang || '').toLowerCase();
    key = LANG_ALIAS[key] || key;
    var re = SPECS[key];
    if (!re) return null;
    re.lastIndex = 0;
    var out = '', last = 0, m;
    var classes = ['c', 's', 'n', 'k', 'l'];
    while ((m = re.exec(code)) !== null) {
      if (m[0].length === 0) { re.lastIndex++; continue; }
      if (m.index > last) out += esc(code.slice(last, m.index));
      var cls = '';
      for (var i = 1; i <= 5; i++) if (m[i] !== undefined) { cls = classes[i - 1]; break; }
      out += '<span class="tk-' + cls + '">' + esc(m[0]) + '</span>';
      last = m.index + m[0].length;
    }
    return out + esc(code.slice(last));
  }

  /* ---------- code ---------- */
  function renderCode(b) {
    var lang = b.lang || 'text';
    var codeEl = G.el('code', { class: 'language-' + lang });
    var html = highlight(String(b.code || ''), lang);
    if (html !== null) codeEl.innerHTML = html; else codeEl.textContent = String(b.code || '');
    var status = G.el('span', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
    var copy = ui.button({ cls: 'g-btn--ghost g-btn--sm g-code__copy', icon: 'copy', label: 'Copy', attrs: { 'aria-label': 'Copy code' + (b.title ? ': ' + b.title : '') } });
    var timer = null;
    copy.addEventListener('click', function () {
      ui.copy(String(b.code || '')).then(function () {
        ui.setBtnLabel(copy, 'Copied');
        copy.classList.add('is-done');
        status.textContent = 'Code copied to clipboard';
      }, function () {
        ui.setBtnLabel(copy, 'Press Ctrl+C');
        status.textContent = 'Copy failed. Select the code and copy it manually.';
      }).then(function () {
        window.clearTimeout(timer);
        timer = window.setTimeout(function () { ui.setBtnLabel(copy, 'Copy'); copy.classList.remove('is-done'); }, 1800);
      });
    });
    var fig = G.el('figure', { class: 'g-code' },
      G.el('div', { class: 'g-code__bar' },
        G.el('span', { class: 'g-code__lang' }, lang),
        b.title ? G.el('span', { class: 'g-code__title' }, b.title) : null,
        copy, status),
      G.el('pre', { class: 'g-code__pre', tabindex: '0' }, codeEl));
    if (b.caption) { var cap = G.el('figcaption', { class: 'g-code__caption' }); fig.appendChild(md(cap, b.caption, null, 'inline')); }
    return fig;
  }

  /* ---------- block renderers ---------- */
  var R = {};

  R.h = function (b, ctx, env) {
    var top = !env || env.top;
    var tag = b.level === 3 ? (top ? 'h3' : 'h4') : (top ? 'h2' : 'h3');
    var id = b.id || G.slug(b.text);
    var h = G.el(tag, { class: 'g-h g-h--' + (b.level === 3 ? '3' : '2'), id: id, tabindex: '-1' });
    h.appendChild(mdInline('span', 'g-h__text', b.text, ctx));
    var plain = G.md.text(b.text);
    var toast = G.el('span', { class: 'g-h__toast', role: 'status', 'aria-live': 'polite' });
    var a = G.el('a', { class: 'g-h__anchor', href: routeFor(ctx, id), 'aria-label': 'Copy link to section: ' + plain }, ui.icon('link', 16));
    a.addEventListener('click', function (e) {
      e.preventDefault();
      try { history.replaceState(null, '', routeFor(ctx, id)); } catch (err) { /* file:// restrictions */ }
      ui.copy(window.location.href).then(function () { toast.textContent = 'Link copied'; }, function () { toast.textContent = 'Link set in the address bar'; })
        .then(function () { window.setTimeout(function () { toast.textContent = ''; }, 1800); });
    });
    if (env && env.top) { env.toc.push({ id: id, text: plain, level: b.level === 3 ? 3 : 2 }); h.setAttribute('data-mark', id); }
    return G.el('div', { class: 'g-hwrap g-hwrap--' + (b.level === 3 ? '3' : '2') }, h, a, toast);
  };

  R.p = function (b, ctx) { return mdBlock('g-p', b.md, ctx); };

  R.list = function (b, ctx) {
    var style = b.style === 'ol' || b.style === 'checks' ? b.style : 'ul';
    var list = G.el(style === 'ol' ? 'ol' : 'ul', { class: 'g-list g-list--' + style });
    (b.items || []).forEach(function (item) {
      var li = G.el('li');
      if (style === 'checks') li.appendChild(G.el('span', { class: 'g-list__check', 'aria-hidden': 'true' }, ui.icon('check', 14)));
      li.appendChild(mdInline('span', 'g-list__text', item, ctx));
      list.appendChild(li);
    });
    return list;
  };

  R.callout = function (b, ctx) {
    var kind = CALLOUTS[b.kind] ? b.kind : 'note';
    var def = CALLOUTS[kind];
    var head = G.el('div', { class: 'g-callout__head' },
      G.el('span', { class: 'g-callout__icon' }, ui.icon(def.icon, 18)),
      G.el('span', { class: 'g-callout__kind' }, def.label),
      b.title ? mdInline('strong', 'g-callout__title', b.title, ctx) : null);
    return G.el('aside', { class: 'g-callout g-callout--' + kind, role: 'note' }, head, mdBlock('g-callout__body', b.md, ctx));
  };

  R.table = function (b, ctx) {
    var table = G.el('table', { class: 'g-table' + (b.compact ? ' g-table--compact' : '') });
    if (b.caption) { var cap = G.el('caption'); md(cap, b.caption, ctx, 'inline'); table.appendChild(cap); }
    var hl = typeof b.highlightCol === 'number' ? b.highlightCol : -1;
    var tr = G.el('tr');
    (b.head || []).forEach(function (cell, i) {
      var th = G.el('th', { scope: 'col', class: i === hl ? 'is-hl' : null });
      md(th, cell, ctx, 'inline');
      tr.appendChild(th);
    });
    table.appendChild(G.el('thead', null, tr));
    var tbody = G.el('tbody');
    (b.rows || []).forEach(function (row) {
      var r = G.el('tr');
      row.forEach(function (cell, i) {
        var td = G.el(i === 0 ? 'th' : 'td', { scope: i === 0 ? 'row' : null, class: i === hl ? 'is-hl' : null });
        md(td, cell, ctx, 'inline');
        r.appendChild(td);
      });
      tbody.appendChild(r);
    });
    table.appendChild(tbody);
    return G.el('div', { class: 'g-table-wrap', role: 'region', tabindex: '0', 'aria-label': (b.caption ? G.md.text(b.caption) : 'Table') + ', scrollable' }, table);
  };

  R.compare = function (b, ctx) {
    var titleId = ui.uid('cmp');
    var grid = G.el('div', { class: 'g-cmp__grid' });
    (b.options || []).forEach(function (o, i) {
      var card = G.el('article', { class: 'g-optcard' });
      card.appendChild(G.el('header', { class: 'g-optcard__head' },
        G.el('span', { class: 'g-optcard__letter', 'aria-hidden': 'true' }, String.fromCharCode(65 + i)),
        G.el('h4', { class: 'g-optcard__name' }, o.name),
        o.tag ? ui.chip(o.tag, tagTone(o.tag)) : null));
      if (o.summary) card.appendChild(mdBlock('g-optcard__summary', o.summary, ctx));
      if (o.meta && o.meta.length) {
        var meta = G.el('dl', { class: 'g-optcard__meta' });
        o.meta.forEach(function (m) { meta.appendChild(G.el('div', null, G.el('dt', null, m.k), G.el('dd', null, m.v))); });
        card.appendChild(meta);
      }
      function points(label, items, tone, iconName) {
        if (!items || !items.length) return null;
        var ul = G.el('ul', { class: 'g-points g-points--' + tone });
        items.forEach(function (t) {
          ul.appendChild(G.el('li', null, G.el('span', { class: 'g-points__icon', 'aria-hidden': 'true' }, ui.icon(iconName, 14)), mdInline('span', null, t, ctx)));
        });
        return G.el('div', { class: 'g-optcard__points' }, G.el('div', { class: 'g-optcard__label' }, label), ul);
      }
      var pros = points('Pros', o.pros, 'pro', 'check');
      var cons = points('Cons', o.cons, 'con', 'cross');
      if (pros) card.appendChild(pros);
      if (cons) card.appendChild(cons);
      if (o.bestWhen) card.appendChild(G.el('div', { class: 'g-when g-when--best' }, G.el('div', { class: 'g-when__label' }, ui.icon('check', 14), 'Best when'), mdBlock('g-when__text', o.bestWhen, ctx)));
      if (o.avoidWhen) card.appendChild(G.el('div', { class: 'g-when g-when--avoid' }, G.el('div', { class: 'g-when__label' }, ui.icon('cross', 14), 'Avoid when'), mdBlock('g-when__text', o.avoidWhen, ctx)));
      grid.appendChild(card);
    });
    return G.el('section', { class: 'g-cmp', 'aria-labelledby': titleId },
      G.el('header', { class: 'g-cmp__head' },
        G.el('div', { class: 'g-eyebrow' }, ui.icon('layers', 14), 'Compare the options'),
        G.el('h3', { class: 'g-board__title', id: titleId }, b.title),
        b.intro ? mdBlock('g-cmp__intro', b.intro, ctx) : null),
      grid);
  };

  R.scenario = function (b, ctx) {
    var titleId = ui.uid('scn');
    function col(label, iconName, items, cls) {
      var ul = G.el('ul', { class: 'g-scn__list' });
      (items || []).forEach(function (t) { ul.appendChild(mdInline('li', null, t, ctx)); });
      return G.el('div', { class: 'g-scn__col ' + cls },
        G.el('div', { class: 'g-scn__label' }, ui.icon(iconName, 16), label), ul);
    }
    return G.el('section', { class: 'g-scn', 'aria-labelledby': titleId },
      G.el('header', { class: 'g-scn__head' }, G.el('div', { class: 'g-eyebrow' }, ui.icon('target', 14), 'Scenario'), G.el('h3', { class: 'g-board__title', id: titleId }, b.title)),
      G.el('div', { class: 'g-scn__cols' }, col('What you know', 'info', b.known, 'g-scn__col--known'), col('What to ask', 'search', b.ask, 'g-scn__col--ask')),
      b.tension ? G.el('div', { class: 'g-scn__tension' }, ui.icon('flag', 16), G.el('div', null, G.el('strong', null, 'The tension: '), mdInline('span', null, b.tension, ctx))) : null);
  };

  R.flow = function (b, ctx) {
    var dir = b.direction === 'v' ? 'v' : 'h';
    var ol = G.el('ol', { class: 'g-flow__list' });
    (b.steps || []).forEach(function (s, i) {
      ol.appendChild(G.el('li', { class: 'g-flow__step' },
        G.el('span', { class: 'g-flow__node', 'aria-hidden': 'true' }, String(i + 1)),
        G.el('div', { class: 'g-flow__card' },
          G.el('div', { class: 'g-flow__title' }, s.title, s.tag ? G.el('span', { class: 'g-chip g-chip--neutral g-flow__tag' }, s.tag) : null),
          s.md ? mdBlock('g-flow__text', s.md, ctx) : null)));
    });
    var titleId = ui.uid('flow');
    return G.el('section', { class: 'g-flow g-flow--' + dir, 'aria-labelledby': b.title ? titleId : null, 'aria-label': b.title ? null : 'Steps' },
      b.title ? G.el('h3', { class: 'g-board__title', id: titleId }, b.title) : null, ol);
  };

  R.stats = function (b, ctx) {
    var grid = G.el('dl', { class: 'g-tiles' });
    (b.items || []).forEach(function (it) {
      grid.appendChild(G.el('div', { class: 'g-tile' },
        G.el('dt', { class: 'g-tile__label' }, it.label),
        G.el('dd', { class: 'g-tile__value' }, String(it.value)),
        it.note ? mdInline('dd', 'g-tile__note', it.note, ctx) : null));
    });
    return grid;
  };

  R.formula = function (b, ctx) {
    var titleId = ui.uid('fml');
    var fig = G.el('section', { class: 'g-formula', 'aria-labelledby': titleId },
      G.el('header', { class: 'g-formula__head' }, G.el('div', { class: 'g-eyebrow' }, ui.icon('layers', 14), 'Formula'), G.el('h3', { class: 'g-board__title', id: titleId }, b.title)),
      G.el('pre', { class: 'g-formula__expr', tabindex: '0' }, G.el('code', null, b.expr)));
    if (b.vars && b.vars.length) {
      var dl = G.el('dl', { class: 'g-formula__vars' });
      b.vars.forEach(function (v) { dl.appendChild(G.el('div', null, G.el('dt', null, G.el('code', null, v.k)), mdInline('dd', null, v.v, ctx))); });
      fig.appendChild(dl);
    }
    if (b.example) fig.appendChild(G.el('div', { class: 'g-formula__example' }, G.el('div', { class: 'g-formula__example-label' }, 'Worked example'), mdBlock(null, b.example, ctx)));
    return fig;
  };

  R.failure = function (b, ctx) {
    var titleId = ui.uid('fail');
    var list = G.el('div', { class: 'g-fail__list' });
    (b.items || []).forEach(function (it) {
      function cell(label, iconName, tone, text) {
        return G.el('div', { class: 'g-fail__cell g-fail__cell--' + tone },
          G.el('div', { class: 'g-fail__label' }, ui.icon(iconName, 14), label), mdBlock('g-fail__text', text, ctx));
      }
      list.appendChild(G.el('article', { class: 'g-fail__item' },
        cell('Symptom', 'warn', 'symptom', it.symptom), cell('Cause', 'search', 'cause', it.cause), cell('Fix', 'check', 'fix', it.fix)));
    });
    return G.el('section', { class: 'g-fail', 'aria-labelledby': titleId },
      G.el('header', { class: 'g-fail__head' }, G.el('div', { class: 'g-eyebrow' }, ui.icon('warn', 14), 'Failure modes'), G.el('h3', { class: 'g-board__title', id: titleId }, b.title || 'Failure modes')),
      list);
  };

  R.code = function (b) { return renderCode(b); };

  R.tabs = function (b, ctx) {
    var uid = ui.uid('tabs');
    var tabs = b.tabs || [];
    var list = G.el('div', { class: 'g-tabs__list', role: 'tablist' });
    var panels = [];
    var buttons = [];
    function select(i, focus) {
      buttons.forEach(function (btn, j) {
        var on = i === j;
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
        btn.tabIndex = on ? 0 : -1;
        panels[j].hidden = !on;
      });
      if (focus) buttons[i].focus();
    }
    tabs.forEach(function (t, i) {
      var btn = G.el('button', { type: 'button', class: 'g-tabs__tab', role: 'tab', id: uid + '-t' + i, 'aria-controls': uid + '-p' + i, 'aria-selected': 'false' }, t.label);
      btn.addEventListener('click', function () { select(i, false); });
      btn.addEventListener('keydown', function (e) {
        var n = tabs.length, to = -1;
        if (e.key === 'ArrowRight') to = (i + 1) % n;
        else if (e.key === 'ArrowLeft') to = (i - 1 + n) % n;
        else if (e.key === 'Home') to = 0;
        else if (e.key === 'End') to = n - 1;
        if (to >= 0) { e.preventDefault(); select(to, true); }
      });
      buttons.push(btn);
      list.appendChild(btn);
      var panel = G.el('div', { class: 'g-tabs__panel', role: 'tabpanel', id: uid + '-p' + i, 'aria-labelledby': uid + '-t' + i, tabindex: '0' },
        G.el('div', { class: 'g-tabs__printlabel' }, t.label));
      panel.appendChild(renderBlocks(t.blocks || [], ctx, { top: false }));
      panels.push(panel);
    });
    var wrap = G.el('div', { class: 'g-tabs' }, list);
    panels.forEach(function (p) { wrap.appendChild(p); });
    select(0, false);
    return wrap;
  };

  R.accordion = function (b, ctx) {
    var wrap = G.el('div', { class: 'g-accs' });
    (b.items || []).forEach(function (item) {
      var panel = G.el('div', { class: 'g-acc__panel' }, G.el('div', { class: 'g-acc__body' }, renderBlocks(item.blocks || [], ctx, { top: false })));
      var summary = G.el('summary', { class: 'g-acc__sum' },
        G.el('span', { class: 'g-acc__chev' }, ui.icon('chevron-right', 18)),
        mdInline('span', 'g-acc__title', item.title, ctx));
      var details = G.el('details', { class: 'g-acc' }, summary, panel);
      var anim = null;
      summary.addEventListener('click', function (e) {
        e.preventDefault();
        if (anim) anim.cancel();
        var opening = !details.open;
        if (ui.reducedMotion() || !panel.animate) { details.open = opening; return; }
        panel.style.overflow = 'hidden';
        if (opening) {
          details.open = true;
          var h = panel.scrollHeight;
          anim = panel.animate([{ height: '0px', opacity: 0 }, { height: h + 'px', opacity: 1 }], { duration: 240, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' });
          anim.onfinish = function () { anim = null; panel.style.overflow = ''; };
        } else {
          anim = panel.animate([{ height: panel.offsetHeight + 'px', opacity: 1 }, { height: '0px', opacity: 0 }], { duration: 200, easing: 'ease-in' });
          anim.onfinish = function () { details.open = false; anim = null; panel.style.overflow = ''; };
        }
        anim.oncancel = function () { panel.style.overflow = ''; };
      });
      wrap.appendChild(details);
    });
    return wrap;
  };

  R.lab = function (b, ctx) {
    var meta = G.labs && G.labs.meta ? G.labs.meta(b.id) : null;
    var host = G.el('div', { class: 'g-lab__host', hidden: true });
    var handle = null;
    var isOpen = false;
    var btn = ui.button({ cls: 'g-btn--primary', icon: 'flask', label: 'Open lab', attrs: { 'aria-expanded': 'false' } });
    var full = G.el('a', { class: 'g-btn g-btn--ghost g-btn--sm', href: '#/labs/' + encodeURIComponent(b.id) }, 'Open on its own page');
    btn.addEventListener('click', function () {
      if (!isOpen) {
        if (!G.labs || !G.labs.open) { host.hidden = false; host.textContent = 'Labs are not available in this build.'; return; }
        isOpen = true;
        host.hidden = false;
        host.textContent = 'Loading lab';
        btn.setAttribute('aria-expanded', 'true');
        ui.setBtnLabel(btn, 'Close lab');
        G.labs.open(b.id, host).then(function (h) { handle = h; });
      } else {
        isOpen = false;
        if (handle && handle.destroy) { try { handle.destroy(); } catch (e) { console.error(e); } }
        handle = null;
        G.clear(host);
        host.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
        ui.setBtnLabel(btn, 'Open lab');
      }
    });
    return G.el('section', { class: 'g-lab' },
      G.el('div', { class: 'g-lab__card' },
        G.el('span', { class: 'g-lab__icon', 'aria-hidden': 'true' }, ui.icon('flask', 26)),
        G.el('div', { class: 'g-lab__body' },
          G.el('div', { class: 'g-eyebrow' }, 'Interactive lab'),
          G.el('h3', { class: 'g-board__title' }, meta ? meta.title : b.id),
          b.intro ? mdBlock('g-lab__intro', b.intro, ctx) : null,
          meta && meta.blurb ? G.el('p', { class: 'g-lab__blurb' }, meta.blurb) : null),
        G.el('div', { class: 'g-lab__actions' }, btn, full)),
      host);
  };

  R.diagram = function (b) {
    var wrap = G.el('div', { class: 'g-diagram-wrap' });
    if (G.diagrams && G.diagrams.render) {
      G.diagrams.render(wrap, b);
    } else {
      wrap.appendChild(G.el('figure', { class: 'g-diagram g-scope', 'data-state': 'error' },
        G.el('div', { class: 'g-diagram__title' }, b.title || 'Diagram'),
        G.el('div', { class: 'g-diagram__fallback' }, G.el('p', null, b.alt || ''), G.el('pre', { class: 'g-diagram__source', tabindex: '0' }, G.el('code', null, b.src || '')))));
    }
    return wrap;
  };

  /* ---------- block dispatcher ---------- */
  function renderBlock(b, ctx, env) {
    var fn = R[b && b.t];
    if (!fn) {
      console.warn('[render] unknown block type', b && b.t);
      return null;
    }
    var node = fn(b, ctx, env || { top: false, toc: [] });
    if (!node) return null;
    var top = !env || env.top;
    if (top) {
      node.classList.add('g-blk', PROSE[b.t] ? 'g-blk--prose' : 'g-blk--wide');
      node.setAttribute('data-t', b.t);
    }
    return node;
  }

  function renderBlocks(blocks, ctx, env) {
    var frag = document.createDocumentFragment();
    env = env || { top: false, toc: [] };
    (blocks || []).forEach(function (b) {
      var node = null;
      if (b && b.t === 'dials') {
        node = G.el('div', { class: 'g-dials-host' });
        if (G.dials && G.dials.mount) G.dials.mount(node, b, ctx);
        else node.textContent = 'Dial board unavailable.';
        if (env.top) { node.classList.add('g-blk', 'g-blk--wide'); node.setAttribute('data-t', 'dials'); }
      } else {
        node = renderBlock(b, ctx, env);
      }
      if (node) frag.appendChild(node);
    });
    return frag;
  }

  /* ---------- references ---------- */
  function refList(world, ids) {
    var all = (world && world.references) || [];
    var list = ids && ids.length ? ids.map(function (id) { return all.filter(function (r) { return r.id === id; })[0]; }).filter(Boolean) : all;
    var ul = G.el('ul', { class: 'g-refs' });
    list.forEach(function (r) {
      var url = G.md.safeUrl(r.url);
      var titleEl = url
        ? G.el('a', { class: 'g-ref__title', href: url, target: '_blank', rel: 'noopener noreferrer' }, r.title, G.el('span', { class: 'g-ref__ext' }, ui.icon('external', 14)))
        : G.el('span', { class: 'g-ref__title' }, r.title);
      var meta = G.el('div', { class: 'g-ref__meta' },
        r.publisher ? G.el('span', { class: 'g-ref__pub' }, r.publisher) : null,
        r.type ? ui.chip(REF_TYPES[r.type] || r.type, 'neutral') : null,
        r.status === 'ga' ? ui.chip('GA', 'ok') : r.status === 'preview' ? ui.chip('Preview', 'preview') : r.status === 'deprecated' ? ui.chip('Deprecated', 'bad') : null,
        r.verified ? G.el('span', { class: 'g-ref__verified' }, 'Checked ' + r.verified) : null);
      ul.appendChild(G.el('li', { class: 'g-ref', id: 'ref-' + r.id },
        G.el('span', { class: 'g-ref__n', 'aria-hidden': 'true' }, /^tr\d+$/.test(r.id) ? 'T' + r.id.slice(2) : String(r.id).replace(/^r/, '')),
        G.el('div', { class: 'g-ref__main' }, titleEl, meta, r.note ? mdInline('p', 'g-ref__note', r.note, null) : null)));
    });
    return ul;
  }

  /* ---------- level page ---------- */
  function section(id, iconName, kicker, title) {
    var h2 = G.el('h2', { class: 'g-sec__title', tabindex: '-1' }, title);
    var body = G.el('div', { class: 'g-sec__body' });
    var el = G.el('section', { class: 'g-sec g-sec--' + id, id: 'sec-' + id, 'data-mark': 'sec-' + id },
      G.el('header', { class: 'g-sec__head' },
        G.el('span', { class: 'g-sec__icon', 'aria-hidden': 'true' }, ui.icon(iconName, 22)),
        G.el('div', null, G.el('div', { class: 'g-eyebrow' }, kicker), h2)),
      body);
    return { el: el, body: body };
  }

  function levelPage(world, level, opts) {
    opts = opts || {};
    var refs = {};
    (world.references || []).forEach(function (r) { refs[r.id] = r; });
    var ctx = { world: world, level: level, refs: refs, levelId: level.id, worldId: world.id };
    var toc = [];
    var env = { top: true, toc: toc };

    var el = G.el('article', { class: 'g-lvl g-scope', 'data-world': world.id, 'data-level': level.id, 'data-kind': level.kind });
    ui.storeCall('touchLevel', level.id);

    var keyBanner = G.el('div', { class: 'g-lvl__key', hidden: true, role: 'note' },
      G.el('span', { class: 'g-key__badge' }, ui.icon('eye', 14), 'Answer key'),
      G.el('span', null, 'Facilitator mode is on. Answers and model answers are visible. Turn it off in Settings.'));
    el.appendChild(keyBanner);

    if (level.brief) {
      el.appendChild(G.el('section', { class: 'g-brief g-blk g-blk--wide', 'aria-label': 'The problem' },
        G.el('div', { class: 'g-brief__label' }, ui.icon('target', 16), 'The problem'),
        mdBlock('g-brief__text', level.brief, ctx)));
    }

    el.appendChild(renderBlocks(level.blocks || [], ctx, env));

    var hasQuiz = level.quiz && level.quiz.length;
    var quizHandle = null, defendHandle = null;
    if (hasQuiz) {
      var qs = section('quiz', 'check', 'Practice', 'Check yourself');
      toc.push({ id: 'sec-quiz', text: 'Check yourself', level: 2 });
      el.appendChild(qs.el);
      if (G.quiz && G.quiz.mount) quizHandle = G.quiz.mount(qs.body, level.quiz, ctx);
      else qs.body.textContent = 'Quiz unavailable.';
    }
    if (level.defend) {
      var ds = section('defend', 'trophy', 'Boss challenge', 'Defend it');
      toc.push({ id: 'sec-defend', text: 'Defend it', level: 2 });
      el.appendChild(ds.el);
      if (G.defend && G.defend.mount) defendHandle = G.defend.mount(ds.body, level.defend, ctx);
      else ds.body.textContent = 'Defend task unavailable.';
    }
    if (level.takeaways && level.takeaways.length) {
      var ts = section('takeaways', 'bulb', 'Remember', 'Key takeaways');
      toc.push({ id: 'sec-takeaways', text: 'Key takeaways', level: 2 });
      var ul = G.el('ul', { class: 'g-takeaways' });
      level.takeaways.forEach(function (t) {
        ul.appendChild(G.el('li', null, G.el('span', { class: 'g-takeaways__icon', 'aria-hidden': 'true' }, ui.icon('check', 16)), mdInline('span', null, t, ctx)));
      });
      ts.body.appendChild(ul);
      el.appendChild(ts.el);
    }
    if (level.refs && level.refs.length) {
      var rs = section('references', 'book', 'Go to the source', 'References');
      toc.push({ id: 'sec-references', text: 'References', level: 2 });
      rs.body.appendChild(refList(world, level.refs));
      el.appendChild(rs.el);
    }

    /* footer */
    var doneBtn = ui.button({ cls: 'g-btn--primary g-btn--lg', icon: 'check', label: 'Mark as done' });
    var doneState = G.el('span', { class: 'g-done__state', role: 'status', 'aria-live': 'polite' });
    var doneHint = G.el('span', { class: 'g-done__hint' }, hasQuiz || level.defend ? 'Finishing the quiz' + (level.defend ? ' and saving your self-score' : '') + ' also completes this level.' : '');
    function paintDone() {
      var done = ui.storeCall('levelStatus', level.id) === 'done';
      doneBtn.hidden = done;
      doneHint.hidden = done || !doneHint.textContent;
      G.clear(doneState);
      if (done) { doneState.appendChild(ui.icon('check', 18)); doneState.appendChild(document.createTextNode('Level completed')); }
    }
    doneBtn.addEventListener('click', function () {
      ui.storeCall('completeLevel', level.id, world.id);
      paintDone();
      ui.announce('Level marked as done.');
    });
    function pagerLink(kind, link) {
      if (!link) return G.el('span', { class: 'g-pager__spacer' });
      return G.el('a', { class: 'g-pager__link g-pager__' + kind, href: link.href },
        G.el('span', { class: 'g-pager__dir' }, kind === 'prev' ? ui.icon('arrow-left', 16) : null, kind === 'prev' ? 'Previous' : 'Next', kind === 'next' ? ui.icon('arrow-right', 16) : null),
        G.el('span', { class: 'g-pager__title' }, link.title));
    }
    el.appendChild(G.el('footer', { class: 'g-lvl__footer g-blk g-blk--wide' },
      G.el('div', { class: 'g-done' }, doneBtn, doneState, doneHint),
      G.el('nav', { class: 'g-pager', 'aria-label': 'Level navigation' }, pagerLink('prev', opts.prev), pagerLink('next', opts.next))));
    paintDone();

    /* facilitator mode and live status */
    function paintKey() {
      var on = ui.facilitator();
      keyBanner.hidden = !on;
      el.classList.toggle('is-key', on);
    }
    paintKey();
    ui.subscribe(el, 'store:change', function () { paintKey(); paintDone(); });
    ui.subscribe(el, 'level:complete', paintDone);

    /* mark sections seen */
    var observer = null;
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          ui.storeCall('markSection', level.id, en.target.getAttribute('data-mark'));
          observer.unobserve(en.target);
        });
        if (!el.isConnected && observer) { /* page was replaced */ observer.disconnect(); }
      }, { rootMargin: '0px 0px -35% 0px', threshold: 0 });
      Array.prototype.forEach.call(el.querySelectorAll('[data-mark]'), function (n) { observer.observe(n); });
    }

    return {
      el: el,
      toc: toc,
      destroy: function () {
        if (observer) observer.disconnect();
        if (quizHandle && quizHandle.destroy) quizHandle.destroy();
        if (defendHandle && defendHandle.destroy) defendHandle.destroy();
      }
    };
  }

  /* ---------- topic page ---------- */
  var KIND_LABEL = { topic: 'Topic', level: 'Practice problem', boss: 'Boss round' };
  var WHERE_ICONS = ['map', 'layers', 'target', 'sparkles', 'book', 'flag'];

  function tsec(id, tone, iconName, kicker, title) {
    var h2 = G.el('h2', { class: 'g-tsec__title', id: 'sec-' + id + '-h', tabindex: '-1' }, title);
    var body = G.el('div', { class: 'g-tsec__body' });
    var el = G.el('section', { class: 'g-tsec g-tsec--' + tone, id: 'sec-' + id, 'aria-labelledby': 'sec-' + id + '-h' },
      G.el('header', { class: 'g-tsec__head' },
        G.el('span', { class: 'g-tsec__icon', 'aria-hidden': 'true' }, ui.icon(iconName, 22)),
        G.el('div', null, G.el('div', { class: 'g-tsec__kicker' }, kicker), h2)),
      body);
    return { el: el, body: body, id: id, title: title };
  }

  function setBtnIcon(btn, name) {
    var old = btn.querySelector('.g-ic');
    var fresh = ui.icon(name, 18);
    if (old) btn.replaceChild(fresh, old); else btn.insertBefore(fresh, btn.firstChild);
  }

  function colIndex(head, re) {
    for (var i = 1; i < (head || []).length; i++) if (re.test(G.md.text(head[i]))) return i;
    return -1;
  }

  /* Comparison table: sticky first column, "loses when" column marked with an icon and its own tint.
     Below 40rem each row becomes a card (cells carry data-label). */
  function altTable(alt, ctx) {
    var head = alt.head || [];
    var lose = colIndex(head, /los|avoid|weak|fail|break|worse/i);
    if (lose < 0 && head.length > 2) lose = 2;
    var win = colIndex(head, /win|best|strong|better/i);
    if (win === lose) win = -1;
    var table = G.el('table', { class: 'g-table g-alt' });
    var tr = G.el('tr');
    head.forEach(function (h, i) {
      var th = G.el('th', { scope: 'col', class: i === lose ? 'is-loses' : i === win ? 'is-wins' : null });
      if (i === lose) th.appendChild(ui.icon('cross', 12));
      else if (i === win) th.appendChild(ui.icon('check', 12));
      th.appendChild(mdInline('span', null, h, ctx));
      tr.appendChild(th);
    });
    table.appendChild(G.el('thead', null, tr));
    var tbody = G.el('tbody');
    (alt.rows || []).forEach(function (row) {
      var self = /\(this|this topic/i.test(G.md.text(row[0]));
      var r = G.el('tr', { class: self ? 'is-self' : null });
      row.forEach(function (cell, i) {
        var td = G.el(i === 0 ? 'th' : 'td', {
          scope: i === 0 ? 'row' : null,
          'data-label': i === 0 ? null : G.md.text(head[i] || ''),
          class: i === lose ? 'is-loses' : i === win ? 'is-wins' : null
        });
        md(td, cell, ctx, 'inline');
        r.appendChild(td);
      });
      tbody.appendChild(r);
    });
    table.appendChild(tbody);
    return G.el('div', { class: 'g-table-wrap g-alt-wrap', role: 'region', tabindex: '0', 'aria-label': (alt.title ? G.md.text(alt.title) : 'Comparison') + ', scrollable' }, table);
  }

  function relatedItems(ids) {
    var worlds = (G.manifest && G.manifest.worlds) || [];
    var out = [];
    (ids || []).forEach(function (id) {
      var m = /^(w\d+)-([tl])\d+$/.exec(String(id));
      if (!m) return;
      var w = worlds.filter(function (x) { return x.id === m[1]; })[0];
      if (!w) return;
      var it = null, kind = 'topic';
      if (m[2] === 't') it = (w.topics || []).filter(function (t) { return t.id === id; })[0];
      else {
        it = (w.levels || []).filter(function (l) { return l.id === id; })[0];
        kind = it && it.kind === 'boss' ? 'boss' : 'level';
      }
      if (it) out.push({ id: id, title: it.title, kind: kind, world: w });
    });
    return out;
  }

  /* One shared load of scenario.js (Guide.loadScript only resolves the last of several concurrent callers). */
  var scenarioLoad = null;
  function ensureScenario() {
    if (G.scenario && G.scenario.mount) return Promise.resolve();
    if (!G.loadScript) return Promise.reject(new Error('no loader'));
    if (!scenarioLoad) {
      scenarioLoad = G.loadScript('assets/js/scenario.js').then(function () {
        if (!(G.scenario && G.scenario.mount)) throw new Error('scenario.js did not register');
      }, function (err) { scenarioLoad = null; throw err; });
    }
    return scenarioLoad;
  }

  function topicPage(world, topic, opts) {
    opts = opts || {};
    var refs = {};
    (world.references || []).forEach(function (r) { refs[r.id] = r; });
    var ctx = { world: world, topic: topic, refs: refs, topicId: topic.id, worldId: world.id };
    var toc = [];
    var handles = [];
    var gone = false;
    var chapterNo = parseInt(String(world.id).replace(/\D/g, ''), 10);

    var el = G.el('article', { class: 'g-lvl g-tp g-scope', 'data-world': world.id, 'data-topic': topic.id, 'data-kind': 'topic' });
    ui.storeCall('touchTopic', topic.id);

    var keyBanner = G.el('div', { class: 'g-lvl__key', hidden: true, role: 'note' },
      G.el('span', { class: 'g-key__badge' }, ui.icon('eye', 14), 'Answer key'),
      G.el('span', null, 'Facilitator mode is on. Scenario verdicts are visible. Turn it off in Settings.'));
    el.appendChild(keyBanner);

    /* header */
    var bmBtn = ui.button({ cls: 'g-btn--ghost g-btn--sm', icon: 'bookmark', label: 'Bookmark', attrs: { 'aria-pressed': 'false' } });
    var printBtn = ui.button({ cls: 'g-btn--ghost g-btn--sm', icon: 'print', label: 'Print', onClick: function () { window.print(); } });
    var statusHost = G.el('span', { class: 'g-tph__status' });
    function paintBm() {
      var on = !!ui.storeCall('isBookmarked', topic.id);
      bmBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      setBtnIcon(bmBtn, on ? 'bookmark-fill' : 'bookmark');
      ui.setBtnLabel(bmBtn, on ? 'Bookmarked' : 'Bookmark');
    }
    bmBtn.addEventListener('click', function () { ui.storeCall('toggleBookmark', topic.id); paintBm(); });
    var worldIcon = G.el('span', { class: 'g-tph__wicon', 'aria-hidden': 'true' });
    if (G.icons && G.icons.world) worldIcon.innerHTML = G.icons.world(world.id, { size: 20 });
    var advanced = topic.difficulty === 'advanced';
    el.appendChild(G.el('header', { class: 'g-tph g-blk g-blk--wide' },
      G.el('div', { class: 'g-tph__band' },
        G.el('a', { class: 'g-tph__chapter', href: '#/w/' + world.id }, worldIcon,
          G.el('span', null, 'Chapter ' + (isNaN(chapterNo) ? '' : chapterNo + ' \u00B7 ') + (world.short || world.title))),
        topic.group ? G.el('span', { class: 'g-tph__group' }, ui.icon('chevron-right', 14), topic.group) : null),
      G.el('div', { class: 'g-tph__main' },
        mdInline('h1', 'g-tph__title', topic.title, ctx),
        G.el('div', { class: 'g-tph__meta' },
          ui.chip(advanced ? 'Advanced' : 'Core', advanced ? 'preview' : 'info', advanced ? 'sparkles' : 'book'),
          topic.minutes ? ui.chip(topic.minutes + ' min read', 'neutral', 'clock') : null,
          statusHost,
          G.el('span', { class: 'g-tph__actions' }, bmBtn, printBtn)))));

    /* 1. At a glance */
    var glance = tsec('glance', 'accent', 'sparkles', 'Start here', 'At a glance');
    glance.body.appendChild(G.el('div', { class: 'g-glance' },
      mdBlock('g-glance__summary', topic.summary, ctx),
      G.el('div', { class: 'g-usepair' },
        G.el('div', { class: 'g-use g-use--yes' },
          G.el('div', { class: 'g-use__label' }, ui.icon('check', 18), 'Use it when'),
          mdBlock('g-use__text', topic.useIf, ctx)),
        G.el('div', { class: 'g-use g-use--no' },
          G.el('div', { class: 'g-use__label' }, ui.icon('warn', 18), 'Avoid it when'),
          mdBlock('g-use__text', topic.avoidIf, ctx)))));
    function addSection(s) { toc.push({ id: 'sec-' + s.id, text: s.title, level: 2 }); el.appendChild(s.el); }
    addSection(glance);

    /* 2. How it works */
    if (topic.explain && topic.explain.length) {
      var how = tsec('how', 'info', 'layers', 'The idea', 'How it works');
      var innerToc = [];
      how.body.appendChild(renderBlocks(topic.explain, ctx, { top: true, toc: innerToc }));
      addSection(how);
      innerToc.forEach(function (t) { toc.push(t); });
    }

    /* 3. Where to use it */
    if (topic.whereToUse && topic.whereToUse.length) {
      var where = tsec('where', 'preview', 'map', 'Real places', 'Where to use it');
      var cards = G.el('ul', { class: 'g-where' });
      topic.whereToUse.forEach(function (t, i) {
        cards.appendChild(G.el('li', { class: 'g-where__card' },
          G.el('span', { class: 'g-where__icon', 'aria-hidden': 'true' }, ui.icon(WHERE_ICONS[i % WHERE_ICONS.length], 20)),
          mdInline('span', 'g-where__text', t, ctx)));
      });
      where.body.appendChild(cards);
      addSection(where);
    }

    /* 4. When to use it */
    var wt = topic.whenToUse || {};
    if ((wt.use && wt.use.length) || (wt.avoid && wt.avoid.length) || (wt.flips && wt.flips.length)) {
      var when = tsec('when', 'ok', 'check', 'The decision', 'When to use it');
      var panels = G.el('div', { class: 'g-when3' });
      [['use', 'Use it when', 'check', 'check', 'yes'], ['avoid', 'Avoid it when', 'warn', 'cross', 'no'], ['flips', 'What flips the choice', 'refresh', 'arrow-right', 'flip']].forEach(function (p) {
        var items = wt[p[0]];
        if (!items || !items.length) return;
        var ul = G.el('ul', { class: 'g-w3__list' });
        items.forEach(function (t) {
          ul.appendChild(G.el('li', null, G.el('span', { class: 'g-w3__mark', 'aria-hidden': 'true' }, ui.icon(p[3], 13)), mdInline('span', null, t, ctx)));
        });
        panels.appendChild(G.el('div', { class: 'g-w3 g-w3--' + p[4] },
          G.el('div', { class: 'g-w3__label' }, ui.icon(p[2], 18), p[1]), ul));
      });
      when.body.appendChild(panels);
      addSection(when);
    }

    /* 5. Compared with alternatives */
    var alt = topic.alternatives;
    if (alt && alt.rows && alt.rows.length) {
      var cmp = tsec('compare', 'accent', 'grid', 'Neighbours', 'Compared with alternatives');
      if (alt.title) cmp.body.appendChild(mdBlock('g-tsec__lead', alt.title, ctx));
      cmp.body.appendChild(altTable(alt, ctx));
      addSection(cmp);
    }

    /* 6. Pitfalls */
    if (topic.pitfalls && topic.pitfalls.length) {
      var pit = tsec('pitfalls', 'bad', 'warn', 'What goes wrong', 'Pitfalls');
      var pl = G.el('div', { class: 'g-fail__list' });
      topic.pitfalls.forEach(function (it) {
        function cell(label, iconName, tone, text) {
          return G.el('div', { class: 'g-fail__cell g-fail__cell--' + tone },
            G.el('div', { class: 'g-fail__label' }, ui.icon(iconName, 14), label), mdBlock('g-fail__text', text, ctx));
        }
        pl.appendChild(G.el('article', { class: 'g-fail__item' },
          cell('Symptom', 'warn', 'symptom', it.symptom), cell('Cause', 'search', 'cause', it.cause), cell('Fix', 'check', 'fix', it.fix)));
      });
      pit.body.appendChild(pl);
      addSection(pit);
    }

    /* 7. Scenarios */
    var scenarios = topic.scenarios || [];
    if (scenarios.length) {
      var scs = tsec('scenarios', 'warn', 'target', 'Trade-off practice', 'Scenarios');
      scs.body.appendChild(G.el('p', { class: 'g-tsec__lead' }, 'Choose what you would do, then check. Every option is explained afterwards, including what it costs.'));
      scenarios.forEach(function (sc, i) {
        var host = G.el('div', { class: 'g-sc-host' });
        var sctx = Object.assign({}, ctx, { index: i + 1, count: scenarios.length });
        scs.body.appendChild(host);
        function mountIt() {
          if (gone) return;
          try { handles.push(G.scenario.mount(host, sc, sctx)); }
          catch (err) { console.error(err); host.textContent = 'This scenario could not be shown.'; }
        }
        if (G.scenario && G.scenario.mount) mountIt();
        else {
          host.appendChild(G.el('div', { class: 'g-skeleton', 'aria-hidden': 'true' }, G.el('span'), G.el('span'), G.el('span')));
          ensureScenario().then(function () { G.clear(host); mountIt(); }, function () { host.textContent = 'Scenario practice is unavailable.'; });
        }
      });
      addSection(scs);
    }

    /* 8. Check yourself */
    if (topic.quiz && topic.quiz.length) {
      var qs = tsec('check', 'ok', 'check', 'Quick checks', 'Check yourself');
      addSection(qs);
      if (G.quiz && G.quiz.mount) handles.push(G.quiz.mount(qs.body, topic.quiz, ctx));
      else qs.body.textContent = 'Quiz unavailable.';
    }

    /* 9. Related */
    var rel = relatedItems(topic.related);
    if (rel.length) {
      var rs = tsec('related', 'muted', 'link', 'Keep going', 'Related');
      var chips = G.el('ul', { class: 'g-rel' });
      rel.forEach(function (r) {
        chips.appendChild(G.el('li', null, G.el('a', { class: 'g-rel__link g-rel__link--' + r.kind, href: '#/w/' + r.world.id + '/' + r.id },
          G.el('span', { class: 'g-rel__kind' }, KIND_LABEL[r.kind] + (r.world.id !== world.id ? ' \u00B7 Ch ' + parseInt(r.world.id.slice(1), 10) : '')),
          G.el('span', { class: 'g-rel__title' }, r.title),
          ui.icon('arrow-right', 14))));
      });
      rs.body.appendChild(chips);
      addSection(rs);
    }

    /* 10. References */
    if (topic.refs && topic.refs.length) {
      var rf = tsec('references', 'muted', 'book', 'Go to the source', 'References');
      rf.body.appendChild(refList(world, topic.refs));
      addSection(rf);
    }

    /* footer */
    var canMark = !!(G.store && typeof G.store.markTopic === 'function');
    var localReviewed = false;
    var reviewBtn = ui.button({ cls: 'g-btn--primary g-btn--lg', icon: 'check', label: 'Mark as reviewed' });
    var reviewState = G.el('span', { class: 'g-done__state', role: 'status', 'aria-live': 'polite' });
    function reviewed() {
      var s = ui.storeCall('topicStatus', topic.id);
      return s ? s === 'reviewed' : localReviewed;
    }
    function paintReview() {
      var done = reviewed();
      reviewBtn.hidden = !canMark || done;
      G.clear(reviewState);
      G.clear(statusHost);
      if (done) {
        reviewState.appendChild(ui.icon('check', 18));
        reviewState.appendChild(document.createTextNode('Topic reviewed'));
        statusHost.appendChild(ui.chip('Reviewed', 'ok', 'check'));
      }
    }
    reviewBtn.addEventListener('click', function () {
      ui.storeCall('markTopic', topic.id, world.id);
      localReviewed = true;
      paintReview();
      ui.announce('Topic marked as reviewed.');
    });
    function pagerLink(kind, link) {
      if (!link) return G.el('span', { class: 'g-pager__spacer' });
      return G.el('a', { class: 'g-pager__link g-pager__' + kind, href: link.href },
        G.el('span', { class: 'g-pager__dir' }, kind === 'prev' ? ui.icon('arrow-left', 16) : null, kind === 'prev' ? 'Previous topic' : 'Next topic', kind === 'next' ? ui.icon('arrow-right', 16) : null),
        G.el('span', { class: 'g-pager__title' }, link.title));
    }
    el.appendChild(G.el('footer', { class: 'g-lvl__footer g-blk g-blk--wide' },
      G.el('div', { class: 'g-done' }, reviewBtn, reviewState,
        G.el('span', { class: 'g-done__hint' }, canMark ? 'Reviewing a topic adds it to your progress.' : '')),
      G.el('nav', { class: 'g-pager', 'aria-label': 'Topic navigation' }, pagerLink('prev', opts.prev), pagerLink('next', opts.next))));

    function paintKey() {
      var on = ui.facilitator();
      keyBanner.hidden = !on;
      el.classList.toggle('is-key', on);
    }
    paintBm(); paintReview(); paintKey();
    ui.subscribe(el, 'store:change', function () { paintKey(); paintReview(); paintBm(); });
    ui.subscribe(el, 'topic:reviewed', paintReview);

    return {
      el: el,
      toc: toc,
      destroy: function () {
        gone = true;
        handles.forEach(function (h) { if (h && h.destroy) { try { h.destroy(); } catch (e) { console.error(e); } } });
      }
    };
  }

  /* Expand collapsed content when printing */
  var reopened = [];
  window.addEventListener('beforeprint', function () {
    reopened = [];
    Array.prototype.forEach.call(document.querySelectorAll('details.g-acc:not([open]), details.g-sc__unk:not([open])'), function (d) { d.open = true; reopened.push(d); });
  });
  window.addEventListener('afterprint', function () {
    reopened.forEach(function (d) { d.open = false; });
    reopened = [];
  });

  G.render = {
    levelPage: levelPage,
    topicPage: topicPage,
    blocks: function (blocks, ctx) {
      ctx = ctx || {};
      if (!ctx.refs && ctx.world) {
        ctx.refs = {};
        (ctx.world.references || []).forEach(function (r) { ctx.refs[r.id] = r; });
      }
      return renderBlocks(blocks, ctx, { top: false, toc: [] });
    },
    block: function (b, ctx) { return renderBlock(b, ctx || {}, { top: false, toc: [] }); },
    refList: refList,
    code: renderCode,
    highlight: highlight
  };
})();
