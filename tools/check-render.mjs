#!/usr/bin/env node
// Opens site/index.html from file:// in headless Chromium and visits the routes in the manifest. It records console errors,
// page errors, failed or external requests, error views, horizontal overflow and diagrams that fall back to source.
// Topic routes (#/topics, #/w/<id>/cheatsheet, #/w/<id>/<topicId>) run in light and dark at 360 px by default. If the shell cannot
// render topic pages yet, they are reported as "topic-not-rendered" warnings and do not fail the run.
// Usage: node tools/check-render.mjs [--world w07] [--sample N] [--all] [--shots] [--budget 90] [--site <dir>] [--widths 1280]
//        [--themes light,dark] [--topic-widths 360] [--full-matrix] [--only <regex>] [--limit N] [--no-deep-links]
//        [--no-facilitator] [--timeout 15000] [--out <file>] [--headed]
// Without --world each chapter is sampled (--sample, default 2 topics and 2 practice problems). --all visits everything.
// A global watchdog (--budget seconds, default 90) stops visiting a little early, writes the report and exits. If the run still
// overruns, the browser process is killed and the tool exits 1.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import { paths, parseArgs, rel, walkBlocks, mdTable, reportFrontmatter, ToolError } from './lib/common.mjs';

const budgetMs = Math.max(20, Number((process.argv.find((a) => a.startsWith('--budget=')) || '').slice(9)) || Number(process.argv[process.argv.indexOf('--budget') + 1]) || 90) * 1000;
let browserRef = null;
setTimeout(() => {
  try { const proc = browserRef && browserRef.process && browserRef.process(); if (proc) proc.kill('SIGKILL'); } catch { /* the process exit below ends everything */ }
  console.error(`error: check-render exceeded its ${budgetMs / 1000} s watchdog and was stopped`);
  process.exit(1);
}, budgetMs);
const deadline = Date.now() + budgetMs - Math.min(15000, budgetMs * 0.2);

const args = parseArgs(process.argv.slice(2), ['site', 'widths', 'themes', 'only', 'limit', 'timeout', 'out', 'world', 'sample', 'budget', 'topic-widths']);
const siteDir = args.site ? path.resolve(args.site) : paths.site;
const indexUrl = pathToFileURL(path.join(siteDir, 'index.html')).href;
const timeout = Number(args.timeout) || 15000;
const widths = String(args.widths || '1280').split(',').map(Number).filter(Boolean);
const topicWidths = String(args['topic-widths'] || '360').split(',').map(Number).filter(Boolean);
const themes = String(args.themes || 'light,dark').split(',').filter((t) => ['light', 'dark'].includes(t));
const worldFilter = typeof args.world === 'string' ? args.world : null;
const sample = args.all ? Infinity : args.sample !== undefined ? Math.max(0, Number(args.sample) || 0) : worldFilter ? Infinity : 2;
const onlyRe = args.only ? new RegExp(args.only) : null;
const limit = args.limit ? Number(args.limit) : Infinity;
const shotsDir = path.join(paths.reviews, 'shots');
const reportFile = args.out ? path.resolve(args.out) : path.join(paths.reviews, 'render-report.md');
const slugOf = (s) => s.replace(/^#\/?/, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'home';
const TOPIC_KINDS = new Set(['topics', 'cheatsheet', 'topic']);

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    throw new ToolError('Playwright is not installed. Run: cd tools && npm install && npx playwright install chromium');
  }
}

/* Reads compiled world files in Node (no browser) to know what every level must render. */
function loadCompiled(manifest) {
  const worlds = {};
  for (const w of manifest.worlds) {
    const file = path.join(siteDir, w.file);
    if (!fs.existsSync(file)) continue;
    const sandbox = { Guide: { content: { _register: (id, data) => { worlds[id] = data; } } }, window: {} };
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
  }
  return worlds;
}

function diagramCount(level, { includeModel }) {
  let n = 0;
  walkBlocks(level.blocks, (b) => { if (b.t === 'diagram') n++; });
  if (includeModel && level.defend) walkBlocks(level.defend.modelAnswer, (b) => { if (b.t === 'diagram') n++; });
  return n;
}

const pick = (list, n) => {
  if (n >= list.length) return list;
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
  return copy.slice(0, n).sort((a, b) => list.indexOf(a) - list.indexOf(b));
};

function buildRoutes(manifest, worlds, labIds) {
  const inScope = manifest.worlds.filter((w) => !worldFilter || w.id === worldFilter);
  const topicRoutes = [{ hash: '#/topics', kind: 'topics' }];
  const legacy = [];
  if (!worldFilter) legacy.push({ hash: '#/', kind: 'home', expect: manifest.title });
  for (const w of inScope) {
    topicRoutes.push({ hash: `#/w/${w.id}/cheatsheet`, kind: 'cheatsheet', expect: w.title, world: w.id });
    for (const t of pick(w.topics || [], sample)) {
      const full = worlds[w.id] && (worlds[w.id].topics || []).find((x) => x.id === t.id);
      topicRoutes.push({ hash: `#/w/${w.id}/${t.id}`, kind: 'topic', expect: t.title, world: w.id, topic: t.id, diagrams: full ? diagramCount({ blocks: full.explain }, { includeModel: false }) : 0 });
    }
    legacy.push({ hash: `#/w/${w.id}`, kind: 'world', expect: w.title, world: w.id });
    for (const l of pick(w.levels, sample)) {
      const lv = worlds[w.id] && worlds[w.id].levels.find((x) => x.id === l.id);
      legacy.push({
        hash: `#/w/${w.id}/${l.id}`, kind: 'level', expect: l.title, world: w.id, level: l.id,
        diagrams: lv ? diagramCount(lv, { includeModel: false }) : 0,
        modelDiagrams: lv ? diagramCount(lv, { includeModel: true }) - diagramCount(lv, { includeModel: false }) : 0
      });
    }
  }
  if (!worldFilter) {
    legacy.push({ hash: '#/cards', kind: 'cards' });
    for (const w of inScope) legacy.push({ hash: `#/cards/${w.id}`, kind: 'cards', world: w.id });
    legacy.push({ hash: '#/labs', kind: 'labs' });
    for (const id of labIds) legacy.push({ hash: `#/labs/${id}`, kind: 'lab', lab: id });
    for (const r of ['library', 'glossary', 'bookmarks', 'progress', 'about']) legacy.push({ hash: `#/${r}`, kind: r });
    legacy.push({ hash: '#/search?q=cache', kind: 'search' });
    legacy.push({ hash: '#/no-such-route-ftq', kind: 'notfound', expectNotFound: true });
  }
  const keep = (r) => !onlyRe || onlyRe.test(r.hash);
  return { topicRoutes: topicRoutes.filter(keep).slice(0, limit), legacy: legacy.filter(keep).slice(0, limit) };
}

/* ---------- per-page collector ---------- */
function attachCollectors(page, state) {
  const note = (sev, kind, detail) => { if (state.current) state.current.problems.push({ sev, kind, detail }); else state.global.push({ sev, kind, detail }); };
  page.on('console', (msg) => {
    const text = msg.text();
    if (msg.type() === 'error') {
      if (/^Failed to load resource/.test(text)) return;
      const loc = msg.location();
      note('error', 'console-error', `${text.slice(0, 300)}${loc && loc.url ? ` (${path.basename(loc.url)}:${loc.lineNumber})` : ''}`);
    } else if (msg.type() === 'warning' && /^\[diagrams\]/.test(text)) {
      note('info', 'diagram-warning', text.slice(0, 300));
    }
  });
  page.on('pageerror', (e) => note('error', 'page-error', String(e.message || e).slice(0, 300)));
  page.on('requestfailed', (r) => {
    const failure = (r.failure() && r.failure().errorText) || 'failed';
    if (/ERR_ABORTED/.test(failure)) return;
    note('error', 'request-failed', `${r.url().replace(/^file:\/\/.*\/site\//, '')} (${failure})`);
  });
  page.on('request', (r) => {
    const u = r.url();
    if (!/^(file|data|blob|about):/i.test(u)) note('error', 'external-request', u.slice(0, 200));
  });
  page.on('crash', () => note('error', 'page-crash', 'the page crashed'));
}

async function settle(page) {
  await page.waitForTimeout(140);
  try {
    await page.waitForFunction(() => !document.querySelector('figure.g-diagram[data-state="loading"]'), null, { timeout });
    return true;
  } catch { return false; }
}

async function gotoHash(page, hash) {
  const same = await page.evaluate((h) => location.hash === h, hash);
  if (same) {
    await page.evaluate(() => { window.__ftqNav = 0; location.hash = '#/about'; });
    await page.waitForFunction(() => window.__ftqNav > 0, null, { timeout });
  }
  await page.evaluate(() => { window.__ftqNav = 0; });
  await page.evaluate((h) => { location.hash = h; }, hash);
  await page.waitForFunction(() => window.__ftqNav > 0, null, { timeout });
}

async function inspect(page) {
  return page.evaluate(() => {
    const main = document.getElementById('main') || document.querySelector('main') || document.body;
    const figs = [...main.querySelectorAll('figure.g-diagram')];
    return {
      title: document.title,
      text: (main.innerText || '').replace(/\s+/g, ' ').trim(),
      view: main.dataset.view || '',
      h1: main.querySelectorAll('h1').length,
      diagrams: {
        total: figs.length,
        ready: figs.filter((f) => f.dataset.state === 'ready').length,
        loading: figs.filter((f) => f.dataset.state === 'loading').length,
        error: figs.filter((f) => f.dataset.state === 'error').map((f) => f.id || '(no id)')
      },
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  });
}

async function visit(page, route, pass, state, opts = {}) {
  const rec = { pass: pass.label, hash: route.hash + (opts.facilitator ? ' (facilitator)' : ''), kind: route.kind, problems: [], ms: 0, diagrams: null };
  state.current = rec;
  const t0 = Date.now();
  try {
    await gotoHash(page, route.hash);
    const settled = await settle(page);
    if (route.kind === 'lab' && !/^(Error|Page not found)\b/.test(await page.title())) {
      try { await page.waitForFunction((id) => !!document.querySelector(`main [class*="lab-${id}-"]`), route.lab, { timeout: 5000 }); } catch { rec.problems.push({ sev: 'error', kind: 'lab-not-mounted', detail: `no element with class prefix lab-${route.lab}- appeared` }); }
    }
    await page.waitForTimeout(80);
    const info = await inspect(page);
    rec.diagrams = info.diagrams;
    const pageUp = !TOPIC_KINDS.has(route.kind) || !(/^(Error|Page not found)\b/.test(info.title) || (info.view && info.view !== route.kind) || info.text.length < 40);
    if (!pageUp) {
      rec.notRendered = true;
      rec.problems.push({ sev: 'warn', kind: 'topic-not-rendered', detail: `${route.kind} route does not render yet (title "${info.title}", view "${info.view || 'none'}")` });
    } else {
    if (!settled || info.diagrams.loading) rec.problems.push({ sev: 'error', kind: 'diagram-timeout', detail: `${info.diagrams.loading || 'some'} diagram(s) still loading after ${timeout} ms` });
    const errorView = /^(Error|Page not found)\b/.test(info.title);
    if (errorView && !route.expectNotFound) rec.problems.push({ sev: 'error', kind: 'error-view', detail: `view shows "${info.title}": ${info.text.slice(0, 160)}` });
    if (route.expectNotFound && !/^Page not found\b/.test(info.title)) rec.problems.push({ sev: 'error', kind: 'notfound-missing', detail: `unknown route did not show the not-found view (title "${info.title}")` });
    if (!errorView) {
      if (info.text.length < 40) rec.problems.push({ sev: 'error', kind: 'empty-view', detail: `main has only ${info.text.length} characters of text` });
      if (route.expect && !info.text.toLowerCase().includes(route.expect.toLowerCase())) rec.problems.push({ sev: 'error', kind: 'title-missing', detail: `main does not contain "${route.expect}"` });
      if (!info.h1 && route.kind !== 'notfound') rec.problems.push({ sev: 'warn', kind: 'no-h1', detail: 'main has no h1' });
    }
    if (info.diagrams.error.length) rec.problems.push({ sev: 'error', kind: 'diagram-fallback', detail: `Mermaid fell back to source for: ${info.diagrams.error.join(', ')}` });
    if (route.kind === 'topic' || route.kind === 'level') {
      const want = route.diagrams + (opts.facilitator ? route.modelDiagrams || 0 : 0);
      if (info.diagrams.total < want) rec.problems.push({ sev: 'warn', kind: 'diagram-count', detail: `${route.kind} has ${want} diagram block(s), page shows ${info.diagrams.total}` });
    }
    if (info.overflow > 0) rec.problems.push({ sev: 'warn', kind: 'h-overflow', detail: `scrollWidth is ${info.overflow}px wider than clientWidth at ${pass.width}px` });
    }
    if (rec.notRendered) rec.problems.forEach((p) => { if (p.sev === 'error') { p.sev = 'warn'; p.kind = `${p.kind} (page not rendering)`; } });
    if (args.shots) {
      fs.mkdirSync(shotsDir, { recursive: true });
      const name = `${pass.theme}-${pass.width}-${slugOf(route.hash)}${opts.facilitator ? '-facilitator' : ''}.png`;
      await page.screenshot({ path: path.join(shotsDir, name) });
    }
  } catch (e) {
    rec.problems.push({ sev: 'error', kind: 'visit-failed', detail: String(e.message || e).split('\n')[0].slice(0, 200) });
  }
  rec.ms = Date.now() - t0;
  state.current = null;
  return rec;
}

async function newPage(browser, pass, state) {
  const context = await browser.newContext({ viewport: { width: pass.width, height: 900 }, colorScheme: pass.theme, reducedMotion: 'reduce', serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(timeout);
  attachCollectors(page, state);
  return { context, page };
}

async function main() {
  if (!fs.existsSync(path.join(siteDir, 'index.html'))) throw new ToolError(`${rel(path.join(siteDir, 'index.html'))} does not exist yet. Build the site first.`);
  if (!fs.existsSync(path.join(siteDir, 'content', 'manifest.js'))) throw new ToolError('site/content/manifest.js is missing. Run: node tools/build.mjs');
  const { chromium } = await loadPlaywright();
  const manifestBox = { Guide: {}, window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(siteDir, 'content', 'manifest.js'), 'utf8'), manifestBox);
  const manifest = manifestBox.Guide.manifest;
  const worlds = loadCompiled(manifest);
  const labsFile = path.join(siteDir, 'assets', 'js', 'labs-registry.js');
  const labIds = fs.existsSync(labsFile) ? [...fs.readFileSync(labsFile, 'utf8').matchAll(/\{\s*id:\s*'([a-z0-9-]+)'\s*,\s*world:/g)].map((m) => m[1]) : [];
  const { topicRoutes, legacy } = buildRoutes(manifest, worlds, labIds);
  const routes = [...topicRoutes, ...legacy];
  const passMap = new Map();
  const addPass = (theme, width, list) => {
    const key = `${theme} ${width}px`;
    if (!passMap.has(key)) passMap.set(key, { theme, width, label: key, routes: [] });
    passMap.get(key).routes.push(...list);
  };
  for (const theme of themes) for (const width of topicWidths) addPass(theme, width, topicRoutes);
  for (const theme of args['full-matrix'] ? themes : themes.slice(0, 1)) for (const width of widths) addPass(theme, width, legacy);

  const browser = await chromium.launch({ headless: !args.headed });
  browserRef = browser;
  const records = [];
  const globalProblems = [];
  const started = Date.now();
  const leaks = new Set();
  let skipped = 0;
  try {
    for (const pass of passMap.values()) {
      const state = { current: null, global: globalProblems };
      let context = null;
      try {
        const made = await newPage(browser, pass, state);
        context = made.context;
        const page = made.page;
        // load on a route that does not exist so the first real route is always a navigation
        await page.goto(`${indexUrl}#/ftq-warmup`);
        await page.waitForFunction(() => window.Guide && window.Guide.bus && window.Guide.router && document.getElementById('main') && document.getElementById('main').dataset.view, null, { timeout });
        await page.evaluate(() => { window.__ftqNav = 0; window.Guide.bus.on('route:change', () => { window.__ftqNav++; }); });
        if (!leaks.size) {
          const extra = await page.evaluate(() => {
            const base = ['Guide', 'mermaid', '__ftqNav'];
            const blank = document.createElement('iframe');
            document.body.appendChild(blank);
            const known = new Set(Object.getOwnPropertyNames(blank.contentWindow));
            blank.remove();
            return Object.getOwnPropertyNames(window).filter((k) => !known.has(k) && !base.includes(k) && !k.startsWith('__') && !/^webkit/i.test(k));
          });
          extra.forEach((k) => leaks.add(k));
        }
        for (const route of pass.routes) {
          if (Date.now() > deadline) { skipped++; continue; }
          records.push(await visit(page, route, pass, state));
          if (!args['no-facilitator'] && route.kind === 'level' && route.modelDiagrams > 0 && Date.now() < deadline) {
            await page.evaluate(() => window.Guide.store.setSetting('facilitator', true));
            records.push(await visit(page, route, pass, state, { facilitator: true }));
            await page.evaluate(() => window.Guide.store.setSetting('facilitator', false));
          }
        }
      } catch (e) {
        globalProblems.push({ sev: 'error', kind: 'pass-failed', detail: `${pass.label}: ${String(e.message || e).split('\n')[0].slice(0, 200)}` });
      } finally {
        if (context) await context.close().catch(() => {});
      }
    }
    if (!args['no-deep-links']) {
      const pass = { theme: themes[0], width: widths[widths.length - 1], label: 'deep link' };
      for (const w of manifest.worlds) {
        const first = legacy.find((r) => r.kind === 'level' && r.world === w.id);
        if (!first || Date.now() > deadline) continue;
        const state = { current: null, global: globalProblems };
        const { context, page } = await newPage(browser, pass, state);
        const rec = { pass: pass.label, hash: first.hash, kind: 'deep-link', problems: [], ms: 0, diagrams: null };
        state.current = rec;
        const t0 = Date.now();
        try {
          await page.goto(`${indexUrl}${first.hash}`);
          await page.waitForFunction(() => document.getElementById('main') && document.getElementById('main').dataset.view === 'level', null, { timeout });
          await settle(page);
          const info = await inspect(page);
          if (!info.text.toLowerCase().includes(first.expect.toLowerCase())) rec.problems.push({ sev: 'error', kind: 'title-missing', detail: `deep link did not render "${first.expect}"` });
          if (info.diagrams.error.length) rec.problems.push({ sev: 'error', kind: 'diagram-fallback', detail: `Mermaid fell back to source for: ${info.diagrams.error.join(', ')}` });
        } catch (e) {
          rec.problems.push({ sev: 'error', kind: 'deep-link-failed', detail: String(e.message || e).split('\n')[0].slice(0, 200) });
        }
        rec.ms = Date.now() - t0;
        records.push(rec);
        state.current = null;
        await context.close();
      }
    }
  } finally {
    await Promise.race([browser.close().catch(() => {}), new Promise((r) => setTimeout(r, 5000))]);
    try { const proc = browser.process && browser.process(); if (proc && proc.exitCode === null) proc.kill('SIGKILL'); } catch { /* already closed */ }
  }
  for (const k of leaks) globalProblems.push({ sev: 'warn', kind: 'global-leak', detail: `window.${k} is a global outside the Guide namespace` });
  return { manifest, records, globalProblems, skipped, seconds: ((Date.now() - started) / 1000).toFixed(1) };
}

function writeReport({ manifest, records, globalProblems, skipped, seconds }) {
  const all = [...globalProblems.map((p) => ({ ...p, hash: '(page load)', pass: '-' })), ...records.flatMap((r) => r.problems.map((p) => ({ ...p, hash: r.hash, pass: r.pass })))];
  const errors = all.filter((p) => p.sev === 'error');
  const warns = all.filter((p) => p.sev === 'warn');
  const diag = records.reduce((a, r) => (r.diagrams ? { total: a.total + r.diagrams.total, ready: a.ready + r.diagrams.ready } : a), { total: 0, ready: 0 });
  const topicRecs = records.filter((r) => TOPIC_KINDS.has(r.kind));
  const notRendered = topicRecs.filter((r) => r.notRendered);
  const byKind = new Map();
  for (const p of warns) {
    if (!byKind.has(p.kind)) byKind.set(p.kind, { n: 0, routes: new Set(), example: p });
    const g = byKind.get(p.kind);
    g.n++; g.routes.add(p.hash);
  }
  let md = reportFrontmatter({ title: 'Render check report', description: `Headless Chromium visit of ${records.length} route renders from file://, including topic pages, cheat sheets and the topics index` });
  md += `Site: \`${rel(siteDir)}\`. Scope: ${worldFilter || 'all chapters'}${sample === Infinity ? ', every topic and practice problem' : `, ${sample} sampled topics and practice problems per chapter`}. Took ${seconds} s of a ${budgetMs / 1000} s budget.\n\n`;
  md += `## Result: ${errors.length ? 'FAIL' : 'PASS'}\n\n`;
  if (notRendered.length) md += `> Topic pages are not rendering yet: ${notRendered.length} of ${topicRecs.length} topic, cheat sheet and topics-index visits showed an error view or the wrong view. These are reported as \`topic-not-rendered\` warnings and do not fail the run. Re-run after the shell and renderer land.\n\n`;
  if (skipped) md += `> ${skipped} route visit${skipped === 1 ? '' : 's'} skipped because the time budget ran out. Re-run with \`--world wNN\`, a lower \`--sample\`, or a larger \`--budget\`.\n\n`;
  md += `${mdTable(['Measure', 'Value'], [
    ['Route renders', records.length], ['Topic family renders (topics index, cheat sheets, topics)', topicRecs.length], ['Topic family not rendering', notRendered.length],
    ['Chapters', manifest.worlds.length], ['Topics', manifest.worlds.reduce((n, w) => n + (w.topics || []).length, 0)], ['Practice problems', manifest.worlds.reduce((n, w) => n + w.levels.length, 0)],
    ['Diagrams drawn (ready / seen)', `${diag.ready} / ${diag.total}`], ['Skipped for budget', skipped || 0], ['Errors', errors.length], ['Warnings', warns.length]
  ])}\n\n`;
  md += '## Errors\n\n';
  md += errors.length ? `${mdTable(['Pass', 'Route', 'Kind', 'Detail'], errors.map((p) => [p.pass, p.hash, p.kind, p.detail]))}\n\n` : 'None.\n\n';
  md += '## Warnings by kind\n\n';
  md += byKind.size ? `${mdTable(['Kind', 'Count', 'Routes', 'Example'], [...byKind.entries()].sort((a, b) => b[1].n - a[1].n).map(([k, g]) => [k, g.n, g.routes.size, `${g.example.pass} ${g.example.hash}: ${g.example.detail}`.slice(0, 160)]))}\n\n` : 'None.\n\n';
  const overflow = warns.filter((p) => p.kind === 'h-overflow');
  if (overflow.length) md += `### Horizontal overflow\n\n${mdTable(['Pass', 'Route', 'Detail'], overflow.slice(0, 60).map((p) => [p.pass, p.hash, p.detail]))}\n\n`;
  md += '## Routes\n\n';
  const listed = records.length > 200 ? records.filter((r) => r.problems.length) : records;
  if (listed.length < records.length) md += `Only routes with findings are listed (${listed.length} of ${records.length}).\n\n`;
  md += `${mdTable(['Pass', 'Route', 'Kind', 'Result', 'ms', 'Diagrams'], listed.map((r) => [r.pass, r.hash, r.kind, r.problems.some((p) => p.sev === 'error') ? 'FAIL' : r.notRendered ? 'not rendered' : r.problems.some((p) => p.sev === 'warn') ? 'warn' : 'ok', r.ms, r.diagrams ? `${r.diagrams.ready}/${r.diagrams.total}` : '-']))}\n`;
  fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  fs.writeFileSync(reportFile, md);
  return { errors, warns, notRendered: notRendered.length, topicVisits: topicRecs.length };
}

main().then((result) => {
  const { errors, warns, notRendered, topicVisits } = writeReport(result);
  for (const p of errors.slice(0, 40)) console.log(`error [${p.kind}] ${p.pass} ${p.hash}: ${p.detail}`);
  if (errors.length > 40) console.log(`... and ${errors.length - 40} more errors, see the report`);
  const seen = new Set();
  for (const p of warns) { if (seen.has(p.kind) || seen.size >= 8) continue; seen.add(p.kind); console.log(`warn  [${p.kind}] x${warns.filter((w) => w.kind === p.kind).length}, first ${p.pass} ${p.hash}: ${p.detail}`.slice(0, 240)); }
  if (notRendered) console.log(`\nNOTE: topic pages are not rendering yet (${notRendered} of ${topicVisits} topic-family visits). Reported as warnings.`);
  if (result.skipped) console.log(`NOTE: ${result.skipped} visits skipped, time budget reached.`);
  console.log(`\n${result.records.length} route renders in ${result.seconds} s: ${errors.length} error${errors.length === 1 ? '' : 's'}, ${warns.length} warning${warns.length === 1 ? '' : 's'}. Report: ${rel(reportFile)}`);
  process.exit(errors.length ? 1 : 0);
}).catch((e) => {
  console.error(`error: ${e.message}`);
  process.exit(e instanceof ToolError ? 2 : 3);
});
