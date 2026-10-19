/* KV transitions library (Canvas 2D) — cut grammar, motion, wipes & shape masks, liquid, 3D & paper, brand, social.
 * Use: scene `trans: 'whip'` or `trans: { type: 'whip', beats: 0.5, dir: { h: 'left', v: 'up' } }`.
 * Helpers: trans-core.js (KV.TX) · metadata (default beats, family, SFX, flashes, cost): trans-meta.js ·
 * pixel-field / light / glitch types: trans-fx.js · GPU types: trans-gl.js · guide: references/transitions.md.
 * Built-in fix shipped as an override (a library name wins over the runtime switch): `iris` now always reaches the
 * farthest corner from `at` (no end pop; centred `at` = the old pixels). `zoom` stays the built-in; `zoomin` /
 * `zoomout` are the direction-consistent fly-throughs. Every type: k = 0 → A, k = 1 → B (cut types: B from k = 0).
 */
(function () {
  'use strict';
  const KV = window.KV, { clamp, lerp, E, hash } = MV;
  const { EZ, dirName, dirOf, atOf, farR, seg, scaleAt, scr, snapA, blurStamp, xfade, deepest, coverScale } = KV.TX;
  const fill = (h, c) => { h.ctx.fillStyle = h.col(c); h.ctx.fillRect(0, 0, h.W, h.H); };
  const env = k => Math.sin(Math.PI * clamp(k));          // 0 at both ends: shadows, blur, glints
  const shadow = (h, k) => { h.ctx.shadowColor = `rgba(0,0,0,${(0.45 * env(k)).toFixed(3)})`; h.ctx.shadowBlur = 40 * h.u; };

  // ================================================================ A. cut grammar
  // smash: hard cut at k = 0 into B with a decaying 30 Hz shake + punch (both exactly 0 at k = 1); flash: true = 2 white frames
  KV.transition('smash', (k, draw, tr, h) => {
    const { ctx, W, H, u } = h, t = k * (tr.d || 0.3), n = Math.floor(t * 30), amp = (tr.amp ?? 18) * u * Math.exp(-4 * k) * (1 - k);
    const sx = (hash(n * 1.7 + 3) - 0.5) * 2 * amp, sy = (hash(n * 2.3 + 9) - 0.5) * 2 * amp;
    const s = 1 + 2.2 * amp / Math.min(W, H) + (tr.punch ?? 0.05) * (1 - E.o(k));          // overscale hides the shaken edges
    ctx.save(); ctx.translate(W / 2 + sx, H / 2 + sy); ctx.scale(s, s); ctx.translate(-W / 2, -H / 2); draw.b(); ctx.restore();
    if (tr.flash && t < 2 / 30) MV.fade(h.col(tr.color || '#FFFFFF'), 0.8);
  });
  // match: one virtual camera carries A's shape `from` [x, y, size] onto B's `to`, short dissolve at the match point
  KV.transition('match', (k, draw, tr, h) => {
    const { ctx, W, H } = h, f = KV.R(tr.from) || [0.5, 0.5, 1], g = KV.R(tr.to) || f, e = EZ(tr, k), r = (g[2] ?? 1) / (f[2] ?? 1);
    const A = [f[0] * W, f[1] * H], B = [g[0] * W, g[1] * H], P = [lerp(A[0], B[0], e), lerp(A[1], B[1], e)];
    const cam = (c, o, s) => { c.translate(P[0], P[1]); c.scale(s, s); c.translate(-o[0], -o[1]); };   // anchor o -> path point P
    fill(h, 'bg'); ctx.save(); cam(ctx, B, Math.pow(1 / r, 1 - e)); draw.b(); ctx.restore();
    const xf = Math.max(0.02, tr.xf ?? 0.15), ka = clamp((0.5 + xf / 2 - k) / xf);
    if (ka > 0) {
      const buf = h.onBuffer(() => { const c = MV.ctx; c.fillStyle = h.col('bg'); c.fillRect(0, 0, W, H); c.save(); cam(c, A, Math.pow(r, e)); draw.a(); c.restore(); });
      ctx.save(); ctx.globalAlpha = ka; ctx.drawImage(buf, 0, 0); ctx.restore();
    }
  });
  // jlcut: picture = plain cut; `lead` (beats, J: B's scene-level say / sfx first) / `tail` (L: A's voice runs on) act on
  // sound only — kv-core shifts the events, kv-lint bounds them
  KV.transition('jlcut', (k, draw) => draw.b());
  // jump: punch-in cut on the same subject (B starts at scale s around `at`, eases back to 1)
  KV.transition('jump', (k, draw, tr, h) => {
    const [cx, cy] = atOf(tr, h, undefined, draw), s = lerp(tr.s ?? 1.12, 1, EZ(tr, k, 'oX'));
    h.ctx.save(); scaleAt(h.ctx, cx, cy, s); draw.b(); h.ctx.restore();
  });

  // ================================================================ B. motion
  // cover: B slides in over a static A that dims; reveal: A slides away from a static B (shadow only while moving)
  KV.transition('cover', (k, draw, tr, h) => {
    const { ctx, W, H } = h, [dx, dy] = dirOf(tr), e = EZ(tr, k);
    draw.a(); MV.fade('#000', (tr.dim ?? 0.25) * e);
    const B = h.onBuffer(draw.b); ctx.save(); shadow(h, k); ctx.drawImage(B, -dx * W * (1 - e), -dy * H * (1 - e)); ctx.restore();
  });
  KV.transition('reveal', (k, draw, tr, h) => {
    const { ctx, W, H } = h, [dx, dy] = dirOf(tr), e = EZ(tr, k), A = h.onBuffer(draw.a);
    draw.b(); MV.fade('#000', (tr.dim ?? 0.25) * (1 - e));
    ctx.save(); shadow(h, k); ctx.drawImage(A, dx * W * e, dy * H * e); ctx.restore();
  });
  // whip: very fast push, both scenes smeared along the move (directional box blur peaks at the cut)
  KV.transition('whip', (k, draw, tr, h) => {
    const { ctx, W, H } = h, [dx, dy] = dirOf(tr), e = EZ(tr, k), L = (tr.blur ?? 0.35) * (4 * k * (1 - k)) ** 2, n = Math.max(2, tr.taps ?? 10);   // blur ramps in/out softly
    const A = snapA(h, draw), B = h.onBuffer(draw.b);
    for (let i = 0; i < n; i++) {
      const o = clamp(e - L * (i / (n - 1) - 0.5));                                   // taps centred on the true position
      ctx.globalAlpha = 1 / (i + 1); ctx.drawImage(A, dx * W * o, dy * H * o); ctx.drawImage(B, dx * W * (o - 1), dy * H * (o - 1));
    }
    ctx.globalAlpha = 1;
  });
  // zoomin / zoomout: fly-through. in: A scales up (zoom blur) and fades while B grows from `from` 0.85 to 1; out = reverse
  function fly(k, draw, tr, h, out) {
    const { ctx, W, H } = h, [cx, cy] = atOf(tr, h, undefined, draw), e = EZ(tr, k), far = tr.s ?? 2.2, near = tr.from ?? 0.85;
    const sp = (tr.blur ?? 1) * 0.12 * env(k) ** 2, [c, x] = scr('fly', W, H), top = h.onBuffer(out ? draw.b : draw.a);
    const sT = out ? lerp(far, 1, E.o(k)) : lerp(1, far, E.i(k));
    blurStamp(x, top, sp > 0.002 ? 6 : 1, (q, f) => scaleAt(q, cx, cy, sT * (1 + sp * f)));
    fill(h, 'bg'); ctx.save(); scaleAt(ctx, cx, cy, out ? lerp(1, near, e) : lerp(near, 1, e)); (out ? draw.a : draw.b)(); ctx.restore();
    ctx.save(); ctx.globalAlpha = out ? e : 1 - e; ctx.drawImage(c, 0, 0); ctx.restore();
  }
  KV.transition('zoomin', (k, draw, tr, h) => fly(k, draw, tr, h, false));
  KV.transition('zoomout', (k, draw, tr, h) => fly(k, draw, tr, h, true));
  // spin: A rotates out (scale-up + rotational smear), B continues the same rotation in; corners show `color` (cover: true hides them)
  KV.transition('spin', (k, draw, tr, h) => {
    const { ctx, W, H } = h, [cx, cy] = atOf(tr, h, undefined, draw), a = k < 0.5, q = a ? E.i(k * 2) : 1 - E.o(k * 2 - 1);
    const ang = Math.min(180, tr.angle ?? 90) * Math.PI / 180 * (KV.R(tr.dir) === 'ccw' ? -1 : 1), r = (a ? 1 : -1) * ang * q;
    const s = (1 + (tr.zoom ?? 0.3) * q) * (tr.cover ? coverScale(W, H, r) : 1), img = h.onBuffer(a ? draw.a : draw.b), [c, x] = scr('spin', W, H);
    blurStamp(x, img, q > 1e-3 ? 6 : 1, (g, f) => { g.translate(cx, cy); g.rotate(r - Math.sign(ang) * 0.08 * q * f); g.scale(s, s); g.translate(-cx, -cy); });
    fill(h, tr.color || 'bg'); ctx.drawImage(c, 0, 0);
  });
  // smear: cartoon smear frame — A stretches along dir (trailing edge pinned) and shoots out; B arrives stretched and snaps back
  KV.transition('smear', (k, draw, tr, h) => {
    const { ctx, W, H } = h, [dx, dy] = dirOf(tr), ka = clamp(k / 0.56), kb = clamp((k - 0.44) / 0.56);   // halves overlap around k = 0.5
    const one = (img, q, sg) => {
      const st = 1 + (tr.amount ?? 3) * q, sq = 1 - 0.25 * q, px = dx ? (dx * sg > 0 ? 0 : W) : W / 2, py = dy ? (dy * sg > 0 ? 0 : H) : H / 2;
      ctx.save(); ctx.translate(px + dx * sg * W * q, py + dy * sg * H * q); ctx.scale(dx ? st : sq, dy ? st : sq); ctx.translate(-px, -py); ctx.drawImage(img, 0, 0); ctx.restore();
    };
    fill(h, tr.color || 'bg');
    if (ka < 1) one(h.onBuffer(draw.a), E.i(ka), 1);                                  // drawn before B reuses the buffer
    if (kb > 0) one(h.onBuffer(draw.b), 1 - E.o(kb), -1);
  });

  // ================================================================ C. wipes & shape masks
  // iris (built-in override): ring circle from `at`; radius max(old 0.62·diag, farthest corner) → no pop; mode 'close' = iris-out/in via `color`
  KV.transition('iris', (k, draw, tr, h) => {
    const { ctx, W, H, u } = h, p = atOf(tr, h, undefined, draw), Rm = Math.max(0.62 * Math.hypot(W, H), farR(h, p) + 12 * u);
    if (tr.mode === 'close') {
      const a = k < 0.5, Rc = farR(h, p) + 8 * u, r = Rc * (a ? 1 - E.i(k * 2) : E.o(k * 2 - 1));
      fill(h, tr.color || '#000'); ctx.save(); MV.circle(p[0], p[1], Math.max(0.1, r)); ctx.clip(); (a ? draw.a : draw.b)(); ctx.restore(); return;
    }
    const e = E.io(k), r = e * Rm;
    draw.a(); ctx.save(); MV.circle(p[0], p[1], r); ctx.clip(); draw.b(); ctx.restore();
    if (tr.ring !== false) { ctx.save(); ctx.strokeStyle = h.col(tr.color || 'a1'); ctx.lineWidth = (18 * (1 - e) + 4) * u; MV.circle(p[0], p[1], r); ctx.stroke(); ctx.restore(); }
  });
  // clock: a hand sweeps from 12 o'clock revealing B (n > 1 = pinwheel sectors), dir 'cw' | 'ccw'
  KV.transition('clock', (k, draw, tr, h) => {
    const { ctx, u } = h, [cx, cy] = atOf(tr, h, undefined, draw), R = farR(h, [cx, cy]) + 4 * u, n = Math.max(1, Math.round(tr.n ?? 1)), s = KV.R(tr.dir) === 'ccw' ? -1 : 1;
    const sw = s * (2 * Math.PI / n) * EZ(tr, k, 'lin'), a0 = -Math.PI / 2;
    draw.a(); if (Math.abs(sw) < 1e-4) return;
    ctx.save(); ctx.beginPath();
    for (let i = 0; i < n; i++) { const o = a0 + i * 2 * Math.PI / n; ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, o, o + sw, s < 0); ctx.closePath(); }
    ctx.clip(); draw.b(); ctx.restore();
    if (tr.hand !== false && k < 1) {
      ctx.save(); ctx.globalAlpha = Math.min(1, k * 12, (1 - k) * 12); ctx.strokeStyle = h.col(tr.color || 'a1'); ctx.lineWidth = 8 * u; ctx.lineCap = 'round'; ctx.beginPath();
      for (let i = 0; i < n; i++) { const o = a0 + i * 2 * Math.PI / n + sw; ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(o) * R, cy + Math.sin(o) * R); }
      ctx.stroke(); ctx.restore();
    }
  });
  // barn: A splits at the centre and both halves slide apart (depth: true = doors swing on hinges, B approaches)
  KV.transition('barn', (k, draw, tr, h) => {
    const { ctx, W, H } = h, e = EZ(tr, k), v = /up|down/.test(dirName(tr, { h: 'left', s: 'left', f: 'left', v: 'up' })), dep = !!tr.depth, A = h.onBuffer(draw.a);
    fill(h, tr.color || '#000'); ctx.save(); scaleAt(ctx, W / 2, H / 2, dep ? lerp(0.85, 1, e) : 1); draw.b(); ctx.restore();
    if (e >= 1) return;
    for (const sd of [-1, 1]) {
      ctx.save();
      if (dep) { const c = Math.max(1e-3, Math.cos(e * Math.PI / 2)); v ? scaleAt(ctx, 0, sd < 0 ? 0 : H, 1, c) : scaleAt(ctx, sd < 0 ? 0 : W, 0, c, 1); }
      else v ? ctx.translate(0, sd * e * H / 2) : ctx.translate(sd * e * W / 2, 0);
      ctx.beginPath(); v ? ctx.rect(0, sd < 0 ? 0 : H / 2, W, H / 2) : ctx.rect(sd < 0 ? 0 : W / 2, 0, W / 2, H); ctx.clip();
      ctx.drawImage(A, 0, 0); if (dep) MV.fade('#000', 0.35 * e); ctx.restore();
    }
  });
  // blinds: n slats open with a stagger (dir down/up = horizontal slats, right/left = vertical), angle tilts them
  KV.transition('blinds', (k, draw, tr, h) => {
    const { ctx, W, H } = h, n = Math.max(1, Math.round(tr.n ?? 8)), d = dirName(tr, 'down'), col = d === 'left' || d === 'right', rev = d === 'up' || d === 'left';
    const st = clamp(tr.stagger ?? 0.4, 0, 0.9), a = (tr.angle ?? 0) * Math.PI / 180, ext = a ? Math.hypot(W, H) : 0, sl = (col ? W : H) / n, m = Math.ceil(ext / sl);
    draw.a(); ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(a); ctx.translate(-W / 2, -H / 2); ctx.beginPath();
    let any = 0;
    for (let i = -m; i < n + m; i++) {
      const idx = ((i % n) + n) % n, o = rev ? n - 1 - idx : idx, q = E.io(clamp((k - st * o / n) / (1 - st)));
      if (q <= 0) continue; any++; const w = (sl + 0.5) * q, p0 = rev ? (i + 1) * sl - w : i * sl;
      col ? ctx.rect(p0, -ext, w, H + 2 * ext) : ctx.rect(-ext, p0, W + 2 * ext, w);
    }
    ctx.restore(); if (!any) return;                                                    // the path keeps its rotation
    ctx.save(); ctx.clip(); draw.b(); ctx.restore();
  });
  // checker: grid cells pop open — mode 'random' (seed), 'checker' (two passes), 'diag' (sweep from the top-left)
  KV.transition('checker', (k, draw, tr, h) => {
    const { ctx, W, H } = h, c = (tr.cell ?? 0.125) * Math.min(W, H), nx = Math.ceil(W / c), ny = Math.ceil(H / c), mode = tr.mode || 'random', sd = tr.seed || 0;
    const ox = (W - nx * c) / 2, oy = (H - ny * c) / 2;
    draw.a(); ctx.beginPath(); let any = 0;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const o = mode === 'checker' ? ((i + j) % 2) * 0.5 : mode === 'diag' ? (i / Math.max(1, nx - 1) + j / Math.max(1, ny - 1)) / 2 : hash(i * 31.7 + j * 7.3 + sd * 1.13);
      const q = clamp((k - o * 0.6) / 0.4); if (q <= 0) continue;
      const s = c * E.oB(q) + q; any++;                                                 // +q px: neighbours overlap at q = 1
      ctx.rect(ox + i * c + (c - s) / 2, oy + j * c + (c - s) / 2, s, s);
    }
    if (!any) return; ctx.save(); ctx.clip(); draw.b(); ctx.restore();
  });
  // shape: a spinning star / heart / diamond grows from `at` until it covers the frame, outlined in `color`
  const SHAPES = {
    star: (x, r) => { x.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? 0.45 : 1; x.lineTo(Math.cos(a) * r * q, Math.sin(a) * r * q); } x.closePath(); },
    heart: (x, r) => { x.beginPath(); x.moveTo(0, r * 0.9); x.bezierCurveTo(-r * 1.4, -r * 0.1, -r * 0.6, -r * 1.1, 0, -r * 0.45); x.bezierCurveTo(r * 0.6, -r * 1.1, r * 1.4, -r * 0.1, 0, r * 0.9); x.closePath(); },
    diamond: (x, r) => { x.beginPath(); x.moveTo(0, -r); x.lineTo(r, 0); x.lineTo(0, r); x.lineTo(-r, 0); x.closePath(); }
  }, COVER = { star: 2.45, heart: 2.45, diamond: 1.5 };                                // ≥ 1.08 / inscribed radius of the unit shape
  KV.transition('shape', (k, draw, tr, h) => {
    const { ctx, u } = h, name = SHAPES[tr.shape] ? tr.shape : 'star', p = atOf(tr, h, undefined, draw), r = farR(h, p) * (tr.cover ?? COVER[name]) * E.i(clamp(k));
    draw.a(); if (r < 1) return;
    const outline = () => { ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate((tr.spin ?? 0.6) * (1 - k)); SHAPES[name](ctx, r); ctx.restore(); };
    ctx.save(); outline(); ctx.clip(); draw.b(); ctx.restore();
    ctx.save(); outline(); ctx.lineWidth = 10 * u; ctx.lineJoin = 'round'; ctx.strokeStyle = h.col(tr.color || 'a1'); ctx.stroke(); ctx.restore();
  });

  // ================================================================ D. liquid & organic
  // ink: wobbly blobs spread from n points and merge (splash: droplets); `color` paints a layer that leads B by 0.18 k
  KV.transition('ink', (k, draw, tr, h) => {
    const { ctx, W, H } = h, n = Math.max(1, tr.n ?? 5), sd = tr.seed || 0, R = Math.hypot(W, H) * 0.55, lag = tr.color ? 0.18 : 0;
    const blobs = kk => {
      ctx.beginPath(); if (kk <= 0) return false;
      for (let b = 0; b < n; b++) {
        const r = R * E.i(clamp((kk - hash(sd + b) * 0.35) / 0.65)) * (0.6 + 0.6 * hash(sd + b + 9)), cx = hash(sd + b * 3.1) * W, cy = hash(sd + b * 5.7) * H;
        if (r <= 0) continue;
        for (let i = 0; i <= 48; i++) { const a = i / 48 * 2 * Math.PI, w = 1 + 0.18 * Math.sin(5 * a + b) + 0.1 * Math.sin(11 * a + 2 * b + kk * 3) + 0.06 * Math.sin(23 * a + b);
          ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r * w, cy + Math.sin(a) * r * w); }
        ctx.closePath();
        if (tr.splash) for (let d = 0; d < 6; d++) { const a = hash(b * 7 + d + sd) * 6.283, dd = r * (1.1 + 0.5 * hash(b + d * 3)), px = cx + Math.cos(a) * dd, py = cy + Math.sin(a) * dd, rr = r * 0.06 * hash(d + b);
          ctx.moveTo(px + rr, py); ctx.arc(px, py, rr, 0, 6.283); }
      }
      const rc = Math.hypot(W, H) / 2 * 1.02 * E.i(clamp((kk - 0.55) / 0.45)); ctx.moveTo(W / 2 + rc, H / 2); ctx.arc(W / 2, H / 2, rc, 0, 6.283);   // full cover at kk = 1
      return true;
    };
    draw.a();
    if (tr.color && blobs(k)) { ctx.save(); ctx.fillStyle = h.col(tr.color); ctx.fill(); ctx.restore(); }   // paint layer leads
    if (blobs(clamp((k - lag) / (1 - lag)))) { ctx.save(); ctx.clip(); draw.b(); ctx.restore(); }
  });
  // morph: an object of A (`from: { at, w, h, r }`) grows and squares off into the frame (container transform), B arrives inside
  KV.transition('morph', (k, draw, tr, h) => {
    const { ctx, W, H } = h, f = KV.R(tr.from) || {}, e = EZ(tr, k), m = Math.min(W, H), [px, py] = atOf(tr, h, f.at, draw);
    const w0 = (f.w ?? 0.18) * m, h0 = (f.h ?? f.w ?? 0.18) * m, r0 = Math.min(w0, h0) / 2 * clamp(f.r ?? 1);
    const x = lerp(px - w0 / 2, 0, e), y = lerp(py - h0 / 2, 0, e), w = lerp(w0, W, e), hh = lerp(h0, H, e);
    draw.a(); const B = h.onBuffer(draw.b);
    ctx.save(); ctx.globalAlpha = seg(k, 0, 0.12); ctx.beginPath(); ctx.roundRect(x, y, w, hh, Math.max(0, lerp(r0, 0, e))); ctx.clip();
    ctx.fillStyle = h.col(tr.color || 'bg'); ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = E.o(seg(k, 0.45, 1)); ctx.drawImage(B, 0, 0); ctx.restore();
  });

  // ================================================================ E. 3D & paper
  // flip: the frame turns like a card (32 perspective strips, pull-back, darkening); dir left/right = vertical axis, up/down = horizontal
  KV.transition('flip', (k, draw, tr, h) => {
    const { ctx, W, H } = h, d = dirName(tr), vx = d === 'up' || d === 'down', side = d === 'left' || d === 'up' ? -1 : 1;
    const th = EZ(tr, k) * Math.PI, first = th < Math.PI / 2, img = h.onBuffer(first ? draw.a : draw.b);
    const z = 1 - 0.12 * Math.sin(th), cs = Math.max(0.02, Math.abs(Math.cos(th))),   // edge-on: a dark 2 % sliver, never an empty frame
      sn = Math.sin(th) * side * (first ? 1 : -1), L = vx ? H : W, M = vx ? W : H, D = 2.6 * L;
    fill(h, tr.color || 'bg');
    if (Math.abs(sn) < 1e-3 && Math.abs(z - 1) < 1e-4) { ctx.drawImage(img, 0, 0); return; }
    const n = 32, P = a => D / (D + a * sn), X = a => a * cs * P(a) * z;                // pinhole projection of the card edge a
    for (let i = 0; i < n; i++) {
      const a0 = (i / n - 0.5) * L, a1 = ((i + 1) / n - 0.5) * L, x0 = X(a0), m = M * (P(a0) + P(a1)) / 2 * z, w = X(a1) - x0 + 0.6;
      if (w <= 0.6) continue;
      vx ? ctx.drawImage(img, 0, i * L / n, W, L / n, (W - m) / 2, H / 2 + x0, m, w) : ctx.drawImage(img, i * L / n, 0, L / n, H, W / 2 + x0, (H - m) / 2, w, m);
    }
    const dk = 0.45 * Math.sin(th);
    if (dk > 0.002) {                                                                  // turning away darkens (card trapezoid)
      const e0 = -L / 2, e1 = L / 2, q = [[X(e0), -M / 2 * P(e0) * z], [X(e1), -M / 2 * P(e1) * z], [X(e1), M / 2 * P(e1) * z], [X(e0), M / 2 * P(e0) * z]];
      ctx.beginPath(); q.forEach(([a, b], i) => { const x = vx ? W / 2 + b : W / 2 + a, y = vx ? H / 2 + a : H / 2 + b; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.closePath(); ctx.fillStyle = `rgba(0,0,0,${dk.toFixed(3)})`; ctx.fill();
    }
  });
  // peel: A peels away along a straight fold (angle = travel direction of the fold, 215 = from the bottom-right corner)
  KV.transition('peel', (k, draw, tr, h) => {
    const { ctx, W, H, u } = h, a = (KV.R(tr.angle) ?? 215) * Math.PI / 180, nx = Math.cos(a), ny = Math.sin(a), G = 4 * (W + H);
    const pr = [0, W * nx, H * ny, W * nx + H * ny], f = lerp(Math.min(...pr) - 2, Math.max(...pr) + 2, EZ(tr, k));   // fold line p·n = f
    const half = sd => { const px = nx * f, py = ny * f; ctx.beginPath(); ctx.moveTo(px - ny * G, py + nx * G); ctx.lineTo(px + ny * G, py - nx * G);
      ctx.lineTo(px + ny * G + sd * nx * G, py - nx * G + sd * ny * G); ctx.lineTo(px - ny * G + sd * nx * G, py + nx * G + sd * ny * G); ctx.closePath(); };
    draw.b(); const A = h.onBuffer(draw.a), s = env(k);
    if (s > 1e-3) {                                                                    // fold shadow on B
      const g = ctx.createLinearGradient(nx * f, ny * f, nx * (f - 70 * u), ny * (f - 70 * u)); g.addColorStop(0, `rgba(0,0,0,${(0.4 * s).toFixed(3)})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.save(); half(-1); ctx.clip(); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
    }
    ctx.save(); half(1); ctx.clip(); ctx.drawImage(A, 0, 0);                            // not yet peeled
    ctx.transform(1 - 2 * nx * nx, -2 * nx * ny, -2 * nx * ny, 1 - 2 * ny * ny, 2 * f * nx, 2 * f * ny);   // reflect across the fold: the flap
    ctx.drawImage(A, 0, 0); ctx.fillStyle = MV.rgba(tr.paper || '#F4F1EA', 0.82); ctx.fillRect(0, 0, W, H);
    const g2 = ctx.createLinearGradient(nx * f, ny * f, nx * (f - 140 * u), ny * (f - 140 * u)); g2.addColorStop(0, 'rgba(255,255,255,0.35)'); g2.addColorStop(1, 'rgba(0,0,0,0.12)');
    ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H); ctx.restore();                         // sheen across the flap (fold → edge)
  });
  // fold: A folds up like a paper fan into one edge (n panels, alternating faces); dir left/right = columns, up/down = rows
  KV.transition('fold', (k, draw, tr, h) => {
    const { ctx, W, H } = h, d = dirName(tr, { h: 'left', s: 'left', f: 'left', v: 'up' }), rows = d === 'up' || d === 'down', end = d === 'right' || d === 'down';
    const n = Math.max(2, Math.round(tr.n ?? 6)), L = rows ? H : W, th = EZ(tr, k) * Math.PI / 2, cw = L / n, pw = cw * Math.cos(th);
    draw.b(); if (pw < 0.5) return; const A = h.onBuffer(draw.a);
    if (th < 1e-4) { ctx.drawImage(A, 0, 0); return; }
    const x0 = end ? L - pw * n : 0;
    for (let i = 0; i < n; i++) {
      const x = x0 + i * pw, sh = Math.sin(th) * (i % 2 ? 0.45 : -0.12);
      rows ? ctx.drawImage(A, 0, i * cw, W, cw, 0, x, W, pw + 0.5) : ctx.drawImage(A, i * cw, 0, cw, H, x, 0, pw + 0.5, H);
      if (Math.abs(sh) > 0.002) { ctx.fillStyle = sh > 0 ? `rgba(0,0,0,${sh.toFixed(3)})` : `rgba(255,255,255,${(-sh).toFixed(3)})`; rows ? ctx.fillRect(0, x, W, pw) : ctx.fillRect(x, 0, pw, H); }
    }
  });
  // shatter: A breaks into tiles that fly from the impact point `at`, spin and fall (gravity), revealing B
  KV.transition('shatter', (k, draw, tr, h) => {
    const { ctx, W, H, u } = h, c = (tr.cell ?? 0.1) * Math.max(W, H), nx = Math.ceil(W / c), ny = Math.ceil(H / c), p = atOf(tr, h, undefined, draw), D = Math.hypot(W, H), sec = tr.d || 0.8;
    draw.b(); const A = h.onBuffer(draw.a);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const cx = (i + 0.5) * c, cy = (j + 0.5) * c, q = clamp((k - 0.5 * Math.hypot(cx - p[0], cy - p[1]) / D - 0.05 * hash(i * 9.1 + j)) / 0.45);
      if (q <= 0) { ctx.drawImage(A, i * c, j * c, c, c, i * c, j * c, c, c); continue; } if (q >= 1) continue;
      const s = q * sec, rr = hash(i + j * 31) - 0.5, x = cx + ((cx - p[0]) * 1.5 + rr * 400 * u) * s, y = cy + ((cy - p[1]) * 1.5 - 300 * u) * s + 2000 * u * s * s;
      ctx.save(); ctx.translate(x, y); ctx.rotate(rr * 8 * s); ctx.scale(1 - E.i(q), 1 - E.i(q)); ctx.drawImage(A, i * c, j * c, c, c, -c / 2, -c / 2, c, c); ctx.restore();
    }
  });

  // ================================================================ F. typography & brand
  // auto focus: the point deepest inside the glyphs / mark (+ its inscribed radius), so the end zoom always covers the frame
  const FOCUS = {};
  function textFocus(txt, ff) {
    const id = txt + '|' + ff(100); if (FOCUS[id]) return FOCUS[id];
    const F = 160; let [c, x] = scr('tfA', 8, 8, true); x.font = ff(F); const tw = Math.ceil(x.measureText(txt).width + F);
    [c, x] = scr('tfA', tw, Math.ceil(F * 1.8), true); x.font = ff(F); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#000'; x.fillText(txt, tw / 2, c.height / 2);
    const [i, j, r] = deepest(x.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
    return (FOCUS[id] = [(i - tw / 2) / F, (j - c.height / 2) / F, r / F]);
  }
  const MARK = new WeakMap();
  function markFocus(img) {                    // [fx, fy] image fractions + inscribed radius / max(w, h); file:// needs render.mjs flags
    if (MARK.has(img)) return MARK.get(img);
    let out = [0.5, 0.5, 0.15];
    try { const s = 256 / Math.max(img.width, img.height), w = Math.max(1, Math.round(img.width * s)), hh = Math.max(1, Math.round(img.height * s)), [, x] = scr('lgA', w, hh, true);
      x.drawImage(img, 0, 0, w, hh); const [i, j, r] = deepest(x.getImageData(0, 0, w, hh).data, w, hh); if (r > 0) out = [i / w, j / hh, r / Math.max(w, hh)]; } catch (err) { /* tainted: centre */ }
    MARK.set(img, out); return out;
  }
  // typefill: a bold word pops over A, the camera zooms into its deepest stroke; B through the letters ('window') or colour flood ('solid')
  KV.transition('typefill', (k, draw, tr, h) => {
    const { ctx, W, H } = h, txt = String(tr.text || 'GO'), p = atOf(tr, h, undefined, draw), e = EZ(tr, k), ff = px => KV.font(tr.font || 'head', tr.weight ?? 900, px);
    const px = Math.min(W * 0.9 / (0.62 * Math.max(1, txt.length)), H * 0.9), fz = textFocus(txt, ff), f = tr.focus || fz;
    const zEnd = Math.max(tr.zoom ?? 40, tr.focus ? 1 : 1.15 * farR(h, p) / Math.max(1e-3, fz[2] * px)), s = Math.exp(Math.log(zEnd) * e * e);
    draw.a(); const B = h.onBuffer(draw.b), [m, x] = scr('tf', W, H);
    x.translate(p[0], p[1]); x.scale(s, s); x.translate(-f[0] * px, -f[1] * px);
    x.font = ff(px); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#000'; x.fillText(txt, 0, 0);
    x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-in';
    if (tr.mode === 'solid') { x.fillStyle = h.col(tr.color || 'a1'); x.fillRect(0, 0, W, H); } else x.drawImage(B, 0, 0);
    ctx.save(); ctx.globalAlpha = clamp(k * 8); ctx.drawImage(m, 0, 0);
    ctx.globalAlpha = E.io(seg(k, tr.mode === 'solid' ? 0.78 : 0.88, 1)); ctx.drawImage(B, 0, 0); ctx.restore();   // guaranteed clean landing
  });
  // logo: the owner's mark (MV.img[mark], default BRAND.mark) zooms until its solid area fills the frame, B through it; no mark = fade
  KV.transition('logo', (k, draw, tr, h) => {
    const { ctx, W, H } = h, img = MV.img[tr.mark || 'mark'];
    if (!img || !img.width) return xfade(k, draw, tr, h);
    const p = atOf(tr, h, undefined, draw), mf = markFocus(img), f = tr.focus || mf, M = Math.max(img.width, img.height), base = Math.min(W, H) * (tr.size ?? 0.25) / M;
    const zEnd = Math.max(tr.zoom ?? 30, tr.focus ? 1 : 1.15 * farR(h, p) / Math.max(1e-3, mf[2] * M * base)), sc = base * Math.exp(Math.log(zEnd) * EZ(tr, k) ** 2);
    const B = h.onBuffer(draw.b), [m, x] = scr('logo', W, H);
    x.imageSmoothingQuality = 'high'; x.translate(p[0], p[1]); x.scale(sc, sc); x.translate(-f[0] * img.width, -f[1] * img.height); x.drawImage(img, 0, 0);
    x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-in'; x.drawImage(B, 0, 0);
    draw.a(); ctx.save(); ctx.globalAlpha = clamp(k * 6); ctx.drawImage(m, 0, 0); ctx.globalAlpha = E.io(seg(k, 0.88, 1)); ctx.drawImage(B, 0, 0); ctx.restore();
  });

  // ================================================================ G. social-native
  const ioBack = (k, c) => { const c2 = c * 1.525; return k < 0.5 ? (2 * k) ** 2 * ((c2 + 1) * 2 * k - c2) / 2 : ((2 * k - 2) ** 2 * ((c2 + 1) * (2 * k - 2) + c2) + 2) / 2; };
  // swipe: feed flick — rounded cards with a gap, slight shrink, spring overshoot; vertical on 4:5 / 9:16 by default
  KV.transition('swipe', (k, draw, tr, h) => {
    const { ctx, W, H, u } = h, [dx, dy] = dirOf(tr, { h: 'left', s: 'left', f: 'up', v: 'up' }), gap = (tr.gap ?? 24) * u;
    const e = ioBack(clamp(k), tr.spring ?? 1.2), card = 1 - 0.05 * env(k) ** 2, L = (dx ? W : H) + gap, rad = 40 * u * env(k) ** 2, A = snapA(h, draw), B = h.onBuffer(draw.b);
    fill(h, tr.color || '#000');
    for (const [img, o] of [[A, 0], [B, 1]]) {
      ctx.save(); ctx.translate(W / 2 + dx * L * (e - o), H / 2 + dy * L * (e - o)); ctx.scale(card, card);
      ctx.beginPath(); ctx.roundRect(-W / 2, -H / 2, W, H, rad); ctx.clip(); ctx.drawImage(img, -W / 2, -H / 2); ctx.restore();
    }
  });
  // punch: A rushes at the camera (scale s, zoom blur), cut at the peak, B lands from s with a bounce
  KV.transition('punch', (k, draw, tr, h) => {
    const { ctx, W, H } = h, [cx, cy] = atOf(tr, h, undefined, draw), z = tr.s ?? 1.4, a = k < 0.5, q = a ? E.i(k * 2) : E.oB(k * 2 - 1);
    const s = a ? lerp(1, z, q) : lerp(z, 1, q), sp = 0.04 * (a ? q : Math.max(0, 1 - q)), img = h.onBuffer(a ? draw.a : draw.b), [c, x] = scr('punch', W, H);
    blurStamp(x, img, sp > 0.002 ? 6 : 1, (g, f) => scaleAt(g, cx, cy, s * (1 + sp * f)));
    fill(h, 'bg'); ctx.drawImage(c, 0, 0);                                              // the bounce dips just under 1
  });
  // split: B arrives as a second panel (right half on 16:9, bottom half on 4:5 / 9:16), both hold, then B takes the frame
  KV.transition('split', (k, draw, tr, h) => {
    const { ctx, W, H, u } = h, v = KV.A !== 'h', hold = clamp(tr.hold ?? 0.3, 0, 0.8), a = (1 - hold) / 2;
    const q = k < a ? 0.5 * E.io(k / a) : k < a + hold ? 0.5 : 0.5 + 0.5 * E.io(clamp((k - a - hold) / a));   // B's share 0 → ½ → 1
    const A = snapA(h, draw), B = h.onBuffer(draw.b), L = v ? H : W, cut = L * (1 - q), gap = 8 * u * env(q);
    fill(h, tr.color || 'ink');
    const crop = (img, o, len) => (v ? ctx.drawImage(img, 0, (H - len) / 2, W, len, 0, o, W, len) : ctx.drawImage(img, (W - len) / 2, 0, len, H, o, 0, len, H));
    if (cut - gap / 2 > 1) crop(A, 0, cut - gap / 2);                                  // centre crop, never squashed
    if (L - cut - gap / 2 > 1) crop(B, cut + gap / 2, L - cut - gap / 2);
  });
})();
