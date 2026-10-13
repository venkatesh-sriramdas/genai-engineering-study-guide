---
title: Follow the Question, Brand and Visual Language
description: Logo, favicon, hero, icon system and colour rules for the study guide, with usage guidance for builders
ms.date: 2026-10-13
ms.topic: reference
keywords:
  - brand
  - icons
  - logo
  - design tokens
estimated_reading_time: 7
---

## Idea

The guide follows one question through an AI system. The visual identity tells that story: a question mark whose dot leaves the glyph and travels a path of nodes, and a hero where a question bubble moves through six stations to an answer. Colour carries meaning. A world accent marks where you are. Semantic colours mark status. Nothing is decorative noise.

## Files

| File | Purpose |
|---|---|
| `assets/js/icons.js` | `Guide.icons`: every icon, the logo and the hero as inline SVG strings |
| `assets/img/logo.svg` | Brand mark, standalone, literal brand colours |
| `assets/img/favicon.svg` | Simplified mark for 16 px tab icons |
| `assets/img/hero.svg` | Standalone copy of the home hero, for documents and previews |
| `assets/img/icons/*.svg` | Reference copies of all 77 icons (20 worlds, 6 regions, 51 UI). `icons.js` is the source of truth |

External `<use href>` is blocked on `file://`, so the app always uses the inline strings from `icons.js`. The `.svg` files are for reference, docs and design review.

## Colour

All values come from `tokens.css`. Do not hard-code replacements.

| Role | Token | Light | Dark |
|---|---|---|---|
| Brand start | `--brand-1` | `#6d5efc` | same |
| Brand end | `--brand-2` | `#22d3ee` | same |
| Brand middle (literal) | none | `#8b5cf6` | same |
| Gradient | `--brand-grad` | 135 degrees, brand-1 to violet to brand-2 | same |
| Success | `--ok` | `#15803d` | `#4ade80` |
| Surface, border, text | `--surface`, `--border`, `--text` | light set | dark set |

World accents (fill colours use the 600 to 800 shades so white text passes AA; w19 uses dark text on amber):

| World | Accent | World | Accent |
|---|---|---|---|
| w00 | `#7c3aed` | w10 | `#a16207` |
| w01 | `#4f46e5` | w11 | `#0369a1` |
| w02 | `#2563eb` | w12 | `#1e40af` |
| w03 | `#0e7490` | w13 | `#be185d` |
| w04 | `#0f766e` | w14 | `#a21caf` |
| w05 | `#047857` | w15 | `#4d7c0f` |
| w06 | `#15803d` | w16 | `#475569` |
| w07 | `#b91c1c` | w17 | `#9f1239` |
| w08 | `#b45309` | w18 | `#6b21a8` |
| w09 | `#c2410c` | w19 | `#f59e0b` |

Accent appears as a left border, header band, chip or icon tint. It is never body text colour. Icons take their colour from `currentColor`, so set `color` on the container (for example `color: var(--accent-text)`).

## Icon system

Every icon is a stroke drawing on a 24 by 24 grid.

* Stroke: 2 px, `stroke-linecap="round"`, `stroke-linejoin="round"`, `fill="none"`, `currentColor`.
* Live area: 20 by 20, which leaves 2 px of padding. A few shapes use the full 2 to 22 range (compass, eye) because a circle or lens reads smaller than a square of the same extent.
* Optical balance: round shapes sit slightly larger than square ones, and every icon is centred on its visual weight, not its bounding box.
* Dots are zero length strokes (`M x y h.01`), so a dot has the same weight and round cap as a line. No icon uses a filled shape except `bookmark-fill` and the half disc in `contrast`.
* Small rings (slider knobs, network nodes) use a 2 px radius so the counter stays open at 24 px. At 16 px they close into dots, which still reads correctly.
* Corner radius: 1.5 px for small shapes, 2 to 3 px for containers.
* One metaphor per icon. A second element is allowed only when it names the subject (a check on a shield, a spark on a notebook).

### World metaphors

| World | Icon | Reading |
|---|---|---|
| w00 | compass | orientation |
| w01 | three sliders | model controls |
| w02 | stopwatch with bolt | latency |
| w03 | funnel with falling dots | ingestion |
| w04 | puzzle piece | chunks that fit |
| w05 | lens over a layer | retrieval |
| w06 | shield with check | guardrails |
| w07 | padlock and key | access control |
| w08 | plug | tools and MCP |
| w09 | two nodes, one wire | agent to agent |
| w10 | hub and three agents | multi-agent |
| w11 | scaffold with brace | framework |
| w12 | cloud with agent badge | hosted agents |
| w13 | eye with waveform | vision and audio |
| w14 | checklist over a gauge | evaluation |
| w15 | telescope | observability |
| w16 | two overlapping coins | cost |
| w17 | balance scale | governance |
| w18 | notebook with spark | field notes |
| w19 | trophy | boss rounds |

### Region metaphors

| Region | Icon |
|---|---|
| foundations | three stacked blocks |
| knowledge | open book |
| agents | bot head |
| senses | viewfinder |
| operate | server rack |
| finale | summit with flag |

### UI icons

`Guide.icons.names` lists 51 names. They match `CONTRACT.md` exactly. Status icons keep one job each: `check` and `cross` are answer feedback, `info`, `warn` and `bulb` are callouts, `close` dismisses, `flag`, `star` and `bookmark` mark learner state.

### Sizes

| Context | Size |
|---|---|
| Inline with text, buttons | 16 to 20 |
| Sidebar and chips | 18 to 22 |
| World icons in cards and headers | 24 to 32 |
| Feature tiles | 40 to 48 |

Check any new icon at 16 and 48 px in both themes before merging.

### API

```js
Guide.icons.svg('check', { size: 18, cls: 'quiz__ok', title: 'Correct' })
Guide.icons.world('w07', { size: 28 })
Guide.icons.region('agents', { size: 22 })
Guide.icons.logo({ size: 30 })              // gradient tile
Guide.icons.logo({ size: 30, mono: true })  // tile-less, takes currentColor
Guide.icons.hero()                          // wide decorative SVG
```

* Without `title` an icon is `aria-hidden`. With `title` it gets `role="img"`, an `aria-label` and a `<title>`.
* `svg()` also resolves world ids and region ids. Unknown names return an empty string.
* Every string carries the classes `gi` and `gi-<name>` so a stylesheet can target them.

## Logo

* Construction: a rounded tile (radius 25 percent) with the brand gradient, a white question mark, a dot that has left the glyph, one ring node and one filled end node joined by a thin path. The trail reads as the journey, the filled node as the answer.
* Gradient: `--brand-1` to `#8b5cf6` to `--brand-2`, drawn in user space from the top left to the bottom right so the cyan stays in the far corner and white strokes keep contrast.
* Inline use takes `var(--brand-1)` and `var(--brand-2)` with literal fallbacks. The standalone `logo.svg` uses literal colours.
* Sizes: tested at 16, 32 and 128 px. At 16 px the trail becomes texture and the question mark carries the mark.
* Mono variant: no tile, `currentColor`, for headers on coloured bands, print and one colour contexts.
* Clear space: keep at least one quarter of the tile width free on every side.
* Do not rotate, recolour outside the tokens, add shadows, outline the tile or place it on a background with less than 3:1 contrast against the tile edge.

## Favicon

A 32 unit tile with the same gradient and a heavier question mark (stroke 4.2) and dot. The trail is dropped because it does not survive at 16 px. Link it from `index.html` as `assets/img/favicon.svg` with `type="image/svg+xml"`.

## Hero

* Canvas: 960 by 420, scales with `width: 100%`. About 7.5 KB, no raster.
* Story: a question bubble on the left, a wavy pipe through six stations (data, retrieval, model, tools, agents, evaluation) and an answer badge on the right.
* Station icons are the same icon geometry as the icon set (data uses the ingestion funnel, retrieval the layer lens, tools the plug, agents the hub, evaluation the checklist gauge). The model station has its own chip drawing used only here.
* Theming: the root defines private variables (`--h-t`, `--h-s`, `--h-1` and so on) that read `--text`, `--surface`, `--brand-1` and the other tokens, each with a literal fallback. Inline in the app it follows the active theme. Opened standalone it follows the OS colour scheme.
* Labels sit outside the stations, above the raised ones and below the lowered ones, so they never cross the pipe. They use `--font-sans` at 20 units so they stay readable when the hero is scaled to about half width.
* Motion: dashes flow along the pipe and the station halos breathe slowly. Both are wrapped in `prefers-reduced-motion: no-preference`, so reduced motion shows a still image.
* The inline hero is `aria-hidden`. The standalone file carries a `<title>` and an `aria-label` for use as an image.
* Layout hint for the page: place it at the right of the hero text on wide screens, under it on narrow ones, and fade the top edge with a mask. It must never block clicks (`pointer-events: none`).

## Adding or changing an icon

1. Draw on the 24 grid with a 2 px stroke and round caps. Keep to the live area.
2. Add the path data to the right map in `icons.js` (`UI`, `WORLD` or `REGION`).
3. Run the icon sheet at 16, 24 and 48 px in light and dark. Check the metaphor reads without the label.
4. Add or refresh the reference file in `assets/img/icons/`.
5. If a world icon changes, check the hero and the world cards, since they reuse it.
