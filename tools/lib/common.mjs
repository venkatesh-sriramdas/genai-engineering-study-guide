// Shared helpers for the study guide tools (build, validate, link-check, check-render, package).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export class ToolError extends Error {}

export const toolsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const root = path.resolve(toolsDir, '..');
export const paths = {
  root,
  toolsDir,
  src: path.join(root, 'content-src'),
  site: path.join(root, 'site'),
  content: path.join(root, 'site', 'content'),
  reviews: path.join(root, 'reviews'),
  dist: path.join(root, 'dist'),
  blocklist: path.join(toolsDir, 'blocklist.txt'),
  scratch: path.join(toolsDir, '.scratch')
};

export const rel = (p) => path.relative(root, p).split(path.sep).join('/') || '.';

/* ---------- command line ---------- */
export function parseArgs(argv, valueOpts = []) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const eq = a.indexOf('=');
    const name = eq === -1 ? a.slice(2) : a.slice(2, eq);
    if (eq !== -1) out[name] = a.slice(eq + 1);
    else if (valueOpts.includes(name)) {
      if (i + 1 >= argv.length) throw new ToolError(`--${name} needs a value`);
      out[name] = argv[++i];
    } else out[name] = true;
  }
  return out;
}

/* ---------- JSON with useful errors ---------- */
export function jsonErrorWhere(text, err) {
  const m = /position (\d+)/.exec(err.message);
  const pos = m ? Math.min(Number(m[1]), text.length) : text.length;
  const before = text.slice(0, pos).split('\n');
  const line = before.length;
  const col = before[before.length - 1].length + 1;
  const lineText = (text.split('\n')[line - 1] || '').trim().slice(0, 80);
  const reason = err.message.split(' in JSON at')[0].split('\n')[0];
  return `${reason} (line ${line}, column ${col})${lineText ? `: ${lineText}` : ''}`;
}

export function parseJsonText(text, file) {
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new ToolError(`${rel(file)}: invalid JSON, ${jsonErrorWhere(text, err)}`);
  }
}

export function readJson(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    throw new ToolError(`${rel(file)}: cannot read file (${err.code || err.message})`);
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return parseJsonText(text, file);
}

/* ---------- text helpers ---------- */
export const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'x';

/* Plain text for the search index: strips the inline markdown defined in CONTRACT.md. */
export const plain = (s) => String(s ?? '')
  .replace(/\[\[(r\d+)\]\]/g, '')
  .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  .replace(/==/g, '')
  .replace(/[*`]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

export const clip = (s, n = 240) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

export function isIsoDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/* ---------- block walking ---------- */
/* Calls fn(block, jsonPath) for every block, descending into tabs and accordions. Tolerates malformed input. */
export function walkBlocks(blocks, fn, base = 'blocks') {
  if (!Array.isArray(blocks)) return;
  blocks.forEach((b, i) => {
    if (!b || typeof b !== 'object') return;
    const p = `${base}[${i}]`;
    fn(b, p);
    if (b.t === 'tabs' && Array.isArray(b.tabs)) b.tabs.forEach((t, j) => walkBlocks(t && t.blocks, fn, `${p}.tabs[${j}].blocks`));
    if (b.t === 'accordion' && Array.isArray(b.items)) b.items.forEach((it, j) => walkBlocks(it && it.blocks, fn, `${p}.items[${j}].blocks`));
  });
}

/* Every block of a level, including the model answer of a defend question. */
export function walkLevelBlocks(level, fn) {
  walkBlocks(level.blocks, fn, 'blocks');
  if (level.defend && typeof level.defend === 'object') walkBlocks(level.defend.modelAnswer, fn, 'defend.modelAnswer');
}

/* Fills block.id for headings: slug of the text, unique within the level. */
export function fillHeadingIds(level) {
  const seen = new Set();
  walkBlocks(level.blocks, (b) => {
    if (b.t !== 'h') return;
    const base = b.id || slug(b.text);
    let id = base;
    let n = 2;
    while (seen.has(id)) id = `${base}-${n++}`;
    seen.add(id);
    b.id = id;
  });
}

/* ---------- source discovery ---------- */
export function listWorldDirs(srcDir, { includeFixture = false } = {}) {
  const out = [];
  if (!fs.existsSync(srcDir)) return out;
  for (const name of fs.readdirSync(srcDir).sort()) {
    const full = path.join(srcDir, name);
    if (!fs.statSync(full).isDirectory()) continue;
    if (/^w\d\d-/.test(name)) out.push({ dir: full, name, fixture: false });
  }
  const fx = path.join(srcDir, '_fixture');
  if (includeFixture && fs.existsSync(fx)) {
    for (const name of fs.readdirSync(fx).sort()) {
      const full = path.join(fx, name);
      if (fs.statSync(full).isDirectory() && /^w\d\d-/.test(name)) out.push({ dir: full, name, fixture: true });
    }
  }
  return out;
}

export function listLevelFiles(worldDir) {
  return fs.readdirSync(worldDir)
    .filter((f) => /^l\d+.*\.json$/.test(f))
    .sort();
}

const DEFAULT_LABS = ['kv-cache', 'prompt-cache', 'latency-budget', 'chunk-visualizer', 'rrf-playground', 'acl-simulator', 'context-budget'];
export function readLabIds(siteDir = paths.site) {
  try {
    const text = fs.readFileSync(path.join(siteDir, 'assets', 'js', 'labs-registry.js'), 'utf8');
    const ids = [...text.matchAll(/\{\s*id:\s*'([a-z0-9-]+)'\s*,\s*world:/g)].map((m) => m[1]);
    return ids.length ? ids : DEFAULT_LABS;
  } catch {
    return DEFAULT_LABS;
  }
}

/* Newest modification time of the source files, so output is reproducible for the same sources. */
export function sourceTimestamp(srcDir, dirs) {
  if (process.env.SOURCE_DATE_EPOCH) return new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString();
  let newest = fs.statSync(path.join(srcDir, '_meta.json')).mtimeMs;
  for (const { dir } of dirs) {
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.json')) newest = Math.max(newest, fs.statSync(path.join(dir, f)).mtimeMs);
    }
  }
  return new Date(Math.floor(newest / 1000) * 1000).toISOString();
}

/* ---------- output ---------- */
export function formatTable(headers, rows, align = []) {
  const cells = rows.map((r) => r.map((c) => String(c ?? '')));
  const w = headers.map((h, i) => Math.max(String(h).length, ...cells.map((r) => r[i].length)));
  const fmt = (r) => r.map((c, i) => (align[i] === 'r' ? c.padStart(w[i]) : c.padEnd(w[i]))).join('  ').trimEnd();
  return [fmt(headers.map(String)), w.map((n) => '-'.repeat(n)).join('  '), ...cells.map(fmt)].join('\n');
}

export function mdTable(headers, rows) {
  const esc = (c) => String(c ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  return [`| ${headers.map(esc).join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.map(esc).join(' | ')} |`)].join('\n');
}

export const today = () => new Date().toISOString().slice(0, 10);

export function reportFrontmatter({ title, description }) {
  return `---\ntitle: ${title}\ndescription: ${description}\nms.date: ${today()}\nms.topic: reference\nkeywords:\n  - report\n  - study guide\nestimated_reading_time: 5\n---\n\n`;
}
