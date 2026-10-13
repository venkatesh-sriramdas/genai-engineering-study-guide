#!/usr/bin/env node
// Checks every reference URL in content-src and writes reviews/link-report.md.
// HEAD first, GET as a fallback, redirects followed by hand so the chain is visible. 403, 429 and 401 are
// "unverifiable" (the site refuses bots), not "dead". Exit code 1 only when a link is dead.
// Usage: node tools/link-check.mjs [--world w04] [--include-fixture] [--src <dir>] [--out <file>]
//        [--timeout 10000] [--concurrency 8] [--per-host 3] [--no-write]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { paths, parseArgs, readJson, ToolError, rel, listWorldDirs, mdTable, reportFrontmatter } from './lib/common.mjs';

const UA = 'Mozilla/5.0 (compatible; FollowTheQuestionLinkCheck/1.0; +offline study guide maintenance)';
const MAX_HOPS = 10;
const LONG_CHAIN = 3;
const UNVERIFIABLE = new Set([401, 403, 429, 999]);
const OFFLINE_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH', 'ECONNRESET', 'UND_ERR_CONNECT_TIMEOUT']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const errCode = (e) => {
  if (!e) return 'ERROR';
  const names = [e.name, e.cause && e.cause.name];
  if (names.includes('TimeoutError') || names.includes('AbortError')) return 'TIMEOUT';
  const code = (e.cause && e.cause.code) || e.code;
  return typeof code === 'string' ? code : 'ERROR';
};
const errText = (e) => {
  const code = errCode(e);
  const detail = (e && e.cause && (e.cause.message || e.cause.code)) || (e && e.message) || '';
  return code === 'TIMEOUT' ? 'timed out' : `${code}${detail && detail !== code ? `: ${String(detail).slice(0, 80)}` : ''}`;
};

/* One request chain: follows redirects by hand, returns every hop. */
async function probe(url, method, timeoutMs) {
  const chain = [];
  let current = url;
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    let res;
    try {
      res = await fetch(current, {
        method, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs),
        headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8', 'accept-language': 'en-US,en;q=0.8' }
      });
    } catch (e) {
      return { chain, finalUrl: current, status: 0, error: e };
    }
    if (res.body && method === 'GET') { try { await res.body.cancel(); } catch { /* ignore */ } }
    chain.push({ url: current, status: res.status });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      try { current = new URL(res.headers.get('location'), current).href; } catch { return { chain, finalUrl: current, status: res.status, error: new Error('bad Location header') }; }
      continue;
    }
    return { chain, finalUrl: current, status: res.status, error: null };
  }
  return { chain, finalUrl: current, status: 310, error: new Error(`more than ${MAX_HOPS} redirects`) };
}

const norm = (u) => {
  try {
    const x = new URL(u);
    return `${x.hostname.replace(/^www\./, '')}${x.pathname.replace(/\/(en-us|en)\//i, '/').replace(/\/+$/, '').toLowerCase()}`;
  } catch { return u; }
};

export async function check(url, { timeout, retries }) {
  const started = Date.now();
  let r = await probe(url, 'HEAD', timeout);
  const needGet = r.error || r.status >= 400 || r.status === 0;
  if (needGet) r = await probe(url, 'GET', timeout);
  for (let attempt = 0; attempt < retries && (r.error || r.status >= 500 || r.status === 0) && errCode(r.error) !== 'ENOTFOUND'; attempt++) {
    await sleep(800);
    r = await probe(url, 'GET', timeout);
  }
  const hops = Math.max(0, r.chain.length - 1);
  const out = { url, status: r.status, finalUrl: r.finalUrl, hops, ms: Date.now() - started, result: 'ok', detail: '', code: r.error ? errCode(r.error) : '' };
  if (r.error) {
    out.result = errCode(r.error) === 'TIMEOUT' ? 'timeout' : r.status >= 300 && r.status < 400 ? 'redirect-problem' : 'dead';
    out.detail = errText(r.error);
    if (out.result === 'redirect-problem') out.result = 'dead';
  } else if (r.status >= 200 && r.status < 300) {
    if (hops > LONG_CHAIN) { out.result = 'long-redirect'; out.detail = `${hops} redirects`; }
    else if (norm(url) !== norm(r.finalUrl)) { out.result = 'moved'; out.detail = `now ${r.finalUrl}`; }
  } else if (r.status >= 300 && r.status < 400) {
    out.result = 'dead'; out.detail = 'redirect without a usable Location';
  } else if (UNVERIFIABLE.has(r.status)) {
    out.result = 'unverifiable'; out.detail = `HTTP ${r.status}, the site blocks automated checks`;
  } else {
    out.result = 'dead'; out.detail = `HTTP ${r.status}`;
  }
  return out;
}

export async function runLinkCheck({ srcDir, includeFixture, worldFilter, timeout, concurrency, perHost, retries, onProgress }) {
  const refs = [];
  for (const { dir, name } of listWorldDirs(srcDir, { includeFixture })) {
    const worldFile = path.join(dir, '_world.json');
    if (!fs.existsSync(worldFile)) continue;
    const world = readJson(worldFile);
    const wid = world.id || (/^(w\d\d)-/.exec(name) || [])[1];
    if (worldFilter && wid !== worldFilter) continue;
    for (const r of world.references || []) refs.push({ world: wid, id: r.id, title: r.title, url: r.url, verified: r.verified, refStatus: r.status });
  }
  const byUrl = new Map();
  for (const r of refs) {
    if (typeof r.url !== 'string' || !/^https?:\/\//i.test(r.url)) continue;
    const key = r.url.split('#')[0];
    if (!byUrl.has(key)) byUrl.set(key, []);
    byUrl.get(key).push(r);
  }
  const invalid = refs.filter((r) => typeof r.url !== 'string' || !/^https?:\/\//i.test(r.url));
  const queue = [...byUrl.keys()];
  const results = new Map();
  const active = new Map();
  const hostOf = (u) => { try { return new URL(u).host; } catch { return ''; } };
  let done = 0;
  async function worker() {
    for (;;) {
      const i = queue.findIndex((u) => (active.get(hostOf(u)) || 0) < perHost);
      if (i === -1) { if (!queue.length) return; await sleep(40); continue; }
      const [u] = queue.splice(i, 1);
      const h = hostOf(u);
      active.set(h, (active.get(h) || 0) + 1);
      try { results.set(u, await check(u, { timeout, retries })); } finally { active.set(h, active.get(h) - 1); }
      onProgress && onProgress(++done, byUrl.size, results.get(u));
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, byUrl.size) || 1 }, worker));
  return { refs, byUrl, results, invalid };
}

function buildReport({ refs, byUrl, results, invalid }, { worldFilter, startedAt }) {
  const counts = {};
  for (const r of results.values()) counts[r.result] = (counts[r.result] || 0) + 1;
  const order = ['ok', 'moved', 'long-redirect', 'unverifiable', 'timeout', 'dead'];
  const attention = [];
  const perWorld = new Map();
  for (const [url, list] of byUrl) {
    const res = results.get(url);
    for (const r of list) {
      if (!perWorld.has(r.world)) perWorld.set(r.world, []);
      perWorld.get(r.world).push({ ...r, res });
      if (res.result !== 'ok') attention.push({ ...r, res });
    }
  }
  const label = { ok: 'ok', moved: 'moved', 'long-redirect': 'long redirect', unverifiable: 'unverifiable', timeout: 'timeout', dead: 'DEAD' };
  const cell = (u) => u.replace(/\|/g, '%7C');
  let md = reportFrontmatter({ title: 'Reference link report', description: `HTTP status of every reference URL${worldFilter ? ` in ${worldFilter}` : ''}, checked ${startedAt}` });
  md += `Checked ${byUrl.size} unique URLs from ${refs.length} references${worldFilter ? ` in ${worldFilter}` : ''} on ${startedAt}.\n\n`;
  md += '## Summary\n\n';
  md += `${mdTable(['Result', 'URLs', 'Meaning'], order.filter((k) => counts[k]).map((k) => [label[k], counts[k], {
    ok: 'Answers with a 2xx status and no redirect chain worth fixing.',
    moved: 'Answers, but redirects to a different page. Update the reference URL.',
    'long-redirect': `More than ${LONG_CHAIN} redirects before the page answers.`,
    unverifiable: 'The site returned 401, 403, 429 or 999 to an automated request. Check by hand.',
    timeout: 'No answer within the time limit. Retry later.',
    dead: 'Not found, server error or connection failure. Replace or remove.'
  }[k]]))}\n\n`;
  if (invalid.length) md += `Skipped because the URL is not http or https: ${invalid.map((r) => `${r.world} ${r.id}`).join(', ')}.\n\n`;
  md += '## Needs attention\n\n';
  if (!attention.length) md += 'Nothing. Every URL answered.\n\n';
  else {
    const rank = (x) => order.indexOf(x.res.result);
    attention.sort((a, b) => rank(b) - rank(a) || a.world.localeCompare(b.world) || a.id.localeCompare(b.id));
    md += `${mdTable(['World', 'Ref', 'Result', 'HTTP', 'URL', 'Detail'], attention.map((a) => [a.world, a.id, label[a.res.result], a.res.status || '-', cell(a.url), cell(a.res.detail)]))}\n\n`;
  }
  md += '## By world\n\n';
  for (const wid of [...perWorld.keys()].sort()) {
    const rows = perWorld.get(wid).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    md += `### ${wid}\n\n${mdTable(['Ref', 'Result', 'HTTP', 'Hops', 'Verified', 'URL'], rows.map((r) => [r.id, label[r.res.result], r.res.status || '-', r.res.hops, r.verified || '-', cell(r.url)]))}\n\n`;
  }
  return { md, counts };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  (async () => {
    try {
      const args = parseArgs(process.argv.slice(2), ['world', 'src', 'out', 'timeout', 'concurrency', 'per-host', 'retries']);
      const worldFilter = typeof args.world === 'string' ? args.world : null;
      const srcDir = args.src ? path.resolve(args.src) : paths.src;
      const startedAt = new Date().toISOString();
      const tty = process.stdout.isTTY;
      const result = await runLinkCheck({
        srcDir, includeFixture: !!args['include-fixture'], worldFilter,
        timeout: Number(args.timeout) || 10000, concurrency: Number(args.concurrency) || 8,
        perHost: Number(args['per-host']) || 3, retries: args.retries === undefined ? 1 : Number(args.retries),
        onProgress: (n, total, r) => { if (!tty) { if (r.result === 'dead' || n === total || n % 25 === 0) console.log(`  ${n}/${total} ${r.result === 'ok' ? 'ok' : r.result.toUpperCase()} ${r.url}`); } else process.stdout.write(`\r  ${n}/${total} checked`); }
      });
      if (tty) process.stdout.write('\n');
      if (!result.byUrl.size) {
        console.log(`No reference URLs found${worldFilter ? ` for ${worldFilter}` : ''}. Use --include-fixture to check the sample world.`);
        process.exit(worldFilter ? 1 : 0);
      }
      const all = [...result.results.values()];
      const networkFailures = all.filter((r) => r.status === 0 && OFFLINE_CODES.has(r.code)).length;
      if (networkFailures === all.length) {
        console.error('error: every request failed at the network level (no connection or DNS). Report not written.');
        process.exit(2);
      }
      const { md, counts } = buildReport(result, { worldFilter, startedAt });
      const outFile = args.out ? path.resolve(args.out) : path.join(paths.reviews, worldFilter ? `link-report-${worldFilter}.md` : 'link-report.md');
      if (!args['no-write']) {
        fs.mkdirSync(path.dirname(outFile), { recursive: true });
        fs.writeFileSync(outFile, md);
      }
      const line = Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ');
      console.log(`Checked ${result.byUrl.size} URLs: ${line}.`);
      for (const [url, list] of result.byUrl) {
        const r = result.results.get(url);
        if (r.result !== 'ok') console.log(`  ${r.result.toUpperCase().padEnd(13)} ${list.map((x) => `${x.world}/${x.id}`).join(',')} ${url} ${r.detail}`);
      }
      if (!args['no-write']) console.log(`Report: ${rel(outFile)}`);
      process.exit(counts.dead ? 1 : 0);
    } catch (e) {
      console.error(`error: ${e.message}`);
      process.exit(e instanceof ToolError ? 1 : 2);
    }
  })();
}
