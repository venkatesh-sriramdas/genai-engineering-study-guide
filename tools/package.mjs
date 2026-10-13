#!/usr/bin/env node
// Builds, validates and zips the site: dist/follow-the-question-<version>.zip containing one folder,
// follow-the-question/, with index.html at its top and a HOW-TO-USE.txt next to it.
// Usage: node tools/package.mjs [--include-fixture] [--render] [--keep] [--list] [--check-only] [--skip-validate]
//        [--src <dir>] [--site <dir>] [--dist <dir>]
// Stages site/ as follow-the-question/ (no fixture world output, scratch, test or underscore files), adds HOW-TO-USE.txt,
// zips it, then unzips into dist/.verify (inside the project, not a system temp folder) and lists what the zip holds.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { paths, parseArgs, readJson, rel, ToolError, formatTable, readLabIds } from './lib/common.mjs';
import { build } from './build.mjs';
import { validateTree } from './validate.mjs';

const FOLDER = 'follow-the-question';
const EXCLUDE = [
  /(^|\/)\.DS_Store$/, /(^|\/)_[^/]*$/, /(^|\/)Thumbs\.db$/, /\.map$/, /(^|\/)node_modules(\/|$)/, /(^|\/)scratch[^/]*$/i,
  /(^|\/)(tests?|__tests__)(\/|$)/i, /(^|\/)test[-_.][^/]*$/i, /\.(test|spec)\.[a-z]+$/i, /(^|\/)content\/w99[^/]*$/
];

const walkFiles = (dir, base = dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : []).flatMap((e) => {
  const full = path.join(dir, e.name);
  return e.isDirectory() ? walkFiles(full, base) : [path.relative(base, full).split(path.sep).join('/')];
}).sort();

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

/* ---------- asset checks for the site folder ---------- */
export function checkSite(siteDir) {
  const problems = [];
  const err = (msg) => problems.push({ sev: 'error', msg });
  const warn = (msg) => problems.push({ sev: 'warn', msg });
  const index = path.join(siteDir, 'index.html');
  if (!fs.existsSync(index)) { err('site/index.html is missing'); return problems; }
  const html = fs.readFileSync(index, 'utf8');
  const isLocal = (ref) => !/^(https?:|data:|mailto:|#|\/\/|javascript:)/i.test(ref);

  if (/<script[^>]*type\s*=\s*["']module["']/i.test(html)) err('index.html uses <script type="module">, which is blocked on file://');
  if (/\son[a-z]+\s*=\s*["']/i.test(html)) warn('index.html has inline event handler attributes');
  let localScripts = 0;
  for (const m of html.matchAll(/<(script|link|img|source|iframe)\b[^>]*?\b(src|href)\s*=\s*["']([^"']+)["']/gi)) {
    const ref = m[3];
    if (/^(https?:)?\/\//i.test(ref)) err(`index.html loads an external resource: ${ref}`);
    else if (isLocal(ref)) {
      if (m[1].toLowerCase() === 'script') localScripts++;
      if (!fs.existsSync(path.join(siteDir, ref.split('#')[0].split('?')[0]))) err(`index.html references ${ref}, which does not exist`);
    }
  }
  if (!localScripts) warn('index.html loads no local scripts');

  // content/*.js is learner-facing data (it may mention import() or a CDN as text), so only the code is scanned
  for (const f of walkFiles(siteDir).filter((x) => x.endsWith('.js') && !/(^|\/)vendor\//.test(x) && !/^content\//.test(x))) {
    const text = fs.readFileSync(path.join(siteDir, f), 'utf8');
    if (/^\s*import\s+(?:[\w$*{}\s,]+\s+from\s+)?['"]/m.test(text) || /^\s*export\s+(default|const|let|var|function|class|\{)/m.test(text)) err(`${f} uses ES module syntax (import or export), which breaks classic scripts`);
    if (/\bimport\s*\(/.test(text)) err(`${f} uses dynamic import(), which is blocked on file://`);
    if (/\bfetch\s*\(|new\s+XMLHttpRequest\b/.test(text)) warn(`${f} makes network or file requests (fetch or XMLHttpRequest), which cannot read local files on file://`);
    if (/["'`]https?:\/\/(?:cdn\.|unpkg\.|cdnjs\.|fonts\.googleapis|fonts\.gstatic|ajax\.googleapis|cdn\.jsdelivr)/i.test(text)) err(`${f} references a CDN`);
  }
  for (const f of walkFiles(siteDir).filter((x) => x.endsWith('.css'))) {
    const text = fs.readFileSync(path.join(siteDir, f), 'utf8');
    if (/@import\s+(url\()?["']?https?:/i.test(text) || /url\(\s*["']?https?:/i.test(text)) err(`${f} loads a network resource (font or image)`);
    for (const m of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
      const ref = m[1];
      if (!isLocal(ref) || ref.startsWith('data:')) continue;
      if (!fs.existsSync(path.resolve(siteDir, path.dirname(f), ref.split('#')[0].split('?')[0]))) err(`${f} references ${ref}, which does not exist`);
    }
  }

  const need = ['assets/css/tokens.css', 'assets/js/ns.js', 'assets/img/favicon.svg', 'assets/vendor/mermaid.min.js', 'content/manifest.js', 'content/search-index.js', 'content/refs-all.js'];
  for (const f of need) if (!fs.existsSync(path.join(siteDir, f))) err(`required file ${f} is missing`);
  if (!fs.existsSync(path.join(siteDir, 'assets/vendor/VERSION.txt'))) warn('assets/vendor/VERSION.txt is missing (record the Mermaid version)');
  if (!walkFiles(path.join(siteDir, 'assets/vendor')).some((f) => /licen[sc]e/i.test(f))) warn('no Mermaid license file in assets/vendor');
  for (const id of readLabIds(siteDir)) if (!fs.existsSync(path.join(siteDir, 'assets/js/labs', `${id}.js`))) err(`lab script assets/js/labs/${id}.js is missing`);
  const manifestFile = path.join(siteDir, 'content/manifest.js');
  if (fs.existsSync(manifestFile)) {
    const m = /Guide\.manifest\s*=\s*(\{[\s\S]*\});?\s*$/.exec(fs.readFileSync(manifestFile, 'utf8'));
    if (m) {
      const manifest = JSON.parse(m[1]);
      for (const w of manifest.worlds) if (!fs.existsSync(path.join(siteDir, w.file))) err(`world file ${w.file} is missing`);
      const listed = new Set(manifest.worlds.map((w) => w.file));
      for (const f of walkFiles(path.join(siteDir, 'content'))) if (/^w\d\d\.js$/.test(f) && !listed.has(`content/${f}`)) warn(`content/${f} is not in the manifest`);
    } else err('content/manifest.js could not be read');
  }
  return problems;
}

function howTo({ title, subtitle, version, date }) {
  return `${title}
${subtitle}
Version ${version}, built ${date}

OPEN IT
1. Unzip the whole folder. Keep every file and folder inside it together.
2. Double-click index.html. It opens in your default browser.
No server, account, install or internet connection is needed. Nothing you do is sent anywhere.
It works in current versions of Chrome, Edge, Safari and Firefox.

YOUR PROGRESS
Progress, notes and flashcard schedules are saved in the browser that opened the guide, on this computer.
Some browsers tie that storage to the exact folder location, so open the guide from the same folder each time.
Private or incognito windows do not keep progress. If the guide shows a storage warning, export often.

EXPORT BEFORE YOU SWITCH
Export your progress before you change browser, clear site data, move or rename the folder, or move to another computer.
1. Open the Progress page (the address ending in #/progress).
2. Choose Export. Your browser saves a file named ftq-progress-<name>-<date>.json.
3. Keep that file somewhere safe.

IMPORT
1. Open the guide in the new browser or folder, then open the Progress page.
2. Choose Import and pick your saved .json file, or drop it on the page.
3. Choose Merge to keep the best of both sets, or Replace to use the file only.

FOR FACILITATORS
Open Settings and turn on Facilitator mode to show answers and model answers. Print any level from the browser print dialog.
Press / or Ctrl+K (Cmd+K on a Mac) to search the whole guide.
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2), ['src', 'site', 'dist']);
  const includeFixture = !!args['include-fixture'];
  const srcDir = args.src ? path.resolve(args.src) : paths.src;
  const siteDir = args.site ? path.resolve(args.site) : paths.site;
  const distDir = args.dist ? path.resolve(args.dist) : paths.dist;
  const log = (s = '') => console.log(s);

  if (args['check-only']) {
    const problems = checkSite(siteDir);
    for (const p of problems) log(`${p.sev}: ${p.msg}`);
    log(`${problems.filter((p) => p.sev === 'error').length} errors, ${problems.filter((p) => p.sev === 'warn').length} warnings in ${rel(siteDir)}.`);
    process.exit(problems.some((p) => p.sev === 'error') ? 1 : 0);
  }

  const zipProbe = spawnSync('zip', ['-v'], { encoding: 'utf8' });
  if (zipProbe.error) throw new ToolError('the system "zip" command is not available');

  log('1/5 Build');
  const built = build({ srcDir, outDir: path.join(siteDir, 'content'), includeFixture });
  if (built.errors.length) { for (const e of built.errors) console.error(`  error: ${e}`); throw new ToolError(`build failed with ${built.errors.length} error(s)`); }
  log(`    ${built.totals.worlds} worlds, ${built.totals.levels} levels, ${built.totals.topics || 0} topics, ${built.totals.scenarios || 0} scenarios, ${built.totals.quiz} quiz items, ${built.totals.flashcards || 0} flashcards, ${built.totals.diagrams} diagrams`);
  if (!includeFixture && !built.totals.topics) log('    warning: the build contains no topics');

  log('2/5 Validate');
  if (args['skip-validate']) log('    skipped (--skip-validate)');
  else {
    const v = validateTree({ srcDir, siteDir, blocklistPath: paths.blocklist, includeFixture });
    const errors = v.issues.filter((i) => i.sev === 'error');
    for (const i of errors.slice(0, 30)) console.error(`  error [${i.rule}] ${i.file}${i.level ? ` (${i.level})` : ''} ${i.path}: ${i.msg}`);
    if (errors.length) throw new ToolError(`validation failed with ${errors.length} error(s). Run: node tools/validate.mjs`);
    log(`    0 errors, ${v.issues.filter((i) => i.sev === 'warn').length} warnings`);
  }

  log('3/5 Check the site folder');
  const problems = checkSite(siteDir);
  for (const p of problems) log(`    ${p.sev}: ${p.msg}`);
  if (problems.some((p) => p.sev === 'error')) throw new ToolError('the site folder has errors, see above');
  if (!includeFixture && /"id":"w99"/.test(fs.readFileSync(path.join(siteDir, 'content', 'manifest.js'), 'utf8'))) throw new ToolError('fixture world w99 is in the manifest. Run node tools/build.mjs without --include-fixture');

  const meta = readJson(path.join(srcDir, '_meta.json'));
  const zipName = `${FOLDER}-${meta.version}${includeFixture ? '-sample' : ''}.zip`;
  const zipFile = path.join(distDir, zipName);
  const staging = path.join(distDir, '.staging');
  const verify = path.join(distDir, '.verify');
  fs.rmSync(staging, { recursive: true, force: true });
  fs.rmSync(verify, { recursive: true, force: true });
  fs.mkdirSync(distDir, { recursive: true });

  log('4/5 Stage and zip');
  const stage = path.join(staging, FOLDER);
  const files = walkFiles(siteDir).filter((f) => !EXCLUDE.some((re) => re.test(f)) || (includeFixture && /^content\/w99[^/]*$/.test(f)));
  const stamp = new Date(built.generated);
  for (const f of files) {
    const dest = path.join(stage, f);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(siteDir, f), dest);
  }
  fs.writeFileSync(path.join(stage, 'HOW-TO-USE.txt'), howTo({ title: meta.title, subtitle: meta.subtitle, version: meta.version, date: built.generated.slice(0, 10) }));
  const staged = walkFiles(stage);
  for (const f of staged) fs.utimesSync(path.join(stage, f), stamp, stamp);
  fs.rmSync(zipFile, { force: true });
  const list = staged.map((f) => `${FOLDER}/${f}`).join('\n');
  const z = spawnSync('zip', ['-X', '-q', '-9', zipFile, '-@'], { cwd: staging, input: list, encoding: 'utf8' });
  if (z.status !== 0) throw new ToolError(`zip failed: ${z.stderr || z.stdout}`);
  log(`    ${staged.length} files, ${rel(zipFile)} (${kb(fs.statSync(zipFile).size)})`);

  log('5/5 Verify by unzipping');
  fs.mkdirSync(verify, { recursive: true });
  const u = spawnSync('unzip', ['-q', zipFile, '-d', verify], { encoding: 'utf8' });
  if (u.status !== 0) throw new ToolError(`unzip failed: ${u.stderr || u.stdout}`);
  const top = fs.readdirSync(verify);
  if (top.length !== 1 || top[0] !== FOLDER) throw new ToolError(`zip should contain a single ${FOLDER}/ folder, found: ${top.join(', ')}`);
  const unzipRoot = path.join(verify, FOLDER);
  const unzipped = walkFiles(unzipRoot);
  const missing = staged.filter((f) => !unzipped.includes(f));
  if (missing.length || unzipped.length !== staged.length) throw new ToolError(`unzipped tree differs from staged tree (${missing.length} missing)`);
  for (const must of ['index.html', 'HOW-TO-USE.txt', 'content/manifest.js', 'assets/js/ns.js']) if (!unzipped.includes(must)) throw new ToolError(`zip is missing ${must}`);
  if (unzipped.some((f) => EXCLUDE.some((re) => re.test(f)) && !(includeFixture && /^content\/w99[^/]*$/.test(f)))) throw new ToolError('zip contains development-only files');
  if (!includeFixture && unzipped.some((f) => /^content\/w99/.test(f))) throw new ToolError('zip contains the fixture world output');
  const zipManifest = /Guide\.manifest\s*=\s*(\{[\s\S]*\});?\s*$/.exec(fs.readFileSync(path.join(unzipRoot, 'content/manifest.js'), 'utf8'));
  const zipTotals = zipManifest ? JSON.parse(zipManifest[1]).totals : null;
  if (zipTotals && zipTotals.topics !== built.totals.topics) throw new ToolError(`the zipped manifest lists ${zipTotals.topics} topics, the build produced ${built.totals.topics}`);
  const groups = new Map();
  for (const f of unzipped) {
    const parts = f.split('/');
    const key = parts.length === 1 ? '' : parts.length > 2 ? `${parts[0]}/${parts[1]}/` : `${parts[0]}/`;
    const g = groups.get(key) || { n: 0, bytes: 0 };
    g.n++; g.bytes += fs.statSync(path.join(unzipRoot, f)).size;
    groups.set(key, g);
  }
  log(`    unzipped ${unzipped.length} files into ${rel(unzipRoot)}:`);
  log(formatTable(['Folder', 'Files', 'Size'], [...groups.entries()].sort().map(([k, g]) => [`${FOLDER}/${k}`, g.n, kb(g.bytes)]), ['l', 'r', 'r']).replace(/^/gm, '    '));
  log(`    top level: ${fs.readdirSync(unzipRoot).sort().join(', ')}`);
  if (args.list) for (const f of unzipped) log(`      ${FOLDER}/${f}`);

  if (args.render) {
    log('\nRender check on the unzipped copy');
    const r = spawnSync(process.execPath, [path.join(paths.toolsDir, 'check-render.mjs'), '--site', unzipRoot, '--budget', '90', '--out', path.join(paths.reviews, 'render-report.md')], { stdio: 'inherit', timeout: 120000 });
    if (r.status !== 0) throw new ToolError('render check failed on the unzipped copy');
  }
  if (!args.keep) { fs.rmSync(staging, { recursive: true, force: true }); fs.rmSync(verify, { recursive: true, force: true }); }
  log(`\nPackaged ${rel(zipFile)}${includeFixture ? ' (includes the fixture world, not for release)' : ''}`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((e) => {
    console.error(`error: ${e.message}`);
    process.exit(e instanceof ToolError ? 1 : 2);
  });
}
