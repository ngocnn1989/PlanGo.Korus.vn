# KV library "weld" — industrial / welding effects

Ported from productions `06_vnj-airobot-ads` and `08_vnj-airobot-nhip-han` (read-only sources) into reusable
tier-2 blocks. Load automatically: any `.js` file under a project's `kv/blocks/` is `<script>`-included after

## Blocks

| Kind | Cat | Props |
|---|---|---|
| `sparks` | fx | `rate` (particles/s, default 90), `dir` (deg, default -90 = up), `spread` (deg cone, default 70), `speed: [min,max]` (px/s, default [250,900]), `gravity` (default 1700), `life: [min,max]` (s, default [0.2,0.6]), `floor` (local y, px, bounce plane), `width`, `scale`, `seed`, `alpha`, `dur` (stop spawning after this) |
| `arc` | fx | `plate` (default true = fill box with scrolling steel), `bead: true` (cooling weld bead trailing the arc), `beadY` (fraction of box height, default 0.14), `speed` (plate scroll multiplier), `scale`, `cool` (bead's cooled colour) |
| `weld-text` | copy | `text`, `style` (title/headline/…, default title), `px` (override), `font` ('head'\|'body'), `color` (cooled colour, default ink), `speed` (chars/s), `tau` (cooling time constant s, default 0.35), `align` |
| `markers` | ui | `items: [{x, y, label}]` (x/y = fractions 0-1 of this layer's own box), `step` (beats between pins, default 0.3), `color`, `r` (px), `legend` (default true), `legendAt` ('left'\|'right'), `legendSize` |
| `stamp` | media | `text` (stamped label), `lead` (anticipation before impact, beats or '0.4s', default 0.35s) |
| `sequencer` | media | `cols`, `rows` (default 4x4), `pattern` (array of 0/1, length cols*rows), `div` (steps per beat, default 4), `color` |
| `kaleido` | fx | `src` (asset key), `segments` (default 10), `speed` (rad/s, default 0.25), `crop` (optional [sx,sy,sw,sh]) |
| `model3d` | media | `parts` (optional; omit for the built-in default weldment), `scan: [inBeat, outBeat]`, `scale`, `yaw`, `pitch`, `spin` (rad/s), `seams` (default true), `grid` (default true), `scanColor`, `edgeColor`, `xRange` |

`markers` reads `x`/`y` as fractions of its **own** layer box — give it the same `pos`/`size` as the photo layer
it annotates (or put both in a `group`) so the fractions line up with the photo underneath.

`weld-text` and `stamp` call `env.note(...)` for their visible text so `kv lint` checks size/contrast/overlap.
`kaleido` never strobes (continuous rotation only) so it can't by itself trip the 3-flashes/s rule.

## Transitions

| Name | Effect |
|---|---|
| `seam` | Weld-seam wipe: white-hot diagonal seam sweeps across (`angle` deg, default 22; `color`), incoming scene revealed behind it, sparks fly off the edge (`seed`). |

## Example storyboard (16:9 / 4:5 / 9:16, all 8 blocks + the transition at least once)

```js
var SB = {
  name: 'W7_weld', bpm: 100, fps: 30, theme: 'steel', aspects: ['16x9', '4x5', '9x16'], lang: 'vi',
  music: { preset: 'industrial', key: 'Am' }, transitions: { default: 'slide' },
  assets: {
    hero: { src: 'assets/hero-01-dark.png', points: { arm: [640, 470] } },
    head: { src: 'assets/support-01-welding-head.png' },
    cat: { src: 'assets/category-01-shipbuilding.png' }
  },
  scenes: [
    { id: 'hook', bars: 2, layers: [
      { kind: 'photo', src: 'hero', at: 'visual', fit: 'cover', focus: 'arm', feather: 120 },
      { kind: 'arc', at: 'visual', bead: true, in: 0 },
      { kind: 'sparks', at: 'visual', pos: [0.5, 0.14], dir: -80, spread: 80, floor: 40, rate: 130, in: 0 },
      { kind: 'weld-text', text: 'Hàn robot AiRobot', style: 'title', at: 'copy', in: 0.3 }
    ] },
    { id: 'system', bars: 3, trans: 'seam', layers: [
      { kind: 'photo', src: 'hero', at: 'visual', fit: 'cover', focus: 'arm' },
      { kind: 'markers', at: 'visual', items: [
        { x: 0.34, y: 0.28, label: 'Camera' }, { x: 0.6, y: 0.42, label: 'Canh tay' }, { x: 0.5, y: 0.7, label: 'Dau han' }
      ] },
      { kind: 'text', text: 'Cấu tạo hệ thống', style: 'headline', at: 'copy' }
    ] },
    { id: 'model', bars: 3, trans: 'seam', layers: [
      { kind: 'model3d', at: 'stage', scan: [0.4, 2.4] },
      { kind: 'text', text: 'Quét 3D đường hàn', style: 'headline', at: 'copy' }
    ] },
    { id: 'stamp', bars: 2, trans: 'seam', layers: [
      { kind: 'bg', style: 'steel' },
      { kind: 'stamp', at: 'stage', size: 0.5, text: '70 kW', lead: 0.4 }
    ] },
    { id: 'seq', bars: 2, trans: 'seam', layers: [
      { kind: 'bg', style: 'steel' },
      { kind: 'sequencer', at: 'stage', size: 0.7, pattern: [1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0] },
      { kind: 'text', text: 'Nhịp hàn theo phách', style: 'headline', at: 'copy' }
    ] },
    { id: 'kaleido', bars: 2, trans: 'seam', layers: [
      { kind: 'kaleido', src: 'cat', at: 'full', segments: 10, speed: 0.3 },
      { kind: 'text', text: 'Ứng dụng đa ngành', style: 'headline', at: 'copy', upper: true }
    ] }
  ],
  end: { title: 'AiRobot', lines: ['Lien he tu van'], cta: 'Nhan tu van', bars: 2 }
};
```
