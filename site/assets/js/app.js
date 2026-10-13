/* Follow the Question: app boot. Owner: E1. Loaded last. */
(function () {
  'use strict';

  const G = window.Guide;

  function fatal(message) {
    const main = document.getElementById('main');
    if (!main) return;
    main.innerHTML = '';
    const box = G.el('div', { class: 'noscript-card', role: 'alert' },
      G.el('h1', null, 'The guide could not start'),
      G.el('p', null, message),
      G.el('p', { class: 't-muted t-sm' }, 'If you build the guide from source, run node tools/build.mjs. If you opened a zip, extract every file before opening index.html.'));
    main.appendChild(box);
  }

  /* Print: open collapsed content and show every tab panel so nothing is lost on paper. */
  function beforePrint() {
    document.querySelectorAll('details:not([open])').forEach((d) => { d.setAttribute('open', ''); d.setAttribute('data-print-opened', ''); });
    document.querySelectorAll('[role="tabpanel"][hidden]').forEach((p) => {
      p.hidden = false;
      p.setAttribute('data-print-unhid', '');
      if (p.querySelector('.g-tabs__printlabel')) return; // the renderer labels its own tabs
      const tab = p.getAttribute('aria-labelledby') ? document.getElementById(p.getAttribute('aria-labelledby')) : null;
      if (tab) p.insertBefore(G.el('div', { class: 'print-tab-label' }, 'Variant: ' + tab.textContent.trim()), p.firstChild);
    });
  }
  function afterPrint() {
    document.querySelectorAll('[data-print-opened]').forEach((d) => { d.removeAttribute('open'); d.removeAttribute('data-print-opened'); });
    document.querySelectorAll('[data-print-unhid]').forEach((p) => { p.hidden = true; p.removeAttribute('data-print-unhid'); });
    document.querySelectorAll('.print-tab-label').forEach((n) => n.remove());
  }

  function boot() {
    if (!G.manifest || !G.manifest.worlds) {
      fatal('The content manifest is missing, so there is nothing to show yet.');
      return;
    }
    if (!G.store || !G.shell || !G.router) {
      fatal('Part of the application did not load.');
      return;
    }
    try {
      G.shell.init();
      if (G.search && G.search.init) G.search.init();
      window.addEventListener('beforeprint', beforePrint);
      window.addEventListener('afterprint', afterPrint);
      G.router.start();
    } catch (err) {
      console.error(err);
      fatal('Something went wrong while starting: ' + (err && err.message ? err.message : err));
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
