/* kr-motion-video engine — deterministic Canvas 2D toolkit for code-rendered motion graphics.
 * Load in scene.html before scene.js. Every frame must be a pure function of t (seconds):
 * no Date.now(), no Math.random(), no state carried between frames.
 *
 *   MV.boot({ canvas, images: { key: url }, prepare(), draw(t, f) })
 *   -> exposes window.__ready (Promise) and window.renderFrame(t) for render.mjs.
 */
(function () {
  'use strict';
  const MV = (window.MV = {});
  let ctx = null, cv = null;

  MV.FONT = {
    head: 'Bahnschrift, "Barlow Semi Condensed", "Roboto Condensed", "Segoe UI", "Noto Sans", Arial, sans-serif',
    body: '"Segoe UI", "Noto Sans", Roboto, Arial, sans-serif',
    mono: '"Cascadia Code", Consolas, "DejaVu Sans Mono", monospace'
  };
  MV.C = {
    ink: '#EAF2FF', ink2: '#A9BBD6', ink3: '#62789A', gold: '#FFB21E', blue: '#3B82F6', cyan: '#22D3EE',
    green: '#22C55E', red: '#FF4D5E', amber: '#F5A623', grey: '#6A7A94', navy: '#0F1F35', white: '#FFFFFF'
  };

  // ------------------------------------------------------------------ math
  const clamp = (MV.clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x)));
  const lerp = (MV.lerp = (a, b, k) => a + (b - a) * k);
  const seg = (MV.seg = (t, a, b) => clamp((t - a) / (b - a)));
  const E = (MV.E = {
    io: k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2,
    o: k => 1 - Math.pow(1 - k, 3),
    i: k => k * k * k,
    oX: k => k >= 1 ? 1 : 1 - Math.pow(2, -10 * k),
    oB: k => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); }
  });
  // more named curves (all exactly 0 at k = 0 and 1 at k = 1)
  E.iB = k => 2.70158 * k * k * k - 1.70158 * k * k;                       // back-in: dips ~10 % below 0 (exits)
  E.anticipate = k => k <= 0 ? 0 : k >= 1 ? 1 : k < 0.5 ? 0.5 * (2.7 * (2 * k) ** 3 - 1.7 * (2 * k) ** 2) : 0.5 * (2 - Math.pow(2, -10 * (2 * k - 1))); // dip ~5 % at k 0.21, expo-out
  E.sine = k => 0.5 - Math.cos(Math.PI * k) / 2;                           // sine in-out
  E.circ = k => Math.sqrt(1 - (1 - clamp(k)) ** 2);                       // circ-out (k clamped: no sqrt of a negative)
  E.quart = k => 1 - (1 - k) ** 4;                                         // quart-out
  /** Damped spring by perceived bounce b (0 = critically damped ... 0.9 = very springy), as an ease of k 0..1.
   * Damping ratio z = 1 - b (SwiftUI's duration/bounce mapping); natural frequency 8 rad per unit k, so the first
   * overshoot peaks at k = pi / (8 sqrt(1 - z^2)) with height exp(-pi z / sqrt(1 - z^2)) (b 0.3 -> 4.6 %, 0.5 -> 16 %).
   * The residual oscillation is blended linearly into exactly 1 over the last 15 % of k (no snap at the end). */
  E.spring = b => {
    const z = Math.min(1, Math.max(0.05, 1 - (+b || 0))), w = 8;
    const f = z >= 1 ? k => 1 - Math.exp(-w * k) * (1 + w * k)
      : (wd => k => 1 - Math.exp(-z * w * k) * (Math.cos(wd * k) + z * w / wd * Math.sin(wd * k)))(w * Math.sqrt(1 - z * z));
    return k => k <= 0 ? 0 : k >= 1 ? 1 : k > 0.85 ? f(k) + (1 - f(k)) * (k - 0.85) / 0.15 : f(k);
  };
  /** CSS-style cubic-bezier(x1, y1, x2, y2) ease: solve x(t) = k (Newton, bisection fallback), return y(t). */
  E.bez = (x1, y1, x2, y2) => {
    const B = (t, a, b) => 3 * a * t * (1 - t) * (1 - t) + 3 * b * t * t * (1 - t) + t * t * t;
    const dB = (t, a, b) => 3 * a * (1 - t) * (1 - t) + 6 * (b - a) * t * (1 - t) + 3 * (1 - b) * t * t;
    return k => {
      if (k <= 0) return 0; if (k >= 1) return 1;
      let t = k;
      for (let i = 0; i < 8; i++) { const x = B(t, x1, x2) - k, d = dB(t, x1, x2); if (Math.abs(x) < 1e-6) return B(t, y1, y2); if (Math.abs(d) < 1e-6) break; t -= x / d; if (t < 0 || t > 1) break; }
      let a = 0, c = 1; t = k; // x(t) is monotonic for 0 <= x1, x2 <= 1: bisection always converges
      for (let i = 0; i < 40; i++) { const x = B(t, x1, x2); if (Math.abs(x - k) < 1e-7) break; if (x < k) a = t; else c = t; t = (a + c) / 2; }
      return B(t, y1, y2);
    };
  };
  const hash = (MV.hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); });
  /** Smooth 1-D value noise in -1..1 (smoothstep between hashed integer lattice values); seed picks the stream. */
  MV.noise1 = (x, seed = 0) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash(i + seed * 57.31), hash(i + 1 + seed * 57.31), u) * 2 - 1; };
  const hx = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const rgba = (MV.rgba = (h, a) => { const c = hx(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; });
  MV.mixc = (a, b, k) => { const x = hx(a), y = hx(b); return `rgb(${Math.round(lerp(x[0], y[0], k))},${Math.round(lerp(x[1], y[1], k))},${Math.round(lerp(x[2], y[2], k))})`; };

  // ------------------------------------------------------------------ canvas primitives
  MV.init = canvas => { cv = canvas; ctx = canvas.getContext('2d', { alpha: false }); MV.ctx = ctx; MV.cv = cv; MV.W = cv.width; MV.H = cv.height; return ctx; };
  const rr = (MV.rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); });
  const circle = (MV.circle = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2); });
  const line = (MV.line = (a, b) => { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); });
  const text = (MV.text = (str, x, y, o = {}) => {
    ctx.save();
    ctx.font = o.font || `400 32px ${MV.FONT.body}`; ctx.fillStyle = o.color || MV.C.ink;
    ctx.textAlign = o.align || 'left'; ctx.textBaseline = o.base || 'alphabetic'; ctx.letterSpacing = o.ls || '0px';
    if (o.alpha !== undefined) ctx.globalAlpha *= clamp(o.alpha);
    if (o.glow) { ctx.shadowColor = o.glowColor || ctx.fillStyle; ctx.shadowBlur = o.glow; }
    ctx.fillText(str, x, y); ctx.restore();
  });
  const measure = (MV.measure = (str, font, ls = '0px') => { ctx.save(); ctx.font = font; ctx.letterSpacing = ls; const w = ctx.measureText(str).width; ctx.restore(); return w; });
  /** Largest font size (step 2px) at which `str` fits `maxW`. */
  const fitFont = (MV.fitFont = (str, weight, max, maxW, fam = MV.FONT.head, ls = '0px', min = 40) => {
    let s = max; while (s > min && measure(str, `${weight} ${s}px ${fam}`, ls) > maxW) s -= 2; return s;
  });

  // soft additive glow from a cached radial sprite (cheap compared with shadowBlur)
  const SPR = {};
  function sprite(col) {
    if (SPR[col]) return SPR[col];
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d'), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, rgba(col, 1)); gr.addColorStop(0.22, rgba(col, 0.5)); gr.addColorStop(0.55, rgba(col, 0.13)); gr.addColorStop(1, rgba(col, 0));
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    return (SPR[col] = c);
  }
  const glow = (MV.glow = (x, y, r, col, a) => {
    if (a <= 0.002 || r <= 0) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= Math.min(1, a);
    ctx.drawImage(sprite(col), x - r, y - r, 2 * r, 2 * r); ctx.restore();
  });

  // cubic curves with horizontal (bzH) or vertical (bzV) end tangents
  MV.bzH = (x0, y0, x1, y1, k) => { const c = lerp(x0, x1, 0.5), u = 1 - k; return [u * u * u * x0 + 3 * u * u * k * c + 3 * u * k * k * c + k * k * k * x1, u * u * u * y0 + 3 * u * u * k * y0 + 3 * u * k * k * y1 + k * k * k * y1]; };
  MV.bzV = (x0, y0, x1, y1, k) => { const m = lerp(y0, y1, 0.5), u = 1 - k; return [u * u * u * x0 + 3 * u * u * k * x0 + 3 * u * k * k * x1 + k * k * k * x1, u * u * u * y0 + 3 * u * u * k * m + 3 * u * k * k * m + k * k * k * y1]; };
  /** Stroke the part [a,b] of a parametric path fn(k) -> [x,y]. */
  MV.strokePath = (fn, a = 0, b = 1, n = 36) => {
    if (b <= a) return; ctx.beginPath();
    for (let i = 0; i <= n; i++) { const p = fn(lerp(a, b, i / n)); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }
    ctx.stroke();
  };

  // ------------------------------------------------------------------ camera
  /**
   * keys: [[t, x, y, zoom], ...]. Segments shorter than `easeBelow` seconds ease in/out (a move);
   * longer ones interpolate linearly (a slow drift). Zoom interpolates in log space.
   * World point (cam.x, cam.y) lands on screen (ax, ay).
   */
  MV.camera = (keys, { ax, ay, easeBelow = 1.2 } = {}) => {
    const cam = {
      ax: ax ?? MV.W / 2, ay: ay ?? MV.H / 2,
      at(t) {
        for (let i = 0; i < keys.length - 1; i++) {
          const a = keys[i], b = keys[i + 1];
          if (t <= b[0]) {
            let k = seg(t, a[0], b[0]); if (b[0] - a[0] < easeBelow) k = E.io(k);
            return { x: lerp(a[1], b[1], k), y: lerp(a[2], b[2], k), z: Math.exp(lerp(Math.log(a[3]), Math.log(b[3]), k)) };
          }
        }
        const l = keys[keys.length - 1]; return { x: l[1], y: l[2], z: l[3] };
      },
      apply(cm) { ctx.translate(cam.ax - cm.x * cm.z, cam.ay - cm.y * cm.z); ctx.scale(cm.z, cm.z); },
      toScreen(cm, x, y) { return [cam.ax + (x - cm.x) * cm.z, cam.ay + (y - cm.y) * cm.z]; }
    };
    return cam;
  };

  // ------------------------------------------------------------------ beat sync
  /** Pulse 1 -> 0 after each kick time; drive glows/grids with it so picture breathes with the music. */
  MV.pulseFrom = (kicks, decay = 6) => t => { let last = -9; for (const k of kicks) { if (k <= t) last = k; else break; } return t - last < 1 ? Math.exp(-(t - last) * decay) : 0; };
  MV.pulseGrid = (beat, from, to, decay = 7) => t => (t < from || t >= to) ? 0 : Math.exp(-(((t - from) % beat) / beat) * decay);

  // ------------------------------------------------------------------ finishing layers
  let VIG = null; const GRAIN = [];
  MV.prepareFx = ({ vignette = {}, grainSeed = 1 } = {}) => {
    const W = MV.W, H = MV.H;
    VIG = document.createElement('canvas'); VIG.width = W; VIG.height = H;
    const g = VIG.getContext('2d'), cx = vignette.cx ?? W / 2, cy = vignette.cy ?? H / 2;
    const gr = g.createRadialGradient(cx, cy, vignette.r0 ?? Math.min(W, H) * 0.3, cx, cy, vignette.r1 ?? Math.hypot(W, H) * 0.55);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, `rgba(0,0,0,${vignette.alpha ?? 0.66})`);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    GRAIN.length = 0;
    for (let s = 0; s < 3; s++) { // film grain also hides 8-bit gradient banding after H.264
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const gg = c.getContext('2d'), id = gg.createImageData(W, H);
      let x = (s + grainSeed * 7 + 1) * 2654435761 >>> 0;
      for (let i = 0; i < id.data.length; i += 4) {
        x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
        const v = 96 + (x & 63); id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255;
      }
      gg.putImageData(id, 0, 0); GRAIN.push(c);
    }
  };
  MV.vignette = () => { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(VIG, 0, 0); ctx.restore(); };
  MV.grain = (f, light = false, alpha) => {
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = alpha ?? (light ? 0.12 : 0.2);
    ctx.drawImage(GRAIN[f % 3], 0, 0); ctx.restore();
  };
  MV.fade = (color, a) => { if (a <= 0) return; ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = clamp(a); ctx.fillStyle = color; ctx.fillRect(0, 0, MV.W, MV.H); ctx.restore(); };

  /** Dark tech background: radial base, camera-locked grid (parallax cue), bokeh, optional red tint. */
  MV.background = (t, cm, cam, o = {}) => {
    const W = MV.W, H = MV.H, p = o.pulse || 0, s = (o.spacing || 120) * cm.z, m = o.margin ?? 60, k = o.margin == null ? 1 : Math.max(1, Math.ceil(m / s)), e = o.margin == null ? s : Math.max(s, m + 1); // o.margin: painted margin past the frame (default 60: unchanged)
    const [cx, cy] = o.center || [W / 2, H * 0.45];
    const g = ctx.createRadialGradient(cx, cy, 40, cx, cy, Math.hypot(W, H) * 0.62);
    g.addColorStop(0, o.top || '#0F2650'); g.addColorStop(0.5, o.mid || '#071532'); g.addColorStop(1, o.edge || '#02060F');
    ctx.fillStyle = g; ctx.fillRect(-m, -m, W + 2 * m, H + 2 * m);
    const ox = ((cam.ax - cm.x * cm.z) % s + s) % s, oy = ((cam.ay - cm.y * cm.z) % s + s) % s;
    ctx.save();
    ctx.strokeStyle = `rgba(120,160,235,${0.05 + 0.035 * p})`; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = ox - s * k; x < W + e; x += s) { ctx.moveTo(x, -m); ctx.lineTo(x, H + m); }
    for (let y = oy - s * k; y < H + e; y += s) { ctx.moveTo(-m, y); ctx.lineTo(W + m, y); }
    ctx.stroke();
    ctx.fillStyle = `rgba(150,190,255,${0.18 + 0.12 * p})`;
    for (let x = ox - s; x < W + s; x += s) for (let y = oy - s; y < H + s; y += s) ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    ctx.restore();
    const cols = o.bokehColors || [MV.C.blue, MV.C.cyan, MV.C.green, MV.C.blue];
    for (let i = 0; i < (o.bokeh ?? 30); i++) {
      const par = 0.15 + hash(i + 900) * 0.35, span = W + 500;
      const x = ((hash(i + 700) * span - cm.x * par * 0.6 + t * 12 * (hash(i + 11) - 0.5)) % span + span) % span - 250;
      const y = hash(i + 800) * H + Math.sin(t * 0.4 + i) * 30;
      glow(x, y, 40 + hash(i + 1000) * 120, cols[i % cols.length], 0.05 + hash(i + 1100) * 0.07);
    }
    if (o.tint > 0) {
      const rg = ctx.createRadialGradient(W / 2, H / 2, 150, W / 2, H / 2, Math.max(W, H) * 0.6);
      rg.addColorStop(0, rgba(MV.C.red, 0)); rg.addColorStop(1, rgba(MV.C.red, 0.2 * o.tint));
      ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
    }
  };

  // ------------------------------------------------------------------ icons (vector, colour-parameterised)
  MV.icon = {
    crown(x, y, s, col) {
      ctx.save(); ctx.translate(x, y); ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(-s, s * 0.42); ctx.lineTo(-s, -s * 0.38); ctx.lineTo(-s * 0.5, s * 0.02); ctx.lineTo(0, -s * 0.62);
      ctx.lineTo(s * 0.5, s * 0.02); ctx.lineTo(s, -s * 0.38); ctx.lineTo(s, s * 0.42); ctx.closePath(); ctx.fill();
      rr(-s, s * 0.56, 2 * s, s * 0.22, s * 0.06); ctx.fill();
      for (const p of [[-s, -s * 0.38], [0, -s * 0.62], [s, -s * 0.38]]) { circle(p[0], p[1] - s * 0.1, s * 0.14); ctx.fill(); }
      ctx.restore();
    },
    dag(x, y, s, col) {
      ctx.save(); ctx.translate(x, y); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = s * 0.13; ctx.lineCap = 'round';
      const n = [[-0.75, 0], [0.05, -0.62], [0.05, 0.62], [0.8, -0.1], [0.8, 0.75]].map(p => [p[0] * s, p[1] * s]);
      for (const e of [[0, 1], [0, 2], [1, 3], [2, 3], [2, 4]]) line(n[e[0]], n[e[1]]);
      n.forEach((p, i) => { circle(p[0], p[1], s * (i === 0 ? 0.24 : 0.18)); ctx.fill(); });
      ctx.restore();
    },
    code(x, y, s, col) {
      ctx.save(); ctx.translate(x, y); ctx.strokeStyle = col; ctx.lineWidth = s * 0.17; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(-s * 0.42, -s * 0.5); ctx.lineTo(-s * 0.95, 0); ctx.lineTo(-s * 0.42, s * 0.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s * 0.42, -s * 0.5); ctx.lineTo(s * 0.95, 0); ctx.lineTo(s * 0.42, s * 0.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s * 0.16, -s * 0.62); ctx.lineTo(-s * 0.16, s * 0.62); ctx.stroke();
      ctx.restore();
    },
    check(x, y, s, col, lw) {
      ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = lw || s * 0.3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(x - s * 0.75, y + s * 0.02); ctx.lineTo(x - s * 0.2, y + s * 0.55); ctx.lineTo(x + s * 0.8, y - s * 0.55); ctx.stroke(); ctx.restore();
    },
    cross(x, y, s, col, lw) {
      ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = lw || s * 0.3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x - s * 0.6, y - s * 0.6); ctx.lineTo(x + s * 0.6, y + s * 0.6); ctx.moveTo(x + s * 0.6, y - s * 0.6); ctx.lineTo(x - s * 0.6, y + s * 0.6); ctx.stroke(); ctx.restore();
    },
    shield(x, y, s, col, ink = '#0A1628') {
      ctx.save(); ctx.translate(x, y); ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.82, -s * 0.66); ctx.lineTo(s * 0.82, -s * 0.05);
      ctx.quadraticCurveTo(s * 0.8, s * 0.72, 0, s); ctx.quadraticCurveTo(-s * 0.8, s * 0.72, -s * 0.82, -s * 0.05);
      ctx.lineTo(-s * 0.82, -s * 0.66); ctx.closePath(); ctx.fill();
      MV.icon.check(0, 0, s * 0.5, ink, s * 0.17); ctx.restore();
    },
    warn(x, y, s, col) {
      ctx.save(); ctx.translate(x, y); ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 1.05, s * 0.8); ctx.lineTo(-s * 1.05, s * 0.8); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#1A1203'; ctx.fillRect(-s * 0.1, -s * 0.38, s * 0.2, s * 0.68); circle(0, s * 0.55, s * 0.12); ctx.fill();
      ctx.restore();
    }
  };

  /** Role/node badge: glow, dashed orbit, rotating arcs, gradient disc, icon. k = appear progress 0..1. */
  MV.badge = (x, y, r, col, icon, k, t, boost = 0) => {
    if (k <= 0) return;
    const s = E.oB(k);
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.globalAlpha *= clamp(k * 2);
    glow(0, 0, r * 2.8, col, 0.32 + 0.3 * boost);
    ctx.save(); ctx.rotate(t * 0.4); ctx.strokeStyle = rgba(col, 0.5); ctx.lineWidth = 2; ctx.setLineDash([10, 14]); circle(0, 0, r * 1.45); ctx.stroke(); ctx.restore();
    ctx.save(); ctx.rotate(-t * (0.7 + boost * 1.5)); ctx.strokeStyle = rgba(col, 0.95); ctx.lineWidth = 3.5; ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(0, 0, r * 1.2, i * 2.094, i * 2.094 + 1.15); ctx.stroke(); }
    ctx.restore();
    const g = ctx.createRadialGradient(0, -r * 0.45, r * 0.1, 0, 0, r);
    g.addColorStop(0, MV.mixc(col, '#0A1628', 0.5)); g.addColorStop(1, '#0A1628');
    ctx.fillStyle = g; circle(0, 0, r); ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 22; ctx.stroke(); ctx.shadowBlur = 0;
    if (icon) icon(0, 0, r * 0.46, '#FFFFFF');
    ctx.restore();
  };

  /** Rotated stamp ("GO", "DONE") that slams in at t0. */
  MV.stamp = (x, y, label, col, t, t0, o = {}) => {
    if (t < t0) return;
    const ks = E.oX(seg(t, t0, t0 + 0.22)), sc = lerp(2.5, 1, ks), w = o.w || 116, h = o.h || 68;
    glow(x, y, 150, col, 0.6 * Math.exp(-(t - t0) * 4));
    ctx.save(); ctx.translate(x, y); ctx.rotate(o.rot ?? -0.2); ctx.scale(sc, sc); ctx.globalAlpha *= clamp(ks * 3);
    ctx.fillStyle = 'rgba(8,30,20,0.9)'; rr(-w / 2, -h / 2, w, h, 12); ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = col; ctx.stroke();
    text(label, 0, h * 0.28, { font: `700 ${o.size || 54}px ${MV.FONT.head}`, color: col, align: 'center', ls: '4px' });
    ctx.restore();
  };

  // ------------------------------------------------------------------ copy layouts
  /** 16:9 lower third: eyebrow, big title (mask reveal), item row separated by diamonds. */
  MV.lowerThird = (t, t0, t1, o) => {
    if (t < t0 || t > t1) return;
    const col = o.color || MV.C.gold, x = o.x ?? 120, H = MV.H;
    const yE = o.yEyebrow ?? H * 0.735, yT = o.yTitle ?? H * 0.832, yS = o.ySub ?? H * 0.887, size = o.titleSize || 94;
    const out = E.i(seg(t, t1 - 0.4, t1));
    ctx.save(); ctx.globalAlpha *= 1 - out; ctx.translate(-out * 60, 0);
    const bh = (yS + 14 - yE + 30) * E.oX(seg(t, t0, t0 + 0.5));
    ctx.fillStyle = col; ctx.fillRect(x - 34, yS + 14 - bh, 5, bh); glow(x - 32, yS + 14 - bh, 30, col, 0.7);
    const ke = E.oX(seg(t, t0 + 0.05, t0 + 0.6));
    text(o.eyebrow || '', x + (1 - ke) * -40, yE, { font: `600 24px ${MV.FONT.head}`, color: col, ls: '6px', alpha: ke });
    const kt = E.oX(seg(t, t0 + 0.12, t0 + 0.8)), fs = fitFont(o.title, 700, size, MV.W - x - 120, MV.FONT.head, '3px', 48);
    ctx.save(); ctx.beginPath(); ctx.rect(x - 10, yE + 4, MV.W, yT - yE + 30); ctx.clip();
    text(o.title, x, yT + (1 - kt) * (fs + 26), { font: `700 ${fs}px ${MV.FONT.head}`, color: MV.C.ink, ls: '3px', glow: 24, glowColor: rgba(col, 0.55) });
    ctx.restore();
    let cx = x; const f = `400 31px ${MV.FONT.body}`;
    (o.items || []).forEach((it, i) => {
      const k = E.oX(seg(t, t0 + 0.75 + i * 0.3, t0 + 1.3 + i * 0.3));
      if (i > 0) { ctx.save(); ctx.globalAlpha *= k; ctx.fillStyle = col; ctx.translate(cx + 14, yS - 10); ctx.rotate(Math.PI / 4); ctx.fillRect(-4, -4, 8, 8); ctx.restore(); cx += 30; }
      text(it, cx, yS + (1 - k) * 16, { font: f, color: MV.C.ink2, alpha: k });
      cx += measure(it, f) + 16;
    });
    ctx.restore();
  };
  /** 9:16 copy block: centred, top third (inside platform safe zone), items stacked one per line. */
  MV.textBlock = (t, t0, t1, o) => {
    if (t < t0 || t > t1) return;
    const col = o.color || MV.C.gold, cx = o.cx ?? MV.W / 2, top = o.top ?? 300, maxW = o.maxW ?? 900;
    const out = E.i(seg(t, t1 - 0.4, t1));
    ctx.save(); ctx.globalAlpha *= 1 - out; ctx.translate(0, -out * 30);
    const ke = E.oX(seg(t, t0, t0 + 0.6));
    ctx.fillStyle = col; ctx.fillRect(cx - 36 * ke, top, 72 * ke, 4); glow(cx, top + 2, 60, col, 0.6 * ke);
    text(o.eyebrow || '', cx, top + 52 + (1 - ke) * -16, { font: `600 26px ${MV.FONT.head}`, color: col, ls: '6px', align: 'center', alpha: ke });
    const kt = E.oX(seg(t, t0 + 0.1, t0 + 0.8)), fs = fitFont(o.title, 700, o.titleMax || 96, maxW, MV.FONT.head, '3px');
    ctx.save(); ctx.beginPath(); ctx.rect(0, top + 58, MV.W, fs + 22); ctx.clip();
    text(o.title, cx, top + 60 + fs * 0.92 + (1 - kt) * (fs + 20), { font: `700 ${fs}px ${MV.FONT.head}`, color: MV.C.ink, ls: '3px', align: 'center', glow: 24, glowColor: rgba(col, 0.55) });
    ctx.restore();
    const isz = o.itemSize || 36, f = `400 ${isz}px ${MV.FONT.body}`, y0 = top + 60 + fs + 50;
    (o.items || []).forEach((it, i) => {
      const k = E.oX(seg(t, t0 + 0.7 + i * 0.3, t0 + 1.25 + i * 0.3)), y = y0 + i * (isz + 16) + (1 - k) * 16, w = measure(it, f);
      ctx.save(); ctx.globalAlpha *= k; ctx.fillStyle = col; ctx.translate(cx - w / 2 - 22, y - isz * 0.33); ctx.rotate(Math.PI / 4); ctx.fillRect(-5, -5, 10, 10); ctx.restore();
      text(it, cx + 8, y, { font: f, color: MV.C.ink2, alpha: k, align: 'center' });
    });
    ctx.restore();
  };
  /** Darkening band behind the copy zone so text reads over busy frames. */
  MV.copyBand = (a, y0, y1) => {
    if (a <= 0) return;
    const band = ctx.createLinearGradient(0, y0, 0, y1);
    band.addColorStop(0, 'rgba(2,6,15,0.55)'); band.addColorStop(0.8, 'rgba(2,6,15,0.35)'); band.addColorStop(1, 'rgba(2,6,15,0)');
    ctx.save(); ctx.globalAlpha = clamp(a); ctx.fillStyle = band; ctx.fillRect(0, y0, MV.W, y1 - y0); ctx.restore();
  };
  /** Beat-timed headline: parts [{ text, color, t }]; layout 'row' (16:9) or 'stack' (9:16). */
  MV.headline = (t, parts, o = {}) => {
    const a = o.fadeOut ? 1 - seg(t, o.fadeOut[0], o.fadeOut[1]) : 1;
    if (!parts.length || t < parts[0].t || a <= 0) return;
    const size = o.size || 78, f = `700 ${size}px ${MV.FONT.head}`;
    ctx.save(); ctx.globalAlpha *= a;
    if (o.layout === 'stack') {
      parts.forEach((p, i) => {
        const k = seg(t, p.t, p.t + 0.3); if (k <= 0) return;
        const s = lerp(1.3, 1, E.oX(k));
        ctx.save(); ctx.translate(o.cx ?? MV.W / 2, (o.y ?? 390) + i * (o.lineH || size * 1.15)); ctx.scale(s, s);
        text(p.text, 0, 0, { font: f, color: p.color || '#FFFFFF', align: 'center', alpha: clamp(k * 3), glow: 30, glowColor: rgba(p.glow || p.color || '#5A8CFF', 0.7) });
        ctx.restore();
      });
    } else {
      const gap = o.gap || 38, ws = parts.map(p => measure(p.text, f)), tot = ws.reduce((s, v) => s + v, 0) + gap * (parts.length - 1);
      let x = (o.cx ?? MV.W / 2) - tot / 2;
      parts.forEach((p, i) => {
        const k = seg(t, p.t, p.t + 0.3);
        if (k > 0) {
          const s = lerp(1.3, 1, E.oX(k));
          ctx.save(); ctx.translate(x + ws[i] / 2, o.y ?? MV.H * 0.815); ctx.scale(s, s);
          text(p.text, 0, 0, { font: f, color: p.color || '#FFFFFF', align: 'center', alpha: clamp(k * 3), glow: 30, glowColor: rgba(p.glow || p.color || '#5A8CFF', 0.7) });
          ctx.restore();
        }
        x += ws[i] + gap;
      });
    }
    ctx.restore();
  };

  // ------------------------------------------------------------------ brand + endings
  MV.img = {};
  MV.loadImages = map => Promise.all(Object.entries(map || {}).filter(([, u]) => u).map(([k, url]) => new Promise((res, rej) => {
    const i = new Image(); i.onload = () => { MV.img[k] = i; res(); }; i.onerror = () => rej(new Error('image failed: ' + url)); i.src = url;
  })));
  /** Brand files are read-only inputs: draw them as images (optionally cropped); never retype a wordmark as live text. */
  MV.drawImageFit = (img, crop, cx, cy, w, o = {}) => {
    const [sx, sy, sw, sh] = crop || [0, 0, img.width, img.height], h = w * sh / sw;
    ctx.save(); if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha; if (o.blur > 0.3) ctx.filter = `blur(${o.blur.toFixed(1)}px)`;
    ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, sx, sy, sw, sh, cx - w / 2, cy - h / 2, w, h); ctx.restore();
  };
  let LOGO_TMP = null;
  /**
   * White end card: wide logo reveal (blur + scale), light sweep, divider, coloured role row, tagline lines.
   * o = { logo, crop, blend, t0, width, cy, shine:[a,b], roles:[{label,color}], rolesT, lines:[{text, weight, color}], linesT, dur }
   */
  MV.endCard = (t, o) => {
    const W = MV.W, H = MV.H, portrait = H > W, t0 = o.t0;
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(-60, -60, W + 120, H + 120);
    const b1 = ctx.createRadialGradient(W * 0.12, H * 0.88, 0, W * 0.12, H * 0.88, 900); b1.addColorStop(0, 'rgba(22,82,224,0.10)'); b1.addColorStop(1, 'rgba(22,82,224,0)');
    ctx.fillStyle = b1; ctx.fillRect(0, 0, W, H);
    const b2 = ctx.createRadialGradient(W * 0.88, H * 0.12, 0, W * 0.88, H * 0.12, 800); b2.addColorStop(0, rgba(o.accent || '#178C35', 0.09)); b2.addColorStop(1, rgba(o.accent || '#178C35', 0));
    ctx.fillStyle = b2; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(15,31,53,0.07)';
    for (let x = 60; x < W; x += 60) for (let y = 60; y < H; y += 60) ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    const cx = W / 2, cy = o.cy ?? (portrait ? H * 0.427 : H * 0.42), lwBase = o.width ?? (portrait ? 880 : 1040);
    const k = E.oX(seg(t, t0 + 0.05, t0 + 1.3)), drift = seg(t, t0 + 1.3, o.dur ?? t0 + 4) * 0.025, s = lerp(1.16, 1, k) + drift;
    if (o.logo) {
      const [sx, sy, sw, sh] = o.crop || [0, 0, o.logo.width, o.logo.height];
      // cap the height too: squarer logos (mark + wordmark stacked) must not grow into the role/tagline rows
      const maxH = o.maxH ?? (portrait ? H * 0.14 : H * 0.24), fitW = Math.min(lwBase, maxH * sw / sh);
      const lw = Math.round(fitW), lh = Math.round(fitW * sh / sw);
      if (!LOGO_TMP || LOGO_TMP.width !== lw) { LOGO_TMP = document.createElement('canvas'); LOGO_TMP.width = lw; LOGO_TMP.height = lh; }
      const tg = LOGO_TMP.getContext('2d');
      tg.globalCompositeOperation = 'copy'; tg.imageSmoothingQuality = 'high'; tg.drawImage(o.logo, sx, sy, sw, sh, 0, 0, lw, lh);
      const ks = o.shine ? seg(t, o.shine[0], o.shine[1]) : 0;
      if (ks > 0 && ks < 1) {
        tg.globalCompositeOperation = 'source-atop';
        const px = lerp(-300, lw + 300, E.io(ks)), lg = tg.createLinearGradient(px - 140, 0, px + 140, 0);
        lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,0.7)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
        tg.save(); tg.setTransform(1, 0, -0.35, 1, 0, 0); tg.fillStyle = lg; tg.fillRect(px - 200, 0, 400 + lh, lh); tg.restore();
      }
      tg.globalCompositeOperation = 'source-over';
      ctx.save(); ctx.globalAlpha = clamp(seg(t, t0 + 0.05, t0 + 0.5) * 1.2);
      const bl = (1 - k) * 15; if (bl > 0.3) ctx.filter = `blur(${bl.toFixed(1)}px)`;
      if (o.blend) ctx.globalCompositeOperation = o.blend; // opaque logo on paper: 'multiply' on the white card
      ctx.drawImage(LOGO_TMP, cx - lw * s / 2, cy - lh * s / 2, lw * s, lh * s); ctx.filter = 'none'; ctx.restore();
    }
    const yD = cy + (portrait ? 145 : 173), kd = E.oX(seg(t, t0 + 0.6, t0 + 1.4)), dw = 600 * kd;
    const dg = ctx.createLinearGradient(cx - dw / 2, 0, cx + dw / 2, 0);
    dg.addColorStop(0, 'rgba(15,31,53,0)'); dg.addColorStop(0.5, 'rgba(15,31,53,0.22)'); dg.addColorStop(1, 'rgba(15,31,53,0)');
    ctx.fillStyle = dg; ctx.fillRect(cx - dw / 2, yD, dw, 2);
    const roles = o.roles || [], rf = `600 ${portrait ? 30 : 33}px ${MV.FONT.head}`, rls = portrait ? '5px' : '7px', gap = portrait ? 34 : 52;
    const ws = roles.map(r => measure(r.label, rf, rls) + 26), tot = ws.reduce((a, b) => a + b, 0) + gap * Math.max(0, roles.length - 1);
    let x = cx - tot / 2; const yR = yD + 72, rT = o.rolesT ?? t0 + 0.9;
    roles.forEach((r, i) => {
      const kk = E.oX(seg(t, rT + i * 0.1, rT + 0.6 + i * 0.1));
      ctx.save(); ctx.globalAlpha = kk; ctx.fillStyle = r.color; circle(x + 7, yR + (1 - kk) * 16 - 10, 7); ctx.fill(); ctx.restore();
      text(r.label, x + 26, yR + (1 - kk) * 16, { font: rf, color: '#0F1F35', ls: rls, alpha: kk });
      x += ws[i] + gap;
    });
    const lT = o.linesT ?? t0 + 1.3, lsz = portrait ? 38 : 33;
    (o.lines || []).forEach((l, i) => {
      const kk = E.oX(seg(t, lT + i * 0.18, lT + 0.7 + i * 0.18));
      text(l.text, cx, yR + 70 + i * (lsz + 16) + (1 - kk) * 14, { font: `${l.weight || 400} ${lsz}px ${MV.FONT.body}`, color: l.color || '#51627C', align: 'center', alpha: kk });
    });
  };
  /** Circular reveal: draws outside(), then inside() clipped to a growing circle with a tri-colour ring edge. */
  MV.iris = (t, t0, dur, cx, cy, outside, inside, cols = ['#27487E', '#1652E0', '#1FA045']) => {
    const k = E.io(seg(t, t0, t0 + dur)), R = k * Math.hypot(MV.W, MV.H) * 0.75 + 8;
    outside();
    glow(cx, cy, 300 * (1 - k) + 40, '#FFFFFF', 1 - k);
    ctx.save(); circle(cx, cy, R); ctx.clip(); inside(); ctx.restore();
    const lw = 26 * (1 - k) + 4, rot = k * 1.6;
    ctx.save(); ctx.lineWidth = lw;
    cols.forEach((c, i) => { ctx.strokeStyle = c; ctx.beginPath(); ctx.arc(cx, cy, R + lw / 2, rot + i * 2 * Math.PI / cols.length + 0.08, rot + (i + 1) * 2 * Math.PI / cols.length - 0.08); ctx.stroke(); });
    ctx.restore();
  };
  /** Horizontal slice displacement + red wash; call last in the frame during short glitch windows. */
  MV.glitch = (f, strength = 1) => {
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (let s = 0; s < 7; s++) {
      const y = Math.floor(hash(f * 7.1 + s) * MV.H), h = 8 + Math.floor(hash(f * 3.9 + s * 2) * 70), dx = (hash(f * 5.3 + s * 3) - 0.5) * 120 * strength;
      ctx.drawImage(cv, 0, y, MV.W, h, dx, y, MV.W, h);
    }
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.08 * strength; ctx.fillStyle = MV.C.red; ctx.fillRect(0, 0, MV.W, MV.H);
    ctx.restore();
  };
  MV.shake = (f, amp) => [amp * (hash(f * 1.37) - 0.5) * 2, amp * (hash(f * 2.11 + 5) - 0.5) * 2];

  // ------------------------------------------------------------------ boot
  MV.boot = ({ canvas, images = {}, fonts = [], fx = {}, prepare, draw, fps = 60 }) => {
    MV.init(canvas || document.getElementById('c'));
    const frame = t => {
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
      draw(t, Math.round(t * fps));
      return true;
    };
    window.__ready = (async () => {
      await MV.loadImages(images);
      const probe = 'Đội ngũ ỘẬ ĐĂNG ký';
      for (const fnt of [`700 40px ${MV.FONT.head}`, `600 40px ${MV.FONT.head}`, `400 40px ${MV.FONT.body}`, `500 20px ${MV.FONT.mono}`, ...fonts]) await document.fonts.load(fnt, probe);
      MV.prepareFx(fx);
      if (prepare) await prepare();
      frame(0);
      return true;
    })();
    window.renderFrame = frame;
  };
})();
