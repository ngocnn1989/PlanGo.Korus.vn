// KV lint: content rules on the storyboard + layout measured in the real browser (render.mjs --probe) for every
// aspect. Exit 1 on any error. `--readme` instead writes README.md (storyboard, sources, sound, QA, rebuild).
//   node kv/kv-lint.mjs [--project <dir>] [--json] [--readme]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url)), TOOLS = path.dirname(HERE), require = createRequire(import.meta.url);
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; }, has = k => argv.includes('--' + k);
const P = path.resolve(opt('project', process.cwd())), J = has('json');
const KVC = require(path.join(HERE, 'kv-core.js')), PRESETS = require(path.join(HERE, 'kv-presets.js'));
const defined = new Set();
const BRAND = fs.existsSync(path.join(P, 'brand.js')) ? new Function(fs.readFileSync(path.join(P, 'brand.js'), 'utf8') + ';return BRAND;')() : {};
const SB = new Function('KV', 'BRAND', 'MV', fs.readFileSync(path.join(P, 'storyboard.js'), 'utf8') + ';return SB;')({ define: k => (defined.add(k), k), presets: PRESETS, R: v => v, col: c => c }, BRAND, {});
const TL = KVC.compile(SB, PRESETS);
const CFG = JSON.parse(fs.readFileSync(path.join(P, 'video.config.json'), 'utf8'));
const tool = f => fs.existsSync(path.join(P, f)) ? path.join(P, f) : path.join(TOOLS, f);
// block names come from the library sources (kv-*.js, kv/blocks/*.js) plus KV.define calls in the storyboard
const bdir = path.join(HERE, 'blocks'), libFiles = ['kv-runtime.js', 'kv-blocks.js', 'kv-illus.js'].map(f => path.join(HERE, f))
  .concat(fs.existsSync(bdir) ? fs.readdirSync(bdir).filter(f => f.endsWith('.js')).map(f => path.join(bdir, f)) : []);
// project tier-3 files listed in SB.scripts are scanned too (KV.define / KV.transition there are known kinds)
const scanProject = () => [].concat(SB.scripts || []).map(f => path.join(P, f)).filter(f => fs.existsSync(f));
const TRANS = new Set(libFiles.concat(scanProject()).flatMap(f => [...fs.readFileSync(f, 'utf8').matchAll(/KV\.transition\('([a-z0-9-]+)'/gi)].map(m => m[1])));
const KINDS = new Set([...defined, ...libFiles.concat(scanProject()).flatMap(f => [...fs.readFileSync(f, 'utf8').matchAll(/(?:\bD|KV\.define)\('([a-z0-9-]+)'/gi)].map(m => m[1]))]);
// transition metadata (kv/blocks/trans-meta.js) — rules in references/transitions.md
let TRANS_META = {}; try { TRANS_META = require(path.join(HERE, 'blocks', 'trans-meta.js')); } catch { }
const THEME_LIGHT = ['bright', 'light'].includes(typeof SB.theme === 'string' ? SB.theme : (SB.theme && SB.theme.base) || 'dark');
const hexRGB = c => { const x = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(c || '')); if (!x) return null; const n = parseInt(x[1].length === 3 ? x[1].replace(/./g, '$&$&') : x[1], 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
// colour names: SB.theme overrides (accents: [...], ink: '#..') resolve; theme defaults live in kv-runtime (browser only), so
// any other name counts conservatively as contrasting — except bg / card (the scene's own tone)
const colOf = c => { const T = (SB.theme && typeof SB.theme === 'object') ? SB.theme : {}, a = /^a([1-9])$/.exec(c || '');   // no backslashes inside this template
  if (a && Array.isArray(T.accents) && T.accents.length) return T.accents[(+a[1] - 1) % T.accents.length];
  return typeof T[c] === 'string' ? T[c] : /^white$/i.test(c || '') ? '#FFFFFF' : /^black$/i.test(c || '') ? '#000000' : c; };
const lumOf = c => { const p = hexRGB(colOf(c)); if (!p) return null; const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(p[0]) + 0.7152 * f(p[1]) + 0.0722 * f(p[2]); };
const contrasty = c => { if (c == null || c === 'bg' || c === 'card') return false; const L = lumOf(c); return L == null ? true : THEME_LIGHT ? L < 0.2 : L > 0.4; };
// colours a transition paints over the WHOLE frame with its current options (rule 6: flash count and saturated red)
const FULL = { 'light-color': (tr, m) => ['color', 'color2'].filter(k => k in m.params).map(k => tr[k] ?? m.params[k]),
  'param:flash': (tr, m) => (tr.flash ? [tr.color ?? m.params.color] : []), 'mode:close': tr => (tr.mode === 'close' ? [tr.color ?? '#000'] : []),
  'mode:solid': (tr, m) => (tr.mode === 'solid' ? [tr.color ?? m.params.color] : []), 'dark-close': () => ['#10151C'] }; // aperture blades
const fullColours = s => { const tr = s.trans, m = TRANS_META[tr.type]; if (!m) return tr.type === 'flash' ? [tr.color ?? '#FFFFFF'] : [];
  return (FULL[m.flashIf] ? FULL[m.flashIf](tr, m) : []).concat(m.flashes ? [].concat(tr.colors ?? m.params.colors ?? [], tr.color ?? m.params.color ?? []) : []).filter(c => c != null); };
const transFlashCount = s => { const tr = s.trans, m = TRANS_META[tr.type]; if (!m) return tr.type === 'flash' ? 1 : 0;
  const on = FULL[m.flashIf] ? FULL[m.flashIf](tr, m).filter(c => c != null) : [];
  return m.flashes + ((m.flashIf === 'light-color' || m.flashIf === 'mode:close' || m.flashIf === 'dark-close') ? (on.some(contrasty) ? 1 : 0) : on.length ? 1 : 0); };
function transFlashTimes() {                       // rule 6: each flash at the transition's brightest moment
  const out = [];
  for (const s of TL.scenes.slice(1)) { const m = TRANS_META[s.trans.type] || {}, t = +(s.t0 - (s.trans.o || 0) + (m.cutAt === 'mid' ? s.trans.d / 2 : 0)).toFixed(3); for (let i = transFlashCount(s); i > 0; i--) out.push(t); }
  return out;
}

if (has('readme')) { readme(); process.exit(0); }

const issues = [], add = (level, rule, msg, o = {}) => issues.push(Object.assign({ level, rule, msg }, o));
// ------------------------------------------------------------------ content rules
function walk(layers, fn, sc) { (layers || []).filter(Boolean).forEach(L => { fn(L, sc); walk(L.layers, fn, sc); }); }
for (const sc of TL.scenes) {
  walk(sc.layers, L => {
    if (!KINDS.has(L.kind)) add('error', 'kind', `unknown layer kind "${L.kind}" (${[...KINDS].join(', ')}; or KV.define it)`, { scene: sc.id, layer: L.id });
    for (const x of [].concat(L.sfx || [])) { const n = typeof x === 'string' ? x : x.name; if (!KVC.SFX.includes(n)) add('warn', 'sfx', `unknown sfx "${n}" (${KVC.SFX.join(', ')})`, { scene: sc.id, layer: L.id }); }
    const txt = KVC.textOf(L).join(' ');
    if (/\d/.test(txt) && /(\d\s*(%|x\b|kw|kg|km|h\b|giờ|triệu|tỷ|lần|\$|usd|vnd|đ\b))|(\d{2,})/i.test(txt) && !L.src && !sc.src) add('warn', 'claim', `"${txt.slice(0, 40)}" shows a number/claim without src (add src: '<key in SB.sources>')`, { scene: sc.id, layer: L.id });
    // `src` is either an asset key (photo-like blocks) or a claim key; only claim keys must be in SB.sources
    if (L.src && typeof L.src === 'string' && L.kind !== 'logo' && !(SB.assets || {})[L.src] && !(SB.sources || {})[L.src]) add('error', 'claim', `src "${L.src}" is not in SB.sources`, { scene: sc.id, layer: L.id });
    if (L.kind === 'tiles') for (const it of L.items || []) if (typeof it.value === 'number' && !it.src && !L.src) add('warn', 'claim', `tile "${it.label}" value ${it.value} has no src`, { scene: sc.id, layer: L.id });
    if (L.kind === 'photo' && L.src && !(SB.assets || {})[L.src]) add('error', 'asset', `photo src "${L.src}" is not in SB.assets`, { scene: sc.id, layer: L.id });
  }, sc);
  if (!KVC.TRANS.hasOwnProperty(sc.trans.type) && !TRANS.has(sc.trans.type)) add('error', 'transition', `unknown transition "${sc.trans.type}" (${[...Object.keys(KVC.TRANS), ...TRANS].join(', ')})`, { scene: sc.id });
  if (sc.trans.d > sc.dur / 2) add('warn', 'transition', `transition ${sc.trans.type} (${sc.trans.d.toFixed(2)} s) is longer than half the scene`, { scene: sc.id });
}
for (const w of TL.words) { const lim = w.scene === TL.scenes[0].id ? 3.8 : 3.2; if (w.wps > 4.5) add('error', 'reading', `${w.n} words in ${w.dur.toFixed(1)} s (${w.wps}/s) — too fast to read`, { scene: w.scene }); else if (w.wps > lim) add('warn', 'reading', `${w.wps} words/s (> ${lim})`, { scene: w.scene }); }
const last = TL.scenes[TL.scenes.length - 1];
if (last.dur < 3) add('warn', 'endcard', `last scene is ${last.dur.toFixed(1)} s (end card needs >= 3 s)`, { scene: last.id });
const flashes = transFlashTimes();
walk(TL.scenes.flatMap(s => s.layers.map(L => Object.assign({ _t: s.t0 + KVC.time(L.in, TL.beat, TL.bar) }, L))), L => { if (L.kind === 'flash') flashes.push(L._t); });
flashes.sort((a, b) => a - b).forEach((t, i) => { const n = flashes.filter(x => x >= t && x < t + 1).length; if (n > 3) add('error', 'flash', `${n} flashes within 1 s from ${t.toFixed(2)} s (max 3)`); });
const VOJ = fs.existsSync(path.join(P, 'vo.json')) ? JSON.parse(fs.readFileSync(path.join(P, 'vo.json'), 'utf8')) : null;
for (const e of TL.events.filter(e => e.type === 'say')) {
  const sc = TL.scenes.find(s => s.id === e.scene), lang = String(e.lang || (SB.voice || {}).lang || 'en-US').slice(0, 2);
  const real = VOJ && VOJ.find(l => l.text === e.text && Math.abs(l.t - e.t) < 0.05);
  const len = real ? real.dur : KVC.words(e.text).length / (lang === 'vi' ? 4.5 : 2.6) + 0.3;
  const nxs = TL.scenes[sc.i + 1], tailS = nxs && nxs.trans.type === 'jlcut' ? nxs.trans.tailS || 0 : 0; // jlcut tail = L-cut allowance
  if (e.t + len > sc.t1 + tailS + (real ? 0.25 : 0.6)) add('warn', 'voice', `"${e.text.slice(0, 40)}" (${real ? '' : '~'}${len.toFixed(1)} s${real ? ', measured' : ''}) runs past the scene end`, { scene: e.scene });
}
if (fs.existsSync(path.join(P, 'vo.json'))) { const vo = JSON.parse(fs.readFileSync(path.join(P, 'vo.json'), 'utf8')); vo.forEach((l, i) => { if (i && vo[i - 1].t + vo[i - 1].dur > l.t) add('error', 'voice', `voice lines overlap at ${l.t.toFixed(2)} s`, { scene: l.scene }); }); }
musicRules();
transRules();

// ------------------------------------------------------------------ music / sound rules (kr-video-score music_best_practices.md; all warnings)
function musicRules() {
  const C = TL.scenes.filter(s => !s.end), KIDS = SB.audience === 'kids', scOf = id => TL.scenes.find(s => s.id === id);
  const lenOf = e => { const real = VOJ && VOJ.find(l => l.text === e.text && Math.abs(l.t - e.t) < 0.05), lg = String(e.lang || (SB.voice || {}).lang || 'en-US').slice(0, 2); return real ? real.dur : KVC.words(e.text).length / (lg === 'vi' ? 4.5 : 2.6) + 0.3; };
  const says = TL.events.filter(e => e.type === 'say').map(e => ({ e, a: e.t, b: e.t + lenOf(e), sc: scOf(e.scene) }));
  // MUS: there is a music bed (music: false = SFX/VO only -> bed rules stay silent); SYN: the bed is the synthesized score
  // (a licensed music.file keeps its own arrangement; rules that only read scene energy / the beat grid still apply to it)
  const MUS = SB.music !== false, SYN = MUS && !(SB.music && SB.music.file);
  // voice-only rules (apply with or without music): pre-lap <= 1 bar, brand named early, CTA spoken; transition sfx names
  for (const x of says) if (x.sc && x.a < x.sc.t0 - TL.bar - 1e-3) add('warn', 'voice-prelap', `"${x.e.text.slice(0, 30)}" starts ${(x.sc.t0 - x.a).toFixed(2)} s before its scene (pre-lap <= 1 bar)`, { scene: x.sc.id });
  if (says.length && BRAND.name && !says.some(x => x.a < 5 && x.e.text.toLowerCase().includes(String(BRAND.name).toLowerCase()))) add('warn', 'brand-audio', `no spoken "${BRAND.name}" in the first 5 s`);
  const endSc = TL.scenes.find(s => s.end);
  if (says.length && endSc && !says.some(x => x.b > endSc.t0)) add('warn', 'voice-cta', 'no voice line on the end card (say the CTA as well as showing it)', { scene: endSc.id });
  for (const s of TL.scenes) for (const x of [].concat(s.trans && Array.isArray(s.trans.sfx) || typeof (s.trans || {}).sfx === 'string' ? s.trans.sfx : [])) { const n = typeof x === 'string' ? x : x.name; if (!KVC.SFX.includes(n)) add('warn', 'sfx', `unknown transition sfx "${n}"`, { scene: s.id }); }
  if (!MUS) return; // music: false -> no music/sound rules (SFX-only videos are judged by ear in review)
  // arc: <= 8 bars at one energy (one warning per flat run); a dip (energy <= 1 or a stop-down) in the 2 scenes before the payoff
  let run = 0, told = false;
  C.forEach((s, i) => { const same = i && s.energy === C[i - 1].energy; run = same ? run + s.dur / TL.bar : s.dur / TL.bar; if (!same) told = false; if (run > 8 + 1e-6 && !told) { told = true; add('warn', 'music-arc', `> 8 bars at energy ${s.energy} (from ${C[C.slice(0, i + 1).map(x => x.energy !== s.energy).lastIndexOf(true) + 1].id}) — change the energy (or add bed: 'thin') every <= 8 bars`, { scene: s.id }); } });
  const PO = KVC.payoff(TL.scenes); // payoff = first scene of the final energy-3 / hit block (same definition as kv-score)
  if (PO && C.length >= 4 && PO.index > 1 && !PO.before.some(KVC.isDipScene)) add('warn', 'music-arc', `no dip (energy <= 1, or bed: false / 'thin') in the 2 scenes before the payoff "${PO.pay.id}"`, { scene: PO.pay.id, layer: 'dip' });
  // nothing changes under a sentence: hit, transition or energy change inside a voice line (its last 0.15 s and a pre-lap into the cut are fine)
  const inLine = (t, sid) => says.find(x => t > x.a + 0.02 && t < x.b - 0.15 && !(x.e.scene === sid && x.sc && x.a < x.sc.t0 - 1e-3));
  for (const ev of TL.events.filter(e => e.type === 'hit' || e.type === 'trans')) { const x = inLine(ev.t, ev.scene); if (x && ev.name === 'jlcut' && x.e.scene !== ev.scene && x.b <= ev.t + (scOf(ev.scene).trans.tailS || 0) + 0.15) continue; /* L-cut */ if (x) add('warn', 'sound-vo', `${ev.type === 'hit' ? 'hit' : ev.name + ' transition'} at ${ev.t.toFixed(2)} s lands inside the voice line "${x.e.text.slice(0, 30)}" — move the line or the cut`, { scene: ev.scene }); }
  if (SYN) TL.scenes.forEach((s, i) => { const x = i && s.energy !== TL.scenes[i - 1].energy && inLine(s.t0, s.id); if (x) add('warn', 'music-vo', `energy ${TL.scenes[i - 1].energy} -> ${s.energy} changes mid-sentence ("${x.e.text.slice(0, 30)}")`, { scene: s.id, layer: 'energy' }); });
  // hero sounds are rare: <= 1 per 2 bars outside energy 3
  const H = TL.events.filter(e => e.type === 'sfx' && KVC.HERO.includes(e.name));
  H.forEach(e => { const n = H.filter(x => x.t >= e.t && x.t < e.t + 2 * TL.bar).length; if (n > 1 && scOf(e.scene).energy < 3) add('warn', 'sfx-hero', `${n} hero sounds (${KVC.HERO.join('/')}) within 2 bars from ${e.t.toFixed(2)} s — keep one, use pop/ding/blip for the rest`, { scene: e.scene }); });
  // dense copy needs a calmer bed (synthesized score only: energy shapes it)
  if (SYN) for (const s of TL.scenes.filter(s => s.energy >= 3)) {
    const said = says.filter(x => x.e.scene === s.id); if (!said.length) continue;
    const lg = String(said[0].e.lang || (SB.voice || {}).lang || 'en').slice(0, 2), w = said.reduce((n, x) => n + KVC.words(x.e.text).length, 0) / s.dur, lim = lg === 'vi' ? 4.5 : 2.5;
    if (w > lim) add('warn', 'music-dense', `dense voice (${w.toFixed(1)} words/s > ${lim}) over energy 3 — energy <= 2 under dense copy`, { scene: s.id });
  }
  // SFX off the first consonant (kids: out of the whole taught line)
  for (const e of TL.events.filter(e => e.type === 'sfx')) { const x = says.find(x => e.t > x.a - 0.1 && e.t < (KIDS ? x.b : x.a + 0.15)); if (x) add('warn', 'sfx-vo', `sfx "${e.name}" at ${e.t.toFixed(2)} s masks ${KIDS ? '' : 'the start of '}"${x.e.text.slice(0, 30)}" — move it >= 0.1 s earlier or the line later`, { scene: e.scene, layer: e.layer }); }
  // grid and formats: cuts on beats, 6/15/30/60 s cuts in whole bars, tonal stingers on the 16th grid
  TL.scenes.forEach(s => { const off = Math.abs(s.t0 / TL.beat - Math.round(s.t0 / TL.beat)) * TL.beat; if (off > 1 / TL.fps) add('warn', 'music-grid', `scene starts ${(off * 1000).toFixed(0)} ms off the beat grid — use bars/beats durations`, { scene: s.id }); });
  const F = [6, 15, 30, 60].find(f => Math.abs(TL.dur - f) < 1);
  if (F && Math.abs(TL.dur / TL.bar - Math.round(TL.dur / TL.bar)) * TL.bar > 1 / TL.fps) add('warn', 'music-format', `${F} s cut is not whole bars at ${TL.bpm} BPM (bar ${TL.bar.toFixed(3)} s; 96/120/128 BPM give whole bars)`);
  if (F === 6 && TL.events.filter(e => e.type === 'hit').length > 1) add('warn', 'music-format', '6 s bumper: one hit only');
  for (const e of TL.events.filter(e => e.type === 'sfx' && KVC.TONAL.includes(e.name))) { const g = TL.beat / 4, off = Math.abs(e.t - Math.round(e.t / g) * g); if (off > 0.01) add('warn', 'sfx-grid', `tonal sfx "${e.name}" ${(off * 1000).toFixed(0)} ms off the 16th grid (snap: '16th' quantises within 40 ms)`, { scene: e.scene, layer: e.layer }); }
  // supplied track: licence with platform scope (skipped when the project generates the file itself)
  if (SB.music && SB.music.file && !['compose.mjs', 'music.mjs'].some(f => fs.existsSync(path.join(P, f)))) {
    const lic = path.join(P, 'licenses', path.basename(SB.music.file) + '.txt');
    if (!fs.existsSync(lic) || !/platforms?\s*:/i.test(fs.readFileSync(lic, 'utf8'))) add('warn', 'rights', `music.file needs licenses/${path.basename(SB.music.file)}.txt with a "platforms:" line (paid ads, territory, term)`);
  }
}

// ------------------------------------------------------------------ transition rules (references/transitions.md; kv/blocks/trans-meta.js)
function transRules() {
  const TS = TL.scenes.slice(1), M = s => TRANS_META[s.trans.type], n = TS.length, beat = TL.beat, CUTS = ['cut', 'jlcut'];
  const KVC_sceneAt = t => Math.max(0, TL.scenes.findLastIndex(s => t >= s.t0 - 1e-6));
  if (!n || !Object.keys(TRANS_META).length) return;
  const FB = { h: ['s', 'f', 'v'], f: ['v', 's', 'h'], v: ['f', 's', 'h'] }, isPA = v => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).every(k => 'hfvs'.includes(k));
  const R = (v, A) => (isPA(v) ? (A in v ? v[A] : FB[A].map(k => v[k]).find(x => x !== undefined)) : v);
  const COMMON = new Set(['type', 'beats', 'd', 'o', 'leadS', 'tailS', 'dir', 'at', 'ease', 'align', 'sfx', 'lead', 'tail', 'back', 'color', 'fallback', 'gl', 'out']);
  const designed = TS.filter(s => !CUTS.includes(s.trans.type)), T = SB.transitions || {};
  // 1 hard cut by default; no designed type 3 times in a row
  if (n >= 4 && designed.length / n > 0.6) add('warn', 'trans-cut', `${designed.length}/${n} boundaries are designed transitions (> 60 %): cut inside a chapter, design the chapter changes`);
  TS.forEach((s, i) => { if (i >= 2 && !CUTS.includes(s.trans.type) && TS[i - 1].trans.type === s.trans.type && TS[i - 2].trans.type === s.trans.type) add('warn', 'trans-repeat', `"${s.trans.type}" on 3 boundaries in a row`, { scene: s.id }); });
  // 2 one family (+ neutral / cut grammar), few types
  const fams = new Set(designed.map(s => (M(s) || {}).family).filter(f => f && f !== 'neutral' && f !== 'cut')), types = new Set(designed.map(s => s.trans.type)), maxT = T.maxTypes ?? 5;
  if (T.family && [...fams].some(f => f !== T.family)) add('warn', 'trans-family', `families ${[...fams].join(', ')} outside SB.transitions.family "${T.family}"`);
  else if (fams.size > 2) add('warn', 'trans-family', `${fams.size} transition families (${[...fams].join(', ')}): pick one + neutral cut / fade / dip`);
  if (types.size > maxT) add('error', 'trans-types', `${types.size} transition types (> ${maxT}): ${[...types].join(', ')} — SB.transitions.maxTypes raises the cap for a sampler`);
  else if (TL.dur <= 60 && types.size > 3) add('warn', 'trans-types', `${types.size} transition types in a ${TL.dur.toFixed(0)} s video (≤ 3 reads as one voice)`);
  for (const s of TS) {
    const m = M(s), tr = s.trans, at = { scene: s.id }; if (!m) continue;
    const b = tr.d / beat;
    // 3 duration from tempo (range in beats, 0.2–1.2 s unless a hold type, 16th grid)
    if (tr.d > 0) {
      if (b < m.range[0] - 0.01 || b > m.range[1] + 0.01) add('warn', 'trans-length', `${tr.type} ${b.toFixed(2)} beats is outside ${m.range[0]}–${m.range[1]} beats`, at);
      else if (!m.long && (tr.d < 0.2 || tr.d > 1.2)) add('warn', 'trans-length', `${tr.type} ${tr.d.toFixed(2)} s (0.2–1.2 s reads well)`, at);
      if (Math.abs(b * 4 - Math.round(b * 4)) > 0.01) add('warn', 'trans-grid', `${tr.type} lasts ${b.toFixed(3)} beats — off the 16th-note grid`, at);
    }
    // 4 a hit on a mid-cut type needs the cut on the downbeat
    if (s.hit && m.cutAt === 'mid' && tr.d > 0 && tr.align !== 'center') add('warn', 'trans-align', `hit on ${tr.type}: its cut reads ${(tr.d / 2).toFixed(2)} s after the bar — add align: 'center'`, at);
    // 6 never a saturated red full-frame flash
    const red = fullColours(s).find(c => { const p = hexRGB(colOf(c)); return p && p[0] / Math.max(1, p[0] + p[1] + p[2]) >= 0.8; });
    if (red) add('error', 'flash-red', `${tr.type} paints the whole frame saturated red ${red} (never, at any luminance)`, at);
    // 7 flicker swapping
    if (m.swap) { const rate = tr.rate ?? m.swap.rate; if (m.swap.area > 0.25 && rate > 3) add('error', 'trans-flicker', `${tr.type} swaps ${Math.round(m.swap.area * 100)} % of the frame at ${rate} Hz (≤ 3 Hz)`, at); }
    // 8 regular patterns
    const nn = tr.n ?? m.params.n, cell = tr.cell ?? m.params.cell, px = tr.px ?? m.params.px;
    if ((m.pattern && (nn > 10 || (cell != null && cell < 0.06) || (px != null && px < 4) || (tr.type === 'blinds' && (tr.stagger ?? 0.4) === 0 && nn > 5))) || (tr.type === 'clock' && (tr.n ?? 1) > 6))
      add('warn', 'trans-pattern', `${tr.type}: many high-contrast stripes / cells (n ${nn ?? '-'}, cell ${cell ?? '-'}) — photosensitivity risk`, at);
    // 9 vestibular angle
    if (tr.type === 'spin' && (tr.angle ?? 90) > 180) add('warn', 'trans-vestibular', `spin angle ${tr.angle} > 180`, at);
    // 11 copy in transit
    if (['distortion', 'dissolve', 'liquid', '3d'].includes(m.family) && tr.d > 0) walk(s.layers, L => { if (['text', 'counter', 'bubble', 'list'].includes(L.kind) && KVC.time(L.in, TL.beat, TL.bar) < tr.d - (tr.o || 0) - 0.01)
      add('warn', 'trans-text', `${L.kind} on screen during ${tr.type} (${m.family} mangles copy): start it at in ≥ ${(tr.d / beat).toFixed(2)} beats`, { scene: s.id, layer: L.id }); }, s);
    // jlcut: J-cut lead <= 1 bar and <= the previous scene, L-cut tail <= 1 bar; both act on sound only
    if (tr.type === 'jlcut') {
      const prev = TL.scenes[s.i - 1], raw = tr.lead != null ? KVC.time(tr.lead, beat, TL.bar) : 0, tl = tr.tailS || 0, sl = e => e.scene === s.id && e.layer === s.id && (e.type === 'say' || e.type === 'sfx');
      if (raw > Math.min(TL.bar, prev.dur) + 1e-3) add('warn', 'trans-jlcut', `jlcut lead ${(raw / beat).toFixed(2)} beats exceeds ${raw > TL.bar + 1e-3 ? '1 bar' : 'the previous scene'} — clamped to ${(tr.leadS / beat).toFixed(2)} beats`, at);
      if (tr.leadS > 0 && !TL.events.some(sl)) add('warn', 'trans-jlcut', `jlcut lead has no effect: scene ${s.id} has no scene-level say / sfx to pre-lap`, at);
      if (tl > TL.bar + 1e-3) add('warn', 'trans-jlcut', `jlcut tail ${(tl / beat).toFixed(2)} beats is longer than 1 bar (L-cut voice over the next picture)`, at);
      if (tl > 0 && !TL.events.some(e => e.type === 'say' && e.scene === prev.id && e.t + ((VOJ && VOJ.find(l => l.text === e.text && Math.abs(l.t - e.t) < 0.05)) || { dur: KVC.words(e.text).length / 2.6 + 0.3 }).dur > s.t0)) add('warn', 'trans-jlcut', `jlcut tail has no effect: no voice line of ${prev.id} runs into the cut`, at);
    } else if (tr.lead != null || tr.tail != null) add('warn', 'trans-param', `${tr.type}: lead / tail act on jlcut only`, at);
    // typo guard: options the type does not know
    for (const k of Object.keys(tr)) if (!COMMON.has(k) && !(k in m.params)) add('warn', 'trans-param', `${tr.type}: unknown option "${k}" (knows ${[...Object.keys(m.params)].join(', ') || 'no options'})`, at);
  }
  // 5 one forward direction per aspect · 15 vertical formats move vertically
  for (const A of ['h', 'f', 'v']) {
    if (!Object.keys(CFG.variants || {}).some(a => KVC.ASPECTS[a] && KVC.ASPECTS[a].A === A)) continue;
    const seen = {}, nm = { h: '16:9', f: '4:5', v: '9:16' }[A], av = Object.keys(CFG.variants || {}).find(a => KVC.ASPECTS[a] && KVC.ASPECTS[a].A === A);
    for (const s of TS) { const m = M(s); if (!m || !m.dir || s.trans.back) continue; const d = R(s.trans.dir ?? m.dflt ?? m.params.dir ?? 'left', A); if (d) (seen[d] = seen[d] || []).push(s.id); }
    for (const [x, y] of [['left', 'right'], ['up', 'down']]) if (seen[x] && seen[y]) add('warn', 'trans-direction', `${nm}: transitions move ${x} (${seen[x].join(', ')}) and ${y} (${seen[y].join(', ')}) — keep one forward direction, mark a deliberate reverse back: true`, { aspect: av });
    if (A === 'v') for (const s of TS) { const m = M(s); if (!m || !m.dir || !['motion', 'wipe', 'social', '3d', 'light'].includes(m.family)) continue; // rule 15
      const d = R(s.trans.dir ?? m.dflt ?? m.params.dir ?? 'left', 'v'); if (/left|right/.test(d || '')) add('warn', 'trans-aspect', `${s.trans.type} on 9:16 moves ${d} — vertical formats move vertically (dir: { h: '${d}', v: 'up' }; transitions.md rule 15)`, { scene: s.id }); }
  }
  // 9 vestibular budget: ≤ 2 zoom / spin / 3D / swipe moves per 30 s
  const vs = TS.filter(s => (M(s) || {}).vest), vt = vs.map(s => s.t0);
  vs.forEach(s => { const k = vt.filter(x => x >= s.t0 && x < s.t0 + 30).length; if (k > 2) add('warn', 'trans-vestibular', `${k} zoom / spin / 3D / swipe transitions within 30 s from ${s.t0.toFixed(1)} s (≤ 2; SB.motion: 'reduced' turns them into fades)`, { scene: s.id }); });
  // 10 one sound per transition: no layer whoosh on top of a transition whoosh, ≤ 2 whooshes per beat
  const W = e => /whoosh|swoosh/.test(e.name || ''), tw = TL.events.filter(e => e.type === 'trans' && e.sfx !== false && ((TRANS_META[e.name] || {}).sfx || []).some(W));
  const lw = TL.events.filter(e => e.type === 'sfx' && W(e));
  for (const e of lw) { const x = tw.find(q => e.t >= q.t - 0.15 && e.t <= q.t + q.d + 0.15); if (x) add('warn', 'trans-sfx', `layer ${e.name} at ${e.t.toFixed(2)} s doubles the ${x.name} transition whoosh — drop one`, { scene: e.scene, layer: e.layer }); }
  const allW = [...lw.map(e => e.t), ...tw.map(e => e.t + e.d / 2)].sort((a, b) => a - b);
  allW.forEach(t => { const k = allW.filter(x => x >= t && x < t + beat).length; if (k > 2) add('warn', 'trans-sfx', `${k} whooshes within one beat from ${t.toFixed(2)} s`, { scene: TL.scenes[KVC_sceneAt(t)].id }); });
  // 13 kids profile
  if (SB.audience === 'kids') {
    for (const s of TS) { const m = M(s), tr = s.trans; if (!m) continue;
      if (m.kids === 'no' || (tr.type === 'smash' && tr.flash)) add('error', 'trans-kids', `${tr.type} is not for young children (fast / flashing / harsh) — use shape, ink, iris, flip, fade`, { scene: s.id });
      else if (m.kids === 'avoid') add('warn', 'trans-kids', `${tr.type}: prefer a slower playful transition for kids`, { scene: s.id });
      if (tr.d > 0 && tr.d < 0.6 && !CUTS.includes(tr.type)) add('warn', 'trans-kids', `${tr.type} ${tr.d.toFixed(2)} s is fast for kids (≥ 0.6 s)`, { scene: s.id }); }
    const dt = designed.map(s => s.t0); designed.forEach(s => { if (dt.filter(x => x >= s.t0 && x < s.t0 + 6).length > 1) add('warn', 'trans-kids-pace', `more than one designed transition within 6 s from ${s.t0.toFixed(1)} s`, { scene: s.id }); });
  }
}

motionRules();

// ------------------------------------------------------------------ ad-script rules (P1-1 … P1-5; references/ad_script_templates.md)
// Additive: every rule warns; with SB.brief the rules marked `sev` become errors (storyboards without a brief keep passing).
// Superlative / absolute / sensitive wording is NOT listed here: owner policy removes it and the legal gate owns the terms
// (kv/kv-legal + kv/legal/lexicon.json, references/legal_compliance.md) — ruleLegal() delegates and is mandatory.
const AD = (() => {
  const B = SB.brief || null, sev = B ? 'error' : 'warn';
  const nfc = s => String(s ?? '').normalize('NFC'), low = s => nfc(s).toLowerCase(), plain = s => nfc(s).replace(/[*_]/g, '').trim();
  const tt = v => { try { return KVC.time(v, TL.beat, TL.bar); } catch { return 0; } };
  const content = TL.scenes.filter(s => !s.end), endSc = TL.scenes.find(s => s.end) || null, flat = [];
  // every layer with its on-screen window [a, b] (video time); a child shows only while its parent shows (runtime rule)
  const walkT = (L0, sc, a0, b0, id) => { if (!L0 || typeof L0 !== 'object') return; const L = L0.id ? L0 : Object.assign({ id }, L0);
    const a = Math.max(a0, sc.t0 + tt(L.in)), b = Math.min(b0, L.out != null ? sc.t0 + tt(L.out) : sc.t1); flat.push({ L, sc, a, b }); (L.layers || []).forEach((c, j) => walkT(c, sc, a, b, `${L.id}.${j}`)); };
  TL.scenes.forEach(sc => (sc.layers || []).forEach((L, j) => walkT(L, sc, sc.t0, sc.t1, `${sc.id}.${j}`)));
  const textIn = sc => flat.filter(x => x.sc === sc).flatMap(x => KVC.textOf(x.L)).map(plain).join(' ');
  const sayIn = sc => TL.events.filter(e => e.type === 'say' && e.scene === sc.id).map(e => plain(e.text)).join(' ');
  const srcVal = k => (SB.sources || {})[k];
  const isClaimKey = k => typeof k === 'string' && Object.prototype.hasOwnProperty.call(SB.sources || {}, k) && !(SB.assets || {})[k];
  const typeOf = k => { const v = srcVal(k); return v && typeof v === 'object' ? v.type : null; };
  const aud = B && B.audience, kids = !!(B && (aud === 'kids' || (aud && aud.kind === 'kids') || B.objective === 'kids'));
  const lang = /^en/i.test(String(SB.lang || '')) ? 'en' : 'vi';
  // brand / CTA rules apply to ads: a brief, a watermark, or an end card with a CTA or logo (kids explainers stay quiet)
  const isAd = !!(B || SB.watermark || (SB.end && (SB.end.cta || SB.end.logo || SB.end.preset === 'cta-endcard')));
  return { isAd, B, sev, low, plain, tt, content, endSc, flat, textIn, sayIn, srcVal, isClaimKey, typeOf, kids, lang };
})();

// P1-1 brief: objective, single message, length, key term, owner's forbidden words, hook formula, objective beat
function ruleBrief() {
  const { B, sev, low, plain, content, endSc, flat, textIn, sayIn } = AD;
  if (!B) return;
  const OBJ = ['awareness', 'consideration', 'conversion', 'recruitment', 'launch', 'education', 'kids'];
  if (!B.objective) add('warn', 'brief', `brief.objective missing (${OBJ.join(' | ')})`, { layer: 'objective' });
  else if (!OBJ.includes(B.objective)) add('warn', 'brief', `brief.objective "${B.objective}" is not one of ${OBJ.join(', ')}`, { layer: 'objective' });
  if (!B.message) add('warn', 'brief', 'brief.message missing: write the single message (<= 12 words) before any scene', { layer: 'message' });
  else if (KVC.words(B.message).length > 12) add('warn', 'brief', `brief.message has ${KVC.words(B.message).length} words (<= 12: one message)`, { layer: 'message' });
  const len = Array.isArray(B.length) ? B.length[0] : B.length;
  if (typeof len === 'number' && Math.abs(TL.dur - len) > 0.5) add('error', 'duration', `timeline is ${TL.dur.toFixed(2)} s but brief.length is ${len} s (± 0.5 s)`);
  if (B.key) {
    const has = sc => low(textIn(sc)).includes(low(B.key)), lead = [content[0], ...content.filter(s => s.hit || s.beat === 'payoff'), content[content.length - 1]].filter(Boolean);
    if (!lead.some(has) || (endSc && !has(endSc))) add('warn', 'one-message', `key term "${B.key}" should appear in the hook or payoff scene and on the end card`);
  }
  for (const w of [].concat(B.forbidden || [])) for (const sc of TL.scenes) if (w && low(textIn(sc) + ' ' + sayIn(sc)).includes(low(w))) add(sev, 'forbidden', `"${w}" is on brief.forbidden`, { scene: sc.id });
  const h0 = content[0], hk = h0 && (h0.hook || B.hook), HOOKS = ['question', 'stat', 'callout', 'interrupt', 'open-loop', 'demo', 'story', 'statement', 'list'];
  if (h0) {
    if (hk && !HOOKS.includes(hk)) add('warn', 'hook', `hook "${hk}" is not one of ${HOOKS.join(', ')}`, { scene: h0.id });
    const t0 = textIn(h0), terms = [].concat((aud => aud && aud.terms)(B.audience) || []);
    if (hk === 'question' && !/\?/.test(t0)) add('warn', 'hook', 'question hook: the frame-0 line should end with "?"', { scene: h0.id });
    if (hk === 'stat' && !h0.src && !flat.some(x => x.sc === h0 && (x.L.src || (Array.isArray(x.L.items) && x.L.items.some(i => i && i.src))))) add(sev, 'hook', 'stat hook: the number needs src', { scene: h0.id });
    if (hk === 'callout' && terms.length && !terms.some(w => low(t0).includes(low(w)))) add('warn', 'hook', `call-out hook: name the audience on frame 0 (${terms.join(', ')})`, { scene: h0.id });
    for (const x of flat.filter(x => x.sc === h0 && x.a <= h0.t0 + 0.05 && x.L.kind === 'text')) for (const s of [].concat(x.L.text || [])) if (typeof s === 'string' && KVC.words(s).length > 7) add('warn', 'hook-words', `hook line "${plain(s).slice(0, 40)}" has ${KVC.words(s).length} words (<= 7 per line)`, { scene: h0.id, layer: x.L.id });
  }
  const human = s => s.beat === 'human' || flat.some(x => x.sc === s && (x.L.kind === 'photo' || (x.L.kind === 'illus' && x.L.name === 'buddy')));
  const proof = s => s.beat === 'proof' || AD.isClaimKey(s.src) || flat.some(x => x.sc === s && AD.isClaimKey(x.L.src) && AD.typeOf(x.L.src) !== 'contact');
  if (B.objective === 'awareness' && !content.some(human)) add('warn', 'objective', 'awareness: add one human / place / incident beat (a scene with beat: "human")');
  if (B.objective === 'conversion' && !content.some(proof)) add('warn', 'objective', 'conversion: add one demo / proof beat (a sourced claim, or beat: "proof")');
}

// P1-2 brand: a brand cue (logo, watermark with a logo file, or the brand name) by 2 s; coverage >= 50 % or >= 3 moments
function ruleBrand() {
  const { B, sev, low, plain, content, flat } = AD;
  if (!content.length || !AD.isAd) return;
  const name = (B && B.brand && !/^<.*>$/.test(B.brand) ? B.brand : null) || (SB.brand && SB.brand.name) || BRAND.name || null;
  const hasLogo = !!(BRAND.logoWide || BRAND.logoWideInverse || BRAND.mark);
  const wm = !!SB.watermark && (hasLogo || !!(typeof SB.watermark === 'object' && SB.watermark.src && (SB.assets || {})[SB.watermark.src]));
  if (SB.watermark && !wm) add('warn', 'brand', 'SB.watermark is on but brand.js has no logo file, so nothing is drawn (kv init --logo <png>)');
  const cues = flat.filter(x => x.b > x.a && (x.L.kind === 'logo' ? hasLogo || (SB.assets || {})[x.L.src] : name && KVC.textOf(x.L).some(s => low(plain(s)).includes(low(name))))).map(x => ({ a: x.a, b: x.b, sc: x.sc }));
  if (wm) for (const s of content) cues.push({ a: s.t0, b: s.t1, sc: s });
  const first = cues.length ? Math.min(...cues.map(c => c.a)) : Infinity, declared = B && B.brandCue;
  const where = first === Infinity ? 'no brand cue (logo, watermark logo or brand name) found' : `first brand cue at ${first.toFixed(2)} s`;
  if (first > 5) add(declared ? 'warn' : sev, 'brand-early', `${where}: show the logo or product name within 2 s (SB.watermark: true + logo, or the name in the hook)${declared ? ` — declared cue: ${declared}` : ''}`);
  else if (first > 2) add('warn', 'brand-early', `${where} (target <= 2 s)`);
  const cdur = content.reduce((a, s) => a + s.dur, 0), seg = cues.filter(c => !c.sc.end).map(c => [c.a, c.b]).sort((p, q) => p[0] - q[0]);
  let cov = 0, reach = -Infinity; for (const [a, b] of seg) { if (b > reach) { cov += b - Math.max(a, reach); reach = b; } }
  const moments = new Set(cues.map(c => c.sc.id)).size;
  if (cdur > 0 && cov / cdur < 0.5 && moments < 3) add('warn', 'brand-coverage', `brand visible ${Math.round(100 * cov / cdur)} % of the runtime, in ${moments} scene(s) (>= 50 % or >= 3 moments: open, middle, end)`);
}

// P1-3 CTA: one verb-first action <= 5 words, >= 3 s (2 s in a <= 6.5 s bumper, 4 s from 25 s), contact path, VO = screen
const CTA_VERBS = {
  vi: ['đặt', 'nhận', 'xem', 'gọi', 'đăng ký', 'tải', 'hỏi', 'ứng tuyển', 'liên hệ', 'mua', 'dùng thử', 'thử', 'tìm hiểu', 'ghé', 'đến', 'nhắn', 'quét', 'bấm', 'theo dõi', 'tham gia', 'khám phá', 'tính', 'yêu cầu', 'gửi', 'đọc', 'gặp', 'học', 'chơi', 'nghe'],
  en: ['book', 'get', 'see', 'watch', 'call', 'register', 'sign up', 'download', 'ask', 'apply', 'contact', 'buy', 'try', 'learn', 'visit', 'join', 'start', 'scan', 'request', 'shop', 'order', 'claim', 'meet', 'explore', 'follow', 'calculate', 'talk', 'chat', 'read', 'discover', 'find', 'subscribe', 'tap', 'play']
};
function ruleCta() {
  const { B, sev, low, plain, endSc, flat, kids, lang } = AD;
  if (!AD.isAd) return;
  if (!endSc) {
    const loopCta = SB.loop && flat.some(x => x.L.kind === 'button' && x.b >= TL.dur - 0.05 && x.b - Math.max(x.a, TL.dur - 3) >= 2.95);
    if (!loopCta) add(sev, 'cta', 'no end card (SB.end): one verb-first CTA on screen >= 3 s');
    return;
  }
  const E0 = SB.end || {}, cta = plain(E0.cta || ''), endText = low([E0.title, cta, ...[].concat(E0.lines || [])].filter(Boolean).map(plain).join(' '));
  const minEnd = TL.dur <= 6.5 ? 2 : TL.dur >= 25 ? 4 : 3;
  if (endSc.dur < minEnd - 0.01) add(minEnd === 4 && endSc.dur >= 2.99 ? 'warn' : sev, 'cta-time', `end card ${endSc.dur.toFixed(1)} s (>= ${minEnd} s for a ${Math.round(TL.dur)} s video)`, { scene: endSc.id });
  if (kids) {
    if (!/(bố mẹ|ba mẹ|cha mẹ|phụ huynh|parent|grown-?up|caregiver)/i.test(endText)) add(sev, 'cta', 'kids: the call to action addresses parents ("Bố mẹ …", "Parents: …")', { scene: endSc.id, layer: 'parent' });
    if (/(^|[\s,.!])(mua|đặt hàng|buy|order)([\s,.!]|$)/i.test(endText)) add(sev, 'cta', 'kids: no purchase call aimed at children', { scene: endSc.id, layer: 'purchase' });
  } else if (!cta) add(sev, 'cta', 'end card has no `cta` (one verb-first action, <= 5 words)', { scene: endSc.id, layer: 'cta' });
  else {
    const c = low(cta), V = CTA_VERBS[lang].concat(CTA_VERBS[lang === 'vi' ? 'en' : 'vi']);
    if (!V.some(v => c === v || c.startsWith(v + ' '))) add('warn', 'cta', `CTA "${cta}" should start with a verb (${CTA_VERBS[lang].slice(0, 8).join(', ')} …)`, { scene: endSc.id, layer: 'verb' });
    if (KVC.words(cta).length > 5) add('warn', 'cta', `CTA "${cta}" has ${KVC.words(cta).length} words (<= 5)`, { scene: endSc.id, layer: 'words' });
  }
  if (B && B.contact) { if (!endText.includes(low(plain(B.contact)))) add(sev, 'cta-contact', `brief.contact "${B.contact}" is not on the end card (lines / cta)`, { scene: endSc.id }); }
  else if (B && ['conversion', 'consideration', 'recruitment', 'launch'].includes(B.objective)) add('warn', 'cta-contact', 'brief.contact missing: give the end card a contact path (web, QR, hotline / Zalo)');
  const say = low(AD.sayIn(endSc));
  if (say && cta) { const w = KVC.words(low(cta)); if (w.filter(x => say.includes(x)).length / w.length < 0.5) add('warn', 'cta-vo', 'the end-card VO should say the CTA words shown on screen', { scene: endSc.id }); }
}

// P1-4 claims: typed sources, one claim per card, claim budget by length, testimonial consent, urgency and comparison proof
function ruleClaims() {
  const { B, sev, flat, content, isClaimKey, srcVal, typeOf } = AD;
  const TYPES = ['spec', 'stat', 'comparative', 'testimonial', 'quote', 'deadline', 'offer', 'tagline', 'metaphor', 'contact', 'date', 'event', 'job'];
  for (const [k, v] of Object.entries(SB.sources || {})) if (v && typeof v === 'object') {
    if (v.type === 'superlative') add(sev, 'claim-type', `source ${k}: superlative claims are removed by owner policy (references/legal_compliance.md); state the concrete, sourced fact instead`, { layer: k });
    else if (v.type && !TYPES.includes(v.type)) add('warn', 'claim-type', `source ${k}: type "${v.type}" is not one of ${TYPES.join(' ')}`, { layer: k });
    if ((v.type === 'tagline' || v.type === 'metaphor') && v.approved !== true) add('warn', 'claim-type', `source ${k}: ${v.type} needs owner approval (approved: true)`, { layer: k + '.approved' });
    if (v.proof && !(v.proof.doc && v.proof.no && v.proof.date)) add('warn', 'claim-type', `source ${k}: proof needs doc, no and date (shown on screen by a footnote)`, { layer: k + '.proof' });
  }
  const keysOf = sc => { const s = new Set(), put = k => { if (isClaimKey(k) && typeOf(k) !== 'contact') s.add(k); };
    put(sc.src); flat.filter(x => x.sc === sc).forEach(x => { put(x.L.src); if (Array.isArray(x.L.items)) x.L.items.forEach(i => i && put(i.src)); }); return s; };
  const MULTI = new Set(['stat-tiles', 'compare', 'listicle', 'steps']), all = new Set();
  for (const sc of content) {
    const ks = keysOf(sc); ks.forEach(k => all.add(k));
    const lim = MULTI.has(sc.preset) || flat.some(x => x.sc === sc && x.L.kind === 'tiles') ? 3 : 1;
    if (ks.size > lim) add('warn', 'claim-card', `${ks.size} claims in one scene (${[...ks].join(', ')}): one claim per card (<= ${lim})`, { scene: sc.id });
    for (const x of flat.filter(x => x.sc === sc && x.L.kind === 'counter')) if (!x.L.src && !sc.src) add('warn', 'claim', `counter ${x.L.value} has no src`, { scene: sc.id, layer: x.L.id });
  }
  const d = TL.dur, budget = d <= 7 ? 1 : d <= 16 ? 3 : d <= 31 ? 5 : d <= 61 ? 7 : 9;
  if (all.size > budget) add(sev, 'claim-budget', `${all.size} distinct claims in ${Math.round(d)} s (budget ${budget}: 6 s → 1, 15 s → 3, 30 s → 5, 60 s → 7)`);
  for (const sc of content) {
    const ks = [...keysOf(sc)], tk = ks.filter(k => ['testimonial', 'quote'].includes(typeOf(k)) || (sc.preset === 'testimonial' && k === sc.src));
    if (sc.preset === 'testimonial' && !tk.length) add(sev, 'testimonial', 'testimonial needs src → { type: "testimonial", consent: true, consentDate }', { scene: sc.id, layer: 'src' });
    for (const k of tk) { const v = srcVal(k) || {};
      // an unfilled starter (quote still a <…> placeholder) warns; a real quote on screen without consent is an error
      const ph = /<[^<>\n]{1,48}>/.test(AD.textIn(sc));
      if (v.consent !== true) add(ph ? 'warn' : sev, 'testimonial', `source ${k}: no written consent recorded for the person's words / image (consent: true, consentDate)${ph ? ' — required before a real quote replaces the placeholder' : ''}`, { scene: sc.id, layer: k });
      if (v.typical === false && !sc.typical) add('warn', 'testimonial', `source ${k}: atypical result — also state the typical result (scene typical: '…')`, { scene: sc.id, layer: k + '.typical' }); }
  }
  const dl = B && B.deadline;
  for (const sc of content.filter(s => s.preset === 'countdown' || [...keysOf(s)].some(k => typeOf(k) === 'deadline'))) {
    if (!dl) add(sev, 'urgency', 'deadline / countdown without brief.deadline (ISO date of a real deadline)', { scene: sc.id, layer: 'deadline' });
    else if (sc.preset === 'countdown' && sc.until && sc.until !== dl) add(sev, 'urgency', `countdown until ${sc.until} differs from brief.deadline ${dl}`, { scene: sc.id, layer: 'until' });
    if (sc.preset === 'countdown' && !keysOf(sc).size) add(sev, 'urgency', 'countdown needs src (the document that sets the deadline)', { scene: sc.id, layer: 'src' });
    if (sc.preset === 'countdown' && sc.days != null) add('warn', 'urgency', '"N days left" is true on one serving day only; prefer the absolute date', { scene: sc.id, layer: 'days' });
  }
  if (dl && !Number.isNaN(Date.parse(dl)) && Date.parse(dl) + 864e5 < Date.now()) add('warn', 'urgency', `brief.deadline ${dl} has passed: urgency copy would be false`);
  // comparisons never name or target another company / brand (legal_compliance.md § 3): 'old-new' = your old process vs
  // the new one; 'vs' = two of your OWN options (configurations, models), every row sourced
  for (const sc of content.filter(s => s.preset === 'compare' && s.mode === 'vs')) (sc.rows || []).forEach((r, i) => {
    if (!(r && isClaimKey(r.src))) add(sev, 'comparative', `compare 'vs' row ${i + 1}: rows compare your own options only (never another company or brand) and each needs src`, { scene: sc.id, layer: 'row' + (i + 1) });
  });
  for (const sc of content.filter(s => s.preset === 'before-after')) {
    const A = sc.after && typeof sc.after === 'object' ? sc.after : {};
    if (!sc.illustrative && !A.src && !sc.src) add(sev, 'claim', 'before-after: the after state needs src (a real result) or illustrative: true', { scene: sc.id });
  }
}

// P1-5 reading: Vietnamese chars/s (adult 15 / 17, kids 13 / 15), minimum hold per text, footnote >= 2 s, VI formats
function ruleReading() {
  const { sev, flat, plain, kids, lang } = AD;
  const bright = (typeof SB.theme === 'string' ? SB.theme : SB.theme && SB.theme.base) === 'bright';
  const len = s => plain(s).replace(/\s+/g, ' ').length;
  if (lang === 'vi') for (const sc of TL.scenes) {
    const cps = flat.filter(x => x.sc === sc && x.L.kind !== 'footnote').flatMap(x => KVC.textOf(x.L)).reduce((a, s) => a + len(s), 0) / sc.dur;
    const w = kids || bright ? 13 : 15, e = kids ? 15 : 17;
    if (cps > e) add(sev, 'reading-cps', `${cps.toFixed(1)} chars/s (> ${e}${kids ? ', kids' : ''}): cut words or lengthen the scene`, { scene: sc.id });
    else if (cps > w) add('warn', 'reading-cps', `${cps.toFixed(1)} chars/s (target <= ${w}${kids || bright ? ' for kids / bright' : ''})`, { scene: sc.id });
  }
  const hold = (x, s, a) => { const n = KVC.words(s).length, v = x.b - a, need = 0.3 * n + 0.5; if (n && v + 0.01 < need) add('warn', 'hold', `"${plain(s).slice(0, 32)}" stays ${v.toFixed(1)} s (>= ${need.toFixed(1)} s for ${n} words)`, { scene: x.sc.id, layer: x.L.id + (a > x.a ? '+' + a.toFixed(2) : '') }); };
  for (const x of flat) {
    if (x.L.kind === 'footnote') { if (x.b - x.a < 1.99) add('warn', 'hold', `footnote visible ${(x.b - x.a).toFixed(1)} s (>= 2 s)`, { scene: x.sc.id, layer: x.L.id }); continue; }
    if (x.L.kind === 'list' && Array.isArray(x.L.items)) { const st = AD.tt(x.L.step ?? 0.5); x.L.items.forEach((it, i) => hold(x, String(it), x.a + i * st)); continue; }
    KVC.textOf(x.L).forEach(s => hold(x, s, x.a));
    if (lang === 'vi') for (const s of KVC.textOf(x.L)) if (/\d,\d{3}(?!\d)/.test(s)) add('warn', 'vi-format', `"${plain(s).slice(0, 32)}": Vietnamese uses 1.000 (thousands) and 2,5 (decimals)`, { scene: x.sc.id, layer: x.L.id });
    if (x.L.kind === 'text' && x.L.upper === true && ['display', 'title', 'headline'].includes(x.L.style) && KVC.words([].concat(x.L.text).join(' ')).length > 4) add('warn', 'vi-format', 'uppercase display line > 4 words (stacked diacritics read poorly)', { scene: x.sc.id, layer: x.L.id + '.upper' });
  }
}

// starters (templates/ads) ship with <…> placeholders: warn until every one is replaced (copy, VO, brief, sources)
function rulePlaceholder() {
  const re = /<[^<>\n]{1,48}>/;
  for (const sc of TL.scenes) { const m = re.exec(AD.textIn(sc) + ' ' + AD.sayIn(sc)); if (m) add('warn', 'placeholder', `replace placeholder ${m[0]} (and the scene's other <…> copy) before delivery`, { scene: sc.id }); }
  const bad = Object.entries(Object.assign({ brief: SB.brief }, SB.sources || {})).filter(([, v]) => v && re.test(JSON.stringify(v))).map(([k]) => k);
  if (bad.length) add('warn', 'placeholder', `placeholders left in ${bad.join(', ')} (brief / claims table: real text, source, proof, consent date)`);
}

// legal terms: delegated to the legal gate (KL: scanTimeline, else scanText) next to this file. MANDATORY (owner
// policy): a missing, unloadable or failing scanner is an ERROR, never a silent skip; there is no opt-out switch. Steps
// aside only when this file already calls the gate elsewhere (the legal worker's own wiring), so findings are not doubled.
// The gate's file name is built, not written out: apply-legal-patches.mjs uses that literal as its "already applied" marker
// for kv-lint.mjs, so this block must not contain it (either apply order then yields exactly one active gate).
async function ruleLegal() {
  if ((fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').match(/scanTimeline\(/g) || []).length > 1) return;
  const KL = ['kv-legal', 'mjs'].join('.'), LG = `legal gate not installed (copy ${KL} + legal/ via kv init): superlative / sensitive wording is unchecked`;
  if (!fs.existsSync(path.join(HERE, KL)) || !fs.existsSync(path.join(HERE, 'legal'))) { add('error', 'legal', LG); return; }
  let L; try { L = await import(new URL('./' + KL, import.meta.url).href); } catch (e) { add('error', 'legal', `${KL} did not load (${e.message}) — ${LG}`); return; }
  if (typeof L.scanTimeline !== 'function' && typeof L.scanText !== 'function') { add('error', 'legal', `${KL} exports neither scanTimeline nor scanText — ${LG}`); return; }
  const audience = AD.kids ? 'kids' : undefined, out = [];
  try {
    if (typeof L.scanTimeline === 'function') out.push(...L.scanTimeline(SB, TL, { projectDir: P, audience }).findings);
    else for (const sc of TL.scenes) out.push(...L.scanText(AD.textIn(sc) + '\n' + AD.sayIn(sc), { audience }).map(f => Object.assign({ scene: sc.id }, f)));
  } catch (e) { add('error', 'legal', `legal gate failed: ${e.message}`); return; }
  for (const f of out) if (f && f.sev !== 'info')
    add(f.sev === 'warn' ? 'warn' : 'error', 'legal', `"${f.term}" (${f.cat || f.ruleId || 'legal'}): ${f.suggestion || f.fix || 'see references/legal_compliance.md'}`, { scene: f.scene, layer: `${f.layer || f.where || ''}:${f.index ?? ''}` });
}
ruleBrief(); ruleBrand(); ruleCta(); ruleClaims(); ruleReading(); rulePlaceholder(); await ruleLegal();

// ------------------------------------------------------------------ legal gate (kv-legal.mjs, lexicon kv/legal/lexicon.json)
// every text field, list item, chip, tile, button, bubble, end card and `say` line + captions: superlatives / absolute
// claims (owner policy: removed, no proof path), political, inciting, discriminatory, obscene wording, prohibited
// products, foreign-currency prices. Errors fail lint, so `make` stops before score and render.
{
  const lf = path.join(HERE, 'kv-legal.mjs');
  if (!fs.existsSync(lf)) add('error', 'legal', 'kv/kv-legal.mjs and kv/legal/ are missing: copy them from the skill (scripts/kv/) — the legal gate is mandatory');
  else if (!fs.existsSync(path.join(HERE, 'legal', 'lexicon.json'))) add('error', 'legal', 'legal gate not installed: kv/legal/lexicon.json is missing — copy kv/legal/ from the skill (scripts/kv/) or re-run kv init; the legal gate is mandatory'); // integration: clean ERROR, not an uncaught ENOENT
  else {
    const LG = await import(new URL('./kv-legal.mjs', import.meta.url).href);
    const r = LG.scanTimeline(SB, TL, { projectDir: P, audience: SB.audience, final: false }); // draft: pending legal_review.json = warning
    for (const f of r.findings) if (f.sev !== 'info') add(f.sev, 'legal', `${f.cat}: "${f.term}" in "${f.context}" — ${f.suggestion}`, { scene: f.scene || f.where, layer: [f.layer, f.key, f.line, f.index].filter(x => x != null).join(':') });
    // proper-name / allow-list suppressions are never silent
    const inf = r.findings.filter(f => f.sev === 'info');
    if (inf.length && !J) console.log(`legal: ${inf.length} suppression(s) — ${inf.map(f => `"${f.term}" in ${f.where} (${f.note})`).join('; ')}`);
  }
}

// ------------------------------------------------------------------ layout rules (browser)
const MOTION_SEEN = new Set();
const probeTimes = [...new Set([0, ...TL.scenes.flatMap(s => [s.t0 + Math.min(s.dur * 0.62, s.dur - 0.1), s.t1 - 0.12])].map(t => +t.toFixed(3)))].sort((a, b) => a - b);
const inter = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
for (const [aspect, v] of Object.entries(CFG.variants)) {
  const out = path.join(P, `.probe_${aspect}.json`);
  const r = spawnSync(process.execPath, [tool('render.mjs'), '--project', P, '--variant', aspect, '--probe', probeTimes.join(','), '--probe-out', out], { encoding: 'utf8' });
  if (r.status !== 0) { add('error', 'runtime', `${aspect}: page failed — ${(r.stderr || r.stdout).trim().split('\n').slice(0, 3).join(' | ')}`, { aspect }); continue; }
  const frames = JSON.parse(fs.readFileSync(out, 'utf8')); fs.rmSync(out, { force: true });
  for (const x of (frames[0] && frames[0].issues) || []) { const k = x.rule + '|' + x.layer + '|' + x.msg; if (!MOTION_SEEN.has(k)) { MOTION_SEEN.add(k); add(x.level, x.rule, x.msg, { scene: x.scene, layer: x.layer }); } }
  const A = KVC.ASPECTS[aspect].A, W = v.w, H = v.h, minPx = A === 'h' ? 26 : 28;
  for (const f of frames) {
    if (f.t === 0 && !f.texts.some(x => x.alpha > 0.5)) add('warn', 'hook', 'frame 0 has no readable text (thumbnail / autoplay start)', { aspect, t: 0, scene: f.scene });
    const T = f.texts.filter(x => x.alpha > 0.5 && x.w > 2), at = { aspect, t: f.t, scene: f.scene };
    for (const x of T) {
      const o = Object.assign({ layer: x.id, text: x.text }, at);
      if (x.x < -2 || x.y < -2 || x.x + x.w > W + 2 || x.y + x.h > H + 2) add('error', 'frame', `text outside the frame [${x.x},${x.y},${x.w},${x.h}]`, o);
      else if (A === 'v' && (x.y < 190 || x.y + x.h > 1530 || (x.x + x.w > 950 && x.y + x.h > 1000))) add('error', 'safe-zone', `text in the 9:16 platform UI zone [${x.x},${x.y},${x.w},${x.h}] (keep y 190-1530, x <= 950 below y 1000)`, o);
      else if (x.x < (A === 'h' ? 60 : 36) || x.x + x.w > W - (A === 'h' ? 60 : 36)) add('warn', 'margin', `text within the edge margin [${x.x},${x.w}]`, o);
      if (x.px < minPx) add('warn', 'size', `text ${x.px} px is small for ${aspect} (>= ${minPx})`, o);
      const need = x.px >= 40 ? 3 : 4.5;
      if (x.contrast < 2) add('error', 'contrast', `contrast ${x.contrast}:1 on bg rgb(${x.bg}) — unreadable`, o);
      else if (x.contrast < need) add('warn', 'contrast', `contrast ${x.contrast}:1 (< ${need}:1) on bg rgb(${x.bg})${x.bgStd > 40 ? ', busy background' : ''}`, o);
    }
    for (let i = 0; i < T.length; i++) for (let j = i + 1; j < T.length; j++) {
      const a = T[i], b = T[j]; if (a.id === b.id) continue;
      const ov = inter(a, b); if (ov > 0.08 * Math.min(a.w * a.h, b.w * b.h)) add('error', 'overlap', `"${a.text.slice(0, 24)}" overlaps "${b.text.slice(0, 24)}"`, Object.assign({ layer: `${a.id} / ${b.id}` }, at));
    }
    // illustrations/icons under text: their box (+10 % for hats, rays, arms) should not reach into a text box
    for (const p of f.boxes.filter(b => (b.kind === 'illus' || b.kind === 'icon') && b.alpha > 0.3)) {
      const q = { x: p.x - p.w * 0.05, y: p.y - p.h * 0.1, w: p.w * 1.1, h: p.h * 1.1 };
      for (const x of T) if (inter(q, x) > 0.1 * x.w * x.h) add('warn', 'art-text', `${p.kind} ${p.id} reaches into "${x.text.slice(0, 24)}" (move/shrink it or the text)`, Object.assign({ layer: `${p.id} / ${x.id}` }, at));
    }
    for (const p of f.boxes.filter(b => b.protect && b.alpha > 0.3)) for (const x of T) if (inter(p, x) > 0.05 * x.w * x.h) add('error', 'protect', `"${x.text.slice(0, 24)}" covers protected ${p.kind} ${p.id}`, Object.assign({ layer: x.id }, at));
  }
}
// ------------------------------------------------------------------ report
const seen = new Set(), list = issues.filter(i => { const k = [i.level, i.rule, i.scene, i.layer, i.aspect, i.rule === 'motion' ? i.msg : ''].join('|'); if (seen.has(k)) return false; seen.add(k); return true; });
const errors = list.filter(i => i.level === 'error').length, warns = list.length - errors;
if (J) console.log(JSON.stringify({ ok: errors === 0, errors, warnings: warns, probeTimes, issues: list }));
else {
  for (const i of list) console.log(`${i.level === 'error' ? 'ERROR' : 'warn '} ${i.rule.padEnd(10)} ${[i.aspect, i.scene, i.t != null ? i.t.toFixed(2) + 's' : null, i.layer].filter(Boolean).join(' · ')}  ${i.msg}`);
  console.log(`lint: ${errors} error(s), ${warns} warning(s) — ${Object.keys(CFG.variants).length} aspects × ${probeTimes.length} probe frames`);
}
process.exit(errors ? 1 : 0);

// ------------------------------------------------------------------ README
// object-form sources (references/ad_script_templates.md, claims table) -> one README cell
function srcCell(v) {
  if (!v || typeof v !== 'object') return String(v ?? '').replace(/\|/g, '\\|');
  const p = v.proof || {};
  return [v.text, v.type && `(${v.type})`, v.url || v.doc, p.doc && [p.doc, p.no, p.date].filter(Boolean).join(' '), v.consent === true && `consent ${v.consentDate || 'yes'}`, v.approved === true && 'approved']
    .filter(Boolean).join(' · ').replace(/\|/g, '\\|');
}
function readme() {
  const f2 = t => t.toFixed(2), rows = TL.scenes.map(s => {
    const kinds = s.preset ? `preset \`${s.preset}\`` : [...new Set(s.layers.map(L => L.kind))].join(', ');
    const text = [], snd = [];
    walk(s.layers, L => { KVC.textOf(L).forEach(x => text.push(x.replace(/\*/g, ''))); }, s);
    TL.events.filter(e => e.scene === s.id).forEach(e => snd.push(e.type === 'sfx' ? e.name : e.type === 'say' ? `VO "${e.text}"` : e.type === 'trans' ? `${e.name} whoosh` : e.type));
    return `| ${f2(s.t0)}–${f2(s.t1)} | ${s.id} | ${kinds}${s.trans.type !== 'cut' ? ` · in: ${s.trans.type}` : ''} | ${text.join(' / ').replace(/\|/g, '\\|') || '—'} | ${snd.join(', ') || '—'} | ${s.energy} |`;
  });
  const qa = Object.keys(CFG.variants).map(a => { const q = path.join(P, 'qa', `${CFG.name}_${a}_qa.json`); if (!fs.existsSync(q)) return `| ${a} | not run | | |`; const j = JSON.parse(fs.readFileSync(q, 'utf8')); const c = Object.fromEntries((j.checks || []).map(x => [x.id, x])), fails = (j.checks || []).filter(x => x.status === 'FAIL').map(x => x.id); return `| ${a} | ${j.result || (fails.length ? 'FAIL' : 'PASS')}${fails.length ? ' (' + fails.join(', ') + ')' : ''} | ${c.integrated_loudness?.value ?? ''} LUFS | ${c.true_peak?.value ?? ''} dBTP |`; });
  const vo = fs.existsSync(path.join(P, 'vo.json')) ? JSON.parse(fs.readFileSync(path.join(P, 'vo.json'), 'utf8')) : [];
  const st = fs.existsSync(path.join(P, '.kv-status.json')) ? JSON.parse(fs.readFileSync(path.join(P, '.kv-status.json'), 'utf8')) : {};
  const sj = fs.existsSync(path.join(P, 'score.json')) ? JSON.parse(fs.readFileSync(path.join(P, 'score.json'), 'utf8')) : null;
  const bed = sj && sj.preset !== 'none'; // music: false -> no bed: no LD figures (they would read the silence)
  const sound = sj ? [`- Sound engine ${sj.engine}: ${sj.mode ? `${sj.tonic} ${sj.mode}, scale ${sj.scale}, progression ${(sj.progression || []).join('–')}${sj.lift ? `, lift +${sj.lift.semitones} at ${sj.lift.at} s` : ''}` : bed ? `preset ${sj.preset}` : 'voice and SFX only'}${sj.swing ? `, swing ${sj.swing}` : ''}`,
    sj.motif ? `- Signature motif (${sj.motif.source}): degrees ${sj.motif.deg.join(' ')} on beats ${sj.motif.rh.join(' ')}, ${sj.motif.timbre}; hook at ${sj.motif.hookT ?? '—'} s, ${sj.motif.occurrences.length} statements, sting ${sj.motif.hookMatchesSting ? 'repeats the hook' : 'differs from the hook'}` : null,
    sj.cadence ? `- Cadence ${sj.cadence.join('–')} → ${sj.sting}${sj.dip ? `; dip \`${sj.dip}\` before payoff \`${sj.payoff}\`` : ''}; ${sj.builds.length} build-up(s)` : null,
    sj.ld && sj.ld.min != null ? `- Voice: lines loudness-normalised (spread ${sj.ld.lineSpread} LU)${bed ? `, slot ${sj.ld.slot || 'off'}, speech-to-bed LD min/median ${sj.ld.min}/${sj.ld.median} LU (target ${sj.ld.target})` : ''}` : null,
    sj.stems ? `- Stems: ${sj.stems.map(f => `\`${f}\``).join(', ')}` : null].filter(Boolean).join('\n') : '';
  const md = `# ${SB.name}

Generated by \`node kv.mjs readme\` from storyboard.js (edit the storyboard, not this file).
${SB.title ? `\n${SB.title}\n` : ''}
- Duration ${TL.dur.toFixed(2)} s · ${TL.bpm} BPM · ${TL.fps} fps · theme \`${typeof SB.theme === 'string' ? SB.theme : (SB.theme && SB.theme.base) || 'dark'}\` · music \`${SB.music === false ? 'none' : (SB.music && (SB.music.preset || SB.music.file)) || 'playful'}\`
- Outputs: ${Object.keys(CFG.variants).map(a => `\`${CFG.name}_${a}.mp4\``).join(', ')}${vo.length ? ` · captions \`${CFG.name}.srt\` / \`.vtt\`` : ''}

## Storyboard

| Time (s) | Scene | Visual | On-screen text | Sound | Energy |
|---|---|---|---|---|---|
${rows.join('\n')}

## Sources

${Object.keys(SB.sources || {}).length ? '| Key | Source |\n|---|---|\n' + Object.entries(SB.sources).map(([k, v]) => `| ${k} | ${srcCell(v)} |`).join('\n') : 'No factual claims on screen (lint checks numbers without a source).'}

## Sound

${sound ? sound + '\n\n' : 'Classic score (engine 1). '}${SB.music === false ? 'No music; SFX:' : SB.music && SB.music.file ? `Music: supplied file \`${SB.music.file}\` (licence/provenance in \`licenses/\`); SFX` : 'Music and SFX:'} original synthesis (\`kv/kv-score.mjs\`, seeded) — synthesized, not a recording of the product.

## Voice

${vo.length ? '| Time | Line | Voice | Length |\n|---|---|---|---|\n' + vo.map(l => `| ${f2(l.t)} | ${l.text} | ${l.voice} | ${l.dur} s |`).join('\n') : 'No voice-over.'}

## QA

| Aspect | Result | Loudness | True peak |
|---|---|---|---|
${qa.join('\n')}

${st.build ? `Last build: ${st.build.at} (${st.build.secs} s, encoder ${st.build.encoder}).` : ''} Audio verified by measurement only (not auditioned by ear).

## Rebuild

\`\`\`bash
node kv.mjs make            # compile, lint, score, stills, build, qa, readme
node kv.mjs make --until stills
node patch.mjs --from <s>   # late fix: re-render only from <s>
\`\`\`
`;
  fs.writeFileSync(path.join(P, 'README.md'), md);
  console.log('readme -> ' + path.join(P, 'README.md'));
}

// ------------------------------------------------------------------ motion rules (references/motion_patterns.md)
// eases are evaluated with the runtime's own KV.easeOf (kv-runtime.js + lib/engine.js loaded in node:vm, no DOM)
function motionRules() {
  let KVR = null;
  try { const w = {}; w.window = w; const c = vm.createContext(Object.assign(w, { Math, console })); vm.runInContext(fs.readFileSync(tool('lib/engine.js'), 'utf8'), c); w.KVC = KVC; vm.runInContext(fs.readFileSync(path.join(HERE, 'kv-runtime.js'), 'utf8'), c); KVR = w.KV; } catch (e) { add('warn', 'motion', 'motion rules skipped: ' + e.message); return; }
  const T = v => KVC.time(v, TL.beat, TL.bar), vals = v => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length && Object.keys(v).every(k => 'hfvs'.includes(k)) ? Object.values(v) : [v];
  // an ease leaves 0..1 (overshoot or undershoot) on a data block: a style warning, not an error -- no data block can show a wrong
  // value (chart.js clamps every value ease to 0..1; counter / tiles count on a fixed E.o and use the ease only for the enter move)
  const strays = e => { if (e == null || e === '') return false; if (typeof e === 'object' && !Array.isArray(e)) return e.spring > 0; const f = KVR.easeOf(e); if (!f) return false; for (let i = 1; i < 400; i++) { const v = f(i / 400); if (v > 1.0005 || v < -0.0005) return true; } return false; };
  const typeOf = v => typeof v === 'string' ? v : v && v.type;
  const DATA = new Set(['bars', 'linechart', 'donut', 'counter', 'tiles']), DEFORM = ['stretch', 'flip', 'swing'], IDLE_DEFORM = ['hop', 'shake', 'drift'];
  const blendOf = L => L.blend ?? (L.src === 'mark' ? BRAND.markBlend : L.src === 'logoInverse' || L.inverse ? BRAND.logoWideInverseBlend : BRAND.logoWideBlend);
  for (const sc of TL.scenes) {
    const starts = [];
    const walkM = (layers, inStagger) => (layers || []).filter(Boolean).forEach(L => {
      const at = { scene: sc.id, layer: L.id || L.kind };
      const eases = [L.ease, ...vals(L.enter).map(v => v && v.ease), ...vals(L.exit).map(v => v && v.ease), ...vals(L.keys).flatMap(k => (k || []).map(x => x && x.ease))];
      const enters = [...vals(L.enter), ...vals(L.exit)].map(typeOf), idles = vals(L.idle);
      if (DATA.has(L.kind) && eases.some(strays)) add('warn', 'overshoot', `${L.kind}: ease ${JSON.stringify(eases.find(strays))} overshoots — values stay right (clamped), but data reads calmer without bounce (o / io / smooth / decel)`, at);
      if (L.kind === 'logo' && (enters.some(t => DEFORM.includes(t)) || idles.some(t => IDLE_DEFORM.includes(t)) || L.smear || L.tint)) add('error', 'brand', 'logo: no stretch / flip / swing / hop / shake / drift / smear / tint — reveal it with fade, scale, blur, mask, wipe or iris and hold it still', at);
      if ((L.kind === 'photo' || L.kind === 'text') && (enters.includes('stretch') || idles.includes('hop') || L.smear)) add('error', 'deform', `${L.kind}: squash / stretch / smear distorts photos and type — keep them for soft objects`, at);
      if (L.kind === 'logo' && L.sheen && blendOf(L) === 'multiply') add('warn', 'sheen', 'sheen on a multiply-blend (paper) logo is invisible — use the inverse logo on dark, or no sweep', at);
      const nums = L.kind === 'bars' ? (L.race ? (L.race.frames || []).flat() : (L.items || []).map(o => o && o.value)) : L.kind === 'donut' ? (L.items || []).map(o => o && o.value) : L.kind === 'linechart' ? (L.series || []).flatMap(o => (o && o.values) || []) : [];
      if (nums.some(v => typeof v === 'number') && !L.src && !sc.src && !(L.items || []).some(o => o && o.src)) add('warn', 'claim', `${L.kind} shows numbers without src (add src: '<key in SB.sources>')`, at);
      for (const ks of vals(L.keys)) (ks || []).forEach((k, i) => { if (!i || !k || (k.ease ?? ks[i - 1].ease) !== 'lin') return; const a = ks.slice(0, i).reverse().find(x => x && x.pos), d = a && k.pos ? Math.hypot(k.pos[0] - a.pos[0], k.pos[1] - a.pos[1]) : 0, dt = T(k.t) - T(ks[i - 1].t);
        if (d > 1 / 3 && dt < 1.5) add('warn', 'speed', `linear move over ${Math.round(d * 100)} % of the zone in ${dt.toFixed(2)} s — ease spatial moves (io / std)`, at); });
      const moving = L.kind !== 'bg' && L.kind !== 'stack' && typeOf(L.enter) !== 'none' && !(T(L.in) < 0.05 && (sc.i === 0 || sc.trans.type !== 'cut')); // frame-0 hook and layers revealed by the scene's transition = one gesture
      if (moving && !inStagger) starts.push(T(L.in));
      walkM(L.layers, inStagger || !!L.stagger); // a staggered container counts as one gesture
    });
    walkM(sc.layers, false);
    starts.sort((a, b) => a - b).forEach(t => { const n = starts.filter(x => x >= t && x < t + 0.5).length; if (n > 3) add('warn', 'motion', `${n} layers start moving within 0.5 s at ${t.toFixed(2)} s — one focal point per beat (stagger or step them)`, { scene: sc.id }); });
    // bg edge, zoom-aware: each frame's four corners are mapped back through the camera exactly as kv-runtime drawScene0
    // applies it (pivot, push-in, pan × depth, roll; shake as a bound). The bg paints 80 px past the frame, so a push-in
    // buys (pivot -> edge) × (1 − 1 / zoom) of extra travel (≈ 192 px at 1.25 on a 1920 frame)
    const c = sc.cam || (sc.zoom ? { s: [1, sc.zoom] } : null); if (c) {
      const lerp = (a, b, k) => a + (b - a) * k, cl = v => Math.max(0, Math.min(1, v)), at = c.at || [0.5, 0.5], sk = c.shake && (c.shake === true ? {} : c.shake);
      const ks = c.keys && c.keys.length ? (() => { let p = { s: 1, x: 0, y: 0, r: 0 }; return c.keys.map(k => (p = Object.assign({}, p, k, { t: T(k.t) }))); })() : null;
      const camAt = st => { if (ks) { if (st <= ks[0].t) return ks[0]; if (st >= ks[ks.length - 1].t) return ks[ks.length - 1]; let i = 0; while (st > ks[i + 1].t) i++; const a = ks[i], b = ks[i + 1], k = (KVR.easeOf(b.ease) || KVR.easeOf('io'))((st - a.t) / (b.t - a.t)); return { s: lerp(a.s, b.s, k), x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), r: lerp(a.r, b.r, k) }; }
        const k = (KVR.easeOf(c.ease) || KVR.easeOf('lin'))(cl(st / (sc.dur + (c.over ?? 0.6)))), g = v => Array.isArray(v) ? lerp(v[0], v[1], k) : v ?? 0; return { s: g(c.s ?? 1) || 1, x: g(c.x), y: g(c.y), r: g(c.r) }; };
      const FB = { h: 'sfv', f: 'vsh', v: 'fsh', s: 'fvh' }, per = (v, A) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length && Object.keys(v).every(k => 'hfvs'.includes(k)) ? (A in v ? v[A] : v[[...FB[A]].find(k => k in v)]) : v;
      const bgs = (sc.layers || []).filter(L => L && L.kind === 'bg'), list = bgs.length ? bgs : [Object.assign({ id: sc.id + '.bg' }, sc.bg && typeof sc.bg === 'object' ? sc.bg : {})];
      for (const v of Object.values(CFG.variants)) { const W = v.w, H = v.h, A = KVC.aspectKey(W, H), U = Math.min(W, H) / 1080, px = at[0] * W, py = at[1] * H;
        for (const L of list) { const dv = per(L.depth, A), d = dv == null ? 1 : +dv; let worst = 0, when = 0;
          for (let f = 0; f <= sc.dur * 30; f++) { const st = f / 30, q = camAt(st), s = 1 + ((q.s || 1) - 1) * d, sx = (q.x || 0) * W * d, sy = (q.y || 0) * H * d, r = (q.r || 0) * Math.PI / 180, co = Math.cos(r), si = Math.sin(r);
            let j = 0; if (sk) { const tt = st - T(sk.at ?? 0); if (tt >= 0) j = Math.exp(-tt / (sk.decay ?? 0.1)) * (sk.amp ?? 14) * U * (Math.abs(co) + Math.abs(si)) / s; }
            for (const [X, Y] of [[0, 0], [W, 0], [0, H], [W, H]]) { const ux = X - px, uy = Y - py, cx = px + sx + (co * ux + si * uy) / s, cy = py + sy + (co * uy - si * ux) / s; // inverse roll
              const o = Math.max(-80 - cx, cx - W - 80, -80 - cy, cy - H - 80) + j; if (o > worst) { worst = o; when = st; } } }
          if (worst > 0.5) add('warn', 'parallax', `camera shows the bg edge by ${Math.round(worst)} px at ${v.w}x${v.h} (${when.toFixed(2)} s) — the bg has an 80 px margin: pair the pan with a push-in, or lower bg depth or the move`, { scene: sc.id, layer: L.id }); } } }
  }
}
