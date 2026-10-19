/* KV runtime — draws a storyboard (SB) frame by frame on top of lib/engine.js (MV).
 * Page order: engine.js, kv-core.js, kv-runtime.js, kv-blocks.js, kv-illus.js, kv-presets.js, brand.js, storyboard.js,
 * then KV.boot(SB). Same storyboard for every canvas size: zones + per-aspect values ({ h, f, v, s }).
 * Block contract: KV.define(kind, { cat, at, enter, draw(ctx, P, env) }) — draw around the origin, box = env.box.
 */
(function () {
  'use strict';
  const KV = (window.KV = window.KV || {});
  const { clamp, lerp, E } = MV;
  KV.blocks = KV.blocks || {};
  KV.define = (kind, def) => { KV.blocks[kind] = Object.assign({ cat: 'media' }, def); return kind; };
  const RANK = { bg: 0, media: 1, fx: 2, copy: 4, ui: 5 };
  const CAM_CATS = { bg: 1, media: 1, fx: 1 };
  let SB, TL, A, W, H, U, Z, TH, ctx, PROBE = null, PULSE = () => 0, BUF = null;
  let RM = false, DRY = null, LDEPTH = 0; // RM: SB.motion 'reduced' · DRY: measure-only pass (motion blur / smear) · layer-buffer depth
  const LBUF = [];

  // ------------------------------------------------------------------ themes
  const FONT = {
    round: '"Segoe UI Black", "Arial Rounded MT Bold", "Nunito", "Noto Sans", Arial, sans-serif',
    head: MV.FONT.head, body: MV.FONT.body, mono: MV.FONT.mono
  };
  KV.THEMES = {
    dark: { bg: ['#0F2650', '#071532', '#02060F'], ink: '#EAF2FF', ink2: '#A9BBD6', muted: '#62789A', card: '#0F1F35', cardInk: '#EAF2FF',
      accents: ['#FFB21E', '#22D3EE', '#3B82F6', '#22C55E', '#FF4D5E', '#A78BFA'], head: FONT.head, headW: 700, body: FONT.body,
      bgStyle: 'tech', grain: 0.2, vignette: 0.62, scrim: 'rgba(2,6,15,0.78)', outline: null, shadow: 'rgba(0,0,0,0.45)' },
    bright: { bg: ['#FFF8EA', '#FFE7C2', '#FFD9A0'], ink: '#1D2B53', ink2: '#44557F', muted: '#8C96B2', card: '#FFFFFF', cardInk: '#1D2B53',
      accents: ['#FF5A5F', '#FFB400', '#12B886', '#3D7BFF', '#9B5DE5', '#FF8A3D'], head: FONT.round, headW: 900, body: FONT.body,
      bgStyle: 'soft', grain: 0.05, vignette: 0, scrim: 'rgba(255,248,234,0.86)', outline: null, shadow: 'rgba(29,43,83,0.18)' },
    light: { bg: ['#FFFFFF', '#F2F5FA', '#E4EAF3'], ink: '#0F1F35', ink2: '#51627C', muted: '#8A97AB', card: '#FFFFFF', cardInk: '#0F1F35',
      accents: ['#1652E0', '#1FA045', '#F5A623', '#E5484D', '#0EA5E9', '#7C3AED'], head: FONT.head, headW: 700, body: FONT.body,
      bgStyle: 'paper', grain: 0.06, vignette: 0, scrim: 'rgba(255,255,255,0.86)', outline: null, shadow: 'rgba(15,31,53,0.14)' },
    steel: { bg: ['#2A3038', '#171B21', '#0B0D10'], ink: '#F2F4F7', ink2: '#B8C0CC', muted: '#6B7684', card: '#1C2129', cardInk: '#F2F4F7',
      accents: ['#FFB21E', '#FF6B2C', '#38BDF8', '#22C55E', '#EF4444', '#EAB308'], head: FONT.head, headW: 700, body: FONT.body,
      bgStyle: 'steel', grain: 0.22, vignette: 0.6, scrim: 'rgba(8,10,13,0.8)', outline: null, shadow: 'rgba(0,0,0,0.5)' }
  };
  KV.FONT = FONT;
  function theme(spec) {
    const o = typeof spec === 'string' ? { base: spec } : Object.assign({}, spec || {});
    const base = KV.THEMES[o.base || 'dark'];
    if (!base) throw new Error(`unknown theme "${o.base}" (${Object.keys(KV.THEMES).join(', ')})`);
    return Object.assign({}, base, o);
  }
  // colour names: ink ink2 muted card cardInk bg a1..a6 (accents), white, black, or any CSS colour
  KV.col = (c, fb) => {
    if (c == null) return fb ?? TH.ink;
    if (typeof c !== 'string') return c;
    const m = /^a(\d)$/.exec(c); if (m) return TH.accents[(+m[1] - 1) % TH.accents.length];
    if (c === 'bg') return TH.bg[0];
    return TH[c] && typeof TH[c] === 'string' && c !== 'head' && c !== 'body' ? TH[c] : c;
  };
  KV.font = (fam, w, px) => `${w} ${Math.round(px)}px ${fam === 'head' || !fam ? TH.head : fam === 'body' ? TH.body : FONT[fam] || fam}`;

  // ------------------------------------------------------------------ zones (canvas px: x, y, w, h)
  function zones() {
    const r = (x, y, w, h) => ({ x, y, w, h });
    const full = r(0, 0, W, H);
    if (A === 'h') return { full, safe: r(96, 64, W - 192, H - 128), stage: r(160, 110, W - 320, H - 220), copy: r(120, 150, 800, 780),
      visual: r(980, 90, 860, 900), top: r(160, 70, W - 320, 170), lower: r(200, H - 250, W - 400, 170), center: r(W / 2 - 500, H / 2 - 300, 1000, 600) };
    if (A === 'v') return { full, safe: r(60, 230, 880, 1290), stage: r(70, 300, 880, 1180), copy: r(70, 250, 880, 430),
      visual: r(50, 700, 900, 800), top: r(70, 250, 880, 200), lower: r(70, 1290, 860, 210), center: r(90, 560, 860, 800) };
    if (A === 'f') return { full, safe: r(60, 60, W - 120, H - 120), stage: r(70, 90, W - 140, H - 180), copy: r(60, 60, W - 120, 400),
      visual: r(60, 470, W - 120, 820), top: r(70, 60, W - 140, 170), lower: r(80, H - 230, W - 160, 170), center: r(90, 275, W - 180, 800) };
    return { full, safe: r(60, 60, W - 120, H - 120), stage: r(70, 80, W - 140, H - 160), copy: r(60, 60, W - 120, 330),
      visual: r(60, 400, W - 120, 620), top: r(70, 60, W - 140, 150), lower: r(80, H - 220, W - 160, 160), center: r(90, 190, W - 180, 700) };
  }
  KV.zone = name => { const z = Z[name]; if (!z) throw new Error(`unknown zone "${name}" (${Object.keys(Z).join(', ')})`); return z; };

  // ------------------------------------------------------------------ per-aspect values
  const AK = new Set(['h', 'f', 'v', 's']), FB = { h: ['s', 'f', 'v'], f: ['v', 's', 'h'], v: ['f', 's', 'h'], s: ['f', 'v', 'h'] };
  const isPA = o => o && typeof o === 'object' && !Array.isArray(o) && Object.keys(o).length > 0 && Object.keys(o).every(k => AK.has(k));
  const R = (KV.R = v => { if (!isPA(v)) return v; if (A in v) return v[A]; for (const k of FB[A]) if (k in v) return v[k]; });
  const resolve = L => { const P = {}; for (const k in L) P[k] = (k === 'layers' || typeof L[k] === 'function') ? L[k] : R(L[k]); return P; };
  const T = v => KVC.time(v, TL.beat, TL.bar);
  KV.T = v => T(v); // beats / '0.8s' -> seconds (blocks: enterDur and helpers outside draw)

  // ------------------------------------------------------------------ motion
  const EASE = { lin: k => k, io: E.io, o: E.o, i: E.i, oX: E.oX, oB: E.oB,
    bounce: k => { const n = 7.5625, d = 2.75; if (k < 1 / d) return n * k * k; if (k < 2 / d) return n * (k -= 1.5 / d) * k + 0.75; if (k < 2.5 / d) return n * (k -= 2.25 / d) * k + 0.9375; return n * (k -= 2.625 / d) * k + 0.984375; },
    elastic: k => k === 0 || k === 1 ? k : Math.pow(2, -10 * k) * Math.sin((k * 10 - 0.75) * (2 * Math.PI / 3)) + 1,
    // motion tokens (Material cubic-beziers), shapes, back-in / anticipation, springs by bounce (engine.js E.bez / E.spring)
    std: E.bez(0.2, 0, 0, 1), decel: E.bez(0, 0, 0.2, 1), accel: E.bez(0.4, 0, 1, 1), emph: E.bez(0.05, 0.7, 0.1, 1), emphIn: E.bez(0.3, 0, 0.8, 0.15),
    sine: E.sine, circ: E.circ, quart: E.quart, iB: E.iB, anticipate: E.anticipate,
    spring: E.spring(0.3), smooth: E.spring(0), snappy: E.spring(0.15), bouncy: E.spring(0.5) };
  KV.EASE = EASE;
  // any ease slot accepts a name, [x1, y1, x2, y2] (cubic-bezier) or { spring: bounce 0..<1 }; unknown -> null (caller default)
  const ECACHE = {};
  const easeOf = KV.easeOf = e => {
    if (e == null || e === '') return null;
    if (typeof e === 'function') return e;
    if (Array.isArray(e)) return e.length === 4 && e.every(Number.isFinite) ? ECACHE['b' + e] || (ECACHE['b' + e] = E.bez(...e)) : null;
    if (typeof e === 'object') return Number.isFinite(e.spring) ? ECACHE['s' + e.spring] || (ECACHE['s' + e.spring] = E.spring(e.spring)) : null;
    return EASE[e] || null;
  };
  // eases that dip below 0 (anticipate, iB, beziers with y < 0): their enters take opacity from raw time, so the wind-up shows
  const UNDER = new WeakMap();
  const undershoots = f => { if (!f) return false; let u = UNDER.get(f); if (u == null) { u = false; for (let i = 1; i < 64; i++) if (f(i / 64) < -1e-4) { u = true; break; } UNDER.set(f, u); } return u; };
  const GENERIC = new Set(['none', 'fade', 'up', 'down', 'left', 'right', 'pop', 'scale', 'drop', 'spin', 'blur', 'wipe', 'grow',
    'stretch', 'punch', 'flip', 'swing', 'maskUp', 'maskDown', 'maskLeft', 'maskRight']);
  const IDLES = ['bob', 'float', 'sway', 'wiggle', 'breathe', 'spin', 'bounce', 'hop', 'shake', 'drift'];
  const TEXT_REVEAL = ['words', 'letters', 'type', 'mask', 'scramble'];
  // single source of truth for motion names (kv lint, docs, fixtures); block-specific reveals live on the block (B.reveals)
  KV.NAMES = { ease: Object.keys(EASE), enter: [...GENERIC], exit: [...GENERIC], idle: IDLES.slice(), textReveal: TEXT_REVEAL.slice() };
  // enter defaults for the newer types (seconds, ease); older types keep their historical defaults
  const EDEF = { stretch: [0.55], punch: [0.28, 'oX'], flip: [0.6], swing: [0.6], maskUp: [0.6, 'oX'], maskDown: [0.6, 'oX'], maskLeft: [0.6, 'oX'], maskRight: [0.6, 'oX'] };
  const KEEP_RM = new Set(['none', 'fade', 'words', 'letters', 'type', 'draw', 'scramble']); // reading reveals survive SB.motion 'reduced'
  function spec(v, dflt, B, P, enter) {
    const o = typeof v === 'string' ? { type: v } : Object.assign({}, v || {});
    o.type = o.type || dflt;
    const ed = enter && EDEF[o.type];
    o.dur = o.dur != null ? T(o.dur) : (B.enterDur && enter ? B.enterDur(P, o.type) : null) ?? (o.type === 'pop' || o.type === 'drop' ? 0.55 : ed ? ed[0] : enter ? 0.5 : 0.3);
    o.delay = T(o.delay);
    o.ease = easeOf(o.ease ?? (enter && o.per != null ? 'lin' : ed && ed[1]));
    if (RM && !KEEP_RM.has(o.type)) { o.type = 'fade'; o.dur = Math.min(o.dur, 0.35); o.ease = null; }
    return o;
  }
  // names are motion directions: enter 'up' rises into place, exit 'up' leaves upwards; 'left' moves leftwards
  const DIR = { up: [0, -1, 70], down: [0, 1, 70], left: [-1, 0, 140], right: [1, 0, 140] };
  const CONTACT = [[1 / 2.75, 1], [2 / 2.75, 0.5], [2.5 / 2.75, 0.25]]; // floor contacts of EASE.bounce [k, impact share]
  // st = motion state { dx, dy, s, r, a, clip, blur, sx, sy, ky, dp, shade, mask }; k: 0 hidden -> 1 in place (eased: drives
  // the motion); ka: opacity progress (= k, or the raw time progress for undershooting enter eases).
  // sx / sy / ky = non-uniform scale and vertical skew applied about the deformation pivot dp (box fractions)
  function applyAnim(st, o, k, out, ka = k) {
    const u = U * (o.dist ?? 1), d = DIR[o.type];
    if (d) { const m = (1 - k) * d[2] * u * (out ? 1 : -1); st.dx += d[0] * m; st.dy += d[1] * m; st.a *= clamp(ka * 1.6); return; }
    switch (o.type) {
      case 'fade': st.a *= ka; break;
      case 'pop': st.s *= out || o.ease ? k : E.oB(k); st.a *= clamp(ka * 3); break; // a given ease replaces the built-in back-out
      case 'scale': case 'grow': st.s *= Math.max(0, k); st.a *= clamp(ka * 3); break; // anticipate / iB go below 0: no mirror image
      case 'drop': st.dy += out ? (1 - k) * H * 0.5 : -(1 - EASE.bounce(k)) * H * 0.45; st.a *= clamp(ka * 4); break;
      case 'spin': st.r -= (1 - k) * Math.PI; st.s *= Math.max(0, k); st.a *= clamp(ka * 2); break;
      case 'blur': st.blur += (1 - k) * 24 * U; st.a *= ka; break;
      case 'wipe': st.clip = out ? 1 - (1 - k) : k; break;
      case 'stretch': { // gravity drop (bounce curve): stretched along the fall in proportion to speed, squashed at each floor contact
        const a = o.amp ?? 1, kk = clamp(k); let sy;
        if (out) { st.dy += (1 - kk) * H * 0.5; sy = 1 + a * 0.25 * (1 - kk); } // exit: falls away, stretching as it speeds up
        else {
          const h = 0.004, v = Math.min(1, Math.abs(EASE.bounce(Math.min(1, kk + h)) - EASE.bounce(Math.max(0, kk - h))) / (2 * h) / 5.5); // 5.5 = peak speed of the curve
          let q = 0; for (const [c, imp] of CONTACT) q = Math.max(q, imp * Math.max(0, 1 - Math.abs(kk - c) / 0.07)); // ~2-3 frames per contact
          sy = Math.max(0.5, 1 + a * (0.25 * v * (1 - q) - 0.22 * q)); st.dy -= (1 - EASE.bounce(kk)) * H * 0.35;
        }
        st.sy *= sy; st.sx /= sy; st.dp = st.dp || [0.5, 1]; st.a *= clamp(ka * 4); break; // volume kept: sx = 1 / sy, about the bottom edge
      }
      case 'punch': st.s *= lerp(o.from ?? 1.6, 1, k); st.blur += Math.max(0, 1 - k) * (o.blur ?? 10) * U; st.a *= clamp(ka * 4); break;
      case 'flip': { const th = (1 - k) * Math.PI / 2, c = Math.cos(th); st.sx *= Math.sign(c || 1) * Math.max(0.001, Math.abs(c)); st.ky += 0.08 * Math.sin(th); st.shade = Math.max(st.shade, 0.25 * Math.sin(th)); st.a *= clamp(ka * 6); break; }
      case 'swing': { const th = (1 - k) * 1.4; st.sy *= Math.max(0.001, Math.cos(th)); st.dp = st.dp || [0.5, 0]; st.a *= clamp(ka * 3); break; }
      case 'maskUp': case 'maskDown': case 'maskLeft': case 'maskRight': st.mask = { t: o.type, k, out }; break;
    }
  }
  function idle(st, P, lt, seed) {
    const b = TL.beat, ph = (P.phase ?? 0) * Math.PI * 2;
    const amp = (P.idleAmp ?? 1) * (RM ? (P.idle === 'spin' || P.idle === 'shake' || P.idle === 'drift' || P.idle === 'hop' ? 0 : 0.3) : 1);
    switch (P.idle) {
      case 'bob': st.dy += Math.sin(lt * Math.PI / b + ph) * 10 * U * amp; break;
      case 'float': st.dy += Math.sin(lt * Math.PI / (2 * b) + ph) * 18 * U * amp; st.r += Math.sin(lt * Math.PI / (4 * b) + ph) * 0.03 * amp; break;
      case 'sway': st.r += Math.sin(lt * Math.PI / (2 * b) + ph) * 0.07 * amp; break;
      case 'wiggle': st.r += Math.sin(lt * Math.PI * 2 / b * 2 + ph) * 0.06 * amp; break;
      case 'breathe': st.s *= 1 + Math.sin(lt * Math.PI / (2 * b) + ph) * 0.03 * amp; break;
      case 'spin': st.r += lt * Math.PI * 0.5 * amp; break;
      case 'bounce': st.dy -= Math.abs(Math.sin(lt * Math.PI / b + ph)) * 26 * U * amp; break;
      case 'hop': { // bounce with a contact squash (period 2 beats); volume kept, squash about the bottom edge
        if (!amp) break;
        const y = Math.abs(Math.sin(lt * Math.PI / b + ph)), c = Math.max(0, 1 - y * 6) * 0.18 * Math.min(1.5, amp);
        st.dy -= y * 30 * U * amp; st.sy *= 1 - c; st.sx /= 1 - c; st.dp = st.dp || [0.5, 1]; break;
      }
      case 'shake': { const tt = lt - T(P.shakeAt ?? 0); if (tt >= 0 && amp) { const d = Math.exp(-tt / 0.12) * amp, w = Math.sin(tt * 2 * Math.PI * 9); st.dx += w * 14 * U * d; st.r += w * 0.035 * d; } break; } // 9 Hz, tau 0.12 s
      case 'drift': { if (!amp) break; const p = lt / (4 * b), s = seed + ph; st.dx += MV.noise1(p, s + 1) * 14 * U * amp; st.dy += MV.noise1(p, s + 2) * 10 * U * amp; st.r += MV.noise1(p, s + 3) * 0.03 * amp; break; }
    }
  }
  // keys: [{ t, pos, s, r, o, ease, arc }] — arc = perpendicular bulge of the segment ending at this key (fraction of its
  // length, + bulges to the left of the direction of travel on screen); zw / zh = zone size so the arc stays round on every aspect
  function keyed(keys, st0, t, zw, zh) {
    if (!keys || !keys.length) return null;
    const ks = keys._c || (keys._c = (() => { let prev = st0; return keys.map(k => (prev = Object.assign({}, prev, k, { t: T(k.t) }))); })());
    if (t <= ks[0].t) return ks[0];
    if (t >= ks[ks.length - 1].t) return ks[ks.length - 1];
    let i = 0; while (t > ks[i + 1].t) i++;
    const a = ks[i], b = ks[i + 1], k = (easeOf(b.ease) || E.io)((t - a.t) / (b.t - a.t)), arc = keys[i + 1].arc;
    const pos = [lerp(a.pos[0], b.pos[0], k), lerp(a.pos[1], b.pos[1], k)];
    if (arc && zw) { const s = Math.sin(Math.PI * k) * arc, dx = (b.pos[0] - a.pos[0]) * zw, dy = (b.pos[1] - a.pos[1]) * zh; pos[0] += dy * s / zw; pos[1] -= dx * s / zh; }
    return { pos, s: lerp(a.s, b.s, k), r: lerp(a.r, b.r, k), o: lerp(a.o, b.o, k) };
  }

  // ------------------------------------------------------------------ probe (layout measurement for kv lint)
  function bbox(x, y, w, h) {
    const m = ctx.getTransform(), pts = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].map(([px, py]) => [m.a * px + m.c * py + m.e, m.b * px + m.d * py + m.f]);
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const x0 = Math.min(...xs), y0 = Math.min(...ys);
    return { x: Math.round(x0), y: Math.round(y0), w: Math.round(Math.max(...xs) - x0), h: Math.round(Math.max(...ys) - y0), scale: Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) };
  }
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  function parseCol(c) { const g = KV._pc || (KV._pc = document.createElement('canvas').getContext('2d')); g.fillStyle = '#000'; g.fillStyle = c; const s = g.fillStyle; if (s[0] === '#') { const n = parseInt(s.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; } const m = s.match(/[\d.]+/g); return m ? m.slice(0, 3).map(Number) : [0, 0, 0]; }
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  function sample(b) {
    const x = clamp(b.x, 0, W - 1), y = clamp(b.y, 0, H - 1), w = Math.max(1, Math.min(W - x, b.w)), h = Math.max(1, Math.min(H - y, b.h));
    const d = ctx.getImageData(x, y, w, h).data, n = d.length / 4, step = Math.max(1, Math.floor(n / 20000));
    let r = 0, g = 0, bl = 0, c = 0, l2 = 0, ls = 0;
    for (let i = 0; i < n; i += step) { const j = i * 4; r += d[j]; g += d[j + 1]; bl += d[j + 2]; const L = 0.2126 * d[j] + 0.7152 * d[j + 1] + 0.0722 * d[j + 2]; ls += L; l2 += L * L; c++; }
    const m = ls / c; return { rgb: [r / c, g / c, bl / c].map(Math.round), std: Math.round(Math.sqrt(Math.max(0, l2 / c - m * m))) };
  }
  // motion names checked once at boot (enter / exit / idle / every ease slot, nested layers, scene cameras): unknown names
  // used to be silent no-ops. Issues go to KV.ISSUES, the console, and every kvProbe() frame as `issues` for kv lint.
  function validate() {
    const out = [], seen = new Set(), vals = v => isPA(v) ? Object.values(v) : [v];
    const add = (sc, L, msg) => { const k = `${sc.id}|${L ? L.id : ''}|${msg}`; if (!seen.has(k)) { seen.add(k); out.push({ level: 'error', rule: 'motion', msg, scene: sc.id, layer: L ? L.id : undefined }); } };
    const easeOk = e => e == null || e === '' || typeof e === 'function' || (Array.isArray(e) ? !!easeOf(e) : typeof e === 'object' ? e.spring >= 0 && e.spring < 1 : !!EASE[e]);
    const ease = (sc, L, e, where) => { if (!easeOk(e)) add(sc, L, `unknown ease ${JSON.stringify(e)} in ${where} (${Object.keys(EASE).join(' ')}; [x1, y1, x2, y2]; { spring: 0..0.99 })`); };
    const walk = (sc, list, pre) => (list || []).filter(Boolean).forEach((L0, j) => {
      const L = Object.assign({ id: `${pre}.${j}` }, L0), B = KV.blocks[L.kind]; if (!B) return; // unknown kinds fail elsewhere
      for (const [key, isIn] of [['enter', true], ['exit', false]]) for (const v of vals(L[key])) {
        if (v == null) continue;
        const o = typeof v === 'string' ? { type: v } : v, ty = o.type, rev = isIn ? B.reveals || [] : [];
        if (ty != null && !GENERIC.has(ty) && !rev.includes(ty)) add(sc, L, `${key} "${ty}" does nothing on kind ${L.kind} (${key}: ${[...GENERIC, ...rev].join(' ')})`);
        if (o && typeof o === 'object') ease(sc, L, o.ease, key);
      }
      for (const v of vals(L.idle)) if (v != null && v !== false && v !== 'none' && !IDLES.includes(v)) add(sc, L, `unknown idle "${v}" (${IDLES.join(' ')})`);
      for (const v of vals(L.keys)) for (const k of v || []) if (k) ease(sc, L, k.ease, 'keys');
      for (const v of vals(L.follow)) if (v) ease(sc, L, v.ease, 'follow');
      for (const v of vals(L.stagger)) if (v && typeof v === 'object') ease(sc, L, v.ease, 'stagger');
      if (Array.isArray(L.layers)) walk(sc, L.layers, L.id);
    });
    for (const sc of TL.scenes) {
      const c = sc.cam;
      if (c) { ease(sc, null, c.ease, 'cam'); for (const k of c.keys || []) ease(sc, null, k && k.ease, 'cam.keys'); if (Array.isArray(c.focus)) for (const k of c.focus) ease(sc, null, k && k.ease, 'cam.focus'); }
      walk(sc, sc.layers, sc.id);
    }
    return out;
  }
  // probe only: the active mask-enter clip in canvas px (nested masks intersect); text / boxes outside it are invisible
  let PCLIP = null;
  const isect = (a, b) => { if (!a) return b; const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y), x1 = Math.min(a.x + a.w, b.x + b.w), y1 = Math.min(a.y + a.h, b.y + b.h); return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0), scale: b.scale }; };
  // text blocks call env.note(...) right before drawing text (local coords); probe samples the pixels already drawn below it
  function note(env, o) {
    if (!PROBE) return;
    const b = isect(PCLIP, bbox(o.x, o.y, o.w, o.h)); if (b.w < 1 || b.h < 1) return; // masked away: not on screen
    const bg = sample(b), fg = parseCol(o.color);
    const out = o.outline && o.outlineW >= o.px * 0.06 ? parseCol(o.outline) : null;
    const cr = ratio(fg, bg.rgb), co = out ? Math.max(ratio(fg, out), ratio(out, bg.rgb)) : 0;
    PROBE.texts.push({ id: env.L.id, scene: env.sc.id, text: String(o.text).slice(0, 60), x: b.x, y: b.y, w: b.w, h: b.h, px: Math.round(o.px * b.scale),
      alpha: +ctx.globalAlpha.toFixed(2), contrast: +Math.max(cr, co).toFixed(2), bgStd: bg.std, bg: bg.rgb, color: o.color });
  }

  // ------------------------------------------------------------------ layers
  function prep(sc) {
    if (sc._layers) return sc._layers;
    const list = [...sc.layers];
    if (sc.bg && !list.some(L => catOf(L) === 'bg')) list.unshift(Object.assign({ id: sc.id + '.bg', kind: 'bg' }, typeof sc.bg === 'string' ? { style: sc.bg } : sc.bg));
    else if (!list.some(L => catOf(L) === 'bg')) list.unshift(Object.assign({ id: sc.id + '.bg', kind: 'bg' }, SB.bg ? (typeof SB.bg === 'string' ? { style: SB.bg } : SB.bg) : {}));
    return (sc._layers = sortLayers(list));
  }
  function catOf(L) { const B = KV.blocks[L.kind]; if (!B) throw new Error(`layer ${L.id}: unknown kind "${L.kind}"`); return L.cat || B.cat; }
  function sortLayers(list) {
    return list.filter(L => !L.only || [].concat(L.only).some(a => KVC.ASPECTS[a] ? KVC.ASPECTS[a].A === A : a === A))
      .map((L, j) => ({ L, key: (L.z ?? RANK[catOf(L)] * 100) + j * 0.001 })).sort((a, b) => a.key - b.key).map(x => x.L);
  }
  KV.pulse = t => PULSE(t);
  // named points published by photo layers this frame: 'assetKey:point' and 'layerId:point' -> canvas px
  KV.PINS = {};
  // is a voice line of this scene playing at t? real lengths from vo.js (kv score), else ~2.6 words/s + 0.3 s
  KV.speaking = (sceneId, t) => {
    const lines = typeof VO !== 'undefined' && VO.length ? VO : TL.events.filter(e => e.type === 'say').map(e => ({ t: e.t, dur: KVC.words(e.text).length / 2.6 + 0.3, scene: e.scene }));
    return lines.some(l => l.scene === sceneId && t >= l.t && t <= l.t + l.dur);
  };

  // ------------------------------------------------------------------ paths (shape 'path', layer `follow`, textpath, morph)
  // SVG path d -> 512 points sampled by arc length (path units; detached SVGPathElement, cached). A malformed or empty d
  // throws, so the page fails and kv lint reports a runtime error instead of drawing nothing.
  const PATHS = {}, PXF = {};
  KV.pathOf = d => {
    if (PATHS[d]) return PATHS[d];
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'path'); el.setAttribute('d', d);
    const len = el.getTotalLength(), n = 512;
    if (!(len > 0)) throw new Error(`path d "${String(d).slice(0, 48)}": not a drawable SVG path`);
    const pts = []; for (let i = 0; i <= n; i++) { const q = el.getPointAtLength(len * i / n); pts.push([q.x, q.y]); }
    return (PATHS[d] = { len, pts, closed: /z\s*$/i.test(String(d).trim()) });
  };
  // the sampled path scaled (sx, sy) and moved (ox, oy) into canvas / layer px: arc length, point / tangent at length s,
  // trace(ctx, s0, s1) appends that stretch as a polyline (draw-on, chase, morph)
  KV.pathOn = (d, sx = 1, sy = 1, ox = 0, oy = 0) => {
    const key = `${d}|${sx}|${sy}|${ox}|${oy}`; if (PXF[key]) return PXF[key];
    const raw = KV.pathOf(d), pts = raw.pts.map(p => [ox + p[0] * sx, oy + p[1] * sy]), cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const len = cum[cum.length - 1], last = pts.length - 2;
    const idx = s => { let a = 0, b = last; while (a < b) { const m = (a + b + 1) >> 1; if (cum[m] <= s) a = m; else b = m - 1; } return a; };
    const at = s => { s = clamp(s, 0, len); const i = idx(s), f = (s - cum[i]) / ((cum[i + 1] - cum[i]) || 1); return [lerp(pts[i][0], pts[i + 1][0], f), lerp(pts[i][1], pts[i + 1][1], f)]; };
    const angle = s => { const i = idx(clamp(s, 0, len)); return Math.atan2(pts[i + 1][1] - pts[i][1], pts[i + 1][0] - pts[i][0]); };
    const trace = (g, s0, s1) => { s0 = clamp(s0, 0, len); s1 = clamp(s1, s0, len); const a = at(s0); g.moveTo(a[0], a[1]); for (let i = idx(s0) + 1; i <= idx(s1); i++) g.lineTo(pts[i][0], pts[i][1]); const b = at(s1); g.lineTo(b[0], b[1]); };
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), x0 = Math.min(...xs), y0 = Math.min(...ys);
    return (PXF[key] = { pts, cum, len, at, angle, trace, closed: raw.closed, bbox: { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 } });
  };

  // ------------------------------------------------------------------ layer buffers (sheen, flip shade, motion blur)
  // fn draws into a transparent full-frame buffer that carries the current transform; the caller composites it once
  const LMAIN = [];
  function onLayer(fn) {
    const i = LDEPTH++, m = ctx.getTransform(), main = MV.cv, mctx = ctx;
    let buf = LBUF[i];
    if (!buf || buf.width !== W || buf.height !== H) { buf = LBUF[i] = document.createElement('canvas'); buf.width = W; buf.height = H; buf.getContext('2d'); } // alpha context first (MV.init asks for an opaque one)
    LMAIN.push(main); MV.init(buf); ctx = MV.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none'; ctx.clearRect(0, 0, W, H); ctx.setTransform(m);
    try { fn(); } finally { MV.init(main); ctx = mctx; LMAIN.pop(); LDEPTH--; }
    return buf;
  }
  KV.backdrop = () => LMAIN.length ? LMAIN[0] : MV.cv; // the canvas holding the scene drawn so far (glass reads it)
  function composite(buf, op) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); if (op && op !== 'source-over') ctx.globalCompositeOperation = op; ctx.drawImage(buf, 0, 0); ctx.restore(); }
  // light sweep progress 0..1 (0 / 1 = inactive); `at` in beats after the layer's `in` (number or list), `dur` '0.8s'
  function sheenK(sw, lt) {
    const o = sw === true ? {} : sw, d = T(o.dur ?? '0.8s');
    for (const a of [].concat(o.at ?? 1)) { const k = (lt - T(a)) / d; if (k > 0 && k < 1) return k; }
    return 0;
  }
  // block drawn into a buffer, then flip shade and / or the sheen band added source-atop (clipped to the layer's own pixels)
  function drawBuffered(B, P, env, S, ks) {
    const m = ctx.getTransform(), b = env.box; let op = 'source-over';
    const buf = onLayer(() => {
      B.draw(ctx, P, env); op = ctx.globalCompositeOperation; // a block-set blend (logo multiply) is kept for the composite
      ctx.save(); ctx.globalCompositeOperation = 'source-atop'; ctx.filter = 'none'; ctx.globalAlpha = 1; ctx.setLineDash([]);
      if (S.shade > 0.004) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = `rgba(0,0,0,${Math.min(0.6, S.shade).toFixed(3)})`; ctx.fillRect(0, 0, W, H); ctx.setTransform(m); }
      if (ks > 0) {
        const o = P.sheen === true ? {} : P.sheen, c = parseCol(KV.col(o.color || '#FFFFFF')), a = o.alpha ?? 0.6;
        const x = b.x + lerp(-0.3, 1.3, E.io(ks)) * b.w, bw = Math.max(8, b.w * (o.width ?? 0.2) / 2), g = ctx.createLinearGradient(x - bw, 0, x + bw, 0);
        g.addColorStop(0, `rgba(${c},0)`); g.addColorStop(0.5, `rgba(${c},${a})`); g.addColorStop(1, `rgba(${c},0)`);
        ctx.transform(1, 0, -Math.tan((o.angle ?? 22) * Math.PI / 180), 1, 0, 0); // band leans right by `angle` degrees
        ctx.fillStyle = g; ctx.fillRect(b.x - b.w * 2, b.y - b.h, b.w * 5, b.h * 3);
      }
      ctx.restore();
    });
    composite(buf, op);
  }
  // measure-only pass: the layer's final transform + box at (st, t), or null when it is not visible
  function layerMatrix(L, sc, st, t, zone0) { const keep = DRY; DRY = {}; try { drawLayer(L, sc, st, t, zone0, true); return DRY.m ? DRY : null; } finally { DRY = keep; } }
  const corners = (q) => { const b = q.box; return [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h], [b.x + b.w / 2, b.y + b.h / 2]].map(([x, y]) => q.m.transformPoint({ x, y })); };
  const moved = (a, b) => { const p = corners(a), q = corners(b); return Math.max(...p.map((v, i) => Math.hypot(v.x - q[i].x, v.y - q[i].y))); };
  // mblur: `samples` sub-frames over the shutter (180 deg = half a frame) summed at 1/n ('lighter' on premultiplied pixels
  // = their average); skipped while the layer moves < 1.5 px over the shutter (no blur, no 8-bit averaging loss)
  function motionBlur(L, sc, st, t, zone0, P) {
    const o = P.mblur === true ? {} : P.mblur, sh = (o.shutter ?? 180) / 360 / TL.fps;
    const a = layerMatrix(L, sc, st, t, zone0), b = layerMatrix(L, sc, st - sh, t - sh, zone0), mv = a && b ? moved(a, b) : 0;
    if (mv < 1.5) return false;
    const n = Math.round(clamp(Math.max(o.samples ?? 5, Math.ceil(mv / 4)), 2, 32)); // <= 4 px between sub-frames: a smooth smear, no ghost copies
    const buf = onLayer(() => { ctx.globalCompositeOperation = 'lighter'; for (let i = 0; i < n; i++) { const d = sh * i / (n - 1); ctx.save(); ctx.globalAlpha = 1 / n; drawLayer(L, sc, st - d, t - d, zone0, true); ctx.restore(); } });
    composite(buf, P.blend);
    return true;
  }
  // smear: stretch along the per-frame screen velocity (cartoon in-between): factor 1 + |v| / 120 px (max 3x), thinner
  // across, centred a third of a frame behind
  function smear(L, sc, st, t, zone0, P) {
    const dt = 1 / TL.fps, a = layerMatrix(L, sc, st, t, zone0), b = layerMatrix(L, sc, st - dt, t - dt, zone0);
    if (!a || !b) return;
    const p = corners(a)[4], q = corners(b)[4], vx = p.x - q.x, vy = p.y - q.y, v = Math.hypot(vx, vy);
    if (v < 4) return;
    const f = 1 + clamp(v / 120, 0, 2) * (typeof P.smear === 'number' ? P.smear : 1), deg = Math.atan2(vy, vx) * 180 / Math.PI;
    const D = new DOMMatrix().translate(p.x - vx / 3, p.y - vy / 3).rotate(deg).scale(f, 1 / Math.sqrt(f)).rotate(-deg).translate(-p.x, -p.y);
    ctx.setTransform(D.multiply(ctx.getTransform()));
  }
  // rack focus: cam.focus = depth in focus (number or keys [{ t, d, ease }]); blur = |depth - focus| * dof px@1080
  function focusAt(c, st) {
    const f = c.focus; if (!Array.isArray(f)) return +f;
    const ks = f._c || (f._c = (() => { let p = { d: 1 }; return f.map(k => (p = Object.assign({}, p, k, { t: T(k.t) }))); })());
    if (st <= ks[0].t) return ks[0].d; if (st >= ks[ks.length - 1].t) return ks[ks.length - 1].d;
    let i = 0; while (st > ks[i + 1].t) i++;
    return lerp(ks[i].d, ks[i + 1].d, (easeOf(ks[i + 1].ease) || E.io)((st - ks[i].t) / (ks[i + 1].t - ks[i].t)));
  }

  function drawLayer(L, sc, st, t, zone0, sub) {
    const B = KV.blocks[L.kind], P = resolve(L);
    const tin = T(P.in), tout = P.out != null ? T(P.out) : Infinity;
    if (st < tin || st > tout) return;
    if (P.mblur && !sub && !PROBE && !RM && motionBlur(L, sc, st, t, zone0, P)) return;
    const en = spec(P.enter, B.enter || 'fade', B, P, true), ex = spec(P.exit, 'fade', B, P, false);
    // first scene: entrances that start at 0 are pre-rolled so frame 0 (thumbnail, autoplay) already reads
    const lt = st - tin + (sc.i === 0 && SB.preroll !== false && tin <= 0 && en.type !== 'none' ? en.delay + en.dur * 0.7 : 0);
    let kIn = en.type === 'none' ? 1 : clamp((lt - en.delay) / en.dur);
    if (en.type !== 'none' && lt < en.delay) return;
    const kOut = tout === Infinity || ex.type === 'none' ? 0 : clamp((st - (tout - ex.dur)) / ex.dur);
    const zone = zone0 || KV.zone(P.at || B.at || 'stage');
    const zm = Math.min(zone.w, zone.h);
    const w = P.size != null ? P.size * zm : P.w != null ? P.w * zone.w : (B.w ?? 1) * zone.w;
    const h = P.size != null ? P.size * zm : P.h != null ? P.h * zone.h : (B.h ?? 1) * zone.h;
    const base = { pos: P.pos || B.pos || [0.5, 0.5], s: P.scale ?? 1, r: (P.rot || 0) * Math.PI / 180, o: P.opacity ?? 1 };
    const kf = keyed(P.keys, { pos: base.pos, s: base.s, r: P.rot || 0, o: base.o }, st, zone.w, zone.h);
    let pos = kf ? kf.pos : base.pos;
    const S = { dx: (P.dx || 0) * U, dy: (P.dy || 0) * U, s: kf ? kf.s : base.s, r: kf ? kf.r * Math.PI / 180 : base.r, a: kf ? kf.o : base.o, clip: 1, blur: 0,
      sx: 1, sy: 1, ky: 0, dp: null, shade: 0, mask: null };
    if (P.follow) { // path following: d in zone units 0..1 (default) or canvas px (unit 'px'); at [inBeat, outBeat] scene time
      const f = P.follow, px = f.unit === 'px', p = KV.pathOn(f.d, px ? 1 : zone.w, px ? 1 : zone.h), at = [].concat(f.at ?? []);
      const a0 = T(at[0] ?? 0), a1 = at[1] != null ? T(at[1]) : sc.dur, s = lerp(f.from ?? 0, f.to ?? 1, (easeOf(f.ease) || E.io)(clamp((st - a0) / Math.max(0.01, a1 - a0)))) * p.len, q = p.at(s);
      pos = px ? [(q[0] - zone.x) / zone.w, (q[1] - zone.y) / zone.h] : [q[0] / zone.w, q[1] / zone.h];
      if (f.orient) S.r += p.angle(s) + (typeof f.orient === 'number' ? f.orient * Math.PI / 180 : 0);
    }
    const eIn = en.ease ? en.ease(kIn) : (en.type === 'pop' || en.type === 'drop' || en.type === 'spin' || en.type === 'stretch' ? kIn : E.o(kIn));
    if (GENERIC.has(en.type) && kIn < 1) { const kk = en.type === 'drop' || (en.type === 'pop' && !en.ease) ? kIn : eIn; applyAnim(S, en, kk, false, undershoots(en.ease) ? kIn : kk); }
    if (kOut > 0) applyAnim(S, ex, 1 - (ex.ease || E.i)(kOut), true);
    idle(S, P, lt, P.seed ?? hashStr(L.id));
    if (P.beat) S.s *= 1 + PULSE(t) * 0.06 * (P.beat === true ? 1 : P.beat);
    if (P.blur) S.blur += P.blur * U; // static defocus (px@1080)
    if (!zone0 && sc.cam && sc.cam.focus != null && !RM && CAM_CATS[catOf(L)]) S.blur += Math.abs((P.depth ?? 1) - focusAt(sc.cam, st)) * (sc.cam.dof ?? 10) * U;
    if (S.a <= 0.003 || S.s <= 0.001) return;
    const ax = (P.anchor || [0.5, 0.5])[0], ay = (P.anchor || [0.5, 0.5])[1];
    const env = { t, st, lt, sc, L, P, A, W, H, u: U, zone, box: { x: -ax * w, y: -ay * h, w, h }, k: kIn, kOut,
      reveal: GENERIC.has(en.type) ? 1 : eIn, revealType: GENERIC.has(en.type) ? null : en.type, enter: en,
      beat: TL.beat, pulse: PULSE(t), theme: TH, col: KV.col, font: KV.font, img: k => MV.img[k], R, T,
      rng: i => MV.hash((P.seed ?? hashStr(L.id)) + i * 1.618), note: o => note(env, o), draw: (child, z) => drawLayer(child, sc, st, t, z),
      local: (x, y) => { const p = ctx.getTransform().invertSelf().transformPoint({ x, y }); return [p.x, p.y]; } }; // canvas px -> this layer's coords
    ctx.save();
    ctx.globalAlpha *= clamp(S.a);
    if (P.blend && !sub) ctx.globalCompositeOperation = P.blend; // sub-frames (mblur) keep 'lighter'; the blend applies at composite
    if (S.blur > 0.3) ctx.filter = `blur(${S.blur.toFixed(1)}px)`;
    if (P.smear && !sub && !PROBE && !RM) smear(L, sc, st, t, zone0, P);
    const pin = P.pin && KV.PINS[P.pin];
    if (P.pin && !pin && !KV._pinWarn) { console.warn(`pin ${P.pin}: no photo drew that point yet (the photo must draw first)`); KV._pinWarn = 1; }
    if (pin) { const q = ctx.getTransform().invertSelf().transformPoint({ x: pin[0], y: pin[1] }); ctx.translate(q.x + S.dx, q.y + S.dy); }
    else ctx.translate(zone.x + pos[0] * zone.w + S.dx, zone.y + pos[1] * zone.h + S.dy);
    const pv = P.pivot ? [env.box.x + P.pivot[0] * w, env.box.y + P.pivot[1] * h] : null; // rotation / scale origin inside the box
    if (pv) ctx.translate(pv[0], pv[1]);
    if (S.r) ctx.rotate(S.r);
    if (S.s !== 1) ctx.scale(S.s, S.s);
    if (pv) ctx.translate(-pv[0], -pv[1]);
    if (S.sx !== 1 || S.sy !== 1 || S.ky) { // squash / stretch / flip / swing about the deformation pivot (default: box centre)
      const d = P.pivot || S.dp || [0.5, 0.5], qx = env.box.x + d[0] * w, qy = env.box.y + d[1] * h;
      ctx.translate(qx, qy); ctx.transform(S.sx, S.ky, 0, S.sy, 0, 0); ctx.translate(-qx, -qy);
    }
    if (S.clip < 1) { ctx.beginPath(); ctx.rect(env.box.x - 4, -H * 4, (env.box.w + 8) * S.clip, H * 8); ctx.clip(); }
    const pc0 = PCLIP;
    if (S.mask) { // maskUp / Down / Left / Right: clip to the box, content slides in from outside it (exit: slides out)
      const b = env.box, j = (1 - S.mask.k) * (S.mask.out ? -1 : 1), ty = S.mask.t;
      ctx.beginPath(); ctx.rect(b.x - 4, b.y - 4, b.w + 8, b.h + 8); ctx.clip();
      if (PROBE) PCLIP = isect(pc0, bbox(b.x - 4, b.y - 4, b.w + 8, b.h + 8));
      ctx.translate(ty === 'maskLeft' ? j * (b.w + 8) : ty === 'maskRight' ? -j * (b.w + 8) : 0, ty === 'maskUp' ? j * (b.h + 8) : ty === 'maskDown' ? -j * (b.h + 8) : 0); // past the 4 px padding
    }
    if (DRY) { DRY.m = ctx.getTransform(); DRY.box = env.box; ctx.restore(); PCLIP = pc0; return; }
    if (PROBE && catOf(L) !== 'bg') { const b = isect(PCLIP, bbox(env.box.x, env.box.y, w, h)); if (b.w >= 1 && b.h >= 1) PROBE.boxes.push({ id: L.id, scene: sc.id, kind: L.kind, cat: catOf(L), protect: !!P.protect, alpha: +ctx.globalAlpha.toFixed(2), ...b }); }
    const ks = P.sheen && !PROBE ? sheenK(P.sheen, lt) : 0;
    if (!PROBE && (ks > 0 || S.shade > 0.004)) drawBuffered(B, P, env, S, ks); // probe frames measure the plain layer
    else B.draw(ctx, P, env);
    ctx.restore(); PCLIP = pc0;
  }
  const hashStr = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100003; return h; };

  // stagger: offsets each child's `in` by its rank: { each: '0.08s', from: 'start' | 'center' | 'edges' | 'end' | 'random' |
  // index, ease: 'lin' } or a number (beats per child). Rank r of m gives offset ease(r / m) * m * each.
  function staggered(kids, sg, rng) {
    if (!sg || kids.length < 2) return kids;
    const o = typeof sg === 'object' ? sg : { each: sg }, n = kids.length, c = (n - 1) / 2, each = T(o.each ?? '0.08s');
    const ord = i => o.from === 'center' ? Math.abs(i - c) : o.from === 'edges' ? c - Math.abs(i - c) : o.from === 'end' ? n - 1 - i
      : o.from === 'random' ? Math.floor(rng(i) * n) : typeof o.from === 'number' ? Math.abs(i - o.from) : i;
    const m = Math.max(1, ...kids.map((_, i) => ord(i))), e = easeOf(o.ease) || EASE.lin;
    return kids.map((k, i) => Object.assign({}, k, { in: (T(R(k.in)) + e(ord(i) / m) * m * each).toFixed(4) + 's' }));
  }
  KV.staggered = staggered;
  // iso: 2:1 dimetric projection of the group's flat drawing (edges keep their length): 'top' floor, 'left' / 'right' walls
  const ISO = { top: [0.894, 0.447, -0.894, 0.447], left: [0.894, 0.447, 0, 1], right: [0.894, -0.447, 0, 1] };

  // group: children are placed in the group's box (pos 0..1 inside it)
  KV.define('group', {
    cat: 'media', draw(ctx, P, env) {
      const z = env.box, kids = sortLayers(staggered((P.layers || []).map((c, j) => Object.assign({ id: `${env.L.id}.${j}` }, c)), P.stagger, env.rng));
      const iso = P.iso && ISO[P.iso];
      if (iso) { ctx.save(); ctx.transform(iso[0], iso[1], iso[2], iso[3], 0, 0); }
      for (const c of kids) env.draw(c, z);
      if (iso) ctx.restore();
    }
  });
  // stack: children top-to-bottom by measured height (text reflows per aspect, nothing overlaps); shrinks to fit
  function measureH(ctx, C, z) {
    if (C.kind === 'text' || C.kind === 'counter' || C.kind === 'bubble') {
      const st = KV.TEXT_STYLE[C.style || (C.kind === 'bubble' ? 'subtitle' : C.kind === 'counter' ? 'display' : 'headline')] || KV.TEXT_STYLE.headline;
      const px0 = C.px != null ? C.px : R(st.px), w = z.w * (C.w ?? 1) * (C.kind === 'bubble' ? 0.84 : 1);
      const L = KV.textLayout(ctx, Object.assign({}, C, { text: C.kind === 'counter' ? String(C.value) : C.text }), { A, theme: TH, box: { w } }, px0);
      return L.h + (C.bg ? L.px * 0.9 : 0) + (C.kind === 'bubble' ? L.px * 2.4 : 0);
    }
    if (C.kind === 'button') return (C.px ?? 40 * U) * 2.2 + 24 * U;
    if (C.kind === 'list') return (C.items || []).length * (C.px ?? R(KV.TEXT_STYLE[C.style || 'body'].px)) * 1.75;
    if (C.kind === 'progress') return 40 * U;
    if (C.size != null) return C.size * Math.min(z.w, z.h);
    return (C.h ?? 0.3) * z.h;
  }
  KV.define('stack', {
    cat: 'copy', enter: 'none',
    draw(ctx, P, env) {
      const z = env.box, gap = (P.gap ?? 26) * U;
      const kids = staggered((P.layers || []).filter(Boolean).map((c, j) => resolve(Object.assign({ id: `${env.L.id}.${j}` }, c)))
        .filter(c => !c.only || [].concat(c.only).some(a => KVC.ASPECTS[a] ? KVC.ASPECTS[a].A === A : a === A)), P.stagger, env.rng);
      const hs = kids.map(c => measureH(ctx, c, z)), tot = hs.reduce((a, b) => a + b, 0) + gap * Math.max(0, kids.length - 1);
      const k = tot > z.h ? z.h / tot : 1, inh = P.align || (P.at === 'copy' && env.A === 'h' ? 'left' : null); // children inherit the column alignment
      ctx.save(); if (k < 1) ctx.scale(k, k);
      let y = -tot / 2 + ((P.valign ?? 0.5) - 0.5) * (z.h / k - tot);
      kids.forEach((c, i) => {
        const slot = { x: z.x, y, w: z.w, h: hs[i] };
        // the slot already has the measured height: sized / h-fraction children fill it (no double scaling)
        const sized = c.size != null ? { size: null, w: Math.min(1, c.size * Math.min(z.w, z.h) / z.w), h: 1 } : c.h != null && !['text', 'counter', 'bubble', 'list'].includes(c.kind) ? { h: 1 } : null;
        const cc = inh && c.align == null && ['text', 'counter', 'list', 'bubble', 'button'].includes(c.kind) ? Object.assign({}, c, { align: inh }) : c;
        env.draw(sized ? Object.assign({}, cc, sized) : cc, slot);
        y += hs[i] + gap;
      });
      ctx.restore();
    }
  });
  // tier 3 inline: { kind: 'custom', draw(ctx, P, env) { ... } }
  KV.define('custom', { cat: 'media', draw(ctx, P, env) { P.draw(ctx, P, env); } });

  // ------------------------------------------------------------------ scenes
  // scene camera for bg / media / fx layers: simple drift { s, x, y, r: [from, to], ease, at, over } or several moves
  // keys: [{ t, s, x, y, r, ease }] (x / y fractions of W / H, r degrees), + shake: { at, amp: 14, decay: 0.1 } (px@1080, s)
  function camOf(sc, st) {
    const c = sc.cam || (sc.zoom ? { s: [1, sc.zoom] } : null);
    if (!c) return null;
    const at = c.at || [0.5, 0.5];
    let q;
    if (c.keys && c.keys.length) {
      const ks = c._ck || (c._ck = (() => { let p = { s: 1, x: 0, y: 0, r: 0 }; return c.keys.map(k => (p = Object.assign({}, p, k, { t: T(k.t) }))); })());
      if (st <= ks[0].t) q = ks[0]; else if (st >= ks[ks.length - 1].t) q = ks[ks.length - 1];
      else { let i = 0; while (st > ks[i + 1].t) i++; const a = ks[i], b = ks[i + 1], k = (easeOf(b.ease) || E.io)((st - a.t) / (b.t - a.t)); q = { s: lerp(a.s, b.s, k), x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), r: lerp(a.r, b.r, k) }; }
    } else {
      const k = (easeOf(c.ease) || EASE.lin)(clamp(st / (sc.dur + (c.over ?? 0.6))));
      const g = v => Array.isArray(v) ? lerp(v[0], v[1], k) : v ?? 0;
      q = { s: g(c.s ?? 1) || 1, x: g(c.x), y: g(c.y), r: g(c.r) };
    }
    const cam = { s: q.s || 1, x: q.x * W, y: q.y * H, r: (q.r || 0) * Math.PI / 180, px: at[0] * W, py: at[1] * H, jx: 0, jy: 0 };
    if (c.shake && !RM) { const o = c.shake === true ? {} : c.shake, tt = st - T(o.at ?? 0); if (tt >= 0) { const a = Math.exp(-tt / (o.decay ?? 0.1)) * (o.amp ?? 14) * U; cam.jx = a * Math.sin(tt * 61); cam.jy = a * Math.cos(tt * 47); } }
    if (RM) { cam.s = 1 + (cam.s - 1) * 0.25; cam.x = cam.y = cam.r = 0; } // reduced motion: a quarter of the zoom, no pan / roll / shake
    return cam;
  }
  function scrimNeeded(sc) {
    if (sc.scrim === false) return false;
    if (sc.scrim === true) return true;
    return sc._layers.some(L => L.kind === 'photo') && sc._layers.some(L => catOf(L) === 'copy');
  }
  function finishing(sc) {
    if (TH.vignette > 0 && sc.vignette !== false) MV.vignette();
    if (scrimNeeded(sc)) KV.scrim(sc.scrimAt || 'copy');
  }
  KV.scrim = (zoneName, color) => {
    const z = KV.zone(zoneName), c = color || TH.scrim;
    ctx.save();
    let g;
    if (A === 'h' && zoneName === 'copy') { g = ctx.createLinearGradient(0, 0, z.x + z.w + 260, 0); g.addColorStop(0, c); g.addColorStop(0.62, c); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, z.x + z.w + 260, H); }
    else { const y1 = z.y + z.h + 200; g = ctx.createLinearGradient(0, 0, 0, y1); g.addColorStop(0, c); g.addColorStop(0.7, c); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, y1); }
    ctx.restore();
  };
  // a scene may use its own theme (e.g. a light CTA card inside a dark video): swapped while that scene draws
  function drawScene(sc, t) {
    if (sc.theme && !sc._th) sc._th = theme(sc.theme);
    const keep = TH; if (sc._th) TH = KV.theme = sc._th;
    try { drawScene0(sc, t); } finally { TH = KV.theme = keep; }
  }
  function drawScene0(sc, t) {
    const st = t - sc.t0, layers = prep(sc), cam = camOf(sc, st);
    let fin = false;
    for (const L of layers) {
      const cat = catOf(L);
      if (!fin && RANK[cat] >= 3) { finishing(sc); fin = true; }
      if (cam && CAM_CATS[cat]) {
        // `depth` (multiplane parallax): 0.2 far ... 1 subject (default) ... 1.5 foreground scales the camera move per layer
        const d = RM || L.depth == null ? 1 : +R(L.depth), s = d === 1 ? cam.s : 1 + (cam.s - 1) * d;
        ctx.save(); if (cam.jx || cam.jy) ctx.translate(cam.jx, cam.jy);
        ctx.translate(cam.px, cam.py); ctx.scale(s, s); if (cam.r) ctx.rotate(cam.r); ctx.translate(-cam.px - cam.x * d, -cam.py - cam.y * d);
        drawLayer(L, sc, st, t); ctx.restore();
      } else drawLayer(L, sc, st, t);
    }
    if (!fin) finishing(sc);
  }
  function onBuffer(fn) {
    if (!BUF) { BUF = document.createElement('canvas'); BUF.width = W; BUF.height = H; }
    const main = MV.cv, mctx = ctx;
    MV.init(BUF); ctx = MV.ctx; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
    try { fn(); } finally { MV.init(main); ctx = mctx; }
    return BUF;
  }
  // library transitions: KV.transition('name', (k, draw, tr, h) => {...}); draw.a() / draw.b() paint the outgoing / incoming
  // scene, h = { ctx, W, H, u, col, onBuffer, clip(x, y, w, h), E }. Registered names are valid `trans` types.
  KV.TRANS = KV.TRANS || {};
  KV.transition = (name, fn) => { KV.TRANS[name] = fn; return name; };
  function transition(tr, a, b, t, k) {
    if (KV.TRANS[tr.type]) return KV.TRANS[tr.type](k, { a: () => drawScene(a, t), b: () => drawScene(b, Math.max(t, b.t0)) }, tr, { ctx, W, H, u: U, col: KV.col, onBuffer, E, clip: (x, y, w, h) => { ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); } });
    const c = KV.col(tr.color || 'a1');
    const dir = R(tr.dir) || 'left', sx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0, sy = dir === 'up' ? -1 : dir === 'down' ? 1 : 0;
    const clipRect = (x, y, w, h) => { ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); };
    switch (tr.type) {
      case 'fade': { drawScene(a, t); const buf = onBuffer(() => drawScene(b, Math.max(t, b.t0))); ctx.save(); ctx.globalAlpha = k; ctx.drawImage(buf, 0, 0); ctx.restore(); break; }
      case 'dip': { if (k < 0.5) { drawScene(a, t); MV.fade(KV.col(tr.color || 'bg'), k * 2); } else { drawScene(b, Math.max(t, b.t0)); MV.fade(KV.col(tr.color || 'bg'), (1 - k) * 2); } break; }
      case 'slide': {
        const e = E.io(k), ox = sx * W, oy = sy * H;
        ctx.save(); ctx.translate(ox * e, oy * e); clipRect(0, 0, W, H); drawScene(a, t); ctx.restore();
        ctx.save(); ctx.translate(-ox * (1 - e), -oy * (1 - e)); clipRect(0, 0, W, H); drawScene(b, Math.max(t, b.t0)); ctx.restore();
        break;
      }
      case 'wipe': {
        const e = E.io(k); drawScene(a, t);
        ctx.save();
        if (sy) clipRect(0, sy < 0 ? H * (1 - e) : 0, W, H * e); else clipRect(sx < 0 ? W * (1 - e) : 0, 0, W * e, H);
        drawScene(b, Math.max(t, b.t0)); ctx.restore();
        ctx.save(); ctx.fillStyle = c;
        if (sy) ctx.fillRect(0, (sy < 0 ? H * (1 - e) : H * e) - 6 * U, W, 12 * U); else ctx.fillRect((sx < 0 ? W * (1 - e) : W * e) - 6 * U, 0, 12 * U, H);
        ctx.restore(); break;
      }
      case 'iris': {
        const e = E.io(k), cx = (tr.at || [0.5, 0.5])[0] * W, cy = (tr.at || [0.5, 0.5])[1] * H, Rr = e * Math.hypot(W, H) * 0.62;
        drawScene(a, t); ctx.save(); MV.circle(cx, cy, Rr); ctx.clip(); drawScene(b, Math.max(t, b.t0)); ctx.restore();
        ctx.save(); ctx.strokeStyle = c; ctx.lineWidth = (18 * (1 - e) + 4) * U; MV.circle(cx, cy, Rr); ctx.stroke(); ctx.restore(); break;
      }
      case 'zoom': {
        const e = E.io(k);
        ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(lerp(1.12, 1, e), lerp(1.12, 1, e)); ctx.translate(-W / 2, -H / 2); drawScene(b, Math.max(t, b.t0)); ctx.restore();
        const buf = onBuffer(() => drawScene(a, t));
        ctx.save(); ctx.globalAlpha = 1 - e; ctx.translate(W / 2, H / 2); ctx.scale(1 + 0.5 * e, 1 + 0.5 * e); ctx.drawImage(buf, -W / 2, -H / 2); ctx.restore(); break;
      }
      case 'band': {
        const e = E.io(k), c2 = KV.col(tr.color2 || 'a2'), sk = 0.18 * H;
        if (k < 0.5) drawScene(a, t); else drawScene(b, Math.max(t, b.t0));
        const x0 = k < 0.5 ? -sk : (e * 2 - 1) * (W + 2 * sk) - sk, x1 = k < 0.5 ? e * 2 * (W + 2 * sk) : W + 2 * sk;
        ctx.save();
        for (const [col, off] of [[c2, 0.06 * W], [c, 0]]) {
          ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x0 - off, 0); ctx.lineTo(x1 - off, 0); ctx.lineTo(x1 - off - sk, H); ctx.lineTo(x0 - off - sk, H); ctx.closePath(); ctx.fill();
        }
        ctx.restore(); break;
      }
      default: { if (!KV._warned) { console.warn(`unknown transition ${tr.type}: using fade`); KV._warned = 1; } drawScene(a, t); const buf = onBuffer(() => drawScene(b, Math.max(t, b.t0))); ctx.save(); ctx.globalAlpha = k; ctx.drawImage(buf, 0, 0); ctx.restore(); }
    }
  }
  KV.sceneAt = t => { const S = TL.scenes; for (let i = S.length - 1; i >= 0; i--) if (t >= S[i].t0) return i; return 0; };
  const RM_TRANS = new Set(['cut', 'fade', 'dip', 'flash']);
  function frame(t, f) {
    ctx = MV.ctx; KV.PINS = {};
    let i = KV.sceneAt(t); const nx = TL.scenes[i + 1];
    if (nx && nx.trans.o > 0 && t >= nx.t0 - nx.trans.o) i++;                     // align: the next transition opens before its boundary
    const sc = TL.scenes[i], tr = sc.trans, k = tr.d > 0 ? (t - sc.t0 + (tr.o || 0)) / tr.d : 1;
    // reduced motion: moving transitions become a cross-fade of the same length (cut / fade / dip / flash unchanged)
    if (i > 0 && k < 1) transition(RM && !RM_TRANS.has(tr.type) ? Object.assign({}, tr, { type: 'fade' }) : tr, TL.scenes[i - 1], sc, t, k); else drawScene(sc, t);
    if (tr.type === 'flash' && t - sc.t0 < 0.25) MV.fade(tr.color ? KV.col(tr.color) : '#FFFFFF', 0.9 * (1 - (t - sc.t0) / 0.25));
    if (SB.watermark && !sc.end && KV.blocks.watermark) drawLayer(Object.assign({ id: 'watermark', kind: 'watermark', enter: 'none' }, SB.watermark === true ? {} : SB.watermark), sc, t - sc.t0, t);
    // burned captions (blocks/ad.js): SB.captions 'burn' = every content scene (any line playing), scene captions 'burn' =
    // that scene's own lines, scene captions: false = off; an object passes block props ({ px, pos, bgColor, maxChars })
    const cap = sc.captions ?? SB.captions;
    if (cap && !sc.end && KV.blocks.captions) drawLayer(Object.assign({ id: 'captions', kind: 'captions', enter: 'none', all: sc.captions == null }, typeof cap === 'object' ? cap : {}), sc, t - sc.t0, t);
    if (TH.grain > 0) MV.grain(f, false, TH.grain);
  }

  // ------------------------------------------------------------------ boot
  KV.boot = spec => {
    SB = KV.SB = spec;
    const cv = document.getElementById('c');
    W = cv.width; H = cv.height; A = KV.A = KVC.aspectKey(W, H); U = KV.u = Math.min(W, H) / 1080;
    TL = KV.TL = window.TL = KVC.compile(SB, KV.presets);
    TH = KV.theme = theme(SB.theme);
    Z = KV.Z = zones();
    // SB.motion 'reduced' (or window.KV_MOTION, set by a build variant before boot): fades instead of moves, no parallax /
    // shake / spin / motion blur / rack focus, idles at 30 %, camera zoom at 25 %, moving transitions -> fade
    RM = KV.reduced = ((typeof window !== 'undefined' && window.KV_MOTION) || SB.motion) === 'reduced';
    try { KV.ISSUES = validate(); } catch (e) { KV.ISSUES = [{ level: 'warn', rule: 'motion', msg: 'motion name check failed: ' + e.message }]; }
    for (const x of KV.ISSUES) console.warn(`kv ${x.rule}: ${x.scene || ''} ${x.layer || ''} ${x.msg}`);
    PULSE = MV.pulseFrom(TL.kicks, 7);
    const images = {};
    if (typeof BRAND !== 'undefined') { if (BRAND.logoWide) images.logo = BRAND.logoWide; if (BRAND.logoWideInverse) images.logoInverse = BRAND.logoWideInverse; if (BRAND.mark) images.mark = BRAND.mark; }
    // asset paths: relative to the project folder, or absolute (C:\... or /...) -> file:// URL
    const url = s => /^[A-Za-z]:[\\/]/.test(s) ? 'file:///' + s.replace(/\\/g, '/') : s.startsWith('/') && !s.startsWith('//') ? 'file://' + s : s;
    for (const [k, a] of Object.entries(SB.assets || {})) images[k] = url(typeof a === 'string' ? a : a.src);
    const fonts = [`${TH.headW} 60px ${TH.head}`, `700 40px ${TH.body}`, `400 40px ${TH.body}`];
    MV.boot({
      canvas: cv, images, fonts, fps: TL.fps, fx: { vignette: { alpha: TH.vignette || 0.001 } },
      prepare: async () => {
        for (const f of SB.fonts || []) { const ff = new FontFace(f.family, `url("${f.src}")`, { weight: String(f.weight || 'normal') }); await ff.load(); document.fonts.add(ff); }
        for (const B of Object.values(KV.blocks)) if (B.prepare) await B.prepare(SB, KV);
        ctx = MV.ctx; for (const sc of TL.scenes) prep(sc);
      },
      draw: frame
    });
    // layout probe for kv lint: renders frame t and returns every text/box measured on it
    window.kvProbe = t => { PROBE = { t, scene: TL.scenes[KV.sceneAt(t)].id, A, W, H, texts: [], boxes: [], issues: KV.ISSUES || [] }; try { window.renderFrame(t); return PROBE; } finally { PROBE = null; } };
  };
})();
