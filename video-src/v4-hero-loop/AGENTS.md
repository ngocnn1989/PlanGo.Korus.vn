# Video project (KV storyboard mode)

This folder renders a motion-graphics video from `storyboard.js`. Any coding agent (Codex, Antigravity/Gemini,
Claude, Cursor) works the same way: edit data, run one command, read one image per aspect.

## Requirements
Node >= 22, Chrome or Edge, ffmpeg on PATH. No npm install. Check with `node kv.mjs doctor`.

## Workflow (keep token use low)
1. Edit only `storyboard.js` (scenes, text, sound). Everything else is generated or a pinned tool. Ads can start from a
   timed starter: `node <skill>/scripts/kv/kv.mjs init <dir> --name N --template <id> [--len 6|15|30]` (`--template list`).
2. `node kv.mjs legal --draft` — the legal gate (mandatory, exit 1 on any error in on-screen text, `say` lines, captions, CTA).
   `--fix` prints rewrites, `--write` applies them (`.bak` kept). `make` runs it first and stops on an error;
   the final gate (`node kv.mjs legal`, `make` before build, qa) also needs the semantic review below.
3. `node kv.mjs make --until stills` — compile, legal, lint (exit 1 on layout / claim / legal / transition errors),
   score (music + voice), one contact sheet per aspect: `stills/<aspect>/_sheet.png`. Fix and repeat until lint has
   0 errors and the sheets look right. Do not open single frames; do not render video before this is clean.
4. `node kv.mjs make` — legal-final (needs the semantic review below) + full render + QA + README. It takes minutes; run it in the background and wait for exit.
5. `node kv.mjs deliver --preset social,small` (or `make --deliver social,small`) — VMAF/CAMBI-guarded upload files
   `<Name>_<aspect>_social.mp4` / `_small.mp4`; `node qa.mjs --deliver` gates them. Upload these, never the master.
   Small upload with a size target: `--preset compact` (HEVC 10-bit, default 7 MB per 30 s, `--target-mb N`).
6. Late text change: `node patch.mjs --from <seconds>` re-renders only from that time.
7. Report the QA / deliver exit codes and every check (`qa/*_qa.json`, `qa/*_deliver.json`), and what was not
   verified (audio not heard by ear).

## Storyboard in one screen
- `scenes: [{ id, bars, preset | layers, trans, hit, energy }]`, times inside a scene in beats (or `'0.8s'`).
- Tier 1 presets: `hook-title`, `hook-photo`, `title-reveal`, `statement`, `word-card`, `talk`, `feature-photo`,
  `stat-tiles`, `steps`, `recap`, `panels`, `end-simple`, `cta-endcard`; ads: `problem-agitate`, `before-after`,
  `compare`, `testimonial`, `myth-fact`, `question-hook`, `listicle`, `countdown` (`SB.brief` makes ad rules errors;
  `SB.captions: 'burn'` burns captions).
- Tier 2 layers: `bg text shape photo logo illus icon particles glow flash shockwave rays card list chips tiles
  counter button bubble progress group stack` + `bars linechart donut device cursor tap textpath` + ad blocks
  (`kv/blocks/*.md`), with `at` (zone: copy, visual, stage, center, top, lower, safe, full), `pos`, `size`/`w`/`h`,
  `in`/`out`, `enter`/`exit` (+ `ease`: `io`, springs `smooth snappy spring bouncy`, bezier), `keys`, `idle`, `sfx`, `say`.
- Transitions: `trans: 'whip'` or `{ type, beats, dir, align: 'center' }` — built-ins + 41 library types
  (`kv/blocks/trans.md`); hard cuts inside a chapter, one family, ≤ 3 types in a short video (lint warns).
- Motion: scene `cam` (moves, shake, rack focus), `mblur`, `smear`, `sheen`; `--motion reduced` renders a
  reduced-motion cut (`<Name>_rm_<aspect>.mp4`).
- Sound engine 2 (`music: { engine: 2 }`, new projects): motif, build-ups, cadence, voice loudness mix; scene `bed`,
  `build`, `dip`, `trans.sfx`. Read the `LD min/median` line of `kv score` and `score.json`.
- Tier 3: `{ kind: 'custom', draw(ctx, P, env) { ... } }` or `KV.define('name', { draw })` for anything new.
- Per-aspect values: `{ h: <16:9>, f: <4:5>, v: <9:16> }` on any property.
- Illustrations when there are no images: `node kv.mjs illus` renders the catalogue.
- Full reference: skill `kr-motion-video/references/` — kv_framework, transitions, motion_patterns,
  ad_script_templates, legal_compliance, delivery_compression.

## Hard rules
- Legal gate (owner policy): no superlative, absolute, commitment, award or ranking claim anywhere (on-screen text,
  voice, captions, CTA), no political, inciting or obscene wording, prohibited products or foreign-currency prices — the
  term list is `kv/legal/lexicon.json` (guide: skill `references/legal_compliance.md`). `node kv.mjs legal` must exit 0 before build;
  never delete or bypass `kv/legal/`. A name that contains a blocked word needs an exact `SB.legal.names` entry.
- Semantic review (mandatory before build; the gate is lexical, synonyms can pass): `node kv.mjs legal --review-template`
  writes `legal_review.json` (every text unit). Read each unit in its scene; set `verdict: 'ok'` or `'rewrite'` (+ `note`),
  then `reviewer` and `date`. Rewrite flagged units in `storyboard.js` and rerun the template (unchanged texts keep their
  verdict). `make` runs `legal-final` before build and qa FAILs while any unit is new, changed, pending or 'rewrite';
  the review never clears a lexical error. Maps, flags and images: human review (`legal_compliance.md` §6).
- Everything is Node: never call `python` / `python3` (on Windows the Store stub hangs the shell).
- Brand logos are drawn from files (`kind: 'logo'`); never retype or recolour a logo.
- Every number or claim on screen needs `src: '<key>'` with the source in `SB.sources`.
- Original synthesized audio only (or a licensed file the owner supplies in `music.file`).
- 9:16: nothing important below y 1530 or right of x 950 below y 1000 (lint enforces).
