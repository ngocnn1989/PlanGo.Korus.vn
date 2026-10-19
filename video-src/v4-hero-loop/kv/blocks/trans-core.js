/* KV transitions — shared helpers for blocks/trans*.js, exported as KV.TX. Registers no transition.
 * Load order: kv.mjs sorts blocks/ by file name, so this file runs first among the transition files
 * ('trans-core.js' < 'trans-fx.js' < 'trans-gl.js' < 'trans-meta.js' < 'trans.js'; '-' sorts before '.').
 * Runtime contract (kv-runtime.js): a library transition is (k, draw, tr, h) — k 0→1, draw.a() / draw.b() paint the
 * outgoing / incoming scene on the CURRENT context, h = { ctx, W, H, u, col, onBuffer, E, clip }, tr.d = seconds.
 * h.onBuffer(fn) always returns the SAME offscreen canvas: copy A (snapA) before buffering B.
 * Every transition built on these helpers keeps: k = 0 shows A exactly, k = 1 shows B exactly (cut types show B at
 * k = 0), geometry in W/H fractions (16:9, 4:5, 9:16), a pure function of (k, tr): MV.hash, never Math.random/Date.now.
 * Scratch canvases and noise grids are cached by key + size (deterministic, reused every frame).
 */
(function () {
  'use strict';
  const KV = window.KV, { clamp, lerp, E, hash } = MV;

  // ------------------------------------------------------------------ parameters
  const EZ = (tr, k, d = 'io') => (KV.EASE[tr.ease] || KV.EASE[d] || E.io)(clamp(k));      // eased progress (tr.ease wins)
  const DIR = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
  // `dir` = direction the incoming content travels (left: B enters from the right); per aspect via { h, f, v, s }
  const dirName = (tr, dflt = 'left') => { const d = KV.R(tr.dir); return DIR[d] ? d : (KV.R(dflt) || 'left'); };
  const dirOf = (tr, dflt) => DIR[dirName(tr, dflt)];
  // `at` = [x, y] frame fractions (per aspect) or a pin 'asset:point' / 'layerId:point'. Pins exist only after a photo
  // layer drew them in THIS frame (kv-runtime resets KV.PINS every frame), so an unpublished pin renders scene A — then B —
  // into the shared buffer to publish it (+1 render, only for pins). Callers resolve `at` before they take the buffer.
  const atOf = (tr, h, v, draw) => {
    const a = KV.R(v !== undefined ? v : tr.at) || [0.5, 0.5];
    if (typeof a === 'string') {
      let p = KV.PINS[a];
      if (!p && draw) { h.onBuffer(draw.a); p = KV.PINS[a]; if (!p) { h.onBuffer(draw.b); p = KV.PINS[a]; } }
      if (!p && !KV._pinWarnT) { console.warn(`transition at '${a}': no photo layer of scene A or B publishes this pin — using the centre`); KV._pinWarnT = 1; }
      return p ? [p[0], p[1]] : [h.W / 2, h.H / 2];
    }
    return [a[0] * h.W, a[1] * h.H];
  };
  const farR = (h, p) => Math.hypot(Math.max(p[0], h.W - p[0]), Math.max(p[1], h.H - p[1]));   // reaches the farthest corner
  const seg = (k, a, b) => clamp((k - a) / (b - a));
  const scaleAt = (c, x, y, sx, sy = sx) => { c.translate(x, y); c.scale(sx, sy); c.translate(-x, -y); };

  // ------------------------------------------------------------------ scratch canvases
  const SCR = {};
  function scr(key, w, hh, read) {                       // cleared, identity transform, source-over, alpha canvas
    let c = SCR[key];
    if (!c) { c = SCR[key] = document.createElement('canvas'); c._x = c.getContext('2d', { willReadFrequently: !!read }); }
    if (c.width !== w || c.height !== hh) { c.width = w; c.height = hh; }
    const x = c._x; x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
    x.filter = 'none'; x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'low'; x.clearRect(0, 0, w, hh);
    return [c, x];
  }
  const snapA = (h, draw) => { const [c, x] = scr('snapA', h.W, h.H); x.drawImage(h.onBuffer(draw.a), 0, 0); return c; };
  // B shows where paint(x) puts opaque pixels (alpha = coverage), A everywhere else. Scene renders: 2.
  function masked(h, draw, paint) {
    const [c, x] = scr('mask', h.W, h.H); paint(x); x.globalCompositeOperation = 'source-in';
    x.drawImage(h.onBuffer(draw.b), 0, 0); draw.a(); h.ctx.drawImage(c, 0, 0);
  }
  // low-res alpha field: fn(i, j, w, hh) -> 0..1 per cell of res px (ImageData reused per size)
  function field(key, h, res, fn) {
    const w = Math.ceil(h.W / res), hh = Math.ceil(h.H / res), [s, x] = scr(key, w, hh);
    const im = s._im && s._im.width === w && s._im.height === hh ? s._im : (s._im = x.createImageData(w, hh)), d = im.data;
    for (let j = 0, p = 3; j < hh; j++) for (let i = 0; i < w; i++, p += 4) d[p] = 255 * clamp(fn(i, j, w, hh));
    x.putImageData(im, 0, 0); s._res = res; return s;
  }
  // upscale a field (cell = res px exactly) into the B mask; smooth = bilinear edge, false = hard pixels
  const maskFrom = (h, draw, small, smooth = true) => masked(h, draw, x => {
    x.imageSmoothingEnabled = smooth; x.drawImage(small, 0, 0, small.width * small._res, small.height * small._res);
  });
  // per-cell values that do not depend on k (noise, distances): computed once per key + size
  const GRID = {};
  function grid(key, w, hh, fn) {
    const id = key + '@' + w + 'x' + hh; let g = GRID[id];
    if (!g) { g = GRID[id] = new Float32Array(w * hh); for (let j = 0; j < hh; j++) for (let i = 0; i < w; i++) g[j * w + i] = fn(i, j, w, hh); }
    return g;
  }

  // ------------------------------------------------------------------ noise (value noise from MV.hash, deterministic)
  const sm = t => t * t * (3 - 2 * t), nh = (a, b) => hash(a * 157.31 + b * 113.97);
  const vnoise = (x, y) => {
    const i = Math.floor(x), j = Math.floor(y), u = sm(x - i), v = sm(y - j);
    return lerp(lerp(nh(i, j), nh(i + 1, j), u), lerp(nh(i, j + 1), nh(i + 1, j + 1), u), v);
  };
  const fbm = (x, y) => clamp((0.5 * vnoise(x, y) + 0.3 * vnoise(2.1 * x + 5.2, 2.1 * y + 1.3) + 0.2 * vnoise(4.3 * x + 9.7, 4.3 * y + 3.1) - 0.2) / 0.6);

  // ------------------------------------------------------------------ compositing
  // exact R/G/B channel split (multiply each channel out, add back with 'lighter'): zero offset = the input image
  function rgbSplit(h, img, ox, oy) {
    const { ctx, W, H } = h;
    if (Math.abs(ox) < 0.5 && Math.abs(oy) < 0.5) { ctx.drawImage(img, 0, 0); return; }
    ctx.save(); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'lighter';
    for (const [c, s] of [['#FF0000', -1], ['#00FF00', 0], ['#0000FF', 1]]) {
      const [t, x] = scr('ch', W, H); x.drawImage(img, 0, 0); x.globalCompositeOperation = 'multiply';
      x.fillStyle = c; x.fillRect(0, 0, W, H); ctx.drawImage(t, s * ox, s * oy);
    }
    ctx.restore();
  }
  // n stamps at alpha 1/(i+1) = running average = box blur along the path place(ctx, f ∈ [0, 1]) describes.
  // Exact only when every stamp covers what is under it: draw into a cleared scratch, then composite the scratch.
  const blurStamp = (ctx, img, n, place) => {
    for (let i = 0; i < n; i++) { ctx.save(); ctx.globalAlpha *= 1 / (i + 1); place(ctx, n > 1 ? i / (n - 1) : 0); ctx.drawImage(img, 0, 0); ctx.restore(); }
  };
  // plain crossfade (fallbacks: GL without WebGL2, logo without a mark). Scene renders: 2.
  const xfade = (k, draw, tr, h) => { draw.a(); const B = h.onBuffer(draw.b); h.ctx.save(); h.ctx.globalAlpha = clamp(k); h.ctx.drawImage(B, 0, 0); h.ctx.restore(); };
  // call another registered library transition by name (GL fallbacks); unknown names cross-fade
  const run = (name, k, draw, tr, h) => (KV.TRANS[name] && KV.TRANS[name]._gl !== true ? KV.TRANS[name] : xfade)(k, draw, tr, h);

  // ------------------------------------------------------------------ geometry
  // deepest point of an alpha mask (two-pass chamfer distance): the zoom target that covers the frame first
  function deepest(data, w, hh) {
    const D = new Float32Array(w * hh), R2 = Math.SQRT2;
    for (let p = 0; p < w * hh; p++) D[p] = data[p * 4 + 3] > 127 ? 1e9 : 0;
    const at = (i, j) => (i < 0 || j < 0 || i >= w || j >= hh ? 0 : D[j * w + i]);
    for (let j = 0; j < hh; j++) for (let i = 0; i < w; i++) { const p = j * w + i; if (D[p]) D[p] = Math.min(D[p], at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + R2, at(i + 1, j - 1) + R2); }
    let best = 0, bi = 0;
    for (let j = hh - 1; j >= 0; j--) for (let i = w - 1; i >= 0; i--) { const p = j * w + i;
      if (D[p]) D[p] = Math.min(D[p], at(i + 1, j) + 1, at(i, j + 1) + 1, at(i + 1, j + 1) + R2, at(i - 1, j + 1) + R2);
      if (D[p] > best) { best = D[p]; bi = p; } }
    return [bi % w + 0.5, Math.floor(bi / w) + 0.5, best];
  }
  // scale that makes a W×H frame rotated by ang still cover the W×H frame
  const coverScale = (W, H, ang) => { const c = Math.abs(Math.cos(ang)), s = Math.abs(Math.sin(ang)); return Math.max((W * c + H * s) / W, (W * s + H * c) / H); };

  KV.TX = { EZ, DIR, dirName, dirOf, atOf, farR, seg, scaleAt, scr, snapA, masked, field, maskFrom, grid, vnoise, fbm,
    rgbSplit, blurStamp, xfade, run, deepest, coverScale };
})();
