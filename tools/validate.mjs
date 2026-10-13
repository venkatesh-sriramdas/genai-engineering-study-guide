#!/usr/bin/env node
// Validates content-src/ against CONTRACT.md. Errors fail the run (exit 1), warnings do not unless --strict.
// Usage: node tools/validate.mjs [--include-fixture] [--world w04] [--src <dir>] [--strict] [--errors-only] [--verbose]
//        [--json] [--quiet] [--no-table] [--no-catalog] [--catalog <file>] [--report [file]]
// Output groups repeated issues by rule and message. --verbose lists every issue. --strict also fails on warnings and
// turns catalog mismatches (catalog topic with no file, topic file not in TOPIC-CATALOG.md) into errors.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  paths, parseArgs, parseJsonText, ToolError, rel, walkBlocks, walkLevelBlocks, isIsoDate, readLabIds,
  listWorldDirs, listLevelFiles, formatTable, mdTable, reportFrontmatter, today as todayIso
} from './lib/common.mjs';

export const REGIONS = ['foundations', 'knowledge', 'agents', 'senses', 'operate', 'finale'];
const LEVEL_KINDS = ['problem', 'concept', 'lab', 'boss'];
const REF_TYPES = ['spec', 'doc', 'paper', 'blog', 'course', 'video', 'repo', 'tool'];
const REF_STATUS = ['ga', 'preview', 'deprecated', 'n/a'];
const CALLOUT_KINDS = ['tip', 'gotcha', 'warn', 'preview', 'interview', 'why', 'note'];
const QUIZ_TYPES = ['single', 'multi', 'order', 'match', 'numeric'];
const QUIZ_TAGS = ['concept', 'diagnose', 'flip', 'bug', 'numeric', 'tradeoff', 'security', 'order'];
const LIST_STYLES = ['ul', 'ol', 'checks'];
const CONFIDENCE = ['high', 'medium', 'low'];
const MODEL_ANSWER_BLOCKS = ['p', 'list', 'table', 'callout', 'diagram', 'compare'];
const VISUAL_BLOCKS = ['diagram', 'flow', 'table', 'compare', 'dials', 'stats'];
const KNOWN_LANGS = ['python', 'csharp', 'javascript', 'typescript', 'json', 'jsonc', 'yaml', 'bash', 'sh', 'shell', 'powershell', 'sql', 'text', 'plaintext', 'console', 'kql', 'http', 'xml', 'html', 'css', 'java', 'go', 'rust', 'bicep', 'markdown', 'diff', 'ini', 'toml', 'dockerfile', 'graphql', 'csv', 'regex', 'hcl', 'terraform', 'cpp', 'c', 'mermaid'];
const FILLER = /\b(simply|easily|just|robust|robustly|seamless|seamlessly|powerful)\b/gi;
const UNDATED = /\b(recently|now|nowadays|these days|at the moment)\b/i;
const HAS_DATE = /\b\d{4}-\d{2}-\d{2}\b|\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/;

const WORLD_KEYS = ['id', 'order', 'region', 'title', 'short', 'tagline', 'story', 'oneLiner', 'youWillLearn', 'minutes', 'prereqs', 'flashcards', 'references', 'glossary', 'claims'];
const TOPIC_KEYS = ['id', 'order', 'group', 'title', 'minutes', 'difficulty', 'summary', 'useIf', 'avoidIf', 'explain', 'whereToUse', 'whenToUse', 'alternatives', 'pitfalls', 'scenarios', 'quiz', 'flashcards', 'related', 'refs'];
const TOPICS_EXTRA_KEYS = ['references', 'glossary', 'claims'];
const TOPIC_DIFFICULTY = ['core', 'advanced'];
const SCENARIO_VERDICTS = ['best', 'good', 'poor'];
const TOPIC_EXPLAIN_BLOCKS = ['h', 'p', 'list', 'callout', 'table', 'compare', 'dials', 'flow', 'diagram', 'code', 'formula', 'stats', 'failure', 'tabs', 'accordion', 'lab'];
const EXPLAIN_MIN = 150;
const EXPLAIN_MAX = 450;
const LEVEL_KEYS = ['id', 'order', 'title', 'kind', 'minutes', 'brief', 'blocks', 'quiz', 'defend', 'refs', 'takeaways'];
const DEFEND_KEYS = ['prompt', 'timebox', 'clarify', 'options', 'modelAnswer', 'rubric', 'followUps', 'redFlags'];
const BLOCK_KEYS = {
  h: ['text', 'level', 'id'], p: ['md'], list: ['style', 'items'], callout: ['kind', 'title', 'md'],
  table: ['caption', 'head', 'rows', 'highlightCol', 'compact'], compare: ['title', 'intro', 'options'],
  dials: ['id', 'title', 'prompt', 'dials', 'options', 'scores', 'takeaway'], scenario: ['title', 'known', 'ask', 'tension'],
  flow: ['title', 'steps', 'direction'], diagram: ['id', 'title', 'src', 'alt', 'caption'], code: ['lang', 'title', 'code', 'caption'],
  formula: ['title', 'expr', 'vars', 'example'], stats: ['items'], failure: ['title', 'items'], tabs: ['tabs'], accordion: ['items'], lab: ['id', 'intro']
};
const QUIZ_KEYS = {
  common: ['id', 'type', 'tag', 'q', 'explain', 'difficulty', 'ref', 'code'],
  single: ['options', 'answer'], multi: ['options', 'answers'], order: ['items'], match: ['pairs'], numeric: ['answer', 'tolerancePct', 'unit', 'hint']
};

/* ---------- small predicates ---------- */
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string' && v.trim() !== '';
const isInt = (v) => Number.isInteger(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/* ---------- Mermaid heuristics ---------- */
const FLOW_SKIP = /^(flowchart|graph|subgraph|end|direction|classDef|class|style|linkStyle|click)\b/i;

function flowNodes(lines) {
  const ids = new Set();
  const labels = [];
  for (const raw of lines) {
    const line = raw.replace(/%%.*$/, '').trim();
    if (!line || FLOW_SKIP.test(line)) continue;
    for (const m of line.matchAll(/\[([^\]]+)\]|\(([^()]+)\)|\{([^{}]+)\}/g)) labels.push(m[1] || m[2] || m[3]);
    let s = line.replace(/"[^"]*"/g, '');
    for (let i = 0; i < 2; i++) {
      s = s.replace(/\(\([^()]*\)\)|\(\[[^\]]*\]\)|\[\([^)]*\)\]|\[\[[^\]]*\]\]|\{\{[^}]*\}\}|\[[^\]]*\]|\([^()]*\)|\{[^{}]*\}/g, '');
    }
    s = s.replace(/\|[^|]*\|/g, '').replace(/:::[\w-]+/g, '');
    s = s.replace(/--\s+[^>\n]*?\s+-->/g, ' --> ').replace(/-\.\s+[^>\n]*?\s+\.->/g, ' --> ').replace(/==\s+[^>\n]*?\s+==>/g, ' --> ');
    for (const tok of s.split(/\s*(?:<?-->|<?==>|<?-\.->|-\.-|---|===|--[ox]|~~~|&|;)\s*/)) {
      const id = tok.trim();
      if (/^[A-Za-z_][\w]*$/.test(id)) ids.add(id);
    }
  }
  return { ids, labels };
}

function sequenceNodes(lines) {
  const ids = new Set();
  for (const raw of lines) {
    const line = raw.replace(/%%.*$/, '').trim();
    let m = /^(?:participant|actor)\s+([A-Za-z_]\w*)/.exec(line);
    if (m) { ids.add(m[1]); continue; }
    m = /^([A-Za-z_]\w*)\s*(?:<<-->>|<<->>|-->>|->>|--x|-x|-->|->|--\)|-\))\s*[+-]?([A-Za-z_]\w*)\s*:/.exec(line);
    if (m) { ids.add(m[1]); ids.add(m[2]); }
  }
  return { ids, labels: [] };
}

function stateNodes(lines) {
  const ids = new Set();
  for (const raw of lines) {
    const line = raw.replace(/%%.*$/, '').trim();
    let m = /^(\[\*\]|\w+)\s*-->\s*(\[\*\]|\w+)/.exec(line);
    if (m) { for (const x of [m[1], m[2]]) if (x !== '[*]') ids.add(x); continue; }
    m = /^state\s+(?:"[^"]*"\s+as\s+)?(\w+)/.exec(line);
    if (m) { ids.add(m[1]); continue; }
    m = /^(\w+)\s*:\s*\S/.exec(line);
    if (m && !/^(note|direction)$/i.test(m[1])) ids.add(m[1]);
  }
  return { ids, labels: [] };
}

export function analyzeMermaid(src) {
  const problems = [];
  const text = String(src || '');
  const lines = text.split('\n');
  const first = (lines.find((l) => l.trim() && !l.trim().startsWith('%%')) || '').trim();
  let kind = 'unknown';
  let result = { ids: new Set(), labels: [] };
  if (/^(flowchart|graph)\s+(LR|RL|TB|TD|BT)\b/i.test(first)) { kind = 'flow'; result = flowNodes(lines); }
  else if (/^(flowchart|graph)\b/i.test(first)) { kind = 'flow'; problems.push(['warn', 'diagram-type', 'flowchart or graph should state a direction (LR or TB)']); result = flowNodes(lines); }
  else if (/^sequenceDiagram\b/.test(first)) { kind = 'sequence'; result = sequenceNodes(lines); }
  else if (/^stateDiagram-v2\b/.test(first)) { kind = 'state'; result = stateNodes(lines); }
  else problems.push(['warn', 'diagram-type', `first line "${first.slice(0, 40)}" is not flowchart, graph, sequenceDiagram or stateDiagram-v2`]);
  if (/^\s*---/.test(text)) problems.push(['error', 'diagram-config', 'frontmatter config is not allowed, the engine themes diagrams']);
  if (/%%\{\s*init/i.test(text)) problems.push(['error', 'diagram-config', '%%{init}%% is not allowed, the engine themes diagrams']);
  if (lines.some((l) => /^\s*(style|classDef|linkStyle|click)\b/.test(l) || /^\s*class\s+\w/.test(l))) problems.push(['error', 'diagram-style', 'custom styling directives (style, classDef, class, linkStyle, click) are not allowed']);
  if (result.ids.size > 12) problems.push(['error', 'diagram-nodes', `about ${result.ids.size} nodes, the limit is 12`]);
  if (kind === 'flow' && result.ids.size === 0) problems.push(['warn', 'diagram-empty', 'no nodes found, check the Mermaid source']);
  const longLabel = result.labels.find((l) => l.length > 40);
  if (longLabel) problems.push(['warn', 'diagram-label', `label "${longLabel.slice(0, 30)}..." is longer than 40 characters, keep labels short`]);
  return { kind, nodes: result.ids.size, problems };
}

/* ---------- dial boards ---------- */
function boardLeaders(board) {
  const dials = board.dials;
  const leaders = new Set();
  const pick = new Array(dials.length).fill(0);
  const total = dials.reduce((n, d) => n * d.values.length, 1);
  for (let c = 0; c < total; c++) {
    let rem = c;
    dials.forEach((d, i) => { pick[i] = rem % d.values.length; rem = Math.floor(rem / d.values.length); });
    let best = null;
    let bestScore = -Infinity;
    for (const o of board.options) {
      let sum = 0;
      dials.forEach((d, i) => { sum += board.scores[o.id][d.id][d.values[pick[i]].id].s; });
      if (sum > bestScore) { bestScore = sum; best = o.id; }
    }
    leaders.add(best);
  }
  return leaders;
}

/* ---------- the validator ---------- */
export function validateTree({
  srcDir = paths.src, siteDir = paths.site, blocklistPath = paths.blocklist,
  includeFixture = false, worldFilter = null, today = todayIso(),
  catalogPath = srcDir === paths.src ? path.join(paths.root, 'TOPIC-CATALOG.md') : null, catalogStrict = false
} = {}) {
  const issues = [];
  const stats = [];
  const labIds = new Set(readLabIds(siteDir));
  const reg = { levels: new Map(), topics: new Map(), scenarios: new Map(), quiz: new Map(), cards: new Map(), boards: new Map(), diagrams: new Map(), worldIds: new Map(), worldOrders: new Map() };
  const relatedChecks = [];
  let filesChecked = 0;

  const add = (sev, rule, at, p, msg) => issues.push({ sev, rule, file: at.file, level: at.level || '', world: at.world || '', path: p || '', msg });
  const err = (rule, at, p, msg) => add('error', rule, at, p, msg);
  const warn = (rule, at, p, msg) => add('warn', rule, at, p, msg);
  const claim = (map, id, at, rule, p, what) => {
    if (map.has(id)) err(rule, at, p, `duplicate ${what} id "${id}" (first used in ${map.get(id)})`);
    else map.set(id, at.file);
  };
  const join = (a, b) => (a ? `${a}.${b}` : b);

  const needStr = (at, obj, key, base, { optional = false, rule = 'field' } = {}) => {
    const v = obj[key];
    const p = join(base, key);
    if (v === undefined || v === null) { if (!optional) err(`${rule}-missing`, at, p, 'required string is missing'); return undefined; }
    if (!isStr(v)) { err(`${rule}-type`, at, p, 'expected a non-empty string'); return undefined; }
    return v;
  };
  const needArr = (at, obj, key, base, { min = 1, max = Infinity, itemType = null, soft = false, rule = 'field' } = {}) => {
    const v = obj[key];
    const p = join(base, key);
    if (v === undefined || v === null) { err(`${rule}-missing`, at, p, 'required array is missing'); return undefined; }
    if (!Array.isArray(v)) { err(`${rule}-type`, at, p, 'expected an array'); return undefined; }
    if (v.length < min || v.length > max) {
      const msg = `expected ${min}${max === Infinity ? ' or more' : ` to ${max}`} items, found ${v.length}`;
      if (soft) warn(`${rule}-count`, at, p, msg); else err(`${rule}-count`, at, p, msg);
    }
    if (itemType === 'string') v.forEach((s, i) => { if (!isStr(s)) err(`${rule}-type`, at, `${p}[${i}]`, 'expected a non-empty string'); });
    return v;
  };
  const unknownKeys = (at, obj, allowed, base) => {
    for (const k of Object.keys(obj)) if (!allowed.includes(k)) warn('unknown-key', at, join(base, k), `unknown field "${k}"`);
  };

  /* learner-facing text rules */
  const proseCheck = (at, p, s, refIds) => {
    if (typeof s !== 'string') return;
    const noCode = s.replace(/`[^`]*`/g, ' ');
    const prose = noCode.replace(/https?:\/\/\S+/g, ' ');
    if (prose.includes('\u2014')) warn('text-emdash', at, p, 'em dash found, use a comma, colon or full stop');
    const filler = [...new Set([...prose.matchAll(FILLER)].map((m) => m[1].toLowerCase()))];
    if (filler.length) warn('text-filler', at, p, `filler word${filler.length > 1 ? 's' : ''}: ${filler.join(', ')}`);
    if (UNDATED.test(prose) && !HAS_DATE.test(s)) warn('text-undated', at, p, 'time-relative word (recently, now) without an absolute date');
    if (/<\/?[a-zA-Z][a-zA-Z0-9-]*(\s[^<>]*)?\/?>/.test(noCode)) warn('md-raw-html', at, p, 'raw HTML in content, use the inline markdown only');
    if ((s.match(/`/g) || []).length % 2) warn('md-unbalanced', at, p, 'odd number of backticks');
    if ((noCode.match(/\*\*/g) || []).length % 2) warn('md-unbalanced', at, p, 'odd number of ** markers');
    if ((noCode.match(/==/g) || []).length % 2) warn('md-unbalanced', at, p, 'odd number of == markers');
    for (const m of noCode.matchAll(/\[[^\]]*\]\(([^)]*)\)/g)) {
      if (!/^https?:\/\/[^\s]+$/i.test(m[1].trim())) err('md-link-scheme', at, p, `link target "${m[1].slice(0, 40)}" must be an http or https URL`);
    }
    for (const m of noCode.matchAll(/\[\[([^\[\]\n]{1,20})\]\]/g)) {
      const id = m[1];
      if (/^t?r\d+$/.test(id)) {
        if (refIds && !refIds.has(id)) err('ref-unknown', at, p, `citation [[${id}]] does not match a reference in this world`);
      } else if (/^\s*t?r\d+\s*$/i.test(id)) warn('md-citation', at, p, `citation [[${id}]] is malformed, use lowercase [[r1]] or [[tr1]] without spaces`);
    }
  };
  const SKIP_KEYS = new Set(['id', 't', 'kind', 'type', 'lang', 'code', 'src', 'url', 'style', 'direction', 'status', 'verified', 'confidence', 'where', 'ref', 'refs', 'tags', 'tag', 'prereqs', 'region', 'claims', 'expr', 'unit', 'timebox']);
  const walkText = (at, node, base, refIds, key = '') => {
    if (typeof node === 'string') { if (!SKIP_KEYS.has(key)) proseCheck(at, base, node, refIds); return; }
    if (Array.isArray(node)) { node.forEach((x, i) => walkText(at, x, `${base}[${i}]`, refIds, key)); return; }
    if (isObj(node)) for (const [k, v] of Object.entries(node)) walkText(at, v, join(base, k), refIds, k);
  };

  /* ---------- blocks ---------- */
  function validateBlock(at, b, p, ctx, depth = 0, allowed = null) {
    if (!isObj(b)) { err('block-type', at, p, 'block must be an object'); return; }
    const t = b.t;
    if (!Object.prototype.hasOwnProperty.call(BLOCK_KEYS, t)) { err('block-unknown', at, join(p, 't'), `unknown block type "${t}"`); return; }
    if (allowed && !allowed.includes(t)) err('block-not-allowed', at, p, `block type "${t}" is not allowed here (allowed: ${allowed.join(', ')})`);
    unknownKeys(at, b, ['t', ...BLOCK_KEYS[t]], p);
    switch (t) {
      case 'h': {
        needStr(at, b, 'text', p, { rule: 'block' });
        if (b.level !== 2 && b.level !== 3) err('block-heading-level', at, join(p, 'level'), 'heading level must be 2 or 3');
        if (b.id !== undefined) {
          if (!isStr(b.id) || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(b.id)) err('block-heading-id', at, join(p, 'id'), 'heading id must be lowercase letters, digits and hyphens');
          else if (ctx.headingIds.has(b.id)) err('block-heading-id', at, join(p, 'id'), `duplicate heading id "${b.id}" in this level`);
          else ctx.headingIds.add(b.id);
        }
        ctx.hasHeading = true;
        break;
      }
      case 'p': needStr(at, b, 'md', p, { rule: 'block' }); break;
      case 'list':
        if (!LIST_STYLES.includes(b.style)) err('block-list-style', at, join(p, 'style'), `style must be one of ${LIST_STYLES.join(', ')}`);
        needArr(at, b, 'items', p, { itemType: 'string', rule: 'block-list' });
        break;
      case 'callout':
        if (!CALLOUT_KINDS.includes(b.kind)) err('block-callout-kind', at, join(p, 'kind'), `kind must be one of ${CALLOUT_KINDS.join(', ')}`);
        needStr(at, b, 'title', p, { optional: true, rule: 'block' });
        needStr(at, b, 'md', p, { rule: 'block' });
        break;
      case 'table': {
        needStr(at, b, 'caption', p, { optional: true, rule: 'block' });
        const head = needArr(at, b, 'head', p, { itemType: 'string', rule: 'block-table' });
        const rows = needArr(at, b, 'rows', p, { rule: 'block-table' });
        if (head && rows) {
          rows.forEach((r, i) => {
            if (!Array.isArray(r)) err('block-table-row', at, `${p}.rows[${i}]`, 'row must be an array of strings');
            else {
              if (r.length !== head.length) err('block-table-row', at, `${p}.rows[${i}]`, `row has ${r.length} cells, header has ${head.length}`);
              r.forEach((c, j) => { if (typeof c !== 'string') err('block-table-row', at, `${p}.rows[${i}][${j}]`, 'cell must be a string'); });
            }
          });
          if (b.highlightCol !== undefined && (!isInt(b.highlightCol) || b.highlightCol < 0 || b.highlightCol >= head.length)) err('block-table-highlight', at, join(p, 'highlightCol'), `highlightCol must be an integer from 0 to ${head.length - 1}`);
        }
        if (b.compact !== undefined && typeof b.compact !== 'boolean') err('block-type', at, join(p, 'compact'), 'compact must be true or false');
        break;
      }
      case 'compare': {
        needStr(at, b, 'title', p, { rule: 'block' });
        needStr(at, b, 'intro', p, { optional: true, rule: 'block' });
        const opts = needArr(at, b, 'options', p, { min: 2, soft: true, rule: 'block-compare' });
        (opts || []).forEach((o, i) => {
          const op = `${p}.options[${i}]`;
          if (!isObj(o)) { err('block-compare-option', at, op, 'option must be an object'); return; }
          unknownKeys(at, o, ['name', 'tag', 'summary', 'pros', 'cons', 'bestWhen', 'avoidWhen', 'meta'], op);
          for (const k of ['name', 'summary', 'bestWhen', 'avoidWhen']) needStr(at, o, k, op, { rule: 'block-compare' });
          needStr(at, o, 'tag', op, { optional: true, rule: 'block-compare' });
          needArr(at, o, 'pros', op, { itemType: 'string', rule: 'block-compare' });
          needArr(at, o, 'cons', op, { itemType: 'string', rule: 'block-compare' });
          if (o.meta !== undefined) {
            if (!Array.isArray(o.meta)) err('block-compare-meta', at, join(op, 'meta'), 'meta must be an array of {k, v}');
            else o.meta.forEach((m, j) => { if (!isObj(m) || !isStr(m.k) || !isStr(m.v)) err('block-compare-meta', at, `${op}.meta[${j}]`, 'meta item needs string k and v'); });
          }
        });
        break;
      }
      case 'dials': validateDials(at, b, p, ctx); break;
      case 'scenario':
        needStr(at, b, 'title', p, { rule: 'block' });
        needArr(at, b, 'known', p, { itemType: 'string', rule: 'block-scenario' });
        needArr(at, b, 'ask', p, { itemType: 'string', rule: 'block-scenario' });
        needStr(at, b, 'tension', p, { optional: true, rule: 'block' });
        break;
      case 'flow': {
        needStr(at, b, 'title', p, { optional: true, rule: 'block' });
        if (b.direction !== undefined && b.direction !== 'h' && b.direction !== 'v') err('block-flow-direction', at, join(p, 'direction'), 'direction must be "h" or "v"');
        const steps = needArr(at, b, 'steps', p, { min: 2, soft: true, rule: 'block-flow' });
        (steps || []).forEach((s, i) => {
          const sp = `${p}.steps[${i}]`;
          if (!isObj(s)) { err('block-flow-step', at, sp, 'step must be an object'); return; }
          unknownKeys(at, s, ['title', 'md', 'tag'], sp);
          needStr(at, s, 'title', sp, { rule: 'block-flow' });
          needStr(at, s, 'md', sp, { rule: 'block-flow' });
          needStr(at, s, 'tag', sp, { optional: true, rule: 'block-flow' });
        });
        break;
      }
      case 'diagram': {
        const id = needStr(at, b, 'id', p, { rule: 'block-diagram' });
        if (id) {
          if (!new RegExp(`^${at.world}-[a-z0-9][a-z0-9-]*$`).test(id)) err('id-format', at, join(p, 'id'), `diagram id "${id}" must start with "${at.world}-" and use lowercase letters, digits and hyphens`);
          claim(reg.diagrams, id, at, 'id-duplicate', join(p, 'id'), 'diagram');
        }
        needStr(at, b, 'title', p, { rule: 'block' });
        needStr(at, b, 'alt', p, { rule: 'block-diagram-alt' });
        needStr(at, b, 'caption', p, { optional: true, rule: 'block' });
        const src = needStr(at, b, 'src', p, { rule: 'block-diagram-src' });
        if (src) {
          const a = analyzeMermaid(src);
          for (const [sev, rule, msg] of a.problems) add(sev, rule, at, join(p, 'src'), msg);
        }
        ctx.diagrams++;
        break;
      }
      case 'code':
        if (!isStr(b.lang)) err('block-code-lang', at, join(p, 'lang'), 'lang is required (use "text" for plain output)');
        else if (!KNOWN_LANGS.includes(b.lang.toLowerCase())) warn('block-code-lang', at, join(p, 'lang'), `language "${b.lang}" is not in the known list: ${KNOWN_LANGS.join(', ')}`);
        if (typeof b.code !== 'string' || !b.code.trim()) err('block-code-empty', at, join(p, 'code'), 'code must be a non-empty string');
        needStr(at, b, 'title', p, { optional: true, rule: 'block' });
        needStr(at, b, 'caption', p, { optional: true, rule: 'block' });
        break;
      case 'formula':
        needStr(at, b, 'title', p, { rule: 'block' });
        needStr(at, b, 'expr', p, { rule: 'block-formula' });
        needStr(at, b, 'example', p, { optional: true, rule: 'block' });
        if (b.vars !== undefined) {
          if (!Array.isArray(b.vars)) err('block-formula-vars', at, join(p, 'vars'), 'vars must be an array of {k, v}');
          else b.vars.forEach((v, i) => { if (!isObj(v) || !isStr(v.k) || !isStr(v.v)) err('block-formula-vars', at, `${p}.vars[${i}]`, 'var needs string k and v'); });
        }
        break;
      case 'stats': {
        const items = needArr(at, b, 'items', p, { rule: 'block-stats' });
        (items || []).forEach((s, i) => {
          const sp = `${p}.items[${i}]`;
          if (!isObj(s)) { err('block-stats-item', at, sp, 'item must be an object'); return; }
          unknownKeys(at, s, ['label', 'value', 'note'], sp);
          needStr(at, s, 'label', sp, { rule: 'block-stats' });
          if (!(isStr(s.value) || isNum(s.value))) err('block-stats-value', at, join(sp, 'value'), 'value must be a non-empty string or a number');
          needStr(at, s, 'note', sp, { optional: true, rule: 'block-stats' });
        });
        break;
      }
      case 'failure': {
        needStr(at, b, 'title', p, { rule: 'block' });
        const items = needArr(at, b, 'items', p, { rule: 'block-failure' });
        (items || []).forEach((s, i) => {
          const sp = `${p}.items[${i}]`;
          if (!isObj(s)) { err('block-failure-item', at, sp, 'item must be an object'); return; }
          unknownKeys(at, s, ['symptom', 'cause', 'fix'], sp);
          for (const k of ['symptom', 'cause', 'fix']) needStr(at, s, k, sp, { rule: 'block-failure' });
        });
        break;
      }
      case 'tabs': {
        const tabs = needArr(at, b, 'tabs', p, { min: 2, soft: true, rule: 'block-tabs' });
        (tabs || []).forEach((tab, i) => {
          const tp = `${p}.tabs[${i}]`;
          if (!isObj(tab)) { err('block-tabs-item', at, tp, 'tab must be an object'); return; }
          unknownKeys(at, tab, ['label', 'blocks'], tp);
          needStr(at, tab, 'label', tp, { rule: 'block-tabs' });
          const inner = needArr(at, tab, 'blocks', tp, { rule: 'block-tabs' });
          (inner || []).forEach((nb, j) => validateBlock(at, nb, `${tp}.blocks[${j}]`, ctx, depth + 1, allowed));
        });
        if (depth >= 2) warn('block-nesting', at, p, 'tabs nested more than two levels deep');
        break;
      }
      case 'accordion': {
        const items = needArr(at, b, 'items', p, { rule: 'block-accordion' });
        (items || []).forEach((it, i) => {
          const ip = `${p}.items[${i}]`;
          if (!isObj(it)) { err('block-accordion-item', at, ip, 'item must be an object'); return; }
          unknownKeys(at, it, ['title', 'blocks'], ip);
          needStr(at, it, 'title', ip, { rule: 'block-accordion' });
          const inner = needArr(at, it, 'blocks', ip, { rule: 'block-accordion' });
          (inner || []).forEach((nb, j) => validateBlock(at, nb, `${ip}.blocks[${j}]`, ctx, depth + 1, allowed));
        });
        if (depth >= 2) warn('block-nesting', at, p, 'accordion nested more than two levels deep');
        break;
      }
      case 'lab':
        if (!isStr(b.id)) err('block-lab-id', at, join(p, 'id'), 'lab id is required');
        else if (!labIds.has(b.id)) err('block-lab-id', at, join(p, 'id'), `unknown lab "${b.id}" (known: ${[...labIds].join(', ')})`);
        needStr(at, b, 'intro', p, { optional: true, rule: 'block' });
        ctx.labs.add(b.id);
        break;
      default: break;
    }
  }

  function validateDials(at, b, p, ctx) {
    ctx.dialBoards++;
    const id = needStr(at, b, 'id', p, { rule: 'block-dials' });
    if (id) {
      if (!id.startsWith(`${at.level}-`) || !/^[a-z0-9-]+$/.test(id)) err('id-format', at, join(p, 'id'), `dial board id "${id}" must start with the level id "${at.level}-" and use lowercase letters, digits and hyphens`);
      claim(reg.boards, id, at, 'id-duplicate', join(p, 'id'), 'dial board');
    }
    needStr(at, b, 'title', p, { rule: 'block' });
    needStr(at, b, 'prompt', p, { rule: 'block' });
    needStr(at, b, 'takeaway', p, { rule: 'block' });
    const dials = needArr(at, b, 'dials', p, { min: 2, max: 4, rule: 'dial' });
    const options = needArr(at, b, 'options', p, { min: 3, max: 6, rule: 'dial-options' });
    const dialIds = new Map();
    const optIds = new Set();
    (dials || []).forEach((d, i) => {
      const dp = `${p}.dials[${i}]`;
      if (!isObj(d)) { err('dial-shape', at, dp, 'dial must be an object'); return; }
      unknownKeys(at, d, ['id', 'label', 'values'], dp);
      const did = needStr(at, d, 'id', dp, { rule: 'dial' });
      needStr(at, d, 'label', dp, { rule: 'dial' });
      const vals = needArr(at, d, 'values', dp, { min: 2, max: 4, rule: 'dial-values' });
      const vset = new Set();
      (vals || []).forEach((v, j) => {
        const vp = `${dp}.values[${j}]`;
        if (!isObj(v) || !isStr(v.id) || !isStr(v.label)) { err('dial-shape', at, vp, 'value needs string id and label'); return; }
        if (vset.has(v.id)) err('dial-duplicate', at, vp, `duplicate value id "${v.id}"`);
        vset.add(v.id);
      });
      if (did) {
        if (dialIds.has(did)) err('dial-duplicate', at, join(dp, 'id'), `duplicate dial id "${did}"`);
        dialIds.set(did, vset);
      }
    });
    (options || []).forEach((o, i) => {
      const op = `${p}.options[${i}]`;
      if (!isObj(o)) { err('dial-shape', at, op, 'option must be an object'); return; }
      unknownKeys(at, o, ['id', 'name', 'summary'], op);
      const oid = needStr(at, o, 'id', op, { rule: 'dial-option' });
      needStr(at, o, 'name', op, { rule: 'dial-option' });
      needStr(at, o, 'summary', op, { rule: 'dial-option' });
      if (oid) {
        if (optIds.has(oid)) err('dial-duplicate', at, join(op, 'id'), `duplicate option id "${oid}"`);
        optIds.add(oid);
      }
    });
    if (!isObj(b.scores)) { err('dial-matrix', at, join(p, 'scores'), 'scores must be an object keyed by option id'); return; }
    let complete = !!dials && !!options && dials.length > 0 && options.length > 0
      && dials.length === dialIds.size && options.length === optIds.size
      && dials.every((d) => isObj(d) && dialIds.has(d.id) && d.values.length === dialIds.get(d.id).size);
    for (const oid of optIds) {
      const row = b.scores[oid];
      if (!isObj(row)) { err('dial-matrix', at, `${p}.scores.${oid}`, 'missing scores for option'); complete = false; continue; }
      for (const [did, vset] of dialIds) {
        const cell = row[did];
        if (!isObj(cell)) { err('dial-matrix', at, `${p}.scores.${oid}.${did}`, 'missing scores for dial'); complete = false; continue; }
        for (const vid of vset) {
          const e = cell[vid];
          const ep = `${p}.scores.${oid}.${did}.${vid}`;
          if (!isObj(e)) { err('dial-matrix', at, ep, 'missing score cell'); complete = false; continue; }
          if (!isInt(e.s) || e.s < -2 || e.s > 2) { err('dial-score', at, join(ep, 's'), `s must be an integer from -2 to 2, got ${JSON.stringify(e.s)}`); complete = false; }
          if (!isStr(e.why)) { err('dial-why', at, join(ep, 'why'), 'why must be a non-empty string'); complete = false; }
        }
        for (const vid of Object.keys(cell)) if (!vset.has(vid)) err('dial-matrix', at, `${p}.scores.${oid}.${did}.${vid}`, `score for unknown value "${vid}"`);
      }
      for (const did of Object.keys(row)) if (!dialIds.has(did)) err('dial-matrix', at, `${p}.scores.${oid}.${did}`, `score for unknown dial "${did}"`);
    }
    for (const oid of Object.keys(b.scores)) if (!optIds.has(oid)) err('dial-matrix', at, `${p}.scores.${oid}`, `scores for unknown option "${oid}"`);
    if (complete && dials.length <= 4 && options.length <= 6) {
      if (boardLeaders(b).size < 2) warn('dial-no-flip', at, p, 'one option leads under every dial combination, so flipping a dial never changes the winner');
      for (const d of dials) {
        const same = b.options.every((o) => d.values.every((v) => b.scores[o.id][d.id][v.id].s === b.scores[o.id][d.id][d.values[0].id].s));
        if (same) warn('dial-inert', at, `${p}.dials`, `dial "${d.id}" scores every value the same for every option, so it changes nothing`);
      }
    }
  }

  /* ---------- quiz ---------- */
  function validateQuiz(at, q, p, ctx) {
    if (!isObj(q)) { err('quiz-type', at, p, 'quiz item must be an object'); return; }
    const type = q.type;
    if (!QUIZ_TYPES.includes(type)) { err('quiz-type', at, join(p, 'type'), `type must be one of ${QUIZ_TYPES.join(', ')}`); return; }
    unknownKeys(at, q, [...QUIZ_KEYS.common, ...QUIZ_KEYS[type]], p);
    const id = needStr(at, q, 'id', p, { rule: 'quiz-id' });
    if (id) {
      if (!new RegExp(`^${at.level}-q\\d+$`).test(id)) err('id-format', at, join(p, 'id'), `quiz id "${id}" must look like ${at.level}-q<number>`);
      claim(reg.quiz, id, at, 'id-duplicate', join(p, 'id'), 'quiz item');
    }
    if (!QUIZ_TAGS.includes(q.tag)) err('quiz-tag', at, join(p, 'tag'), `tag must be one of ${QUIZ_TAGS.join(', ')}`);
    needStr(at, q, 'q', p, { rule: 'quiz' });
    const explain = needStr(at, q, 'explain', p, { rule: 'quiz-explain' });
    if (explain && explain.length < 40) warn('quiz-explain-short', at, join(p, 'explain'), 'explanation is very short, say why the right answer is right and why each distractor is wrong');
    if (q.difficulty !== undefined && (!isInt(q.difficulty) || q.difficulty < 1 || q.difficulty > 3)) err('quiz-difficulty', at, join(p, 'difficulty'), 'difficulty must be 1, 2 or 3');
    if (q.ref !== undefined && (!isStr(q.ref) || !ctx.refIds.has(q.ref))) err('ref-unknown', at, join(p, 'ref'), `ref "${q.ref}" is not a reference of this world`);
    if (q.code !== undefined) {
      if (!isObj(q.code) || !isStr(q.code.lang) || typeof q.code.code !== 'string' || !q.code.code.trim()) err('quiz-code', at, join(p, 'code'), 'code must be {lang, code} with both set');
    }
    ctx.quizTypes.add(type);
    ctx.quizTags.add(q.tag);

    if (type === 'single' || type === 'multi') {
      const opts = needArr(at, q, 'options', p, { min: 3, max: type === 'single' ? 5 : 6, itemType: 'string', rule: 'quiz-options' });
      if (opts) {
        const seen = new Set();
        opts.forEach((o, i) => { if (typeof o === 'string') { if (seen.has(o.trim())) err('quiz-options-duplicate', at, `${p}.options[${i}]`, 'duplicate option text'); seen.add(o.trim()); } });
      }
      if (type === 'single') {
        if (!isInt(q.answer)) err('quiz-answer', at, join(p, 'answer'), 'answer must be an integer index');
        else if (opts && (q.answer < 0 || q.answer >= opts.length)) err('quiz-answer', at, join(p, 'answer'), `answer ${q.answer} is outside 0 to ${opts.length - 1}`);
        else if (opts) {
          ctx.singleAnswers.push(q.answer);
          const lens = opts.map((o) => (typeof o === 'string' ? o.length : 0));
          const max = Math.max(...lens);
          ctx.singles++;
          if (lens[q.answer] === max && lens.filter((n) => n === max).length === 1) ctx.longestCorrect++;
        }
      } else {
        const ans = q.answers;
        if (!Array.isArray(ans) || ans.length < 2) err('quiz-answer', at, join(p, 'answers'), 'multi needs an answers array with at least two indexes');
        else {
          if (new Set(ans).size !== ans.length) err('quiz-answer', at, join(p, 'answers'), 'answers contains duplicates');
          ans.forEach((a, i) => { if (!isInt(a) || (opts && (a < 0 || a >= opts.length))) err('quiz-answer', at, `${p}.answers[${i}]`, `index ${JSON.stringify(a)} is outside the options`); });
          if (opts && ans.length >= opts.length) warn('quiz-answer', at, join(p, 'answers'), 'every option is correct, add a distractor');
        }
      }
    } else if (type === 'order') {
      const items = needArr(at, q, 'items', p, { min: 3, itemType: 'string', rule: 'quiz-order' });
      if (items) {
        if (items.length > 7) warn('quiz-order-count', at, join(p, 'items'), 'more than 7 items is hard to order on a phone');
        if (new Set(items.map((s) => String(s).trim())).size !== items.length) err('quiz-order-duplicate', at, join(p, 'items'), 'items must be unique');
      }
    } else if (type === 'match') {
      const pairs = needArr(at, q, 'pairs', p, { min: 3, max: 6, rule: 'quiz-match' });
      const ls = new Set();
      const rs = new Set();
      (pairs || []).forEach((pr, i) => {
        const pp = `${p}.pairs[${i}]`;
        if (!isObj(pr) || !isStr(pr.l) || !isStr(pr.r)) { err('quiz-match-pair', at, pp, 'pair needs string l and r'); return; }
        if (ls.has(pr.l.trim()) || rs.has(pr.r.trim())) err('quiz-match-duplicate', at, pp, 'left and right values must be unique across pairs');
        ls.add(pr.l.trim()); rs.add(pr.r.trim());
      });
    } else if (type === 'numeric') {
      if (!isNum(q.answer)) err('quiz-numeric', at, join(p, 'answer'), 'answer must be a finite number');
      if (!isNum(q.tolerancePct) || q.tolerancePct < 0 || q.tolerancePct > 100) err('quiz-numeric', at, join(p, 'tolerancePct'), 'tolerancePct must be a number from 0 to 100');
      if (q.answer === 0 && isNum(q.tolerancePct) && q.tolerancePct > 0) warn('quiz-numeric', at, join(p, 'tolerancePct'), 'a percentage tolerance around 0 accepts only 0');
      needStr(at, q, 'unit', p, { optional: true, rule: 'quiz' });
      needStr(at, q, 'hint', p, { optional: true, rule: 'quiz' });
    }
  }

  /* ---------- defend ---------- */
  function validateDefend(at, d, ctx) {
    const p = 'defend';
    if (!isObj(d)) { err('defend-type', at, p, 'defend must be an object or null'); return; }
    unknownKeys(at, d, DEFEND_KEYS, p);
    needStr(at, d, 'prompt', p, { rule: 'defend' });
    needStr(at, d, 'timebox', p, { rule: 'defend' });
    needArr(at, d, 'clarify', p, { itemType: 'string', rule: 'defend-clarify' });
    const opts = needArr(at, d, 'options', p, { min: 2, soft: true, rule: 'defend-options' });
    (opts || []).forEach((o, i) => {
      const op = `${p}.options[${i}]`;
      if (!isObj(o)) { err('defend-option', at, op, 'option must be an object'); return; }
      unknownKeys(at, o, ['name', 'when', 'tradeoff'], op);
      for (const k of ['name', 'when', 'tradeoff']) needStr(at, o, k, op, { rule: 'defend-option' });
    });
    const model = needArr(at, d, 'modelAnswer', p, { rule: 'defend-model' });
    (model || []).forEach((b, i) => validateBlock(at, b, `${p}.modelAnswer[${i}]`, ctx, 0, MODEL_ANSWER_BLOCKS));
    const rubric = needArr(at, d, 'rubric', p, { min: 5, max: 9, soft: true, rule: 'defend-rubric' });
    (rubric || []).forEach((r, i) => {
      const rp = `${p}.rubric[${i}]`;
      if (!isObj(r)) { err('defend-rubric-item', at, rp, 'rubric item must be an object'); return; }
      unknownKeys(at, r, ['pt', 'w'], rp);
      needStr(at, r, 'pt', rp, { rule: 'defend-rubric' });
      if (!isInt(r.w) || r.w < 1 || r.w > 3) err('defend-rubric-weight', at, join(rp, 'w'), 'w must be an integer from 1 to 3');
    });
    const fu = needArr(at, d, 'followUps', p, { min: 2, max: 4, soft: true, rule: 'defend-followups' });
    (fu || []).forEach((f, i) => {
      const fp = `${p}.followUps[${i}]`;
      if (!isObj(f)) { err('defend-followup', at, fp, 'follow-up must be an object'); return; }
      unknownKeys(at, f, ['q', 'a'], fp);
      needStr(at, f, 'q', fp, { rule: 'defend-followup' });
      needStr(at, f, 'a', fp, { rule: 'defend-followup' });
    });
    needArr(at, d, 'redFlags', p, { min: 2, max: 5, soft: true, itemType: 'string', rule: 'defend-redflags' });
  }

  /* ---------- level ---------- */
  function validateLevel(at, lv, world, fileName, fixture) {
    unknownKeys(at, lv, LEVEL_KEYS, '');
    const m = new RegExp(`^${world.id}-l(\\d+)$`).exec(lv.id || '');
    if (!m) err('id-format', at, 'id', `level id "${lv.id}" must look like ${world.id}-l<number>`);
    if (isStr(lv.id)) claim(reg.levels, lv.id, at, 'id-duplicate', 'id', 'level');
    if (!isInt(lv.order) || lv.order < 1) err('level-order', at, 'order', 'order must be an integer of 1 or more');
    else if (m && Number(m[1]) !== lv.order) warn('level-order', at, 'order', `order ${lv.order} differs from the number in the id (${m[1]})`);
    const fm = /^l(\d+)-/.exec(fileName);
    if (!fm) warn('file-name', at, '', 'level file name should look like lNN-slug.json');
    else if (isInt(lv.order) && Number(fm[1]) !== lv.order) warn('file-name', at, '', `file number ${fm[1]} differs from order ${lv.order}`);
    needStr(at, lv, 'title', '', { rule: 'level' });
    if (!LEVEL_KINDS.includes(lv.kind)) err('level-kind', at, 'kind', `kind must be one of ${LEVEL_KINDS.join(', ')}`);
    if (!isInt(lv.minutes) || lv.minutes < 1) err('level-minutes', at, 'minutes', 'minutes must be a positive integer');
    const brief = needStr(at, lv, 'brief', '', { rule: 'level' });
    if (brief && brief.length > 700) warn('level-brief', at, 'brief', 'brief is long, keep it to 1 to 3 sentences');

    const ctx = {
      refIds: new Set((world.references || []).filter(isObj).map((r) => r.id)), headingIds: new Set(), hasHeading: false,
      diagrams: 0, dialBoards: 0, labs: new Set(), quizTypes: new Set(), quizTags: new Set(),
      singleAnswers: [], singles: 0, longestCorrect: 0
    };

    const blocks = needArr(at, lv, 'blocks', '', { rule: 'level-blocks' });
    const visual = [];
    (blocks || []).forEach((b, i) => { validateBlock(at, b, `blocks[${i}]`, ctx); if (isObj(b)) visual.push(b.t); });
    let hasVisual = false;
    walkBlocks(blocks, (b) => { if (VISUAL_BLOCKS.includes(b.t)) hasVisual = true; });
    if (blocks && !ctx.hasHeading) err('level-heading', at, 'blocks', 'a level needs at least one "h" block so the contents rail has entries');
    if (blocks && !fixture) {
      if (['problem', 'concept'].includes(lv.kind) && (blocks.length < 3 || blocks.length > 8)) warn('level-structure', at, 'blocks', `a typical level has 3 to 8 blocks, found ${blocks.length}`);
      if (lv.kind === 'problem' && !hasVisual) warn('level-structure', at, 'blocks', 'a problem level needs at least one visual (diagram, flow, table, compare, dials or stats)');
    }

    const quiz = Array.isArray(lv.quiz) ? lv.quiz : (err('level-quiz-type', at, 'quiz', 'quiz must be an array (use [] for none)'), []);
    quiz.forEach((q, i) => validateQuiz(at, q, `quiz[${i}]`, ctx));
    quiz.forEach((q, i) => { const mm = /-q(\d+)$/.exec(isObj(q) && q.id || ''); if (mm && Number(mm[1]) !== i + 1) warn('quiz-id-order', at, `quiz[${i}].id`, `id number ${mm[1]} does not match position ${i + 1}`); });
    if (!fixture) {
      if (lv.kind === 'boss' && quiz.length < 3) warn('level-quiz-count', at, 'quiz', `a boss level needs 3 or more quiz items, found ${quiz.length}`);
      else if (['problem', 'concept'].includes(lv.kind) && (quiz.length < 2 || quiz.length > 4)) warn('level-quiz-count', at, 'quiz', `a typical level has 2 to 4 quiz items, found ${quiz.length}`);
    }

    if (lv.defend === undefined) err('defend-missing', at, 'defend', 'defend is required (use null when there is none)');
    else if (lv.defend !== null) validateDefend(at, lv.defend, ctx);
    if (lv.kind === 'boss' && !lv.defend) err('defend-missing', at, 'defend', 'a boss level needs a defend question');

    const refs = needArr(at, lv, 'refs', '', { min: 1, soft: true, itemType: 'string', rule: 'level-refs' });
    (refs || []).forEach((r, i) => { if (isStr(r) && !ctx.refIds.has(r)) err('ref-unknown', at, `refs[${i}]`, `reference "${r}" is not defined in ${world.id}`); });
    needArr(at, lv, 'takeaways', '', { min: 3, max: 5, soft: true, itemType: 'string', rule: 'level-takeaways' });

    walkText(at, lv, '', ctx.refIds);
    return { ctx, quiz, refs: refs || [] };
  }

  /* ---------- references (world r* and topic tr*) ---------- */
  function validateReference(at, r, rp, { refIds, urls, idRe, idHint }) {
    if (!isObj(r)) { err('ref-shape', at, rp, 'reference must be an object'); return; }
    unknownKeys(at, r, ['id', 'title', 'url', 'type', 'publisher', 'note', 'verified', 'status'], rp);
    if (!isStr(r.id) || !idRe.test(r.id)) err('ref-id', at, join(rp, 'id'), `reference id must look like ${idHint}`);
    else if (refIds.has(r.id)) err('ref-id', at, join(rp, 'id'), `duplicate reference id "${r.id}"`);
    else refIds.add(r.id);
    for (const k of ['title', 'publisher', 'note']) needStr(at, r, k, rp, { rule: 'ref' });
    if (!REF_TYPES.includes(r.type)) err('ref-type', at, join(rp, 'type'), `type must be one of ${REF_TYPES.join(', ')}`);
    if (!REF_STATUS.includes(r.status)) err('ref-status', at, join(rp, 'status'), `status must be one of ${REF_STATUS.join(', ')}`);
    if (!isIsoDate(r.verified)) err('ref-verified', at, join(rp, 'verified'), 'verified must be a real ISO date (YYYY-MM-DD)');
    else if (r.verified > today) warn('ref-verified', at, join(rp, 'verified'), `verified date ${r.verified} is in the future`);
    if (!isStr(r.url)) err('ref-url', at, join(rp, 'url'), 'url is required');
    else {
      let u = null;
      try { u = new URL(r.url); } catch { /* handled below */ }
      if (!u || !/^https?:$/.test(u.protocol) || /\s/.test(r.url)) err('ref-url', at, join(rp, 'url'), `"${r.url}" is not a valid http(s) URL`);
      else {
        if (u.protocol === 'http:') warn('ref-url-http', at, join(rp, 'url'), 'use https when the site supports it');
        if (/(^|\.)(example\.(com|org|net)|localhost)$/.test(u.hostname)) warn('ref-url', at, join(rp, 'url'), `placeholder host ${u.hostname}`);
        if (urls.has(r.url)) warn('ref-url-duplicate', at, join(rp, 'url'), `same URL as ${urls.get(r.url)}`);
        else urls.set(r.url, r.id);
      }
    }
  }

  /* ---------- topics and scenarios ---------- */
  const proseWords = (blocks) => {
    let n = 0;
    const count = (s) => { if (typeof s === 'string') n += (s.match(/\S+/g) || []).length; };
    walkBlocks(blocks, (b) => {
      if (b.t === 'p') count(b.md);
      else if (b.t === 'h') count(b.text);
      else if (b.t === 'callout') count(b.md);
      else if (b.t === 'list' && Array.isArray(b.items)) b.items.forEach(count);
      else if (b.t === 'flow' && Array.isArray(b.steps)) b.steps.forEach((s) => isObj(s) && count(s.md));
    }, 'explain');
    return n;
  };

  function validateScenario(at, s, p, ctx) {
    if (!isObj(s)) { err('scenario-type', at, p, 'scenario must be an object'); return; }
    unknownKeys(at, s, ['id', 'title', 'situation', 'constraints', 'unknowns', 'question', 'options', 'flips', 'takeaway'], p);
    const id = needStr(at, s, 'id', p, { rule: 'scenario-id' });
    if (id) {
      if (!new RegExp(`^${at.level}-s\\d+$`).test(id)) err('id-format', at, join(p, 'id'), `scenario id "${id}" must look like ${at.level}-s<number>`);
      claim(reg.scenarios, id, at, 'id-duplicate', join(p, 'id'), 'scenario');
    }
    for (const k of ['title', 'situation', 'question', 'takeaway']) needStr(at, s, k, p, { rule: 'scenario' });
    needArr(at, s, 'constraints', p, { min: 1, max: 6, soft: true, itemType: 'string', rule: 'scenario-constraints' });
    needArr(at, s, 'unknowns', p, { min: 1, max: 6, soft: true, itemType: 'string', rule: 'scenario-unknowns' });
    const opts = needArr(at, s, 'options', p, { min: 3, max: 4, rule: 'scenario-options' });
    if (opts) {
      const names = new Set();
      let best = 0;
      let poor = 0;
      let bestIdx = -1;
      opts.forEach((o, i) => {
        const op = `${p}.options[${i}]`;
        if (!isObj(o)) { err('scenario-option', at, op, 'option must be an object'); return; }
        unknownKeys(at, o, ['name', 'verdict', 'why', 'tradeoff'], op);
        const name = needStr(at, o, 'name', op, { rule: 'scenario-option' });
        needStr(at, o, 'why', op, { rule: 'scenario-option' });
        needStr(at, o, 'tradeoff', op, { rule: 'scenario-option' });
        if (name) { if (names.has(name.trim().toLowerCase())) err('scenario-option', at, join(op, 'name'), `duplicate option name "${name}"`); names.add(name.trim().toLowerCase()); }
        if (!SCENARIO_VERDICTS.includes(o.verdict)) err('scenario-verdict', at, join(op, 'verdict'), `verdict must be one of ${SCENARIO_VERDICTS.join(', ')}`);
        else if (o.verdict === 'best') { best++; bestIdx = i; } else if (o.verdict === 'poor') poor++;
      });
      if (best !== 1) err('scenario-best', at, `${p}.options`, `exactly one option must be "best", found ${best}`);
      if (poor < 1) err('scenario-poor', at, `${p}.options`, 'at least one option must be "poor"');
      if (best === 1 && opts.length >= 3) { ctx.bestSlots.push(bestIdx); }
    }
    const flips = needArr(at, s, 'flips', p, { min: 2, max: 3, rule: 'scenario-flips' });
    (flips || []).forEach((f, i) => {
      const fp = `${p}.flips[${i}]`;
      if (!isObj(f)) { err('scenario-flip', at, fp, 'flip must be an object {if, then}'); return; }
      unknownKeys(at, f, ['if', 'then'], fp);
      needStr(at, f, 'if', fp, { rule: 'scenario-flip' });
      needStr(at, f, 'then', fp, { rule: 'scenario-flip' });
    });
  }

  function validateTopic(at, t, world, fileName, fixture = false) {
    const firstIssue = issues.length;
    unknownKeys(at, t, TOPIC_KEYS, '');
    const m = new RegExp(`^${world.id}-t(\\d+)$`).exec(t.id || '');
    if (!m) err('id-format', at, 'id', `topic id "${t.id}" must look like ${world.id}-t<number>`);
    if (isStr(t.id)) claim(reg.topics, t.id, at, 'id-duplicate', 'id', 'topic');
    if (!isInt(t.order) || t.order < 1) err('topic-order', at, 'order', 'order must be an integer of 1 or more');
    else if (m && Number(m[1]) !== t.order) warn('topic-order', at, 'order', `order ${t.order} differs from the number in the id (${m[1]})`);
    const fm = /^t(\d+)-/.exec(fileName);
    if (!fm) warn('file-name', at, '', 'topic file name should look like tNN-slug.json');
    else if (m && Number(fm[1]) !== Number(m[1])) warn('file-name', at, '', `file number ${fm[1]} differs from the id number ${m[1]}`);
    for (const k of ['title', 'group', 'summary', 'useIf', 'avoidIf']) needStr(at, t, k, '', { rule: 'topic' });
    if (!isInt(t.minutes) || t.minutes < 1) err('topic-minutes', at, 'minutes', 'minutes must be a positive integer');
    if (!TOPIC_DIFFICULTY.includes(t.difficulty)) err('topic-difficulty', at, 'difficulty', `difficulty must be one of ${TOPIC_DIFFICULTY.join(', ')}`);

    const ctx = {
      refIds: new Set((world.references || []).filter(isObj).map((r) => r.id)), headingIds: new Set(), hasHeading: false,
      diagrams: 0, dialBoards: 0, labs: new Set(), quizTypes: new Set(), quizTags: new Set(),
      singleAnswers: [], singles: 0, longestCorrect: 0, bestSlots: []
    };

    const explain = needArr(at, t, 'explain', '', { rule: 'topic-explain' });
    let hasVisual = false;
    (explain || []).forEach((b, i) => validateBlock(at, b, `explain[${i}]`, ctx, 0, TOPIC_EXPLAIN_BLOCKS));
    walkBlocks(explain, (b, bp) => {
      if (VISUAL_BLOCKS.includes(b.t)) hasVisual = true;
      if (b.t === 'h' && b.level === 2) err('topic-heading-level', at, `${bp}.level`, 'headings inside a topic must be level 3, the page owns level 2');
    }, 'explain');
    if (explain && !hasVisual) warn('topic-no-visual', at, 'explain', 'explain has no visual block (diagram, flow, table, compare, dials or stats)');
    if (explain) {
      const words = proseWords(explain);
      if (words < EXPLAIN_MIN) warn('topic-explain-words', at, 'explain', `explain has ${words} words of teaching text, the target is ${EXPLAIN_MIN} to 400`);
      else if (words > EXPLAIN_MAX) warn('topic-explain-words', at, 'explain', `explain has ${words} words of teaching text, the target is ${EXPLAIN_MIN} to 400 (hard ceiling ${EXPLAIN_MAX})`);
    }

    needArr(at, t, 'whereToUse', '', { min: 3, max: 6, itemType: 'string', rule: 'topic-where' });
    if (!isObj(t.whenToUse)) err('topic-when', at, 'whenToUse', 'whenToUse must be an object with use, avoid and flips arrays');
    else {
      unknownKeys(at, t.whenToUse, ['use', 'avoid', 'flips'], 'whenToUse');
      needArr(at, t.whenToUse, 'use', 'whenToUse', { min: 3, max: 5, itemType: 'string', rule: 'topic-when-use' });
      needArr(at, t.whenToUse, 'avoid', 'whenToUse', { min: 3, max: 5, itemType: 'string', rule: 'topic-when-avoid' });
      needArr(at, t.whenToUse, 'flips', 'whenToUse', { min: 2, max: 4, itemType: 'string', rule: 'topic-when-flips' });
    }

    if (!isObj(t.alternatives)) err('topic-alt', at, 'alternatives', 'alternatives must be an object {title, head, rows}');
    else {
      const a = t.alternatives;
      unknownKeys(at, a, ['title', 'head', 'rows'], 'alternatives');
      needStr(at, a, 'title', 'alternatives', { rule: 'topic-alt' });
      const head = needArr(at, a, 'head', 'alternatives', { min: 3, itemType: 'string', rule: 'topic-alt-head' });
      const rows = needArr(at, a, 'rows', 'alternatives', { min: 3, max: 6, rule: 'topic-alt-rows' });
      if (head && !head.some((h) => /\b(lose|loses|losing|loss|fails|breaks|avoid|weak|downside|worse)\b/i.test(String(h)))) warn('topic-alt-loses', at, 'alternatives.head', 'add a column that says when each option loses');
      (rows || []).forEach((r, i) => {
        const rp = `alternatives.rows[${i}]`;
        if (!Array.isArray(r)) { err('topic-alt-row', at, rp, 'row must be an array of strings'); return; }
        if (head && r.length !== head.length) err('topic-alt-row', at, rp, `row has ${r.length} cells, header has ${head.length}`);
        r.forEach((c, j) => { if (!isStr(c)) err('topic-alt-row', at, `${rp}[${j}]`, 'cell must be a non-empty string'); });
      });
    }

    const pit = needArr(at, t, 'pitfalls', '', { min: 2, max: 4, rule: 'topic-pitfalls' });
    (pit || []).forEach((x, i) => {
      const xp = `pitfalls[${i}]`;
      if (!isObj(x)) { err('topic-pitfall', at, xp, 'pitfall must be an object {symptom, cause, fix}'); return; }
      unknownKeys(at, x, ['symptom', 'cause', 'fix'], xp);
      for (const k of ['symptom', 'cause', 'fix']) needStr(at, x, k, xp, { rule: 'topic-pitfall' });
    });

    const scenarios = needArr(at, t, 'scenarios', '', { min: 2, max: 4, rule: 'topic-scenarios' });
    (scenarios || []).forEach((s, i) => validateScenario(at, s, `scenarios[${i}]`, ctx));
    (scenarios || []).forEach((s, i) => { const mm = /-s(\d+)$/.exec(isObj(s) && s.id || ''); if (mm && Number(mm[1]) !== i + 1) warn('scenario-id-order', at, `scenarios[${i}].id`, `id number ${mm[1]} does not match position ${i + 1}`); });

    const quiz = needArr(at, t, 'quiz', '', { min: 2, max: 3, rule: 'topic-quiz' }) || [];
    quiz.forEach((q, i) => validateQuiz(at, q, `quiz[${i}]`, ctx));
    quiz.forEach((q, i) => { const mm = /-q(\d+)$/.exec(isObj(q) && q.id || ''); if (mm && Number(mm[1]) !== i + 1) warn('quiz-id-order', at, `quiz[${i}].id`, `id number ${mm[1]} does not match position ${i + 1}`); });

    const cards = needArr(at, t, 'flashcards', '', { min: 2, max: 4, rule: 'topic-cards' });
    (cards || []).forEach((c, i) => {
      const cp = `flashcards[${i}]`;
      if (!isObj(c)) { err('card-shape', at, cp, 'flashcard must be an object {front, back}'); return; }
      unknownKeys(at, c, ['front', 'back', 'tags'], cp);
      needStr(at, c, 'front', cp, { rule: 'card' });
      needStr(at, c, 'back', cp, { rule: 'card' });
    });

    const related = needArr(at, t, 'related', '', { min: 1, soft: true, itemType: 'string', rule: 'topic-related' });
    (related || []).forEach((x, i) => {
      if (!isStr(x)) return;
      if (!/^w\d\d-[tl]\d+$/.test(x)) err('related-id', at, `related[${i}]`, `"${x}" must be a topic or level id such as w07-t08 or w07-l3`);
      else if (x === t.id) warn('related-id', at, `related[${i}]`, 'a topic should not list itself as related');
      else relatedChecks.push({ at, path: `related[${i}]`, id: x });
    });

    const refs = needArr(at, t, 'refs', '', { min: 1, soft: true, itemType: 'string', rule: 'topic-refs' });
    (refs || []).forEach((r, i) => { if (isStr(r) && !ctx.refIds.has(r)) err('ref-unknown', at, `refs[${i}]`, `reference "${r}" is not defined in ${world.id} (_world.json or _topics.json)`); });

    walkText(at, t, '', ctx.refIds);
    // the fixture predates the topic count rules, so its count violations are warnings
    if (fixture) for (const i of issues.slice(firstIssue)) if (i.sev === 'error' && i.rule.endsWith('-count')) i.sev = 'warn';
    return { ctx, quiz, cards: cards || [], scenarios: scenarios || [], refs: refs || [] };
  }

  /* ---------- world ---------- */
  function validateWorld(at, w, dirName, fixture) {
    unknownKeys(at, w, WORLD_KEYS, '');
    if (!/^w\d\d$/.test(w.id || '')) err('id-format', at, 'id', `world id "${w.id}" must look like w04`);
    else if (!dirName.startsWith(`${w.id}-`)) err('world-dir', at, 'id', `world id "${w.id}" does not match its folder name "${dirName}"`);
    claim(reg.worldIds, w.id, at, 'id-duplicate', 'id', 'world');
    if (!isInt(w.order)) err('world-order', at, 'order', 'order must be an integer');
    else if (reg.worldOrders.has(w.order)) err('world-order', at, 'order', `duplicate world order ${w.order} (also in ${reg.worldOrders.get(w.order)})`);
    else reg.worldOrders.set(w.order, at.file);
    if (!REGIONS.includes(w.region)) err('world-region', at, 'region', `region must be one of ${REGIONS.join(', ')}`);
    for (const k of ['title', 'short', 'tagline', 'story', 'oneLiner']) needStr(at, w, k, '', { rule: 'world' });
    if (isStr(w.story)) {
      const n = (w.story.match(/[.!?](\s|$)/g) || []).length;
      if (!fixture && (n < 2 || n > 5)) warn('world-story', at, 'story', `story should be 2 to 4 sentences, found ${n}`);
    }
    needArr(at, w, 'youWillLearn', '', { min: 4, max: 8, soft: true, itemType: 'string', rule: 'world-learn' });
    if (!isInt(w.minutes) || w.minutes < 1) err('world-minutes', at, 'minutes', 'minutes must be a positive integer');
    if (!Array.isArray(w.prereqs)) err('world-prereqs', at, 'prereqs', 'prereqs must be an array (use [] for none)');
    else w.prereqs.forEach((x, i) => { if (!/^w\d\d$/.test(x) || x === w.id) err('world-prereqs', at, `prereqs[${i}]`, `"${x}" must be another world id`); });

    const refIds = new Set();
    const refs = needArr(at, w, 'references', '', { rule: 'world-refs' });
    const urls = new Map();
    (refs || []).forEach((r, i) => validateReference(at, r, `references[${i}]`, { refIds, urls, idRe: /^r\d+$/, idHint: 'r1' }));

    const cards = needArr(at, w, 'flashcards', '', { rule: 'world-cards' });
    (cards || []).forEach((c, i) => {
      const cp = `flashcards[${i}]`;
      if (!isObj(c)) { err('card-shape', at, cp, 'flashcard must be an object'); return; }
      unknownKeys(at, c, ['id', 'front', 'back', 'tags'], cp);
      if (!isStr(c.id) || !new RegExp(`^${w.id}-fc-\\d+$`).test(c.id)) err('id-format', at, join(cp, 'id'), `flashcard id "${c.id}" must look like ${w.id}-fc-001`);
      else claim(reg.cards, c.id, at, 'id-duplicate', join(cp, 'id'), 'flashcard');
      needStr(at, c, 'front', cp, { rule: 'card' });
      needStr(at, c, 'back', cp, { rule: 'card' });
      if (!Array.isArray(c.tags) || !c.tags.every(isStr)) warn('card-tags', at, join(cp, 'tags'), 'tags should be an array of strings');
    });

    const terms = new Set();
    const glossary = needArr(at, w, 'glossary', '', { rule: 'world-glossary' });
    (glossary || []).forEach((g, i) => {
      const gp = `glossary[${i}]`;
      if (!isObj(g) || !isStr(g.term) || !isStr(g.def)) { err('glossary-shape', at, gp, 'glossary entry needs string term and def'); return; }
      unknownKeys(at, g, ['term', 'def'], gp);
      if (terms.has(g.term.toLowerCase())) warn('glossary-duplicate', at, join(gp, 'term'), `duplicate term "${g.term}"`);
      terms.add(g.term.toLowerCase());
    });

    return { refIds, refs: refs || [], cards: cards || [], glossary: glossary || [], urls };
  }

  /* ---------- load files ---------- */
  const metaFile = path.join(srcDir, '_meta.json');
  const metaAt = { file: rel(metaFile), level: '', world: '' };
  const readJsonSafe = (file, at) => {
    filesChecked++;
    try {
      const text = fs.readFileSync(file, 'utf8');
      return parseJsonText(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text, file);
    } catch (e) {
      if (e instanceof ToolError) { err('json-parse', at, '', e.message.replace(/^[^:]+: /, '')); return undefined; }
      err('file-read', at, '', e.message);
      return undefined;
    }
  };

  if (!fs.existsSync(metaFile)) err('meta-file-missing', metaAt, '', '_meta.json is missing');
  else {
    const meta = readJsonSafe(metaFile, metaAt);
    if (isObj(meta)) {
      for (const k of ['title', 'subtitle', 'version']) needStr(metaAt, meta, k, '', { rule: 'meta' });
      if (isStr(meta.version) && !/^\d+\.\d+\.\d+/.test(meta.version)) err('meta-version', metaAt, 'version', 'version must look like 1.0.0');
      const regs = needArr(metaAt, meta, 'regions', '', { rule: 'meta-regions' });
      const seen = new Set();
      (regs || []).forEach((r, i) => {
        const rp = `regions[${i}]`;
        if (!isObj(r) || !isStr(r.id) || !isStr(r.label) || !isStr(r.blurb)) { err('meta-regions', metaAt, rp, 'region needs string id, label and blurb'); return; }
        if (!REGIONS.includes(r.id)) err('meta-regions', metaAt, join(rp, 'id'), `unknown region id "${r.id}"`);
        if (seen.has(r.id)) err('meta-regions', metaAt, join(rp, 'id'), `duplicate region id "${r.id}"`);
        seen.add(r.id);
      });
      for (const id of REGIONS) if (regs && !seen.has(id)) err('meta-regions', metaAt, 'regions', `region "${id}" is missing`);
    }
  }

  if (fs.existsSync(srcDir)) {
    for (const name of fs.readdirSync(srcDir)) {
      if (name.startsWith('.') || name.startsWith('_')) continue;
      const full = path.join(srcDir, name);
      if (fs.statSync(full).isDirectory() && !/^w\d\d-[a-z0-9-]+$/.test(name)) warn('dir-name', { file: rel(full) }, '', 'folder name should look like wNN-slug, so it is ignored by the build');
      else if (!fs.statSync(full).isDirectory()) warn('file-stray', { file: rel(full) }, '', 'unexpected file in content-src');
    }
  }

  const dirs = listWorldDirs(srcDir, { includeFixture });
  const loaded = [];
  for (const { dir, name, fixture } of dirs) {
    const worldFile = path.join(dir, '_world.json');
    const wid = (/^(w\d\d)-/.exec(name) || [])[1] || '';
    const wat = { file: rel(worldFile), level: '', world: wid };
    if (!fs.existsSync(worldFile)) { err('world-file-missing', wat, '', '_world.json is missing'); continue; }
    const world = readJsonSafe(worldFile, wat);
    if (world === undefined) continue;
    if (!isObj(world)) { err('json-type', wat, '', 'world file must contain an object'); continue; }
    const levels = [];
    for (const f of listLevelFiles(dir)) {
      const file = path.join(dir, f);
      const lat = { file: rel(file), level: '', world: wid };
      const lv = readJsonSafe(file, lat);
      if (lv === undefined) continue;
      if (!isObj(lv)) { err('json-type', lat, '', 'level file must contain an object'); continue; }
      levels.push({ file, f, lv });
    }
    const topics = [];
    for (const f of fs.readdirSync(dir).filter((n) => /^t\d+.*\.json$/.test(n)).sort()) {
      const file = path.join(dir, f);
      const tat = { file: rel(file), level: '', world: wid };
      const tp = readJsonSafe(file, tat);
      if (tp === undefined) continue;
      if (!isObj(tp)) { err('json-type', tat, '', 'topic file must contain an object'); continue; }
      topics.push({ file, f, t: tp });
    }
    const extraFile = path.join(dir, '_topics.json');
    const eat = { file: rel(extraFile), level: '', world: wid };
    let extra = null;
    if (fs.existsSync(extraFile)) {
      const ex = readJsonSafe(extraFile, eat);
      if (ex !== undefined) { if (isObj(ex)) extra = ex; else err('json-type', eat, '', '_topics.json must contain an object'); }
    }
    loaded.push({ dir, name, fixture, wid, worldFile, wat, world, levels, topics, extra, eat });
  }

  /* validate each world */
  for (const w of loaded) {
    const { world, wat, name, fixture } = w;
    const info = validateWorld(wat, world, name, fixture);
    const wid = isStr(world.id) ? world.id : w.wid;
    const levelIds = new Set();
    const levelRefs = new Map();
    const usedRefs = new Set();
    const tally = { quiz: 0, diagrams: 0, dialBoards: 0, defends: 0, singleAnswers: [], singles: 0, longestCorrect: 0, quizTypes: new Set(), quizTags: new Set(), minutes: 0, labs: new Set() };

    // the topic author's extras: references (tr ids), glossary terms and claims
    const extra = w.extra || {};
    const eat = w.eat;
    if (w.extra) unknownKeys(eat, extra, TOPICS_EXTRA_KEYS, '');
    else if (w.topics.length) warn('topics-extra-missing', wat, '', `${w.topics.length} topic file${w.topics.length === 1 ? '' : 's'} found but no _topics.json for extra references, glossary and claims`);
    const extraRefIds = new Set();
    const extraRefs = [];
    if (extra.references !== undefined) {
      const list = needArr(eat, extra, 'references', '', { min: 0, rule: 'topics-refs' }) || [];
      list.forEach((r, i) => { validateReference(eat, r, `references[${i}]`, { refIds: extraRefIds, urls: info.urls, idRe: /^tr\d+$/, idHint: 'tr1' }); if (isObj(r)) extraRefs.push(r); });
    }
    const allRefs = [...info.refs, ...extraRefs];
    const allRefIds = new Set([...info.refIds, ...extraRefIds]);
    const termSet = new Set(info.glossary.filter(isObj).map((g) => String(g.term).toLowerCase()));
    let extraTerms = 0;
    if (extra.glossary !== undefined) {
      (needArr(eat, extra, 'glossary', '', { min: 0, rule: 'topics-glossary' }) || []).forEach((g, i) => {
        const gp = `glossary[${i}]`;
        if (!isObj(g) || !isStr(g.term) || !isStr(g.def)) { err('glossary-shape', eat, gp, 'glossary entry needs string term and def'); return; }
        unknownKeys(eat, g, ['term', 'def'], gp);
        if (termSet.has(g.term.toLowerCase())) warn('glossary-duplicate', eat, join(gp, 'term'), `duplicate term "${g.term}"`);
        termSet.add(g.term.toLowerCase());
        extraTerms++;
      });
      walkText(eat, extra.glossary, 'glossary', allRefIds);
    }

    const ordered = [...w.levels].sort((a, b) => (a.lv.order || 0) - (b.lv.order || 0));
    const seenOrder = new Map();
    for (const { file, f, lv } of ordered) {
      const at = { file: rel(file), level: isStr(lv.id) ? lv.id : f, world: wid };
      const r = validateLevel(at, lv, { id: wid, references: allRefs }, f, fixture);
      if (isStr(lv.id)) levelIds.add(lv.id);
      if (isInt(lv.order)) {
        if (seenOrder.has(lv.order)) err('level-order', at, 'order', `duplicate level order ${lv.order} (also ${seenOrder.get(lv.order)})`);
        seenOrder.set(lv.order, at.level);
      }
      levelRefs.set(lv.id, new Set(r.refs));
      r.refs.forEach((x) => usedRefs.add(x));
      tally.quiz += r.quiz.length;
      tally.diagrams += r.ctx.diagrams;
      tally.dialBoards += r.ctx.dialBoards;
      if (lv.defend) tally.defends++;
      tally.singleAnswers.push(...r.ctx.singleAnswers);
      tally.singles += r.ctx.singles;
      tally.longestCorrect += r.ctx.longestCorrect;
      r.ctx.quizTypes.forEach((x) => tally.quizTypes.add(x));
      r.ctx.quizTags.forEach((x) => tally.quizTags.add(x));
      r.ctx.labs.forEach((x) => tally.labs.add(x));
      if (isInt(lv.minutes)) tally.minutes += lv.minutes;
      // citations in level text count as use
      const text = JSON.stringify(lv);
      for (const m of text.matchAll(/\[\[(t?r\d+)\]\]/g)) usedRefs.add(m[1]);
    }

    // topics
    const topicIds = new Set();
    const topicTally = { topics: 0, scenarios: 0, quiz: 0, cards: 0, singleAnswers: [], singles: 0, longestCorrect: 0, bestSlots: [], diagrams: 0 };
    const topicOrdered = [...w.topics].sort((a, b) => (a.t.order || 0) - (b.t.order || 0));
    const seenTopicOrder = new Map();
    for (const { file, f, t } of topicOrdered) {
      const at = { file: rel(file), level: isStr(t.id) ? t.id : f, world: wid };
      const r = validateTopic(at, t, { id: wid, references: allRefs }, f, fixture);
      if (isStr(t.id)) topicIds.add(t.id);
      if (isInt(t.order)) {
        if (seenTopicOrder.has(t.order)) err('topic-order', at, 'order', `duplicate topic order ${t.order} (also ${seenTopicOrder.get(t.order)})`);
        seenTopicOrder.set(t.order, at.level);
      }
      topicTally.topics++;
      topicTally.scenarios += r.scenarios.length;
      topicTally.quiz += r.quiz.length;
      topicTally.cards += r.cards.length;
      topicTally.singleAnswers.push(...r.ctx.singleAnswers);
      topicTally.singles += r.ctx.singles;
      topicTally.longestCorrect += r.ctx.longestCorrect;
      topicTally.bestSlots.push(...r.ctx.bestSlots);
      topicTally.diagrams += r.ctx.diagrams;
      r.refs.forEach((x) => usedRefs.add(x));
      for (const m of JSON.stringify(t).matchAll(/\[\[(t?r\d+)\]\]/g)) usedRefs.add(m[1]);
    }
    if (!fixture && topicTally.topics) {
      const slots = topicTally.bestSlots;
      if (slots.length >= 6) {
        const counts = {};
        slots.forEach((s) => { counts[s] = (counts[s] || 0) + 1; });
        const [slot, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
        if (n / slots.length > 0.4) warn('scenario-best-spread', wat, 'topics', `${Math.round((n / slots.length) * 100)}% of scenarios put the best option in position ${Number(slot) + 1}, keep every position at or under 40%`);
      }
    }

    // world-level prose, citations, claims
    const worldProse = { ...world };
    delete worldProse.claims;
    walkText(wat, worldProse, '', allRefIds);
    for (const m of JSON.stringify(worldProse).matchAll(/\[\[(t?r\d+)\]\]/g)) usedRefs.add(m[1]);

    const claims = Array.isArray(world.claims) ? world.claims : (err('claims-missing', wat, 'claims', 'claims ledger is required (array)'), []);
    const claimTargets = new Set([...levelIds, wid]);
    for (const c of info.cards) if (isObj(c) && isStr(c.id)) claimTargets.add(c.id);
    claims.forEach((c, i) => {
      const cp = `claims[${i}]`;
      if (!isObj(c)) { err('claim-shape', wat, cp, 'claim must be an object'); return; }
      unknownKeys(wat, c, ['text', 'ref', 'where', 'confidence'], cp);
      needStr(wat, c, 'text', cp, { rule: 'claim' });
      if (!isStr(c.ref) || !allRefIds.has(c.ref)) err('ref-unknown', wat, join(cp, 'ref'), `claim ref "${c.ref}" is not a reference of this world`);
      else usedRefs.add(c.ref);
      if (!isStr(c.where) || !(claimTargets.has(c.where) || [...levelIds].some((id) => c.where.startsWith(`${id}-q`) || c.where.startsWith(`${id}#`)))) err('claim-where', wat, join(cp, 'where'), `where "${c.where}" must be a level id of this world`);
      else if (levelRefs.has(c.where) && isStr(c.ref) && !levelRefs.get(c.where).has(c.ref)) warn('claim-ref-uncited', wat, join(cp, 'ref'), `${c.ref} supports a claim in ${c.where} but is not in that level's refs`);
      if (c.confidence !== undefined && !CONFIDENCE.includes(c.confidence)) warn('claim-confidence', wat, join(cp, 'confidence'), `confidence should be one of ${CONFIDENCE.join(', ')}`);
    });

    // the topic claims ledger points at topics (or their parts)
    let extraClaims = 0;
    if (extra.claims !== undefined) {
      (needArr(eat, extra, 'claims', '', { min: 0, rule: 'topics-claims' }) || []).forEach((c, i) => {
        const cp = `claims[${i}]`;
        extraClaims++;
        if (!isObj(c)) { err('claim-shape', eat, cp, 'claim must be an object'); return; }
        unknownKeys(eat, c, ['text', 'ref', 'where', 'confidence'], cp);
        needStr(eat, c, 'text', cp, { rule: 'claim' });
        if (!isStr(c.ref) || !allRefIds.has(c.ref)) err('ref-unknown', eat, join(cp, 'ref'), `claim ref "${c.ref}" is not a reference of this world`);
        else usedRefs.add(c.ref);
        const target = isStr(c.where) ? c.where.split(/[#]/)[0].replace(/-(?:q|s|fc)\d+$/, '') : '';
        if (!isStr(c.where) || !(topicIds.has(target) || levelIds.has(target) || target === wid)) err('claim-where', eat, join(cp, 'where'), `where "${c.where}" must be a topic or level id of this world`);
        if (c.confidence !== undefined && !CONFIDENCE.includes(c.confidence)) warn('claim-confidence', eat, join(cp, 'confidence'), `confidence should be one of ${CONFIDENCE.join(', ')}`);
      });
    }

    for (const r of allRefs) if (isObj(r) && isStr(r.id) && !usedRefs.has(r.id)) warn('ref-unused', r.id.startsWith('tr') ? eat : wat, `references.${r.id}`, `reference ${r.id} is never cited (no refs list, [[${r.id}]] or claim)`);

    // quiz spread and bias
    const spreadCheck = (label, d) => {
      let max = 0;
      if (d.singles >= 5) {
        const counts = {};
        d.singleAnswers.forEach((a) => { counts[a] = (counts[a] || 0) + 1; });
        const [slot, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
        max = n / d.singleAnswers.length;
        if (max > 0.4) warn('quiz-answer-spread', wat, label, `${Math.round(max * 100)}% of single-choice answers sit in option ${Number(slot) + 1}, keep every slot at or under 40%`);
        if (d.longestCorrect / d.singles > 0.5) warn('quiz-longest-bias', wat, label, `the correct option is the longest in ${d.longestCorrect} of ${d.singles} single-choice items, vary option length`);
      }
      return max;
    };
    const slotMax = spreadCheck('quiz', tally);
    spreadCheck('topics.quiz', topicTally);

    // per-world targets
    if (!fixture) {
      const n = w.levels.length;
      const isFinale = wid === 'w19';
      if (isFinale ? n < 6 : (n < 4 || n > 7)) warn('target-levels', wat, '', isFinale ? `w19 needs 6 or more boss rounds, found ${n}` : `a world has 4 to 7 levels, found ${n}`);
      if (tally.quiz < (isFinale ? 24 : 10)) warn('target-quiz', wat, '', `needs ${isFinale ? 24 : 10} or more quiz items, found ${tally.quiz}`);
      if (info.cards.length + topicTally.cards < 14) warn('target-flashcards', wat, '', `needs 14 or more flashcards, found ${info.cards.length + topicTally.cards}`);
      if (allRefs.length < 12) warn('target-references', wat, '', `needs 12 or more references, found ${allRefs.length}`);
      if (tally.diagrams < 2) warn('target-diagrams', wat, '', `needs 2 or more diagrams, found ${tally.diagrams}`);
      const num = Number(wid.slice(1));
      if (num >= 1 && num <= 13 && tally.dialBoards < 2) warn('target-dials', wat, '', `w01 to w13 need 2 or more dial boards, found ${tally.dialBoards}`);
      if (info.glossary.length + extraTerms < 8) warn('target-glossary', wat, '', `needs 8 or more glossary terms, found ${info.glossary.length + extraTerms}`);
      if (claims.length < 15 || claims.length > 30) warn('target-claims', wat, '', `the claims ledger should hold 15 to 30 claims, found ${claims.length}`);
      const last = ordered[ordered.length - 1];
      if (last && last.lv.kind !== 'boss') warn('target-boss', { ...wat, level: last.lv.id, file: rel(last.file) }, 'kind', 'the last level of a world is normally a boss level with a defend question');
      for (const need of ['multi']) if (!tally.quizTypes.has(need)) warn('target-quiz-variety', wat, '', `no "${need}" quiz item`);
      if (!tally.quizTypes.has('order') && !tally.quizTypes.has('match')) warn('target-quiz-variety', wat, '', 'no "order" or "match" quiz item');
      for (const tag of ['diagnose', 'flip', 'tradeoff']) if (!tally.quizTags.has(tag)) warn('target-quiz-variety', wat, '', `no quiz item tagged "${tag}"`);
      if (isInt(world.minutes) && tally.minutes && Math.abs(tally.minutes - world.minutes) / world.minutes > 0.4) warn('world-minutes', wat, 'minutes', `world minutes ${world.minutes} differs from the level total ${tally.minutes} by more than 40%`);
    }

    if (extraRefs.length) walkText(eat, extraRefs, 'references', allRefIds);

    stats.push({
      world: wid, fixture, levels: w.levels.length, quiz: tally.quiz, cards: info.cards.length, refs: info.refs.length,
      topics: topicTally.topics, topicIds: [...topicIds], scenarios: topicTally.scenarios, topicQuiz: topicTally.quiz, topicCards: topicTally.cards,
      allRefs: allRefs.length, extraClaims, topicDiagrams: topicTally.diagrams,
      diagrams: tally.diagrams, dials: tally.dialBoards, defends: tally.defends, glossary: info.glossary.length + extraTerms, claims: claims.length,
      slotMax, labs: [...tally.labs], prereqs: Array.isArray(world.prereqs) ? world.prereqs : [], order: world.order
    });
  }

  // related ids may point at any topic or level on the site
  const knownIds = new Set([...reg.levels.keys(), ...reg.topics.keys()]);
  for (const c of relatedChecks) if (!knownIds.has(c.id)) err('related-unknown', c.at, c.path, `related id "${c.id}" is not a topic or level id`);

  // catalog: every cataloged topic has a file and every topic file is cataloged
  let catalog = null;
  if (catalogPath && fs.existsSync(catalogPath)) {
    catalog = new Map();
    for (const line of fs.readFileSync(catalogPath, 'utf8').split('\n')) {
      const m = /^\|\s*(w\d\d-t\d+)\s*\|\s*([^|]*?)\s*\|/.exec(line);
      if (m) catalog.set(m[1], m[2]);
    }
    const catSev = catalogStrict ? err : warn;
    const catAt = (wid) => ({ file: rel(catalogPath), level: '', world: wid });
    const fileOf = new Map();
    for (const w of loaded) for (const { file, t } of w.topics) if (isStr(t.id)) fileOf.set(t.id, rel(file));
    for (const [id, title] of catalog) {
      const wid = id.slice(0, 3);
      if (!loaded.some((w) => w.wid === wid)) continue;
      if (!fileOf.has(id)) catSev('catalog-missing', catAt(wid), id, `catalog topic "${title}" has no topic file (merged rows must still be listed in the merged topic title)`);
    }
    for (const w of loaded) {
      if (w.fixture) continue;
      for (const { file, t } of w.topics) {
        if (isStr(t.id) && !catalog.has(t.id)) catSev('catalog-extra', { file: rel(file), level: t.id, world: w.wid }, 'id', `topic ${t.id} "${t.title}" is not in TOPIC-CATALOG.md`);
      }
    }
    for (const s of stats) s.catalog = [...catalog.keys()].filter((k) => k.startsWith(`${s.world}-`)).length;
  }

  // cross-world rules
  const worldIdSet = new Set(stats.map((s) => s.world));
  const byId = new Map(stats.map((s) => [s.world, s]));
  for (const w of loaded) {
    const wid = isStr(w.world.id) ? w.world.id : w.wid;
    const pre = Array.isArray(w.world.prereqs) ? w.world.prereqs : [];
    pre.forEach((x, i) => {
      if (!worldIdSet.has(x)) (worldFilter ? warn : err)('world-prereqs', w.wat, `prereqs[${i}]`, `prerequisite ${x} does not exist${worldFilter ? ' (partial run)' : ''}`);
      else if (byId.get(x).order >= w.world.order) warn('world-prereqs', w.wat, `prereqs[${i}]`, `prerequisite ${x} comes later in the world order`);
    });
    // cycle check
    const seen = new Set();
    const stack = [wid];
    while (stack.length) {
      const cur = stack.pop();
      for (const nxt of (byId.get(cur) || { prereqs: [] }).prereqs) {
        if (nxt === wid) { err('world-prereqs', w.wat, 'prereqs', `prerequisite cycle through ${cur}`); stack.length = 0; break; }
        if (!seen.has(nxt)) { seen.add(nxt); stack.push(nxt); }
      }
    }
  }

  // blocklist, raw text of every file under content-src
  let blockTerms = [];
  try {
    blockTerms = fs.readFileSync(blocklistPath, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  } catch {
    warn('blocklist-missing', { file: rel(blocklistPath) }, '', 'blocklist file not found, name checks skipped');
  }
  if (blockTerms.length) {
    const patterns = blockTerms.map((t) => ({ t, re: new RegExp(`(?<![a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')}(?![a-z0-9])`, 'i') }));
    const scan = (dir) => {
      for (const name of fs.readdirSync(dir)) {
        if (name.startsWith('.')) continue;
        const full = path.join(dir, name);
        if (fs.statSync(full).isDirectory()) { scan(full); continue; }
        if (!name.endsWith('.json')) continue;
        const wid = (/(?:^|\/)(w\d\d)-/.exec(path.relative(srcDir, full).split(path.sep).join('/')) || [])[1] || '';
        if (worldFilter && wid !== worldFilter) continue;
        if (!includeFixture && full.includes(`${path.sep}_fixture${path.sep}`)) continue;
        const lines = fs.readFileSync(full, 'utf8').split('\n');
        lines.forEach((line, i) => {
          for (const { t, re } of patterns) if (re.test(line)) err('blocklist', { file: rel(full), level: '', world: wid }, `line ${i + 1}`, `blocked term "${t}"`);
        });
      }
    };
    if (fs.existsSync(srcDir)) scan(srcDir);
  }

  const filtered = worldFilter ? issues.filter((i) => i.world === worldFilter) : issues;
  const shownStats = worldFilter ? stats.filter((s) => s.world === worldFilter) : stats;
  return { issues: filtered, stats: shownStats, filesChecked, worldsFound: loaded.length };
}

/* ---------- output helpers ---------- */
const normMsg = (m) => String(m).replace(/"[^"]*"/g, '"~"').replace(/\b\d+(\.\d+)?\b/g, '#').replace(/\((?:first used|also)[^)]*\)/g, '').replace(/same URL as \w+/, 'same URL as ~');

/* Groups repeated issues (same severity, rule and message shape), biggest groups first within each severity. */
export function groupIssues(issues) {
  const map = new Map();
  for (const i of issues) {
    const key = `${i.sev}|${i.rule}|${normMsg(i.msg)}`;
    if (!map.has(key)) map.set(key, { sev: i.sev, rule: i.rule, items: [] });
    map.get(key).items.push(i);
  }
  return [...map.values()].sort((a, b) => (a.sev === b.sev ? b.items.length - a.items.length : a.sev === 'error' ? -1 : 1));
}

const issueLine = (i) => `${i.sev === 'error' ? 'error' : 'warn '} [${i.rule}] ${i.file}${i.level ? ` (${i.level})` : ''}${i.path ? ` ${i.path}` : ''}: ${i.msg}`;
const issueWhere = (i) => `${i.level || i.file.split('/').pop()}${i.path ? ` ${i.path}` : ''}`;

function printGroups(groups, verbose) {
  for (const g of groups) {
    if (verbose || g.items.length === 1) { for (const i of g.items) console.log(issueLine(i)); continue; }
    console.log(`${issueLine(g.items[0])}   (x${g.items.length})`);
    const more = g.items.slice(1, 4).map(issueWhere);
    console.log(`      also: ${more.join(' | ')}${g.items.length > 4 ? ` | +${g.items.length - 4} more` : ''}`);
  }
}

const statRows = (result) => result.stats.map((s) => {
  const e = result.issues.filter((i) => i.world === s.world && i.sev === 'error').length;
  const w = result.issues.filter((i) => i.world === s.world && i.sev === 'warn').length;
  return {
    world: s.world + (s.fixture ? '*' : ''), levels: s.levels, topics: s.topics, catalog: s.catalog, scenarios: s.scenarios,
    quiz: s.quiz + s.topicQuiz, cards: s.cards + s.topicCards, refs: s.allRefs, diagrams: s.diagrams + s.topicDiagrams, dials: s.dials, errors: e, warns: w
  };
});
const topicsCell = (r) => `${r.topics}/${r.catalog === undefined ? '-' : r.catalog}`;

function buildReport(result, { worldFilter, strict }) {
  const errors = result.issues.filter((i) => i.sev === 'error');
  const warns = result.issues.filter((i) => i.sev === 'warn');
  const rows = statRows(result);
  const sum = (k) => rows.reduce((n, r) => n + (r[k] || 0), 0);
  const catTotal = rows.every((r) => r.catalog !== undefined) ? sum('catalog') : null;
  const byRule = new Map();
  for (const i of result.issues) {
    const key = `${i.sev}|${i.rule}`;
    if (!byRule.has(key)) byRule.set(key, { sev: i.sev, rule: i.rule, n: 0, worlds: new Set(), files: new Set(), example: i });
    const r = byRule.get(key);
    r.n++; r.worlds.add(i.world); r.files.add(i.file);
  }
  const top = [...byRule.values()].sort((a, b) => b.n - a.n);
  const byFile = new Map();
  for (const i of result.issues) byFile.set(i.file, (byFile.get(i.file) || 0) + 1);
  const worst = [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const clipMsg = (s) => (s.length > 110 ? `${s.slice(0, 109)}...` : s);
  const lines = [];
  lines.push(reportFrontmatter({ title: 'Validation report', description: `Schema, id, reference and writing-rule validation of content-src${worldFilter ? ` for ${worldFilter}` : ''}, with counts per chapter and the most frequent issue types` }));
  lines.push('## Summary', '');
  lines.push(`Run on ${todayIso()} with \`node tools/validate.mjs${worldFilter ? ` --world ${worldFilter}` : ''}${strict ? ' --strict' : ''}\`. No content files were edited.`, '');
  lines.push(mdTable(['Measure', 'Count'], [
    ['Chapters validated', rows.length],
    ['Practice problems (levels)', sum('levels')],
    ['Topic files found', sum('topics')],
    ['Topics in TOPIC-CATALOG.md', catTotal === null ? 'not checked' : catTotal],
    ['Scenarios', sum('scenarios')],
    ['Quiz items (levels and topics)', sum('quiz')],
    ['Flashcards (levels and topics)', sum('cards')],
    ['References (r and tr)', sum('refs')],
    ['Errors', errors.length],
    ['Warnings', warns.length]
  ]), '');
  lines.push('## Per chapter', '');
  lines.push(mdTable(['Chapter', 'Levels', 'Topics found/catalog', 'Scenarios', 'Quiz', 'Flashcards', 'References', 'Errors', 'Warnings'],
    rows.map((r) => [r.world, r.levels, topicsCell(r), r.scenarios, r.quiz, r.cards, r.refs, r.errors, r.warns])), '');
  lines.push('## Top issue types by frequency', '');
  lines.push(mdTable(['Rule', 'Severity', 'Count', 'Chapters', 'Files', 'Example'],
    top.slice(0, 15).map((r) => [`\`${r.rule}\``, r.sev, r.n, r.worlds.size, r.files.size, clipMsg(r.example.msg)])), '');
  if (top.length > 15) lines.push(`${top.length - 15} less frequent issue types are not listed. Run \`node tools/validate.mjs --verbose\` for every issue.`, '');
  lines.push('## Files with the most issues', '');
  lines.push(mdTable(['File', 'Issues'], worst.map(([f, n]) => [`\`${f}\``, n])), '');
  lines.push('## How to read this report', '');
  lines.push('* Errors break the contract (missing fields, unknown ids or references, wrong counts, no single best scenario option). Fix these first.');
  lines.push('* Warnings are style and target checks (filler words, em dashes, explain length, answer spread, catalog mismatches). `--strict` turns them into failures, and catalog mismatches into errors.');
  lines.push('* Re-run one chapter with `node tools/validate.mjs --world w07`, errors only with `--errors-only`, every issue with `--verbose`.', '');
  return lines.join('\n');
}

/* ---------- CLI ---------- */
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    const args = parseArgs(process.argv.slice(2), ['src', 'world', 'blocklist', 'site', 'today', 'catalog']);
    const worldFilter = typeof args.world === 'string' ? args.world : null;
    const strict = !!args.strict;
    const srcDir = args.src ? path.resolve(args.src) : paths.src;
    const result = validateTree({
      srcDir,
      siteDir: args.site ? path.resolve(args.site) : paths.site,
      blocklistPath: args.blocklist ? path.resolve(args.blocklist) : paths.blocklist,
      includeFixture: !!args['include-fixture'],
      worldFilter,
      today: args.today || todayIso(),
      ...(args['no-catalog'] ? { catalogPath: null } : typeof args.catalog === 'string' ? { catalogPath: path.resolve(args.catalog) } : {}),
      catalogStrict: strict
    });
    const errors = result.issues.filter((i) => i.sev === 'error');
    const warns = result.issues.filter((i) => i.sev === 'warn');
    if (!result.worldsFound) {
      console.error(`error: no worlds found under ${rel(srcDir)}. Use --include-fixture to validate the sample.`);
      process.exit(1);
    }
    if (args.report) {
      const file = typeof args.report === 'string' ? path.resolve(args.report) : path.join(paths.reviews, 'validation-report.md');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, buildReport(result, { worldFilter, strict }));
      console.log(`wrote ${rel(file)}`);
    }
    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      const hideWarns = !!(args.quiet || args['errors-only']);
      printGroups(groupIssues(errors), !!args.verbose);
      if (!hideWarns) printGroups(groupIssues(warns), !!args.verbose);
      if (!args['no-table'] && result.stats.length) {
        const rows = statRows(result).map((r) => [r.world, r.levels, topicsCell(r), r.scenarios, r.quiz, r.cards, r.refs, r.diagrams, r.dials, r.errors, r.warns]);
        console.log(`\n${formatTable(['Chapter', 'Levels', 'Topics', 'Scen', 'Quiz', 'Cards', 'Refs', 'Dgm', 'Dials', 'Err', 'Warn'], rows, ['l', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r'])}`);
        console.log('Topics = files found / TOPIC-CATALOG.md rows. Quiz and Cards include topics.');
        if (result.stats.some((s) => s.fixture)) console.log('* fixture world: per-world targets are not checked');
      }
      const groups = groupIssues(warns).length;
      console.log(`\n${result.filesChecked} files checked: ${errors.length} error${errors.length === 1 ? '' : 's'}, ${warns.length} warning${warns.length === 1 ? '' : 's'}${hideWarns && warns.length ? ` (hidden, ${groups} groups)` : ''}.`);
    }
    process.exit(errors.length || (strict && warns.length) ? 1 : 0);
  } catch (e) {
    console.error(`error: ${e.message}`);
    process.exit(2);
  }
}
