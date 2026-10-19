# Library "gl3d" — real 3D on the GPU inside a KV layer

One block, `scene3d` (cat `media`, default `at: 'full'`, `enter: 'fade'`). It draws a WebGL2 scene into its own
offscreen canvas and composites it into the layer box like any other block, so text, transitions and other blocks
layer over it normally. Look: low-poly toon (cel bands + hard specular + rim), ink outline (inverted hull), optional
"sketch" reveal (paper-white line drawing → colour floods in). Every frame is a pure function of scene time
(deterministic particle seeds): stills, patches and parallel workers match exactly. Loaded automatically from
`kv/blocks/*.js`.

Needs WebGL2: render with the GPU on (`--gpu high`, the default). `--gpu off` makes the block throw.

## Block props

| prop | meaning |
|---|---|
| `camera` | `{ pos: [x,y,z], target: [x,y,z], fov: 40, keys: [{ t, pos?, target?, fov?, ease? }], shake: 0.3, shakeAt: beat, orbit, ortho }` — keys interpolate from the base pose (straight lines: a big move cuts through objects, use `orbit`); `t` in beats or `'1.2s'` from scene start; `ease` = any KV ease (name, `[x1,y1,x2,y2]`, `{ spring }`); `shake` = decaying shake from `shakeAt` (hits) |
| `camera.orbit` | `{ radius: 10, height: 2, yaw: [fromDeg, toDeg], at: [inBeat, outBeat], ease: 'io' }` — the eye travels on a circle around `target` (product orbit / reveal: 30–90° per scene, elevation via `height`); replaces `pos` |
| `camera.ortho` | world height of the view (number) — orthographic projection: parallel lines stay parallel (isometric diagrams, factories, maps); true iso: `pos: [d, d, d]` (yaw 45°, pitch 35.26°) |
| `light` | `{ dir: [-0.5,0.9,0.6], color: '#FFFFFF', ambient: 0.38, rim: 0.35, spec: 0.5, toon: true }` — `toon: false` = smooth shading |
| `ink` | outline colour (default theme `ink`; dark on `tech`/`steel` themes) · `outline: false` disables outlines scene-wide · `outlineW` (0.035 world units) |
| `bg` | clear colour; omit for a transparent layer over the scene background |
| `fog` | `{ color, near: 10, far: 60 }` — depth fade (night skies, distance) |
| `ground` | `{ y: 0, color: 'bg', size: 60 }` — a flat floor plane |
| `reveal` | default reveal for all objects: `'grow'` (scale up with overshoot, default), `'sketch'` (paper + ink → colour), `'fade'`, `'none'` |
| `res` | render scale of the offscreen canvas (1 = layer size; 0.75 for heavy scenes) |
| `clock` | `'scene'` (default: every time counts from the scene start) or `'video'` (every time — `in`, `keys`, `spin`, `bob`, particles — counts from the video start). Use `'video'` for a camera-continuous shot across several scenes: repeat the same `scene3d` layer (same props) in each scene with `enter: 'none'`, so nothing re-grows or jumps at the cuts |
| `objects` | list of objects (below) |
| `groups` | `{ name: { pos, rot, scale, keys, spin, bob, in, grow, out } }` — objects with `group: 'name'` move with it (rocket + window + fins) |
| `particles` | list of particle systems (below) |

## Objects

`{ shape | prefab, pos: [x,y,z], rot: [deg x,y,z], scale: 1 | [x,y,z], color, accent, emissive: 0–1, outline: true | 0.5,
in: beat, grow: beats (1.2), out: beat, reveal, keys: [{ t, pos?, rot?, scale?, ease? }], spin: [deg/s x,y,z], bob: amplitude,
bobPeriod: 2.4, group }`

| shape | size params |
|---|---|
| `box` | `size: s \| [w,h,d]` |
| `sphere` | `r`, `seg` (24) |
| `cylinder` / `cone` | `r`, `h`, `seg` (20) |
| `torus` | `R` (ring), `r` (tube), `seg`, `sides` |
| `plane` | `size: s \| [w,d]` |
| `prism` | `size: [w,h,d]` (triangular roof / fin) |
| `lathe` | `profile: [[radius, y], ...]` bottom → top, `seg` — any turned shape (vase, bottle, bell, rocket body) |

Prefabs (group several shapes; `color` = main, `accent` = trim): `rocket` (2.75 tall, base at y 0), `tree`, `pine`,
`house`, `cloud`, `mountain` (snow cap), `planet` (ringed). Registry: `KV.gl3dPrefabs`; add one in a project file
listed in `SB.scripts` (loaded in the browser after the library; `storyboard.js` itself runs against a stub `KV` in
Node, so registrations there do not reach the page):

```js
// props.js  (SB.scripts: ['props.js'])
KV.gl3dPrefabs.bird = (o, st) => [ // st = the block's time in seconds: animated parts
  { shape: 'sphere', r: 0.2, color: o.color || 'ink' },
  { shape: 'prism', size: [0.5, 0.05, 0.25], pos: [-0.3, 0, 0], rot: [0, 0, 25 * Math.sin(st * 12)] },
  { shape: 'prism', size: [0.5, 0.05, 0.25], pos: [0.3, 0, 0], keys: [{ t: 0, rot: [0, 0, -20] }, { t: 1, rot: [0, 0, 20] }] } ];
```

Prefab parts accept `keys`, `spin` and `bob` like objects.

Colours accept theme tokens (`a1`–`a6`, `ink`, `bg`, `paper` ...) or hex.

## Particles (GPU point sprites, additive glow)

`{ type, n: 3000, center: [x,y,z], color, color2, size, in: beat, out: beat, life: '1.6s', speed, gravity: 3, radius: 40,
spread: 0.25, dir: [0,-1,0], follow: 'group', offset: [x,y,z], seed, blend }`

`seed` (default: the system's index) changes the random pattern, so two bursts with the same `n` differ.
`blend: 'normal'` draws particles as solid dots (visible on paper/white); default additive glow.

| type | behaviour | typical |
|---|---|---|
| `stars` | twinkling shell of radius `radius` around `center` | `n: 4000–8000, radius: 60, size: 0.1` |
| `burst` | one explosion at `center` from `in` (drag + `gravity`), fades over `life`, colour `color` → `color2` | fireworks, impacts: `n: 2000–6000, speed: 6–10, life: '1.4s'` |
| `trail` | continuous exhaust/smoke emitted along the path of group `follow` (+`offset`, path sampled at 32 points over the emission window), drifting along `dir`, grows and fades | rocket flame: `n: 12000–20000, speed: 1.5, life: '0.9s', color: '#FFD27A', color2: '#FF5A3C'` |
| `drift` | floating dust / snow / fireflies in a box of half-size `radius`, moving along `dir` at `speed` (0.3) | ambience: `n: 800–2000, radius: 8` |

`n` is capped at 200 000 per system. Additive blending: many overlapping particles saturate to white — lower `n`,
`size` or use darker `color2` rather than raising counts.

## Example (sketch → world → launch)

```js
{ kind: 'scene3d', at: 'full', reveal: 'sketch', ground: { color: '#F6F1E6' },
  camera: { pos: [0, 3, 11], target: [0, 1, 0], keys: [{ t: 6, pos: [0, 6, 18] }] },
  objects: [
    { prefab: 'mountain', pos: [-4, 0, -5], in: 0 },
    { prefab: 'house', pos: [1.5, 0, 0], in: 1, accent: 'a1' },
    { prefab: 'tree', pos: [-1.2, 0, 1], in: 1.5, bob: 0.03 },
    { prefab: 'rocket', group: 'r', in: 2 } ],
  groups: { r: { pos: [3.5, 0, 0], keys: [{ t: 5 }, { t: 7, pos: [3.5, 14, 0], ease: 'i' }], spin: [0, 40, 0] } },
  particles: [
    { type: 'trail', follow: 'r', in: 5, n: 16000, speed: 1.5, life: '0.9s', color: '#FFD27A', color2: '#FF5A3C' },
    { type: 'burst', center: [3.5, 14, 0], in: 7, n: 4000, color: '#FFFFFF', color2: 'a2' } ] }
```

(`ease: 'i'` = accelerate; the older example's `'in'` was not an ease name and silently fell back to `io`.)

## Orbit and orthographic views

```js
// product orbit: 80° around the rocket in one scene, eye 3 units up; spin adds a slow turntable (10 s / turn)
{ kind: 'scene3d', at: 'visual', ground: { color: '#F6F1E6' },
  camera: { target: [0, 1, 0], orbit: { radius: 9, height: 3, yaw: [-30, 50], at: [0, 8] } },
  objects: [{ prefab: 'rocket', accent: 'a1', spin: [0, 36, 0] }] }
// isometric diagram: orthographic camera on the [1, 1, 1] diagonal, 9 world units tall
{ kind: 'scene3d', at: 'visual', camera: { pos: [10, 10, 10], target: [0, 0.5, 0], ortho: 9 }, ground: { color: '#E9EEF6', size: 8 },
  objects: [{ shape: 'box', size: [1.5, 1, 1.5], pos: [-1.5, 0.5, 0], color: 'a4' }, { prefab: 'house', pos: [1, 0, 1.5] }] }
```

Turntable speed: one turn in 8–12 s for product detail, ~30 s for ambient; orbit 30–90° per scene, elevation 15–30°.

## Frame cost (1080p, RTX 3050 Laptop via `--gpu high`)

Scene of ~20 objects + 26 000 particles: 2–4 ms JavaScript + GPU work that overlaps the frame read-back. It is far
cheaper than equivalent canvas-2D particle effects. One WebGL context is created per canvas size and reused across
frames and scenes; meshes are cached per shape+size.

## Pitfalls

| Symptom | Fix |
|---|---|
| Object inside-out or invisible faces | custom `lathe` profiles must run bottom → top |
| Colour does not appear during `sketch` | the colour floods in over the second half of `grow`; lengthen `grow` or use `reveal: 'grow'` |
| Trail drawn where the group has not been yet | set the trail's `in`/`out` to the group's flight window (the path is sampled over it) |
| Objects re-grow / `spin` jumps at every cut of a continuous shot | `clock: 'video'` + `enter: 'none'` on the repeated layer; or `in: '-1000s'` for items that already exist |
| Keys: object sits at its first key from time 0 | fixed: before the first key the object moves from its base pose (`pos`/`rot`/`scale`) at time 0 |
| Particles invisible on white paper | `blend: 'normal'` or emissive geometry |
| White blow-out in bursts/trails | lower `n`/`size`, darker `color2` |
| Block throws "WebGL2 unavailable" | render without `--gpu off`; check `kv doctor` (browser renderer line) |
