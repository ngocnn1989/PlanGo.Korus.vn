# Library "vision" — robot AI camera effects

Ported from production `07_vnj-airobot-mat-ai` (scene.js: `brackets`, `chipLabel`, `hud`, `crt`, `boot`, `buildCat2` /
`pixels` / `buildLUT`, `buildThermal`, `detect` / `seamTag`, `particles`, `buildTwist` / `twistCam` / `drawLayer`,
`aperture`) into reusable tier-2 blocks. Load after `kv-blocks.js` (auto: `kv/blocks/*.js`).

## Blocks

| kind | cat | props |
|---|---|---|
| `viewfinder` | ui | full-frame HUD — use `at: 'full'` (labels sit in the safe zone of the whole frame). Camera HUD over the whole frame: 4 corner brackets + edge ruler ticks, blinking REC dot (`rec: false` to hide, `recColor`), optional centre `crosshair`, `labels` (array of strings or `{text,color}`, staggered chip captions bottom-right, auto-clamped to the aspect's safe zone), `color` (accent, default `a2`) |
| `crt` | fx | CRT static + scanlines + a rolling highlight band over the frame; dissolves to transparent over `dur` (default `1.5s`, `'0.8s'`/beats); `hold: true` keeps it at full strength (no dissolve) |
| `edges` | media | `src` (asset key) as a Sobel edge map in `color` (default `a2`) with a moving scan line; `mix` 0–1 cross-fades to the plain photo (0 = pure edge map, default); `scanPeriod` (default `'2.4s'`); `radius` corner radius |
| `thermal` | media | `src` as a false-colour inferno thermal view with a slow horizontal-slice heat shimmer (`shimmer` amplitude, default 1); `radius` |
| `depthmap` | media | `src` as a fake depth map (luma + vertical-gradient turbo colouring); `sweep: true` wipes the photo into the depth map over `dur` (default `'1.5s'`), `scanColor` |
| `detect` | ui | `boxes: [{ x, y, w, h (fractions of the layer box), label, color, at (beats) }]` — bracket boxes that lock on (converging reticle) with word-only chip labels (no fake percentages); box default `at: 'full'` |
| `photo-particles` | media | `src` photo exploded into ~3000 real-colour pixels that reassemble into `to`: `'cloud'` (default) `'grid'` `'ring'` over `dur` (default `'1.8s'`) |
| `zoom-through` | media | infinite log-zoom through nested photos: `srcs: [key, ...]` (outermost first) and `points: [{ p: [x,y], span, at }, ...]` (one entry per `srcs[i+1]`: the pixel point + width in `srcs[i]` where the next photo sits, and the beat/time the camera reaches it); `radius` |

## Transition

`aperture` — 7-blade camera iris centred on `tr.at` (default centre `[0.5,0.5]`): the blades start open beyond the
farthest corner (first frame = outgoing scene), close to a pin-hole at mid-transition and open on the incoming scene
(last frame = incoming scene); blade material + accent edge stroke (`tr.color`, default `a2`). The closed moment is a
dark full-frame dip (one flash on bright scenes). Register: `trans: 'aperture'` on a scene.

## Frame cost (1080p, approximate)

`viewfinder`/`crt`/`detect` < 2 ms (strokes/gradients only). `edges` ~3–5 ms (one recolour pass via a cached
scratch canvas). `thermal` ~4–8 ms (sliced redraw for shimmer). `depthmap` < 2 ms (cover-fit blit of a
precomputed quarter-res canvas). `photo-particles` ~4–6 ms for 3000 fillRects. `zoom-through` < 2 ms (2–5
`drawImage` calls). All well inside the ~60 ms/frame budget. Per-asset Sobel/thermal/depth/particle precompute
runs once in each block's `prepare()`.

## Example storyboard (dark theme, robot-han assets)

```js
var SB = {
  name: 'Demo_vision', bpm: 96, fps: 30, theme: 'dark', aspects: ['16x9', '4x5', '9x16'], lang: 'vi',
  assets: { support1: { src: 'assets/support-01-welding-head.png' }, hero1: { src: 'assets/hero-01-dark.png' },
    steel: { src: 'assets/category-02-steel-fabrication.png' } },
  // media blocks read `src` as an asset key, not a text claim — kv-lint's claim check (kv-lint.mjs line 37)
  // only exempts kind 'photo'/'logo' from requiring SB.sources, so list these keys to keep lint green.
  sources: { support1: 'assets/robot-han (owner-provided)', steel: 'assets/robot-han (owner-provided)' },
  transitions: { default: 'slide' },
  scenes: [
    { id: 'boot', bars: 2, layers: [
      { kind: 'photo', src: 'support1', at: 'stage', focus: [0.5, 0.45] },
      { kind: 'crt', dur: '1.2s' },
      { kind: 'viewfinder', crosshair: true, labels: ['QUÉT 3D'] },
      { kind: 'text', text: 'Mắt AI *AiRobot*', style: 'title', at: 'copy', enter: 'words' }
    ] },
    { id: 'scan', bars: 2, trans: 'aperture', scrim: true, layers: [
      { kind: 'edges', src: 'support1', color: 'a2', mix: 0.12, at: 'stage' },
      { kind: 'detect', at: 'visual', boxes: [{ x: 0.06, y: 0.46, w: 0.4, h: 0.3, label: 'MỎ HÀN', color: 'a2', at: 0 }] },
      { kind: 'text', text: 'Nhận diện *chi tiết*', style: 'title', at: 'copy' }
    ] },
    { id: 'twist', bars: 3, scrim: true, layers: [
      { kind: 'zoom-through', srcs: ['support1', 'hero1', 'steel'], at: 'full',
        points: [{ p: [860, 500], span: 760, at: 1.2 }, { p: [680, 460], span: 900, at: 2.6 }] },
      { kind: 'text', text: 'Lùi qua *từng lớp ảnh*', style: 'title', at: 'copy', in: 2.6 }
    ] }
  ],
  end: { title: 'AiRobot', lines: ['Camera AI 3D minh họa'], bars: 2 }
};
```
