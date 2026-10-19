/* KV transition metadata — the ONE data source for every transition name (runtime built-ins, library, GL).
 * Browser: sets KV.TRANS_META (blocks load after kv-runtime.js). Node: require('./blocks/trans-meta.js') returns the
 * table; node:vm (no `module` in the context) sets KV.TRANS_META on the context's global. No DOM access at load.
 * Readers (integration): kv-core default duration, kv-score transition SFX, kv-lint rules 1–15, references/transitions.md.
 * Fields (defaults filled in below):
 *   beats    default duration in beats (0 = instantaneous) — used when the scene's `trans.beats` is absent
 *   range    [min, max] beats that read well (rule 3) · long: true = hold-type, exempt from the 2-beat ceiling
 *   family   neutral | cut | motion | wipe | light | distortion | dissolve | liquid | 3d | brand | social (rule 2)
 *   cutAt    'start' = B is on screen from k = 0 (cut types, already on the beat) · 'mid' = the swap reads at the middle,
 *            so a beat-synced cut needs align: 'center' (rule 4)
 *   sfx      [{ name, lead, gain }] — name from the kv-score FX table; lead = where the sound peaks / lands inside the
 *            window as a fraction of d (0 start, 0.5 middle, 1 end; FX pre-roll whoosh/riser/swell themselves);
 *            gain multiplies the FX default (0.65 whoosh ≈ today's built-in transition whoosh level). [] = silent.
 *   flashes  full-frame flashes produced at default params (rule 6, ≤ 3 per 1-s window) · flashIf: 'light-color'
 *            (+1 when the resolved `color` is light) | 'param:flash' | 'mode:close' | 'mode:solid' | 'dark-close'
 *            (closes to a dark full frame mid-way: +1 on bright / light themes)
 *   gl       true = WebGL2 shader (trans-gl.js) · fallback = 2D type drawn without WebGL2
 *   dir      true = takes left/right/up/down `dir` (rule 5) · dflt = default dir (per aspect object allowed)
 *   vest     vestibular-heavy (rule 9) · kids 'good' | 'ok' | 'avoid' (warn) | 'no' (error) (rule 13)
 *   pattern  regular light/dark pattern risk (rule 8) · swap { rate Hz, area } alternating A/B slices (rule 7)
 *   params   defaults of the type's own options (docs + lint typo guard) · src: where the code lives
 *   notes    R = full scene renders per frame, S = full-size scratch canvases (cost), plus usage notes
 */
(function (root) {
  'use strict';
  const S = (name, lead = 0.5, gain = 1) => ({ name, lead, gain });
  const AT = [0.5, 0.5];
  const M = {
    // ------------------------------------------------------------ runtime built-ins (kv-runtime.js transition()/frame())
    cut: { beats: 0, range: [0, 0], family: 'neutral', cutAt: 'start', kids: 'good', src: 'runtime', notes: 'R1. Default boundary; `hit: true` adds breath + crash + boom.' },
    flash: { beats: 0, range: [0, 0], family: 'light', cutAt: 'start', sfx: [S('crash', 0, 0.6)], flashes: 1, kids: 'avoid', params: { color: '#FFFFFF' }, src: 'runtime', notes: 'R1. 0.25 s white overlay on the cut; never red.' },
    fade: { beats: 1, range: [1, 4], family: 'neutral', src: 'runtime', kids: 'good', notes: 'R2. Linear crossfade; avoid text-on-text (rule 11).' },
    dip: { beats: 1, range: [1, 4], family: 'neutral', flashIf: 'light-color', kids: 'good', params: { color: 'bg' }, src: 'runtime', notes: 'R1. Dip to a light colour = 1 flash pair.' },
    slide: { beats: 0.75, family: 'motion', dir: true, sfx: [S('swoosh', 0.5, 0.7)], params: { dir: 'left' }, src: 'runtime', notes: 'R2 (no scratch). Push.' },
    wipe: { beats: 0.75, family: 'wipe', dir: true, sfx: [S('swoosh', 0.5, 0.7)], params: { dir: 'left', color: 'a1' }, src: 'runtime', notes: 'R2. Straight edge + accent bar.' },
    iris: { beats: 1, range: [0.75, 2], family: 'wipe', kids: 'good', flashIf: 'mode:close', sfx: [S('whoosh', 0.5, 0.65)], params: { at: AT, color: 'a1', ring: true, mode: 'open' }, src: 'trans.js',
      notes: 'R2 (close: R1). Library override of the built-in: radius reaches the farthest corner from `at` (no end pop).' },
    zoom: { beats: 0.75, range: [0.5, 1.5], family: 'motion', vest: true, sfx: [S('whoosh', 0.5, 0.65)], src: 'runtime', notes: 'R2. Kept for old videos: B scales DOWN while A flies forward — prefer zoomin / zoomout.' },
    band: { beats: 1, family: 'brand', flashIf: 'light-color', sfx: [S('swoosh', 0.5, 0.7)], params: { color: 'a1', color2: 'a2' }, src: 'runtime', notes: 'R1. Swap under the top panel.' },
    // ------------------------------------------------------------ other library files
    aperture: { beats: 0.75, range: [0.75, 2], family: 'wipe', flashIf: 'dark-close', sfx: [S('click', 0, 0.6), S('whoosh', 0.5, 0.65)], params: { at: AT, color: 'a2' }, src: 'vision.js', notes: 'R2. 7-blade camera iris (camera / AI brands): closes over A to dark, opens on B = 1 flash on bright themes.' },
    seam: { beats: 0.75, family: 'wipe', sfx: [S('crackle', 0, 0.8), S('whoosh', 0.5, 0.65)], params: { angle: 22, color: 'a1', seed: 0 }, src: 'weld.js', notes: 'R2. Weld seam + sparks; signature move, ≤ 3 per video.' },
    // ------------------------------------------------------------ trans.js — cut grammar
    smash: { beats: 0.5, range: [0.25, 1], family: 'cut', cutAt: 'start', flashIf: 'param:flash', kids: 'avoid', sfx: [S('boom', 0, 0.7), S('crash', 0, 0.6)],
      params: { amp: 18, punch: 0.05, flash: false, color: '#FFFFFF' }, notes: 'R1. Contrast / comedy cut; pair with scene `hit: true`.' },
    match: { beats: 1, range: [0.75, 2], family: 'cut', sfx: [S('swell', 0.5, 0.8)], params: { from: [0.5, 0.5, 1], to: [0.5, 0.5, 1], xf: 0.15 }, notes: 'R1–2 (2 while dissolving). from/to = [x, y, size], keep size ratio ≤ 1.5.' },
    jlcut: { beats: 0, range: [0, 0], family: 'cut', cutAt: 'start', kids: 'good', params: { lead: 0, tail: false }, notes: 'R1. Picture = cut; lead (beats, J-cut: scene-level say / sfx of B start early, <= 1 bar) / tail (beats, true = 1; L-cut: A voice may run past the cut) act on sound (kv-core events, kv-lint bounds).' },
    jump: { beats: 1, range: [0.5, 2], family: 'social', cutAt: 'start', params: { s: 1.12, at: AT }, notes: 'R1. Punch-in on the SAME subject; scale eases back (oX).' },
    // ------------------------------------------------------------ trans.js — motion
    cover: { beats: 0.75, family: 'motion', dir: true, sfx: [S('swoosh', 0.5, 0.7)], params: { dir: 'left', dim: 0.25 }, notes: 'R2. B slides over a dimming A.' },
    reveal: { beats: 0.75, family: 'motion', dir: true, sfx: [S('swoosh', 0.5, 0.7)], params: { dir: 'left', dim: 0.25 }, notes: 'R2. A slides away from B (pair with cover = forward/back).' },
    whip: { beats: 0.5, range: [0.25, 1], family: 'motion', dir: true, vest: true, sfx: [S('whoosh', 0.5, 0.75)], params: { dir: 'left', blur: 0.35, taps: 10 }, notes: 'R2 S1, 2×taps blits. Use align center on a beat.' },
    zoomin: { beats: 0.75, range: [0.5, 1.5], family: 'motion', vest: true, sfx: [S('whoosh', 0.5, 0.65)], params: { at: AT, s: 2.2, from: 0.85, blur: 1 }, notes: 'R2 S1, 6 stamps. Fly-through forward.' },
    zoomout: { beats: 0.75, range: [0.5, 1.5], family: 'motion', vest: true, sfx: [S('whoosh', 0.5, 0.65)], params: { at: AT, s: 2.2, from: 0.85, blur: 1 }, notes: 'R2 S1, 6 stamps. Pull back (reverse of zoomin).' },
    spin: { beats: 0.75, range: [0.5, 1.5], family: 'motion', vest: true, sfx: [S('whoosh', 0.5, 0.65)], params: { angle: 90, dir: 'cw', at: AT, zoom: 0.3, cover: false, color: 'bg' }, notes: 'R1 S1, 6 stamps. angle ≤ 180.' },
    smear: { beats: 0.5, range: [0.25, 1], family: 'motion', dir: true, kids: 'good', sfx: [S('swoosh', 0.5, 0.7)], params: { dir: 'left', amount: 3, color: 'bg' }, notes: 'R1. Cartoon smear; kids: add boing at the end.' },
    // ------------------------------------------------------------ trans.js — wipes & shape masks
    clock: { beats: 1.5, range: [1, 4], family: 'wipe', kids: 'good', sfx: [S('tick', 0.25, 0.6), S('tick', 0.5, 0.6), S('tick', 0.75, 0.6)],
      params: { at: AT, dir: 'cw', n: 1, hand: true, color: 'a1' }, notes: 'R2. Time passing; n > 6 = regular pattern.' },
    barn: { beats: 1, family: 'wipe', dir: true, dflt: { h: 'left', s: 'left', f: 'left', v: 'up' }, sfx: [S('whoosh', 0.5, 0.65)], params: { dir: 'left', depth: false, color: '#000' }, notes: 'R2. Grand reveal; 9:16 splits vertically.' },
    blinds: { beats: 1, family: 'wipe', dir: true, dflt: 'down', pattern: true, sfx: [S('swoosh', 0.5, 0.7)], params: { n: 8, dir: 'down', stagger: 0.4, angle: 0 }, notes: 'R2. n ≤ 10.' },
    checker: { beats: 1, family: 'wipe', kids: 'good', pattern: true, sfx: [S('blip', 0.15, 0.8), S('blip', 0.35, 0.8), S('blip', 0.55, 0.8), S('blip', 0.75, 0.8)],
      params: { cell: 0.125, mode: 'random', seed: 0 }, notes: 'R2. Modes random | checker | diag; cell ≥ 0.06.' },
    shape: { beats: 1.5, range: [1, 3], family: 'wipe', kids: 'good', sfx: [S('boing', 0, 0.7), S('sparkle', 1, 0.8)], params: { shape: 'star', at: AT, spin: 0.6, cover: null, color: 'a1' }, notes: 'R2. star | heart | diamond; cover = end size / farthest-corner distance (auto 2.45 / 2.45 / 1.5).' },
    // ------------------------------------------------------------ trans-fx.js — light, distortion, dissolve, liquid
    leak: { beats: 1.5, range: [1, 3], family: 'light', flashes: 1, sfx: [S('swell', 0.5, 0.8)], params: { colors: ['#FF7A1A', '#FFC24A', '#FF3D6E'], amount: 0.7, seed: 0, mode: 'leak' },
      notes: 'R1 (R2 while swapping, k 0.35–0.65). amount ≥ 0.6 counts as a flash. mode sweep = flare band.' },
    burn: { beats: 1.5, range: [1, 3], family: 'light', dir: true, dflt: 'left', kids: 'no', flashes: 1, sfx: [S('crackle', 0, 0.8), S('swell', 1, 0.8)], params: { color: '#FF8A2A', res: 8, seed: 0, dir: 'left' },
      notes: 'R2 S1 + 2 small fields (noise cached). The hot rim lifts mean luminance ≈ +0.19 = 1 flash. Vintage / music only.' },
    glitch: { beats: 0.5, range: [0.25, 1], family: 'distortion', kids: 'no', swap: { rate: 12, area: 0.1 }, sfx: [S('glitch', 0, 0.7)], params: { rate: 12, amount: 1, seed: 0, split: 14 },
      notes: 'R2 S2 (snapA + channel scratch), 3 multiply passes. Swapped area ≈ 10 %.' },
    datamosh: { beats: 1, family: 'distortion', kids: 'no', sfx: [S('glitch', 0, 0.7), S('swell', 1, 0.8)], params: { block: 0.04, amount: 0.6, seed: 0 }, notes: 'R2 S1, ~350 block blits. No readable text.' },
    pixelate: { beats: 1, family: 'distortion', sfx: [S('blip', 0, 0.8), S('blip', 1, 0.8)], params: { cell: 0.05 }, notes: 'R1 + 1 small scratch. Swap at the coarsest point.' },
    tvoff: { beats: 1, family: 'distortion', flashes: 1, kids: 'no', sfx: [S('buzz', 0, 0.6), S('zap', 0.4, 0.7)], params: { on: true }, notes: 'R1. Signals an ending; dark → B counts as 1 flash on bright scenes.' },
    dither: { beats: 1, family: 'dissolve', pattern: true, sfx: [S('blip', 0, 0.8), S('blip', 1, 0.8)], params: { px: 6, ramp: null }, notes: 'R2 + small field. px ≥ 4, d ≥ 0.5 s.' },
    noise: { beats: 1, family: 'dissolve', sfx: [S('swell', 1, 0.8)], params: { scale: 0.08, soft: 0.08, res: 6, grain: false, seed: 0 }, notes: 'R2 + small field (noise cached).' },
    luma: { beats: 1.5, range: [1, 3], family: 'dissolve', sfx: [S('swell', 1, 0.8)], params: { map: 'radial', soft: 0.1, invert: false, res: 4 }, notes: 'R2 (map A/B: R3 + one small readback; radial / plate maps cached). Plates must be owner-supplied.' },
    defocus: { beats: 1, family: 'dissolve', sfx: [S('swell', 0.5, 0.5)], params: { amount: 28 }, notes: 'R2, two GPU blur filters (slow with --gpu off).' },
    goo: { beats: 1.5, range: [1, 3], family: 'liquid', kids: 'good', sfx: [S('boing', 0, 0.7), S('pop', 0.5, 0.7)], params: { n: 6, res: 8, seed: 0 }, notes: 'R2 + small field (metaball sum, early exit).' },
    // ------------------------------------------------------------ trans.js — liquid, 3D & paper, brand, social
    ink: { beats: 1.5, range: [1, 3], family: 'liquid', kids: 'good', flashIf: 'light-color', sfx: [S('swoosh', 0, 0.7)], params: { n: 5, splash: false, color: null, seed: 0 }, notes: 'R2. color = paint layer leads B (covers the frame: a light colour on a dark theme = 1 flash).' },
    morph: { beats: 1.5, range: [1, 3], family: 'liquid', sfx: [S('whoosh', 0.5, 0.65), S('pop', 1, 0.7)], params: { from: { at: AT, w: 0.18, h: 0.18, r: 1 }, color: 'bg' }, notes: 'R2. Container transform; from per aspect.' },
    flip: { beats: 1, family: '3d', dir: true, vest: true, kids: 'good', sfx: [S('swoosh', 0.5, 0.7)], params: { dir: 'left', color: 'bg' }, notes: 'R1, 32 perspective strips.' },
    peel: { beats: 1.5, range: [1, 3], family: '3d', kids: 'good', sfx: [S('swoosh', 0.5, 0.7)], params: { angle: 215, paper: '#F4F1EA' }, notes: 'R2. Straight fold; angle per aspect allowed.' },
    fold: { beats: 1, family: '3d', dir: true, dflt: { h: 'left', s: 'left', f: 'left', v: 'up' }, pattern: true, sfx: [S('click', 0.3, 0.6), S('click', 0.6, 0.6)], params: { n: 6, dir: 'left' }, notes: 'R2. n ≤ 8 (stripes).' },
    shatter: { beats: 1.5, range: [1, 3], family: '3d', kids: 'avoid', sfx: [S('shatter', 0, 0.8)], params: { cell: 0.1, at: AT }, notes: 'R2, ≤ 60 tiles. Once per video.' },
    typefill: { beats: 1.5, range: [1, 3], family: 'brand', flashIf: 'mode:solid', sfx: [S('whoosh', 0.7, 0.65), S('riser', 1, 0.8)],
      params: { text: 'GO', at: AT, focus: null, zoom: 40, mode: 'window', color: 'a1', font: 'head', weight: 900 }, notes: 'R2 S1. Auto focus = deepest stroke point; check diacritics.' },
    logo: { beats: 2, range: [1.5, 3], family: 'brand', sfx: [S('riser', 1, 0.8), S('chime', 1, 0.6)], params: { mark: 'mark', focus: null, size: 0.25, zoom: 30, at: AT },
      notes: 'R2 S1. Owner mark only (BRAND.mark); no mark = crossfade.' },
    swipe: { beats: 0.75, family: 'social', dir: true, dflt: { h: 'left', s: 'left', f: 'up', v: 'up' }, vest: true, sfx: [S('swoosh', 0.4, 0.7), S('click', 1, 0.5)], params: { dir: null, gap: 24, spring: 1.2, color: '#000' },
      notes: 'R2 S1. Feed flick; vertical by default on 4:5 / 9:16.' },
    punch: { beats: 0.75, range: [0.5, 1], family: 'social', vest: true, kids: 'avoid', sfx: [S('whoosh', 0.5, 0.65), S('kick', 0.5, 0.6)], params: { s: 1.4, at: AT }, notes: 'R1 S1, 6 stamps. Align center on the drop.' },
    split: { beats: 4, range: [2, 8], long: true, family: 'social', sfx: [S('swoosh', 0.17, 0.7), S('swoosh', 0.83, 0.7)], params: { hold: 0.3, color: 'ink' }, notes: 'R2 S1. Before/after; centre-cropped halves.' },
    // ------------------------------------------------------------ trans-gl.js — WebGL2 (own shaders), 2D fallback without WebGL2
    ripple: { beats: 1.5, range: [1, 3], family: 'distortion', gl: true, fallback: 'fade', vest: true, sfx: [S('swell', 0.5, 0.8)], params: { amplitude: 40, strength: 0.03, swirl: 0, gl: true }, notes: 'R2 + 2 texture uploads. Dream / flashback / water.' },
    kaleido: { beats: 1.5, range: [1, 3], family: 'distortion', gl: true, fallback: 'spin', vest: true, sfx: [S('sparkle', 0.5, 0.8)], params: { segments: 6, twist: 1, gl: true }, notes: 'R2 + 2 uploads. Music / magic moments, rarely.' },
    cube: { beats: 1, family: '3d', gl: true, fallback: 'flip', dir: true, dflt: { h: 'left', s: 'left', f: 'left', v: 'up' }, vest: true, sfx: [S('whoosh', 0.5, 0.65)], params: { dir: 'left', depth: 1.6, color: '#000', gl: true },
      notes: 'R2 + 2 uploads. True perspective box turn; ≤ 2 per video.' }
  };
  const D = { range: [0.5, 2], cutAt: 'mid', sfx: [], flashes: 0, flashIf: null, gl: false, fallback: null, dir: false, dflt: null, vest: false, kids: 'ok', pattern: false, swap: null, long: false, params: {}, src: 'trans.js', notes: '' };
  const FX = ['leak', 'burn', 'glitch', 'datamosh', 'pixelate', 'tvoff', 'dither', 'noise', 'luma', 'defocus', 'goo'];
  for (const [name, m] of Object.entries(M)) {
    for (const [f, v] of Object.entries(D)) if (m[f] === undefined) m[f] = v;
    if (m.gl && m.src === 'trans.js') m.src = 'trans-gl.js';
    if (FX.includes(name)) m.src = 'trans-fx.js';
    m.name = name;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = M;
  else { const KV = (root.KV = root.KV || {}); KV.TRANS_META = Object.assign(KV.TRANS_META || {}, M); }
})(typeof window !== 'undefined' ? window : globalThis);
