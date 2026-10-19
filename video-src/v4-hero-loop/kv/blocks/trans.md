# Library "trans" — 41 scene transitions (Canvas 2D + WebGL2) and one metadata table

Scene transitions for KV storyboards: cut grammar, motion, wipes and shape masks, light, distortion, dissolve,
liquid, 3D and paper, brand and social-native moves. Researched in `transitions_50` (KR Video skill upgrade,
2026-10-02); the agent guide with the 15 rules, the selection matrix and the full catalogue is
`../../../references/transitions.md`. Loaded automatically from `kv/blocks/*.js` (sorted by name, so
`trans-core.js` runs before the files that use it).

| File | Content |
|---|---|
| `trans-core.js` | shared helpers `KV.TX` (eased progress, per-aspect `dir`/`at`, farthest-corner radius, scratch canvases, masks, low-res fields, cached noise, RGB split, box-blur stamps, crossfade, deepest-point search). Registers nothing. |
| `trans.js` | cut grammar, motion, wipes & shapes, liquid (ink, morph), 3D & paper, brand, social + the `iris` override |
| `trans-fx.js` | light (leak, burn), distortion (glitch, datamosh, pixelate, tvoff), dissolve (dither, noise, luma, defocus), goo |
| `trans-gl.js` | `KV.glx` WebGL2 runner + own shaders `ripple`, `kaleido`, `cube` (2D fallback without WebGL2) |
| `trans-meta.js` | `KV.TRANS_META` — one row per transition name (built-ins included): default beats, family, SFX, flashes, GL, direction, kids/vestibular/pattern flags, params, cost notes. Loads in the browser and in Node (`require` or `node:vm`). |

## Use

```js
{ id: 'next', bars: 2, trans: 'whip', layers: [ /* ... */ ] }
{ id: 'next', bars: 2, trans: { type: 'swipe', beats: 0.75, dir: { h: 'left', v: 'up' } }, layers: [ /* ... */ ] }
```

- `beats` sets the length (number = beats, or `'0.4s'`); without it kv-core uses the type's default from `trans-meta.js`
  (the table below).
- `dir` = the direction the incoming content travels (`left`: B enters from the right); per aspect
  `{ h, f, v, s }`. `at` = `[x, y]` frame fractions or a pin `'asset:point'` / `'layerId:point'` published by a photo
  layer of scene A (else B) — resolved every frame by rendering that scene once into the buffer (+1 render, pins only).
- `ease` = any `KV.EASE` name (`lin io o i oX oB bounce elastic`); each type has its own default.
- Every type is a pure function of progress: k = 0 shows scene A and k = 1 scene B exactly (cut types show B from
  k = 0), in 16:9, 4:5 and 9:16. GPU types accept `gl: false` (force the 2D fallback) and `fallback: '<type>'`.

## Transitions

R = full scene renders per frame (cost driver), S = full-size scratch canvases. Flash = full-frame flashes counted
by lint (≤ 3 per second). Beats = default length.

| type | family | beats | params (defaults) | SFX (anchor) | flash | R |
|---|---|---|---|---|---|---|
| `smash` | cut | 0.5 | `amp` 18, `punch` 0.05, `flash` false, `color` #FFF | boom + crash (start) | 1 if `flash` | 1 |
| `match` | cut | 1 | `from` [x, y, size], `to` [x, y, size], `xf` 0.15 | swell (mid) | 0 | 1–2 |
| `jlcut` | cut | 0 | `lead` beats (J-cut: B's scene-level say / sfx start early, ≤ 1 bar), `tail` beats / true = 1 (L-cut: A's voice may run past the cut) | — | 0 | 1 |
| `jump` | social | 1 | `s` 1.12, `at` | — | 0 | 1 |
| `cover` / `reveal` | motion | 0.75 | `dir` left, `dim` 0.25 | swoosh (mid) | 0 | 2 |
| `whip` | motion | 0.5 | `dir` left, `blur` 0.35, `taps` 10 | whoosh (mid) | 0 | 2, S1 |
| `zoomin` / `zoomout` | motion | 0.75 | `at`, `s` 2.2, `from` 0.85, `blur` 1 | whoosh (mid) | 0 | 2, S1 |
| `spin` | motion | 0.75 | `angle` 90 (≤ 180), `dir` cw/ccw, `at`, `zoom` 0.3, `cover` false, `color` bg | whoosh (mid) | 0 | 1, S1 |
| `smear` | motion | 0.5 | `dir` left, `amount` 3, `color` bg | swoosh (mid) | 0 | 1–2 |
| `iris` | wipe | 1 | `at`, `color` a1, `ring` true, `mode` open/close | whoosh (mid) | 1 if close | 2 |
| `clock` | wipe | 1.5 | `at`, `dir` cw/ccw, `n` 1, `hand` true, `color` a1 | tick ×3 | 0 | 2 |
| `barn` | wipe | 1 | `dir` left (9:16: up), `depth` false, `color` #000 | whoosh (mid) | 0 | 2 |
| `blinds` | wipe | 1 | `n` 8, `dir` down, `stagger` 0.4, `angle` 0 | swoosh (mid) | 0 | 2 |
| `checker` | wipe | 1 | `cell` 0.125, `mode` random/checker/diag, `seed` | blip ×4 | 0 | 2 |
| `shape` | wipe | 1.5 | `shape` star/heart/diamond, `at`, `spin` 0.6, `cover` (end size ÷ farthest-corner distance, auto 2.45 / 2.45 / 1.5), `color` a1 | boing (start) + sparkle (end) | 0 | 2 |
| `leak` | light | 1.5 | `colors` [3 warm], `amount` 0.7, `mode` leak/sweep, `seed` | swell (mid) | 1 | 1–2 |
| `burn` | light | 1.5 | `color` #FF8A2A, `dir` left (front travels like `wipe`), `res` 8, `seed` | crackle (start) + swell (end) | 1 (hot rim) | 2, S1 |
| `glitch` | distortion | 0.5 | `rate` 12, `amount` 1, `split` 14, `seed` | glitch (start) | 0 (≈ 10 % swap) | 2, S2 |
| `datamosh` | distortion | 1 | `block` 0.04, `amount` 0.6, `seed` | glitch (start) + swell (end) | 0 | 2, S1 |
| `pixelate` | distortion | 1 | `cell` 0.05 | blip (start, end) | 0 | 1 |
| `tvoff` | distortion | 1 | `on` true | buzz (start) + zap (0.4) | 1 | 1 |
| `ripple` (GL) | distortion | 1.5 | `amplitude` 40, `strength` 0.03, `swirl` 0 · fallback fade | swell (mid) | 0 | 2 + 2 uploads |
| `kaleido` (GL) | distortion | 1.5 | `segments` 6, `twist` 1 · fallback spin | sparkle (mid) | 0 | 2 + 2 uploads |
| `dither` | dissolve | 1 | `px` 6, `ramp` none/left/right/up/down | blip (start, end) | 0 | 2 |
| `noise` | dissolve | 1 | `scale` 0.08, `soft` 0.08, `res` 6, `grain` false, `seed` | swell (end) | 0 | 2 |
| `luma` | dissolve | 1.5 | `map` radial/'A'/'B'/asset key, `soft` 0.1, `invert`, `res` 4 | swell (end) | 0 | 2–3 |
| `defocus` | dissolve | 1 | `amount` 28 | swell (mid, soft) | 0 | 2 |
| `ink` | liquid | 1.5 | `n` 5, `splash` false, `color` (paint layer), `seed` | swoosh (start) | 1 if `color` contrasts the theme | 2 |
| `goo` | liquid | 1.5 | `n` 6, `res` 8, `seed` | boing (start) + pop (mid) | 0 | 2 |
| `morph` | liquid | 1.5 | `from` { at, w 0.18, h, r 1 }, `color` bg | whoosh (mid) + pop (end) | 0 | 2 |
| `flip` | 3d | 1 | `dir` left (up/down = horizontal axis), `color` bg; edge-on = a dark 2 % sliver | swoosh (mid) | 0 | 1 |
| `cube` (GL) | 3d | 1 | `dir` left (9:16: up), `depth` 1.6, `color` #000 · fallback flip (same default direction) | whoosh (mid) | 0 | 2 + 2 uploads |
| `peel` | 3d | 1.5 | `angle` 215 (fold travel), `paper` #F4F1EA | swoosh (mid) | 0 | 2 |
| `fold` | 3d | 1 | `n` 6, `dir` left (9:16: up) | click ×2 | 0 | 2 |
| `shatter` | 3d | 1.5 | `cell` 0.1, `at` (impact) | shatter (start) | 0 | 2 |
| `typefill` | brand | 1.5 | `text` 'GO', `at`, `mode` window/solid, `color` a1, `zoom` 40 (auto ≥ cover), `focus` auto, `font` 'head' (theme font or a family), `weight` 900 | whoosh (0.7) + riser (end) | 1 if solid | 2, S1 |
| `logo` | brand | 2 | `mark` 'mark' (BRAND.mark), `size` 0.25, `zoom` 30 (auto ≥ cover), `focus` auto, `at` | riser + chime (end) | 0 | 2, S1 |
| `swipe` | social | 0.75 | `dir` (16:9 left, 4:5 / 9:16 up), `gap` 24, `spring` 1.2, `color` #000 | swoosh (0.4) + click (end) | 0 | 2, S1 |
| `punch` | social | 0.75 | `s` 1.4, `at` | whoosh + kick (mid) | 0 | 1, S1 |
| `split` | social | 4 | `hold` 0.3, `color` ink (16:9 left/right, 4:5 / 9:16 top/bottom) | swoosh (0.17, 0.83) | 0 | 2, S1 |

`iris` is a library override of the runtime built-in: the circle now always reaches the farthest corner from `at`
(the built-in stopped at 0.62·diagonal and popped for off-centre `at`); a centred `at` gives the old pixels. The
runtime `zoom` is unchanged (it scales B *down*, against the forward motion) — use `zoomin` / `zoomout`.
Built-ins `cut flash fade dip slide wipe zoom band` and the library `aperture` (vision.js) and `seam` (weld.js) have
rows in `trans-meta.js` too.

## Fixture

`scripts/kv/templates/trans_fixture.js` puts every type (plus variants: iris corner/close, clock pinwheel, barn depth,
checker diag, heart, leak sweep, ripple swirl, luma map A, ink paint, typefill solid, per-aspect whip) between static
scenes, 1 bar each at 120 BPM:

```bash
node kv.mjs init <dir> --name TR --fps 30 --aspects 16x9,4x5,9x16 --mark mark.png   # mark: for `logo`
copy scripts/kv/templates/trans_fixture.js <dir>/storyboard.js
node kv.mjs lint                                # 0 errors expected (unknown types = registration failed)
node kv.mjs stills --at <t0 + d/2 per scene>    # mid-transition sheet per aspect (times from timeline.js)
```

Because the scenes are static, the frame at `t0` must equal the last plain frame of scene A and the frame at
`t0 + 0.98·d` the first plain frame of scene B (rule 12, end pop). Verified 2026-10-02 on all three aspects: every
type in these files is ≤ 2.4/255 mean difference at k = 0.98 and ≤ 0.5/255 at k = 0 (cut types excepted; GL types
checked on the GPU path, their 2D fallbacks with `gl: false`).
`aperture` (vision.js) fixed in the integration (2026-10-02): blades open beyond the farthest corner at k = 0 (0/255 vs A,
centred and off-centre, 16:9 + 9:16), closed at k = 0.5, open at k = 1 (0/255 vs B).

## Frame cost (1080p, measured, renderFrame + canvas upload as in render.mjs)

Measured as multiples of a plain fixture frame (≈ 8–11 ms on 16:9, busy machine): most types ≈ 1–2.3× (two scene
renders, like the built-in `fade` 1.9×); GL types 1.8–2.2× (two texture uploads); field types `noise dither goo burn`
≈ 2.4–2.6×; `glitch` 2.7× (RGB split); `luma` 2.8× (radial / plate maps cached); `luma` with `map: 'A'` 4–4.4×
(an extra scene render + readback); the existing `seam` 3.5–4×. Only frames inside transition windows pay this.
