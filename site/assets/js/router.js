/* Follow the Question: hash router. Owner: E1.
   Routes (contract): #/  #/topics  #/w/<w>  #/w/<w>/<topic or level id>  #/w/<w>/cheatsheet  #/cards[/<w>]  #/labs[/<id>]  #/library  #/glossary  #/bookmarks  #/progress  #/search?q=  #/about
   A topic id ends in -t<n> and a practice problem id in -l<n>. In-page jumps use ?s=<section-id> so the hash stays a route.

   A view is a function Guide.views.<name>(route) returning (or resolving to):
     { el, title, world?, crumbs?, toc?, tocSlot?, onQuery?(query), afterMount?(), destroy?() }
   Anchors that are not routes (for example #main or #some-heading) are handled as in-page jumps. */
(function () {
  'use strict';

  const G = window.Guide;
  const el = G.el;
  const SITE = 'Follow the Question';

  G.views = G.views || {};

  const ROUTES = [
    { name: 'home', re: /^\/?$/, keys: [] },
    { name: 'topics', re: /^\/topics\/?$/, keys: [] },
    { name: 'world', re: /^\/w\/(w\d+)\/?$/, keys: ['world'] },
    { name: 'cheatsheet', re: /^\/w\/(w\d+)\/cheatsheet\/?$/, keys: ['world'] },
    { name: 'topic', re: /^\/w\/(w\d+)\/(w\d+-t\d+)\/?$/, keys: ['world', 'topic'] },
    { name: 'level', re: /^\/w\/(w\d+)\/([\w-]+)\/?$/, keys: ['world', 'level'] },
    { name: 'cards', re: /^\/cards(?:\/(w\d+))?\/?$/, keys: ['world'] },
    { name: 'labs', re: /^\/labs\/?$/, keys: [] },
    { name: 'lab', re: /^\/labs\/([\w-]+)\/?$/, keys: ['lab'] },
    { name: 'library', re: /^\/library\/?$/, keys: [] },
    { name: 'glossary', re: /^\/glossary\/?$/, keys: [] },
    { name: 'bookmarks', re: /^\/bookmarks\/?$/, keys: [] },
    { name: 'progress', re: /^\/progress\/?$/, keys: [] },
    { name: 'search', re: /^\/search\/?$/, keys: [] },
    { name: 'about', re: /^\/about\/?$/, keys: [] }
  ];

  let current = null;
  let activeView = null;
  let token = 0;
  let popped = false;
  let navIntent = 0; // time of the last click or programmatic navigation, to tell back and forward apart
  const positions = {};
  const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function safeDecode(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }

  function qs(query) {
    const parts = [];
    Object.keys(query || {}).forEach((k) => {
      const v = query[k];
      if (v === undefined || v === null || v === '') return;
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
    });
    return parts.length ? '?' + parts.join('&') : '';
  }

  /* Returns a route object, or null when the hash is an in-page anchor rather than a route. */
  function parse(hash) {
    const h = String(hash || '').replace(/^#/, '');
    if (h && h.charAt(0) !== '/') return null;
    const qi = h.indexOf('?');
    let path = qi >= 0 ? h.slice(0, qi) : h;
    const query = {};
    if (qi >= 0) new URLSearchParams(h.slice(qi + 1)).forEach((v, k) => { query[k] = v; });
    path = path.replace(/\/{2,}/g, '/') || '/';
    for (let i = 0; i < ROUTES.length; i++) {
      const m = ROUTES[i].re.exec(path);
      if (!m) continue;
      const params = {};
      ROUTES[i].keys.forEach((k, j) => { if (m[j + 1]) params[k] = safeDecode(m[j + 1]); });
      return { name: ROUTES[i].name, params: params, query: query, path: path };
    }
    return { name: 'notfound', params: {}, query: query, path: path };
  }

  function href(path, query) { return '#' + path + qs(query); }
  function go(path, query, opts) {
    const h = href(path, query);
    navIntent = Date.now();
    if (opts && opts.replace) { history.replaceState(null, '', h); onHash(); } else location.hash = h;
  }

  /* Update the query string of the current route without re-rendering or adding a history entry. */
  function replaceQuery(patch) {
    if (!current) return;
    const q = Object.assign({}, current.query);
    Object.keys(patch).forEach((k) => { if (patch[k] === null || patch[k] === undefined || patch[k] === '') delete q[k]; else q[k] = patch[k]; });
    current.query = q;
    try { history.replaceState(null, '', '#' + current.path + qs(q)); } catch (e) { /* ignore */ }
  }

  /* ---------- scrolling and focus ---------- */
  function pulse(node) {
    node.classList.remove('is-pulse');
    void node.offsetWidth;
    node.classList.add('is-pulse');
    setTimeout(() => node.classList.remove('is-pulse'), 1900);
  }

  function scrollToSection(id, o) {
    o = o || {};
    let tries = 0;
    let userMoved = false;
    const stop = () => { userMoved = true; };
    ['wheel', 'touchstart', 'keydown'].forEach((ev) => window.addEventListener(ev, stop, { once: true, passive: true }));
    const align = (smooth) => {
      const node = G.shell.findSection(id);
      if (!node) return null;
      node.scrollIntoView({ block: 'start', behavior: smooth && !reduceMotion() ? 'smooth' : 'auto' });
      return node;
    };
    function attempt() {
      const node = align(true);
      if (!node) { if (tries++ < 15 && !userMoved) setTimeout(attempt, 120); return; }
      pulse(node);
      if (o.focus) { node.setAttribute('tabindex', '-1'); node.focus({ preventScroll: true }); }
      if (o.updateUrl) replaceQuery({ s: id });
      // late layout shifts (diagrams, images) can move the target; realign once if the learner has not scrolled
      [450, 1100].forEach((ms) => setTimeout(() => {
        if (userMoved) return;
        const n = G.shell.findSection(id);
        if (n && Math.abs(n.getBoundingClientRect().top - 72) > 24) align(false);
      }, ms));
      if (G.shell.refreshSpy) setTimeout(G.shell.refreshSpy, 700);
    }
    attempt();
  }

  function focusHeading() {
    const h = document.querySelector('#main h1');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    else { const m = document.getElementById('main'); if (m) m.focus({ preventScroll: true }); }
  }

  function restoreScroll(y) {
    [0, 150, 450].forEach((ms) => setTimeout(() => window.scrollTo({ top: y, left: 0, behavior: 'instant' }), ms));
  }

  /* ---------- built-in views ---------- */
  G.views.notfound = function (route) {
    return {
      el: el('div', { class: 'view' }, G.ui.emptyState({
        icon: 'search', title: 'Page not found',
        text: 'There is nothing at ' + (route && route.path ? route.path : 'this address') + '. It may have moved, or the link is mistyped.',
        actions: [G.ui.btn({ text: 'Back to the journey map', icon: 'map', kind: 'primary', href: '#/' }), G.ui.btn({ text: 'Search the guide', icon: 'search', onClick: () => G.search && G.search.open() })]
      })),
      title: 'Page not found',
      crumbs: [{ label: 'Home', href: '#/' }, { label: 'Not found' }]
    };
  };

  /* Guide.loadScript never retries an element that failed, so drop failed tags before a retry. */
  function purgeFailedScripts() {
    document.querySelectorAll('script[data-src]:not([data-done])').forEach((s) => s.remove());
  }

  function errorView(err, route) {
    return {
      el: el('div', { class: 'view' }, G.ui.emptyState({
        error: true, icon: 'warn', title: 'This page could not be loaded',
        text: (err && err.message ? err.message : 'Something went wrong.') + ' If you opened the guide from a zip, make sure you extracted every file.',
        actions: [G.ui.btn({ text: 'Try again', icon: 'refresh', kind: 'primary', onClick: () => { purgeFailedScripts(); render(route); } }), G.ui.btn({ text: 'Back to the journey map', href: '#/' })]
      })),
      title: 'Error',
      crumbs: [{ label: 'Home', href: '#/' }, { label: 'Error' }]
    };
  }

  /* ---------- render pipeline ---------- */
  let hasRendered = false;
  function mount(res, route) {
    activeView = res;
    G.shell.show(res, route);
    document.title = res.title ? res.title + ' · ' + SITE : SITE + ': a dial-and-defend field guide';
    const restore = popped && positions[route.path] != null ? positions[route.path] : null;
    popped = false;
    if (route.query.s) {
      scrollToSection(route.query.s, { focus: true });
    } else {
      if (restore !== null) restoreScroll(restore); else window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      // keep the skip link first in the tab order on the initial page load; move focus on later navigations
      if (hasRendered) focusHeading();
    }
    hasRendered = true;
    if (res.afterMount) { try { res.afterMount(); } catch (e) { console.error(e); } }
    G.shell.announce((res.title || SITE) + ' loaded');
    G.bus.emit('route:change', { name: route.name, params: route.params, query: route.query });
  }

  function render(route) {
    const my = ++token;
    if (current && current.path) positions[current.path] = window.scrollY;
    if (activeView && activeView.destroy) { try { activeView.destroy(); } catch (e) { console.error(e); } }
    activeView = null;
    current = route;
    const view = G.views[route.name] || G.views.notfound;
    const timer = setTimeout(() => { if (my === token) G.shell.showLoading(); }, 90);
    let out;
    try { out = view(route); } catch (e) { out = Promise.reject(e); }
    Promise.resolve(out).then((res) => {
      clearTimeout(timer);
      if (my !== token) { if (res && res.destroy) { try { res.destroy(); } catch (e) { /* ignore */ } } return; }
      mount(res || G.views.notfound(route), route);
    }).catch((err) => {
      clearTimeout(timer);
      if (my !== token) return;
      console.error(err);
      mount(errorView(err, route), route);
    });
  }

  function onHash() {
    const route = parse(location.hash);
    if (!route) return;
    if (current && route.path === current.path) {
      current.query = route.query;
      if (activeView && activeView.onQuery) { try { activeView.onQuery(route.query); } catch (e) { console.error(e); } }
      else if (route.query.s) scrollToSection(route.query.s, { focus: true });
      return;
    }
    render(route);
  }

  /* In-page anchors (href="#some-id") would otherwise replace the route. Turn them into jumps. */
  function onDocClick(e) {
    if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    const h = a.getAttribute('href');
    if (h === '#' || h.charAt(1) === '/') return;
    const id = safeDecode(h.slice(1));
    const node = G.shell.findSection(id);
    if (!node) return;
    e.preventDefault();
    scrollToSection(id, { focus: true, updateUrl: true });
  }

  function start() {
    try { history.scrollRestoration = 'manual'; } catch (e) { /* ignore */ }
    window.addEventListener('popstate', () => { popped = Date.now() - navIntent > 600; });
    document.addEventListener('click', () => { navIntent = Date.now(); }, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Enter') navIntent = Date.now(); }, true);
    window.addEventListener('hashchange', onHash);
    document.addEventListener('click', onDocClick);
    const route = parse(location.hash) || parse('#/');
    render(route);
  }

  G.router = {
    parse: parse, href: href, go: go, start: start, replaceQuery: replaceQuery, scrollToSection: scrollToSection, purgeFailedScripts: purgeFailedScripts,
    current: () => current, rerender: () => current && render(current)
  };
})();
