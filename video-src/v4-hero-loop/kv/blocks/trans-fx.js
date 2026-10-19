/* KV transitions library (Canvas 2D) — light & flash, distortion & glitch, dissolve & texture, metaballs.
 * Low-res alpha fields (KV.TX.field, cell = `res` px) are upscaled into B's mask; values that do not depend on k
 * (noise, burn front) are cached per size + seed (KV.TX.grid). Metadata: trans-meta.js · guide: references/transitions.md.
 * Every type: k = 0 → A, k = 1 → B exactly; flashes per type are counted in trans-meta.js (lint rule 6).
 */
(function () {
  'use strict';
  const KV = window.KV, { clamp, lerp, E, hash } = MV;
  const { EZ, dirName, seg, scr, snapA, field, maskFrom, grid, fbm, rgbSplit, xfade } = KV.TX;
  const fill = (h, c) => { h.ctx.fillStyle = h.col(c); h.ctx.fillRect(0, 0, h.W, h.H); };
  const dims = (h, res) => [Math.ceil(h.W / res), Math.ceil(h.H / res)];
  const ramp = (d, i, j, w, hh) => ({ right: i / w, left: 1 - i / w, down: j / hh, up: 1 - j / hh })[d] ?? 0;   // 0 = goes first; front travels toward d

  // ================================================================ light & flash
  // leak: warm film-light blooms drift across (screen blend); A → B swaps under the brightest moment; mode 'sweep' = flare band
  KV.transition('leak', (k, draw, tr, h) => {
    const { ctx, W, H } = h, e = EZ(tr, k), peak = Math.sin(Math.PI * clamp(k)) ** 2, sd = tr.seed || 0, amt = clamp(tr.amount ?? 0.7), x0 = seg(k, 0.35, 0.65);
    if (x0 <= 0) draw.a(); else if (x0 >= 1) draw.b(); else xfade(E.io(x0), draw, tr, h);
    if (peak * amt < 1e-3) return;
    const cols = [].concat(tr.colors || ['#FF7A1A', '#FFC24A', '#FF3D6E']).map(c => h.col(c));
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    if (tr.mode === 'sweep') {                                                          // narrow flare band crossing at 20°
      const nx = Math.cos(0.35), ny = Math.sin(0.35), P = W * nx + H * ny, bw = 0.22 * Math.max(W, H), c0 = lerp(-bw, P + bw, EZ(tr, k, 'lin'));
      const g = ctx.createLinearGradient(nx * (c0 - bw), ny * (c0 - bw), nx * (c0 + bw), ny * (c0 + bw));
      g.addColorStop(0, MV.rgba(cols[0], 0)); g.addColorStop(0.42, MV.rgba(cols[1 % cols.length], amt * peak * 0.8)); g.addColorStop(0.5, MV.rgba('#FFFFFF', amt * peak));
      g.addColorStop(0.58, MV.rgba(cols[1 % cols.length], amt * peak * 0.8)); g.addColorStop(1, MV.rgba(cols[0], 0)); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    } else cols.forEach((c, i) => {
      const x = lerp(-0.3, 1.3, e + (hash(sd + i) - 0.5) * 0.3) * W, y = (0.2 + hash(sd + i * 3) * 0.6) * H, r = (0.5 + 0.5 * hash(sd + i + 7)) * Math.max(W, H);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, MV.rgba(c, amt * peak)); g.addColorStop(1, MV.rgba(c, 0));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    });
    ctx.restore();
  });
  // burn: an organic burn front (fbm) eats through A, travelling along `dir` (default left, like wipe), with a hot rim
  KV.transition('burn', (k, draw, tr, h) => {
    const e = lerp(-0.08, 1.08, EZ(tr, k, 'lin')), sd = tr.seed || 0, res = Math.max(2, tr.res ?? 8), [w, hh] = dims(h, res), M = Math.max(w, hh), d = dirName(tr, 'left');   // like wipe: the front travels left (starts at the right edge)
    const N = grid(`burn:${sd}:${res}:${d}`, w, hh, (i, j) => 0.7 * fbm(i / M * 4 + sd * 7.1, j / M * 4) + 0.3 * ramp(d, i, j, w, hh));
    maskFrom(h, draw, field('burnM', h, res, (i, j) => (e - N[j * w + i]) / 0.03));      // burnt -> B
    if (e <= -0.07 || e >= 1.07) return;                                                // rim band only while burning
    const g = field('burnG', h, res, (i, j) => 1 - Math.abs(e - N[j * w + i]) / 0.07), [c, x] = scr('burnC', w, hh);
    x.drawImage(g, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = h.col(tr.color || '#FF8A2A'); x.fillRect(0, 0, w, hh);
    const { ctx } = h; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(c, 0, 0, w * res, hh * res); ctx.drawImage(c, 0, 0, w * res, hh * res); ctx.restore();   // twice = hot core
  });

  // ================================================================ distortion & glitch
  // glitch: stepped (rate Hz) slice displacement + chromatic split; a few slices from the other scene (≈ 10 % area); swap at k = 0.5
  KV.transition('glitch', (k, draw, tr, h) => {
    const { ctx, W, H, u } = h, step = Math.floor(k * (tr.d || 0.3) * (tr.rate ?? 12)), r = i => hash(step * 13.1 + i * 7.7 + (tr.seed || 0) * 3.3);
    const amt = Math.sin(Math.PI * clamp(k)) * (tr.amount ?? 1), A = snapA(h, draw), B = h.onBuffer(draw.b), base = k < 0.5 ? A : B, other = k < 0.5 ? B : A;
    rgbSplit(h, base, (tr.split ?? 14) * u * amt * (r(99) < 0.5 ? 1 : -1), 0);
    if (amt < 0.05) return;
    for (let i = 0; i < 6; i++) {
      const y = r(i) * H, sh = (0.02 + 0.07 * r(i + 20)) * H, dx = (r(i + 40) - 0.5) * 180 * u * amt, sw = r(i + 60) < 0.3 && k > 0.15 && k < 0.85;
      ctx.drawImage(sw ? other : base, 0, y, W, sh, dx, y, W, sh);
    }
  });
  // datamosh: A's pixels dragged by smooth block "motion vectors" while B's blocks bleed in at their own times, then settle
  KV.transition('datamosh', (k, draw, tr, h) => {
    const { ctx, W, H } = h, A = snapA(h, draw), B = h.onBuffer(draw.b), bs = Math.max(8, (tr.block ?? 0.04) * Math.max(W, H)), sd = tr.seed || 0;
    const nx = Math.ceil(W / bs), ny = Math.ceil(H / bs), m = Math.sin(Math.PI * clamp(k)) ** 2 * (tr.amount ?? 0.6) * bs * 6;
    ctx.drawImage(k < 0.5 ? A : B, 0, 0);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const fx = Math.sin(i * 0.35 + sd) + Math.cos(j * 0.5 + i * 0.1), fy = 0.6 * Math.cos(j * 0.3 - sd);
      const sw = clamp((k - hash(i * 17.3 + j * 3.1 + sd) * 0.7) / 0.3);                // each block switches once, at its own time
      ctx.drawImage(sw > 0.5 ? B : A, i * bs - fx * m * (1 - sw * 0.5), j * bs - fy * m, bs, bs, i * bs, j * bs, bs, bs);   // source outside = clipped
    }
  });
  // pixelate: A breaks into growing square cells (max `cell` × long side), swaps to B at the coarsest point, B resolves
  KV.transition('pixelate', (k, draw, tr, h) => {
    const { ctx, W, H } = h, a = k < 0.5, q = a ? E.i(clamp(k * 2)) : 1 - E.o(clamp(k * 2 - 1)), img = h.onBuffer(a ? draw.a : draw.b);
    const cell = Math.round(lerp(1, (tr.cell ?? 0.05) * Math.max(W, H), q));
    ctx.drawImage(img, 0, 0); if (cell <= 1) return;
    const w = Math.ceil(W / cell), hh = Math.ceil(H / cell), [s, x] = scr('px', w, hh); x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, W / cell, H / cell);
    ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(s, 0, 0, w, hh, 0, 0, w * cell, hh * cell); ctx.restore();
  });
  // tvoff: A collapses into a bright line, then a glowing dot, black; B fades up in the last 30 % (on: false = cut to B)
  KV.transition('tvoff', (k, draw, tr, h) => {
    const { ctx, W, H, u } = h;
    if (k >= 0.7) { draw.b(); if (tr.on !== false) MV.fade('#000', 1 - E.o((k - 0.7) / 0.3)); return; }
    const A = h.onBuffer(draw.a), sy = lerp(1, 0.006, E.i(clamp(k / 0.4))), sx = lerp(1, 0.004, E.i(clamp((k - 0.4) / 0.2))), br = 1 + 2 * clamp(k / 0.4);
    fill(h, '#000'); ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(sx, sy); if (br > 1.001) ctx.filter = `brightness(${br.toFixed(3)})`; ctx.drawImage(A, -W / 2, -H / 2); ctx.restore();
    if (k > 0.4) {
      const r = lerp(30, 6, (k - 0.4) / 0.3) * u, g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, r * 3);
      g.addColorStop(0, '#FFFFFF'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
  });

  // ================================================================ dissolve & texture
  // dither: B appears through an ordered 8×8 Bayer pattern of `px`-sized cells; ramp: left|right|up|down = dithered sweep
  const BAYER8 = (() => { let m = [0]; for (let n = 1; n < 8; n *= 2) { const o = []; for (let y = 0; y < 2 * n; y++) for (let x = 0; x < 2 * n; x++)
    o.push(4 * m[(y % n) * n + (x % n)] + [0, 2, 3, 1][(y >= n) * 2 + (x >= n)]); m = o; } return m.map(v => (v + 0.5) / 64); })();
  KV.transition('dither', (k, draw, tr, h) => {
    const px = Math.max(1, Math.round((tr.px ?? 6) * h.u)), e = EZ(tr, k, 'lin'), r = KV.R(tr.ramp);
    maskFrom(h, draw, field('dith', h, px, (i, j, w, hh) => { const b = BAYER8[(j & 7) * 8 + (i & 7)];
      return e >= (r ? 0.5 * b + 0.5 * ramp(r, i, j, w, hh) : b) ? 1 : 0; }), false);   // nearest-neighbour upscale = crisp cells
  });
  // noise: B grows through smooth noise blobs (fbm) or sand-like grain (grain: true)
  KV.transition('noise', (k, draw, tr, h) => {
    const e = lerp(-0.1, 1.1, EZ(tr, k, 'lin')), res = Math.max(2, tr.res ?? 6), sc = (tr.scale ?? 0.08) / 6 / h.u, sd = tr.seed || 0, soft = Math.max(0.01, tr.soft ?? 0.08), [w, hh] = dims(h, res);
    const N = grid(`nz:${sd}:${sc}:${res}:${tr.grain ? 1 : 0}`, w, hh, (i, j) => (tr.grain ? hash(i * 12.99 + j * 78.23 + sd) : fbm(i * res * sc + sd * 3.7, j * res * sc)));
    maskFrom(h, draw, field('nz', h, res, (i, j) => (e - N[j * w + i]) / soft), !tr.grain);
  });
  // luma: B appears where a luminance map is brightest first — map 'A' / 'B' (the scene itself), an asset key, or radial (default)
  const LUMA = {}, lumaOf = (x, w, hh) => { const d = x.getImageData(0, 0, w, hh).data, L = new Float32Array(w * hh);
    for (let p = 0; p < w * hh; p++) L[p] = (0.2126 * d[p * 4] + 0.7152 * d[p * 4 + 1] + 0.0722 * d[p * 4 + 2]) / 255; return L; };
  KV.transition('luma', (k, draw, tr, h) => {
    const res = Math.max(2, tr.res ?? 4), [w, hh] = dims(h, res), map = KV.R(tr.map); let L;
    if (map === 'A' || map === 'B') { const [, x] = scr('luS', w, hh); x.drawImage(h.onBuffer(map === 'A' ? draw.a : draw.b), 0, 0, w, hh); L = lumaOf(x, w, hh); }   // live map: small readback
    else {                                                                               // radial / asset plate: computed once per size
      const img = map && MV.img[map], id = (img ? map : 'radial') + '@' + w + 'x' + hh; L = LUMA[id];
      if (!L) { try { if (img) { const [, x] = scr('luI', w, hh, true); x.drawImage(img, 0, 0, w, hh); L = lumaOf(x, w, hh); } } catch (err) { L = null; }
        if (!L) { const R = Math.hypot(w, hh) / 2; L = new Float32Array(w * hh); for (let j = 0; j < hh; j++) for (let i = 0; i < w; i++) L[j * w + i] = clamp(1 - Math.hypot(i + 0.5 - w / 2, j + 0.5 - hh / 2) / R); }
        LUMA[id] = L; }
    }
    const e = lerp(-0.1, 1.1, EZ(tr, k, 'lin')), soft = Math.max(0.01, tr.soft ?? 0.1);
    maskFrom(h, draw, field('lu', h, res, (i, j) => (e - (tr.invert ? L[j * w + i] : 1 - L[j * w + i])) / soft));   // bright switches first
  });
  // defocus: A goes soft, B dissolves in from blur to sharp (the 0.3 s social "blur" transition)
  KV.transition('defocus', (k, draw, tr, h) => {
    const { ctx, W, H, u } = h, m = (tr.amount ?? 28) * u, e = EZ(tr, k), ba = m * E.o(clamp(k / 0.6)), bb = m * (1 - E.o(clamp((k - 0.4) / 0.6)));
    fill(h, 'bg');                                                                       // blurred edges turn translucent
    const s = 1 + 0.04 * ba / (m || 1), A = h.onBuffer(draw.a);
    ctx.save(); if (ba > 0.3) ctx.filter = `blur(${ba.toFixed(1)}px)`; ctx.translate(W / 2, H / 2); ctx.scale(s, s); ctx.translate(-W / 2, -H / 2); ctx.drawImage(A, 0, 0); ctx.restore();
    if (e <= 0) return;
    const B = h.onBuffer(draw.b); ctx.save(); ctx.globalAlpha = e; if (bb > 0.3) ctx.filter = `blur(${bb.toFixed(1)}px)`; ctx.drawImage(B, 0, 0); ctx.restore();
  });

  // ================================================================ liquid
  // goo: metaballs (Σ r²/d² ≥ 1 on a 1/res grid) grow, wobble and weld together, flooding into B; a late central ball covers all
  KV.transition('goo', (k, draw, tr, h) => {
    const e = EZ(tr, k), n = Math.max(1, tr.n ?? 6), sd = tr.seed || 0, res = Math.max(2, tr.res ?? 8), [w, hh] = dims(h, res), m = Math.sqrt(w * hh);
    const balls = [];
    for (let b = 0; b < n; b++) balls.push([hash(sd + b) * w, hash(sd + b * 7.3) * hh, (0.05 + 0.05 * hash(b + 3 + sd)) * m * E.o(clamp(e * 1.6 - hash(b + 9 + sd) * 0.5)), b]);
    balls.push([w / 2, hh / 2, 0.65 * Math.hypot(w, hh) * E.i(clamp((e - 0.4) / 0.6)), n]);
    const live = balls.filter(bl => bl[2] > 0.01).map(([x, y, r, b]) => [x + Math.sin(e * 5 + b) * 3, y, r * r]), nl = live.length;   // wobble per ball, once
    maskFrom(h, draw, field('goo', h, res, (i, j) => { let f = 0;
      for (let q = 0; q < nl; q++) { const L = live[q], dx = i - L[0], dy = j - L[1]; f += L[2] / (dx * dx + dy * dy + 1e-3); if (f > 1.34) return 1; }
      return (f - 1) * 3; }));                                                           // threshold = the gooey edge
  });
})();
