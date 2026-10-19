// kr-video-score SFX kit — proven generators from the VN-J productions (video 06 promo, 07 "MẮT AI" POV,
// 08 "NHỊP HÀN" music video), written against a synth.mjs session. Original synthesis only (no samples).
//   import { sfxKit } from './lib/sfx.mjs';
//   const X = sfxKit(S);  X.crackle(t, len, g); X.clampKick(t, 0.9); X.lowpassBus(S.BUS.MUSIC, a, b, t => fc);
// Every time comes from timeline.js. Gains are starting points; balance with measure.mjs.
import fs from 'node:fs';
import { mtof } from './synth.mjs';

export function sfxKit(S) {
  const sr = S.sr, { saw, square, sine, svf } = S.osc, noise = S.noise, rnd = S.rnd, att = S.att;
  const MU = S.BUS.MUSIC;
  const env = (t, len, a = 0.005, r = 0.02) => Math.min(1, t / a) * Math.min(1, Math.max(0, len - t) / r);
  const K = {};

  // ---------------------------------------------------------------- industrial / welding
  /** MIG arc: band-passed hiss + seeded random pops + 100 Hz buzz (06/07/08). */
  K.crackle = (t0, len, g, pan = 0) => {
    const f1 = svf(), f2 = svf(), hum = sine(); let pop = 0;
    S.voice(t0, len, t => {
      if (rnd() < 115 / sr) pop = 0.45 + rnd() * 0.9;
      pop *= 0.9986;
      const hiss = f1(noise(), 3400, 0.7, 'bp') * (0.4 + 0.2 * Math.sin(2 * Math.PI * 9 * t));
      return (hiss * 0.55 + f2(noise() * pop, 2200, 0.6, 'hp') * 1.3 + hum(100) * 0.05) * env(t, len, 0.02, 0.02);
    }, { gain: g, pan, rev: 0.1 });
  };
  /** "Fast-forward" arc: crackle whose band and density rise, plus a rising whine (build-ups). */
  K.arcRise = (t0, len, g) => {
    const f1 = svf(), f2 = svf(), o = saw(), f3 = svf(); let pop = 0;
    S.voice(t0, len, t => {
      const k = t / len; if (rnd() < (400 + 5000 * k) / sr) pop = 0.4 + rnd(); pop *= 0.994;
      const fc = 700 * Math.pow(9, k), whine = f3(o(110 * Math.pow(8, k)), 1200 + 5000 * k, 1.2, 'lp') * 0.18;
      return (f1(noise(), fc, 1.5, 'bp') * 0.5 + f2(noise() * pop, fc * 0.8, 0.8, 'hp') * 0.6 + whine * 2.2) * (0.25 + 0.75 * k * k) * Math.min(1, (len - t) / 0.01);
    }, { gain: g, rev: 0.2, panFn: t => Math.sin(t * 9) * 0.4 });
  };
  /** Kick = clamp thump: pitch-dropping sub + short inharmonic FM metal transient + click. */
  K.clampKick = (t0, g = 1) => {
    let ph = 0, pc = 0, pm = 0;
    S.voice(t0, 0.5, t => {
      const f = 45 + 105 * Math.exp(-t * 30) + 24 * Math.exp(-t * 8); ph += f / sr;
      const body = Math.tanh(2.3 * Math.sin(2 * Math.PI * ph) * att(t, 0.003) * Math.exp(-Math.max(0, t - 0.03) * 7.5)) * 0.85;
      pc += 420 / sr; pm += 420 * 2.41 / sr;
      return body + Math.sin(2 * Math.PI * pc + 2.6 * Math.exp(-t * 45) * Math.sin(2 * Math.PI * pm)) * Math.exp(-t * 48) * 0.3 + noise() * Math.exp(-t * 500) * 0.28;
    }, { gain: g });
  };
  /** Snare = arc-crackle burst: hiss + dense pops + short body + 100 Hz buzz. o: { len, decay, pan, rev, bus } */
  K.arcSnare = (t0, g = 1, o = {}) => {
    const len = o.len ?? 0.22, f1 = svf(), f2 = svf(), f3 = svf(), body = sine(); let pop = 0;
    S.voice(t0, len, t => {
      if (rnd() < 2600 / sr) pop = 0.5 + rnd(); pop *= 0.995;
      const e = att(t, 0.0015) * Math.exp(-t * (o.decay ?? 15)) * Math.min(1, Math.max(0, len - t) / 0.01);
      const hiss = f1(noise(), 4300, 0.75, 'bp') * 1.25, crk = f2(noise() * pop, 2000, 0.7, 'hp');
      const b = body(200 + 70 * Math.exp(-t * 45)) * Math.exp(-t * 32) * 0.55, hum = (Math.sin(2 * Math.PI * 100 * t) > 0 ? 1 : -1) * 0.035;
      return (hiss * 0.42 + crk * 0.66 + b * 1.6 + f3(noise(), 950, 0.8, 'bp') * Math.exp(-t * 10) * 0.9 + hum) * e;
    }, { gain: g, pan: o.pan ?? 0.05, rev: o.rev ?? 0.2, bus: o.bus });
  };
  /** Hi-hat = spark: high-passed noise tick + falling chirp. o: { open, pan, bus } */
  K.sparkHat = (t0, g = 1, o = {}) => {
    const f = svf(), ch = sine(), f0 = 6500 + rnd() * 3500, open = !!o.open;
    S.voice(t0, open ? 0.26 : 0.075, t => (f(noise(), 7600, 0.7, 'hp') * (open ? Math.exp(-t * 11) : Math.exp(-t * 62)) * 0.95 + ch(f0 * (1 - 0.4 * Math.min(1, t / 0.035))) * Math.exp(-t * 85) * 0.3) * 0.6,
      { gain: g, pan: o.pan ?? (rnd() - 0.5) * 0.6, rev: 0.05, bus: o.bus });
  };
  /** Bass = motor hum: sine sub + buzzy saw/square an octave up with a slight whine (MUSIC bus). */
  K.motorBass = (t0, len, m, g, o = {}) => {
    const a = sine(), b = saw(), c = square(), f = svf(), fq = mtof(m);
    S.voice(t0, len + 0.04, t => {
      const e = att(t, 0.005) * (t < len ? 1 : Math.max(0, 1 - (t - len) / 0.04)) * Math.exp(-t * (o.decay ?? 1.6)), wob = 1 + 0.005 * Math.sin(2 * Math.PI * 7 * t);
      return Math.tanh((a(fq) * 0.9 + f(b(fq * 2 * wob) * 0.6 + c(fq * 3.004) * 0.22, 420 + 900 * Math.exp(-t * 11), 1.25, 'lp') * 0.85) * 1.35) * e;
    }, { gain: g, bus: o.bus || MU });
  };
  /** Lead = "servo": two detuned squares with exponential portamento. notes: [{ t0, t1, m }], glide in s. */
  K.servoLead = (notes, g, glide = 0.06) => {
    const T0 = notes[0].t0, T1 = notes[notes.length - 1].t1, s1 = square(), s2 = square(), f = svf(), wh = sine();
    let fc = mtof(notes[0].m);
    S.voice(T0, T1 - T0 + 0.3, t => {
      const at = T0 + t; let n = notes[0]; for (const x of notes) if (at >= x.t0) n = x;
      fc += (mtof(n.m) - fc) * (1 - Math.exp(-1 / (sr * glide * 0.35)));
      const dn = at - n.t0, vib = 1 + 0.007 * Math.sin(2 * Math.PI * 5.6 * t) * Math.min(1, Math.max(0, dn - 0.12) / 0.2);
      const e = att(t, 0.006) * (at < T1 ? 1 : Math.max(0, 1 - (at - T1) / 0.25)) * (0.85 + 0.15 * Math.exp(-dn * 10));
      return (f(s1(fc * vib) * 0.55 + s2(fc * vib * 1.006) * 0.45, 2200 + 2600 * Math.exp(-dn * 7), 1.3, 'lp') + wh(fc * 4) * 0.025 * Math.exp(-dn * 6)) * e;
    }, { gain: g, bus: MU, rev: 0.22, dly: 0.25, pan: 0.05 });
  };
  /** Hydraulic stamp: inharmonic FM metal hit + sub thump + crunch. */
  K.stampHit = (t0, g) => {
    let pc = 0, pm = 0, pm2 = 0; const o = sine(), f = svf();
    S.voice(t0, 1.1, t => {
      pc += 146 / sr; pm += 146 * 2.76 / sr; pm2 += 146 * 5.43 / sr;
      const metal = Math.sin(2 * Math.PI * pc + 4.2 * Math.exp(-t * 9) * Math.sin(2 * Math.PI * pm) + 1.6 * Math.exp(-t * 22) * Math.sin(2 * Math.PI * pm2)) * Math.exp(-t * 4.2) * 0.55;
      return Math.tanh((metal + o(36 + 58 * Math.exp(-t * 16)) * Math.exp(-t * 4.5) * att(t, 0.002) + f(noise(), 2400, 0.8, 'bp') * Math.exp(-t * 38) * 0.8) * 1.5) * 0.9;
    }, { gain: g, rev: 0.26 });
  };
  /** Pneumatic "pssh" (doors, releases). */
  K.hiss = (t0, len, g) => {
    const fl = svf(), fr = svf(), hl = svf(), hr = svf();
    S.voice(t0, len, t => {
      const k = t / len, e = att(t, 0.008) * Math.pow(1 - k, 1.8), fc = 5600 - 3000 * k;
      return [(fl(noise(), fc, 0.9, 'bp') * 0.9 + hl(noise(), 9000, 0.7, 'hp') * 0.45) * e, (fr(noise(), fc * 1.05, 0.9, 'bp') * 0.9 + hr(noise(), 9000, 0.7, 'hp') * 0.45) * e];
    }, { gain: g, stereo: true, rev: 0.15 });
  };
  /** Dry-run motion: filtered saw whir with gentle pitch wobble. */
  K.servo = (t0, len, g) => {
    const a = saw(), b = saw(), f = svf();
    S.voice(t0, len, t => { const fq = 98 + 22 * Math.sin(Math.PI * t / len) + 6 * Math.sin(2 * Math.PI * 3 * t); return f(a(fq) + b(fq * 2.01) * 0.5, 900, 1.2, 'lp') * env(t, len, 0.15, 0.2); },
      { gain: g, panFn: t => -0.5 + t / len, rev: 0.15 });
  };
  /** Heat / rising air: noise through a rising band-pass, swelling. */
  K.heat = (t0, len, g) => {
    const f = svf(), f2 = svf();
    S.voice(t0, len, t => { const k = t / len; return (f(noise(), 300 * Math.pow(4, k), 0.9, 'bp') * 1.3 + f2(noise(), 160, 0.7, 'lp') * 0.5) * (0.25 + 0.75 * k) * env(t, len, 0.3, 0.05); },
      { gain: g, panFn: t => Math.sin(t * 1.3) * 0.3, rev: 0.2 });
  };

  // ---------------------------------------------------------------- scan / UI / sci-fi
  /** Scan sweep: zap transient + gliding sine + low electric buzz, panned across. */
  K.laser = (t0, len, g) => {
    const z = square(), zf = svf(), o1 = sine(), o2 = square(), f = svf();
    S.voice(t0, 0.12, t => zf(z(2400 * Math.exp(-t * 28) + 180), 3500, 1, 'lp') * Math.exp(-t * 22), { gain: g * 1.6 });
    S.voice(t0, len, t => { const k = t / len; return (o1(1150 + 750 * k + 12 * Math.sin(2 * Math.PI * 30 * t)) * 0.45 + f(o2(55), 700, 1.3, 'lp') * 0.35) * env(t, len, 0.03, 0.1); },
      { gain: g, rev: 0.25, panFn: t => -0.6 + 1.2 * t / len });
  };
  /** Laser zap note (arp-able): pitch-dropping sine + filtered square. */
  K.zap = (t0, m, g, pan = 0) => {
    const o = sine(), q = square(), f = svf(), fq = mtof(m);
    S.voice(t0, 0.13, t => { const p = fq * (1 + 1.6 * Math.exp(-t * 55)); return (o(p) * 0.7 + f(q(p), 3200, 1, 'lp') * 0.3) * att(t, 0.002) * Math.exp(-t * 26); },
      { gain: g, pan, rev: 0.12, dly: 0.22 });
  };
  /** Mechanical click (aperture blade, relay): transient + metallic ring + small thump. */
  K.click = (t0, g, pan = 0) => {
    const f = svf(), o = sine();
    S.voice(t0, 0.12, t => noise() * Math.min(1, t / 0.0006) * Math.exp(-t * 700) * 0.45 + f(noise(), 2600, 5, 'bp') * Math.exp(-t * 90) * 1.6 + o(60 + 170 * Math.exp(-t * 40)) * Math.exp(-t * 55) * 0.7,
      { gain: g, pan, rev: 0.14 });
  };
  /** UI / data blip. */
  K.blip = (t0, m, g, pan = 0, len = 0.028) => {
    const a = square(), f = svf(), fq = mtof(m);
    S.voice(t0, len, t => f(a(fq), 4200, 0.8, 'lp') * env(t, len, 0.001, 0.006), { gain: g, pan, rev: 0.12, dly: 0.12 });
  };
  /** Sonar ping with a long tail. */
  K.sonar = (t0, m, g, pan = 0) => {
    const o = sine(), o2 = sine(), fq = mtof(m);
    S.voice(t0, 1.8, t => (o(fq * (1 + 0.015 * Math.exp(-t * 10))) * 0.85 + o2(fq * 2.004) * 0.18 * Math.exp(-t * 5)) * Math.min(1, t / 0.003) * Math.exp(-t * 2.8),
      { gain: g, pan, rev: 0.5, dly: 0.35 });
  };
  /** Lock-on: two short soft-square beeps on a chord tone (the second an octave up). */
  K.beep = (t0, m, g, pan = 0) => {
    for (const [dt, dm] of [[0, 0], [0.075, 12]]) {
      const a = square(), f = svf(), fq = mtof(m + dm);
      S.voice(t0 + dt, 0.06, t => f(a(fq), 3000, 0.9, 'lp') * env(t, 0.06, 0.002, 0.02), { gain: g * (dm ? 0.7 : 1), pan, rev: 0.2, dly: 0.18 });
    }
  };
  /** Granular data murmur (seeded). */
  K.grains = (t0, t1, rate, g, lo = 1500, hi = 6000) => {
    for (let t = t0; t < t1; t += 1 / rate) {
      const tt = t + rnd() / rate, fq = lo * Math.pow(hi / lo, rnd()), len = 0.01 + 0.025 * rnd(), o = sine(), pan = rnd() * 1.6 - 0.8;
      S.voice(tt, len, u => o(fq) * Math.sin(Math.PI * u / len) ** 2, { gain: g * (0.4 + 0.6 * rnd()), pan, rev: 0.2 });
    }
  };
  /** Image shatters into particles: bright noise burst + glassy inharmonic partials. */
  K.shatter = (t0, g) => {
    const f = svf();
    S.voice(t0, 0.6, t => f(noise(), 5200, 0.6, 'hp') * Math.exp(-t * 9) * env(t, 0.6, 0.001, 0.05), { gain: g, rev: 0.35 });
    for (let i = 0; i < 9; i++) { const o = sine(), fq = 2200 + 5200 * rnd(), d = 0.02 * i, dk = 6 + 5 * rnd(); S.voice(t0 + d, 0.9, t => o(fq) * Math.min(1, t / 0.002) * Math.exp(-t * dk), { gain: g * 0.12, pan: rnd() * 1.6 - 0.8, rev: 0.4 }); }
  };
  /** Particle flight: falling band-pass sweep + converging grains. */
  K.swarm = (t0, len, g) => {
    const f = svf();
    S.voice(t0, len, t => { const k = t / len; return f(noise(), 5500 * Math.pow(0.12, k), 1.6, 'bp') * Math.sin(Math.PI * Math.min(1, k * 1.05)) ** 1.5 * 1.8; }, { gain: g, panFn: t => Math.sin(t * 5) * 0.6, rev: 0.3 });
    K.grains(t0, t0 + len * 0.95, 70, g * 0.35, 2500, 9000);
  };
  /** CRT power-on: thunk + static burst + flyback whine rising over whineLen seconds. */
  K.crtOn = (t0, g, whineLen = 2.2) => {
    const o = sine(), f = svf(), w = sine(), w2 = sine();
    S.voice(t0, 0.5, t => o(40 + 70 * Math.exp(-t * 18)) * Math.exp(-t * 9) * env(t, 0.5, 0.002), { gain: g * 0.9 });
    S.voice(t0, 1.7, t => f(noise(), 3200, 0.8, 'bp') * Math.exp(-t * 2.2) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 60 * t)) * env(t, 1.7, 0.003, 0.2), { gain: g * 0.55, rev: 0.1 });
    S.voice(t0 + 0.05, whineLen, t => { const u = t / whineLen, fq = 5200 + 3600 * u * u; return (w(fq) * 0.7 + w2(fq * 0.5) * 0.3) * u * env(t, whineLen, 0.2, 0.15); }, { gain: g * 0.05, pan: 0.1 });
  };
  /** Shepard-Risset glissando (endless rise): octave-spaced sines, raised-cosine amplitude over log-frequency.
   *  o: { octaves = 8, baseMidi = 28, rate = 0.95 octaves/s } */
  K.shepard = (t0, len, g, o = {}) => {
    const n = o.octaves ?? 8, base = mtof(o.baseMidi ?? 28), rate = o.rate ?? 0.95, osc = Array.from({ length: n }, () => sine(rnd()));
    S.voice(t0, len, t => {
      let v = 0; const p = rate * t + 0.35 * (1 - Math.exp(-t / 0.35));
      for (let i = 0; i < n; i++) { const x = ((i + p) % n + n) % n; v += osc[i](base * Math.pow(2, x)) * (0.5 - 0.5 * Math.cos(2 * Math.PI * x / n)); }
      return v * 0.3 * env(t, len, 0.25, 0.012);
    }, { gain: g, rev: 0.28, dly: 0.12, bus: MU });
  };

  // ---------------------------------------------------------------- impacts / tails
  /** Crash with a 12 ms attack (less AAC overshoot on big hits). */
  K.softCrash = (t0, g, len = 2.4) => {
    const fl = svf(), fr = svf();
    S.voice(t0, len, t => { const e = Math.min(1, t / 0.012) * Math.exp(-t * 1.8); return [fl(noise(), 4600, 0.6, 'hp') * e, fr(noise(), 4600, 0.6, 'hp') * e]; }, { gain: g, rev: 0.32, stereo: true });
  };
  /** Sub-drop impact that ends within len (nothing rings into a following breath). */
  K.boomShort = (t0, g, len = 0.9) => {
    const o = sine(), f = svf();
    S.voice(t0, len, t => Math.tanh((o(31 + 76 * Math.exp(-t * 3.2)) * att(t, 0.004) * Math.exp(-t * 1.2) + f(noise(), 220, 0.7, 'lp') * Math.exp(-t * 2.8) * 0.85) * 1.8) * 0.95 * Math.min(1, (len - t) / 0.25), { gain: g, rev: 0.12 });
  };
  /** Bass drop: sine gliding from m0 to m1. */
  K.subGlide = (t0, len, m0, m1, g) => {
    const o = sine(), f0 = mtof(m0), f1 = mtof(m1);
    S.voice(t0, len, t => Math.tanh(1.6 * o(f1 + (f0 - f1) * Math.exp(-t * 7))) * Math.min(1, t / 0.004) * Math.exp(-t * 0.9) * env(t, len, 0.004, 0.2), { gain: g });
  };
  /** "Reverse reverb": a chord whose tail swells in backwards and stops dead at t0 + len. */
  K.reverseSwell = (t0, len, notes, g) => {
    for (const m of notes) for (let v = 0; v < 3; v++) {
      const a = saw(), f = svf(), fq = mtof(m) * Math.pow(2, (v - 1) * 0.1 / 12);
      S.voice(t0, len, t => f(a(fq), 900 + 3500 * (t / len) ** 2, 0.7, 'lp') * Math.pow(t / len, 3.2) * env(t, len, 0.01, 0.008), { gain: g / 3, pan: (v - 1) * 0.7, rev: 0.25 });
    }
    const fl = svf();
    S.voice(t0, len, t => fl(noise(), 5000, 0.6, 'hp') * Math.pow(t / len, 3) * env(t, len, 0.01, 0.008), { gain: g * 0.7 });
  };
  /** A single tiny spark tick into a long reverb (for silences). */
  K.tick = (t0, g) => {
    const f = svf(), o = sine();
    S.voice(t0, 0.09, t => (f(noise(), 3800, 1.2, 'bp') * Math.exp(-t * 90) * 1.2 + o(2900) * Math.exp(-t * 60) * 0.4) * att(t, 0.0008), { gain: g, rev: 1.6, dly: 0.35, pan: -0.1 });
  };

  /** Braam: low brassy blast — 5 detuned saws per note (root + 5th, octaves 1-2), low-pass opening 200 -> 1200 Hz over
   *  0.3 s, 30 ms attack, decay over len (1.5-2 s), mild tanh saturation. notes: MIDI (e.g. [33, 40, 45]). */
  K.braam = (t0, len, notes, g) => notes.forEach(m => {
    for (let v = 0; v < 5; v++) {
      const o = saw(), f = svf(), fq = mtof(m) * Math.pow(2, (v - 2) * 0.07 / 12);
      S.voice(t0, len, t => Math.tanh(1.6 * f(o(fq), 200 + 1000 * Math.min(1, t / 0.3), 1.2, 'lp')) * att(t, 0.03) * Math.exp(-t * 2 / len) * Math.min(1, (len - t) / 0.05),
        { gain: g / 5, pan: (v - 2) * 0.3, rev: 0.35 });
    }
  });

  // ---------------------------------------------------------------- processors
  /** Frequency slot for speech: bell cut on a bus (normally S.BUS.MUSIC) inside wins [[a, b]], 60 ms crossfades
   *  (BP#2: -5.0 dB @3 kHz measured, -2.7 @2 kHz, -2.1 @5 kHz, 0 dB outside the windows). Call before S.master. */
  K.presenceDip = (bus, wins, { fc = 3000, db = -5, q = 0.8, fade = 0.06 } = {}) => {
    if (!wins.length) return;
    const G = Math.pow(10, db / 20), k = 1 / q, W = wins.slice().sort((x, y) => x[0] - y[0]);
    const i0 = Math.max(0, Math.round((W[0][0] - fade - 0.05) * sr)), i1 = Math.min(S.N, Math.round((Math.max(...W.map(w => w[1])) + fade) * sr));
    for (const ch of bus) {
      const fl = svf();
      for (let i = i0; i < i1; i++) {
        const t = i / sr, bp = fl(ch[i], fc, q, 'bp');
        let w = 0; for (const [a, b] of W) { if (a - fade > t) break; w = Math.max(w, Math.min(1, (t - a + fade) / fade, (b + fade - t) / fade)); }
        if (w > 0) ch[i] -= (1 - G) * k * bp * w;
      }
    }
  };
  /** Time-varying low-pass on a bus between a and b (cutoff(t) in Hz), crossfaded in/out: "the scan opens the mix". */
  K.lowpassBus = (bus, a, b, cutoff, q = 1.35) => {
    const i0 = Math.round(a * sr), i1 = Math.round((b + 0.06) * sr);
    for (const ch of bus) {
      const fl = svf();
      for (let i = i0; i < i1 && i < S.N; i++) {
        const t = i / sr, y = fl(ch[i], cutoff(t), q, 'lp'), w = Math.min(1, (t - a) / 0.005) * (1 - Math.min(1, Math.max(0, (t - b) / 0.06)));
        ch[i] = y * w + ch[i] * (1 - w);
      }
    }
  };
  return K;
}

/** Seamless loop (BP#6): add the tail [dur, end) of a float stereo WAV written by S.master onto its head and truncate
 *  the file to dur seconds. Render with createSession({ dur: TL.dur + 2 }) and master({ fadeOut: 0 }). */
export function foldTail(file, dur, sr = 48000) {
  const b = fs.readFileSync(file), N = (b.length - 44) / 8, n = Math.round(dur * sr);
  for (let i = n; i < N && i - n < n; i++) for (let c = 0; c < 2; c++) {
    const o = 44 + (i - n) * 8 + c * 4;
    b.writeFloatLE(b.readFloatLE(o) + b.readFloatLE(44 + i * 8 + c * 4), o);
  }
  const out = b.subarray(0, 44 + Math.min(N, n) * 8);
  out.writeUInt32LE(36 + Math.min(N, n) * 8, 4); out.writeUInt32LE(Math.min(N, n) * 8, 40);
  fs.writeFileSync(file, out);
}

/** Post-process a written 32-bit float stereo WAV: out(t) = in(remap(t)) * gain(t) for t in [a, b); used for
 *  beat-repeat / stutter / tape-stop driven by the same remap() the picture uses. 3 ms de-click at the edges. */
export function remapWav(file, a, b, remap, gain = () => 1, sr = 48000) {
  const buf = fs.readFileSync(file), N = (buf.length - 44) / 8, L = new Float32Array(N), R = new Float32Array(N);
  for (let i = 0; i < N; i++) { L[i] = buf.readFloatLE(44 + i * 8); R[i] = buf.readFloatLE(48 + i * 8); }
  const oL = L.slice(), oR = R.slice(), i0 = Math.round(a * sr), i1 = Math.min(N, Math.round(b * sr)), dc = Math.round(0.003 * sr);
  for (let i = i0; i < i1; i++) {
    const t = i / sr, x = Math.max(0, Math.min(N - 2, remap(t) * sr)), j = Math.floor(x), fr = x - j, g = gain(t);
    oL[i] = (L[j] * (1 - fr) + L[j + 1] * fr) * g; oR[i] = (R[j] * (1 - fr) + R[j + 1] * fr) * g;
  }
  for (let k = 0; k < dc; k++) { const w = k / dc; if (i0 - dc + k >= 0) { oL[i0 - dc + k] *= 1 - w; oR[i0 - dc + k] *= 1 - w; } }
  for (let i = 0; i < N; i++) { buf.writeFloatLE(oL[i], 44 + i * 8); buf.writeFloatLE(oR[i], 48 + i * 8); }
  fs.writeFileSync(file, buf);
}
