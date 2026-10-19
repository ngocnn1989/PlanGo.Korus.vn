# Library "chart" — data graphics that stay true while they animate

Blocks `bars` (column / row chart, plus `race` mode), `linechart` and `donut` (cat `media`, `enter: 'fade'`). Loaded
automatically from `kv/blocks/*.js`. Built-in rules (from animated-transition research, Heer & Robertson 2007):

- the axis / baseline appears first, then the values, one mark after another in reading order;
- a mark never shows a wrong value: every value ease is clamped to 0..1, so `spring`, `oB`, `elastic`, `bouncy` cannot overshoot and
  `anticipate`, `iB` cannot dip below the baseline (lint still warns `overshoot`: the clamp flattens them — prefer `o` / `io`);
- numbers count with their mark (same ease) and stay fixed after it lands;
- every label is reported with `env.note`, so `kv lint` checks its size (≥ 26 / 28 px), contrast and overlap on every aspect;
- numbers need a source: give the layer `src: 'key'` (key in `SB.sources`).

Hold a clean final frame ≥ 1.5 s (animated trends are harder to read than a static chart — Robertson et al. 2008).

## `bars`

| prop | default | meaning |
|---|---|---|
| `items` | — | `[{ label, value, color }]` in reading order |
| `max` | largest value | top of the scale |
| `step` | `'0.1s'` | delay between bars (60–120 ms) |
| `grow` | `'0.8s'` | grow time per bar (0.6–1 s, decelerating) |
| `lead` | `'0.25s'` | axis before the first bar |
| `ease` | `o` | grow ease (clamped at 1) |
| `prefix` `suffix` `decimals` | | value labels |
| `horizontal` | false | rows (labels left, values at the bar end) |
| `barW` | 0.62 | bar thickness as a share of its slot |
| `color` / `colors` | `a1` | one colour (highlight one bar with its own `color`) |
| `axis` `labelColor` | `muted` / `ink` | |

≤ 6–8 bars for social video; on 9:16 put the chart in `visual` (900 px wide) so labels stay ≥ 28 px.

```js
{ kind: 'bars', at: 'visual', src: 'c1', suffix: '%', step: '0.12s',
  items: [{ label: '2022', value: 19 }, { label: '2023', value: 26 }, { label: '2024', value: 31, color: 'a2' }] }
```

### Race mode

`race: { frames: [[value per item] per period], periods: ['2021', ...], perPeriod: 1 (beats), top: 8, periodColor }` —
horizontal rows re-rank every period; values and ranks interpolate (`io` inside each period), the scale follows the
leader, each item keeps its colour (`items[i].color`, else `a1..a6`), the row leaving the top N fades out, and the period
label sits bottom-right. Item names sit inside the bar when it is long enough. ≤ 10–15 items, ~0.5–1.5 s per period.
Rows crossing mid-swap are not reported to lint (they overlap for a moment by design).

```js
{ kind: 'bars', at: 'visual', src: 'c1', race: { periods: ['2021', '2022', '2023'], perPeriod: 3, top: 4,
  frames: [[10, 30, 20], [25, 32, 21], [40, 33, 26]] }, items: [{ label: 'Alpha' }, { label: 'Beta' }, { label: 'Gamma' }] }
```

## `linechart`

| prop | default | meaning |
|---|---|---|
| `series` | — | `[{ values, color, label }]` (≤ 3; drawn one after another) |
| `xLabels` | — | category labels under the axis (thinned automatically when crowded) |
| `min` / `max` | 0 / nice ticks | y range (auto range starts at 0 for positive data) |
| `grid` | 4 | ~number of y intervals (1-2-5 steps) |
| `draw` | `'2s'` | draw time per series (1.2–2.5 s) |
| `seriesStep` | = `draw` | delay between series |
| `ease` | `io` | draw ease (`lin` = constant speed in x, reads as time) |
| `area` | false | gradient fill, fades in after the series is drawn |
| `marks` | — | `[{ i, label, series: 0, dir: -1 \| 1, color }]` annotation ring + label half a beat after the line passes point `i` |
| `tag` | true | value tag above the glowing head (`tagColor`, default `ink`) |
| `prefix` `suffix` `decimals` `lw` (6) `gridColor` `yLabels: false` | | |

```js
{ kind: 'linechart', at: 'visual', src: 'c2', suffix: '%', area: true, draw: 4,
  series: [{ values: [9, 8, 8.5, 6, 4.2, 3], color: 'a1' }], xLabels: ['Q1', 'Q2', 'Q3', 'Q4', 'Q1', 'Q2'], marks: [{ i: 3, label: 'Robot line' }] }
```

## `donut`

| prop | default | meaning |
|---|---|---|
| `items` | — | `[{ value, label, color }]` (≤ 5 segments; angle ∝ value) |
| `thickness` | 0.24 | ring thickness as a share of the radius (0.18–0.28) |
| `sweep` | `'1.2s'` | total clockwise sweep from 12 o'clock (`io`) |
| `gap` | 1.2 | degrees between segments |
| `labels` | true | `label NN%` outside each segment once it is complete (`percent: false` = the raw value) |
| `center` | — | `true` (total), a string, or `{ value, prefix, suffix, decimals, label, color }` counting with the sweep |

```js
{ kind: 'donut', at: 'visual', src: 'c3', center: { value: 72, suffix: '%', label: 'arc on' },
  items: [{ value: 72, label: 'Arc' }, { value: 18, label: 'Setup' }, { value: 10, label: 'Idle' }] }
```

A single progress ring is still `{ kind: 'shape', shape: 'ring', value: 0.72, enter: 'draw' }` + a `counter`.

## Pitfalls

| Symptom | Fix |
|---|---|
| lint `claim` warning | add `src` (chart numbers are claims) |
| labels < 28 px on 9:16 | fewer bars, `horizontal: true`, or the `visual` / `stage` zone |
| value tag hides the line end | `tag: false` and annotate with `marks` |
| bars jump when values change scale | set `max` explicitly so every scene shares one scale |
