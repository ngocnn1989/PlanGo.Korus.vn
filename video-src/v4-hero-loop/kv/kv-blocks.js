/* KV tier-2 blocks. Each draws around the origin inside env.box ({x, y, w, h}); the runtime already applied
 * position, enter/exit, keyframes, idle motion and opacity. Colours accept theme names (ink, a1..a6, card...).
 * Text blocks call env.note(...) before drawing glyphs so `kv lint` can measure overlap, size and contrast.
 */
(function () {
  'use strict';
  const { clamp, lerp, E, hash } = MV;
  const D = KV.define, col = (c, fb) => KV.col(c, fb);
  const TAU = Math.PI * 2;
  const pool = {};
  function scratch(key, w, h) { // reusable offscreen canvas (no per-frame allocation)
    w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
    let c = pool[key]; if (!c || c.width < w || c.height < h) { c = pool[key] = document.createElement('canvas'); c.width = w; c.height = h; }
    const g = c.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, c.width, c.height);
    return [c, g];
  }
  KV.scratch = scratch;
  const star = (ctx, x, y, r, n = 5, inner = 0.45, rot = -Math.PI / 2) => {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) { const a = rot + i * Math.PI / n, rr = i % 2 ? r * inner : r; i ? ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath();
  };
  const heart = (ctx, x, y, r) => {
    ctx.beginPath(); ctx.moveTo(x, y + r * 0.9);
    ctx.bezierCurveTo(x - r * 1.5, y - r * 0.1, x - r * 0.7, y - r * 1.2, x, y - r * 0.45);
    ctx.bezierCurveTo(x + r * 0.7, y - r * 1.2, x + r * 1.5, y - r * 0.1, x, y + r * 0.9); ctx.closePath();
  };
  KV.path = { star, heart };
  // readable ink on a filled colour: white or near-black, whichever has more WCAG contrast
  KV.onColor = fill => { const c = /^#[0-9a-f]{6}$/i.test(fill) ? [1, 3, 5].map(i => parseInt(fill.slice(i, i + 2), 16) / 255) : [0, 0, 0];
    const L = c.map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)), Y = 0.2126 * L[0] + 0.7152 * L[1] + 0.0722 * L[2];
    return (1.05 / (Y + 0.05)) >= ((Y + 0.05) / 0.0625) ? '#FFFFFF' : '#141A26'; };
  // any CSS colour -> [r, g, b] (canvas parser); '#rrggbb' fast path
  const rgbOf = c => { if (/^#[0-9a-f]{6}$/i.test(c)) { const n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
    const g = KV._pc2 || (KV._pc2 = document.createElement('canvas').getContext('2d')); g.fillStyle = '#000'; g.fillStyle = c; const s = g.fillStyle;
    if (s[0] === '#') { const n = parseInt(s.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; } const m = s.match(/[\d.]+/g); return m ? m.slice(0, 3).map(Number) : [0, 0, 0]; };
  const parseHex = c => rgbOf(c).join(',');
  KV.rgbOf = rgbOf;
  // smooth 2-D value noise in -1..1 (bilinear smoothstep over a hashed lattice); pure
  const noise2 = (x, y, s = 0) => { const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), h = (a, b) => hash(a * 57.13 + b * 113.71 + s * 7.77);
    return lerp(lerp(h(i, j), h(i + 1, j), u), lerp(h(i, j + 1), h(i + 1, j + 1), u), v) * 2 - 1; };
  KV.noise2 = noise2;

  // ------------------------------------------------------------------ backgrounds (cat bg, full frame)
  let STEEL = null;
  D('bg', {
    cat: 'bg', at: 'full', enter: 'none',
    draw(ctx, P, env) {
      const { W, H, t, theme: th } = env, u = env.u, cs = (P.colors || th.bg).map(c => col(c));
      ctx.save(); ctx.translate(-W / 2, -H / 2); // bg draws in canvas coordinates
      const style = P.style || th.bgStyle, spd = P.speed ?? 1;
      const radial = (c0, c1, c2) => { const g = ctx.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, Math.hypot(W, H) * 0.62); g.addColorStop(0, c0); g.addColorStop(0.55, c1); g.addColorStop(1, c2 || c1); ctx.fillStyle = g; ctx.fillRect(-80, -80, W + 160, H + 160); };
      switch (style) {
        case 'flat': ctx.fillStyle = cs[0]; ctx.fillRect(-80, -80, W + 160, H + 160); break;
        case 'gradient': { const a = (P.angle ?? 90) * Math.PI / 180, dx = Math.cos(a) * W / 2, dy = Math.sin(a) * H / 2, g = ctx.createLinearGradient(W / 2 - dx, H / 2 - dy, W / 2 + dx, H / 2 + dy); cs.forEach((c, i) => g.addColorStop(i / Math.max(1, cs.length - 1), c)); ctx.fillStyle = g; ctx.fillRect(-80, -80, W + 160, H + 160); break; }
        case 'soft': {
          radial(cs[0], cs[1], cs[2]);
          const acc = (P.blobs || th.accents).map(c => col(c));
          for (let i = 0; i < (P.n ?? 6); i++) {
            const x = (0.1 + hash(i + 3) * 0.8) * W + Math.sin(t * 0.25 * spd + i * 1.7) * 60 * u, y = (0.1 + hash(i + 17) * 0.8) * H + Math.cos(t * 0.21 * spd + i) * 50 * u;
            MV.glow(x, y, (260 + hash(i + 40) * 260) * u, acc[i % acc.length], 0.16);
          }
          break;
        }
        case 'sunburst': {
          radial(cs[0], cs[1], cs[2]);
          const n = P.rays ?? 18, rot = t * 0.12 * spd, R = Math.hypot(W, H), c = P.ray ? col(P.ray) : 'rgba(255,255,255,0.32)';
          const cx = (P.center || [0.5, 0.45])[0] * W, cy = (P.center || [0.5, 0.45])[1] * H;
          ctx.fillStyle = c;
          for (let i = 0; i < n; i++) { const a = rot + i * TAU / n; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, a, a + TAU / n / 2); ctx.closePath(); ctx.fill(); }
          const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.55); g.addColorStop(0, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(-80, -80, W + 160, H + 160);
          break;
        }
        case 'dots': case 'grid': case 'paper': {
          radial(cs[0], cs[1], cs[2]);
          const s = (P.spacing ?? (style === 'dots' ? 90 : 60)) * u, ox = (t * 18 * spd) % s, oy = (t * 12 * spd) % s;
          ctx.fillStyle = P.dot ? col(P.dot) : style === 'dots' ? 'rgba(255,255,255,0.55)' : 'rgba(15,31,53,0.08)';
          ctx.strokeStyle = 'rgba(15,31,53,0.06)'; ctx.lineWidth = 1;
          // the lattice continues over the 80 px margin (camera pan / roll / shake). The in-frame drawing is the original one;
          // grid: in-frame lines clipped to the frame + a fresh lattice clipped to the margin ring (no double-drawn crossings);
          // dots: the margin adds only the lattice points the frame loop does not draw (by index, each dot drawn once)
          const m = 80, j0 = -Math.ceil(m / s) - 1, nx = Math.ceil((W + 2 * m) / s) + 3, ny = Math.ceil((H + 2 * m) / s) + 3;
          if (style === 'grid') {
            ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
            ctx.beginPath(); for (let x = ox - s; x < W + s; x += s) { ctx.moveTo(x, 0); ctx.lineTo(x, H); } for (let y = oy - s; y < H + s; y += s) { ctx.moveTo(0, y); ctx.lineTo(W, y); } ctx.stroke(); ctx.restore();
            ctx.save(); ctx.beginPath(); ctx.rect(-m, -m, W + 2 * m, H + 2 * m); ctx.rect(0, 0, W, H); ctx.clip('evenodd'); ctx.beginPath();
            for (let j = j0; j < j0 + nx; j++) { ctx.moveTo(ox + j * s, -m); ctx.lineTo(ox + j * s, H + m); } for (let j = j0; j < j0 + ny; j++) { ctx.moveTo(-m, oy + j * s); ctx.lineTo(W + m, oy + j * s); } ctx.stroke(); ctx.restore();
          } else {
            const r = style === 'dots' ? 9 * u : 2 * u, mx = Math.ceil((W + s - ox) / s) + 1, my = Math.ceil((H + s - oy) / s) + 1; // frame loop: indices 0 .. mx-1 / my-1 (from ox - s)
            for (let x = ox - s; x < W + s; x += s) for (let y = oy - s; y < H + s; y += s) { MV.circle(x + ((y / s | 0) % 2) * s / 2, y, r); ctx.fill(); }
            for (let i = j0; i < j0 + nx; i++) for (let j = j0; j < j0 + ny; j++) { const x = ox + i * s, y = oy + j * s; if (x < -m - s || x > W + m + s || y < -m - r || y > H + m + r) continue;
              const a = i + 1, b = j + 1; if (a >= 0 && a < mx && b >= 0 && b < my && ox + (a - 1) * s < W + s && oy + (b - 1) * s < H + s) continue; // drawn by the frame loop
              MV.circle(x + ((y / s | 0) % 2) * s / 2, y, r); ctx.fill(); }
          }
          break;
        }
        case 'night': case 'sky': {
          // default sky = built-in top colour -> theme bg[1] (it used to add a second pair of stops at 0 / 1, which only changed the
          // pad colours: the theme bg showed in the margin above the frame and a pale blue below it once a camera revealed them)
          const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, P.colors == null ? (style === 'night' ? '#0B1640' : '#6EC6FF') : cs[0]); g.addColorStop(1, cs[1] || cs[0]);
          ctx.fillStyle = g; ctx.fillRect(-80, -80, W + 160, H + 160);
          if (style === 'night') for (let i = 0; i < (P.n ?? 70); i++) { const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * (1 + hash(i) * 2) + i)); ctx.fillStyle = `rgba(255,255,255,${a * 0.9})`; MV.circle(hash(i + 5) * W, hash(i + 9) * H * 0.8, (1 + hash(i + 2) * 2.2) * u); ctx.fill(); }
          else if (KV.illus && KV.illus.cloud) for (let i = 0; i < (P.n ?? 5); i++) { const w = (220 + hash(i + 7) * 200) * u, x = ((hash(i + 1) * (W + w * 2) + t * (10 + hash(i) * 14) * spd) % (W + w * 2)) - w, y = (0.08 + hash(i + 4) * 0.5) * H; ctx.save(); ctx.translate(x, y); ctx.globalAlpha *= 0.9; if (KV.illusStyle) KV.illusStyle({}, w, env); KV.illus.cloud(ctx, w, { t, env, P: {} }); ctx.restore(); } // own style: never the last drawn illus'
          break;
        }
        case 'mesh': { // mesh gradient: 4 colour points drifting on slow orbits, coordinates warped by 2-octave noise; computed
          // on a 128-px-wide grid and smoothed up bilinearly (cheap, pure in t and render order; grain dithers banding)
          const gw = 128, gh = Math.max(16, Math.round(128 * H / W)), [cv, g] = scratch('mesh', gw, gh), id = g.createImageData(gw, gh), d = id.data, asp = W / H;
          const cc = (P.colors && P.colors.length >= 3 ? P.colors : [th.bg[0], th.accents[0], th.accents[1], th.bg[1]]).map(c => rgbOf(col(c)));
          const pts = cc.map((_, i) => [0.5 + 0.36 * Math.cos(t * 0.11 * spd * (1 + i * 0.13) + i * 1.9), 0.5 + 0.36 * Math.sin(t * 0.09 * spd * (1 + i * 0.17) + i * 2.7)]);
          const wp = P.warp ?? 0.2, tt = t * 0.04 * spd;
          for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
            let u = x / (gw - 1), v = y / (gh - 1);
            const nu = noise2(u * 2 + tt, v * 2, 1) + 0.5 * noise2(u * 4 - tt, v * 4, 2), nv = noise2(u * 2, v * 2 + tt, 3) + 0.5 * noise2(u * 4, v * 4 - tt, 4);
            u += wp * nu; v += wp * nv;
            let sw = 0, r = 0, gg = 0, bb = 0;
            pts.forEach((p, i) => { const q = 1 / Math.pow(((u - p[0]) * asp) ** 2 + (v - p[1]) ** 2 + 0.015, 1.6); sw += q; r += q * cc[i][0]; gg += q * cc[i][1]; bb += q * cc[i][2]; });
            const o = (y * gw + x) * 4; d[o] = r / sw; d[o + 1] = gg / sw; d[o + 2] = bb / sw; d[o + 3] = 255;
          }
          g.putImageData(id, 0, 0); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low'; ctx.drawImage(cv, 0, 0, gw, gh, -80, -80, W + 160, H + 160); // bilinear: 'high' (cubic) differed by 1 LSB with render order
          break;
        }
        case 'steel': {
          if (!STEEL || STEEL.width !== W || STEEL.key !== cs.join()) { // keyed by size and colours: same texture in any frame order
            STEEL = document.createElement('canvas'); STEEL.width = W; STEEL.height = H; STEEL.key = cs.join(); const g = STEEL.getContext('2d');
            const lg = g.createLinearGradient(0, 0, 0, H); lg.addColorStop(0, cs[0]); lg.addColorStop(0.6, cs[1]); lg.addColorStop(1, cs[2] || cs[1]); g.fillStyle = lg; g.fillRect(0, 0, W, H);
            for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(255,255,255,${0.012 + hash(i) * 0.03})`; g.fillRect(hash(i + 1) * W - 200, hash(i + 2) * H, 200 + hash(i + 3) * 700, 1 + (hash(i + 4) > 0.8)); }
          }
          // margin: edge columns / rows / corner pixels stretched over 80 px (+2 px under the texture, which covers them exactly)
          for (const [sx, sy, sw, sh, dx, dy, dw, dh] of [[0, 0, 1, H, -80, 0, 82, H], [W - 1, 0, 1, H, W - 2, 0, 82, H], [0, 0, W, 1, 0, -80, W, 82], [0, H - 1, W, 1, 0, H - 2, W, 82],
            [0, 0, 1, 1, -80, -80, 82, 82], [W - 1, 0, 1, 1, W - 2, -80, 82, 82], [0, H - 1, 1, 1, -80, H - 2, 82, 82], [W - 1, H - 1, 1, 1, W - 2, H - 2, 82, 82]]) ctx.drawImage(STEEL, sx, sy, sw, sh, dx, dy, dw, dh);
          ctx.drawImage(STEEL, 0, 0); break;
        }
        default: { // tech
          const cam = { ax: W / 2, ay: H / 2 }, cm = { x: W / 2 + t * 6 * spd, y: H / 2, z: 1 };
          MV.background(t, cm, cam, { margin: 80, pulse: env.pulse * (P.pulse ?? 1), top: cs[0], mid: cs[1], edge: cs[2], bokeh: P.bokeh ?? 24 });
        }
      }
      ctx.restore();
    }
  });
  // bg layers are drawn with the origin at the canvas centre (pos [0.5, 0.5] of zone 'full')

  // ------------------------------------------------------------------ text
  const STYLE = {
    display: { px: { h: 190, f: 168, v: 176 }, head: true }, title: { px: { h: 112, f: 96, v: 104 }, head: true },
    headline: { px: { h: 84, f: 76, v: 82 }, head: true }, subtitle: { px: { h: 54, f: 50, v: 54 }, w: 600 },
    body: { px: { h: 40, f: 40, v: 44 }, w: 400 }, caption: { px: { h: 42, f: 42, v: 46 }, w: 600 },
    label: { px: { h: 30, f: 30, v: 32 }, w: 600 }, eyebrow: { px: { h: 28, f: 28, v: 30 }, w: 700, upper: true, ls: 6, color: 'a1' }
  };
  KV.TEXT_STYLE = STYLE;
  const LAY = new Map();
  function parseRuns(s) { // "Say *hello*!" -> words of segments [{s, acc}]
    const words = []; let acc = false, cur = [], buf = '';
    const flush = () => { if (buf) { cur.push({ s: buf, acc }); buf = ''; } };
    for (const ch of String(s).normalize('NFC')) { // NFC: decomposed accents (pasted from macOS) stay on their letter
      if (ch === '*') { flush(); acc = !acc; continue; }
      if (/\s/.test(ch)) { flush(); if (cur.length) { words.push(cur); cur = []; } continue; }
      buf += ch;
    }
    flush(); if (cur.length) words.push(cur);
    return words;
  }
  function measureText(ctx, str, font, ls) { ctx.font = font; ctx.letterSpacing = ls + 'px'; return ctx.measureText(str).width; }
  function layout(ctx, P, env, px0) {
    const st = STYLE[P.style || 'headline'] || STYLE.headline, A = env.A;
    // animated weight / tracking (arrays) are laid out at their widest state: lines never reflow while they animate
    const fam = P.font || (st.head ? 'head' : 'body'), weight = Array.isArray(P.weight) ? Math.max(...P.weight) : P.weight || (st.head ? env.theme.headW : st.w || 600);
    const upper = P.upper ?? st.upper, ls = Array.isArray(P.track) ? Math.max(...P.track) * px0 : P.ls ?? st.ls ?? 0;
    const src = [].concat(P.text ?? '').map(s => upper ? String(s).toUpperCase() : String(s));
    const maxW = env.box.w, maxLines = P.maxLines ?? (Array.isArray(P.text) ? src.length : 3), lineH = P.lineH ?? 1.12;
    const key = [src.join('\n'), px0, maxW, fam, weight, ls, maxLines, lineH].join('|');
    if (LAY.has(key)) return LAY.get(key);
    let px = px0, lines;
    const minPx = P.minPx ?? px0 * 0.5, keep = P.keepLines ?? (st.head ? 0.72 : 1); // big type: one line per paragraph down to 72 % size first
    for (let pass = maxLines > src.length ? 0 : 1; pass < 2; pass++) for (px = px0; ; px = Math.floor(px * 0.95)) {
      if (pass === 0 && px < px0 * keep) break;
      const font = KV.font(fam, weight, px), sp = measureText(ctx, ' ', font, ls);
      lines = [];
      for (const para of src) {
        let line = [], lw = 0;
        for (const w of parseRuns(para)) {
          const ww = w.reduce((a, g) => a + measureText(ctx, g.s, font, ls), 0);
          if (line.length && lw + sp + ww > maxW) { lines.push({ words: line, w: lw }); line = []; lw = 0; }
          line.push({ segs: w, w: ww }); lw += (line.length > 1 ? sp : 0) + ww;
        }
        lines.push({ words: line, w: lw });
      }
      const widest = Math.max(...lines.map(l => l.w));
      if ((lines.length <= (pass === 0 ? src.length : maxLines) && widest <= maxW) || (pass === 1 && px <= minPx)) { const r = { px, font, sp, lines, lineH, ls, h: lines.length * px * lineH, w: Math.min(maxW, widest) }; LAY.set(key, r); return r; }
    }
  }
  KV.textLayout = layout;
  // scramble glyph for char ch at slot i: changes 15 times a second, from the same class (digit / lower / upper+symbols)
  const SCR = ['0123456789', 'abcdefghijkmnopqrstuvwxyz', 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#%&'];
  const scrGlyph = (ch, i, lt) => { const set = SCR[/\d/.test(ch) ? 0 : ch !== ch.toUpperCase() ? 1 : 2]; return set[Math.floor(hash(i * 13.1 + Math.floor(lt * 15)) * set.length)]; };
  const TEXT_REVEALS = ['words', 'letters', 'type', 'mask', 'scramble'];
  D('text', {
    cat: 'copy', enter: 'up', reveals: TEXT_REVEALS,
    enterDur(P, type) {
      const s = [].concat(P.text ?? '').join(' '), n = KVC.words(s).length, c = s.replace(/[*\s]/g, '').length;
      // enter { type: 'words', per: beats }: one word per `per` beats, each word landing on its beat (linear by default)
      if (type === 'words' && P.enter && P.enter.per != null) return KV.T(P.enter.per) * (s.replace(/\*/g, '').split(/\s+/).filter(Boolean).length + 1);
      return type === 'words' ? 0.25 + n * 0.12 : type === 'letters' ? 0.2 + c * 0.035 : type === 'type' ? c * 0.045 : type === 'mask' ? 0.7 : type === 'scramble' ? 0.3 + c * 0.05 : null;
    },
    draw(ctx, P, env) {
      const st = STYLE[P.style || 'headline'] || STYLE.headline;
      const px0 = P.px != null ? KV.R(P.px) : KV.R(st.px) || 60;
      // track: [fromEm, toEm] letter-spacing opening over the hold; weight: [from, to] (variable font) — both laid out at
      // their widest state so lines never reflow while they animate
      const wA = Array.isArray(P.weight) ? P.weight : null, tA = Array.isArray(P.track) ? P.track : null;
      const L = layout(ctx, P, env, px0), { px, lines, lineH } = L;
      let { font, sp, ls } = L, LW = null; // LW: current line widths while weight / tracking animate (the cached layout stays untouched)
      if (wA || tA) {
        const fam = P.font || (st.head ? 'head' : 'body'), life = Math.max(0.5, env.sc.dur - env.T(P.in));
        const wk = wA ? E.io(clamp((env.lt - env.T(P.weightAt ?? 0)) / env.T(P.weightDur ?? '0.6s'))) : 0;
        if (wA) font = KV.font(fam, Math.round(lerp(wA[0], wA[1], wk)), px);
        if (tA) ls = lerp(tA[0], tA[1], Math.sin(Math.PI / 2 * clamp(env.lt / life))) * px;
        sp = measureText(ctx, ' ', font, ls);
        LW = lines.map(ln => ln.words.reduce((a, w) => a + w.segs.reduce((b, g) => b + measureText(ctx, g.s, font, ls), 0), 0) + sp * Math.max(0, ln.words.length - 1));
      }
      const mk = P.markerIn != null ? E.o(clamp((env.lt - env.T(P.markerIn)) / 0.4)) : 1; // marker bar wipes in after the line lands
      const align = P.align || (env.P.at === 'copy' && env.A === 'h' ? 'left' : 'center');
      const ink = col(P.color || st.color || 'ink'), acc = col(P.accent || 'a1');
      const ay = (P.anchor || [0.5, 0.5])[1], y0 = -ay * L.h;
      const bx = align === 'left' ? env.box.x : align === 'right' ? env.box.x + env.box.w - L.w : -L.w / 2;
      const outW = P.outline === true ? px * 0.12 : P.outline || 0, outC = col(P.outlineColor || (P.outline ? 'white' : null) || '#FFFFFF');
      if (P.bg) { // pill / box behind the text block
        const pad = (P.pad ?? 0.45) * px, r = P.bg === 'box' ? px * 0.2 : L.h / (lines.length || 1) / 2 + pad;
        ctx.save(); ctx.fillStyle = col(P.bgColor || 'card');
        if (P.shadow !== false) { ctx.shadowColor = env.theme.shadow; ctx.shadowBlur = px * 0.5; ctx.shadowOffsetY = px * 0.12; }
        MV.rr(bx - pad, y0 - pad * 0.7, L.w + pad * 2, L.h + pad * 1.2, r); ctx.fill(); ctx.restore();
      }
      env.note({ text: [].concat(P.text).join(' '), x: bx, y: y0, w: L.w, h: L.h, px, color: ink, outline: outW ? outC : null, outlineW: outW });
      const nW = lines.reduce((a, l) => a + l.words.length, 0), chars = lines.reduce((a, l) => a + l.words.reduce((b, w) => b + w.segs.reduce((c, g) => c + [...g.s].length, 0), 0), 0);
      const rt = env.revealType, rv = env.reveal;
      ctx.font = font; ctx.letterSpacing = ls + 'px'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
      if (P.shadow && !P.bg) { ctx.shadowColor = env.theme.shadow; ctx.shadowBlur = px * 0.18; ctx.shadowOffsetY = px * 0.06; }
      let wi = 0, ci = 0;
      lines.forEach((ln, li) => {
        const lnw = LW ? LW[li] : ln.w;
        let x = align === 'left' ? env.box.x : align === 'right' ? env.box.x + env.box.w - lnw : -lnw / 2;
        const y = y0 + (li + 0.8) * px * lineH - (lineH - 1) * px * 0.5;
        ctx.save();
        if (rt === 'mask') { const k = E.oX(clamp(rv * (lines.length + 1) - li)); ctx.beginPath(); ctx.rect(-env.W, y - px * 1.05, env.W * 2, px * 1.35); ctx.clip(); ctx.translate(0, (1 - k) * px * 1.2); }
        for (const w of ln.words) {
          const kw = rt === 'words' ? clamp(rv * (nW + 1) - wi) : 1;
          for (const g of w.segs) {
            const gw = measureText(ctx, g.s, font, ls);
            const draw = (str, gx, a, dy, sc) => {
              if (a <= 0.01) return;
              ctx.save(); ctx.globalAlpha *= a; ctx.translate(gx, y + dy); if (sc !== 1) ctx.scale(sc, sc);
              if (g.acc && P.accentStyle === 'marker' && mk > 0) {
                const mw = measureText(ctx, str, font, ls) + px * 0.24;
                ctx.save(); ctx.fillStyle = acc; MV.rr(-px * 0.12, -px * 0.86, mw * mk, px * 1.08, px * 0.2); ctx.fill(); ctx.restore();
                if (mk >= 1 && str.length > 1 && a >= 1) env.note({ text: str, x: 0, y: -px * 0.78, w: mw - px * 0.24, h: px * 0.95, px, color: g.acc && P.markerInk ? col(P.markerInk) : ink }); // contrast on the bar
              }
              if (outW) { ctx.save(); ctx.shadowColor = 'transparent'; ctx.strokeStyle = outC; ctx.lineWidth = outW * 2; ctx.strokeText(str, 0, 0); ctx.restore(); }
              if (g.acc && P.accentStyle === 'marker' && P.markerInk && mk < 1) { // bar still wiping in: accent ink outside it, markerInk inside it
                ctx.fillStyle = acc; ctx.fillText(str, 0, 0);
                if (mk > 0) { ctx.save(); ctx.beginPath(); ctx.rect(-px * 0.12, -px * 0.86, (measureText(ctx, str, font, ls) + px * 0.24) * mk, px * 1.08); ctx.clip(); ctx.fillStyle = col(P.markerInk); ctx.fillText(str, 0, 0); ctx.restore(); }
                ctx.restore(); return;
              }
              ctx.fillStyle = g.acc && P.accentStyle !== 'marker' ? acc : (g.acc && P.markerInk ? col(P.markerInk) : ink); ctx.fillText(str, 0, 0); ctx.restore();
            };
            if (rt === 'letters' || rt === 'type' || rt === 'scramble') {
              let gx = x;
              for (const ch of g.s) {
                const cw = measureText(ctx, ch, font, ls);
                if (rt === 'scramble') { // glyphs cycle 3 slots ahead of the resolving edge, then lock left -> right
                  const d = rv * (chars + 3) - ci, s = d >= 1 ? ch : scrGlyph(ch, ci, env.lt);
                  if (d > -3) draw(s, s === ch ? gx : gx + (cw - measureText(ctx, s, font, ls)) / 2, 1, 0, 1);
                } else {
                  const kc = rt === 'type' ? (rv * chars > ci ? 1 : 0) : clamp(rv * (chars + 4) / 4 - ci / 4);
                  draw(ch, gx, kc, rt === 'letters' ? (1 - E.oB(kc)) * px * 0.4 : 0, 1);
                }
                gx += cw; ci++;
              }
            } else draw(g.s, x, rt === 'words' ? clamp(kw * 2) : 1, rt === 'words' ? (1 - E.oB(kw)) * px * 0.35 : 0, rt === 'words' ? lerp(0.85, 1, E.oB(kw)) : 1);
            x += gw;
          }
          x += sp; wi++;
        }
        if (rt === 'type' && rv < 1 && ci <= rv * chars + 1 && Math.floor(env.lt * 3) % 2 === 0) { ctx.fillStyle = acc; ctx.fillRect(x - sp + px * 0.05, y - px * 0.8, px * 0.08, px * 0.95); }
        ctx.restore();
      });
    }
  });

  // ------------------------------------------------------------------ shapes
  // closed outlines for shape 'morph': dense polyline of a built-in shape (or { d, unit: 'box' | 'px' }) in a w x h box,
  // made clockwise, resampled to n points by arc length starting at the top; bestShift aligns the start index (cached)
  const SHP = {};
  function outline(spec, w, h, n) {
    const o = typeof spec === 'string' ? (/^\s*[Mm]/.test(spec) ? { d: spec } : { shape: spec }) : spec || {}, key = JSON.stringify(o) + `|${w | 0}|${h | 0}|${n}`;
    if (SHP[key]) return SHP[key];
    const r = Math.min(w, h) / 2, P0 = [], poly = pts => pts.forEach(p => P0.push(p)), arc = (cx, cy, rr, a0, a1, m = 24) => { for (let i = 0; i <= m; i++) { const a = lerp(a0, a1, i / m); P0.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); } };
    const s = o.shape || 'circle', rad = (o.radius ?? 0.12) * Math.min(w, h);
    if (o.d) { const px = o.unit === 'px', p = KV.pathOn(o.d, px ? 1 : w, px ? 1 : h, px ? 0 : -w / 2, px ? 0 : -h / 2); poly(p.pts); }
    else if (s === 'circle' || s === 'ellipse') for (let i = 0; i < 256; i++) { const a = -Math.PI / 2 + i / 256 * TAU; P0.push([Math.cos(a) * w / 2, Math.sin(a) * h / 2]); }
    else if (s === 'rect' || s === 'square') poly([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]);
    else if (s === 'rrect' || s === 'pill' || s === 'card') { const q = s === 'pill' ? Math.min(w, h) / 2 : rad; arc(w / 2 - q, -h / 2 + q, q, -Math.PI / 2, 0); arc(w / 2 - q, h / 2 - q, q, 0, Math.PI / 2); arc(-w / 2 + q, h / 2 - q, q, Math.PI / 2, Math.PI); arc(-w / 2 + q, -h / 2 + q, q, Math.PI, Math.PI * 1.5); }
    else if (s === 'star' || s === 'burst') { const m = o.points ?? (s === 'burst' ? 14 : 5), inr = o.inner ?? (s === 'burst' ? 0.78 : 0.45); for (let i = 0; i < m * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / m, rr = i % 2 ? r * inr : r; P0.push([Math.cos(a) * rr, Math.sin(a) * rr]); } }
    else if (s === 'polygon' || s === 'triangle') { const m = s === 'triangle' ? 3 : o.sides ?? 6; for (let i = 0; i < m; i++) { const a = -Math.PI / 2 + i * TAU / m; P0.push([Math.cos(a) * r, Math.sin(a) * r]); } }
    else if (s === 'heart') { const y = r * 0.1, rr = r * 0.72, cb = (a, c1, c2, z) => { for (let i = 1; i <= 64; i++) { const t = i / 64, u = 1 - t; P0.push([u * u * u * a[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * z[0], u * u * u * a[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * z[1]]); } };
      P0.push([0, y + rr * 0.9]); cb([0, y + rr * 0.9], [-rr * 1.5, y - rr * 0.1], [-rr * 0.7, y - rr * 1.2], [0, y - rr * 0.45]); cb([0, y - rr * 0.45], [rr * 0.7, y - rr * 1.2], [rr * 1.5, y - rr * 0.1], [0, y + rr * 0.9]); P0.pop(); }
    else if (s === 'blob') for (let i = 0; i < 256; i++) { const a = -Math.PI / 2 + i / 256 * TAU, rr = r * (1 + 0.06 * Math.sin(a * 3) + 0.04 * Math.sin(a * 5)); P0.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
    else throw new Error(`shape morph: unknown outline "${s}" (circle rect rrect pill star burst polygon triangle heart blob, or { d })`);
    let area = 0; for (let i = 0; i < P0.length; i++) { const p = P0[i], q = P0[(i + 1) % P0.length]; area += p[0] * q[1] - q[0] * p[1]; }
    if (area < 0) P0.reverse(); // clockwise on screen (y down)
    const cum = [0]; for (let i = 1; i <= P0.length; i++) { const p = P0[i - 1], q = P0[i % P0.length]; cum.push(cum[i - 1] + Math.hypot(q[0] - p[0], q[1] - p[1])); }
    let top = 0, tb = Infinity; P0.forEach((p, i) => { const a = Math.abs(Math.atan2(p[0], -p[1])); if (a < tb - 1e-9) { tb = a; top = i; } }); // start straight above the centre
    const L = cum[P0.length], out = [];
    for (let j = 0, i = 0; j < n; j++) { const s2 = (cum[top] + j / n * L) % L; while (!(cum[i] <= s2 && s2 <= cum[i + 1])) i = (i + 1) % P0.length; const p = P0[i], q = P0[(i + 1) % P0.length], f = (s2 - cum[i]) / ((cum[i + 1] - cum[i]) || 1); out.push([lerp(p[0], q[0], f), lerp(p[1], q[1], f)]); }
    return (SHP[key] = out);
  }
  const SHIFT = {};
  function bestShift(A, B, key) { // start-index offset with the least total travel (the correspondence problem, brute force once)
    if (SHIFT[key] != null) return SHIFT[key];
    const n = A.length; let best = 0, bd = Infinity;
    for (let o = 0; o < n; o++) { let d = 0; for (let i = 0; i < n; i += 2) { const q = B[(i + o) % n]; d += (A[i][0] - q[0]) ** 2 + (A[i][1] - q[1]) ** 2; } if (d < bd) { bd = d; best = o; } }
    return (SHIFT[key] = best);
  }
  KV.shapePoints = outline;
  const hexOr = (c, fb) => /^#[0-9a-f]{6}$/i.test(c) ? c : fb;
  D('shape', {
    cat: 'media', enter: 'pop', reveals: ['draw'],
    draw(ctx, P, env) {
      const b = env.box, w = b.w, h = b.h, r = Math.min(w, h) / 2, k = env.revealType === 'draw' ? env.reveal : 1;
      const fill = P.fill === false ? null : P.gradient ? (() => { const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2); P.gradient.forEach((c, i) => g.addColorStop(i / (P.gradient.length - 1), col(c))); return g; })() : col(P.fill ?? P.color ?? 'a1');
      const stroke = P.stroke ? col(P.stroke) : null, lw = (P.lw ?? 8) * env.u;
      if (P.shadow) { ctx.shadowColor = env.theme.shadow; ctx.shadowBlur = 30 * env.u; ctx.shadowOffsetY = 10 * env.u; }
      let path = null, head = null; // 'path': sampled SVG path; head = draw-on tip position
      ctx.beginPath();
      switch (P.shape || 'circle') {
        case 'path': { // d = SVG path string in layer px around the origin (unit 'px', default) or 0..1 of the box (unit 'box')
          const bx = P.unit === 'box'; path = KV.pathOn(P.d, bx ? w : 1, bx ? h : 1, bx ? b.x : 0, bx ? b.y : 0);
          path.trace(ctx, 0, k * path.len); if (path.closed && k >= 1) ctx.closePath(); if (k < 1) head = path.at(k * path.len); break;
        }
        case 'morph': { // from -> to (built-in outline names or { d }), morphAt (beats after in), morphDur, n points
          const n = P.n ?? 96, A0 = outline(P.from || 'circle', w, h, n), B0 = outline(P.to || 'star', w, h, n), o = bestShift(A0, B0, `${JSON.stringify([P.from, P.to])}|${w | 0}|${h | 0}|${n}`);
          const m = E.io(clamp((env.lt - env.T(P.morphAt ?? 0)) / env.T(P.morphDur ?? '0.5s')));
          A0.forEach((p, i) => { const q = B0[(i + o) % n], x = lerp(p[0], q[0], m), y = lerp(p[1], q[1], m); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); break;
        }
        case 'circle': ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, TAU * k); break;
        case 'rect': ctx.rect(b.x, b.y, w, h); break;
        case 'rrect': case 'card': ctx.roundRect(b.x, b.y, w, h, (P.radius ?? 0.12) * Math.min(w, h)); break;
        case 'pill': ctx.roundRect(b.x, b.y, w, h, Math.min(w, h) / 2); break;
        case 'ring': ctx.arc(0, 0, r - lw / 2, -Math.PI / 2, -Math.PI / 2 + TAU * k * (P.value ?? 1)); break;
        case 'star': star(ctx, 0, 0, r, P.points ?? 5, P.inner ?? 0.45); break;
        case 'heart': heart(ctx, 0, r * 0.1, r * 0.72); break;
        case 'triangle': ctx.moveTo(0, -h / 2); ctx.lineTo(w / 2, h / 2); ctx.lineTo(-w / 2, h / 2); ctx.closePath(); break;
        case 'polygon': { const n = P.sides ?? 6; for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + i * TAU / n; i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); break; }
        case 'blob': { const n = 90; for (let i = 0; i <= n; i++) { const a = i / n * TAU, rr = r * (1 + 0.06 * Math.sin(a * 3 + env.lt * 1.3) + 0.04 * Math.sin(a * 5 - env.lt * 0.9)); i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); break; }
        case 'burst': star(ctx, 0, 0, r, P.points ?? 14, P.inner ?? 0.78, -Math.PI / 2 + env.lt * 0.2); break;
        case 'line': case 'arrow': { const [x0, y0] = P.from || [b.x, 0], [x1, y1] = P.to || [b.x + w, 0]; ctx.moveTo(x0, y0); ctx.lineTo(lerp(x0, x1, k), lerp(y0, y1, k)); if (k < 1) head = [lerp(x0, x1, k), lerp(y0, y1, k)]; break; }
        case 'wave': { const n = 60; for (let i = 0; i <= n; i++) { const x = b.x + w * i / n * k, y = Math.sin(i / n * TAU * (P.cycles ?? 2) + env.lt * 3) * h * 0.4; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } break; }
      }
      const open = ['line', 'arrow', 'wave', 'ring'].includes(P.shape) || (path && !path.closed);
      if (fill && !open && (!path || k >= 1)) ctx.fillStyle = fill, ctx.fill(); // a closed path fills once it is drawn
      ctx.shadowColor = 'transparent';
      if (P.dash || P.chase) { // marching dashes (flow px/s, + = along the path) or one bright segment chasing along it
        const len = path ? path.len : P.shape === 'line' || P.shape === 'arrow' ? Math.hypot(...[0, 1].map(i => (P.to || [b.x + w, 0])[i] - (P.from || [b.x, 0])[i])) : P.shape === 'ring' ? TAU * (r - lw / 2) * (P.value ?? 1) : P.shape === 'circle' || !P.shape ? Math.PI * (w + h) / 2 : 0;
        if (P.chase && len) { const s = P.chase * len, ph = ((env.lt / env.T(P.period ?? 2)) % 1) * (len + s); ctx.setLineDash([s, len * 2 + s]); ctx.lineDashOffset = s - ph; }
        else if (P.dash) { ctx.setLineDash(P.dash.map(v => v * env.u)); ctx.lineDashOffset = -(P.flow ?? 0) * env.u * env.lt; }
      }
      if (stroke || open) { ctx.strokeStyle = stroke || fill || col('a1'); ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(); }
      if (P.dash || P.chase) ctx.setLineDash([]);
      if (P.tip && head && k > 0) MV.glow(head[0], head[1], lw * 4, hexOr(stroke || (typeof fill === 'string' ? fill : null), '#FFFFFF'), 0.9); // glowing pen tip
      if (P.shape === 'arrow' && k > 0.98) {
        const [x0, y0] = P.from || [b.x, 0], [x1, y1] = P.to || [b.x + w, 0], a = Math.atan2(y1 - y0, x1 - x0), s = lw * 2.6;
        ctx.save(); ctx.translate(x1, y1); ctx.rotate(a); ctx.fillStyle = stroke || fill; ctx.beginPath(); ctx.moveTo(s * 0.6, 0); ctx.lineTo(-s, -s); ctx.lineTo(-s * 0.5, 0); ctx.lineTo(-s, s); ctx.closePath(); ctx.fill(); ctx.restore();
      }
    }
  });

  // ------------------------------------------------------------------ photo / image
  // print treatments, computed once per (asset, look) at the image's own size (crop / focus / points stay valid):
  // duotone [dark, light] maps luminance onto two brand colours; halftone { cell px@1080, angle, color, bg } = dots on a
  // rotated grid, radius ~ sqrt(1 - luminance) (dark = big dots)
  const TREAT = {};
  function treated(img, src, P, cell) {
    const dt = Array.isArray(P.duotone) ? P.duotone : null, ht = P.halftone === true ? {} : P.halftone || null;
    const key = [src, JSON.stringify(dt), JSON.stringify(ht), cell.toFixed(1)].join('|');
    if (TREAT[key]) return TREAT[key];
    const w = img.width, h = img.height, c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'), Y = d => (0.299 * d[0] + 0.587 * d[1] + 0.114 * d[2]) / 255;
    if (!ht) { // duotone
      g.drawImage(img, 0, 0); const id = g.getImageData(0, 0, w, h), d = id.data, A = rgbOf(col(dt[0])), B = rgbOf(col(dt[1]));
      for (let i = 0; i < d.length; i += 4) { const L = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255; d[i] = lerp(A[0], B[0], L); d[i + 1] = lerp(A[1], B[1], L); d[i + 2] = lerp(A[2], B[2], L); }
      g.putImageData(id, 0, 0);
    } else { // halftone: luminance from a copy downscaled to ~2 samples per cell, one dot per rotated-grid cell
      const mw = Math.max(2, Math.ceil(w / cell * 2)), mh = Math.max(2, Math.ceil(h / cell * 2)), [, sg] = scratch('halftone', mw, mh);
      sg.imageSmoothingQuality = 'high'; sg.drawImage(img, 0, 0, mw, mh); const sd = sg.getImageData(0, 0, mw, mh).data;
      const lum = (x, y) => { const i = (Math.min(mh - 1, Math.max(0, Math.floor(y / h * mh))) * mw + Math.min(mw - 1, Math.max(0, Math.floor(x / w * mw)))) * 4; return Y([sd[i], sd[i + 1], sd[i + 2]]); };
      g.fillStyle = col(ht.bg || (dt ? dt[1] : '#FFFFFF')); g.fillRect(0, 0, w, h); g.fillStyle = col(ht.color || (dt ? dt[0] : 'ink'));
      const a = (ht.angle ?? 45) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), n = Math.ceil(Math.hypot(w, h) / cell / 2) + 1;
      g.beginPath();
      for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
        const x = w / 2 + (i * ca - j * sa) * cell, y = h / 2 + (i * sa + j * ca) * cell; if (x < -cell || y < -cell || x > w + cell || y > h + cell) continue;
        const r = cell * 0.6 * Math.sqrt(1 - lum(x, y)); if (r > 0.3) { g.moveTo(x + r, y); g.arc(x, y, r, 0, TAU); }
      }
      g.fill();
    }
    return (TREAT[key] = c);
  }
  D('photo', {
    cat: 'media', enter: 'fade',
    draw(ctx, P, env) {
      let img = env.img(P.src); const b = env.box;
      if (!img) { ctx.fillStyle = 'rgba(128,128,128,0.35)'; ctx.fillRect(b.x, b.y, b.w, b.h); return; }
      if (P.duotone || P.halftone) { const a0 = (KV.SB.assets || {})[P.src] || {}, cr = P.crop || a0.crop || [0, 0, img.width, img.height]; img = treated(img, P.src, P, P.halftone ? Math.max(3, ((P.halftone.cell ?? 12) * env.u) / Math.max(b.w / cr[2], b.h / cr[3])) : 0); }
      const a = (KV.SB.assets || {})[P.src] || {}, [sx, sy, sw, sh] = P.crop || a.crop || [0, 0, img.width, img.height];
      const pts = a.points || {}, fp = typeof P.focus === 'string' ? pts[P.focus] : null;
      const focus = fp ? [(fp[0] - sx) / sw, (fp[1] - sy) / sh] : P.focus || [0.5, 0.5];
      const life = Math.max(0.5, env.sc.dur - env.T(P.in) + 0.6), kk = clamp(env.lt / life);
      const z = Array.isArray(P.zoom) ? lerp(P.zoom[0], P.zoom[1], kk) : P.zoom ?? 1;
      const pan = P.pan ? [lerp(P.pan[0][0], P.pan[1][0], kk), lerp(P.pan[0][1], P.pan[1][1], kk)] : focus;
      const fit = P.fit || 'cover', s = (fit === 'contain' ? Math.min(b.w / sw, b.h / sh) : Math.max(b.w / sw, b.h / sh)) * z;
      const dw = sw * s, dh = sh * s, q = P.anchorAt || [0.5, 0.5];
      let dx = b.x + b.w * q[0] - pan[0] * dw, dy = b.y + b.h * q[1] - pan[1] * dh;
      if (fit === 'cover') { dx = clamp(dx, b.x + b.w - dw, b.x); dy = clamp(dy, b.y + b.h - dh, b.y); }
      // publish named points (asset `points`) in canvas px so other layers can `pin` to them
      const m = ctx.getTransform();
      for (const [nm, [px, py]] of Object.entries(pts)) { const lx = dx + (px - sx) / sw * dw, ly = dy + (py - sy) / sh * dh, c = [m.a * lx + m.c * ly + m.e, m.b * lx + m.d * ly + m.f]; KV.PINS[`${P.src}:${nm}`] = KV.PINS[`${env.L.id}:${nm}`] = c; }
      const blend = P.blend ?? a.blend;
      const feather = (P.feather ?? 0) * env.u;
      if (feather > 0) {
        const [c, g] = scratch('photo', b.w, b.h);
        g.imageSmoothingQuality = 'high'; g.drawImage(img, sx, sy, sw, sh, dx - b.x, dy - b.y, dw, dh);
        g.globalCompositeOperation = 'destination-in';
        const m = (x0, y0, x1, y1) => { const lg = g.createLinearGradient(x0, y0, x1, y1); lg.addColorStop(0, 'rgba(0,0,0,0)'); lg.addColorStop(1, 'rgba(0,0,0,1)'); return lg; };
        for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [[0, 0, feather, 0, 0, 0, feather, b.h], [b.w, 0, b.w - feather, 0, b.w - feather, 0, feather, b.h], [0, 0, 0, feather, 0, 0, b.w, feather], [0, b.h, 0, b.h - feather, 0, b.h - feather, b.w, feather]]) {
          g.save(); g.beginPath(); g.rect(rx, ry, rw, rh); g.clip(); g.fillStyle = m(x0, y0, x1, y1); g.fillRect(0, 0, b.w, b.h); g.restore();
        }
        if (blend) ctx.globalCompositeOperation = blend;
        ctx.drawImage(c, 0, 0, Math.ceil(b.w), Math.ceil(b.h), b.x, b.y, Math.ceil(b.w), Math.ceil(b.h));
        return;
      }
      ctx.save();
      if (P.shadow) { ctx.save(); ctx.shadowColor = env.theme.shadow; ctx.shadowBlur = 40 * env.u; ctx.shadowOffsetY = 14 * env.u; ctx.fillStyle = col('card'); MV.rr(b.x, b.y, b.w, b.h, (P.radius ?? 0) * env.u); ctx.fill(); ctx.restore(); }
      if (P.radius || fit === 'cover') { MV.rr(b.x, b.y, b.w, b.h, (P.radius ?? 0) * env.u); ctx.clip(); }
      if (blend) ctx.globalCompositeOperation = blend;
      ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
      ctx.restore();
      if (P.tint) { ctx.fillStyle = col(P.tint); ctx.globalAlpha *= P.tintAlpha ?? 0.3; ctx.fillRect(b.x, b.y, b.w, b.h); ctx.globalAlpha /= P.tintAlpha ?? 0.3; }
      if (P.border) { ctx.strokeStyle = col(P.border); ctx.lineWidth = (P.borderW ?? 8) * env.u; MV.rr(b.x, b.y, b.w, b.h, (P.radius ?? 0) * env.u); ctx.stroke(); }
    }
  });
  // brand logo: drawn as an image, never retyped; opaque-paper logos keep their analysed blend (light cards only)
  D('logo', {
    cat: 'media', enter: 'fade', w: 0.6, h: 0.3,
    draw(ctx, P, env) {
      const key = P.src || (P.inverse ? 'logoInverse' : 'logo'), img = env.img(key); if (!img) return;
      const B = typeof BRAND !== 'undefined' ? BRAND : {}, crop = P.crop || (key === 'logo' ? B.logoWideCrop : key === 'logoInverse' ? B.logoWideInverseCrop : key === 'mark' ? B.markCrop : null) || [0, 0, img.width, img.height];
      const blend = P.blend ?? (key === 'logo' ? B.logoWideBlend : key === 'logoInverse' ? B.logoWideInverseBlend : key === 'mark' ? B.markBlend : null);
      const b = env.box, s = Math.min(b.w / crop[2], b.h / crop[3]), w = crop[2] * s, h = crop[3] * s;
      if (blend) ctx.globalCompositeOperation = blend;
      ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, crop[0], crop[1], crop[2], crop[3], -w / 2, -h / 2, w, h);
    }
  });
  D('watermark', { cat: 'ui', at: 'safe', enter: 'none', pos: [1, 0], w: 0.16, h: 0.07, anchor: [1, 0],
    draw(ctx, P, env) { ctx.globalAlpha *= P.alpha ?? 0.85; KV.blocks.logo.draw(ctx, P, env); } });

  // ------------------------------------------------------------------ fx
  D('glow', { cat: 'fx', enter: 'fade', draw(ctx, P, env) { MV.glow(0, 0, Math.min(env.box.w, env.box.h) / 2 * (1 + env.pulse * (P.pulse ?? 0.15)), col(P.color || 'a1'), P.alpha ?? 0.6); } });
  D('flash', { cat: 'ui', at: 'full', enter: 'none', draw(ctx, P, env) { const d = env.T(P.dur ?? '0.25s'), k = 1 - clamp(env.lt / d); if (k > 0) { ctx.fillStyle = col(P.color || '#FFFFFF'); ctx.globalAlpha *= k * (P.alpha ?? 0.85); ctx.fillRect(-env.W, -env.H, env.W * 2, env.H * 2); } } });
  D('shockwave', { cat: 'fx', enter: 'none', draw(ctx, P, env) {
    const d = env.T(P.dur ?? '0.7s'), k = clamp(env.lt / d); if (k >= 1) return;
    const r = Math.min(env.box.w, env.box.h) / 2 * E.o(k); ctx.strokeStyle = col(P.color || 'a1'); ctx.globalAlpha *= 1 - k; ctx.lineWidth = (P.lw ?? 16) * env.u * (1 - k) + 2; MV.circle(0, 0, r); ctx.stroke();
  } });
  D('rays', { cat: 'fx', enter: 'fade', draw(ctx, P, env) {
    const n = P.n ?? 12, R = Math.max(env.box.w, env.box.h) / 2, rot = env.lt * (P.speed ?? 0.3);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R); g.addColorStop(0, KV.col(P.color || 'rgba(255,255,255,0.7)')); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; for (let i = 0; i < n; i++) { const a = rot + i * TAU / n; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, a, a + TAU / n * 0.45); ctx.closePath(); ctx.fill(); }
  } });
  // anamorphic streak (lens flare on metal / glass / a light source): a glow sprite stretched `length` times its height,
  // a whiter inner streak and a thin bright core line; additive, so keep it short (<= 0.4 s) and alpha <= 0.5
  D('streak', { cat: 'fx', enter: 'fade', draw(ctx, P, env) {
    const r = Math.min(env.box.w, env.box.h) / 2, len = P.length ?? 6, c = hexOr(col(P.color || 'a2'), '#FFFFFF'), a = (P.alpha ?? 0.5) * (1 + env.pulse * (P.pulse ?? 0)), u = env.u;
    if (P.angle) ctx.rotate(P.angle * Math.PI / 180);
    ctx.save(); ctx.scale(len, 1); MV.glow(0, 0, r, c, a); ctx.restore();
    ctx.save(); ctx.scale(len * 0.7, 0.3); MV.glow(0, 0, r, '#FFFFFF', a * 0.7); ctx.restore();
    const g = ctx.createLinearGradient(-r * len, 0, r * len, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, `rgba(255,255,255,${Math.min(1, a * 1.6)})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(-r * len, -1.2 * u, 2 * r * len, 2.4 * u); ctx.restore();
  } });

  // particles: burst (from origin at layer in), rain / float (continuous in box), twinkle (fixed)
  D('particles', {
    cat: 'fx', enter: 'none',
    draw(ctx, P, env) {
      const type = P.type || 'confetti', mode = P.mode || (type === 'stars' ? 'twinkle' : type === 'bubbles' || type === 'dust' ? 'float' : type === 'snow' ? 'rain' : 'burst');
      const n = P.n ?? (mode === 'burst' ? 70 : 40), cs = (P.colors || env.theme.accents).map(c => col(c)), b = env.box, u = env.u, sz = (P.size ?? 1) * u, lt = env.lt, rng = env.rng;
      const shape = (i, x, y, s, rot, a) => {
        if (a <= 0.01) return;
        ctx.save(); ctx.globalAlpha *= a; ctx.translate(x, y); ctx.rotate(rot); const c = cs[i % cs.length]; ctx.fillStyle = c; ctx.strokeStyle = c;
        switch (type) {
          case 'confetti': ctx.scale(1, Math.cos(lt * 6 + i)); ctx.fillRect(-9 * s, -5 * s, 18 * s, 10 * s); break;
          case 'stars': star(ctx, 0, 0, 12 * s); ctx.fill(); break;
          case 'hearts': heart(ctx, 0, 0, 11 * s); ctx.fill(); break;
          case 'bubbles': ctx.lineWidth = 3 * s; MV.circle(0, 0, 14 * s); ctx.stroke(); ctx.globalAlpha *= 0.6; MV.circle(-5 * s, -5 * s, 3.5 * s); ctx.fillStyle = '#FFFFFF'; ctx.fill(); break;
          case 'sparks': ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = 3 * s; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-14 * s, 0); ctx.lineTo(14 * s, 0); ctx.stroke(); break;
          case 'petals': ctx.beginPath(); ctx.ellipse(0, 0, 12 * s, 6 * s, 0, 0, TAU); ctx.fill(); break;
          default: MV.circle(0, 0, 6 * s); ctx.fill();
        }
        ctx.restore();
      };
      for (let i = 0; i < n; i++) {
        const h1 = rng(i), h2 = rng(i + 101), h3 = rng(i + 202), s = sz * (0.6 + h3 * 0.8);
        if (mode === 'burst') {
          const life = env.T(P.life ?? '1.6s'), tt = lt - h3 * 0.08; if (tt < 0 || tt > life) continue;
          const spread = (P.spread ?? 360) * Math.PI / 180, ang = (P.angle ?? -90) * Math.PI / 180 + (h1 - 0.5) * spread;
          const v = (P.speed ?? 900) * u * (0.35 + h2 * 0.65), g = (P.gravity ?? 900) * u, drag = Math.exp(-tt * 1.4);
          const x = Math.cos(ang) * v * (1 - drag) / 1.4, y = Math.sin(ang) * v * (1 - drag) / 1.4 + 0.5 * g * tt * tt * 0.5;
          shape(i, x, y, s, tt * (h1 - 0.5) * 12, 1 - clamp((tt - life * 0.6) / (life * 0.4)));
        } else if (mode === 'twinkle') {
          const a = 0.5 + 0.5 * Math.sin(lt * (2 + h3 * 3) + i * 1.7);
          shape(i, b.x + h1 * b.w, b.y + h2 * b.h, s * (0.7 + 0.5 * a), 0, 0.3 + 0.7 * a);
        } else {
          const period = env.T(P.life ?? '4s'), ph = ((lt / period + h1) % 1), up = mode === 'float' ? -1 : 1;
          const y = up < 0 ? b.y + b.h * (1 - ph) : b.y + b.h * ph, x = b.x + h2 * b.w + Math.sin(lt * 1.3 + i) * 24 * u;
          shape(i, x, y, s, lt * (h3 - 0.5) * 2, Math.min(1, ph * 6, (1 - ph) * 6));
        }
      }
    }
  });

  // ------------------------------------------------------------------ cards, lists, chips, tiles, buttons, bubbles
  D('card', {
    cat: 'media', enter: 'pop',
    draw(ctx, P, env) {
      const b = env.box, r = (P.radius ?? 28) * env.u;
      if (P.glass) { // frosted panel: the scene drawn so far, blurred inside the card, tinted, thin light border + top sheen
        const o = P.glass === true ? {} : P.glass, m = ctx.getTransform(), tint = parseHex(col(o.tint || '#FFFFFF'));
        ctx.save(); MV.rr(b.x, b.y, b.w, b.h, r); ctx.clip();
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.filter = `blur(${((o.blur ?? 24) * env.u).toFixed(1)}px)`; ctx.drawImage(KV.backdrop(), 0, 0); ctx.filter = 'none'; ctx.setTransform(m);
        ctx.fillStyle = `rgba(${tint},${o.alpha ?? 0.18})`; ctx.fillRect(b.x, b.y, b.w, b.h);
        const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h * 0.5); g.addColorStop(0, 'rgba(255,255,255,0.16)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(b.x, b.y, b.w, b.h * 0.5);
        ctx.restore();
        if (o.border !== false) { ctx.save(); ctx.strokeStyle = `rgba(255,255,255,${o.borderAlpha ?? 0.45})`; ctx.lineWidth = 1.5 * env.u; MV.rr(b.x, b.y, b.w, b.h, r); ctx.stroke(); ctx.restore(); }
      } else {
        ctx.save();
        if (P.shadow !== false) { ctx.shadowColor = env.theme.shadow; ctx.shadowBlur = 40 * env.u; ctx.shadowOffsetY = 14 * env.u; }
        ctx.fillStyle = col(P.fill || 'card'); MV.rr(b.x, b.y, b.w, b.h, r); ctx.fill(); ctx.restore();
      }
      if (P.stroke) { ctx.strokeStyle = col(P.stroke); ctx.lineWidth = (P.lw ?? 6) * env.u; MV.rr(b.x, b.y, b.w, b.h, r); ctx.stroke(); }
      if (P.strip) { ctx.save(); MV.rr(b.x, b.y, b.w, b.h, r); ctx.clip(); ctx.fillStyle = col(P.strip); ctx.fillRect(b.x, b.y, b.w, (P.stripH ?? 14) * env.u); ctx.restore(); }
      KV.blocks.group.draw(ctx, P, env);
    }
  });
  D('list', {
    cat: 'copy', enter: 'none',
    draw(ctx, P, env) {
      const items = P.items || [], px = P.px ?? KV.R(STYLE[P.style || 'body'].px), gap = (P.gap ?? 0.55) * px, step = env.T(P.step ?? 0.5), b = env.box;
      const lay = items.map(it => layout(ctx, Object.assign({}, P, { text: it, style: P.style || 'body', maxLines: 2 }), Object.assign({}, env, { box: Object.assign({}, b, { w: b.w - px * 1.4 }) }), px));
      const tot = lay.reduce((a, l) => a + l.h, 0) + gap * (items.length - 1);
      let y = -(P.anchor || [0.5, 0.5])[1] * tot;
      items.forEach((it, i) => {
        const k = E.oX(clamp((env.lt - i * step) / 0.45)), l = lay[i];
        if (k > 0) {
          ctx.save(); ctx.globalAlpha *= clamp(k * 1.5); ctx.translate((1 - k) * -40 * env.u, 0);
          const bc = col(P.bullet === 'check' ? 'a3' : P.bulletColor || 'a1');
          ctx.save(); ctx.translate(b.x + px * 0.4, y + px * 0.55);
          if (P.bullet === 'check') MV.icon.check(0, 0, px * 0.38, bc, px * 0.12);
          else if (P.bullet === 'number') { ctx.fillStyle = bc; MV.circle(0, 0, px * 0.42); ctx.fill(); MV.text(String(i + 1), 0, px * 0.17, { font: KV.font('head', 800, px * 0.5), color: '#FFFFFF', align: 'center' }); }
          else { ctx.rotate(Math.PI / 4); ctx.fillStyle = bc; ctx.fillRect(-px * 0.14, -px * 0.14, px * 0.28, px * 0.28); }
          ctx.restore();
          const sub = Object.assign({}, env, { box: { x: b.x + px * 1.1, y: 0, w: b.w - px * 1.4, h: 0 }, revealType: null, reveal: 1 });
          ctx.translate(0, y + l.h / 2);
          KV.blocks.text.draw(ctx, Object.assign({}, P, { text: it, style: P.style || 'body', align: 'left', anchor: [0, 0.5], maxLines: 2, px }), sub);
          ctx.restore();
        }
        y += l.h + gap;
      });
    }
  });
  D('chips', {
    cat: 'copy', enter: 'none', h: 0.2,
    draw(ctx, P, env) {
      const items = P.items || [], px = P.px ?? 30 * env.u, font = KV.font('body', 700, px), pad = px * 0.7, gap = px * 0.5, step = env.T(P.step ?? 0.25), b = env.box;
      ctx.font = font; const ws = items.map(s => ctx.measureText(s).width + pad * 2), rows = [[]]; let rw = 0;
      ws.forEach((w, i) => { if (rows[rows.length - 1].length && rw + w > b.w) { rows.push([]); rw = 0; } rows[rows.length - 1].push(i); rw += w + gap; });
      const hh = px * 1.9, tot = rows.length * hh + (rows.length - 1) * gap;
      rows.forEach((row, ri) => {
        const rwid = row.reduce((a, i) => a + ws[i], 0) + gap * (row.length - 1);
        let x = P.align === 'left' ? b.x : -rwid / 2; const y = -tot / 2 + ri * (hh + gap);
        for (const i of row) {
          const k = E.oB(clamp((env.lt - i * step) / 0.4));
          if (k > 0) {
            ctx.save(); ctx.translate(x + ws[i] / 2, y + hh / 2); ctx.scale(k, k);
            ctx.fillStyle = col(P.fill || 'card'); MV.rr(-ws[i] / 2, -hh / 2, ws[i], hh, hh / 2); ctx.fill();
            if (P.stroke !== false) { ctx.strokeStyle = col(P.stroke || 'a1'); ctx.lineWidth = 3 * env.u; ctx.stroke(); }
            env.note({ text: items[i], x: -ws[i] / 2 + pad, y: -px * 0.6, w: ws[i] - pad * 2, h: px * 1.2, px, color: col(P.color || 'ink') });
            MV.text(items[i], 0, px * 0.36, { font, color: col(P.color || 'ink'), align: 'center' });
            ctx.restore();
          }
          x += ws[i] + gap;
        }
      });
    }
  });
  // numbers follow the storyboard language: SB.lang 'vi…' -> 1.000 / 12,5 (vi-VN); any other or no lang -> 1,000 / 12.5 (en-US,
  // as before). Override: layer `locale: 'en-US'` (any BCP 47 tag), or SB.locale for the whole video. KV.fmtNum is shared
  // with blocks/chart.js.
  KV.numLocale = P => (P && P.locale) || KV.SB.locale || (/^vi/i.test(String(KV.SB.lang || '')) ? 'vi-VN' : 'en-US');
  KV.fmtNum = (v, d = 0, P) => v.toLocaleString(KV.numLocale(P), { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmt = KV.fmtNum;
  D('tiles', {
    cat: 'copy', enter: 'none',
    draw(ctx, P, env) {
      const it = P.items || [], n = it.length, cols = P.cols ?? (env.A === 'h' ? n : Math.min(n, 2)), rows = Math.ceil(n / cols), b = env.box, gap = 28 * env.u;
      const tw = (b.w - gap * (cols - 1)) / cols, th = Math.min((b.h - gap * (rows - 1)) / rows, tw * 0.8), y0 = -(rows * th + (rows - 1) * gap) / 2, step = env.T(P.step ?? 0.5);
      it.forEach((o, i) => {
        const cx = b.x + (i % cols) * (tw + gap) + tw / 2, cy = y0 + Math.floor(i / cols) * (th + gap) + th / 2;
        const k = clamp((env.lt - i * step) / 0.5), kc = E.o(clamp((env.lt - i * step) / 1.2)); if (k <= 0) return;
        ctx.save(); ctx.translate(cx, cy + (1 - E.oX(k)) * 40 * env.u); ctx.globalAlpha *= clamp(k * 2);
        ctx.fillStyle = col(P.fill || 'card'); ctx.shadowColor = env.theme.shadow; ctx.shadowBlur = 30 * env.u; MV.rr(-tw / 2, -th / 2, tw, th, 24 * env.u); ctx.fill(); ctx.shadowColor = 'transparent';
        ctx.fillStyle = col(o.color || P.accent || 'a1'); ctx.fillRect(-tw / 2 + 24 * env.u, -th / 2, 60 * env.u, 8 * env.u);
        const val = typeof o.value === 'number' ? (o.prefix || '') + fmt(o.value * kc, o.decimals || 0, o.locale ? o : P) + (o.suffix || '') : String(o.value);
        const vpx = Math.min(th * 0.42, KV.textLayout(ctx, { text: val, style: 'title', maxLines: 1 }, Object.assign({}, env, { box: { x: 0, y: 0, w: tw * 0.85, h: 0 } }), th * 0.42).px);
        env.note({ text: val, x: -tw * 0.42, y: -th * 0.28, w: tw * 0.84, h: vpx, px: vpx, color: col(o.color || P.accent || 'a1') });
        MV.text(val, 0, -th * 0.02, { font: KV.font('head', env.theme.headW, vpx), color: col(o.color || P.accent || 'a1'), align: 'center' });
        const lpx = Math.min(th * 0.14, 34 * env.u);
        env.note({ text: o.label, x: -tw * 0.45, y: th * 0.12, w: tw * 0.9, h: lpx * 1.2, px: lpx, color: col('ink2') });
        MV.text(o.label || '', 0, th * 0.25, { font: KV.font('body', 600, lpx), color: col('ink2'), align: 'center' });
        ctx.restore();
      });
    }
  });
  D('counter', {
    cat: 'copy', enter: 'pop',
    draw(ctx, P, env) {
      const k = E.o(clamp(env.lt / env.T(P.count ?? '1.2s'))), v = (P.prefix || '') + fmt((P.from ?? 0) + (P.value - (P.from ?? 0)) * k, P.decimals || 0, P) + (P.suffix || '');
      if (P.tabular || P.roll) return digits(ctx, P, env, (P.from ?? 0) + (P.value - (P.from ?? 0)) * k);
      KV.blocks.text.draw(ctx, Object.assign({}, P, { text: v, style: P.style || 'display', maxLines: 1 }), Object.assign({}, env, { revealType: null }));
    }
  });
  // counter `tabular` (every digit in a cell as wide as '0': no jitter while counting) and `roll` (odometer: each digit column
  // scrolls; a column turns over while the columns to its right pass 9 -> 0; leading columns fade in as they are reached).
  // Size comes from the final value's layout, so the block never grows while it counts.
  function digits(ctx, P, env, val) {
    const dec = P.decimals || 0, pre = P.prefix || '', suf = P.suffix || '', st = STYLE[P.style || 'display'] || STYLE.display;
    const px0 = P.px != null ? KV.R(P.px) : KV.R(st.px) || 60, fin = pre + fmt(P.value, dec, P) + suf;
    const L = layout(ctx, Object.assign({}, P, { text: fin, style: P.style || 'display', maxLines: 1, weight: null }), env, px0), px = L.px;
    ctx.font = L.font; ctx.letterSpacing = L.ls + 'px'; ctx.textBaseline = 'alphabetic';
    const dw = ctx.measureText('0').width, str = P.roll ? fin : pre + fmt(val, dec, P) + suf, cw = ch => /\d/.test(ch) ? dw : ctx.measureText(ch).width;
    const tw = [...str].reduce((a, ch) => a + cw(ch), 0), align = P.align || (env.P.at === 'copy' && env.A === 'h' ? 'left' : 'center');
    let x = align === 'left' ? env.box.x : align === 'right' ? env.box.x + env.box.w - tw : -tw / 2;
    const y = px * 0.36, ink = col(P.color || st.color || 'ink');
    env.note({ text: P.roll ? fin : str, x, y: -px * 0.62, w: tw, h: px * 1.2, px, color: ink });
    ctx.fillStyle = ink;
    const V = Math.round(Math.abs(val) * 10 ** dec * 1e6) / 1e6, chars = [...str], nd = chars.filter(c => /\d/.test(c)).length, lh = px * 1.15;
    // per digit column (i = 0 units): shown digit q, roll fraction f, alpha (a leading column appears while its first digit rolls in)
    let di = 0; const col0 = chars.map(ch => { if (!/\d/.test(ch)) return null; const i = nd - 1 - di++, p10 = 10 ** i, q = Math.floor(V / p10) % 10, low = V - Math.floor(V / p10) * p10;
      const f = i === 0 ? V - Math.floor(V) : clamp(low - (p10 - 1)); return { q, f, a: i > 0 && V < p10 ? f : 1 }; });
    chars.forEach((ch, j) => {
      const w = cw(ch), c = col0[j];
      if (!P.roll || !c) { // separators inside the number follow the next digit column's visibility
        const nx = P.roll ? col0.slice(j + 1).find(Boolean) : null, a = nx && col0.slice(0, j).some(Boolean) ? nx.a : 1;
        if (a > 0.01) { ctx.save(); ctx.globalAlpha *= a; ctx.fillText(ch, x + (w - ctx.measureText(ch).width) / 2, y); ctx.restore(); } x += w; return;
      }
      if (c.a > 0.01) {
        ctx.save(); ctx.beginPath(); ctx.rect(x - 2, y - px * 0.95, w + 4, px * 1.2); ctx.clip(); ctx.globalAlpha *= c.a;
        for (const [dgt, oy] of [[c.q, -c.f * lh], [(c.q + 1) % 10, (1 - c.f) * lh]]) if (Math.abs(oy) < lh) { const s = String(dgt); ctx.fillText(s, x + (w - ctx.measureText(s).width) / 2, y + oy); }
        ctx.restore();
      }
      x += w;
    });
  }
  D('button', {
    cat: 'ui', enter: 'pop', w: 0.8, h: 0.14,
    draw(ctx, P, env) {
      const px = P.px ?? 40 * env.u, font = KV.font('head', env.theme.headW, px); ctx.font = font;
      const tw = ctx.measureText(P.text || P.label || '').width, w = Math.min(env.box.w, tw + px * 3.2), h = px * 2.2, p = 1 + 0.035 * Math.sin(env.lt * Math.PI / env.beat);
      ctx.save(); ctx.scale(p, p);
      MV.glow(0, 0, w * 0.7, col(P.fill || 'a1'), 0.25 + 0.15 * Math.sin(env.lt * 3));
      ctx.fillStyle = col(P.fill || 'a1'); ctx.shadowColor = env.theme.shadow; ctx.shadowBlur = 24 * env.u; ctx.shadowOffsetY = 8 * env.u; MV.rr(-w / 2, -h / 2, w, h, h / 2); ctx.fill(); ctx.shadowColor = 'transparent';
      env.note({ text: P.text || P.label, x: -tw / 2, y: -px * 0.6, w: tw, h: px * 1.2, px, color: (P.color ? col(P.color) : KV.onColor(col(P.fill || 'a1'))) });
      MV.text(P.text || P.label || '', 0, px * 0.36, { font, color: (P.color ? col(P.color) : KV.onColor(col(P.fill || 'a1'))), align: 'center' });
      ctx.restore();
    }
  });
  D('bubble', {
    cat: 'copy', enter: 'pop', reveals: TEXT_REVEALS,
    draw(ctx, P, env) {
      const px = P.px ?? KV.R(STYLE[P.style || 'subtitle'].px), sub = Object.assign({}, env, { box: Object.assign({}, env.box, { w: env.box.w * 0.84 }) });
      const L = layout(ctx, Object.assign({ style: 'subtitle', maxLines: 3 }, P), sub, px), pad = px * 0.7, w = L.w + pad * 2, h = L.h + pad * 1.4;
      const tail = P.tail || 'bottom-left', tx = tail.includes('left') ? -w * 0.28 : tail.includes('right') ? w * 0.28 : 0, down = tail.startsWith('bottom');
      ctx.save(); ctx.fillStyle = col(P.fill || 'card'); ctx.shadowColor = env.theme.shadow; ctx.shadowBlur = 30 * env.u; ctx.shadowOffsetY = 10 * env.u;
      MV.rr(-w / 2, -h / 2, w, h, Math.min(h / 2, px * 1.1)); ctx.fill();
      ctx.beginPath(); const yb = down ? h / 2 - 2 : -h / 2 + 2, yt = down ? h / 2 + px * 0.9 : -h / 2 - px * 0.9;
      ctx.moveTo(tx - px * 0.5, yb); ctx.lineTo(tx + (tail.includes('left') ? -px * 0.6 : px * 0.6), yt); ctx.lineTo(tx + px * 0.5, yb); ctx.closePath(); ctx.fill(); ctx.restore();
      KV.blocks.text.draw(ctx, Object.assign({ style: 'subtitle', maxLines: 3 }, P, { px, bg: null }), sub);
    }
  });
  D('progress', {
    cat: 'ui', enter: 'fade', at: 'top', h: 0.2,
    draw(ctx, P, env) {
      const n = P.n ?? 5, i = P.i ?? 1, r = (P.r ?? 12) * env.u, gap = r * 3.2;
      for (let j = 0; j < n; j++) { const x = (j - (n - 1) / 2) * gap, on = j < i; ctx.fillStyle = col(on ? (P.color || 'a1') : 'muted'); ctx.globalAlpha *= on ? 1 : 0.5; MV.circle(x, 0, j === i - 1 ? r * (1.25 + 0.15 * env.pulse) : r); ctx.fill(); ctx.globalAlpha /= on ? 1 : 0.5; }
    }
  });
})();
