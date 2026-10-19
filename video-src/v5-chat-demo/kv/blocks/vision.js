/* KV library "vision" — robot AI camera effects ported from production 07 (VN-J AiRobot "MẮT AI") into
 * reusable tier-2 blocks. Same contract as kv-blocks.js: draw around the origin inside env.box, colours
 * accept theme names, text calls env.note() before drawing glyphs.
 */
(function () {
  'use strict';
  const { clamp, lerp, E, hash } = MV;
  const D = KV.define, col = (c, fb) => KV.col(c, fb);

  // ------------------------------------------------------------------ shared HUD chrome (viewfinder / detect)
  function brackets(ctx, r, colr, a, len, lw) {
    if (a <= 0) return;
    ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = colr; ctx.lineWidth = lw; ctx.beginPath();
    for (const [x, y, dx, dy] of [[r.x, r.y, 1, 1], [r.x + r.w, r.y, -1, 1], [r.x, r.y + r.h, 1, -1], [r.x + r.w, r.y + r.h, -1, -1]]) {
      ctx.moveTo(x + dx * len, y); ctx.lineTo(x, y); ctx.lineTo(x, y + dy * len);
    }
    ctx.stroke(); ctx.restore();
  }
  function chipLabel(ctx, env, x, y, label, colr, a, opts) {
    opts = opts || {}; if (a <= 0) return;
    const size = (opts.size ?? 28) * env.u, align = opts.align || 'left';
    const font = env.font('mono', 600, size), textW = MV.measure(label, font, '3px'), w = textW + size * 1.5, hh = size * 1.6;
    const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    ctx.save(); ctx.globalAlpha *= a;
    ctx.fillStyle = 'rgba(5,9,15,0.8)'; MV.rr(x0, y - hh * 0.72, w, hh, 7 * env.u); ctx.fill();
    ctx.save(); ctx.globalAlpha *= 0.8; ctx.strokeStyle = colr; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
    ctx.fillStyle = colr; MV.circle(x0 + size * 0.62, y - size * 0.3, size * 0.2); ctx.fill();
    env.note({ text: label, x: x0 + size * 1.08, y: y - size, w: textW, h: size * 1.3, px: size, color: colr });
    MV.text(label, x0 + size * 1.08, y, { font, color: colr, ls: '3px' });
    ctx.restore();
  }

  // ------------------------------------------------------------------ 1. viewfinder (cat ui)
  D('viewfinder', {
    cat: 'ui', at: 'full', enter: 'fade',
    draw(ctx, P, env) {
      const b = env.box, colr = col(P.color || 'a2'), u = env.u;
      const len = clamp(Math.min(b.w, b.h) * 0.07, 14 * u, 70 * u);
      brackets(ctx, b, colr, 1, len, Math.max(1.5 * u, 3 * u));
      ctx.save(); ctx.globalAlpha *= 0.5; ctx.strokeStyle = colr; ctx.lineWidth = 1.5 * u; ctx.beginPath();
      for (let i = 1; i < 12; i++) { const x = b.x + b.w * i / 12, l = (i % 3 ? 7 : 14) * u; ctx.moveTo(x, b.y); ctx.lineTo(x, b.y + l); ctx.moveTo(x, b.y + b.h); ctx.lineTo(x, b.y + b.h - l); }
      ctx.stroke(); ctx.restore();
      if (P.crosshair) { const cx = b.x + b.w / 2, cy = b.y + b.h / 2, r = 14 * u; ctx.save(); ctx.strokeStyle = colr; ctx.globalAlpha *= 0.85; ctx.lineWidth = 2 * u; ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke(); ctx.restore(); }
      if (P.rec !== false) { // blinking record dot only (no caption — stays clear of every platform safe zone)
        const on = Math.floor(env.t * 2) % 2 === 0, rx = b.x + b.w - 34 * u, ry = b.y + 34 * u;
        ctx.save(); ctx.fillStyle = col(P.recColor || '#E3262E'); ctx.globalAlpha *= on ? 0.95 : 0.35; MV.circle(rx, ry, 8 * u); ctx.fill(); ctx.restore();
      }
      const sz = KV.zone('safe'), safe = { x: sz.x + b.x, y: sz.y + b.y, w: sz.w, h: sz.h }; // safe rect converted from canvas-absolute to this layer's local frame
      (P.labels || []).forEach((raw, i) => {
        const lab = typeof raw === 'string' ? { text: raw } : raw, k = E.oX(clamp((env.lt - i * 0.15) / 0.35)); if (k <= 0) return;
        chipLabel(ctx, env, safe.x + safe.w, safe.y + safe.h - (14 + i * 46) * u, lab.text, col(lab.color || P.color || 'a2'), k, { size: 28, align: 'right' });
      });
    }
  });

  // ------------------------------------------------------------------ 2. crt (cat fx)
  const NOISE = (() => { const s = 256, c = document.createElement('canvas'); c.width = c.height = s; const g = c.getContext('2d'), id = g.createImageData(s, s); let x = 123456789 >>> 0; for (let i = 0; i < s * s; i++) { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; const v = x & 255; id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255; } g.putImageData(id, 0, 0); return c; })();
  D('crt', {
    cat: 'fx', at: 'full', enter: 'none',
    draw(ctx, P, env) {
      const b = env.box, u = env.u, dur = env.T(P.dur ?? '1.5s'), a = P.hold ? 1 : 1 - E.io(clamp(env.lt / dur));
      if (a <= 0.003) return;
      ctx.save(); MV.rr(b.x, b.y, b.w, b.h, 0); ctx.clip(); ctx.imageSmoothingEnabled = false;
      const step = Math.floor(env.t * 30), pat = ctx.createPattern(NOISE, 'repeat');
      ctx.save(); ctx.globalAlpha *= a * 0.5; ctx.globalCompositeOperation = 'screen'; ctx.translate((step * 97) % 256, (step * 57) % 256);
      ctx.fillStyle = pat; ctx.fillRect(b.x - ((step * 97) % 256), b.y - ((step * 57) % 256), b.w + 256, b.h + 256); ctx.restore();
      ctx.save(); ctx.globalAlpha *= a * 0.26; ctx.fillStyle = '#000'; for (let y = b.y; y < b.y + b.h; y += 4 * u) ctx.fillRect(b.x, y, b.w, 2 * u); ctx.restore();
      const period = 1.3, by = b.y + ((env.lt * 0.9) % period) / period * (b.h + 300 * u) - 150 * u;
      const g = ctx.createLinearGradient(0, by - 90 * u, 0, by + 90 * u); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(200,235,255,0.18)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = g; ctx.fillRect(b.x, by - 90 * u, b.w, 180 * u); ctx.restore();
      ctx.restore();
    }
  });

  // ------------------------------------------------------------------ colour LUTs (turbo / inferno polynomial fits)
  const TURBO = [], INF = [];
  (function buildLUT() {
    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      TURBO.push([clamp(0.13572138 + t * (4.61539260 + t * (-42.66032258 + t * (132.13108234 + t * (-152.94239396 + t * 59.28637943))))) * 255,
        clamp(0.09140261 + t * (2.19418839 + t * (4.84296658 + t * (-14.18503333 + t * (4.27729857 + t * 2.82956604))))) * 255,
        clamp(0.10667330 + t * (12.64194608 + t * (-60.58204836 + t * (110.36276771 + t * (-89.90310912 + t * 27.34824973))))) * 255]);
      const c0 = [0.000219, 0.001651, -0.019481], c1 = [0.106513, 0.563956, 3.932712], c2 = [11.602493, -3.972854, -15.942394],
        c3 = [-41.703996, 17.436399, 44.354145], c4 = [77.162936, -33.402359, -81.807309], c5 = [-71.319428, 32.626064, 73.209520], c6 = [25.131126, -12.242669, -23.070325];
      INF.push([0, 1, 2].map(k => clamp(c0[k] + t * (c1[k] + t * (c2[k] + t * (c3[k] + t * (c4[k] + t * (c5[k] + t * c6[k])))))) * 255));
    }
  })();
  const lut = (T, x) => T[Math.round(clamp(x) * 255)], rgbStr = c => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;

  // ------------------------------------------------------------------ per-asset precompute cache + tiny scratch pool
  const EDGE = {}, THERM = {}, DEPTH = {}, PARTS = {}, FEATHER = {};
  const spool = {};
  function scratch(w, h) { w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h)); let c = spool.c; if (!c || c.width < w || c.height < h) { c = spool.c = document.createElement('canvas'); c.width = w; c.height = h; } const g = c.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, c.width, c.height); return [c, g]; }
  function pixelsOf(img) { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0); return g.getImageData(0, 0, img.width, img.height).data; }
  function coverFit(img, b) { const s = Math.max(b.w / img.width, b.h / img.height), dw = img.width * s, dh = img.height * s; return { s, dw, dh, dx: b.x + (b.w - dw) / 2, dy: b.y + (b.h - dh) / 2 }; }
  function buildEdgeAlpha(img) {
    const w = img.width, h = img.height, d = pixelsOf(img), N = w * h, lu = new Float32Array(N);
    for (let i = 0; i < N; i++) lu[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    const oc = document.createElement('canvas'); oc.width = w; oc.height = h; const og = oc.getContext('2d'), id = og.createImageData(w, h), o = id.data;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = lu[i - w + 1] + 2 * lu[i + 1] + lu[i + w + 1] - lu[i - w - 1] - 2 * lu[i - 1] - lu[i + w - 1];
      const gy = lu[i + w - 1] + 2 * lu[i + w] + lu[i + w + 1] - lu[i - w - 1] - 2 * lu[i - w] - lu[i - w + 1];
      const e = clamp((Math.hypot(gx, gy) - 60) / 170); if (e <= 0) continue;
      o[i * 4] = o[i * 4 + 1] = o[i * 4 + 2] = 255; o[i * 4 + 3] = 255 * Math.min(1, e * 1.4);
    }
    og.putImageData(id, 0, 0); return oc;
  }
  function buildThermalCanvas(img) {
    const w = img.width, h = img.height, d = pixelsOf(img);
    const oc = document.createElement('canvas'); oc.width = w; oc.height = h; const og = oc.getContext('2d'), id = og.createImageData(w, h), o = id.data;
    for (let i = 0; i < w * h; i++) { const l = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255, c = lut(INF, 0.06 + 0.42 * Math.pow(l, 1.1)); o[i * 4] = c[0]; o[i * 4 + 1] = c[1]; o[i * 4 + 2] = c[2]; o[i * 4 + 3] = 255; }
    og.putImageData(id, 0, 0); return oc;
  }
  function buildDepthCanvas(img) {
    const w = img.width, h = img.height, dw = Math.max(1, Math.round(w / 4)), dh = Math.max(1, Math.round(h / 4));
    const pc = document.createElement('canvas'); pc.width = dw; pc.height = dh; pc.getContext('2d').drawImage(img, 0, 0, dw, dh);
    const src = pc.getContext('2d').getImageData(0, 0, dw, dh).data;
    const oc = document.createElement('canvas'); oc.width = dw; oc.height = dh; const og = oc.getContext('2d'), id = og.createImageData(dw, dh), o = id.data;
    for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
      const i = y * dw + x, l = (0.299 * src[i * 4] + 0.587 * src[i * 4 + 1] + 0.114 * src[i * 4 + 2]) / 255, vg = y / dh;
      const n = clamp(vg * 0.75 + (1 - l) * 0.25), band = (n * 14) % 1, k = band < 0.08 ? 1.3 : 1, c = lut(TURBO, 0.05 + n * 0.9);
      o[i * 4] = Math.min(255, c[0] * k); o[i * 4 + 1] = Math.min(255, c[1] * k); o[i * 4 + 2] = Math.min(255, c[2] * k); o[i * 4 + 3] = 255;
    }
    og.putImageData(id, 0, 0); return oc;
  }
  function buildParticles(img, n) {
    const w = img.width, h = img.height, d = pixelsOf(img), aspect = w / h, cols = Math.max(1, Math.round(Math.sqrt(n * aspect))), rows = Math.max(1, Math.round(n / cols)), arr = [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { if (arr.length >= n) break; const fx = (i + 0.5) / cols, fy = (j + 0.5) / rows, px = Math.min(w - 1, (fx * w) | 0), py = Math.min(h - 1, (fy * h) | 0), k = (py * w + px) * 4; arr.push({ fx, fy, c: [d[k], d[k + 1], d[k + 2]] }); }
    return arr;
  }
  function feathered(img, fr) {
    const w = img.width, h = img.height, c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    const m = document.createElement('canvas'); m.width = w; m.height = h; const mg = m.getContext('2d'), fe = Math.min(w, h) * fr;
    mg.fillStyle = '#000'; mg.fillRect(0, 0, w, h); mg.globalCompositeOperation = 'destination-out';
    const band = (ax, ay, bx, by, rx, ry, rw, rh) => { const gr = mg.createLinearGradient(ax, ay, bx, by); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); mg.fillStyle = gr; mg.fillRect(rx, ry, rw, rh); };
    band(0, 0, fe, 0, 0, 0, fe, h); band(w, 0, w - fe, 0, w - fe, 0, fe, h); band(0, 0, 0, fe, 0, 0, w, fe); band(0, h, 0, h - fe, 0, h - fe, w, fe);
    g.drawImage(img, 0, 0); g.globalCompositeOperation = 'destination-in'; g.drawImage(m, 0, 0); return c;
  }
  const PREPARE = (SB, KV2, which) => { for (const key of Object.keys(SB.assets || {})) { const img = MV.img[key]; if (!img) continue; which(key, img); } };

  // ------------------------------------------------------------------ 3. edges (cat media)
  D('edges', {
    cat: 'media', enter: 'fade',
    prepare: async (SB) => PREPARE(SB, KV, (key, img) => { EDGE[key] = buildEdgeAlpha(img); }),
    draw(ctx, P, env) {
      const img = env.img(P.src); if (!img) return;
      const b = env.box, mix = clamp(P.mix ?? 0), cf = coverFit(img, b);
      ctx.save(); MV.rr(b.x, b.y, b.w, b.h, (P.radius || 0) * env.u); ctx.clip(); ctx.imageSmoothingQuality = 'high';
      if (mix > 0) { ctx.save(); ctx.globalAlpha *= mix; ctx.drawImage(img, cf.dx, cf.dy, cf.dw, cf.dh); ctx.restore(); }
      const alphaMap = EDGE[P.src];
      if (alphaMap && mix < 1) {
        ctx.save(); ctx.fillStyle = 'rgba(3,8,14,0.78)'; ctx.globalAlpha *= (1 - mix); ctx.fillRect(b.x, b.y, b.w, b.h); ctx.restore();
        const [c, g] = scratch(b.w, b.h);
        g.drawImage(alphaMap, cf.dx - b.x, cf.dy - b.y, cf.dw, cf.dh);
        g.globalCompositeOperation = 'source-in'; g.fillStyle = col(P.color || 'a2'); g.fillRect(0, 0, b.w, b.h);
        ctx.save(); ctx.globalAlpha *= (1 - mix); ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(c, 0, 0, b.w, b.h, b.x, b.y, b.w, b.h); ctx.restore();
      }
      const period = env.T(P.scanPeriod ?? '2.4s'), ph = (env.lt % period) / period, sy = b.y + b.h * ph, u = env.u;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g2 = ctx.createLinearGradient(0, sy - 46 * u, 0, sy); g2.addColorStop(0, 'rgba(255,255,255,0)'); g2.addColorStop(1, col(P.color || 'a2'));
      ctx.fillStyle = g2; ctx.fillRect(b.x, sy - 46 * u, b.w, 46 * u);
      ctx.fillStyle = '#EFFFFF'; ctx.globalAlpha *= 0.85; ctx.fillRect(b.x, sy - 1.5 * u, b.w, 3 * u);
      ctx.restore(); ctx.restore();
    }
  });

  // ------------------------------------------------------------------ 4. thermal (cat media)
  D('thermal', {
    cat: 'media', enter: 'fade',
    prepare: async (SB) => PREPARE(SB, KV, (key, img) => { THERM[key] = buildThermalCanvas(img); }),
    draw(ctx, P, env) {
      const img = THERM[P.src]; if (!img) return;
      const b = env.box, u = env.u, cf = coverFit(img, b), amp = (P.shimmer ?? 1) * u, step = Math.max(3, 8 * u);
      ctx.save(); MV.rr(b.x, b.y, b.w, b.h, (P.radius || 0) * u); ctx.clip(); ctx.imageSmoothingQuality = 'high';
      for (let dy = 0; dy < b.h; dy += step) {
        const rowH = Math.min(step, b.h - dy), srcY = (dy - (cf.dy - b.y)) / cf.s, srcH = rowH / cf.s;
        if (srcY + srcH < 0 || srcY > img.height) continue;
        const shift = (Math.sin((b.y + dy) * 0.04 + env.lt * 1.4) * 3 + Math.sin((b.y + dy) * 0.09 - env.lt * 0.9) * 1.6) * amp;
        ctx.drawImage(img, 0, Math.max(0, srcY), img.width, Math.min(img.height, Math.max(1, srcH)), cf.dx + shift, b.y + dy, cf.dw, rowH);
      }
      ctx.restore();
    }
  });

  // ------------------------------------------------------------------ 5. depthmap (cat media)
  D('depthmap', {
    cat: 'media', enter: 'fade',
    prepare: async (SB) => PREPARE(SB, KV, (key, img) => { DEPTH[key] = buildDepthCanvas(img); }),
    draw(ctx, P, env) {
      const img = env.img(P.src), depth = DEPTH[P.src]; if (!img || !depth) return;
      const b = env.box, u = env.u, cf = coverFit(img, b);
      ctx.save(); MV.rr(b.x, b.y, b.w, b.h, (P.radius || 0) * u); ctx.clip(); ctx.imageSmoothingQuality = 'high';
      if (P.sweep) {
        const k = clamp(env.lt / env.T(P.dur ?? '1.5s')), x = b.x + b.w * k;
        ctx.drawImage(img, cf.dx, cf.dy, cf.dw, cf.dh);
        ctx.save(); ctx.beginPath(); ctx.rect(b.x, b.y, x - b.x, b.h); ctx.clip(); ctx.drawImage(depth, cf.dx, cf.dy, cf.dw, cf.dh); ctx.restore();
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createLinearGradient(x - 40 * u, 0, x, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, col(P.scanColor || 'a2'));
        ctx.fillStyle = g; ctx.fillRect(x - 40 * u, b.y, 40 * u, b.h); ctx.fillStyle = '#EAFBFF'; ctx.fillRect(x - 1.5 * u, b.y, 3 * u, b.h); ctx.restore();
      } else ctx.drawImage(depth, cf.dx, cf.dy, cf.dw, cf.dh);
      ctx.restore();
    }
  });

  // ------------------------------------------------------------------ 6. detect (cat ui)
  D('detect', {
    cat: 'ui', at: 'full', enter: 'none',
    draw(ctx, P, env) {
      const b = env.box, u = env.u;
      (P.boxes || []).forEach(o => {
        const t0 = env.T(o.at ?? 0), k = E.oX(clamp((env.lt - t0) / 0.3)); if (k <= 0) return;
        const x0 = b.x + o.x * b.w, y0 = b.y + o.y * b.h, w = o.w * b.w, h = o.h * b.h, sc = lerp(1.5, 1, k), cx = x0 + w / 2, cy = y0 + h / 2;
        const r = { x: cx - w * sc / 2, y: cy - h * sc / 2, w: w * sc, h: h * sc }, colr = col(o.color || 'a2'), fl = Math.exp(-Math.max(0, env.lt - t0 - 0.2) * 6);
        ctx.save(); ctx.globalAlpha *= clamp(k * 1.4);
        const lk = clamp((env.lt - t0 + 0.14) / 0.3);
        if (lk > 0 && lk < 1) { const R = lerp(Math.max(w, h) * 0.9, Math.max(r.w, r.h) / 2, E.o(lk)); brackets(ctx, { x: cx - R, y: cy - R, w: 2 * R, h: 2 * R }, colr, 1 - lk, R * 0.5, 2.5 * u); }
        ctx.save(); ctx.fillStyle = colr; ctx.globalAlpha *= 0.06 + 0.12 * fl; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.restore();
        ctx.save(); ctx.strokeStyle = colr; ctx.globalAlpha *= 0.5; ctx.lineWidth = 1.5 * u; ctx.strokeRect(r.x, r.y, r.w, r.h); ctx.restore();
        brackets(ctx, r, colr, 1, Math.min(28 * u, r.w * 0.25), 3.5 * u);
        ctx.save(); ctx.strokeStyle = colr; ctx.globalAlpha *= 0.8; ctx.lineWidth = 1.5 * u; ctx.beginPath(); ctx.moveTo(cx - 10 * u, cy); ctx.lineTo(cx + 10 * u, cy); ctx.moveTo(cx, cy - 10 * u); ctx.lineTo(cx, cy + 10 * u); ctx.stroke(); ctx.restore();
        if (o.label) chipLabel(ctx, env, clamp(r.x, b.x, b.x + b.w - 20 * u), r.y - 6 * u, o.label, colr, 1, { size: 28 });
        ctx.restore();
      });
    }
  });

  // ------------------------------------------------------------------ 7. photo-particles (cat media)
  const TARGETS = new Map();
  function targetsFor(to, n, R) {
    const key = to + '|' + n + '|' + R.toFixed(1); let arr = TARGETS.get(key); if (arr) return arr;
    arr = new Array(n);
    if (to === 'grid') { const cols = Math.max(1, Math.ceil(Math.sqrt(n))), rows = Math.max(1, Math.ceil(n / cols)); for (let i = 0; i < n; i++) { const cx = i % cols, cy = (i / cols) | 0; arr[i] = [(cols > 1 ? cx / (cols - 1) - 0.5 : 0) * R * 1.7, (rows > 1 ? cy / (rows - 1) - 0.5 : 0) * R * 1.7]; } }
    else if (to === 'ring') { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; arr[i] = [Math.cos(a) * R, Math.sin(a) * R]; } }
    else { for (let i = 0; i < n; i++) { const h1 = hash(i * 1.37 + 2), h2 = hash(i * 2.11 + 7), r = R * (0.25 + 0.75 * Math.sqrt(h1)), a = h2 * Math.PI * 2; arr[i] = [Math.cos(a) * r, Math.sin(a) * r * 0.62]; } }
    TARGETS.set(key, arr); return arr;
  }
  D('photo-particles', {
    cat: 'media', enter: 'none',
    prepare: async (SB) => PREPARE(SB, KV, (key, img) => { PARTS[key] = buildParticles(img, 3000); }),
    draw(ctx, P, env) {
      const parts = PARTS[P.src]; if (!parts) return;
      const b = env.box, u = env.u, n = parts.length, cx = b.x + b.w / 2, cy = b.y + b.h / 2, R = Math.min(b.w, b.h) * 0.42;
      const targets = targetsFor(P.to || 'cloud', n, R), dur = env.T(P.dur ?? '1.8s'), kAll = clamp(env.lt / dur);
      const kb = E.o(clamp(kAll / 0.35)), mv = E.io(clamp((kAll - 0.15) / 0.85));
      ctx.save();
      for (let i = 0; i < n; i++) {
        const p = parts[i], h1 = env.rng(i), h2 = env.rng(i + 101), h3 = env.rng(i + 202);
        const sx = b.x + p.fx * b.w, sy = b.y + p.fy * b.h, tgt = targets[i], tx = cx + tgt[0], ty = cy + tgt[1];
        const ang = Math.atan2(sy - cy, sx - cx) + (h1 - 0.5) * 0.9, dist = (0.06 + 0.22 * Math.pow(h2, 1.5)) * Math.min(b.w, b.h);
        const bx = sx + Math.cos(ang) * dist * kb, by = sy + Math.sin(ang) * dist * kb - 0.05 * Math.min(b.w, b.h) * kb * h3;
        const sw = Math.sin(Math.PI * mv) * (0.03 + 0.05 * h3) * Math.min(b.w, b.h);
        const dx = tx - bx, dy = ty - by, dl = Math.hypot(dx, dy) || 1;
        const x = lerp(bx, tx, mv) - dy / dl * sw, y = lerp(by, ty, mv) + dx / dl * sw, sz = lerp(3.4 * u, (2 + 1.4 * h3) * u, mv);
        ctx.fillStyle = rgbStr(p.c); ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
      }
      ctx.restore();
    }
  });

  // ------------------------------------------------------------------ 8. zoom-through (cat media, log-zoom nested photos)
  const mul = (P, C) => [P[0] * C[0] + P[2] * C[1], P[1] * C[0] + P[3] * C[1], P[0] * C[2] + P[2] * C[3], P[1] * C[2] + P[3] * C[3], P[0] * C[4] + P[2] * C[5] + P[4], P[1] * C[4] + P[3] * C[5] + P[5]];
  const app = (M, x, y) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]];
  const mag = M => Math.hypot(M[0], M[1]);
  function buildSpline(keys) {
    const x = keys.map(k => k.t), y = keys.map(k => Math.log(k.Z)), n = x.length, dl = [], m = [];
    for (let i = 0; i < n - 1; i++) dl.push((y[i + 1] - y[i]) / Math.max(1e-6, x[i + 1] - x[i]));
    for (let i = 0; i < n; i++) m.push(i === 0 ? dl[0] : i === n - 1 ? dl[n - 2] : dl[i - 1] * dl[i] <= 0 ? 0 : (dl[i - 1] + dl[i]) / 2);
    for (let i = 0; i < n - 1; i++) { if (dl[i] === 0) { m[i] = m[i + 1] = 0; continue; } const a = m[i] / dl[i], bb = m[i + 1] / dl[i], h = Math.hypot(a, bb); if (h > 3) { m[i] = 3 * a / h * dl[i]; m[i + 1] = 3 * bb / h * dl[i]; } }
    return { x, y, m };
  }
  function sampleCam(t, keys, spl) {
    const { x, y, m } = spl;
    if (t <= x[0]) return { Z: keys[0].Z, f: keys[0].f };
    if (t >= x[x.length - 1]) return { Z: keys[keys.length - 1].Z, f: keys[keys.length - 1].f };
    let i = 0; while (t > x[i + 1]) i++;
    const h = x[i + 1] - x[i], s = (t - x[i]) / h, s2 = s * s, s3 = s2 * s;
    const lz = (2 * s3 - 3 * s2 + 1) * y[i] + (s3 - 2 * s2 + s) * h * m[i] + (-2 * s3 + 3 * s2) * y[i + 1] + (s3 - s2) * h * m[i + 1], Z = Math.exp(lz);
    const a = keys[i], b = keys[i + 1];
    if (Math.abs(b.Z - a.Z) / a.Z < 1e-3) return { Z, f: [lerp(a.f[0], b.f[0], s), lerp(a.f[1], b.f[1], s)] };
    const ws = [0, 1].map(j => (b.f[j] * b.Z - a.f[j] * a.Z) / (b.Z - a.Z));
    return { Z, f: [0, 1].map(j => ws[j] - (ws[j] - a.f[j]) * a.Z / Z) };
  }
  const ZOOM = new Map();
  function buildZoom(P, env) {
    const b = env.box, key = P.srcs.join('|') + '#' + JSON.stringify(P.points || []) + '#' + b.w.toFixed(0) + 'x' + b.h.toFixed(0);
    let z = ZOOM.get(key); if (z) return z;
    const imgs = P.srcs.map(k => env.img(k)); if (imgs.some(i => !i)) return null;
    const M = [[1, 0, 0, 1, 0, 0]];
    for (let i = 0; i < imgs.length - 1; i++) {
      const pt = (P.points || [])[i] || { p: [imgs[i].width / 2, imgs[i].height / 2], span: imgs[i].width * 0.4 };
      const s = pt.span / imgs[i + 1].width, x0 = pt.p[0] - imgs[i + 1].width * s / 2, y0 = pt.p[1] - imgs[i + 1].height * s / 2;
      M.push(mul(M[i], [s, 0, 0, s, x0, y0]));
    }
    const keys = imgs.map((img, i) => {
      const scl = mag(M[i]), ww = img.width * scl, hh = img.height * scl, Z = Math.max(b.w / ww, b.h / hh);
      const at = i === 0 ? 0 : ((P.points || [])[i - 1] || {}).at ?? i;
      return { t: i === 0 ? 0 : env.T(at), Z, f: app(M[i], img.width / 2, img.height / 2) };
    });
    z = { imgs, M, keys, spl: buildSpline(keys) }; ZOOM.set(key, z); return z;
  }
  D('zoom-through', {
    cat: 'media', enter: 'none',
    prepare: async (SB) => PREPARE(SB, KV, (key, img) => { FEATHER[key] = feathered(img, 0.14); }),
    draw(ctx, P, env) {
      if (!P.srcs || P.srcs.length < 2) return;
      const b = env.box, Z = buildZoom(P, env); if (!Z) return;
      const cam = sampleCam(env.lt, Z.keys, Z.spl), bcx = b.x + b.w / 2, bcy = b.y + b.h / 2;
      const S = [cam.Z, 0, 0, cam.Z, bcx - cam.f[0] * cam.Z, bcy - cam.f[1] * cam.Z];
      ctx.save(); MV.rr(b.x, b.y, b.w, b.h, (P.radius || 0) * env.u); ctx.clip(); ctx.imageSmoothingQuality = 'high';
      for (let i = 0; i < Z.imgs.length; i++) {
        const img = i === 0 ? Z.imgs[0] : (FEATHER[P.srcs[i]] || Z.imgs[i]), T = mul(S, Z.M[i]);
        ctx.save(); ctx.transform(T[0], T[1], T[2], T[3], T[4], T[5]); ctx.drawImage(img, 0, 0); ctx.restore();
      }
      ctx.restore();
    }
  });

  // ------------------------------------------------------------------ transition: aperture (7-blade camera iris)
  // The blades start open beyond the farthest frame corner (first frame = scene A, like the fixed `iris`), close over A
  // to a pin-hole at k = 0.5 and open again on scene B (last frame = B). Rm × cos(π/7) > farthest corner, so the open
  // 7-gon covers the whole frame.
  KV.transition('aperture', (k, draw, tr, h) => {
    const { ctx, W, H, col: hcol, u, E: HE } = h, at = tr.at || [0.5, 0.5], cx = at[0] * W, cy = at[1] * H;
    const Rm = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy)) * 1.25, A = k < 0.5, e = A ? 1 - HE.io(k * 2) : HE.io(k * 2 - 1), r = Math.max(4, Rm * Math.pow(e, 1.35));
    const n = 7, rot = 0.6 * (1 - r / Rm) + 0.2, V = [], side = A ? draw.a : draw.b;
    for (let i = 0; i < n; i++) { const a = rot + i * 2 * Math.PI / n; V.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
    side();                                          // the scene seen through the aperture paints the whole frame
    if (r < Rm * 0.995) {
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); V.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath();
      const g = ctx.createRadialGradient(cx, cy, r, cx, cy, r + Math.max(W, H)); g.addColorStop(0, '#1C232D'); g.addColorStop(0.08, '#10151C'); g.addColorStop(1, '#040507');
      ctx.fillStyle = g; ctx.fill('evenodd');
      ctx.strokeStyle = hcol(tr.color || 'a2'); ctx.lineWidth = 2 * u; ctx.beginPath(); V.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.stroke();
      ctx.restore();
    }
  });
})();
