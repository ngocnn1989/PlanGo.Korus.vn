// KV score: storyboard -> music.wav. Music preset x scene energy, SFX from layer events (pitched to the running
// chord), hit + breath, transition whooshes, voice lines (TTS or WAV) with ducking, end sting. Writes vo.json and
// <Name>.srt / .vtt captions for the spoken lines. Deterministic (seeded), original synthesis only.
//   node kv/kv-score.mjs [out.wav] [--project <dir>]        (build.mjs calls it with cwd = project)
// Sound engine 2 (`music: { engine: 2 }`, kv init default; engine 1 = the classic score, kept bit-identical):
// signature motif (music.motif -> BRAND.sonic.motif -> seeded) stated at the hook, developed per 4-bar phrase,
// answering voice lines and augmented in the end sting; mode/scale/lift; cadence plan (dip pedal, IV-V / bVI-bVII
// into the end card); phrase variation, build-ups + pickup beat, swing/humanize/accents/ghosts; transition->SFX table;
// VO lines loudness-normalised (K-weighted) with per-line duck depth from the measured speech-to-bed loudness difference
// (LD) and a presence/tonal slot; stems; loop mode. Writes score.json (bars, chords, motif, sfx, lines, LD).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createSession, mtof, kms, lufsOfMs } from '../lib/synth.mjs';
import { sfxKit } from '../lib/sfx.mjs';
import { synthLines } from './tts.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), require = createRequire(import.meta.url);
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const P = path.resolve(opt('project', process.cwd()));
const OUT = path.resolve(P, argv[0] && !argv[0].startsWith('--') ? argv[0] : 'music.wav');
const KVC = require(path.join(HERE, 'kv-core.js')), PRESETS = require(path.join(HERE, 'kv-presets.js'));
const BRAND = fs.existsSync(path.join(P, 'brand.js')) ? new Function(fs.readFileSync(path.join(P, 'brand.js'), 'utf8') + ';return BRAND;')() : {};
const SB = new Function('KV', 'BRAND', 'MV', fs.readFileSync(path.join(P, 'storyboard.js'), 'utf8') + ';return SB;')({ define: k => k, presets: PRESETS, R: v => v, col: c => c }, BRAND, {});
const TL = KVC.compile(SB, PRESETS);
const ENG = KVC.engine(SB), E2 = ENG >= 2, LOOP = !!SB.loop, KIDS = SB.audience === 'kids';
const S = createSession({ dur: TL.dur + (E2 && LOOP ? 2 : 0), seed: 20260929 }), X = sfxKit(S), beat = TL.beat, bar = TL.bar;
const M = SB.music === false ? null : Object.assign({ preset: 'playful', key: 'C' }, typeof SB.music === 'string' ? { preset: SB.music } : SB.music || {});

// ------------------------------------------------------------------ harmony
const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const QUAL = { '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], sus4: [0, 5, 7], sus2: [0, 2, 7], dim: [0, 3, 6] };
const keyShift = (() => { const m = /^([A-G])([#b]?)/.exec(M?.key || 'C'); let k = NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0); return k > 6 ? k - 12 : k; })();
const PCN = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
function mkChord(pc, iv, name) {
  let r = 48 + pc; while (r < 53) r += 12;
  const pad = iv.map(i => r + i).concat(r + 12);
  return { pad, arp: pad.map(n => n + 12), bass: 36 + pc > 44 ? 24 + pc : 36 + pc, tones: iv.map(i => (pc + i) % 12), root: pc, name };
}
function chord(name, extra = 0) { // names are relative to C; music.key transposes (keyShift), extra = engine-2 key lift
  const m = /^([A-G])([#b]?)(maj7|m7|m|7|sus4|sus2|dim)?$/.exec(name); if (!m) throw new Error(`music: bad chord "${name}"`);
  const pc = (NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + keyShift + extra + 12) % 12;
  return mkChord(pc, QUAL[m[3] || ''], PCN[pc] + (m[3] || ''));
}
const PRE = {
  playful: { prog: ['C', 'G', 'Am', 'F'], pad: 'keys', drums: 'bouncy', arp: 'pluck', melody: 'bell' },
  corporate: { prog: ['C', 'Am', 'F', 'G'], pad: 'keys', drums: 'soft', arp: 'pluck', melody: null },
  tech: { prog: ['Am', 'F', 'C', 'G'], pad: 'saw', drums: 'punchy', arp: 'pluck', melody: null },
  industrial: { prog: ['Am', 'F', 'C', 'G'], pad: 'saw', drums: 'heavy', arp: 'saw', melody: null },
  calm: { prog: ['C', 'Am', 'F', 'G'], pad: 'choir', drums: null, arp: 'keys', melody: 'keys' },
  // engine 2 trailer vocabulary: drone + heartbeat kicks in act 1, braams on build targets/hits, drums from energy 2
  cinematic: { prog: ['Am', 'F', 'C', 'G'], pad: 'choir', drums: 'heavy', arp: null, melody: 'keys', drone: true, braam: true }
};
const MOTIF_TIMBRE = { playful: 'bell', corporate: 'bell', tech: 'pluck', industrial: 'bell', calm: 'keys', cinematic: 'keys' };
const style = M ? PRE[M.preset] : null;
if (M && !style && !M.file) throw new Error(`music preset "${M.preset}" unknown (${Object.keys(PRE).join(', ')}) — or give music.file`);
// ---- engine 2: mode -> scale + default progression (names relative to C; the first chord's root is the tonic)
const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], mixolydian: [0, 2, 4, 5, 7, 9, 10], lydian: [0, 2, 4, 6, 7, 9, 11] };
const MODEPROG = { major: ['C', 'G', 'Am', 'F'], minor: ['Am', 'F', 'C', 'G'], lydian: ['C', 'D', 'Em', 'D'], mixolydian: ['C', 'Bb', 'F', 'C'], dorian: ['Dm', 'G', 'Dm', 'C'] };
const isMin = n => /^[A-G][#b]?m(?!aj)/.test(n);
const SYN2 = E2 && M && !M.file; // engine-2 composition (a licensed music.file keeps its own harmony)
if (SYN2 && M.mode && !SCALES[M.mode]) throw new Error(`music.mode "${M.mode}" unknown (${Object.keys(SCALES).join(', ')})`);
const PN = SYN2 && !M.progression && M.mode && (isMin(style.prog[0]) ? 'minor' : 'major') !== M.mode ? MODEPROG[M.mode] : (M?.progression || style?.prog || ['C']);
const prog = PN.map(n => chord(n));
const chordAt1 = t => prog[Math.floor(t / bar + 1e-6) % prog.length];
const sceneAt = t => TL.scenes[Math.max(0, TL.scenes.findLastIndex(s => t >= s.t0 - 1e-6))];
const near = (t, list) => list.some(([a, b]) => t >= a - 0.05 && t <= b + 0.1);
// ---- engine 2 harmonic plan: lift (+1/+2 at the last energy-3 scene, >= 10 bars), dominant in the last bar of the dip,
// tonic on the payoff downbeat, IV-V (major) / bVI-bVII (minor) in the last content bar (one chord there under VO)
const MODE = SYN2 ? M.mode || (isMin(PN[0]) ? 'minor' : 'major') : null, MINORISH = MODE === 'minor' || MODE === 'dorian';
const TONIC = SYN2 ? prog[0].root : 0, CONTENT = TL.scenes.filter(s => !s.end), END = LOOP ? null : TL.scenes.find(s => s.end) || null;
const PO = KVC.payoff(TL.scenes), PAY = PO ? PO.pay : null; // payoff = first scene of the final energy-3 / hit block
const DIPC = PO ? PO.before.slice().reverse().filter(KVC.isDipScene) : []; // dip = energy <= 1 (else a stop-down) in the 2 scenes before the payoff
const AUTODIP = DIPC.find(s => s.dip === true) || DIPC.find(s => s.energy <= 1 && s.bed !== false) || DIPC.find(s => s.bed === false || s.bed === 'thin') || null;
const isDip = s => s.dip === true || (s === AUTODIP && s.dip !== false);
const liftSc = SYN2 && M.lift ? CONTENT.find(s => s.lift) || PAY : null; // the lift starts with the payoff: the dip's V pivots into the new key
const LIFT = liftSc && TL.dur / bar >= 10 - 1e-6 ? Math.max(0, Math.min(2, Math.round(+M.lift) || 0)) : 0, liftAt = LIFT ? liftSc.t0 : Infinity;
const shiftAt = t => t >= liftAt - 1e-6 ? LIFT : 0;
const CC = new Map(), chordFor = (name, sh) => { const k = name + '|' + sh; if (!CC.has(k)) CC.set(k, chord(name, sh)); return CC.get(k); };
const rel = (semi, q, sh) => { const k = `rel${semi}${q}|${sh}`; if (!CC.has(k)) { const pc = (TONIC + semi + sh) % 12; CC.set(k, mkChord(pc, QUAL[q], PCN[pc] + q)); } return CC.get(k); };
const lastBar = END && END.t0 - bar >= 0 ? END.t0 - bar : -1;
let CADVO = false; // set once the voice lines are measured: a voice line in the last content bar keeps it on one chord
const CAD = SYN2 && lastBar >= 0 ? (MINORISH ? [rel(8, '', shiftAt(lastBar)), rel(10, '', shiftAt(lastBar))] : [rel(5, '', shiftAt(lastBar)), rel(7, '', shiftAt(lastBar))]) : null;
const DIPS = SYN2 && AUTODIP ? AUTODIP : null, DOM = DIPS ? rel(7, '', shiftAt(PAY.t0)) : null, TON = DIPS ? rel(0, MINORISH ? 'm' : '', shiftAt(PAY.t0)) : null;
function plan(t) {
  if (CAD && t >= lastBar - 1e-6 && t < END.t0) return CADVO ? CAD[1] : CAD[t >= lastBar + bar / 2 - 1e-6 ? 1 : 0];
  if (DIPS && t >= Math.max(DIPS.t0, DIPS.t1 - bar) - 1e-6 && t < DIPS.t1) return DOM;
  if (DIPS && t >= PAY.t0 - 1e-6 && t < PAY.t0 + bar) return TON;
  return null;
}
const chordAt = SYN2 ? t => plan(t) || chordFor(PN[Math.floor(t / bar + 1e-6) % PN.length], shiftAt(t)) : chordAt1;
const STING = SYN2 ? rel(0, MINORISH && !M.picardy ? 'm' : '', shiftAt(END ? END.t0 : TL.dur)) : null;

// ------------------------------------------------------------------ voice first (music rests / ducks around it)
const says = TL.events.filter(e => e.type === 'say');
// legal gate: never synthesize a voice line that carries a legal error (kv-legal.mjs; fix: node kv.mjs legal --fix / --write)
{
  if (says.length && fs.existsSync(path.join(HERE, 'kv-legal.mjs')) && !fs.existsSync(path.join(HERE, 'legal', 'lexicon.json'))) { console.error('kv-score: legal gate not installed: kv/legal/lexicon.json is missing — the legal gate is mandatory before voice synthesis'); process.exit(1); } // integration
  const LG = fs.existsSync(path.join(HERE, 'kv-legal.mjs')) ? await import(new URL('./kv-legal.mjs', import.meta.url).href) : null;
  if (!LG && says.length) { console.error('kv-score: kv/kv-legal.mjs is missing — the legal gate is mandatory before voice synthesis'); process.exit(1); }
  const allow = [].concat((SB.legal && SB.legal.allow) || []), names = [].concat((SB.legal && SB.legal.names) || []), addresses = [].concat((SB.legal && SB.legal.addresses) || []);
  const bad = LG ? says.flatMap(e => LG.scanText(e.text, { audience: SB.audience, allow, names, addresses }).filter(f => f.sev === 'error').map(f => `${e.scene}: "${e.text}" — "${f.term}" (${f.cat}, ${f.ruleId})`)) : [];
  if (bad.length) { console.error(`kv-score: refusing to synthesize ${bad.length} voice line(s) with legal errors:\n  ${bad.join('\n  ')}\nfix: node kv.mjs legal --fix (then --write)`); process.exit(1); }
}
const V = SB.voice || {};
let lines = [];
if (says.length) {
  lines = synthLines(says.map(e => ({ text: e.text, voice: e.voice || V.voice, lang: e.lang || V.lang || 'en-US', rate: e.rate ?? V.rate ?? -8, pitch: V.pitch, file: e.file })), { dir: path.join(P, 'vo') });
  lines.forEach((l, i) => { l.t = says[i].t; l.scene = says[i].scene; });
}
const voWin = lines.map(l => [l.t, l.t + l.dur]);
CADVO = lastBar >= 0 && voWin.some(([a, b]) => a < END.t0 && b > lastBar);

// ------------------------------------------------------------------ engine 2: groove, motif
const SW = E2 ? Math.max(0, Math.min(0.33, +(M && M.swing) || 0)) : 0, HZ = E2 ? Math.max(0, Math.min(1, M && M.humanize != null ? +M.humanize : 1)) : 0;
const sw = t => { if (!SW) return t; const k = Math.round(t / (beat / 2)); return Math.abs(t - k * beat / 2) < 1e-4 && k % 2 ? t + SW * beat / 2 : t; }; // swing off-beat 8ths
const hum = (t, g) => HZ ? [Math.max(0, t + HZ * (S.rnd() - 0.5) * 0.008), g * (1 + HZ * (S.rnd() - 0.5) * 0.16)] : [t, g]; // ±4 ms, ±8 %
const BARS = [], OCC = [], BUILDS = [], SFXLOG = [], ANS = [];
const hashStr = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.codePointAt(0), 16777619); return h >>> 0; };
const mulberry = a => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const SEED = hashStr(SB.name || 'kv');
// motif: { deg: scale degrees (1-based, may go above 7/below 1), rh: onsets in beats, timbre }; source music -> brand -> seeded
function normMotif(v, source) {
  if (!v) return null;
  const o = Array.isArray(v) ? { deg: v } : Object.assign({}, v);
  if (!Array.isArray(o.deg) || o.deg.length < 2) return null;
  o.deg = o.deg.slice(0, 6).map(Number);
  const rh = o.rh || o.rhythm;
  o.rh = Array.isArray(rh) && rh.length >= o.deg.length ? rh.slice(0, o.deg.length).map(Number) : o.deg.map((_, i) => i * 0.5);
  return Object.assign(o, { source });
}
function seededMotif() { // 3-5 notes, mostly stepwise, inside one octave (kids: degrees 1-4, span <= 6 semitones in major)
  const r = mulberry(SEED), n = 3 + Math.floor(r() * 3), hi = KIDS ? 4 : 8, deg = [[1, 3, 5][Math.floor(r() * (KIDS ? 2 : 3))]];
  for (let i = 1; i < n; i++) { const st = [-2, -1, 1, 2, 3][Math.floor(r() * 5)]; let d = deg[i - 1] + st; if (d > hi || d < 1) d = deg[i - 1] - st; deg.push(Math.max(1, Math.min(hi, d))); } // reflect at the edges: no repeats
  const RH = { 3: [[0, 0.5, 1], [0, 1, 1.5], [0, 0.5, 1.5]], 4: [[0, 0.5, 1, 1.5], [0, 0.25, 0.5, 1], [0, 0.5, 0.75, 1.5]], 5: [[0, 0.25, 0.5, 1, 1.5], [0, 0.5, 0.75, 1, 1.5]] }[n];
  return { deg, rh: RH[Math.floor(r() * RH.length)], source: 'seeded' };
}
const BS = BRAND.sonic || {};
const MOT = SYN2 ? normMotif(M.motif, 'music') || normMotif(BS.motif && { deg: BS.motif, rh: BS.rhythm, timbre: BS.timbre }, 'brand') || seededMotif() : null;
const TIMBRE = MOT ? MOT.timbre || style.melody === 'bell' && 'bell' || MOTIF_TIMBRE[M.preset] || 'bell' : null;
// pitch set for the motif/melody (offsets from the tonic): 'diatonic' (mode scale), 'penta' (5-note set of the mode's
// major/relative-major pentatonic), 'penta-minor', 'chord' (diatonic degrees, every note snapped to the chord)
const SCALE = SYN2 ? M.scale || 'diatonic' : null;
if (SYN2 && !['diatonic', 'chord', 'penta', 'penta-minor'].includes(SCALE)) throw new Error(`music.scale "${SCALE}" unknown (diatonic, chord, penta, penta-minor)`);
const SET = !SYN2 ? null : SCALE === 'penta' ? (MINORISH ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9]) : SCALE === 'penta-minor' ? [0, 3, 5, 7, 10] : SCALES[MODE];
const degOff = d => { const n = SET.length, k = Math.round(d) - 1, o = Math.floor(k / n); return SET[((k % n) + n) % n] + 12 * o; };
const MBASE = (() => { if (!MOT) return 72; let b = 60 + TONIC; if (b < 66) b += 12; const top = b + Math.max(...MOT.deg.map(degOff)) + LIFT; return top > (KIDS ? 84 : 91) ? b - 12 : b; })();
const snapPc = (m, pcs) => { for (let d = 0; d < 7; d++) { if (pcs.includes(((m - d) % 12 + 12) % 12)) return m - d; if (pcs.includes((m + d) % 12)) return m + d; } return m; };
const degOfPc = (pc, sh) => { const j = SET.findIndex(o => (TONIC + sh + o) % 12 === pc); return j < 0 ? null : j + 1; };
const XF = { // motif development (repetition, inversion, sequence onto the chord root, fragment, diminution, augmentation)
  orig: f => f,
  inv: f => Object.assign({}, f, { deg: f.deg.map(d => 2 * f.deg[0] - d) }),
  seq: (f, C, sh) => { const r = degOfPc(C.root, sh); if (r == null) return f; const n = SET.length; let dd = r - (((f.deg[0] - 1) % n + n) % n + 1); if (dd > n / 2) dd -= n; if (dd < -n / 2) dd += n; return Object.assign({}, f, { deg: f.deg.map(d => d + dd) }); },
  frag: (f, C, sh, k = 2) => Object.assign({}, f, { deg: f.deg.slice(0, k), rh: f.rh.slice(0, k) }),
  dim: f => Object.assign({}, f, { rh: f.rh.map(r => r / 2), k: (f.k || 1) / 2 }),
  aug: (f, k) => Object.assign({}, f, { rh: f.rh.map(r => r * k), k: (f.k || 1) * k }) // k keeps the original strong-beat grid
};
const MEL_FN = { bell: (t, m, g, L) => S.bell(t, m, g, { dur: L, rev: 0.3 }), keys: (t, m, g, L) => S.keys(t, m, g * 1.1, { dur: L }), pluck: (t, m, g, L) => S.pluck(t, m, g * 1.2, { dur: L * 0.4, bright: 0.6, rev: 0.25 }) };
const inAns = t => ANS.some(([a, b]) => t >= a - 0.05 && t <= b + 0.1);
/** Play a motif form at t0 (kind hook | body | answer | sting); on-beat-1/3 notes snap to the chord, the rest stay in the
 *  scale; the sting ends on the tonic. Records { t, form, pcs, rel } in score.json. */
function playMotif(t0, f, form, g, kind, bus = null) { // bus: a scratch bus for a dry measuring render (not recorded)
  const midi = [], rel = [], sting = kind === 'sting';
  f.deg.forEach((d, i) => {
    let t = t0 + f.rh[i] * beat;
    if (t >= TL.dur - (sting ? 0.3 : 0.2) || near(t, voWin) || near(t, TL.audioGaps) || (kind === 'body' && inAns(t))) return;
    const C = sting ? STING : chordAt(t + 0.001), sh = shiftAt(t);
    let m = MBASE + sh + degOff(d);
    if (sting && i === f.deg.length - 1) m = snapPc(m, [(TONIC + sh) % 12]);
    else if (kind === 'answer' && i === f.deg.length - 1) { // answers end on the chord's root or 3rd (not a repeated note)
      const c = [snapPc(m, [C.tones[0]]), snapPc(m, [C.tones[1]])].filter(x => x !== midi[midi.length - 1]).sort((x, y) => Math.abs(x - m) - Math.abs(y - m));
      m = c[0] ?? m;
    }
    else if (SCALE === 'chord' || Math.abs(f.rh[i] / (f.k || 1) / 2 - Math.round(f.rh[i] / (f.k || 1) / 2)) < 1e-6) m = snapPc(m, C.tones);
    let gg = g; if (kind === 'body' || kind === 'answer') [t, gg] = hum(sw(t), g);
    S.withBus(bus || S.BUS.MEL, () => MEL_FN[TIMBRE](t, m, gg, sting ? (i === f.deg.length - 1 ? 2.2 : 1.4) : 0.7), !!bus);
    midi.push(m); rel.push(((m - TONIC - sh) % 12 + 12) % 12);
  });
  if (midi.length && !bus) OCC.push({ t: +(t0).toFixed(3), kind, form, pcs: midi.map(m => m % 12), rel, midi, gain: +g.toFixed(3) });
}
let HOOK = null; // hook statement: at 0 s, else in the first VO gap that still starts within 3 s; rendered after the bed (see below)
if (MOT && TL.scenes[0].bed !== false) {
  const span = (MOT.rh[MOT.rh.length - 1] + 0.5) * beat, s16 = beat / 4;
  const hookT = [0, ...lines.map(l => Math.ceil((l.t + l.dur + 0.25) / s16) * s16)].find(t => t <= 3 && !voWin.some(([a, b]) => t < b + 0.1 && t + span > a - 0.05));
  if (hookT != null) { HOOK = [hookT, span]; ANS.push([hookT, hookT + span]); }
  lines.forEach((l, i) => { // call and response: the voice is the call, a fragment of the inverted motif answers in the gap
    const a = Math.ceil((l.t + l.dur + 0.25) / s16) * s16, b = i + 1 < lines.length ? lines[i + 1].t : TL.dur - 0.5, sc = sceneAt(a);
    if (b - a < beat || sc.end || sc.bed === false || sc.energy < 1 || ANS.some(([x]) => Math.abs(x - a) < 0.05)) return;
    const fa = XF.frag(XF.inv(MOT), null, 0, 3); playMotif(a, fa, 'answer', 0.045, 'answer'); ANS.push([a, a + (fa.rh[fa.rh.length - 1] + 0.5) * beat]);
  });
}

// ------------------------------------------------------------------ music
if (M && M.file) { // licensed track supplied by the owner
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.env.FFMPEG || 'ffmpeg', ['-v', 'error', '-i', path.resolve(P, M.file), '-ar', '48000', '-ac', '2', '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  const f = new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length / 4), g = M.gain ?? 0.6;
  for (let i = 0; i < S.N && i * 2 + 1 < f.length; i++) { S.BUS.MUSIC[0][i] += f[i * 2] * g; S.BUS.MUSIC[1][i] += f[i * 2 + 1] * g; }
} else if (M && !E2) { // ---- engine 1 (classic; unchanged so finished projects re-score bit-identically)
  const nb = Math.ceil(TL.dur / bar - 1e-6);
  for (let b = 0; b < nb; b++) {
    const tb = b * bar, sc = sceneAt(tb + 0.01), e = sc.energy, C = chordAt(tb + 0.01);
    if (sc.end) continue; // the end card gets its own sting below
    const len = Math.min(bar, TL.dur - tb);
    if (style.pad === 'keys') C.pad.forEach((m, i) => S.keys(tb, m, 0.075, { dur: len * 1.1, pan: (i - 1.5) * 0.3 }));
    else if (style.pad === 'saw') S.sawChord(tb, len, C.pad, e >= 2 ? 0.055 : 0.07, { fc: 900 + e * 500, fcEnd: 1400 + e * 600 });
    else S.choir(tb, len, C.pad, 0.05);
    if (e >= 1) {
      for (let q = 0; q < 4; q++) {
        const t = tb + q * beat; if (t >= TL.dur - 0.05 || near(t, TL.audioGaps)) continue;
        if (style.drums === 'bouncy') { if (q % 2 === 0) S.bass(t, beat * 0.9, C.bass, 0.42); else if (e >= 2) S.bass(t + beat * 0.5, beat * 0.4, C.bass + 12, 0.28); }
        else if (q % 2 === 0 || e >= 3) S.bass(t, beat * (e >= 3 ? 0.45 : 0.9), C.bass, 0.4);
      }
    }
    if (e >= 2 && style.drums) for (let q = 0; q < 8 * (e >= 3 ? 2 : 1); q++) {
      const t = tb + q * beat / (e >= 3 ? 4 : 2); if (t >= TL.dur - 0.05 || near(t, TL.audioGaps)) continue;
      S.hat(t, (q % 2 ? 0.035 : 0.05) * (style.drums === 'soft' ? 0.6 : 1), e >= 3 && q % 4 === 2);
      if (q % (e >= 3 ? 8 : 4) === (e >= 3 ? 4 : 2)) style.drums === 'heavy' ? X.arcSnare(t, 0.45) : S.clap(t, style.drums === 'soft' ? 0.18 : 0.3);
    }
    if (e >= 2 && style.arp) for (let q = 0; q < (e >= 3 ? 16 : 8); q++) {
      const t = tb + q * bar / (e >= 3 ? 16 : 8); if (t >= TL.dur - 0.1) continue;
      const m = C.arp[[0, 1, 2, 3, 2, 1, 2, 3][q % 8]];
      if (style.arp === 'keys') S.keys(t, m, 0.03, { dur: 0.4 }); else S.pluck(t, m, 0.045, { dur: 0.16, bright: 0.5, pan: q % 2 ? 0.3 : -0.3 });
    }
    if (e >= 2 && style.melody) { // chord-tone melody that rests while a voice line speaks
      const pat = [[0, 1, 2, 3], [0, 1.5, 2, 3.5], [0, 0.5, 1, 2], [0, 2, 2.5, 3]][Math.floor(S.rnd() * 4)];
      pat.forEach((bt, j) => {
        const t = tb + bt * beat; if (t >= TL.dur - 0.2 || near(t, voWin) || near(t, TL.audioGaps)) return;
        const m = C.arp[[0, 2, 1, 3][(j + b) % 4]] + 12;
        style.melody === 'bell' ? S.bell(t, m, 0.05, { dur: 0.7, rev: 0.3 }) : S.keys(t, m, 0.05, { dur: 0.8 });
      });
    }
  }
  for (const k of TL.kicks) { const e = sceneAt(k + 0.01).energy; if (style.drums) (style.drums === 'heavy' ? X.clampKick(k, 0.85) : S.kick(k, e >= 3 ? 0.95 : e >= 2 ? 0.85 : 0.7)); }
  const end = TL.scenes.find(s => s.end);
  if (end) { // resolve on the tonic: bell arpeggio + pad, no drums
    const C = chord((M.progression || style.prog)[0].replace(/m.*$/, '')); // the piece's own first chord (custom progressions too)
    C.pad.forEach((m, i) => S.keys(end.t0, m, 0.08, { dur: end.dur + 0.5 }));
    S.choir(end.t0, end.dur, C.pad, 0.035);
    C.arp.forEach((m, i) => S.bell(end.t0 + i * 0.09, m, 0.07, { dur: 1.6 }));
  }
} else if (M) { // ---- engine 2
  const nb = Math.ceil(TL.dur / bar - 1e-6), heavy = style.drums === 'heavy', soft = style.drums === 'soft' ? 0.6 : 1, inVO = t => near(t, voWin);
  // bass onsets (beats) per energy: syncopation 0 / 1-2 / 2-3 per bar (inverted-U groove); arp contour per bar in the phrase
  const BASS = { 1: [[0], [0, 2]], 2: [[0, 1.5, 2, 3.5], [0, 2, 3.5]], 3: [[0, 0.5, 1.5, 2, 3.5], [0, 1, 1.5, 2.5, 3]] };
  const ARPS = [[0, 1, 2, 3, 2, 1, 2, 3], [0, 2, 1, 3, 0, 2, 1, 3], [3, 2, 1, 0, 1, 2, 3, 2], [0, 1, 2, 3, 3, 2, 1, 0]];
  const padFn = (t0, l, C, e, pg, vo) => {
    if (style.pad === 'keys') C.pad.forEach((m, i) => S.keys(t0, m, 0.075 * pg, { dur: l * 1.1, pan: (i - 1.5) * 0.3 }));
    else if (style.pad === 'saw') { const lim = vo ? 1500 : 1e9; S.sawChord(t0, l, C.pad, (e >= 2 ? 0.055 : 0.07) * pg, { fc: Math.min(lim, 900 + e * 500), fcEnd: Math.min(lim, 1400 + e * 600) }); }
    else S.choir(t0, l, C.pad, 0.05 * pg);
    if (style.drone) S.sawChord(t0, l, [C.bass + 12, C.bass + 19], 0.035 * pg, { fc: 380, fcEnd: 520, att: 0.4, rel: 0.6, voices: 3 });
  };
  for (let b = 0; b < nb; b++) {
    const tb = b * bar, sc = sceneAt(tb + 0.01), len = Math.min(bar, TL.dur - tb);
    if (sc.end && !LOOP) continue; // the end card gets the sting below
    const rec = { t: +tb.toFixed(3), scene: sc.id, energy: sc.energy };
    BARS.push(rec);
    if (sc.bed === false) { rec.bed = false; continue; } // stop-down: VO and SFX carry the scene
    const e = sc.energy, sb = Math.max(0, Math.round((tb - sc.t0) / bar)), pb = sb % 4, nx = TL.scenes[sc.i + 1];
    const lastIn = tb + bar >= sc.t1 - 1e-3, build = KVC.buildInto(sc, nx, SB), pick = build ? nx.t0 - beat : Infinity;
    const vo = voWin.some(([a, z]) => a < tb + len && z > tb), c1 = chordAt(tb + 0.01), c2 = chordAt(tb + bar / 2 + 0.01), halves = c1 === c2 ? [c1] : [c1, c2];
    rec.chords = halves.map(C => C.name);
    halves.forEach((C, h) => padFn(tb + h * len / halves.length, len / halves.length, C, e, sc.bed === 'thin' ? 0.5 : 1, vo));
    if (sc.bed === 'thin') { rec.bed = 'thin'; continue; } // thin bed: pad only, -6 dB
    if (e >= 1 && !isDip(sc)) { // bass (out in the dip and in the pickup beat before a build target)
      const pat = BASS[Math.max(1, Math.min(3, Math.floor(e)))][(b + SEED) % 2]; // fractional energies behave like engine 1 (floor)
      pat.forEach((q, j) => {
        const t = tb + q * beat, off = q % 1 !== 0; if (t >= TL.dur - 0.05 || t >= pick - 1e-3 || near(t, TL.audioGaps) || (KIDS && off && inVO(t))) return;
        const C = chordAt(t + 0.001), d = Math.min(2, (pat[j + 1] ?? 4) - q) * beat * (e >= 3 ? 0.5 : 0.85), [u, g] = off ? hum(sw(t), 0.28) : [t, 0.4];
        S.bass(u, d, C.bass + (off ? 12 : 0), g);
      });
      rec.bass = (b + SEED) % 2;
    }
    // phrase end (bar 4 of a phrase, or the last bar of a scene): fill on beat 4 unless a build or a voice line is there
    const pend = pb === 3 || (lastIn && sb >= 1), fill = pend && e >= 2 && !!style.drums && !build && !inVO(tb + 3 * beat) && !inVO(tb + bar - 0.01);
    if (e >= 2 && style.drums) {
      const sub = e >= 3 ? 4 : 2;
      for (let q = 0; q < 4 * sub; q++) {
        const t = tb + q * beat / sub; if (t >= TL.dur - 0.05 || near(t, TL.audioGaps)) continue;
        const under = inVO(t); if (KIDS && under) continue; // kids: energy <= 1 under a voice line
        const [u, g] = hum(sw(t), (q % 2 ? 0.035 : 0.05) * (q % sub === 0 ? 1.26 : 1) * soft * (under ? 0.7 : 1)); // +2 dB on beats, -3 dB under VO
        S.hat(u, g, e >= 3 && q % 4 === 2);
        if (q % (2 * sub) === sub && !(fill && q === 3 * sub)) heavy ? X.arcSnare(t, 0.45) : S.clap(t, style.drums === 'soft' ? 0.18 : 0.3);
        if (e >= 3 && (q === 3 || q === 11) && !under) heavy ? X.arcSnare(t, 0.45 * 0.4) : S.clap(t, 0.3 * 0.4); // ghosts, -8 dB
      }
      if (fill) for (let k = 0; k < 4; k++) { const t = tb + 3 * beat + k * beat / 4; if (t < TL.dur - 0.05 && !near(t, TL.audioGaps)) heavy ? X.arcSnare(t, 0.16 + 0.06 * k) : S.snare(t, 0.12 + 0.05 * k); }
    }
    if (e >= 2 && style.arp) for (let q = 0, n = e >= 3 ? 16 : 8; q < n; q++) { // arp: contour per bar in phrase; no-drum presets turn around up an octave
      const t = tb + q * bar / n; if (t >= TL.dur - 0.1) continue;
      const under = inVO(t); if (KIDS && under) continue;
      const C = chordAt(t + 0.001), m = C.arp[ARPS[pb][q % 8]] + (!style.drums && pend && q >= n / 2 ? 12 : 0), [u, g] = hum(sw(t), (style.arp === 'keys' ? 0.03 : 0.045) * (under ? 0.5 : 1));
      if (style.arp === 'keys') S.keys(u, m, g, { dur: 0.4 }); else S.pluck(u, m, g, { dur: 0.16, bright: 0.5, pan: q % 2 ? 0.3 : -0.3 });
    }
    let form = null; // motif development per phrase position: original/sequence, inversion (answer), sequence, fragment
    if (MOT && e >= 2 && (style.melody || pb === 0)) {
      const sh = shiftAt(tb + 0.01); form = [c1.root === (TONIC + sh) % 12 ? 'orig' : 'seq', 'inv', 'seq', 'frag'][pb];
      let f = XF[form](MOT, c1, sh); if (e >= 3) f = XF.dim(f);
      playMotif(tb, f, form + (e >= 3 ? '+dim' : ''), style.melody ? 0.05 : 0.04, 'body');
      if (e >= 3) playMotif(tb + 2 * beat, f, form + '+dim', style.melody ? 0.05 : 0.04, 'body');
    }
    rec.variant = { arp: pb, fill, form };
  }
  for (const k of TL.kicks) { // TL.kicks already skips stop-downs and pickup beats (kv-core)
    const e = sceneAt(k + 0.01).energy; if (!style.drums) continue;
    if (style.drone && e < 2) S.kick(k, 0.5); // cinematic act 1: heartbeat
    else if (heavy) X.clampKick(k, 0.85); else S.kick(k, e >= 3 ? 0.95 : e >= 2 ? 0.85 : 0.7);
  }
  for (const s of TL.scenes) { // build-ups: riser + snare roll 8ths -> 16ths ending on the target downbeat
    const n = TL.scenes[s.i + 1]; if (!KVC.buildInto(s, n, SB)) continue;
    const kind = n.build === 'riser' || n.build === 'roll' ? n.build : 'both', t1 = n.t0, t0 = Math.max(s.t0, t1 - bar), voOver = voWin.some(([a, z]) => a < t1 && z > t0);
    const hasRiser = TL.events.some(e => e.type === 'sfx' && (e.name === 'riser' || e.name === 'swell') && Math.abs(e.t - t1) < bar);
    if (kind !== 'roll' && !hasRiser) S.riser(t0, t1 - t0, 0.28 * (voOver ? 0.5 : 1));
    let rolls = 0;
    if (kind !== 'riser') for (let k = 0; k < 6; k++) {
      const t = t1 - 2 * beat + (k < 2 ? k * beat / 2 : beat + (k - 2) * beat / 4); if (t < s.t0 || near(t, TL.audioGaps) || near(t, voWin)) continue;
      heavy ? X.arcSnare(t, 0.12 + 0.05 * k) : S.snare(t, 0.1 + 0.05 * k); rolls++;
    }
    if (!n.hit && n.energy >= 3) X.softCrash(t1, 0.18); // release: crash + kick + bass return together on the downbeat
    if (style.braam && !n.hit) X.braam(t1, 1.8, [chordAt(t1 + 0.01).bass, chordAt(t1 + 0.01).bass + 7, chordAt(t1 + 0.01).bass + 12], 0.2);
    BUILDS.push({ t: +t1.toFixed(3), scene: n.id, kind, riser: kind !== 'roll' && !hasRiser, rolls, pickup: +(t1 - beat).toFixed(3) });
  }
  if (END) { // resolve: ringing tonic sized to the end card + the motif augmented x2 ending on the tonic (no fade-out)
    const ring = Math.max(1, END.dur - 0.3);
    STING.pad.forEach((m, i) => S.keys(END.t0, m, 0.08, { dur: ring, pan: (i - 1.5) * 0.2 }));
    S.choir(END.t0, ring * 0.7, STING.pad, 0.035);
    if (style.braam) X.braam(END.t0, 1.8, [STING.bass, STING.bass + 7, STING.bass + 12], 0.2);
    const stingOf = k => { const f = XF.aug(MOT, k), dl = f.deg[f.deg.length - 1], n7 = SET.length; // + a resolving tonic if the motif ends elsewhere
      if (degOff(dl) % 12 !== 0) { f.deg = f.deg.concat(1 + n7 * Math.round((dl - 1) / n7)); f.rh = f.rh.concat(f.rh[f.rh.length - 1] + k); }
      return Object.assign(f, { span: (f.rh[f.rh.length - 1] + 0.5) * beat }); };
    // an end-card voice line goes first: the sting (augmented x2, else plain) follows on the next beat if it still rings >= 1 s
    let sf = stingOf(2), st = END.t0; const vo = voWin.find(([a, z]) => a < END.t0 + sf.span && z > END.t0 - 0.05);
    if (vo) { const t2 = Math.ceil((vo[1] + 0.1) / beat - 1e-6) * beat; for (const k of [2, 1]) { const f = stingOf(k); if (t2 + f.span + 1 <= TL.dur) { sf = f; st = t2; break; } } }
    playMotif(st, sf, sf.k === 2 ? 'aug' : 'orig', 0.07, 'sting');
  } else if (LOOP) { // loop: the last bar is a pickup into bar 1 (light roll; riser when bar 1 is busy)
    for (let k = 0; k < 6; k++) { const t = TL.dur - 2 * beat + (k < 2 ? k * beat / 2 : beat + (k - 2) * beat / 4); if (!near(t, voWin)) S.snare(t, 0.06 + 0.03 * k); }
    if (TL.scenes[0].energy >= 2 || TL.scenes[0].hit) S.riser(TL.dur - bar, bar, 0.2);
  }
}

// ------------------------------------------------------------------ events: transitions, hits, SFX
// FX(t, g, r = round-robin index: rotates the chord tone of repeated tonal SFX in engine 2, e = the event: e.len)
const tone = (t, o = 2) => { const C = chordAt(t); return C.arp[o % C.arp.length]; };
const FX = {
  pop: (t, g, r = 0) => S.voice(t, 0.14, u => Math.sin(2 * Math.PI * (u * mtof(tone(t, r) + 12) * (1 + 1.8 * u / 0.14))) * Math.exp(-u * 30) * Math.min(1, u / 0.002), { gain: g * 0.55, rev: 0.12 }),
  boing: (t, g) => { let ph = 0; S.voice(t, 0.5, u => { ph += (220 + 180 * Math.exp(-u * 6) * Math.sin(2 * Math.PI * 14 * u)) / S.sr; return Math.sin(2 * Math.PI * ph) * Math.exp(-u * 6) * Math.min(1, u / 0.003); }, { gain: g * 0.45, rev: 0.15 }); },
  sparkle: (t, g, r = 0) => [0, 1, 2, 3, 4].forEach(i => S.bell(t + i * 0.055, tone(t, (i + r) % 4) + 24, g * 0.06, { dur: 0.5, pan: (i - 2) * 0.3 })),
  chime: (t, g, r = 0) => [0, 1, 2].forEach(i => S.bell(t + i * 0.1, tone(t, i + r) + 12, g * 0.12, { dur: 1.4 })),
  ding: (t, g, r = 0) => S.bell(t, tone(t, 3 + r) + 12, g * 0.14, { dur: 1.2 }),
  bell: (t, g, r = 0) => S.bell(t, tone(t, r) + 12, g * 0.14, { dur: 1.4 }),
  tada: (t, g, r = 0) => { [0, 1, 2, 3].forEach(i => S.bell(t + i * 0.07, tone(t, i + r) + 12, g * 0.1, { dur: 1.6 })); X.softCrash(t + 0.21, g * 0.25); },
  coin: (t, g) => { X.blip(t, 83, g * 0.3, 0, 0.07); X.blip(t + 0.07, 88, g * 0.3, 0, 0.25); },
  whoosh: (t, g) => S.whoosh(t - 0.12, 0.5, g * 0.5), swoosh: (t, g) => S.whoosh(t - 0.08, 0.3, g * 0.45, false),
  click: (t, g) => X.click(t, g * 0.5), tick: (t, g) => X.tick(t, g * 0.5), blip: (t, g, r = 0) => X.blip(t, tone(t, 2 + r) + 12, g * 0.3), beep: (t, g, r = 0) => X.beep(t, tone(t, 2 + r) + 12, g * 0.2),
  type: (t, g) => { for (let i = 0; i < 8; i++) X.click(t + i * 0.07 + S.rnd() * 0.02, g * 0.25, (S.rnd() - 0.5) * 0.4); },
  laser: (t, g) => X.laser(t, 0.6, g * 0.3), zap: (t, g, r = 0) => X.zap(t, tone(t, 2 + r) + 12, g * 0.3), crackle: (t, g) => X.crackle(t, 0.7, g * 0.3),
  stamp: (t, g) => X.stampHit(t, g * 0.5), boom: (t, g) => X.boomShort(t, g * 0.6), crash: (t, g) => X.softCrash(t, g * 0.35), shatter: (t, g) => X.shatter(t, g * 0.4),
  riser: (t, g, r, e) => { const L = (e && e.len) || 1.5; S.riser(Math.max(0, t - L), L, g * 0.35); }, swell: (t, g) => X.reverseSwell(Math.max(0, t - 1.2), 1.2, chordAt(t).pad, g * 0.3),
  glitch: (t, g) => S.glitch(t, g * 0.4), buzz: (t, g) => S.buzz(t, g * 0.3), power: (t, g) => S.powerOn(t, g * 0.35), sonar: (t, g, r = 0) => X.sonar(t, tone(t, 2 + r), g * 0.2),
  clap: (t, g) => S.clap(t, g * 0.45), kick: (t, g) => S.kick(t, g * 0.8), snare: (t, g) => S.snare(t, g * 0.5),
  // endless riser over a sustained build (len = sfx `len`, default 2 bars); bass drop with a kick click for phone speakers
  shepard: (t, g, r, e) => X.shepard(t, (e && e.len) || 2 * bar, g * 0.25, { baseMidi: tone(t, 0) - 36 }),
  drop: (t, g) => { X.subGlide(t, 1.2, tone(t, 0) - 24, tone(t, 0) - 36, g * 0.5); S.kick(t, g * 0.35); },
  braam: (t, g, r, e) => { const C = chordAt(t + 0.01); X.braam(t, (e && e.len) || 1.8, [C.bass, C.bass + 7, C.bass + 12], g * 0.22); }
};
// engine 2: transition -> SFX. sfx = kit name | [name | { name, at (s from the cut, or 'end'), gain }] | false;
// lead = seconds before the cut a whoosh starts (it then follows the move: length d + 0.3, pan in the move's direction,
// ±3 semitone centre per instance); gain = S.whoosh gain for whooshes, FX gain (1 = nominal) for kit names.
// Names missing here (new library transitions) get a whoosh scaled to their duration. Storyboard override:
// trans: { type, sfx: 'zap' | false | [{ name, at, gain }] }.
const TRANS_SFX = {
  cut: { sfx: false }, fade: { sfx: false },
  flash: { sfx: 'crash', lead: 0, gain: 0.57 },                          // = softCrash 0.2 (engine 1 level)
  dip: { sfx: 'whoosh', lead: 0.1, gain: 0.16, up: false },              // soft fall into the colour
  slide: { sfx: 'whoosh', lead: 0.14, gain: 0.3 }, wipe: { sfx: 'whoosh', lead: 0.14, gain: 0.28 },
  iris: { sfx: 'whoosh', lead: 0.14, gain: 0.26 }, zoom: { sfx: 'whoosh', lead: 0.14, gain: 0.32 }, band: { sfx: 'whoosh', lead: 0.14, gain: 0.3 },
  aperture: { sfx: [{ name: 'click', at: 0, gain: 0.8 }, { name: 'whoosh', gain: 0.2 }, { name: 'click', at: 'end', gain: 0.6 }], lead: 0.14 },
  seam: { sfx: [{ name: 'whoosh', gain: 0.22 }, { name: 'crackle', at: 0, gain: 0.5 }], lead: 0.14 }
};
const TRANS_PAN = { slide: 'dir', wipe: 'dir', band: 1, seam: 1 }; // others sweep gently across the centre
// kv/blocks/trans-meta.js: SFX for library transitions TRANS_SFX does not list ({ name, lead (fraction of d), gain }).
// Whoosh gains map 0.65 (meta) -> 0.3 (S.whoosh); kit sounds keep the FX gain (1 = nominal).
let TRANS_META = {}; try { TRANS_META = require(path.join(HERE, 'blocks', 'trans-meta.js')); } catch { }
function metaSfx(e) {
  const m = TRANS_META[e.name]; if (!m) return null; if (!m.sfx || !m.sfx.length) return { sfx: false };
  const W = s => s.name === 'whoosh' || s.name === 'swoosh', one = m.sfx.filter(W).length === 1, L = Math.min(e.d + 0.3, 0.6);
  return { lead: 0.14, sfx: m.sfx.map(s => W(s)
    ? (one && s.lead === 0.5 ? { name: s.name, gain: +(0.3 * s.gain / 0.65).toFixed(3) } : { name: s.name, at: +(s.lead * e.d - L / 2).toFixed(4), len: L, gain: +(0.3 * s.gain / 0.65).toFixed(3) })
    : { name: s.name, at: +(s.lead * e.d).toFixed(4), gain: s.gain }) };
}
function transSfx(e) {
  const spec = e.sfx !== undefined ? { sfx: e.sfx, lead: 0.14 } : TRANS_SFX[e.name] || metaSfx(e) || { sfx: 'whoosh', lead: 0.14, gain: 0.28 };
  if (!spec.sfx) return;
  const items = [].concat(spec.sfx).map(x => typeof x === 'string' ? { name: x } : x);
  SFXLOG.push({ t: +e.t.toFixed(4), trans: e.name, sfx: items.map(x => x.name), table: e.sfx === undefined && !!TRANS_SFX[e.name] });
  for (const it of items) {
    const at = it.at === 'end' ? e.d : it.at, g = it.gain ?? spec.gain;
    if (it.name === 'whoosh' || it.name === 'swoosh') {
      const pd = TRANS_PAN[e.name] === 'dir' ? (e.dir === 'right' ? 1 : e.dir === 'up' || e.dir === 'down' ? 0 : -1) : TRANS_PAN[e.name] || 0;
      const p = pd ? 0.75 * pd : 0.3, up = !(spec.up === false || e.out || e.dir === 'down');
      S.whoosh(e.t + (at ?? -(spec.lead ?? 0.14)), it.len ?? Math.max(0.3, e.d + 0.3), g ?? 0.3, up, { pan0: -p, pan1: p, fScale: Math.pow(2, (S.rnd() - 0.5) / 2) });
    } else if (FX[it.name]) FX[it.name](e.t + (at ?? 0), g ?? 1, 0, it);
    else unknown.add(it.name);
  }
}
const unknown = new Set();
let nfx = 0;
if (!E2) for (const e of TL.events) {
  if (e.type === 'sfx') { const f = FX[e.name]; if (!f) { unknown.add(e.name); continue; } f(e.t, e.gain ?? 1); nfx++; }
  else if (e.type === 'trans' && ['slide', 'wipe', 'zoom', 'band', 'iris'].includes(e.name)) S.whoosh(e.t - 0.16, e.d + 0.34, 0.32);
  else if (e.type === 'trans' && e.name === 'flash') X.softCrash(e.t, 0.2);
  else if (e.type === 'hit') { X.softCrash(e.t, 0.3); X.boomShort(e.t, 0.45); }
}
else S.withBus(S.BUS.SFX, () => { const last = {}; for (const e of TL.events) {
  if (e.type === 'sfx') { // round-robin: the same name within 2 s rotates its chord tone and varies its level ±10 %
    const f = FX[e.name]; if (!f) { unknown.add(e.name); continue; }
    const L = last[e.name], r = L && e.t - L.t < 2 ? L.r + 1 : 0, g = (e.gain ?? 1) * (r ? 1 + 0.1 * Math.sin(r * 2.4) : 1);
    last[e.name] = { t: e.t, r }; f(e.t, g, r, e); nfx++;
    SFXLOG.push({ t: e.t, name: e.name, gain: +g.toFixed(3), r, chord: chordAt(e.t).name, midi: ['pop', 'bell', 'ding', 'blip', 'beep', 'zap', 'sonar'].includes(e.name) ? tone(e.t, (e.name === 'ding' ? 3 : ['blip', 'beep', 'zap', 'sonar'].includes(e.name) ? 2 : 0) + r) : undefined });
  }
  else if (e.type === 'trans') transSfx(e);
  else if (e.type === 'hit') { // transient + sub + a tonal stab from the running chord, sample-aligned
    X.softCrash(e.t, 0.3); X.boomShort(e.t, 0.45);
    if (SYN2) style.braam ? X.braam(e.t, 1.8, [chordAt(e.t + 0.01).bass, chordAt(e.t + 0.01).bass + 7, chordAt(e.t + 0.01).bass + 12], 0.2)
      : S.sawChord(e.t, 0.25, chordAt(e.t + 0.01).pad, 0.06, { att: 0.005, rel: 0.3, fc: 4000, fcEnd: 1500 });
  }
} });

// ------------------------------------------------------------------ engine 2: the hook statement, loud enough to be heard
// rendered once the bed and SFX exist: a dry trial render into a scratch bus measures the motif against the bed in its
// window (K-weighted); the gain then puts it ~7 LU under the bed (never below the nominal 0.07, at most +12 dB)
if (HOOK) {
  const [t0, span] = HOOK, i0 = Math.round(t0 * S.sr), i1 = Math.min(S.N, Math.round((t0 + span) * S.sr)), T = [new Float32Array(S.N), new Float32Array(S.N)];
  const lk = arrs => { const x = [0, 1].map(c => { const y = new Float32Array(Math.max(0, i1 - i0)); for (const B of arrs) for (let i = i0; i < i1; i++) y[i - i0] += B[c][i]; return y; }); return lufsOfMs(kms(x[0]) + kms(x[1])); };
  playMotif(t0, MOT, 'orig', 0.07, 'hook', T);
  const d = lk([T]) - lk([S.BUS.MASTER, S.BUS.MUSIC, S.BUS.SFX, S.BUS.MEL]), g = Math.min(0.07 * 4, Math.max(0.07, 0.07 * Math.pow(10, (-7 - d) / 20)));
  playMotif(t0, MOT, 'orig', g, 'hook');
}

// ------------------------------------------------------------------ voice bus + master
let voice = null, ratio = null, LD = null, STEMS = null;
if (lines.length && !E2) {
  const L = new Float32Array(S.N), R = new Float32Array(S.N);
  let vs = 0, vn = 0;
  for (const l of lines) {
    let pk = 0; for (const v of l.samples) pk = Math.max(pk, Math.abs(v));
    const g = 0.9 / (pk || 1), i0 = Math.round(l.t * S.sr);
    for (let k = 0; k < l.samples.length && i0 + k < S.N; k++) { const v = l.samples[k] * g; L[i0 + k] += v * 0.72; R[i0 + k] += v * 0.72; vs += v * v; vn++; }
  }
  // speech sits ~ +9 dB over the music underneath it (before ducking): scale the voice bus to that
  let ms = 0, mn = 0; const [A, B] = [S.BUS.MASTER, S.BUS.MUSIC];
  for (const [a, b] of voWin) for (let i = Math.round(a * S.sr); i < Math.min(S.N, b * S.sr); i += 4) { const x = (A[0][i] + B[0][i]); ms += x * x; mn++; }
  const vr = Math.sqrt(vs / Math.max(1, vn)) * 0.72, mr = Math.sqrt(ms / Math.max(1, mn)) || vr / 3, gain = Math.min(4, (mr * 2.8) / vr);
  for (let i = 0; i < S.N; i++) { L[i] *= gain; R[i] *= gain; }
  ratio = +(20 * Math.log10((vr * gain) / (mr * 0.5 || 1e-9))).toFixed(1);
  voice = [L, R];
}
if (!E2) S.master({ out: OUT, kicks: TL.kicks, gaps: TL.audioGaps, fadeOut: SB.loop ? 0.02 : 1.2, voice, voiceDuck: 0.5 });
else { // ---- engine 2: loudness-normalised lines, frequency slot, per-line duck from the measured LD, stems, loop fold
  const LDT = +(M && M.ld) || (KIDS ? 15 : 12), SLOT = { presence: [{ fc: 3000, db: -5, q: 0.8 }], tonal: [{ fc: 2500, db: -4, q: 0.6 }, { fc: 400, db: -2, q: 0.7 }] };
  const B4 = [S.BUS.MASTER, S.BUS.MUSIC, S.BUS.SFX, S.BUS.MEL], sr = S.sr;
  const win = (arrs, a, b) => { const i0 = Math.max(0, Math.round(a * sr)), i1 = Math.min(S.N, Math.round(b * sr)); return [0, 1].map(c => { const x = new Float32Array(Math.max(0, i1 - i0)); for (const B of arrs) for (let i = i0; i < i1; i++) x[i - i0] += B[c][i]; return x; }); };
  const kst = ([l, r]) => kms(l) + kms(r);
  let duckFn = 0.5, vref = 0.04, DK = null, mkDK = null;
  if (lines.length) {
    // crest control: each line's peaks limited to CREST dB over its own RMS (look-ahead 1.5 ms, release 40 ms) before the
    // loudness normalisation — speech peaks otherwise set the master's peak and leave the music unsaturated and peaky
    // into the delivery limiter (true peak); loudness, and so LD, is unchanged by construction
    const CREST = 13, la = Math.round(0.0015 * sr), rl = 1 - Math.exp(-1 / (0.04 * sr));
    for (const l of lines) {
      const x = l.samples; let s2 = 0, pk = 0; for (const v of x) { s2 += v * v; pk = Math.max(pk, Math.abs(v)); }
      const ceil = Math.sqrt(s2 / Math.max(1, x.length)) * Math.pow(10, CREST / 20); l.crestCut = 0;
      if (pk > ceil && ceil > 0) {
        const gv = new Float32Array(x.length).fill(1);
        for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > ceil) { const r = ceil / a; for (let k = Math.max(0, i - la); k <= i; k++) { const w = 1 - (1 - r) * (k - i + la) / la; if (w < gv[k]) gv[k] = w; } } }
        let cur = 1; for (let i = 0; i < x.length; i++) { cur = Math.min(gv[i], cur + rl * (1 - cur)); x[i] *= cur; }
        l.crestCut = +(20 * Math.log10(pk / ceil)).toFixed(1);
      }
    }
    const L0 = Math.pow(10, (-18 + 0.691) / 10); // every line to -18 LUFS (K-weighted, ungated), gain <= +12 dB, peak <= 0.98
    for (const l of lines) { const ms = kms(l.samples) || 1e-9; let pk = 0; for (const v of l.samples) pk = Math.max(pk, Math.abs(v)); l.g = Math.min(4, Math.sqrt(L0 / ms), 0.98 / (pk || 1)); l.lufs = +lufsOfMs(ms * l.g * l.g).toFixed(1); }
    const slot = V.slot === false ? null : V.slot || (/^(vi|zh|th|yue|lo|km)/i.test(String(V.lang || (says[0] && says[0].lang) || 'en')) ? 'tonal' : 'presence');
    if (slot) (SLOT[slot] || SLOT.presence).forEach(p => X.presenceDip(S.BUS.MUSIC, voWin, p));
    for (const l of lines) { const x = new Float32Array(l.samples.length); for (let k = 0; k < x.length; k++) x[k] = l.samples[k] * l.g * 0.72; l.ld0 = 10 * Math.log10(2 * kms(x) / (kst(win(B4, l.t, l.t + l.dur)) || 1e-12)); }
    // voice-bus gain: the median line over a real bed (stop-down scenes and near-silent beds excluded) sits at target - 4 LU
    // before the duck; never below 0 dB (a quiet bed is no reason to turn the voice down against the SFX), at most +12 dB
    const busy = lines.filter(l => (TL.scenes.find(s => s.id === l.scene) || {}).bed !== false && l.ld0 < 40);
    const gdb = busy.length ? Math.max(0, Math.min(12, LDT - 4 - med(busy.map(l => l.ld0)))) : 0, G = Math.pow(10, gdb / 20);
    // duck depth = target + 1 - LD before the duck, clamped to 6-12 dB (prefer a quieter bed over a louder voice)
    for (const l of lines) l.duck = +Math.min(12, Math.max(6, LDT + 1 - (l.ld0 + gdb))).toFixed(1);
    // depth per sample: each line's depth from 0.1 s before it, held through the gap after it (the duck envelope releases
    // there), ramping over 80 ms to the next line's depth just before that line — no step on the bed
    mkDK = () => {
      const D = new Float32Array(S.N), dep = lines.map(l => 1 - Math.pow(10, -l.duck / 20)), r8 = Math.round(0.08 * sr); let i = 0;
      lines.forEach((l, k) => {
        const z = Math.min(S.N, Math.max(0, Math.round((l.t - 0.1) * sr))), a = Math.max(i, z - r8), p = dep[Math.max(0, k - 1)];
        for (; i < a; i++) D[i] = p;
        for (; i < z; i++) D[i] = p + (dep[k] - p) * (i - a + 1) / (z - a);
      });
      for (; i < S.N; i++) D[i] = dep[dep.length - 1];
      return D;
    };
    DK = mkDK();
    const VL = new Float32Array(S.N), VR = new Float32Array(S.N);
    for (const l of lines) { const i0 = Math.round(l.t * sr), g = l.g * 0.72 * G; for (let k = 0; k < l.samples.length && i0 + k < S.N; k++) if (i0 + k >= 0) { const v = l.samples[k] * g; VL[i0 + k] += v; VR[i0 + k] += v; } }
    voice = [VL, VR]; vref = 0.04 * G; duckFn = t => DK[Math.min(S.N - 1, Math.round(t * sr))]; // DK is rebuilt by the correction pass
    LD = { target: LDT, slot, voiceGainDb: +gdb.toFixed(1) };
  }
  const stem = M && M.stems ? { vo: path.join(P, 'stems', 'vo.wav'), sfx: path.join(P, 'stems', 'sfx.wav'), mel: path.join(P, 'stems', 'mel.wav'), bed: path.join(P, 'stems', 'bed.wav') } : null;
  const mst = () => S.master({ kicks: TL.kicks, gaps: TL.audioGaps, fadeOut: LOOP ? 0 : 0.3, voice, voiceDuck: duckFn, voiceRef: vref, parts: !!(lines.length || stem) });
  const measure = R => lines.forEach(l => { l.ld = +(10 * Math.log10(kst(win([R.parts.vo], l.t, l.t + l.dur)) / (kst(win([R.parts.bed, R.parts.sfx, R.parts.mel], l.t, l.t + l.dur)) || 1e-12))).toFixed(1); });
  let R = mst();
  if (lines.length) { // LD measured after the master (reverb, kick duck and VO duck included); one correction pass for short lines
    measure(R);
    const short = lines.filter(l => l.ld < LDT + 0.3 && l.duck < 12);
    if (short.length) {
      short.forEach(l => { l.duck = +Math.min(12, l.duck + (LDT + 0.6 - l.ld)).toFixed(1); });
      DK = mkDK(); R = mst(); measure(R);
    }
    const lds = lines.map(l => l.ld), lu = lines.map(l => l.lufs);
    Object.assign(LD, { min: Math.min(...lds), median: +med(lds).toFixed(1), lineSpread: +(Math.max(...lu) - Math.min(...lu)).toFixed(1), passes: short.length ? 2 : 1 });
  }
  // loop: fold the 2 s tail [dur, dur + 2) onto the head and cut to dur (in memory), then re-normalise every file by the
  // same factor if the fold pushed the mix above 0.95 (stems keep summing to the mix)
  const n = Math.round(TL.dur * sr), fold = A => !LOOP ? A : A.map(x => { const y = x.slice(0, n); for (let i = n; i < x.length && i - n < n; i++) y[i - n] += x[i]; return y; });
  const MIX = fold(R.mix), PARTS = stem ? Object.fromEntries(Object.keys(stem).map(k => [k, fold(R.parts[k])])) : null;
  if (LOOP) { let pk = 0; for (const c of MIX) for (const v of c) pk = Math.max(pk, Math.abs(v)); if (pk > 0.95) for (const A of [MIX, ...Object.values(PARTS || {})]) for (const c of A) for (let i = 0; i < c.length; i++) c[i] *= 0.95 / pk; }
  S.writeWav(OUT, MIX);
  if (stem) { // stems + alternate mixes: underscore (no melody) and M&E (no VO), same gain staging as the master
    for (const k of Object.keys(stem)) { fs.mkdirSync(path.dirname(stem[k]), { recursive: true }); S.writeWav(stem[k], PARTS[k]); }
    const alt = (f, sub) => S.writeWav(path.join(P, f), [0, 1].map(c => { const x = MIX[c].slice(); for (const p of sub) for (let i = 0; i < x.length; i++) x[i] -= PARTS[p][c][i]; return x; }));
    alt('music_nomelody.wav', ['mel']); alt('music_me.wav', ['vo']);
    STEMS = ['stems/vo.wav', 'stems/sfx.wav', 'stems/mel.wav', 'stems/bed.wav', 'music_nomelody.wav', 'music_me.wav'];
  }
}

// ------------------------------------------------------------------ vo.json + captions
const fmt = (t, sep) => { const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = Math.floor(t) % 60, ms = Math.round((t % 1) * 1000); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${sep}${String(ms).padStart(3, '0')}`; };
fs.writeFileSync(path.join(P, 'vo.json'), JSON.stringify(lines.map(l => ({ t: l.t, dur: l.dur, text: l.text, voice: l.voice, scene: l.scene })), null, 1));
if (lines.length) {
  const cap = lines.map(l => [l.t, l.t + Math.max(l.dur, 1.2), l.text]);
  fs.writeFileSync(path.join(P, `${TL.name || 'captions'}.srt`), cap.map(([a, b, x], i) => `${i + 1}\n${fmt(a, ',')} --> ${fmt(b, ',')}\n${x}\n`).join('\n'));
  fs.writeFileSync(path.join(P, `${TL.name || 'captions'}.vtt`), 'WEBVTT\n\n' + cap.map(([a, b, x]) => `${fmt(a, '.')} --> ${fmt(b, '.')}\n${x}\n`).join('\n'));
}
const overlap = lines.filter((l, i) => i && lines[i - 1].t + lines[i - 1].dur > l.t);
console.log(`score -> ${OUT} (${TL.dur.toFixed(2)} s, preset ${M ? M.preset || 'file' : 'none'}, ${nfx} sfx, ${lines.length} voice lines${ratio != null ? `, speech/music ≈ +${ratio} dB` : ''})`);
if (E2) { // machine-readable score for lint / qa / README (engine 2)
  const hook = OCC.find(o => o.kind === 'hook'), sting = OCC.find(o => o.kind === 'sting');
  const J = { engine: ENG, preset: M ? (M.file ? 'file' : M.preset) : 'none', key: M ? M.key : null, bpm: TL.bpm, mode: MODE, scale: SCALE, tonic: SYN2 ? PCN[TONIC] : null, progression: SYN2 ? prog.map(c => c.name) : null,
    lift: LIFT ? { semitones: LIFT, at: +liftAt.toFixed(3) } : 0, swing: SW, humanize: HZ, audience: SB.audience || 'general', loop: LOOP,
    dip: AUTODIP ? AUTODIP.id : null, payoff: PAY ? PAY.id : null, cadence: CAD ? (CADVO ? [CAD[1].name] : CAD.map(c => c.name)) : null, sting: STING ? STING.name : null,
    motif: MOT ? { source: MOT.source, deg: MOT.deg, rh: MOT.rh, timbre: TIMBRE, hookT: hook ? hook.t : null, hookMatchesSting: !!(hook && sting && sting.rel.slice(0, hook.rel.length).join() === hook.rel.join()), occurrences: OCC.slice().sort((a, b) => (b.kind === 'hook') - (a.kind === 'hook') || a.t - b.t) } : null,
    builds: BUILDS, bars: BARS, sfx: SFXLOG, lines: lines.map(l => ({ t: l.t, dur: l.dur, lufs: l.lufs, crestCut: l.crestCut, ld0: l.ld0 != null ? +l.ld0.toFixed(1) : null, duck: l.duck, ld: l.ld })), ld: LD, stems: STEMS };
  fs.writeFileSync(path.join(P, 'score.json'), JSON.stringify(J, null, 1));
  console.log(`engine 2: ${SYN2 ? `${PCN[TONIC]} ${MODE} · scale ${SCALE}${LIFT ? ` · lift +${LIFT} at ${liftAt.toFixed(2)} s` : ''} · motif ${MOT.source} [${MOT.deg}] ${TIMBRE} (hook ${hook ? hook.t.toFixed(2) + ' s' : 'none'}, ${OCC.length} statements${sting ? ', sting' : ''}) · cadence ${J.cadence ? J.cadence.join('-') : '-'} -> ${STING.name}${AUTODIP ? ` · dip ${AUTODIP.id}` : ''} · ${BUILDS.length} build(s)` : 'licensed/no music'}${SW ? ` · swing ${SW}` : ''}${STEMS ? ' · stems/' : ''} -> score.json`);
  if (LD) console.log(`voice: ${lines.length} lines at ${med(lines.map(l => l.lufs)).toFixed(1)} LUFS (spread ${LD.lineSpread} LU), slot ${LD.slot || 'off'}, duck ${Math.min(...lines.map(l => l.duck))}-${Math.max(...lines.map(l => l.duck))} dB · LD min/median = ${LD.min}/${LD.median} LU (target ${LD.target})`);
  if (LD && LD.min < LD.target) console.warn(`warning: speech-to-bed LD ${LD.min} LU < ${LD.target} on ${lines.filter(l => l.ld < LD.target).map(l => `"${l.text.slice(0, 30)}" (${l.ld})`).join('; ')} — lower energy / thin the bed in that scene (bed: 'thin'), fewer SFX under the line`);
  if (MOT && !hook) console.warn('warning: no room for the motif hook in the first 3 s (voice lines cover it) — start a line later or shorten it');
  if (SYN2 && M.lift && !LIFT) console.warn(`warning: music.lift ignored (piece < 10 bars or no energy-3 / lift scene)`);
}
function med(a) { const s = a.slice().sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; }
if (unknown.size) console.warn(`warning: unknown sfx ${[...unknown].join(', ')} (known: ${Object.keys(FX).join(', ')})`);
if (overlap.length) console.warn(`warning: voice lines overlap: ${overlap.map(l => `"${l.text}" at ${l.t.toFixed(2)} s`).join('; ')} — give them more time`);
