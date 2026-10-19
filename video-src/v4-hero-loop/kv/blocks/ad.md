# Library "ad" — blocks for advertising scripts

Tier-2 blocks used by the ad presets (`scripts/kv/kv-presets-ad.js`) and the starters in `scripts/kv/templates/ads/`.
Loaded automatically after `kv-blocks.js` (every `kv/blocks/*.js`). Script rules, templates and the claims table:
`references/ad_script_templates.md`. Times named `*At` are **scene time** (beats or `'0.8s'`), like `in`.

## Blocks

| kind | cat | props |
|---|---|---|
| `footnote` | copy | Source / proof / terms line in the `lower` zone (default `pos [0.5, 0.86]`). Text: `note` (string, not counted in words/s), or `src` = a claim key → object source `proof { doc, no, date }` prints `doc · số no · date` (EN `No.`), else `cite` / `doc` / `text`; string sources print as written. `prefix` (default `Nguồn: ` / `Source: ` for `src`, none for `note`), `px` (default 30 on 16:9, 32 on 4:5 / 9:16 — above the lint minimum), `maxLines` 2, `chars` (line length, default 56), `color` / `bgColor` (default `cardInk` on `card`, a box behind the text for contrast on photos). Keep it on screen ≥ 2 s. |
| `captions` | ui | Burns the `say` lines as timed captions (sound-off parity). Lines and lengths come from `vo.js` (measured by `kv score`) or are estimated (vi 4.5, other 2.6 words/s + 0.3 s). A line longer than `maxChars` (84 = two lines of ~42) is split into balanced chunks timed by length. Default: the scene's own lines (`all: true` = any line playing). `px` (44 / 48), `pos` (default `[0.5, 0.92]` of `lower`, anchored at the bottom), `bgColor` (default `rgba(8,10,14,0.8)`), `color` (white). Moves up above a `footnote` in the same scene. `SB.captions: 'burn'` draws it on every content scene (runtime auto-layer); scene `captions: false` opts out. |
| `strike` | copy | A `text` layer (all `text` props) with a strike-through drawn across each line from `strikeAt` (default 2 beats) over `strikeDur` (`'0.45s'`); `strikeColor` (default red). Myths, the old way. |
| `badge` | media | Disc with `mark`: `'?'` (default), `'check'`, `'cross'` or ≤ 3 characters; `flip` = the mark shown after `flipAt` (card flip over `flipDur`, `'0.35s'`); `fill` / `flipFill` (theme colour names or CSS), `color` (mark; default the readable ink for the fill), `ring` (default `card`, `false` = none). Used by `question-hook` ("?" → check when the answer lands). |
| `vs` | media | Divider disc between two compared panels: `mark: 'arrow'` (default; old → new) with `dir` `right` / `down` / `left` / `up`, or `mark: 'vs'` ("VS"); `fill` (default `a1`), `ring`. |
| `quotemark` | media | Opening quotation marks drawn as shapes in `color` (default `a1`); `close: true` = closing marks. |
| `reveal` | media | Before / after: `layers: [before, after]` drawn in the block's box; `after` is wiped in from the left at `wipeAt` (default 2 beats) over `dur` (`'0.8s'`) up to `to` of the width (1 = wipe, 0.5 = slider with a handle); accent divider line `color` (default `a1`). Children are layers (photo, illus, group …); give both photos the same framing. Each side is clipped to its part of the box, `before` disappears once a full wipe ends, so transparent illustrations never show through each other. |

## Notes

- Lint sees every text these blocks draw (`env.note`): overlap, 9:16 UI zones, size and contrast are measured as usual.
  Captions are checked only on the probe frames that fall inside a spoken line.
- `KV.sourceNote(key)` returns the footnote text for a claim key; `KV.captionChunks(text, max)` the caption chunks.
- Frame cost: all blocks are a few paths and one text layout (< 1 ms at 1080p); `reveal` draws each child at most once per frame.

## Example

```js
{ id: 'test', bars: 3, src: 'sTest', layers: [
  { kind: 'reveal', at: 'full', wipeAt: 2, layers: [{ kind: 'photo', src: 'before', fit: 'cover' }, { kind: 'photo', src: 'after', fit: 'cover' }] },
  { kind: 'strike', text: '“<Câu hiểu lầm>”', style: 'headline', at: 'copy', strikeAt: 1 },
  { kind: 'badge', at: 'visual', pos: [0.85, 0.15], size: 0.2, mark: '?', flip: 'check', flipAt: 4 },
  { kind: 'footnote', src: 'sTest', in: 0.5 } ] }
```
