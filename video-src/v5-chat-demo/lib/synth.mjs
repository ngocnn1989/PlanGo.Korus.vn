// kr-video-score synth library — original music + SFX synthesized from scratch in plain Node (no deps, no samples).
//   import { createSession, loadTimeline } from './lib/synth.mjs';
//   const S = createSession({ dur: TL.dur });
//   S.kick(0); S.sawChord(4, 2, [57, 60, 64], 0.07); ...
//   S.master({ out: 'music.wav', kicks: [...], gaps: [[3.87, 3.995]] });
// All generators write into shared buses; master() adds delay/reverb, kick sidechain, breath gaps,
// fade-out, gentle saturation and peak normalisation, then writes a 32-bit float WAV.
import fs from 'node:fs';
import path from 'node:path';

export const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

/** ITU-R BS.1770 K-weighting at 48 kHz (high shelf + RLB high-pass): mean square of the weighted x[i0, i1).
 *  Ungated loudness of one channel = -0.691 + 10 log10(ms); stereo = sum the two channels' ms first. */
const KB = [[1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585], [1, -2, 1, -1.99004745483398, 0.99007225036621]];
export function kms(x, i0 = 0, i1 = x.length) {
  let s = 0; const z = KB.map(() => [0, 0, 0, 0]); i0 = Math.max(0, i0 | 0); i1 = Math.min(x.length, i1 | 0);
  for (let i = i0; i < i1; i++) {
    let v = x[i];
    for (let k = 0; k < 2; k++) { const [b0, b1, b2, a1, a2] = KB[k], q = z[k], y = b0 * v + b1 * q[0] + b2 * q[1] - a1 * q[2] - a2 * q[3]; q[1] = q[0]; q[0] = v; q[3] = q[2]; q[2] = y; v = y; }
    s += v * v;
  }
  return s / Math.max(1, i1 - i0);
}
export const lufsOfMs = ms => -0.691 + 10 * Math.log10(Math.max(ms, 1e-12));

/** Delivery classes (video.config.json `audio.class`); explicit audio.lufs / audio.tp / audio.eq still win.
 *  audioTargets(CFG.audio, audience) -> { lufs, tp, eq?, ... }; kids default EQ drops the +3 dB 5 kHz shelf. */
export const AUDIO_CLASS = { social: { lufs: -14, tp: -1.5 }, r128: { lufs: -23, tp: -1.5 }, atsc: { lufs: -24, tp: -2.5 }, 'stream-music': { lufs: -16, tp: -1.5 }, 'stream-speech': { lufs: -18, tp: -1.5 } };
export const EQ_DEFAULT = 'highpass=f=30,lowshelf=f=90:g=-2,highshelf=f=5000:g=3', EQ_KIDS = 'highpass=f=30,lowshelf=f=90:g=-2';
export function audioTargets(audio = {}, audience) {
  const c = AUDIO_CLASS[audio.class || 'social'];
  if (!c) throw new Error(`audio.class "${audio.class}" unknown (${Object.keys(AUDIO_CLASS).join(', ')})`);
  return Object.assign({ lufs: c.lufs, tp: c.tp }, audience === 'kids' && !audio.eq ? { eq: EQ_KIDS } : {}, audio);
}

/** Evaluate a project's timeline.js (browser-style `var TL = ...`) in Node. */
export function loadTimeline(dir) {
  const s = fs.readFileSync(path.join(dir, 'timeline.js'), 'utf8');
  return new Function(s + '; return TL;')();
}

/** Common voicings. pad = mid-register chord, arp = tones one octave up, root = bass MIDI note (octave 1-2). */
export const CHORDS = {
  Am: { pad: [57, 60, 64, 69], arp: [69, 72, 76, 81], root: 33 },
  F: { pad: [57, 60, 65, 69], arp: [69, 72, 77, 81], root: 29 },
  C: { pad: [55, 60, 64, 67], arp: [67, 72, 76, 79], root: 36 },
  G: { pad: [55, 59, 62, 67], arp: [67, 71, 74, 79], root: 31 },
  A: { pad: [57, 61, 64, 69], arp: [69, 73, 76, 81], root: 33 },
  Bm: { pad: [59, 62, 66, 71], arp: [71, 74, 78, 83], root: 35 },
  D: { pad: [57, 62, 66, 69], arp: [69, 74, 78, 81], root: 38 },
  Em: { pad: [59, 64, 67, 71], arp: [67, 71, 76, 79], root: 40 },
  Dm: { pad: [57, 62, 65, 69], arp: [69, 74, 77, 81], root: 38 },
  E: { pad: [56, 59, 64, 68], arp: [68, 71, 76, 80], root: 40 }
};

export function createSession({ sr = 48000, dur, seed = 20260928 }) {
  if (!dur) throw new Error('createSession: dur (seconds) is required');
  const N = Math.round(sr * dur);
  const bus = () => [new Float32Array(N), new Float32Array(N)];
  const MASTER = bus(), MUSIC = bus(), REV = bus(), DLY = bus();
  // SFX and MEL (melody/motif) mix exactly like MASTER (not kick-ducked); separate only so master() can write stems
  const SFX = bus(), MEL = bus();
  let s = seed >>> 0, FORCE = null, DRY = false, extraUsed = false;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const noise = () => rnd() * 2 - 1;
  /** Route every voice rendered inside fn() to bus (overrides o.bus), e.g. withBus(S.BUS.SFX, () => X.laser(...)).
   *  dry = true also drops the reverb/delay sends (e.g. a measuring render into a scratch bus). */
  function withBus(b, fn, dry = false) { const p = FORCE, d = DRY; FORCE = b; DRY = dry; try { return fn(); } finally { FORCE = p; DRY = d; } }

  /** Render a voice: fn(t, k) returns a mono sample (or [l, r] with o.stereo). o: gain, pan, panFn, bus, rev, dly. */
  function voice(t0, len, fn, o = {}) {
    const g = o.gain ?? 1, tgt = FORCE || o.bus || MASTER, rv = o.rev || 0, dl = o.dly || 0, stereo = !!o.stereo;
    if (tgt === SFX || tgt === MEL) extraUsed = true;
    const i0 = Math.round(t0 * sr), n = Math.round(len * sr);
    for (let k = 0; k < n; k++) {
      const i = i0 + k; if (i < 0) continue; if (i >= N) break;
      const t = k / sr; let L, R;
      if (stereo) { const v = fn(t, k); L = v[0] * g; R = v[1] * g; }
      else { const v = fn(t, k) * g, p = o.panFn ? o.panFn(t) : (o.pan || 0), a = (p + 1) * Math.PI / 4; L = v * Math.cos(a); R = v * Math.sin(a); }
      if (!(L === L && R === R)) continue;
      tgt[0][i] += L; tgt[1][i] += R;
      if (rv && !DRY) { REV[0][i] += L * rv; REV[1][i] += R * rv; }
      if (dl && !DRY) { DLY[0][i] += L * dl; DLY[1][i] += R * dl; }
    }
  }
  // band-limited oscillators (PolyBLEP) and a TPT state-variable filter
  const blep = (t, dt) => { if (t < dt) { t /= dt; return t + t - t * t - 1; } if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; } return 0; };
  const saw = () => { let ph = rnd(); return f => { const dt = f / sr; ph += dt; if (ph >= 1) ph -= 1; return 2 * ph - 1 - blep(ph, dt); }; };
  const square = () => { let ph = rnd(); return f => { const dt = f / sr; ph += dt; if (ph >= 1) ph -= 1; return (ph < 0.5 ? 1 : -1) + blep(ph, dt) - blep((ph + 0.5) % 1, dt); }; };
  const sine = (p0 = 0) => { let ph = p0; return f => { ph += f / sr; if (ph >= 1) ph -= 1; return Math.sin(2 * Math.PI * ph); }; };
  const svf = () => {
    let ic1 = 0, ic2 = 0;
    return (x, fc, q, mode) => {
      const g = Math.tan(Math.PI * Math.min(fc, sr * 0.45) / sr), k = 1 / q;
      const a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
      const v3 = x - ic2, v1 = a1 * ic1 + a2 * v3, v2 = ic2 + a2 * ic1 + a3 * v3;
      ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2;
      return mode === 'lp' ? v2 : mode === 'bp' ? v1 : x - k * v1 - v2;
    };
  };
  const att = (t, a) => t < a ? t / a : 1;

  // ---------------------------------------------------------------- drums
  function kick(t0, g = 1) {
    let ph = 0;
    voice(t0, 0.55, t => {
      const f = 46 + 120 * Math.exp(-t * 28) + 27 * Math.exp(-t * 7); ph += f / sr;
      return Math.tanh(2.1 * Math.sin(2 * Math.PI * ph) * att(t, 0.004) * Math.exp(-Math.max(0, t - 0.02) * 7)) * 0.9 + noise() * Math.exp(-t * 420) * 0.3;
    }, { gain: g });
  }
  function clap(t0, g = 1) {
    const f = svf();
    voice(t0, 0.45, t => {
      let e = 0;
      for (let k = 0; k < 3; k++) { const u = t - k * 0.011; if (u >= 0) e += Math.exp(-u * 185); }
      const u = t - 0.028; if (u >= 0) e += 0.85 * Math.exp(-u * 14);
      return f(noise() * e, 1300, 1.05, 'bp') * 1.65;
    }, { gain: g, rev: 0.4, pan: 0.05 });
  }
  const HATF = [205.3, 304.4, 369.6, 522.7, 540, 800].map(x => x * 1.6);
  function hat(t0, g = 1, open = false) {
    const f = svf(), m = HATF.map(() => square()), pan = (rnd() - 0.5) * 0.45;
    voice(t0, open ? 0.33 : 0.07, t => {
      let v = 0; for (let k = 0; k < 6; k++) v += m[k](HATF[k]);
      return f(v / 6 * 0.55 + noise() * 0.6, 7800, 0.7, 'hp') * (open ? Math.exp(-t * 10.5) : Math.exp(-t * 64));
    }, { gain: g, pan, rev: open ? 0.08 : 0.02 });
  }
  function snare(t0, g = 1) {
    const f = svf(), o = sine();
    voice(t0, 0.3, t => f(noise(), 3100, 0.7, 'bp') * Math.exp(-t * 20) * 1.3 + o(188 + 65 * Math.exp(-t * 40)) * Math.exp(-t * 26) * 0.58, { gain: g, rev: 0.24 });
  }
  function crash(t0, g = 1, len = 2.8) {
    const fl = svf(), fr = svf();
    voice(t0, len, t => { const e = att(t, 0.003) * Math.exp(-t * 1.8); return [fl(noise(), 5400, 0.6, 'hp') * e, fr(noise(), 5400, 0.6, 'hp') * e]; }, { gain: g, rev: 0.32, stereo: true });
  }
  // ---------------------------------------------------------------- transitions / fx
  function boom(t0, g = 1) { // sub drop impact for reveals and logo hits
    const o = sine(), f = svf();
    voice(t0, 3.5, t => Math.tanh((o(31 + 76 * Math.exp(-t * 3.2)) * att(t, 0.004) * Math.exp(-t * 1.2) + f(noise(), 220, 0.7, 'lp') * Math.exp(-t * 2.8) * 0.85) * 1.8) * 0.95, { gain: g, rev: 0.28 });
  }
  /** Band-passed noise sweep with a stereo pan across the move. o: { pan0 = -0.75, pan1 = 0.75 (pan follows the move),
   *  fScale = 1 (centre-frequency multiplier: vary per instance, e.g. 2 ** ((rnd() - 0.5) / 2) = ±3 semitones) }. */
  function whoosh(t0, len, g = 1, up = true, o = {}) {
    const f = svf(), p0 = o.pan0 ?? -0.75, p1 = o.pan1 ?? 0.75, fs = o.fScale ?? 1;
    voice(t0, len, t => {
      const k = t / len, e = Math.pow(Math.sin(Math.PI * Math.min(1, k * 1.12)), 2) * (k < 0.88 ? 1 : Math.max(0, 1 - (k - 0.88) / 0.12));
      return f(noise(), (up ? 330 * Math.pow(17, k) : 5800 * Math.pow(1 / 17, k)) * fs, 1.45, 'bp') * e * 2.15;
    }, { gain: g, panFn: t => p0 + (p1 - p0) * (t / len), rev: 0.32 });
  }
  function riser(t0, len, g = 1) {
    const f = svf(), f2 = svf(), a = saw(), b = saw();
    voice(t0, len, t => {
      const k = t / len, fq = 105 * Math.pow(6, k);
      return (f(noise(), 250 * Math.pow(28, k), 1.7, 'bp') * 1.7 + f2(a(fq) + b(fq * 1.011), 550 + 4500 * k, 1.4, 'lp') * 0.33) * k * k;
    }, { gain: g, rev: 0.32, panFn: t => Math.sin(t * 8) * 0.45 });
  }
  function swell(t0, len, g = 1) { // reverse-cymbal build that stops dead on the hit
    const fl = svf(), fr = svf();
    voice(t0, len, t => { const e = Math.pow(t / len, 3); return [fl(noise(), 4400, 0.6, 'hp') * e, fr(noise(), 4400, 0.6, 'hp') * e]; }, { gain: g, stereo: true });
  }
  function glitch(t0, g = 1) { // bit-crushed stutter burst
    for (let j = 0; j < 7; j++) {
      const sq = square(), fq = 500 + rnd() * 2600, st = t0 + j * 0.016 + rnd() * 0.01, crush = 4 + Math.floor(rnd() * 10);
      let hold = 0;
      voice(st, 0.018, (t, k) => { if (k % crush === 0) hold = (rnd() < 0.5 ? sq(fq) : noise()) * 0.8; return hold; }, { gain: g, pan: (rnd() - 0.5) * 1.4 });
    }
  }
  function buzz(t0, g = 1) { // reject / error: two dissonant low square pulses
    for (const [dt, fq] of [[0, 98], [0.13, 92.5]]) {
      const a = square(), b = square(), f = svf();
      voice(t0 + dt, 0.11, t => f(a(fq) + b(fq * 1.06), 1400, 0.8, 'lp') * att(t, 0.003) * (t < 0.09 ? 1 : Math.max(0, 1 - (t - 0.09) / 0.02)), { gain: g });
    }
  }
  function powerOn(t0, g = 1) { // node / panel appears
    const o = sine();
    voice(t0, 0.38, t => o(165 + 800 * Math.pow(t / 0.38, 2)) * att(t, 0.01) * Math.exp(-t * 5.5), { gain: g, rev: 0.22 });
  }
  function ticks(t0, t1, step, g = 0.04) { for (let t = t0; t < t1 - 1e-6; t += step) hat(t, g); }
  // ---------------------------------------------------------------- tonal
  function pluck(t0, m, g, o = {}) { // arps and UI blips
    const len = o.dur ?? 0.22, a = saw(), b = square(), f = svf(), fq = mtof(m), br = o.bright ?? 1;
    voice(t0, len + 0.08, t => f(a(fq) * 0.6 + b(fq * 1.004) * 0.4, 400 + br * 4800 * Math.exp(-t * 15), 0.9, 'lp') * att(t, 0.003) * Math.exp(-t * 7 / len),
      { gain: g, pan: o.pan ?? 0, rev: o.rev ?? 0.18, dly: o.dly ?? 0.25, bus: o.bus || MUSIC });
  }
  function bell(t0, m, g, o = {}) { // FM bell: confirmations, dings, logo sting
    const len = o.dur ?? 1.3, fq = mtof(m); let pc = 0, pm = 0;
    voice(t0, len, t => {
      pm += fq * 3.5 / sr; pc += fq / sr;
      return Math.sin(2 * Math.PI * pc + 2.5 * Math.exp(-t * 6) * Math.sin(2 * Math.PI * pm)) * att(t, 0.002) * Math.exp(-t * 5.1 / len);
    }, { gain: g, pan: o.pan ?? 0, rev: o.rev ?? 0.38, dly: o.dly ?? 0.18, bus: o.bus || MASTER });
  }
  function keys(t0, m, g, o = {}) { // FM electric piano for calm / explanatory pieces
    const len = o.dur ?? 1.6, fq = mtof(m); let pc = 0, pm = 0, pc2 = 0;
    voice(t0, len, t => {
      pm += fq / sr; pc += fq / sr; pc2 += fq * 1.003 / sr;
      const mod = (1.6 * Math.exp(-t * 5) + 0.25) * Math.sin(2 * Math.PI * pm);
      return (Math.sin(2 * Math.PI * pc + mod) * 0.7 + Math.sin(2 * Math.PI * pc2 + mod * 0.6) * 0.3) * att(t, 0.003) * Math.exp(-t * 3.8 / len);
    }, { gain: g, pan: o.pan ?? 0, rev: o.rev ?? 0.35, dly: o.dly ?? 0.2, bus: o.bus || MUSIC });
  }
  function sawChord(t0, len, notes, g, o = {}) { // supersaw pad / stab; fc sweeps fc -> fcEnd
    const at = o.att ?? 0.3, rl = o.rel ?? 0.5, fc0 = o.fc ?? 1700, fc1 = o.fcEnd ?? fc0, V = o.voices ?? 5, dt = o.detune ?? 0.12;
    for (const m of notes) for (let v = 0; v < V; v++) {
      const x = V > 1 ? v / (V - 1) * 2 - 1 : 0, fq = mtof(m) * Math.pow(2, x * dt / 12), osc = saw(), f = svf();
      voice(t0, len + rl, t => f(osc(fq), fc0 + (fc1 - fc0) * Math.min(1, t / (len + rl)), 0.8, 'lp') * att(t, at) * (t < len ? 1 : Math.max(0, 1 - (t - len) / rl)),
        { gain: g / Math.sqrt(V), pan: x * 0.85, rev: o.rev ?? 0.32, bus: o.bus || MUSIC });
    }
  }
  function choir(t0, len, notes, g, o = {}) { // soft sine stack with vibrato
    for (const m of notes) for (let v = 0; v < 3; v++) {
      const fq = mtof(m) * Math.pow(2, (v - 1) * 0.08 / 12), a = sine(rnd()), b = sine(rnd()), rl = o.rel ?? 1.2;
      voice(t0, len + rl, t => {
        const vib = 1 + 0.004 * Math.sin(2 * Math.PI * 5.2 * t + v);
        return (a(fq * vib) * 0.8 + b(fq * 2 * vib) * 0.2) * att(t, o.att ?? 0.8) * (t < len ? 1 : Math.max(0, 1 - (t - len) / rl));
      }, { gain: g / 3, pan: (v - 1) * 0.6, rev: 0.5, bus: o.bus || MUSIC });
    }
  }
  function bass(t0, len, m, g, o = {}) { // sine sub + filtered saw an octave up
    const a = sine(), b = saw(), f = svf(), fq = mtof(m), decay = o.decay ?? 2.5;
    voice(t0, len + 0.05, t => {
      const e = att(t, 0.005) * (t < len ? 1 : Math.max(0, 1 - (t - len) / 0.05)) * Math.exp(-t * decay);
      return Math.tanh((a(fq) * 0.85 + f(b(fq * 2), 250 + 1000 * Math.exp(-t * 12), 1.15, 'lp') * 0.45) * 1.25) * e;
    }, { gain: g, bus: MUSIC });
  }
  function sub(t0, len, m, g) { const o = sine(); voice(t0, len, t => o(mtof(m)) * att(t, 0.02) * Math.exp(-t * 0.9), { gain: g }); }

  // ---------------------------------------------------------------- mix & master
  function freeverb(inL, inR, room, damp) {
    const sc = sr / 44100, mk = l => ({ b: new Float32Array(Math.round(l * sc)), i: 0, s: 0 });
    const Cm = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], Ap = [556, 441, 341, 225];
    const cl = Cm.map(mk), cr = Cm.map(l => mk(l + 23)), al = Ap.map(mk), ar = Ap.map(l => mk(l + 23));
    const oL = new Float32Array(N), oR = new Float32Array(N);
    const comb = (c, x) => { const y = c.b[c.i]; c.s = y * (1 - damp) + c.s * damp; c.b[c.i] = x + c.s * room; if (++c.i >= c.b.length) c.i = 0; return y; };
    const ap = (a, x) => { const b = a.b[a.i], y = b - x; a.b[a.i] = x + b * 0.5; if (++a.i >= a.b.length) a.i = 0; return y; };
    for (let i = 0; i < N; i++) {
      const x = (inL[i] + inR[i]) * 0.015; let l = 0, r = 0;
      for (const c of cl) l += comb(c, x); for (const c of cr) r += comb(c, x);
      for (const a of al) l = ap(a, l); for (const a of ar) r = ap(a, r);
      oL[i] = l; oR[i] = r;
    }
    return [oL, oR];
  }
  function pingpong(inL, inR, time, fb) {
    const d = Math.max(1, Math.round(time * sr)), bl = new Float32Array(d), br = new Float32Array(d);
    const oL = new Float32Array(N), oR = new Float32Array(N); let idx = 0, lpL = 0, lpR = 0;
    for (let i = 0; i < N; i++) {
      const yl = bl[idx], yr = br[idx]; oL[i] = yl; oR[i] = yr;
      lpL += 0.38 * (yl - lpL); lpR += 0.38 * (yr - lpR);
      bl[idx] = (inL[i] + inR[i]) * 0.5 + lpR * fb; br[idx] = lpL * fb;
      if (++idx >= d) idx = 0;
    }
    return [oL, oR];
  }
  /**
   * kicks: sidechain trigger times (MUSIC bus only); gaps: [[a, b]] near-silent "breath" before big hits;
   * fadeOut: seconds; drive: saturation amount before peak-normalising to 0.95.
   * voice: [L, R] dry voice-over bus (not ducked, no reverb); everything else ducks by voiceDuck while it speaks.
   * voiceDuck: depth 0..1, or a function t => depth (per-line adaptive duck); voiceRef: voice-bus level (|L|+|R|) that
   * counts as fully "speaking" for the duck envelope (default 0.04; scale it with the voice-bus gain).
   * parts: true -> also returns { vo, sfx, mel, bed } final-level stereo components (sum = mix: each component gets the
   * same per-sample saturation gain); stemsOut: { vo?, sfx?, mel?, bed? } file paths to write them as WAVs.
   */
  function master({ out, kicks = [], duck = 0.55, duckLen = 0.3, gaps = [], fadeOut = 1.3, room = 0.86, damp = 0.32, revWet = 1.6, delayTime = 0.375, delayFb = 0.36, delayWet = 0.35, drive = 1.32, voice = null, voiceDuck = 0.5, voiceRef = 0.04, parts = false, stemsOut = null }) {
    const [dL, dR] = pingpong(DLY[0], DLY[1], delayTime, delayFb);
    const RV = [REV[0].slice(), REV[1].slice()]; // buses stay untouched, so master() can run again (e.g. with a new duck)
    for (let i = 0; i < N; i++) { RV[0][i] += dL[i] * 0.25; RV[1][i] += dR[i] * 0.25; }
    const [rL, rR] = freeverb(RV[0], RV[1], room, damp);
    const K = kicks.slice().sort((a, b) => a - b), o = [new Float32Array(N), new Float32Array(N)];
    const vdF = typeof voiceDuck === 'function' ? voiceDuck : null, X = extraUsed, PT = parts || stemsOut ? { vo: bus(), sfx: bus(), mel: bus() } : null;
    let kp = 0, ve = 0;
    const vA = Math.exp(-1 / (0.006 * sr)), vR = Math.exp(-1 / (0.28 * sr));
    for (let i = 0; i < N; i++) {
      const t = i / sr;
      while (kp < K.length - 1 && K[kp + 1] <= t) kp++;
      const dt = K.length ? t - K[kp] : -1;
      const dk = dt >= 0 && dt < duckLen ? 1 - duck * Math.pow(1 - dt / duckLen, 2) : 1;
      let gap = 1;
      for (const [a, b] of gaps) if (t > a - 0.006 && t < b) gap = Math.min(gap, t < a ? 1 - 0.94 * (t - a + 0.006) / 0.006 : t > b - 0.004 ? 0.06 + 0.94 * (t - b + 0.004) / 0.004 : 0.06);
      const fo = t > dur - fadeOut ? Math.pow(Math.max(0, (dur - t) / fadeOut), 1.5) : 1, fi = Math.min(1, t / 0.01);
      let vg = 1;
      if (voice) { const x = Math.abs(voice[0][i]) + Math.abs(voice[1][i]); ve = x > ve ? vA * ve + (1 - vA) * x : vR * ve + (1 - vR) * x; vg = 1 - (vdF ? vdF(t) : voiceDuck) * Math.min(1, ve / voiceRef); }
      // classic expression kept verbatim (bit-identical output when the SFX/MEL buses are unused)
      if (!X) for (let c = 0; c < 2; c++) o[c][i] = (MASTER[c][i] + MUSIC[c][i] * dk + (c ? rR[i] : rL[i]) * revWet + (c ? dR[i] : dL[i]) * delayWet) * gap * fo * fi * vg + (voice ? voice[c][i] * fi : 0);
      else for (let c = 0; c < 2; c++) {
        const env = gap * fo * fi * vg, v = voice ? voice[c][i] * fi : 0;
        o[c][i] = (MASTER[c][i] + SFX[c][i] + MEL[c][i] + MUSIC[c][i] * dk + (c ? rR[i] : rL[i]) * revWet + (c ? dR[i] : dL[i]) * delayWet) * env + v;
        if (PT) { PT.vo[c][i] = v; PT.sfx[c][i] = SFX[c][i] * env; PT.mel[c][i] = MEL[c][i] * env; }
      }
      if (PT && !X) for (let c = 0; c < 2; c++) PT.vo[c][i] = voice ? voice[c][i] * fi : 0;
    }
    let peak = 0; for (const ch of o) for (const v of ch) peak = Math.max(peak, Math.abs(v));
    if (peak === 0) throw new Error('master: silent mix');
    const dr = drive / peak; let p2 = 0;
    if (!PT) for (const ch of o) for (let i = 0; i < N; i++) { ch[i] = Math.tanh(ch[i] * dr); p2 = Math.max(p2, Math.abs(ch[i])); }
    else for (let c = 0; c < 2; c++) for (let i = 0; i < N; i++) { // tanh(d s) = s * (tanh(d s) / s): one gain per sample for every part
      const s0 = o[c][i], y = Math.tanh(s0 * dr), k = s0 !== 0 ? y / s0 : dr;
      o[c][i] = y; PT.vo[c][i] *= k; PT.sfx[c][i] *= k; PT.mel[c][i] *= k; p2 = Math.max(p2, Math.abs(o[c][i]));
    }
    for (const ch of o) for (let i = 0; i < N; i++) ch[i] *= 0.95 / p2;
    if (out) writeWav(out, o);
    if (!PT) return { peak, out, mix: o };
    const nm = 0.95 / p2; PT.bed = bus();
    for (let c = 0; c < 2; c++) for (let i = 0; i < N; i++) { PT.vo[c][i] *= nm; PT.sfx[c][i] *= nm; PT.mel[c][i] *= nm; PT.bed[c][i] = o[c][i] - PT.vo[c][i] - PT.sfx[c][i] - PT.mel[c][i]; }
    if (stemsOut) for (const k of ['vo', 'sfx', 'mel', 'bed']) if (stemsOut[k]) { fs.mkdirSync(path.dirname(stemsOut[k]), { recursive: true }); writeWav(stemsOut[k], PT[k]); }
    return { peak, out, parts: PT, mix: o };
  }
  function writeWav(file, [L, R]) { // length = the arrays' length (N for master output)
    const n = L.length, data = Buffer.alloc(n * 8);
    for (let i = 0; i < n; i++) { data.writeFloatLE(L[i], i * 8); data.writeFloatLE(R[i], i * 8 + 4); }
    const h = Buffer.alloc(44);
    h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
    h.writeUInt32LE(16, 16); h.writeUInt16LE(3, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(sr, 24);
    h.writeUInt32LE(sr * 8, 28); h.writeUInt16LE(8, 32); h.writeUInt16LE(32, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
    fs.writeFileSync(file, Buffer.concat([h, data]));
  }

  return {
    sr, N, dur, rnd, noise, mtof, voice, att, osc: { saw, square, sine, svf }, BUS: { MASTER, MUSIC, SFX, MEL }, withBus,
    kick, clap, hat, snare, crash, boom, whoosh, riser, swell, glitch, buzz, powerOn, ticks,
    pluck, bell, keys, sawChord, choir, bass, sub, master, writeWav
  };
}
