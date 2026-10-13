/* Follow the Question: labs index and lab page. Owner: E1.
   Registers Guide.views.labs and Guide.views.lab. Labs themselves are built by E3 and mounted through Guide.labs.open. */
(function () {
  'use strict';

  const G = window.Guide;
  const el = G.el;
  const U = () => G.ui;
  G.views = G.views || {};

  const labs = () => (G.labs && G.labs.manifest ? G.labs.manifest : []);

  G.views.labs = function () {
    const root = el('div', { class: 'view labs' });
    root.appendChild(el('header', { class: 'view-head' },
      el('p', { class: 'eyebrow' }, 'Interactive labs'),
      el('h1', null, 'Learn by moving the numbers'),
      el('p', { class: 'lead view-head__lead' }, 'Each lab is a small simulator. Change the inputs, watch the outputs and charts move, then follow the three guided experiments under "What to notice". Defaults are illustrative, not vendor figures.')));

    const list = labs();
    if (!list.length) {
      root.appendChild(U().emptyState({ icon: 'flask', title: 'No labs in this build', text: 'The lab registry did not load.' }));
    } else {
      const grid = el('ul', { class: 'lab-grid', role: 'list' });
      list.forEach((l) => {
        const w = U().worldMeta(l.world);
        const p = w ? G.store.worldProgress(w.id) : null;
        grid.appendChild(el('li', { class: 'lab-li' },
          el('a', { class: 'ui-card ui-card--link lab-card', href: '#/labs/' + l.id, 'data-world': l.world },
            el('span', { class: 'lab-card__top' },
              el('span', { class: 'lab-card__icon' }, U().icon('flask', 22)),
              w ? el('span', { class: 'lab-card__world' }, el('span', { class: 'ui-dot' }), 'Chapter ' + U().worldNo(w.id) + ': ' + (w.short || w.title)) : null),
            el('strong', { class: 'lab-card__title' }, l.title),
            el('span', { class: 'lab-card__blurb' }, l.blurb),
            el('span', { class: 'lab-card__go' }, 'Open lab', U().icon('arrow-right', 16)),
            p && p.pct === 100 ? el('span', { class: 'lab-card__done' }, U().chip('Chapter complete', 'ok', { icon: 'check' })) : null)));
      });
      root.appendChild(grid);
    }
    return { el: root, title: 'Labs', world: 'home', crumbs: [{ label: 'Journey', href: '#/' }, { label: 'Labs' }] };
  };

  G.views.lab = function (route) {
    const id = route.params.lab;
    const meta = G.labs && G.labs.meta ? G.labs.meta(id) : null;
    if (!meta) return G.views.notfound(route);
    const w = U().worldMeta(meta.world);
    const root = el('div', { class: 'view lab-view', 'data-world': meta.world });
    const host = el('div', { class: 'lab-host', 'aria-busy': 'true' });
    let handle = null;
    let dead = false;

    root.appendChild(el('header', { class: 'lab-head' },
      el('div', { class: 'lab-head__top' },
        U().chip('Interactive lab', 'accent', { icon: 'flask' }),
        w ? el('a', { class: 'lab-head__world', href: U().worldHref(w.id) }, 'Part of Chapter ' + U().worldNo(w.id) + ': ' + (w.short || w.title)) : null),
      el('h1', { class: 'lab-head__title' }, meta.title),
      el('p', { class: 'lab-head__blurb' }, meta.blurb)));
    root.appendChild(host);
    root.appendChild(el('p', { class: 'lab-foot t-muted t-sm' }, 'Labs are teaching simulations. The numbers are illustrative and are not benchmarks or vendor pricing. Your settings are saved in this browser.'));

    function failure(message) {
      G.clear(host);
      host.removeAttribute('aria-busy');
      host.appendChild(U().emptyState({
        error: true, icon: 'flask', title: 'This lab is not available yet',
        text: message || 'The lab script could not be loaded.',
        actions: [U().btn({ text: 'Try again', icon: 'refresh', kind: 'primary', onClick: () => { open(); } }), U().btn({ text: 'All labs', href: '#/labs' })]
      }));
    }
    function open() {
      if (G.router && G.router.purgeFailedScripts) G.router.purgeFailedScripts();
      G.clear(host);
      host.setAttribute('aria-busy', 'true');
      host.appendChild(el('div', { class: 'lab-loading', role: 'status' }, el('span', { class: 'ui-spinner' }), el('span', null, 'Loading lab')));
      if (!G.labs || !G.labs.open) { failure('The lab loader is missing.'); return; }
      G.labs.open(id, host).then((h) => {
        if (dead) { if (h && h.destroy) h.destroy(); return; }
        if (!h) { failure(); return; }
        handle = h;
        host.removeAttribute('aria-busy');
        if (G.shell.refreshSpy) G.shell.refreshSpy();
      }).catch((err) => { console.error(err); failure(err && err.message); });
    }
    open();

    return {
      el: root, title: meta.title + ' (lab)', world: meta.world,
      crumbs: [{ label: 'Journey', href: '#/' }, { label: 'Labs', href: '#/labs' }, { label: meta.title }],
      destroy: () => { dead = true; if (handle && handle.destroy) { try { handle.destroy(); } catch (e) { console.error(e); } } }
    };
  };
})();
