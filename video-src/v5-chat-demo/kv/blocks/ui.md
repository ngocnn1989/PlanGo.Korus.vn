# Library "ui" — product / app demo pieces

Blocks `device`, `cursor`, `tap`. Loaded automatically from `kv/blocks/*.js`. Show the product doing the job: one
interaction per beat, the caption states cause → effect, zoom into the detail that matters with the scene camera
(`cam.keys`, 1.2–2× on the clicked area) instead of shrinking UI text, keep motion restrained so the interface reads.
Screenshot text is not measured by lint: review the stills and keep UI text ≥ 26–28 px after the zoom.

## `device` (cat `media`, enter `up`)

| prop | default | meaning |
|---|---|---|
| `type` | `'phone'` | `'phone'` (rounded slab, notch) or `'laptop'` (lid + base) |
| `src` | — | screenshot asset key (fitted to the screen width) |
| `crop` | asset `crop`, else whole image | `[sx, sy, sw, sh]` source rectangle in image pixels (e.g. cut off a status bar); also read from `SB.assets[src].crop` |
| `scroll` | — | `[from, to]` share of the scrollable height (0 = top, 1 = bottom) |
| `scrollAt` | whole layer life | `[inBeat, outBeat]` after the layer's `in` (ease `io`) |
| `layers` | — | live KV layers on the screen (positions 0–1 of the screen), clipped: sticky headers, toasts, counters, highlights |
| `aspect` | 9 / 19.5 | phone screen aspect |
| `body` `screen` `base` | dark / white / light grey | colours |
| `notch` `gloss` | true | phone notch; faint glass reflection |

The frame fits the layer box (`at`, `w`, `h`, `size`) keeping its proportions.

```js
{ kind: 'device', type: 'phone', src: 'appScreen', at: 'visual', h: 0.85, scroll: [0, 0.55], scrollAt: [1, 5], layers: [
  { kind: 'shape', shape: 'rect', fill: '#1652E0', pos: [0.5, 0.05], w: 1, h: 0.1, enter: 'none' },   // sticky header
  { kind: 'text', text: 'Orders', style: 'subtitle', color: 'white', pos: [0.32, 0.055], enter: 'none' } ] }
```

## `cursor` (cat `fx`, enter `fade`)

The layer position is the pointer tip: move it with `keys` (use `arc` for natural curved moves, 0.4–0.8 s `io`) or
`follow`. `clicks: [scene beats]` — press (scale 0.88, 60 ms down / 80 ms up) and a ripple ring (0.4 s, `ripple` colour).
`style: 'arrow'` (default) `'hand'` `'dot'`; `color` (fill, white), `ink` (outline); size from the box (default 7 % of the zone).

```js
{ kind: 'cursor', at: 'visual', style: 'hand', clicks: [2.2],
  keys: [{ t: 0, pos: [0.85, 0.9] }, { t: 2, pos: [0.55, 0.45], arc: 0.25, ease: 'io' }] }
```

Add the click sound yourself: `sfx: [{ name: 'click', at: 2.2 }]` (sfx `at` counts from the layer's `in`).

## `tap` (cat `fx`, enter `none`)

Finger tap: a dot presses and fades (0.3 s) while a ring expands (0.4 s). `taps: [beats after in]` (default `[0]`),
`color` (`a1`), size from the box (default 12 % of the zone).

```js
{ kind: 'tap', at: 'visual', pos: [0.5, 0.62], size: 0.16, in: 6.2 }
```

## Recipe: click → zoom → result

```js
{ id: 'order', bars: 3, cam: { at: [0.7, 0.6], keys: [{ t: 0, s: 1 }, { t: 6, s: 1 }, { t: 8, s: 1.2, ease: 'io' }] }, layers: [
  { kind: 'device', type: 'phone', src: 'app', at: 'visual', h: 0.85, scroll: [0, 0.55], scrollAt: [1, 5] },
  { kind: 'cursor', at: 'visual', keys: [{ t: 0, pos: [0.85, 0.9] }, { t: 6, pos: [0.5, 0.62], ease: 'io' }], clicks: [6.2] },
  { kind: 'tap', at: 'visual', pos: [0.5, 0.62], size: 0.16, in: 6.2 },
  { kind: 'text', text: 'Tap to *order*', style: 'title', at: 'copy' } ] }
```

Clip length by placement (practitioner guide): feed 4–12 s, Reels / Shorts 6–20 s.
