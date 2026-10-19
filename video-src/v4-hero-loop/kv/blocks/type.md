# Library "type" — kinetic typography

`type.js` adds the block `textpath`; the line-based kinetic props live on the core `text` block (kv-blocks.js) so they
work inside `stack`, presets and per-aspect layouts. Keep reading speed ≤ ~3 words/s (lint `reading`).

## `text` kinetic props

| prop | example | notes |
|---|---|---|
| `enter: { type: 'words', per: 1 }` | headline ≤ 5 words | one word per `per` beats, each landing on its beat (linear); total = per × (words + 1) |
| `enter: 'scramble'` | `{ text: 'TARGET LOCKED', font: 'mono' }` | glyphs cycle at 15 Hz three slots ahead of a left → right resolve; 0.3 s + 0.05 s / char; short labels, monospace avoids width jumps |
| `track: [fromEm, toEm]` | `[0.02, 0.12]` | letter-spacing opens over the rest of the scene (sine-out); laid out at the widest spacing, so lines never reflow |
| `accentStyle: 'marker'`, `markerInk`, `markerIn` | `markerIn: 1` | highlighter bar wipes in (0.4 s) `markerIn` beats after the layer's `in`; with `markerInk` the word shows in the accent colour until the bar covers it (without it the word stays `ink`); each marker word is measured on its bar by lint |
| `weight: [from, to]`, `weightAt`, `weightDur` | `[300, 700]`, `2`, `'1.2s'` | variable-font weight morph (`io`); needs a font with a `wght` axis (Windows Bahnschrift, or `SB.fonts` file); laid out at the heavier weight |

```js
{ kind: 'stack', at: 'stage', layers: [
  { kind: 'text', text: 'Plan. Weld. *Done.*', style: 'title', enter: { type: 'words', per: 1 } },
  { kind: 'text', text: 'BUILT FOR *STEEL*', style: 'headline', track: [0.02, 0.14], accentStyle: 'marker', markerIn: 3, markerInk: 'white', in: 1, enter: 'mask' },
  { kind: 'text', text: 'TARGET LOCKED', style: 'subtitle', font: 'mono', in: 2, enter: 'scramble' },
  { kind: 'text', text: 'Weight morph', style: 'headline', font: 'Bahnschrift', weight: [300, 700], weightAt: 2, in: 3, enter: 'fade' } ] }
```

## `textpath` (cat `copy`, enter `fade`, reveal `type`)

Glyphs placed one by one along a circle or an SVG path, each turned to the path tangent (badges, rims, orbits, routes).
Short labels only (≤ ~30 characters, never body copy).

| prop | default | meaning |
|---|---|---|
| `text` | — | the label (repeat it with separators to fill a ring: `'AI WELDING • AI WELDING • '`) |
| `circle` | — | radius in px@1080 (≥ 2.5 × `px`); starts at 12 o'clock, clockwise; `side: 'in'` runs counter-clockwise inside the ring (use `offset: 0.5` for text along the bottom) |
| `d`, `unit` | — | SVG path instead of a circle: layer px around the origin (default) or `unit: 'box'` (0–1 of the box) |
| `offset` | 0 | start position as a share of the path length; `[from, to]` slides it over `dur` |
| `dur` | `'4s'` | slide time for `offset: [from, to]` (2–6 s for a slow turn) |
| `px` | 44 | font size px@1080 (≥ 32) |
| `font` `weight` `color` `ls` | head / theme / `ink` / 0 | |

`enter: 'type'` reveals the glyphs in order. Each glyph is reported to lint (size, contrast, overlap with other text).

```js
{ kind: 'textpath', at: 'visual', text: 'AI WELDING • AI WELDING • ', circle: 170, offset: [0, 0.25], dur: 8, px: 36 }
{ kind: 'textpath', at: 'visual', d: 'M-150,60 C-80,-90 80,90 150,-60', text: 'along a path', px: 42, enter: 'type' }
```
