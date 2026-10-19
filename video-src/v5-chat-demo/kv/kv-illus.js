/* KV illustration library — original vector drawings (no third-party art) with idle animation, themed colours.
 *   { kind: 'illus', name: 'sun', size: 0.7, color: 'a2', mood: 'happy', pose: 'wave', talk: [0, 4] }
 *   { kind: 'icon', name: 'check', size: 0.2, color: 'a3' }
 * Every drawing is centred on the origin and fits a square of side s. Outline ("sticker" look) follows the theme:
 * on for light themes, off for dark ones (P.outline overrides). KV.illus.list / KV.icons.list feed `kv illus --sheet`.
 */
(function () {
  'use strict';
  const { clamp, lerp, E } = MV;
  const TAU = Math.PI * 2;
  const shade = (c, k) => /^#[0-9a-f]{6}$/i.test(c) ? MV.mixc(c, k > 0 ? '#FFFFFF' : '#000000', Math.abs(k)) : c;
  let O = null; // current style { ink, lw, ol }
  const paint = (fill, ol = true) => { const ctx = MV.ctx; if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (ol && O.ol) { ctx.strokeStyle = O.ink; ctx.lineWidth = O.lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); } };
  const C = (x, y, r) => MV.circle(x, y, r);
  const RR = (x, y, w, h, r) => MV.rr(x, y, w, h, r);
  const ell = (x, y, rx, ry, rot = 0) => { MV.ctx.beginPath(); MV.ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU); };
  const stroke = (col, lw, pts) => { const ctx = MV.ctx; ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(); };

  // blink: every 3.4 s for 0.13 s (~17.6 / min). Opt-in `blink: { every: 3.4, jitter: 0.35, dur: 0.13 }` (or 'natural') on an
  // illus shifts each blink by up to +-jitter/2 of the interval, seeded per layer, so characters never blink in lockstep
  let BLINK = null;
  const blinking = (t, ph) => { if (!BLINK) return ((t + ph) % 3.4) < 0.13;
    const ev = BLINK.every, n = Math.floor((t + ph) / ev), j = k => (MV.hash(BLINK.seed + k * 7.13) - 0.5) * BLINK.jitter * ev;
    for (const m of [n - 1, n]) { const d = (t + ph) - (m * ev + j(m)); if (d >= 0 && d < BLINK.dur) return true; } return false; };
  // face: eyes with blink, mouth by mood, blush; o = { t, mood, talk, look:[dx,dy], phase }
  function face(x, y, s, o) {
    const ctx = MV.ctx, t = o.t, ph = o.phase || 0;
    const blink = blinking(t, ph), ex = s * 0.2, ey = -s * 0.05, er = s * 0.075, [lx, ly] = o.look || [0, 0];
    ctx.save(); ctx.translate(x, y);
    for (const sx of [-1, 1]) {
      if (blink || o.mood === 'sleepy') { stroke(O.ink, s * 0.035, [[sx * ex - er, ey], [sx * ex, ey + er * 0.5], [sx * ex + er, ey]]); continue; }
      C(sx * ex, ey, er); ctx.fillStyle = O.ink; ctx.fill();
      C(sx * ex - er * 0.3 + lx * er * 0.3, ey - er * 0.35 + ly * er * 0.3, er * 0.32); ctx.fillStyle = '#FFFFFF'; ctx.fill();
    }
    if (o.blush !== false) for (const sx of [-1, 1]) { ell(sx * s * 0.33, s * 0.1, s * 0.07, s * 0.045); ctx.fillStyle = 'rgba(255,110,130,0.45)'; ctx.fill(); }
    const talk = o.talking ? 0.35 + 0.65 * Math.abs(Math.sin(t * 13)) : 0;
    if (talk > 0 || o.mood === 'wow') { ell(0, s * 0.16, s * 0.07, s * 0.05 + s * 0.06 * (o.mood === 'wow' ? 1 : talk)); paint('#8C2F39', false); }
    else if (o.mood === 'sad') stroke(O.ink, s * 0.035, [[-s * 0.1, s * 0.2], [0, s * 0.15], [s * 0.1, s * 0.2]]);
    else if (o.mood === 'sleepy' || o.mood === 'calm') stroke(O.ink, s * 0.035, [[-s * 0.07, s * 0.16], [s * 0.07, s * 0.16]]);
    else { ctx.beginPath(); ctx.arc(0, s * 0.09, s * 0.11, 0.15 * Math.PI, 0.85 * Math.PI); if (o.mood === 'big') { ctx.closePath(); paint('#8C2F39', false); } ctx.strokeStyle = O.ink; ctx.lineWidth = s * 0.035; ctx.lineCap = 'round'; ctx.stroke(); }
    ctx.restore();
  }

  const I = {};
  // ------------------------------------------------------------------ characters
  I.buddy = (ctx, s, o) => { // round friend: poses idle | wave | cheer | point | think | jump
    const c = o.c, t = o.t, pose = o.pose || 'idle', lw = s * 0.075;
    const sq = pose === 'jump' ? 1 + 0.06 * Math.sin(t * 7) : 1 + 0.02 * Math.sin(t * 3);
    const bw = s * 0.62, bh = s * 0.6, by = -s * 0.02;
    // arm angle from straight down, positive = outwards; [angle, length]
    const armL = { idle: [0.45 + 0.08 * Math.sin(t * 2.4), 0.5], wave: [0.45, 0.5], cheer: [2.3 + 0.2 * Math.sin(t * 8), 0.5], point: [0.3, 0.5], think: [0.45, 0.5], jump: [2.2, 0.5] }[pose];
    const armR = { idle: [0.45 - 0.08 * Math.sin(t * 2.4), 0.5], wave: [2.3 + 0.35 * Math.sin(t * 9), 0.55], cheer: [2.3 - 0.2 * Math.sin(t * 8), 0.5], point: [1.57, 0.62], think: [-2.5, 0.42], jump: [2.2, 0.5] }[pose];
    const arm = (sx, [a, len]) => { const x0 = sx * bw * 0.44, y0 = by + bh * 0.08, x1 = x0 + sx * Math.sin(a) * s * len * 0.55, y1 = y0 + Math.cos(a) * s * len * 0.55;
      if (O.ol) stroke(O.ink, lw + O.lw * 2, [[x0, y0], [x1, y1]]); stroke(shade(c, -0.15), lw, [[x0, y0], [x1, y1]]); C(x1, y1, lw * 0.75); paint(shade(c, 0.1)); };
    ctx.save(); ctx.translate(0, s * 0.02);
    for (const sx of [-1, 1]) { ell(sx * bw * 0.22, by + bh * 0.5 + s * 0.02, s * 0.1, s * 0.055); paint(shade(c, -0.25)); }
    arm(-1, armL); if (pose !== 'think') arm(1, armR);
    ctx.save(); ctx.translate(0, by + bh / 2); ctx.scale(1 / sq, sq); ctx.translate(0, -(by + bh / 2));
    RR(-bw / 2, by - bh / 2, bw, bh, bw * 0.46); paint(c);
    ell(0, by + bh * 0.2, bw * 0.3, bh * 0.2); paint(shade(c, 0.35), false);
    face(0, by - bh * 0.08, s * 0.62, { t, mood: o.mood || (pose === 'cheer' || pose === 'jump' ? 'big' : 'happy'), talking: o.talking, phase: o.phase, look: pose === 'think' ? [0.6, -1] : pose === 'point' ? [1, 0] : [0, 0] });
    if (o.hat === 'party') { ctx.beginPath(); ctx.moveTo(-bw * 0.2, by - bh * 0.42); ctx.lineTo(bw * 0.05, by - bh * 0.95); ctx.lineTo(bw * 0.25, by - bh * 0.4); ctx.closePath(); paint(KV.col('a2')); C(bw * 0.05, by - bh * 0.97, s * 0.035); paint(KV.col('a1')); }
    if (o.hat === 'cap') { ctx.beginPath(); ctx.arc(0, by - bh * 0.3, bw * 0.36, Math.PI, 0); ctx.closePath(); paint(KV.col('a4')); RR(0, by - bh * 0.34, bw * 0.46, s * 0.05, s * 0.025); paint(KV.col('a4')); }
    ctx.restore();
    if (pose === 'think') arm(1, armR);
    ctx.restore();
  };
  I.cat = (ctx, s, o) => {
    const c = o.c, t = o.t;
    ctx.save(); ctx.rotate(0.03 * Math.sin(t * 1.5));
    stroke(O.ol ? O.ink : shade(c, -0.2), s * 0.09, [[s * 0.25, s * 0.3], [s * 0.42, s * 0.1 + 0.05 * s * Math.sin(t * 2.2)], [s * 0.38, -s * 0.12 + 0.08 * s * Math.sin(t * 2.2)]]);
    stroke(c, s * 0.06, [[s * 0.25, s * 0.3], [s * 0.42, s * 0.1 + 0.05 * s * Math.sin(t * 2.2)], [s * 0.38, -s * 0.12 + 0.08 * s * Math.sin(t * 2.2)]]);
    ell(0, s * 0.24, s * 0.3, s * 0.2); paint(c);
    for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx * s * 0.3, -s * 0.12); ctx.lineTo(sx * s * 0.27, -s * 0.44); ctx.lineTo(sx * s * 0.06, -s * 0.27); ctx.closePath(); paint(c); }
    ell(0, -s * 0.08, s * 0.33, s * 0.28); paint(c);
    face(0, -s * 0.06, s * 0.5, { t, mood: o.mood, talking: o.talking, phase: o.phase });
    for (const sx of [-1, 1]) for (const dy of [-0.02, 0.03]) stroke(O.ink, s * 0.012, [[sx * s * 0.2, s * dy], [sx * s * 0.4, s * (dy - 0.02)]]);
    ctx.restore();
  };
  I.dog = (ctx, s, o) => {
    const c = o.c, t = o.t;
    ell(0, s * 0.26, s * 0.3, s * 0.19); paint(c);
    ctx.save(); ctx.translate(s * 0.28, s * 0.2); ctx.rotate(-0.6 + 0.4 * Math.sin(t * 9)); ell(0, -s * 0.08, s * 0.04, s * 0.1); paint(c); ctx.restore();
    ell(0, -s * 0.08, s * 0.3, s * 0.27); paint(c);
    for (const sx of [-1, 1]) { ctx.save(); ctx.translate(sx * s * 0.27, -s * 0.2); ctx.rotate(sx * (0.35 + 0.08 * Math.sin(t * 2 + sx))); ell(0, s * 0.1, s * 0.08, s * 0.17); paint(shade(c, -0.3)); ctx.restore(); }
    ell(0, s * 0.05, s * 0.13, s * 0.09); paint(shade(c, 0.4), false);
    face(0, -s * 0.07, s * 0.46, { t, mood: o.mood, talking: o.talking, phase: o.phase, blush: false });
    ell(0, s * 0.01, s * 0.045, s * 0.032); paint(O.ink, false);
  };
  I.bird = (ctx, s, o) => {
    const c = o.c, t = o.t, flap = Math.sin(t * 10);
    ctx.save(); ctx.translate(0, Math.sin(t * 3) * s * 0.03);
    ell(0, 0, s * 0.3, s * 0.27); paint(c);
    ctx.save(); ctx.translate(-s * 0.08, s * 0.03); ctx.rotate(-0.3 - 0.5 * flap); ell(-s * 0.12, 0, s * 0.16, s * 0.08); paint(shade(c, -0.2)); ctx.restore();
    ctx.beginPath(); ctx.moveTo(s * 0.26, -s * 0.04); ctx.lineTo(s * 0.42, s * 0.01); ctx.lineTo(s * 0.26, s * 0.07); ctx.closePath(); paint(KV.col('a2'));
    face(s * 0.08, -s * 0.06, s * 0.4, { t, mood: o.mood, talking: o.talking, phase: o.phase });
    ctx.restore();
  };
  I.fish = (ctx, s, o) => {
    const c = o.c, t = o.t, w = Math.sin(t * 6);
    ctx.save(); ctx.rotate(0.05 * Math.sin(t * 2));
    ctx.beginPath(); ctx.moveTo(-s * 0.22, 0); ctx.lineTo(-s * 0.45, -s * 0.18 + w * s * 0.04); ctx.lineTo(-s * 0.45, s * 0.18 + w * s * 0.04); ctx.closePath(); paint(shade(c, -0.15));
    ell(0, 0, s * 0.3, s * 0.2); paint(c);
    face(s * 0.1, -s * 0.02, s * 0.36, { t, mood: o.mood, talking: o.talking, phase: o.phase, blush: false });
    for (let i = 0; i < 3; i++) { const k = ((t * 0.5 + i / 3) % 1); C(s * 0.35 + Math.sin(k * 9 + i) * s * 0.03, -s * 0.1 - k * s * 0.35, s * (0.02 + 0.015 * i)); MV.ctx.strokeStyle = 'rgba(80,160,255,0.8)'; MV.ctx.lineWidth = s * 0.008; MV.ctx.globalAlpha *= 1 - k; MV.ctx.stroke(); MV.ctx.globalAlpha /= Math.max(0.01, 1 - k); }
    ctx.restore();
  };

  // ------------------------------------------------------------------ nature
  I.sun = (ctx, s, o) => {
    const c = o.c, t = o.t, n = 12;
    ctx.save(); ctx.rotate(t * 0.35);
    for (let i = 0; i < n; i++) { const a = i * TAU / n, r0 = s * 0.3, r1 = s * (0.44 + 0.04 * Math.sin(t * 3 + i)); ctx.beginPath(); ctx.moveTo(Math.cos(a - 0.12) * r0, Math.sin(a - 0.12) * r0); ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); ctx.lineTo(Math.cos(a + 0.12) * r0, Math.sin(a + 0.12) * r0); ctx.closePath(); paint(shade(c, -0.1)); }
    ctx.restore();
    C(0, 0, s * 0.3); paint(c); C(-s * 0.08, -s * 0.08, s * 0.14); paint(shade(c, 0.35), false);
    if (o.face !== false) face(0, s * 0.02, s * 0.5, { t, mood: o.mood, talking: o.talking, phase: o.phase });
  };
  I.moon = (ctx, s, o) => {
    const c = o.c, t = o.t;
    ctx.save(); ctx.rotate(-0.25 + 0.05 * Math.sin(t * 0.8));
    ctx.beginPath(); ctx.arc(0, 0, s * 0.38, 0.35 * Math.PI, 1.65 * Math.PI, false); ctx.arc(s * 0.16, -s * 0.06, s * 0.3, 1.45 * Math.PI, 0.52 * Math.PI, true); ctx.closePath(); paint(c);
    if (o.face !== false) face(-s * 0.16, s * 0.02, s * 0.42, { t, mood: o.mood || 'sleepy', talking: o.talking, phase: o.phase });
    ctx.restore();
    for (let i = 0; i < 3; i++) { const a = 0.5 + 0.5 * Math.sin(t * 2 + i * 2); ctx.save(); ctx.globalAlpha *= 0.4 + 0.6 * a; KV.path.star(ctx, s * (0.3 + i * 0.07), -s * (0.35 - i * 0.2), s * (0.05 + 0.02 * a)); paint(KV.col('a2')); ctx.restore(); }
  };
  I.star = (ctx, s, o) => { const t = o.t, k = 1 + 0.06 * Math.sin(t * 4); ctx.save(); ctx.scale(k, k); ctx.rotate(0.08 * Math.sin(t * 1.5)); KV.path.star(ctx, 0, s * 0.03, s * 0.46, 5, 0.5); paint(o.c); if (o.face !== false) face(0, s * 0.06, s * 0.36, { t, mood: o.mood, talking: o.talking, phase: o.phase }); ctx.restore(); };
  I.cloud = (ctx, s, o) => {
    const c = o.c || '#FFFFFF', t = o.t || 0;
    ctx.save(); ctx.translate(Math.sin(t * 0.8) * s * 0.02, 0);
    ctx.beginPath(); for (const [x, y, r] of [[-0.25, 0.06, 0.17], [-0.08, -0.08, 0.22], [0.15, -0.02, 0.19], [0.3, 0.08, 0.13], [0.02, 0.1, 0.18]]) { ctx.moveTo(x * s + r * s, y * s); ctx.arc(x * s, y * s, r * s, 0, TAU); }
    if (O.ol) { ctx.strokeStyle = O.ink; ctx.lineWidth = O.lw * 2; ctx.stroke(); }
    ctx.fillStyle = c; ctx.fill();
    ctx.beginPath(); ell(-0.05 * s, 0.14 * s, 0.34 * s, 0.07 * s); ctx.fillStyle = shade(c === '#FFFFFF' ? '#E6EEF8' : c, -0.05); ctx.fill();
    if (o.face) face(0, 0.02 * s, s * 0.36, { t, mood: o.mood, talking: o.talking, phase: o.phase });
    ctx.restore();
  };
  I.rainbow = (ctx, s, o) => { const cols = ['#FF5A5F', '#FF8A3D', '#FFB400', '#12B886', '#3D7BFF', '#9B5DE5'], k = o.k ?? 1;
    cols.forEach((c, i) => { ctx.beginPath(); ctx.arc(0, s * 0.2, s * (0.45 - i * 0.045), Math.PI, Math.PI + Math.PI * k); ctx.strokeStyle = c; ctx.lineWidth = s * 0.047; ctx.stroke(); });
    ctx.save(); ctx.translate(-s * 0.3, s * 0.2); I.cloud(ctx, s * 0.36, { t: o.t }); ctx.restore(); ctx.save(); ctx.translate(s * 0.3, s * 0.2); I.cloud(ctx, s * 0.36, { t: o.t + 1 }); ctx.restore(); };
  I.tree = (ctx, s, o) => { const t = o.t; RR(-s * 0.06, 0, s * 0.12, s * 0.45, s * 0.03); paint('#9C6B3F');
    ctx.save(); ctx.translate(0, -s * 0.05); ctx.rotate(0.03 * Math.sin(t * 1.4)); ctx.beginPath(); for (const [x, y, r] of [[0, -0.2, 0.22], [-0.18, -0.02, 0.17], [0.18, -0.02, 0.17], [0, 0.04, 0.17]]) { ctx.moveTo(x * s + r * s, y * s); ctx.arc(x * s, y * s, r * s, 0, TAU); }
    if (O.ol) { ctx.strokeStyle = O.ink; ctx.lineWidth = O.lw * 2; ctx.stroke(); } ctx.fillStyle = o.c; ctx.fill(); // outline first: no seams inside the canopy
    ctx.beginPath(); ctx.arc(-s * 0.07, -s * 0.27, s * 0.07, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fill(); ctx.restore(); };
  I.flower = (ctx, s, o) => { const t = o.t; stroke('#2F9E44', s * 0.05, [[0, s * 0.45], [s * 0.03 * Math.sin(t * 1.5), 0]]); ctx.save(); ctx.translate(s * 0.03 * Math.sin(t * 1.5), -s * 0.08); ctx.rotate(Math.sin(t) * 0.1);
    for (let i = 0; i < 6; i++) { ctx.save(); ctx.rotate(i * TAU / 6); ell(0, -s * 0.15, s * 0.09, s * 0.14); paint(o.c); ctx.restore(); } C(0, 0, s * 0.1); paint(KV.col('a2')); ctx.restore(); };
  I.mountain = (ctx, s, o) => { ctx.beginPath(); ctx.moveTo(-s * 0.5, s * 0.35); ctx.lineTo(-s * 0.12, -s * 0.3); ctx.lineTo(s * 0.08, 0); ctx.lineTo(s * 0.22, -s * 0.15); ctx.lineTo(s * 0.5, s * 0.35); ctx.closePath(); paint(o.c);
    ctx.beginPath(); ctx.moveTo(-s * 0.21, -s * 0.13); ctx.lineTo(-s * 0.12, -s * 0.3); ctx.lineTo(-s * 0.02, -s * 0.13); ctx.lineTo(-s * 0.08, -s * 0.16); ctx.closePath(); paint('#FFFFFF'); };
  I.wave = (ctx, s, o) => { for (let j = 0; j < 3; j++) { ctx.beginPath(); for (let i = 0; i <= 40; i++) { const x = -s / 2 + s * i / 40, y = s * (0.05 + j * 0.13) + Math.sin(i / 40 * TAU * 1.5 + o.t * 2 + j) * s * 0.04; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.lineTo(s / 2, s / 2); ctx.lineTo(-s / 2, s / 2); ctx.closePath(); paint(shade(o.c, j * 0.18), j === 0); } };
  I.sunset = (ctx, s, o) => { ctx.save(); ctx.beginPath(); ctx.rect(-s / 2, -s / 2, s, s * 0.62); ctx.clip(); ctx.translate(0, s * 0.12 + Math.sin(o.t * 0.4) * s * 0.02); I.sun(ctx, s * 0.9, Object.assign({}, o, { c: KV.col('a6') })); ctx.restore(); ctx.save(); ctx.translate(0, s * 0.1); ctx.scale(1, 0.8); I.wave(ctx, s, Object.assign({}, o, { c: KV.col('a4') })); ctx.restore(); };
  I.snowflake = (ctx, s, o) => { ctx.save(); ctx.rotate(o.t * 0.3); for (let i = 0; i < 6; i++) { ctx.save(); ctx.rotate(i * TAU / 6); stroke(o.c, s * 0.05, [[0, 0], [0, -s * 0.42]]); stroke(o.c, s * 0.04, [[0, -s * 0.25], [-s * 0.1, -s * 0.34]]); stroke(o.c, s * 0.04, [[0, -s * 0.25], [s * 0.1, -s * 0.34]]); ctx.restore(); } ctx.restore(); };
  I.flame = (ctx, s, o) => { const t = o.t; for (const [k, c] of [[1, KV.col('a1')], [0.62, KV.col('a2')]]) { const f = Math.sin(t * 12) * 0.04; ctx.beginPath(); ctx.moveTo(0, s * 0.42 * k); ctx.bezierCurveTo(-s * 0.36 * k, s * 0.3 * k, -s * 0.2 * k, -s * 0.1 * k, (0.05 + f) * s, -s * 0.45 * k); ctx.bezierCurveTo(s * 0.05 * k, -s * 0.1 * k, s * 0.36 * k, s * 0.1 * k, 0, s * 0.42 * k); paint(c, k === 1); } };
  I.planet = (ctx, s, o) => { C(0, 0, s * 0.26); paint(o.c); ctx.save(); ctx.rotate(-0.35); ell(0, 0, s * 0.45, s * 0.1); ctx.strokeStyle = KV.col('a2'); ctx.lineWidth = s * 0.04; ctx.stroke(); ctx.restore(); C(-s * 0.08, -s * 0.07, s * 0.05); paint(shade(o.c, -0.15), false); };

  // ------------------------------------------------------------------ objects
  I.house = (ctx, s, o) => { RR(-s * 0.32, -s * 0.05, s * 0.64, s * 0.45, s * 0.03); paint(KV.col('card')); ctx.beginPath(); ctx.moveTo(-s * 0.42, -s * 0.02); ctx.lineTo(0, -s * 0.42); ctx.lineTo(s * 0.42, -s * 0.02); ctx.closePath(); paint(o.c);
    RR(-s * 0.08, s * 0.14, s * 0.16, s * 0.26, s * 0.03); paint(KV.col('a4')); RR(s * 0.13, s * 0.05, s * 0.13, s * 0.12, s * 0.02); paint('#BFE3FF'); };
  I.car = (ctx, s, o) => { const b = Math.abs(Math.sin(o.t * 8)) * s * 0.01; ctx.save(); ctx.translate(0, -b); RR(-s * 0.45, -s * 0.05, s * 0.9, s * 0.22, s * 0.08); paint(o.c); ctx.beginPath(); ctx.moveTo(-s * 0.25, -s * 0.05); ctx.lineTo(-s * 0.15, -s * 0.24); ctx.lineTo(s * 0.18, -s * 0.24); ctx.lineTo(s * 0.3, -s * 0.05); ctx.closePath(); paint(shade(o.c, 0.2)); RR(-s * 0.12, -s * 0.2, s * 0.13, s * 0.12, s * 0.02); paint('#BFE3FF'); RR(s * 0.05, -s * 0.2, s * 0.12, s * 0.12, s * 0.02); paint('#BFE3FF'); ctx.restore();
    for (const x of [-0.25, 0.25]) { ctx.save(); ctx.translate(x * s, s * 0.18); ctx.rotate(o.t * 6); C(0, 0, s * 0.1); paint('#2B2F3A'); C(0, 0, s * 0.04); paint('#C9CED6', false); ctx.restore(); } };
  I.book = (ctx, s, o) => { const k = 0.1 * Math.sin(o.t * 2); ctx.save(); ctx.rotate(k * 0.3); RR(-s * 0.4, -s * 0.28, s * 0.4, s * 0.52, s * 0.03); paint(o.c); RR(0, -s * 0.28, s * 0.4, s * 0.52, s * 0.03); paint(shade(o.c, -0.1)); RR(-s * 0.36, -s * 0.24, s * 0.34, s * 0.44, s * 0.02); paint('#FFFFFF', false); RR(s * 0.02, -s * 0.24, s * 0.34, s * 0.44, s * 0.02); paint('#FFFFFF', false);
    for (let i = 0; i < 4; i++) { stroke('#C3CAD8', s * 0.02, [[-s * 0.3, -s * 0.14 + i * s * 0.09], [-s * 0.08, -s * 0.14 + i * s * 0.09]]); stroke('#C3CAD8', s * 0.02, [[s * 0.08, -s * 0.14 + i * s * 0.09], [s * 0.3, -s * 0.14 + i * s * 0.09]]); } ctx.restore(); };
  I.ball = (ctx, s, o) => { const y = -Math.abs(Math.sin(o.t * 3.2)) * s * 0.12; ctx.save(); ctx.translate(0, y); ctx.rotate(o.t * 2); C(0, 0, s * 0.34); paint(o.c); ctx.save(); C(0, 0, s * 0.34); ctx.clip(); for (const [a, c] of [[0, '#FFFFFF'], [2.1, KV.col('a2')], [4.2, KV.col('a4')]]) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, s * 0.36, a, a + 1); ctx.closePath(); ctx.fillStyle = c; ctx.fill(); } ctx.restore(); C(0, 0, s * 0.34); paint(null); ctx.restore(); };
  I.gift = (ctx, s, o) => { const w = Math.sin(o.t * 4) * 0.04; ctx.save(); ctx.rotate(w); RR(-s * 0.32, -s * 0.08, s * 0.64, s * 0.46, s * 0.03); paint(o.c); RR(-s * 0.36, -s * 0.2, s * 0.72, s * 0.14, s * 0.03); paint(shade(o.c, -0.12)); RR(-s * 0.05, -s * 0.2, s * 0.1, s * 0.58, 0); paint(KV.col('a2'), false);
    for (const sx of [-1, 1]) { ell(sx * s * 0.1, -s * 0.27, s * 0.1, s * 0.06, sx * 0.5); paint(KV.col('a2')); } ctx.restore(); };
  I.trophy = (ctx, s, o) => { const c = KV.col(o.P.color || '#FFB400'); for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(sx * s * 0.24, -s * 0.18, s * 0.1, 0, TAU); ctx.strokeStyle = c; ctx.lineWidth = s * 0.05; ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(-s * 0.26, -s * 0.34); ctx.lineTo(s * 0.26, -s * 0.34); ctx.quadraticCurveTo(s * 0.24, s * 0.08, 0, s * 0.1); ctx.quadraticCurveTo(-s * 0.24, s * 0.08, -s * 0.26, -s * 0.34); paint(c); RR(-s * 0.05, s * 0.08, s * 0.1, s * 0.14, 0); paint(shade(c, -0.2)); RR(-s * 0.2, s * 0.22, s * 0.4, s * 0.12, s * 0.03); paint(shade(c, -0.3));
    ctx.save(); ctx.globalAlpha *= 0.5 + 0.5 * Math.sin(o.t * 4); KV.path.star(ctx, s * 0.3, -s * 0.38, s * 0.06); paint('#FFFFFF', false); ctx.restore(); };
  I.bulb = (ctx, s, o) => { MV.glow(0, -s * 0.1, s * 0.6, KV.col('a2'), 0.35 + 0.15 * Math.sin(o.t * 3)); C(0, -s * 0.1, s * 0.26); paint(KV.col(o.P.color || '#FFD43B')); RR(-s * 0.1, s * 0.13, s * 0.2, s * 0.14, s * 0.03); paint('#9AA4B2'); stroke('#E67700', s * 0.025, [[-s * 0.06, -s * 0.05], [0, -s * 0.13], [s * 0.06, -s * 0.05]]); };
  I.gear = (ctx, s, o) => { ctx.save(); ctx.rotate(o.t * 0.8); ctx.beginPath(); const n = 10; for (let i = 0; i < n * 2; i++) { const a = i * Math.PI / n, r = i % 2 ? s * 0.34 : s * 0.44; ctx.lineTo(Math.cos(a - 0.12) * r, Math.sin(a - 0.12) * r); ctx.lineTo(Math.cos(a + 0.12) * r, Math.sin(a + 0.12) * r); } ctx.closePath(); paint(o.c); C(0, 0, s * 0.13); paint(KV.col('card')); ctx.restore(); };
  I.laptop = (ctx, s, o) => { RR(-s * 0.36, -s * 0.3, s * 0.72, s * 0.46, s * 0.03); paint('#2B2F3A'); RR(-s * 0.32, -s * 0.26, s * 0.64, s * 0.38, s * 0.02); paint(o.c, false);
    for (let i = 0; i < 3; i++) { const k = clamp(((o.t * 0.8) % 2) * 3 - i); RR(-s * 0.25, -s * 0.19 + i * s * 0.09, s * 0.4 * k + 0.01, s * 0.04, s * 0.02); paint('rgba(255,255,255,0.8)', false); }
    ctx.beginPath(); ctx.moveTo(-s * 0.44, s * 0.18); ctx.lineTo(s * 0.44, s * 0.18); ctx.lineTo(s * 0.4, s * 0.26); ctx.lineTo(-s * 0.4, s * 0.26); ctx.closePath(); paint('#9AA4B2'); };
  I.phone = (ctx, s, o) => { ctx.save(); ctx.rotate(0.05 * Math.sin(o.t * 20) * (Math.sin(o.t * 2) > 0.6)); RR(-s * 0.2, -s * 0.4, s * 0.4, s * 0.8, s * 0.07); paint('#2B2F3A'); RR(-s * 0.17, -s * 0.34, s * 0.34, s * 0.64, s * 0.04); paint(o.c, false); C(0, s * 0.35, s * 0.025); paint('#9AA4B2', false); ctx.restore(); };
  I.rocket = (ctx, s, o) => { const t = o.t; ctx.save(); ctx.translate(Math.sin(t * 20) * s * 0.006, 0);
    for (const [k, c] of [[1, KV.col('a1')], [0.6, KV.col('a2')]]) { ctx.beginPath(); ctx.moveTo(-s * 0.08 * k, s * 0.28); ctx.lineTo(0, s * (0.28 + (0.2 + 0.06 * Math.sin(t * 25)) * k)); ctx.lineTo(s * 0.08 * k, s * 0.28); ctx.closePath(); paint(c, false); }
    for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx * s * 0.1, s * 0.05); ctx.lineTo(sx * s * 0.24, s * 0.3); ctx.lineTo(sx * s * 0.1, s * 0.25); ctx.closePath(); paint(KV.col('a1')); }
    ctx.beginPath(); ctx.moveTo(0, -s * 0.45); ctx.quadraticCurveTo(s * 0.18, -s * 0.2, s * 0.12, s * 0.28); ctx.lineTo(-s * 0.12, s * 0.28); ctx.quadraticCurveTo(-s * 0.18, -s * 0.2, 0, -s * 0.45); paint(o.c === KV.col('a1') ? '#F1F3F7' : o.c);
    C(0, -s * 0.08, s * 0.07); paint('#BFE3FF'); ctx.restore(); };
  I.balloon = (ctx, s, o) => { const t = o.t; ctx.save(); ctx.translate(0, Math.sin(t * 1.6) * s * 0.03); ctx.rotate(0.06 * Math.sin(t * 1.2)); stroke(O.ink, s * 0.012, [[0, s * 0.2], [s * 0.03, s * 0.35], [-s * 0.02, s * 0.48]]); ell(0, -s * 0.1, s * 0.25, s * 0.3); paint(o.c); ell(-s * 0.08, -s * 0.2, s * 0.05, s * 0.08, -0.4); paint('rgba(255,255,255,0.6)', false); ctx.beginPath(); ctx.moveTo(-s * 0.03, s * 0.21); ctx.lineTo(s * 0.03, s * 0.21); ctx.lineTo(0, s * 0.17); ctx.closePath(); paint(o.c); ctx.restore(); };
  I.cake = (ctx, s, o) => { RR(-s * 0.36, 0, s * 0.72, s * 0.3, s * 0.05); paint(o.c); RR(-s * 0.3, -s * 0.2, s * 0.6, s * 0.22, s * 0.05); paint(shade(o.c, 0.3)); for (const x of [-0.14, 0, 0.14]) { RR(x * s - s * 0.02, -s * 0.34, s * 0.04, s * 0.14, s * 0.01); paint('#FFFFFF'); ctx.save(); ctx.translate(x * s, -s * 0.38); ctx.scale(1, 1 + 0.15 * Math.sin(o.t * 14 + x * 20)); ell(0, 0, s * 0.025, s * 0.045); paint(KV.col('a2'), false); ctx.restore(); } };
  I.clock = (ctx, s, o) => { C(0, 0, s * 0.4); paint(KV.col('card')); C(0, 0, s * 0.4); MV.ctx.strokeStyle = o.c; MV.ctx.lineWidth = s * 0.06; MV.ctx.stroke(); for (let i = 0; i < 12; i++) { const a = i * TAU / 12; stroke(O.ink, s * 0.02, [[Math.cos(a) * s * 0.3, Math.sin(a) * s * 0.3], [Math.cos(a) * s * 0.33, Math.sin(a) * s * 0.33]]); }
    const h = o.t * 0.2 - Math.PI / 2, m = o.t * 2.4 - Math.PI / 2; stroke(O.ink, s * 0.04, [[0, 0], [Math.cos(h) * s * 0.17, Math.sin(h) * s * 0.17]]); stroke(o.c, s * 0.03, [[0, 0], [Math.cos(m) * s * 0.27, Math.sin(m) * s * 0.27]]); C(0, 0, s * 0.03); paint(O.ink, false); };
  I.apple = (ctx, s, o) => { ctx.beginPath(); ctx.moveTo(0, -s * 0.2); ctx.bezierCurveTo(s * 0.35, -s * 0.4, s * 0.48, s * 0.1, s * 0.15, s * 0.36); ctx.quadraticCurveTo(0, s * 0.3, -s * 0.15, s * 0.36); ctx.bezierCurveTo(-s * 0.48, s * 0.1, -s * 0.35, -s * 0.4, 0, -s * 0.2); paint(o.c);
    stroke('#7A4B2A', s * 0.04, [[0, -s * 0.2], [s * 0.03, -s * 0.36]]); ctx.save(); ctx.translate(s * 0.1, -s * 0.33); ctx.rotate(-0.5 + 0.1 * Math.sin(o.t * 2)); ell(0, 0, s * 0.09, s * 0.04); paint('#2F9E44'); ctx.restore(); ell(-s * 0.15, -s * 0.05, s * 0.04, s * 0.08, 0.4); paint('rgba(255,255,255,0.5)', false); };
  I.pencil = (ctx, s, o) => { ctx.save(); ctx.rotate(-0.7 + 0.05 * Math.sin(o.t * 6)); RR(-s * 0.07, -s * 0.38, s * 0.14, s * 0.6, s * 0.02); paint(o.c); RR(-s * 0.07, -s * 0.44, s * 0.14, s * 0.09, s * 0.03); paint('#FF8FA3'); ctx.beginPath(); ctx.moveTo(-s * 0.07, s * 0.22); ctx.lineTo(0, s * 0.4); ctx.lineTo(s * 0.07, s * 0.22); ctx.closePath(); paint('#F5D6A8'); ctx.beginPath(); ctx.moveTo(-s * 0.025, s * 0.33); ctx.lineTo(0, s * 0.4); ctx.lineTo(s * 0.025, s * 0.33); ctx.closePath(); paint(O.ink, false); ctx.restore(); };
  I.bell = (ctx, s, o) => { ctx.save(); ctx.rotate(0.25 * Math.sin(o.t * 8) * Math.max(0, Math.sin(o.t * 1.5))); ctx.beginPath(); ctx.moveTo(-s * 0.3, s * 0.22); ctx.quadraticCurveTo(-s * 0.28, -s * 0.34, 0, -s * 0.34); ctx.quadraticCurveTo(s * 0.28, -s * 0.34, s * 0.3, s * 0.22); ctx.closePath(); paint(o.c); C(0, s * 0.3, s * 0.07); paint(shade(o.c, -0.25)); C(0, -s * 0.38, s * 0.05); paint(shade(o.c, -0.25)); ctx.restore(); };
  I.note = (ctx, s, o) => { ctx.save(); ctx.translate(0, Math.sin(o.t * 3) * s * 0.03); ctx.rotate(0.1 * Math.sin(o.t * 2)); ell(-s * 0.16, s * 0.25, s * 0.13, s * 0.09, -0.3); paint(o.c); ell(s * 0.2, s * 0.15, s * 0.13, s * 0.09, -0.3); paint(o.c); stroke(o.c, s * 0.05, [[-s * 0.05, s * 0.23], [-s * 0.05, -s * 0.32], [s * 0.31, -s * 0.42], [s * 0.31, s * 0.13]]); ctx.restore(); };
  I.heart = (ctx, s, o) => { const k = 1 + 0.08 * Math.max(0, Math.sin(o.t * 6)); ctx.save(); ctx.scale(k, k); KV.path.heart(ctx, 0, s * 0.02, s * 0.36); paint(o.c); ell(-s * 0.16, -s * 0.12, s * 0.05, s * 0.08, 0.6); paint('rgba(255,255,255,0.5)', false); ctx.restore(); };

  const DEF = { buddy: 'a4', cat: 'a6', dog: '#C98B54', bird: 'a4', fish: 'a6', sun: '#FFC53D', moon: '#FFE066', star: '#FFC53D', cloud: '#FFFFFF', rainbow: null, tree: '#40C057', flower: 'a1', mountain: '#748FFC',
    wave: '#4DABF7', sunset: null, snowflake: '#74C0FC', flame: null, planet: 'a5', house: 'a1', car: 'a1', book: 'a4', ball: 'a1', gift: 'a5', trophy: null, bulb: null, gear: 'a4', laptop: '#4DABF7', phone: '#4DABF7', rocket: 'a1', balloon: 'a1', cake: '#FF8FA3', clock: 'a1', apple: '#FA5252', pencil: '#FFD43B', bell: '#FFC53D', note: 'a5', heart: 'a1' };
  KV.illus = I; KV.illus.list = Object.keys(DEF);
  // outline style for a drawing of size s (sticker outline on light themes, none on tech / steel)
  const styleOf = (P, s, env) => { const dark = env.theme.bgStyle === 'tech' || env.theme.bgStyle === 'steel', o = { ink: KV.col(P.ink || 'ink'), lw: s * (P.lw ?? 0.018), ol: P.outline ?? !dark };
    if (o.ink === env.theme.ink && dark) o.ink = '#0B1020'; return o; };
  // any code that calls KV.illus.<name>(ctx, s, o) directly (bg 'sky' clouds, custom blocks) sets the style first: the
  // module style must never carry over from whatever drew before (frames are pure functions of time, in any order)
  KV.illusStyle = (P, s, env) => { O = styleOf(P || {}, s, env); BLINK = null; };
  KV.define('illus', {
    cat: 'media', enter: 'pop', reveals: ['draw'],
    draw(ctx, P, env) {
      const bl = P.blink === 'natural' || P.blink === true ? {} : P.blink;
      BLINK = bl ? { every: bl.every ?? 3.4, jitter: clamp(bl.jitter ?? 0.35, 0, 0.9), dur: bl.dur ?? 0.13, seed: env.rng(77) * 1000 } : null;
      const fn = I[P.name];
      if (!fn) throw new Error(`illus "${P.name}" not in library (${Object.keys(DEF).join(', ')}); draw it with kind:'custom' or KV.define`);
      const s = Math.min(env.box.w, env.box.h);
      O = styleOf(P, s, env);
      const talking = P.talk === true ? KV.speaking(env.sc.id, env.t) : Array.isArray(P.talk) ? env.st >= env.T(P.talk[0]) && env.st <= env.T(P.talk[1]) : false;
      if (P.shadow !== false) { ctx.save(); ell(0, s * 0.47, s * 0.3, s * 0.04); ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fill(); ctx.restore(); }
      if (P.flip) ctx.scale(-1, 1);
      fn(ctx, s, { c: KV.col(P.color || DEF[P.name] || 'a1'), t: env.lt + (P.phase ?? 0), P, env, mood: P.mood, pose: P.pose, hat: P.hat, face: P.face, talking, phase: P.phase || 0, k: env.revealType === 'draw' ? env.reveal : 1 });
    }
  });

  // ------------------------------------------------------------------ icons (single colour glyphs)
  const G = {
    check: (s) => MV.icon.check(0, 0, s * 0.4, O.c, s * 0.12), cross: (s) => MV.icon.cross(0, 0, s * 0.45, O.c, s * 0.12), warn: (s) => MV.icon.warn(0, 0, s * 0.42, O.c),
    shield: (s) => MV.icon.shield(0, 0, s * 0.45, O.c, '#FFFFFF'), crown: (s) => MV.icon.crown(0, 0, s * 0.42, O.c), code: (s) => MV.icon.code(0, 0, s * 0.45, O.c),
    star: (s) => { KV.path.star(MV.ctx, 0, s * 0.03, s * 0.46); MV.ctx.fillStyle = O.c; MV.ctx.fill(); },
    heart: (s) => { KV.path.heart(MV.ctx, 0, s * 0.03, s * 0.36); MV.ctx.fillStyle = O.c; MV.ctx.fill(); },
    play: (s) => { const c = MV.ctx; c.beginPath(); c.moveTo(-s * 0.25, -s * 0.35); c.lineTo(s * 0.38, 0); c.lineTo(-s * 0.25, s * 0.35); c.closePath(); c.fillStyle = O.c; c.fill(); },
    arrow: (s) => { stroke(O.c, s * 0.12, [[-s * 0.38, 0], [s * 0.3, 0]]); stroke(O.c, s * 0.12, [[s * 0.08, -s * 0.24], [s * 0.34, 0], [s * 0.08, s * 0.24]]); },
    chat: (s) => { const c = MV.ctx; RR(-s * 0.42, -s * 0.34, s * 0.84, s * 0.56, s * 0.14); c.fillStyle = O.c; c.fill(); c.beginPath(); c.moveTo(-s * 0.2, s * 0.2); c.lineTo(-s * 0.3, s * 0.42); c.lineTo(0, s * 0.2); c.fill(); for (const x of [-0.18, 0, 0.18]) { C(x * s, -s * 0.06, s * 0.05); c.fillStyle = '#FFFFFF'; c.fill(); } },
    globe: (s) => { const c = MV.ctx; c.strokeStyle = O.c; c.lineWidth = s * 0.07; C(0, 0, s * 0.4); c.stroke(); ell(0, 0, s * 0.17, s * 0.4); c.stroke(); stroke(O.c, s * 0.07, [[-s * 0.4, 0], [s * 0.4, 0]]); },
    phone: (s) => { const c = MV.ctx; RR(-s * 0.2, -s * 0.42, s * 0.4, s * 0.84, s * 0.08); c.fillStyle = O.c; c.fill(); RR(-s * 0.15, -s * 0.33, s * 0.3, s * 0.58, s * 0.03); c.fillStyle = '#FFFFFF'; c.fill(); },
    mail: (s) => { const c = MV.ctx; RR(-s * 0.42, -s * 0.28, s * 0.84, s * 0.56, s * 0.06); c.fillStyle = O.c; c.fill(); stroke('#FFFFFF', s * 0.06, [[-s * 0.34, -s * 0.18], [0, s * 0.06], [s * 0.34, -s * 0.18]]); },
    clock: (s) => { const c = MV.ctx; c.strokeStyle = O.c; c.lineWidth = s * 0.08; C(0, 0, s * 0.4); c.stroke(); stroke(O.c, s * 0.08, [[0, -s * 0.24], [0, 0], [s * 0.17, s * 0.1]]); },
    pin: (s) => { const c = MV.ctx; c.beginPath(); c.arc(0, -s * 0.12, s * 0.28, Math.PI * 0.8, Math.PI * 2.2); c.lineTo(0, s * 0.45); c.closePath(); c.fillStyle = O.c; c.fill(); C(0, -s * 0.12, s * 0.1); c.fillStyle = '#FFFFFF'; c.fill(); },
    user: (s) => { const c = MV.ctx; C(0, -s * 0.16, s * 0.18); c.fillStyle = O.c; c.fill(); c.beginPath(); c.ellipse(0, s * 0.34, s * 0.34, s * 0.26, 0, Math.PI, 0); c.fill(); },
    home: (s) => { const c = MV.ctx; c.beginPath(); c.moveTo(-s * 0.42, 0); c.lineTo(0, -s * 0.4); c.lineTo(s * 0.42, 0); c.lineTo(s * 0.3, 0); c.lineTo(s * 0.3, s * 0.38); c.lineTo(-s * 0.3, s * 0.38); c.lineTo(-s * 0.3, 0); c.closePath(); c.fillStyle = O.c; c.fill(); RR(-s * 0.08, s * 0.12, s * 0.16, s * 0.26, s * 0.02); c.fillStyle = '#FFFFFF'; c.fill(); },
    bolt: (s) => { const c = MV.ctx; c.beginPath(); c.moveTo(s * 0.08, -s * 0.45); c.lineTo(-s * 0.25, s * 0.06); c.lineTo(-s * 0.02, s * 0.06); c.lineTo(-s * 0.1, s * 0.45); c.lineTo(s * 0.26, -s * 0.08); c.lineTo(s * 0.03, -s * 0.08); c.closePath(); c.fillStyle = O.c; c.fill(); },
    music: (s) => { O.ol = false; I.note(MV.ctx, s, { c: O.c, t: 0 }); },
    search: (s) => { const c = MV.ctx; c.strokeStyle = O.c; c.lineWidth = s * 0.1; C(-s * 0.06, -s * 0.06, s * 0.26); c.stroke(); stroke(O.c, s * 0.12, [[s * 0.14, s * 0.14], [s * 0.38, s * 0.38]]); },
    calendar: (s) => { const c = MV.ctx; RR(-s * 0.4, -s * 0.32, s * 0.8, s * 0.72, s * 0.08); c.fillStyle = O.c; c.fill(); c.fillStyle = '#FFFFFF'; RR(-s * 0.32, -s * 0.12, s * 0.64, s * 0.44, s * 0.03); c.fill(); for (const x of [-0.2, 0.2]) { RR(x * s - s * 0.04, -s * 0.44, s * 0.08, s * 0.18, s * 0.04); c.fillStyle = O.c; c.fill(); } },
    chart: (s) => { const c = MV.ctx; c.fillStyle = O.c; [[-0.36, 0.2], [-0.12, 0.45], [0.12, 0.3], [0.36, 0.7]].forEach(([x, h]) => { RR(x * s - s * 0.09, s * 0.38 - h * s, s * 0.18, h * s, s * 0.03); c.fill(); }); },
    lock: (s) => { const c = MV.ctx; c.strokeStyle = O.c; c.lineWidth = s * 0.09; c.beginPath(); c.arc(0, -s * 0.1, s * 0.2, Math.PI, 0); c.stroke(); RR(-s * 0.32, -s * 0.1, s * 0.64, s * 0.5, s * 0.08); c.fillStyle = O.c; c.fill(); },
    thumb: (s) => { const c = MV.ctx; c.fillStyle = O.c; RR(-s * 0.4, -s * 0.02, s * 0.16, s * 0.42, s * 0.04); c.fill(); c.beginPath(); c.moveTo(-s * 0.18, -s * 0.02); c.lineTo(0, -s * 0.42); c.quadraticCurveTo(s * 0.12, -s * 0.42, s * 0.08, -s * 0.1); c.lineTo(s * 0.36, -s * 0.1); c.quadraticCurveTo(s * 0.44, s * 0.2, s * 0.3, s * 0.4); c.lineTo(-s * 0.18, s * 0.4); c.closePath(); c.fill(); },
    cart: (s) => { stroke(O.c, s * 0.08, [[-s * 0.44, -s * 0.3], [-s * 0.3, -s * 0.3], [-s * 0.18, s * 0.14], [s * 0.3, s * 0.14], [s * 0.4, -s * 0.18], [-s * 0.26, -s * 0.18]]); for (const x of [-0.12, 0.24]) { C(x * s, s * 0.3, s * 0.07); MV.ctx.fillStyle = O.c; MV.ctx.fill(); } },
    gear: (s) => { O.ol = false; I.gear(MV.ctx, s, { c: O.c, t: 0 }); },
    bulb: (s) => { const c = MV.ctx; C(0, -s * 0.1, s * 0.27); c.fillStyle = O.c; c.fill(); RR(-s * 0.12, s * 0.14, s * 0.24, s * 0.2, s * 0.04); c.fill(); },
    trophy: (s) => { O.ol = false; I.trophy(MV.ctx, s, { t: 0, P: { color: O.c } }); }
  };
  KV.icons = G; KV.icons.list = Object.keys(G);
  KV.define('icon', {
    cat: 'media', enter: 'pop',
    draw(ctx, P, env) {
      const g = G[P.name]; if (!g) throw new Error(`icon "${P.name}" not in library (${Object.keys(G).join(', ')})`);
      const s = Math.min(env.box.w, env.box.h);
      O = { ink: KV.col('ink'), lw: s * 0.02, ol: false, c: KV.col(P.color || 'a1') };
      if (P.disc) { ctx.fillStyle = KV.col(P.disc); MV.circle(0, 0, s * 0.62); ctx.fill(); }
      g(s * (P.disc ? 0.72 : 1));
    }
  });
})();
