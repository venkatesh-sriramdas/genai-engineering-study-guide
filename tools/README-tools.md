---
title: Study Guide Tooling
description: How to build, validate, link check, render check and package the Follow the Question study guide, with every validator rule explained
ms.date: 2026-10-13
ms.topic: reference
keywords:
  - build
  - validate
  - link check
  - playwright
  - packaging
estimated_reading_time: 9
---

## What is here

All tools are plain Node scripts (Node 20 or later, tested on Node 26). Run them from the project root, `genai-study-guide/`.

| Command | Purpose | Exit codes |
|---|---|---|
| `node tools/build.mjs [--include-fixture]` | Compile `content-src/` into `site/content/` | 0 built, 1 invalid source |
| `node tools/validate.mjs [--world w04] [--errors-only] [--report]` | Check levels, topics and scenarios against `CONTRACT.md` and `TOPIC-CATALOG.md` | 0 no errors, 1 errors |
| `node tools/link-check.mjs [--world w04]` | HEAD or GET every reference URL, write `reviews/link-report.md` | 0 none dead, 1 dead links, 2 offline |
| `node tools/check-render.mjs [--world w04] [--sample 3] [--shots]` | Open topics, cheat sheets and routes in headless Chromium from `file://` | 0 clean, 1 errors or watchdog, 2 setup problem |
| `node tools/package.mjs` | Build, validate, check assets, zip to `dist/`, unzip and list | 0 packaged, 1 refused |

Browser tooling lives in `tools/node_modules` (Playwright 1.64 and Chromium 1248). The file `tools/.playwright-ready` exists once that install succeeded. To reinstall:

```bash
cd tools
npm install
npx playwright install chromium
```

Other builders can drive the browser with `require('/abs/path/genai-study-guide/tools/node_modules/playwright')`.

## Build

```bash
node tools/build.mjs --include-fixture   # while developing the engine
node tools/build.mjs                     # real content only
```

Options: `--src <dir>`, `--out <dir>`, `--quiet`.

* Output files: `manifest.js`, `search-index.js`, `refs-all.js` and one `<worldId>.js` per world, exactly as `CONTRACT.md` describes. Topics (`tNN-*.json`) and `_topics.json` (extra `tr` references, glossary) are compiled into the world, topic flashcards get ids `<topicId>-fc<n>`, and only files named `lNN-*.json` load as levels.
* The claims ledger is removed from shipped worlds. Heading ids are filled from the heading text and made unique per level.
* Output is deterministic. The `generated` stamp is the newest source file time, or `SOURCE_DATE_EPOCH` when set.
* All sources load first. Every invalid file is reported as `file: reason (line, column)`, and a failed build leaves the previous output untouched.
* Build refuses: invalid JSON, a missing world or level id or order, duplicate world or level ids, a region not in `_meta.json`, and an empty source folder.
* A summary table of counts per world prints at the end.

## Validate

```bash
node tools/validate.mjs                    # every chapter, grouped output and a per-chapter table
node tools/validate.mjs --world w04        # authors: check one chapter
node tools/validate.mjs --errors-only      # hide warnings
node tools/validate.mjs --verbose          # list every issue instead of grouping
node tools/validate.mjs --strict           # warnings fail too, catalog mismatches become errors
node tools/validate.mjs --report           # also writes reviews/validation-report.md (or --report=<file>)
node tools/validate.mjs --include-fixture --world w99   # the sample world only
node tools/validate.mjs --json             # machine readable
```

Other options: `--src <dir>`, `--quiet` (same as hiding warnings), `--no-table`, `--no-catalog`, `--catalog <file>`, `--blocklist <file>`, `--today <YYYY-MM-DD>`.

Output groups repeated issues (same severity, rule and message shape). Each group prints its first line as `error|warn [rule] file (id) json.path: message   (xN)` and an `also:` line with up to three more places. The per-chapter table shows levels, topics found over catalog rows, scenarios, quiz items and flashcards (levels plus topics), references (`r` plus `tr`), diagrams, dial boards, errors and warnings. Errors fail the run. The fixture world is flagged with an asterisk and skips the per-world targets, and its topic count violations are warnings.

With `--world`, unresolved prerequisites are warnings because the other worlds may not exist yet. On a full run they are errors.

### Topics, scenarios and the catalog

Topic files (`tNN-slug.json`) and `_topics.json` load next to the levels. `_topics.json` references use `tr` ids and merge with the world references, so `[[tr3]]`, topic `refs`, quiz `ref` and level `refs` all resolve against the merged set. The glossary and claims in `_topics.json` are checked too (claims point at topic ids).

| Area | Rules |
|---|---|
| Topic fields | `topic-missing` E, `topic-type` E, `id-format` E (`<world>-t<n>`), `id-duplicate` E, `topic-order` E and W, `topic-difficulty` E (`core` or `advanced`), `topic-minutes` E, `file-name` W, `topic-no-visual` W, `topic-explain-words` W (150 to 400 words of teaching text, warns outside 150 to 450) |
| Explain blocks | `block-not-allowed` E (only `h`, `p`, `list`, `callout`, `table`, `compare`, `dials`, `flow`, `diagram`, `code`, `formula`, `stats`, `failure`, `tabs`, `accordion`, `lab`), `topic-heading-level` E (`h` blocks are level 3), plus every block rule from levels |
| Counts | `topic-where-count` E (3 to 6), `topic-when-use-count` and `topic-when-avoid-count` E (3 to 5), `topic-when-flips-count` E (2 to 4), `topic-alt-rows-count` E (3 to 6 rows), `topic-alt-head-count` E, `topic-alt-row` E (cells match the header), `topic-alt-loses` W (no column about when an option loses), `topic-pitfalls-count` E (2 to 4), `topic-pitfall-missing` E, `topic-scenarios-count` E (2 to 4), `topic-quiz-count` E (2 to 3), `topic-cards-count` E (2 to 4) |
| Scenarios | `id-format` E (`<topicId>-s<n>`), `scenario-options-count` E (3 to 4), `scenario-best` E (exactly one `best`), `scenario-poor` E (at least one `poor`), `scenario-verdict` E (`best`, `good`, `poor`), `scenario-option` E (name, why, tradeoff), `scenario-flips-count` E (2 to 3), `scenario-flip` E, `scenario-constraints-count` and `scenario-unknowns-count` W, `scenario-id-order` W, `scenario-best-spread` W (the best option sits in one position in more than 40 percent of a chapter's scenarios) |
| Quiz and cards | `id-format` E (`<topicId>-q<n>`), all quiz rules, `quiz-answer-spread` W and `quiz-longest-bias` W (checked for topic quizzes as their own pool, labelled `topics.quiz`) |
| Links | `related-id` E (not a topic or level id), `related-unknown` E (no such id on the site), `ref-unknown` E (topic `refs` or a badge not in `_world.json` or `_topics.json`), `topics-extra-missing` W, `ref-id` E (extra references must look like `tr1`), `topics-refs-count`, `topics-glossary-count`, `topics-claims-count` E |
| Writing | The writing rules, blocklist and markdown checks apply to topics and `_topics.json`. `md-citation` accepts `[[r1]]` and `[[tr1]]` |
| Catalog | `catalog-missing` W (a row of `TOPIC-CATALOG.md` has no topic file), `catalog-extra` W (a topic file is not in the catalog). Both are errors with `--strict`. The catalog is read only for the real `content-src/`, or from `--catalog <file>` |

### Rule catalogue (levels, worlds, shared rules)

Severity is E for error and W for warning. Rules that end in `-missing`, `-type` or `-count` mean a required field is absent, has the wrong type or has the wrong number of items.

| Area | Rules |
|---|---|
| Files and JSON | `json-parse` E, `json-type` E, `meta-file-missing` E, `meta-missing` E, `meta-version` E, `meta-regions` E, `world-file-missing` E, `dir-name` W, `file-stray` W, `file-name` W, `unknown-key` W |
| World | `id-format` E, `id-duplicate` E, `world-dir` E, `world-order` E, `world-region` E, `world-missing` E, `world-type` E, `world-minutes` E and W, `world-prereqs` E and W (self, unknown, cycle, later world), `world-learn-count` W, `world-story` W |
| References | `ref-id` E, `ref-type` E, `ref-status` E, `ref-verified` E (not a real date) and W (future date), `ref-url` E (not http or https) and W (placeholder host), `ref-url-http` W, `ref-url-duplicate` W, `ref-missing` E, `ref-unknown` E, `ref-unused` W |
| Cards, glossary, claims | `card-type` E, `card-tags` W, `glossary-shape` E, `glossary-duplicate` W, `claims-missing` E, `claim-where` E, `claim-ref-uncited` W, `claim-confidence` W |
| Level | `level-order` E and W, `level-kind` E, `level-minutes` E, `level-heading` E (no `h` block), `level-blocks-missing` E, `level-quiz-type` E, `defend-missing` E (also required on boss levels), `level-refs-count` W, `level-takeaways-count` W, `level-brief` W, `level-structure` W, `level-quiz-count` W |
| Blocks | `block-unknown` E, `block-type` E, `block-not-allowed` E (model answers allow `p`, `list`, `table`, `callout`, `diagram`, `compare`), `block-heading-level` E, `block-heading-id` E, `block-list-style` E, `block-callout-kind` E, `block-table-row` E, `block-table-highlight` E, `block-compare-missing` E, `block-compare-meta` E, `block-flow-direction` E, `block-formula-vars` E, `block-stats-value` E, `block-lab-id` E (must exist in the lab registry), `block-code-lang` E and W, `block-code-empty` E, `block-nesting` W, `block-*-count` W for compare, flow and tabs with fewer than two entries |
| Diagrams | `id-format` E, `id-duplicate` E, `block-diagram-alt-missing` E, `block-diagram-src-type` E, `diagram-nodes` E (more than 12, heuristic for flowchart, graph, sequence and state), `diagram-config` E (`%%{init}%%`, frontmatter), `diagram-style` E (`style`, `classDef`, `class`, `linkStyle`, `click`), `diagram-type` W, `diagram-label` W, `diagram-empty` W |
| Dial boards | `dial-count` E (2 to 4 dials), `dial-values-count` E (2 to 4 values), `dial-options-count` E (3 to 6 options), `dial-matrix` E (every option, dial and value present, no unknown keys), `dial-score` E (`s` an integer from -2 to 2), `dial-why` E, `dial-duplicate` E, `id-format` E (`<levelId>-...`), `dial-no-flip` W (one option wins every combination), `dial-inert` W (a dial that changes nothing) |
| Quiz | `quiz-type` E, `quiz-tag` E, `id-format` E (`<levelId>-q<n>`), `id-duplicate` E, `quiz-answer` E and W, `quiz-options-count` E, `quiz-options-duplicate` E, `quiz-order-count` E and W, `quiz-order-duplicate` E, `quiz-match-count` E, `quiz-match-pair` E, `quiz-match-duplicate` E, `quiz-numeric` E and W, `quiz-difficulty` E, `quiz-code` E, `quiz-explain-missing` E, `quiz-explain-short` W, `quiz-id-order` W, `quiz-answer-spread` W (one slot above 40 percent of single-choice answers), `quiz-longest-bias` W |
| Defend | `defend-type` E, `defend-clarify-count` E, `defend-option-missing` E, `defend-rubric-weight` E (1 to 3), `defend-followup-missing` E, `defend-options-count` W, `defend-rubric-count` W (5 to 9), `defend-followups-count` W (2 to 4), `defend-redflags-count` W (2 to 5) |
| Writing | `text-emdash` W, `text-filler` W (simply, easily, just, robust, seamless, powerful), `text-undated` W (recently, now, these days without an absolute date), `md-raw-html` W, `md-unbalanced` W, `md-citation` W, `md-link-scheme` E (links must be http or https), `blocklist` E |
| Per-world targets | `target-levels` W, `target-quiz` W, `target-flashcards` W, `target-references` W, `target-diagrams` W, `target-dials` W, `target-glossary` W, `target-claims` W, `target-boss` W, `target-quiz-variety` W |

Notes:

* Writing rules read learner-facing strings only. Code spans, URLs, ids, code blocks and the claims ledger are skipped.
* The blocklist scan reads the raw text of every `.json` file under `content-src/`, including the claims ledger and the fixture when it is included. Terms live in `tools/blocklist.txt`, one per line, matched case-insensitively on word boundaries.
* Quiz distribution checks need at least five single-choice items in a world.
* The tool does not judge whether a fact is true. Fact checkers do that against the claims ledger.

## Link check

```bash
node tools/link-check.mjs                      # every world
node tools/link-check.mjs --world w04          # writes reviews/link-report-w04.md
```

Options: `--include-fixture`, `--src <dir>`, `--out <file>`, `--timeout 10000`, `--concurrency 8`, `--per-host 3`, `--retries 1`, `--no-write`.

* Tries HEAD, then GET when HEAD fails or returns 4xx or 5xx. Redirects are followed by hand and counted. One retry for server errors and network errors.
* Results: `ok`, `moved` (final page differs from the reference URL, update it), `long-redirect` (more than three hops), `unverifiable` (401, 403, 429, 999, usually bot blocking), `timeout`, `dead` (404 and other 4xx, 5xx, DNS or connection failure, redirect loops).
* Only `dead` links fail the run. If every request fails at the network level, the tool exits 2 and keeps the old report.
* `reviews/link-report.md` has a summary, a needs-attention table and one table per world.

## Render check

```bash
node tools/check-render.mjs                          # sample: 2 topics and 2 practice problems per chapter, within 90 s
node tools/check-render.mjs --world w07              # every topic and practice problem of one chapter
node tools/check-render.mjs --world w07 --shots      # also saves reviews/shots/*.png
node tools/check-render.mjs --sample 5               # 5 random topics per chapter
node tools/check-render.mjs --all --budget 600       # everything, with a longer watchdog
node tools/check-render.mjs --only '^#/w/w04'        # routes matching a regex
```

Other options: `--site <dir>`, `--themes light,dark` (default both), `--topic-widths 360` (topic family), `--widths 1280` (other routes), `--full-matrix` (every route in every theme and width), `--limit N`, `--no-deep-links`, `--no-facilitator`, `--timeout 15000`, `--out <file>`, `--headed`.

* Topic family: `#/topics`, every chapter `#/w/<id>/cheatsheet` and the topic routes `#/w/<id>/<topicId>`. They run in light and dark at 360 px. Findings: console errors, page errors, failed requests, external requests, horizontal overflow (`scrollWidth` above `clientWidth`), fewer diagrams than the topic defines, and diagrams that fall back to source.
* If the shell or renderer cannot show a topic-family route yet (error view, not-found view, wrong view or empty page), the visit is a `topic-not-rendered` warning and the report says so in a note. It never fails the run.
* Other routes (below) run once in the first theme at the first width of `--widths`.
* Watchdog: `--budget` seconds (default 90). Visiting stops a few seconds early, the report is written and the browser is closed. If the process still overruns, the browser process is killed and the tool exits 1. Skipped visits are counted in the report. Use `--world` or a smaller `--sample` to stay inside the budget.
* The browser always closes in a `finally` block, and each pass is isolated, so one failing pass does not stop the others.
* Other routes come from the compiled manifest: home, every world, practice problems, `#/cards` and one per world, `#/labs` and every lab, library, glossary, bookmarks, progress, about, a search, and an unknown route that must show the not-found view. They are skipped with `--world`.
* Errors: console errors, uncaught exceptions, failed requests, any request that is not `file:`, `data:` or `blob:`, error or not-found views, empty views, a missing level or world title, a lab that does not mount, a diagram still loading after the timeout, and any `figure.g-diagram[data-state="error"]` (Mermaid fell back to source).
* Warnings: no `h1`, page wider than the viewport, fewer diagrams than the level defines, globals outside `Guide`.
* Levels whose model answer holds a diagram are visited again with facilitator mode on.
* One fresh page load per world checks that a deep link into its first level renders.
* Each pass uses a new browser context, so progress storage starts empty. Output goes to `reviews/render-report.md`.

## Package

```bash
node tools/package.mjs            # dist/follow-the-question-<version>.zip
node tools/package.mjs --render   # also run the render check on the unzipped copy
node tools/package.mjs --check-only
```

Options: `--include-fixture` (name gains `-sample`, never ship it), `--skip-validate`, `--keep`, `--list` (print every file in the zip), `--src`, `--site`, `--dist`.

1. Builds without the fixture and validates (levels, topics, scenarios and the catalog). Any error stops the run.
2. Checks the site folder: every local script, stylesheet and image in `index.html` exists, no external URLs, no CDN or web font, no `type="module"`, no ES module syntax or `import()` in site scripts (compiled `content/*.js` is data and is not scanned), every lab script and world file exists, the Mermaid bundle is present.
3. Stages `site/` as `follow-the-question/`, leaving out the fixture world output (`content/w99*`), files that start with `_`, `scratch`, test and spec files, `.DS_Store` and source maps. Adds `HOW-TO-USE.txt`.
4. Zips with the system `zip` in sorted order with fixed timestamps, so the same input gives the same bytes: `dist/follow-the-question-<version>.zip`.
5. Unzips into `dist/.verify/` (inside the project, never a system temp folder), compares the tree with what was staged, checks that no fixture or development file shipped and that the zipped manifest holds the same topic count as the build, prints a folder summary and the top-level listing, then removes the staging folders.

## Self-tests

| Command | What it proves |
|---|---|
| `node tools/test-validate.mjs` | 216 deliberately broken copies of the fixture (levels, topics and scenarios) each trigger the intended rule and no unexpected error, plus CLI exit codes, build errors and deterministic output |
| `node tools/test-link-check.mjs` | Redirects, HEAD fallback, 403 and 429, loops, timeouts and refused connections, against a local server |
| `node tools/test-package.mjs` | Zip layout, exclusions, reproducibility, and refusal of CDN links, modules, web fonts, missing labs and a leaked fixture |
| `node tools/test-render.mjs` | A broken diagram, console error, uncaught exception, missing asset, external request and global leak are each reported |

`npm test` inside `tools/` runs all four. The tests write only inside `tools/.scratch/`, which is git ignored and removed afterwards (`--keep` leaves it). Nothing is written to `content-src/`.

## Typical workflows

* Author, before hand-off: `node tools/validate.mjs --world wNN`, fix every error, review the warnings.
* Topic author: `node tools/validate.mjs --world wNN --errors-only`, then `node tools/check-render.mjs --world wNN` once the shell renders topics.
* Orchestrator, status: `node tools/validate.mjs --report` refreshes `reviews/validation-report.md`.
* Engine builder: `node tools/build.mjs --include-fixture`, open `site/index.html`, run `node tools/check-render.mjs --only '^#/w/w99'`.
* Orchestrator, release: `node tools/package.mjs --render`, then `node tools/link-check.mjs`.
