#!/usr/bin/env node
// Compiles content-src/ into site/content/ (classic scripts that attach to window.Guide, so the site runs from file://).
// The output contract is defined in CONTRACT.md. Exit code 1 on any invalid source.
// Usage: node tools/build.mjs [--include-fixture] [--src <dir>] [--out <dir>] [--site <dir>] [--quiet]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  paths, parseArgs, readJson, ToolError, rel, plain, clip, walkBlocks, walkLevelBlocks, fillHeadingIds,
  listWorldDirs, listLevelFiles, sourceTimestamp, formatTable
} from './lib/common.mjs';

// Topic files (tNN-*.json) and the optional _topics.json (extra references, glossary, claims written by the topic author).
function loadTopics(dir, attempt, fail) {
  const out = [];
  for (const f of fs.readdirSync(dir).filter((n) => /^t\d+.*\.json$/.test(n)).sort()) {
    const file = path.join(dir, f);
    const t = attempt(() => readJson(file));
    if (!t) continue;
    if (typeof t.id !== 'string' || !t.id) { fail(file, '$.id', 'topic id is required'); continue; }
    if (typeof t.order !== 'number') { fail(file, '$.order', 'topic order must be a number'); continue; }
    out.push(t);
  }
  return out.sort((a, b) => a.order - b.order);
}
function loadTopicsExtra(dir, attempt) {
  const file = path.join(dir, '_topics.json');
  return fs.existsSync(file) ? (attempt(() => readJson(file)) || {}) : {};
}

export function build({ srcDir = paths.src, outDir = paths.content, includeFixture = false, log = () => {} } = {}) {
  const errors = [];
  const fail = (file, jsonPath, msg) => errors.push(`${rel(file)}: ${jsonPath ? `${jsonPath}: ` : ''}${msg}`);
  const attempt = (fn) => {
    try { return fn(); } catch (err) { if (err instanceof ToolError) { errors.push(err.message); return undefined; } throw err; }
  };

  const metaFile = path.join(srcDir, '_meta.json');
  const meta = attempt(() => readJson(metaFile));
  if (meta && (!Array.isArray(meta.regions) || !meta.title || !meta.version)) fail(metaFile, '$', 'expected title, version and a regions array');

  const dirs = listWorldDirs(srcDir, { includeFixture });
  if (!dirs.length && !errors.length) errors.push(`${rel(srcDir)}: no worlds found (folders named wNN-slug). Use --include-fixture to build the sample.`);

  // Load everything first so every invalid file is reported, and so a failed build leaves the previous output untouched.
  const loaded = [];
  for (const { dir } of dirs) {
    const worldFile = path.join(dir, '_world.json');
    const rawWorld = attempt(() => readJson(worldFile));
    if (!rawWorld) continue;
    const levels = [];
    for (const f of listLevelFiles(dir)) {
      const file = path.join(dir, f);
      const lv = attempt(() => readJson(file));
      if (!lv) continue;
      if (typeof lv.id !== 'string' || !lv.id) { fail(file, '$.id', 'level id is required'); continue; }
      if (typeof lv.order !== 'number') { fail(file, '$.order', 'level order must be a number'); continue; }
      levels.push({ file, lv });
    }
    loaded.push({ dir, worldFile, rawWorld, levels, topics: loadTopics(dir, attempt, fail), extra: loadTopicsExtra(dir, attempt) });
  }

  const seenWorld = new Map();
  const regionIds = new Set(((meta && meta.regions) || []).map((r) => r.id));
  for (const w of loaded) {
    const { rawWorld, worldFile } = w;
    if (typeof rawWorld.id !== 'string' || !rawWorld.id) { fail(worldFile, '$.id', 'world id is required'); w.bad = true; continue; }
    if (typeof rawWorld.order !== 'number') { fail(worldFile, '$.order', 'world order must be a number'); w.bad = true; continue; }
    if (seenWorld.has(rawWorld.id)) fail(worldFile, '$.id', `duplicate world id ${rawWorld.id} (also in ${rel(seenWorld.get(rawWorld.id))})`);
    seenWorld.set(rawWorld.id, worldFile);
    if (meta && !regionIds.has(rawWorld.region)) fail(worldFile, '$.region', `"${rawWorld.region}" is not defined in _meta.json regions`);
    const seenLevel = new Set();
    for (const { file, lv } of w.levels) {
      if (seenLevel.has(lv.id)) fail(file, '$.id', `duplicate level id ${lv.id} inside ${rawWorld.id}`);
      seenLevel.add(lv.id);
    }
  }
  if (errors.length) return { errors };

  const generated = sourceTimestamp(srcDir, dirs);
  const files = new Map();
  const search = [];
  const refsAll = [];
  const rows = [];
  const totals = { worlds: 0, levels: 0, topics: 0, scenarios: 0, quiz: 0, flashcards: 0, refs: 0, dialBoards: 0, diagrams: 0, defends: 0, labs: 7 };
  const manifest = { generated, title: meta.title, subtitle: meta.subtitle, version: meta.version, regions: [], worlds: [], totals: {} };

  const worlds = loaded
    .map((w) => {
      const { claims, ...shipped } = w.rawWorld;
      const levels = w.levels.map((x) => x.lv).sort((a, b) => a.order - b.order);
      levels.forEach(fillHeadingIds);
      const topics = w.topics;
      topics.forEach((t) => fillHeadingIds({ blocks: t.explain }));
      // merge the topic author's extras (references with tr ids, glossary) and topic flashcards into the chapter
      const extra = w.extra || {};
      shipped.references = [...(shipped.references || []), ...(extra.references || [])];
      shipped.glossary = [...(shipped.glossary || []), ...(extra.glossary || [])];
      const topicCards = [];
      for (const t of topics) (t.flashcards || []).forEach((c, i) => topicCards.push({ id: `${t.id}-fc${i + 1}`, front: c.front, back: c.back, tags: c.tags || [], topic: t.id }));
      shipped.flashcards = [...(shipped.flashcards || []), ...topicCards];
      return { world: shipped, levels, topics };
    })
    .sort((a, b) => a.world.order - b.world.order);

  for (const { world, levels, topics } of worlds) {
    let dial = 0, diag = 0, defends = 0, quiz = 0, scen = 0;
    const topicMeta = topics.map((t) => {
      const sc = (t.scenarios || []).length;
      const qn = (t.quiz || []).length;
      scen += sc; quiz += qn;
      walkBlocks(t.explain, (b) => { if (b.t === 'dials') dial++; if (b.t === 'diagram') diag++; });
      search.push({ k: 'topic', w: world.id, l: t.id, t: t.title, x: clip(plain(t.summary)) });
      walkBlocks(t.explain, (b) => { if (b.t === 'h') search.push({ k: 'section', w: world.id, l: t.id, s: b.id, t: b.text, x: t.title }); });
      for (const s of t.scenarios || []) search.push({ k: 'scenario', w: world.id, l: t.id, t: clip(plain(s.title), 90), x: clip(plain(s.situation)) });
      for (const q of t.quiz || []) search.push({ k: 'quiz', w: world.id, l: t.id, t: clip(plain(q.q), 90), x: clip(plain(q.explain)) });
      return { id: t.id, order: t.order, group: t.group, title: t.title, summary: t.summary, useIf: t.useIf, avoidIf: t.avoidIf, minutes: t.minutes, difficulty: t.difficulty, scenarioCount: sc, quizCount: qn };
    });
    const levelMeta = levels.map((lv) => {
      walkLevelBlocks(lv, (b) => { if (b.t === 'dials') dial++; if (b.t === 'diagram') diag++; });
      if (lv.defend) defends++;
      const qn = (lv.quiz || []).length;
      quiz += qn;
      search.push({ k: 'level', w: world.id, l: lv.id, t: lv.title, x: clip(plain(lv.brief)) });
      walkBlocks(lv.blocks, (b) => { if (b.t === 'h') search.push({ k: 'section', w: world.id, l: lv.id, s: b.id, t: b.text, x: lv.title }); });
      for (const q of lv.quiz || []) search.push({ k: 'quiz', w: world.id, l: lv.id, t: clip(plain(q.q), 90), x: clip(plain(q.explain)) });
      return { id: lv.id, order: lv.order, title: lv.title, kind: lv.kind, minutes: lv.minutes, quizCount: qn, hasDefend: !!lv.defend, brief: lv.brief };
    });
    const cards = world.flashcards || [];
    for (const c of cards) search.push({ k: 'card', w: world.id, t: clip(plain(c.front), 90), x: clip(plain(c.back)) });
    for (const r of world.references || []) { search.push({ k: 'ref', w: world.id, t: r.title, x: clip(plain(r.note)) }); refsAll.push({ w: world.id, ...r }); }
    for (const g of world.glossary || []) search.push({ k: 'term', w: world.id, t: g.term, x: clip(plain(g.def)) });
    search.push({ k: 'world', w: world.id, t: world.title, x: clip(plain(world.tagline)) });

    manifest.worlds.push({
      id: world.id, order: world.order, region: world.region, title: world.title, short: world.short, tagline: world.tagline,
      story: world.story, oneLiner: world.oneLiner, minutes: world.minutes, prereqs: world.prereqs || [],
      levels: levelMeta, topics: topicMeta, quizCount: quiz, flashcardCount: cards.length, refCount: (world.references || []).length,
      topicCount: topics.length, scenarioCount: scen,
      file: `content/${world.id}.js`
    });
    const body = `Guide.content._register(${JSON.stringify(world.id)}, ${JSON.stringify({ ...world, levels, topics })});\n`;
    files.set(`${world.id}.js`, body);

    totals.worlds++; totals.levels += levels.length; totals.topics += topics.length; totals.scenarios += scen; totals.quiz += quiz; totals.flashcards += cards.length;
    totals.refs += (world.references || []).length; totals.dialBoards += dial; totals.diagrams += diag; totals.defends += defends;
    rows.push([world.id, levels.length, quiz, cards.length, (world.references || []).length, dial, diag, defends, (Buffer.byteLength(body) / 1024).toFixed(1)]);
  }

  manifest.regions = meta.regions.map((r) => ({ ...r, worlds: manifest.worlds.filter((w) => w.region === r.id).map((w) => w.id) }));
  manifest.totals = totals;

  files.set('manifest.js', `window.Guide = window.Guide || {};\nGuide.manifest = ${JSON.stringify(manifest)};\n`);
  files.set('search-index.js', `window.Guide = window.Guide || {};\nGuide.searchIndex = ${JSON.stringify(search)};\n`);
  files.set('refs-all.js', `window.Guide = window.Guide || {};\nGuide.refsAll = ${JSON.stringify(refsAll)};\n`);

  fs.mkdirSync(outDir, { recursive: true });
  for (const entry of fs.readdirSync(outDir)) fs.rmSync(path.join(outDir, entry), { recursive: true, force: true });
  for (const name of [...files.keys()].sort()) fs.writeFileSync(path.join(outDir, name), files.get(name));

  log(formatTable(['World', 'Levels', 'Quiz', 'Cards', 'Refs', 'Dials', 'Diagrams', 'Defend', 'KB'], rows, ['l', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r']));
  return { errors: [], totals, generated, outDir, fileCount: files.size, rows };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  let args;
  try {
    args = parseArgs(process.argv.slice(2), ['src', 'out', 'site']);
    const siteDir = args.site ? path.resolve(args.site) : paths.site;
    const result = build({
      srcDir: args.src ? path.resolve(args.src) : paths.src,
      outDir: args.out ? path.resolve(args.out) : path.join(siteDir, 'content'),
      includeFixture: !!args['include-fixture'],
      log: (s) => { if (!args.quiet) console.log(s); }
    });
    if (result.errors.length) {
      console.error(`Build failed with ${result.errors.length} error${result.errors.length === 1 ? '' : 's'}:`);
      for (const e of result.errors) console.error(`  error: ${e}`);
      process.exit(1);
    }
    const t = result.totals;
    console.log(`\nBuilt ${t.worlds} worlds, ${t.levels} levels, ${t.quiz} quiz items, ${t.flashcards} cards, ${t.refs} refs, ${t.dialBoards} dial boards, ${t.diagrams} diagrams, ${t.defends} defends.`);
    console.log(`Wrote ${result.fileCount} files to ${rel(result.outDir)} (generated ${result.generated}).`);
  } catch (err) {
    console.error(`error: ${err.message}`);
    process.exit(err instanceof ToolError ? 1 : 2);
  }
}
