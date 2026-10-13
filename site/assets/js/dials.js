/* Follow the Question: flip-the-dial ranking boards. Owner: E2.
   Guide.dials.mount(container, board, ctx) -> { destroy, reset, getSelection }
   Selection is stored per board id through Guide.store.getDials / setDials. */
(function () {
  'use strict';
  var G = (window.Guide = window.Guide || {});
  var ui = G.kit;

  var MINUS = '\u2212';
  function signed(n) { return n > 0 ? '+' + n : n < 0 ? MINUS + Math.abs(n) : '0'; }

  function mount(container, board, ctx) {
    ctx = ctx || {};
    var dials = board.dials || [];
    var options = board.options || [];
    var scores = board.scores || {};
    var uid = ui.uid('dials');
    var range = Math.max(1, dials.length * 2);
    var sel = {};
    var items = {};
    var prevOrder = null;
    var leaderId = null;
    var moveTimer = null;
    var destroyed = false;

    function defaults() {
      var d = {};
      dials.forEach(function (dial) { d[dial.id] = dial.values && dial.values[0] ? dial.values[0].id : ''; });
      return d;
    }
    function loadSelection() {
      var stored = ui.storeCall('getDials', board.id) || {};
      var d = defaults();
      dials.forEach(function (dial) {
        var v = stored[dial.id];
        if ((dial.values || []).some(function (x) { return x.id === v; })) d[dial.id] = v;
      });
      return d;
    }
    sel = loadSelection();

    function cell(optId, dialId) {
      var byDial = (scores[optId] || {})[dialId] || {};
      return byDial[sel[dialId]] || { s: 0, why: '' };
    }
    function total(optId) {
      return dials.reduce(function (sum, dial) { return sum + (+cell(optId, dial.id).s || 0); }, 0);
    }
    function valueLabel(dial) {
      var v = (dial.values || []).filter(function (x) { return x.id === sel[dial.id]; })[0];
      return v ? v.label : '';
    }

    /* ---------- skeleton ---------- */
    var titleId = uid + '-title';
    var root = G.el('section', { class: 'g-dials g-scope', 'aria-labelledby': titleId, 'data-board': board.id });
    var resetBtn = ui.button({ cls: 'g-btn--ghost g-btn--sm', icon: 'refresh', label: 'Reset dials', attrs: { 'aria-label': 'Reset dials to defaults' } });
    root.appendChild(G.el('header', { class: 'g-dials__head' },
      G.el('div', { class: 'g-dials__headtext' },
        G.el('div', { class: 'g-eyebrow' }, ui.icon('target', 14), 'Flip the dials'),
        G.el('h3', { class: 'g-board__title', id: titleId }, board.title || 'Dial board'),
        board.prompt ? ui.mdEl('div', 'g-dials__prompt', board.prompt, ctx, 'inline') : null),
      resetBtn));

    var controls = G.el('div', { class: 'g-dials__controls' });
    var radios = {};
    dials.forEach(function (dial) {
      var group = G.el('div', { class: 'g-seg', role: 'presentation' });
      radios[dial.id] = [];
      (dial.values || []).forEach(function (val) {
        var input = G.el('input', { type: 'radio', class: 'sr-only', name: uid + '-' + dial.id, value: val.id });
        input.checked = sel[dial.id] === val.id;
        radios[dial.id].push(input);
        input.addEventListener('change', function () {
          if (!input.checked) return;
          sel[dial.id] = val.id;
          ui.storeCall('setDials', board.id, Object.assign({}, sel));
          update(true);
        });
        group.appendChild(G.el('label', { class: 'g-seg__opt' }, input, G.el('span', { class: 'g-seg__txt' }, val.label)));
      });
      controls.appendChild(G.el('fieldset', { class: 'g-dial' }, G.el('legend', { class: 'g-dial__label' }, dial.label), group));
    });
    root.appendChild(controls);

    var leaderName = G.el('strong', { class: 'g-leader__name' });
    var leaderWhy = G.el('div', { class: 'g-leader__why' });
    var leaderNote = G.el('div', { class: 'g-leader__note' });
    var leader = G.el('div', { class: 'g-leader', role: 'status', 'aria-live': 'polite' },
      G.el('span', { class: 'g-leader__icon' }, ui.icon('trophy', 20)),
      G.el('div', { class: 'g-leader__body' },
        G.el('div', { class: 'g-leader__line' }, G.el('span', { class: 'g-leader__label' }, 'Best fit for these dials'), leaderName),
        leaderWhy, leaderNote));
    root.appendChild(leader);

    var list = G.el('ol', { class: 'g-rank', 'aria-label': 'Options ranked by fit' });
    options.forEach(function (opt) {
      var panelId = uid + '-panel-' + opt.id;
      var num = G.el('span', { class: 'g-rank__num' });
      var name = G.el('span', { class: 'g-rank__name' }, opt.name);
      var best = G.el('span', { class: 'g-chip g-chip--accent g-rank__best', hidden: true }, 'Best fit');
      var val = G.el('span', { class: 'g-rank__val' });
      var move = G.el('span', { class: 'g-rank__move' });
      var fill = G.el('span', { class: 'g-rank__fill' });
      var row = G.el('button', { type: 'button', class: 'g-rank__row', 'aria-expanded': 'false', 'aria-controls': panelId },
        num,
        G.el('span', { class: 'g-rank__main' },
          G.el('span', { class: 'g-rank__nameline' }, name, best),
          opt.summary ? ui.mdEl('span', 'g-rank__sum', opt.summary, ctx, 'inline') : null),
        G.el('span', { class: 'g-rank__score' }, val, move),
        G.el('span', { class: 'g-rank__chev' }, ui.icon('chevron-down', 18)),
        G.el('span', { class: 'g-rank__bar', 'aria-hidden': 'true' }, fill));
      var why = G.el('ul', { class: 'g-why' });
      var panel = G.el('div', { class: 'g-rank__panel', id: panelId, hidden: true },
        G.el('div', { class: 'g-rank__panelhead' }, 'Why it ranks here'), why);
      row.addEventListener('click', function () {
        var open = row.getAttribute('aria-expanded') === 'true';
        row.setAttribute('aria-expanded', open ? 'false' : 'true');
        panel.hidden = open;
      });
      var li = G.el('li', { class: 'g-rank__item', 'data-id': opt.id }, row, panel);
      items[opt.id] = { li: li, num: num, best: best, val: val, move: move, fill: fill, why: why, opt: opt };
      list.appendChild(li);
    });
    root.appendChild(list);

    if (board.takeaway) {
      root.appendChild(G.el('div', { class: 'g-takeaway' }, ui.icon('bulb', 18),
        ui.mdEl('div', 'g-takeaway__text', board.takeaway, ctx, 'inline')));
    }
    root.appendChild(G.el('p', { class: 'g-dials__legend' },
      'Each dial adds ' + MINUS + '2 to +2 to an option. The bar shows the total across all dials.'));

    G.clear(container);
    container.appendChild(root);

    /* ---------- update ---------- */
    function rects() {
      var out = {};
      options.forEach(function (o) { out[o.id] = items[o.id].li.getBoundingClientRect().top; });
      return out;
    }

    function sorted() {
      return options.map(function (o, i) { return { id: o.id, i: i, s: total(o.id) }; })
        .sort(function (a, b) { return b.s - a.s || a.i - b.i; });
    }

    function renderWhy(optId) {
      var it = items[optId];
      G.clear(it.why);
      dials.forEach(function (dial) {
        var c = cell(optId, dial.id);
        var tone = c.s > 0 ? 'pos' : c.s < 0 ? 'neg' : 'zero';
        var li = G.el('li', { class: 'g-why__item g-why__item--' + tone },
          G.el('div', { class: 'g-why__head' },
            G.el('span', { class: 'g-why__dial' }, dial.label),
            G.el('span', { class: 'g-why__val' }, valueLabel(dial)),
            G.el('span', { class: 'g-why__score', 'aria-label': 'Score ' + signed(c.s) }, signed(+c.s || 0))),
          c.why ? ui.mdEl('div', 'g-why__text', c.why, ctx, 'inline') : null);
        it.why.appendChild(li);
      });
    }

    function clearMove(it) {
      it.move.textContent = '';
      it.move.className = 'g-rank__move';
      it.move.removeAttribute('aria-label');
      it.li.classList.remove('is-moved');
    }

    function reasonsFor(optId) {
      return dials.map(function (dial) { return { dial: dial, c: cell(optId, dial.id) }; })
        .filter(function (x) { return x.c.s > 0 && x.c.why; })
        .sort(function (a, b) { return b.c.s - a.c.s; })
        .slice(0, 2);
    }

    function update(animate) {
      if (destroyed) return;
      var order = sorted();
      var top = order.length ? order[0].s : 0;
      var tied = order.filter(function (o) { return o.s === top; }).length > 1;
      var first = animate && !ui.reducedMotion() ? rects() : null;
      var orderKey = order.map(function (o) { return o.id; }).join('|');
      var changedOrder = prevOrder && prevOrder.join('|') !== orderKey;

      if (!prevOrder || changedOrder) {
        order.forEach(function (o) { list.appendChild(items[o.id].li); });
      }

      order.forEach(function (o, idx) {
        var it = items[o.id];
        var better = order.filter(function (x) { return x.s > o.s; }).length;
        var shared = order.filter(function (x) { return x.s === o.s; }).length > 1;
        it.num.textContent = (shared ? '=' : '') + (better + 1);
        it.num.setAttribute('aria-label', 'Rank ' + (better + 1) + (shared ? ', tied' : ''));
        it.val.textContent = signed(o.s);
        it.fill.style.setProperty('--w', Math.round(((o.s + range) / (2 * range)) * 100) + '%');
        it.li.classList.toggle('is-leader', better === 0);
        it.best.hidden = better !== 0;
        it.best.textContent = tied && better === 0 ? 'Tied for best' : 'Best fit';
        renderWhy(o.id);

        if (prevOrder) {
          var was = prevOrder.indexOf(o.id);
          var delta = was - idx;
          clearMove(it);
          if (delta !== 0 && animate) {
            it.move.textContent = (delta > 0 ? '\u25B2 ' : '\u25BC ') + Math.abs(delta);
            it.move.className = 'g-rank__move ' + (delta > 0 ? 'is-up' : 'is-down');
            it.move.setAttribute('aria-label', 'Moved ' + (delta > 0 ? 'up ' : 'down ') + Math.abs(delta));
            it.li.classList.add('is-moved');
          }
        }
      });

      if (first) {
        var last = rects();
        options.forEach(function (o) {
          var dy = first[o.id] - last[o.id];
          var li = items[o.id].li;
          if (dy && li.animate) li.animate([{ transform: 'translateY(' + dy + 'px)' }, { transform: 'none' }], { duration: 380, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' });
        });
      }

      var lead = order[0] && items[order[0].id].opt;
      var newLeaderId = order[0] ? order[0].id : null;
      var leaderChanged = leaderId !== null && newLeaderId !== leaderId && !tied;
      var prevLeader = leaderId !== null ? (items[leaderId] ? items[leaderId].opt.name : '') : '';
      leaderName.textContent = lead ? (tied ? 'Tie at the top: ' + order.filter(function (o) { return o.s === top; }).map(function (o) { return items[o.id].opt.name; }).join(', ') : lead.name) : '';
      G.clear(leaderWhy);
      if (lead && !tied) {
        reasonsFor(order[0].id).forEach(function (r) {
          var chip = G.el('span', { class: 'g-leader__reason' }, G.el('span', { class: 'g-leader__dial' }, r.dial.label + ':'));
          chip.appendChild(ui.mdEl('span', null, r.c.why, ctx, 'inline'));
          leaderWhy.appendChild(chip);
        });
      } else if (tied) {
        leaderWhy.appendChild(G.el('span', { class: 'g-leader__reason' }, 'Nothing separates these options on the current dials. Say which dial would break the tie.'));
      }
      leaderNote.textContent = leaderChanged && prevLeader ? 'The leader changed. Before: ' + prevLeader + '.' : '';
      leaderNote.hidden = !leaderNote.textContent;
      if (animate && leaderChanged) {
        leader.classList.remove('is-flash');
        void leader.offsetWidth;
        leader.classList.add('is-flash');
        if (order[0]) items[order[0].id].li.classList.add('is-new-leader');
        window.setTimeout(function () {
          Object.keys(items).forEach(function (k) { items[k].li.classList.remove('is-new-leader'); });
        }, 1600);
      }
      if (moveTimer) window.clearTimeout(moveTimer);
      if (animate) {
        moveTimer = window.setTimeout(function () {
          options.forEach(function (o) { clearMove(items[o.id]); });
        }, 6000);
      }
      leaderId = newLeaderId;
      prevOrder = order.map(function (o) { return o.id; });
    }

    resetBtn.addEventListener('click', function () {
      sel = defaults();
      dials.forEach(function (dial) {
        radios[dial.id].forEach(function (input) { input.checked = input.value === sel[dial.id]; });
      });
      ui.storeCall('setDials', board.id, Object.assign({}, sel));
      update(true);
      ui.announce('Dials reset to defaults.');
    });

    update(false);

    return {
      destroy: function () { destroyed = true; if (moveTimer) window.clearTimeout(moveTimer); G.clear(container); },
      reset: function () { resetBtn.click(); },
      getSelection: function () { return Object.assign({}, sel); }
    };
  }

  G.dials = { mount: mount };
})();
