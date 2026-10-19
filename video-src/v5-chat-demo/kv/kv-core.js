/* KV core — storyboard (SB) -> timing. Shared by the browser runtime and the Node CLI (UMD, no DOM).
 * Times inside a scene are beats (number) or strings: '0.8s' seconds, '2b' beats, '1bar' bars.
 * compile(SB) returns the timeline TL used by picture, sound, lint, render, qa:
 *   { fps, dur, bpm, beat, bar, scenes[], S{id:[t0,t1]}, events[], kicks[], audioGaps[], mixRef, words[] }
 */
(function (root) {
  'use strict';
  const KVC = {};
  KVC.ASPECTS = {
    '16x9': { w: 1920, h: 1080, A: 'h' }, '4x5': { w: 1080, h: 1350, A: 'f' },
    '9x16': { w: 1080, h: 1920, A: 'v' }, '1x1': { w: 1080, h: 1080, A: 's' }
  };
  KVC.aspectKey = (W, H) => W > H * 1.2 ? 'h' : H > W * 1.5 ? 'v' : H > W * 1.1 ? 'f' : 's';
  // transition defaults in beats (0 = instantaneous)
  KVC.TRANS = { cut: 0, flash: 0, fade: 1, dip: 1, slide: 0.75, wipe: 0.75, iris: 1, zoom: 0.75, band: 1 };
  // transition metadata (kv/blocks/trans-meta.js): default beats of library types. Node: require beside this file; browser:
  // KV.TRANS_META (blocks load before KV.boot compiles). Same file both sides, so picture and sound get the same timeline.
  KVC.transMeta = () => {
    if (KVC._tm) return KVC._tm; let m = null;
    try { if (typeof module !== 'undefined' && module.exports && typeof require === 'function') m = require(require('path').join(__dirname, 'blocks', 'trans-meta.js')); } catch (e) { m = null; }
    m = m || (root.KV && root.KV.TRANS_META) || null; if (m) KVC._tm = m; return m || {};
  };
  // sound names understood by kv-score.mjs (kept in sync with its FX table; kv lint warns on others)
  KVC.SFX = ['pop', 'boing', 'sparkle', 'chime', 'ding', 'bell', 'tada', 'coin', 'whoosh', 'swoosh', 'click', 'tick', 'blip', 'beep', 'type', 'laser', 'zap', 'crackle', 'stamp', 'boom', 'crash', 'shatter', 'riser', 'swell', 'glitch', 'buzz', 'power', 'sonar', 'clap', 'kick', 'snare', 'shepard', 'drop', 'braam'];
  // tonal stingers: snapped to the 16th grid (within 40 ms) by default in sound engine 2; hero = rare, prominent sounds
  KVC.TONAL = ['chime', 'ding', 'bell', 'sparkle', 'tada', 'coin', 'pop', 'blip', 'beep'];
  KVC.HERO = ['tada', 'sparkle', 'boom', 'crash', 'shatter', 'stamp', 'braam'];
  // sound engine: 1 = classic score (finished projects stay bit-identical), 2 = music.engine: 2 (kv init default)
  KVC.engine = SB => Math.max(1, +((SB.music && typeof SB.music === 'object' && SB.music.engine) || SB.engine || 1) || 1);
  // engine 2: scene n gets a build-up (riser + snare roll) and a pickup beat without kick/bass from the scene s before it
  KVC.buildInto = (s, n, SB) => {
    if (!s || !n || n.end || s.bed === false || n.build === false || KVC.engine(SB) < 2) return false;
    if (n.build) return true;
    return !(SB.music && SB.music.build === false) && !!(n.hit || n.energy - s.energy >= 2 || (n.energy >= 3 && s.energy < 3));
  };
  // payoff = first scene of the final climax block (the last run of consecutive energy-3 / `hit` content scenes);
  // its dip (energy <= 1, bed false/'thin', or dip: true) belongs in the 2 scenes before it. Shared by kv-score and kv-lint.
  KVC.payoff = scenes => {
    const C = scenes.filter(s => !s.end), pk = s => s.energy >= 3 || !!s.hit;
    let j = C.length - 1; while (j >= 0 && !pk(C[j])) j--; if (j < 0) return null;
    while (j > 0 && pk(C[j - 1])) j--;
    return { pay: C[j], index: j, before: C.slice(Math.max(0, j - 2), j) };
  };
  KVC.isDipScene = s => s.dip === true || (s.dip !== false && (s.energy <= 1 || s.bed === false || s.bed === 'thin'));
  const TEXT_FIELDS = ['text', 'lines', 'title', 'sub', 'eyebrow', 'items', 'word', 'caption', 'cta', 'label'];

  KVC.time = (v, beat, bar) => {
    if (v == null || v === '') return 0;
    if (typeof v === 'number') return v * beat;
    const m = /^(-?[\d.]+)\s*(s|b|beats?|bars?)?$/.exec(String(v).trim());
    if (!m) throw new Error(`bad time "${v}" (use beats as a number, or '0.8s', '2b', '1bar')`);
    const n = +m[1], u = m[2] || 'b';
    return u === 's' ? n : u.startsWith('bar') ? n * bar : n * beat;
  };
  KVC.trans = (v, dflt) => {
    const o = typeof v === 'string' ? { type: v } : Object.assign({}, v || {});
    if (!o.type) Object.assign(o, typeof dflt === 'string' ? { type: dflt } : dflt || { type: 'cut' });
    // types outside KVC.TRANS come from library files (KV.transition); lint checks the name, default length 0.75 beat
    return o;
  };
  // "Say *hello*!" -> words ['Say', 'hello!']
  KVC.words = s => String(s).replace(/[*_]/g, '').split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w));
  KVC.textOf = L => {
    const out = [];
    const add = v => { if (v == null) return; if (typeof v === 'string') out.push(v); else if (Array.isArray(v)) v.forEach(add); else if (typeof v === 'object') for (const k of ['text', 'label', 'title', 'sub', 'word']) add(v[k]); };
    for (const k of TEXT_FIELDS) add(L[k]);
    return out;
  };

  // presets: { name: fn(scene, SB) -> scene with layers } (kv-presets.js)
  KVC.expand = (sc, SB, presets) => {
    if (!sc.preset) return sc;
    const fn = presets && presets[sc.preset];
    if (!fn) throw new Error(`scene "${sc.id}": unknown preset "${sc.preset}"`);
    const out = fn(sc, SB);
    out.layers = [...(out.layers || []), ...(sc.extra || [])];
    return out;
  };

  KVC.compile = (SB, presets) => {
    const bpm = SB.bpm || 100, beat = 60 / bpm, bar = 4 * beat, fps = SB.fps || 60, eng = KVC.engine(SB);
    const T = v => KVC.time(v, beat, bar);
    // sfx `snap`: 'beat' | '8th' | '16th' | false — quantise within 40 ms (default '16th' for tonal names in engine 2)
    const GRID = { beat, '8th': beat / 2, '16th': beat / 4 };
    const snap = (t, o) => { const g = GRID[o.snap ?? (eng >= 2 && KVC.TONAL.includes(o.name) ? '16th' : '')]; if (!g) return t; const q = Math.round(t / g) * g; return Math.abs(q - t) <= 0.04 ? q : t; };
    const list = [...(SB.scenes || [])];
    if (SB.end) list.push(Object.assign({ id: 'end', preset: 'end-simple', bars: 2, energy: 0, end: true }, SB.end));
    const dflt = (SB.transitions && SB.transitions.default) || 'cut';
    const scenes = [], S = {}, events = [], audioGaps = [], words = [];
    let t = 0;
    list.forEach((raw, i) => {
      const sc = KVC.expand(Object.assign({ id: 's' + (i + 1) }, raw), SB, presets);
      const dur = sc.dur != null ? T(typeof sc.dur === 'number' ? sc.dur + 's' : sc.dur) : sc.beats != null ? sc.beats * beat : (sc.bars ?? 2) * bar;
      const tr = i === 0 ? { type: 'cut' } : KVC.trans(sc.trans, dflt);
      tr.d = tr.type === 'cut' || tr.type === 'flash' ? 0 : +T(tr.beats ?? KVC.TRANS[tr.type] ?? (KVC.transMeta()[tr.type] || {}).beats ?? 0.75).toFixed(4);
      // align: the window [t0 - o, t0 - o + d] — 'center' puts the visual cut of a mid-cut type (whip, punch…) on the bar line
      tr.o = tr.align === 'center' ? +(tr.d / 2).toFixed(4) : tr.align === 'end' ? tr.d : 0;
      // jlcut (picture = hard cut): `lead` (beats or '0.5s') = J-cut, this scene's scene-level say / sfx start that much
      // before the cut (pre-lap, clamped to 1 bar and to the previous scene); `tail` (beats, true = 1 beat) = L-cut, the
      // previous scene's voice may run that far past the cut (voice is never truncated at a cut; kv-lint bounds both)
      if (tr.type === 'jlcut') { const jp = (KVC.transMeta().jlcut || {}).params || {}, ld = tr.lead ?? jp.lead ?? 0, tl = tr.tail ?? jp.tail ?? false;
        tr.leadS = i ? +Math.min(T(ld) || 0, bar, scenes[i - 1].dur).toFixed(4) : 0; tr.tailS = +(tl === true ? beat : tl ? T(tl) : 0).toFixed(4); }
      const content = list.filter(s => !s.end).length;
      const energy = sc.energy ?? (sc.end ? 0 : i === 0 ? 1 : (i === content - 1 && content > 3) ? 3 : 2);
      const s = Object.assign({}, sc, { i, t0: t, t1: t + dur, dur, trans: tr, energy });
      s.layers = (sc.layers || []).map((L, j) => Object.assign({ id: `${s.id}.${j}` }, L));
      if (S[s.id]) throw new Error(`duplicate scene id "${s.id}"`);
      S[s.id] = [s.t0, s.t1];
      if (s.hit) { if (s.t0 > 0.13) audioGaps.push([+(s.t0 - 0.13).toFixed(3), +(s.t0 - 0.005).toFixed(3)]); events.push({ t: s.t0, type: 'hit', scene: s.id }); }
      // trans `sfx` (engine 2): kit name | false | [{ name, at, gain }] overrides the transition sound; dir/out steer the whoosh
      if (tr.type !== 'cut') events.push(Object.assign({ t: tr.o ? +(s.t0 - tr.o).toFixed(4) : s.t0, type: 'trans', name: tr.type, d: tr.d, scene: s.id }, tr.sfx !== undefined ? { sfx: tr.sfx } : {}, tr.dir ? { dir: tr.dir } : {}, tr.out ? { out: true } : {}));
      const sw = [];
      const ev = (L, tIn) => {
        for (const x of [].concat(L.sfx || [])) {
          const o = typeof x === 'string' ? { name: x } : x;
          events.push(Object.assign({ t: +snap(tIn + T(o.at), o).toFixed(4), type: 'sfx', name: o.name, gain: o.gain, pitch: o.pitch, scene: s.id, layer: L.id }, o.len != null ? { len: +T(o.len).toFixed(4) } : {}));
        }
        if (L.say) {
          const o = typeof L.say === 'string' ? { text: L.say } : L.say;
          events.push({ t: +(tIn + T(o.at ?? L.sayAt)).toFixed(4), type: 'say', text: o.text, voice: o.voice, rate: o.rate, lang: o.lang, scene: s.id, layer: L.id });
        }
      };
      ev(s, s.t0 - (tr.leadS || 0)); // scene-level say/sfx (presets that turn `say` into a layer clear it); jlcut lead = J-cut
      const walk = (L, t0) => { const tIn = t0 + T(L.in); ev(L, tIn); KVC.textOf(L).forEach(x => sw.push(...KVC.words(x))); (L.layers || []).filter(Boolean).forEach((c, j) => walk(Object.assign({ id: `${L.id}.${j}` }, c), tIn)); };
      s.layers.forEach(L => walk(L, s.t0));
      words.push({ scene: s.id, n: sw.length, dur, wps: +(sw.length / dur).toFixed(2) });
      scenes.push(s); t += dur;
    });
    const dur = +t.toFixed(4);
    // drums: energy 1 = half-time kicks, >= 2 = four on the floor; none inside breath gaps
    // engine 2: none in `bed: false | 'thin'` scenes, none in the pickup beat before a build target (KVC.buildInto)
    const kicks = [], builds = [];
    for (const s of scenes) {
      const nx = scenes[s.i + 1], pick = KVC.buildInto(s, nx, SB) ? nx.t0 - beat : Infinity;
      if (pick < Infinity) builds.push(nx.t0);
      if (s.energy < 1 || (eng >= 2 && (s.bed === false || s.bed === 'thin'))) continue;
      const n = Math.round(s.dur / beat);
      for (let b = 0; b < n; b++) {
        if (s.energy === 1 && b % 2) continue;
        const k = +(s.t0 + b * beat).toFixed(4);
        if (k >= pick - 1e-3) continue;
        if (!audioGaps.some(([a, z]) => k >= a - 0.02 && k <= z)) kicks.push(k);
      }
    }
    events.sort((a, b) => a.t - b.t);
    const loud = scenes.filter(s => s.energy >= 2);
    const mixRef = loud.length ? [loud[0].t0, loud[loud.length - 1].t1] : [dur * 0.25, dur * 0.75];
    return Object.assign({ name: SB.name, fps, dur, bpm, beat, bar, scenes, S, events, kicks, audioGaps, mixRef, words, loop: !!SB.loop, engine: eng },
      eng >= 2 ? { builds } : {}, SB.audience ? { audience: SB.audience } : {});
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = KVC; else root.KVC = KVC;
})(typeof window !== 'undefined' ? window : globalThis);
