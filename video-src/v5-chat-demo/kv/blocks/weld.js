/* KV library "weld" — industrial / welding effects ported from productions 06 (vnj-airobot-ads) and
 * 08 (vnj-airobot-nhip-han). Same tier-3 contract as kv-blocks.js: draw around the origin inside env.box,
 * pure function of time (env.t / env.lt / env.beat), no Math.random / Date.now / carried state.
 */
(function () {
  'use strict';
  const { clamp, lerp, E, hash } = MV;
  const D = KV.define, col = (c, fb) => KV.col(c, fb);
  const TAU = Math.PI * 2;

  // Heat ramp: dark red -> orange -> hot yellow -> white, mixed down to a cooled "steel" colour at T=0.
  function heatMix(T, cool) {
    T = clamp(T);
    if (T <= 0.001) return cool;
    if (T <= 0.2) return MV.mixc(cool, '#7A2A12', T / 0.2);
    if (T <= 0.5) return MV.mixc('#7A2A12', '#FF7A1F', (T - 0.2) / 0.3);
    if (T <= 0.8) return MV.mixc('#FF7A1F', '#FFD9A0', (T - 0.5) / 0.3);
    return MV.mixc('#FFD9A0', '#FFFFFF', (T - 0.8) / 0.2);
  }
  // Flickering MIG arc + light spill (video/06 arcLight, video/08 arcLight).
  function arcGlow(ctx, x, y, f, k, sc) {
    if (k <= 0.01) return;
    const fl = 0.7 + 0.3 * hash(f * 0.37 + 1), fl2 = 0.6 + 0.4 * hash(f * 0.91 + 5);
    MV.glow(x, y, 560 * sc, '#FF8A2A', 0.2 * k * fl);
    MV.glow(x, y, 200 * sc, '#8FD3FF', 0.5 * k * fl2);
    MV.glow(x, y, 74 * sc, '#FFFFFF', 0.95 * k);
    MV.glow(x, y, 30 * sc, '#FFFFFF', k);
  }

  // ------------------------------------------------------------------ sparks (video/06+08 `sparks`)
  // Deterministic spark shower from the origin: particle i is born at (i + jitter)/rate, ballistic + gravity,
  // optional floor bounce. Birth-indexed on env.lt so it is a pure function of time.
  D('sparks', {
    cat: 'fx', enter: 'none',
    draw(ctx, P, env) {
      const rate = P.rate ?? 90, life = P.life || [0.2, 0.6], lifeMax = life[1];
      const dir = (P.dir ?? -90) * Math.PI / 180, spread = (P.spread ?? 70) * Math.PI / 180;
      const ang0 = dir - spread / 2, ang1 = dir + spread / 2;
      const speed = P.speed || [250, 900], g = (P.gravity ?? 1700) * env.u, sc = env.u * (P.scale ?? 1);
      const seed = P.seed ?? 0, floor = P.floor != null ? P.floor * env.u : undefined;
      const t1 = P.dur != null ? env.T(P.dur) : Infinity, tEnd = Math.min(env.lt, t1);
      const i1 = Math.floor(tEnd * rate); if (i1 < 0) return;
      const i0 = Math.max(0, Math.floor((env.lt - lifeMax) * rate) - 1);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      for (let i = i0; i <= i1; i++) {
        const hs = n => hash(i * 7.13 + n * 1.71 + seed * 13.1);
        const b = (i + hs(1) * 0.9) / rate, age = env.lt - b, lifeI = lerp(life[0], lifeMax, hs(2));
        if (age < 0 || age > lifeI || b > t1) continue;
        const ang = lerp(ang0, ang1, hs(3)), sp = lerp(speed[0], speed[1], Math.pow(hs(4), 1.3)) * sc;
        const vx = Math.cos(ang) * sp, vy = Math.sin(ang) * sp, x = vx * age;
        let y = vy * age + 0.5 * g * age * age, vyt = vy + g * age;
        if (floor !== undefined && y > floor) { y = floor - (y - floor) * 0.22; vyt = -vyt * 0.22; }
        const k = age / lifeI, dt = 0.02;
        ctx.globalAlpha = (1 - k * k) * (P.alpha ?? 1);
        ctx.strokeStyle = k < 0.22 ? '#FFF6D8' : k < 0.5 ? '#FFC45A' : '#FF7A1F';
        ctx.lineWidth = (P.width ?? 2.6) * sc * (1 - 0.5 * k);
        ctx.beginPath(); ctx.moveTo(x - vx * dt, y - vyt * dt); ctx.lineTo(x, y); ctx.stroke();
      }
      ctx.restore();
    }
  });

  // ------------------------------------------------------------------ arc (video/06 `arcLight` + `plate`)
  // MIG arc flicker at the origin; P.plate (default true) fills the box with a scrolling steel plate,
  // P.bead: true adds a cooling weld bead trailing behind the arc (heat ramp, ripple ellipses, glow dots).
  D('arc', {
    cat: 'fx', at: 'visual', enter: 'fade',
    draw(ctx, P, env) {
      const u = env.u, sc = (P.scale ?? 1) * u, f = env.t * 50, b = env.box;
      let ay = 0;
      if (P.plate !== false) {
        const beadY = b.y + (P.beadY ?? 0.14) * b.h;
        const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
        g.addColorStop(0, '#6A7684'); g.addColorStop(0.08, '#3A444F'); g.addColorStop(0.28, '#232A33'); g.addColorStop(0.7, '#161B22'); g.addColorStop(1, '#07090D');
        ctx.fillStyle = g; ctx.fillRect(b.x, b.y, b.w, b.h);
        const v = 250 * sc * (P.speed ?? 1);
        ctx.save(); ctx.strokeStyle = '#7C8896'; ctx.lineWidth = 1;
        for (let i = 0; i < 34; i++) {
          const y = b.y + 8 + hash(i + 40) * b.h * 0.9, len = (80 + hash(i + 41) * 300) * u, span = b.w + 500 * u;
          const x = b.x + (((hash(i + 42) * span - v * env.t) % span + span) % span) - 250 * u;
          ctx.globalAlpha = 0.05 + 0.1 * hash(i + 43); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y); ctx.stroke();
        }
        ctx.restore();
        if (P.bead) {
          const step = 9 * sc, off = (v * env.t) % step, cool = col(P.cool || '#4A4744');
          for (let x = -off; x > b.x - step; x -= step) {
            const d = -x, T = Math.exp(-d / (240 * sc));
            ctx.fillStyle = heatMix(T, cool);
            ctx.beginPath(); ctx.ellipse(x, beadY, step * 0.95, 8.5 * sc, 0, 0, TAU); ctx.fill();
            ctx.strokeStyle = `rgba(255,255,255,${(0.12 + 0.3 * T).toFixed(3)})`; ctx.lineWidth = 1.5 * sc;
            ctx.beginPath(); ctx.ellipse(x + step * 0.25, beadY - 1.7 * sc, step * 0.7, 6.1 * sc, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
          }
          for (let d = 0; d < 360 * sc; d += 24 * sc) MV.glow(-d, beadY, 34 * sc, '#FF8A2A', 0.55 * Math.exp(-d / (160 * sc)));
        }
        ay = beadY - 6 * sc;
      }
      arcGlow(ctx, 0, ay, f, 1, sc);
    }
  });

  // ------------------------------------------------------------------ weld-text (video/08 weldPrep/weldText/torch/seamGlow)
  // Text welded letter by letter: a torch runs left-to-right, each glyph appears only once "welded" then
  // cools from white-hot to P.color. Calls env.note for the whole text box so lint checks contrast/overlap.
  D('weld-text', {
    cat: 'copy', at: 'stage', enter: 'none',
    draw(ctx, P, env) {
      const st = KV.TEXT_STYLE[P.style || 'title'] || KV.TEXT_STYLE.title;
      const px = P.px != null ? env.R(P.px) : env.R(st.px) || 90;
      const weight = P.weight || env.theme.headW, font = env.font(P.font || 'head', weight, px);
      const ls = P.ls ?? 0, cool = col(P.color || 'ink');
      ctx.save(); ctx.font = font; ctx.letterSpacing = '0px'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      const str = String(P.text ?? '').normalize('NFC'), chars = [...str];
      const widths = chars.map(c => ctx.measureText(c).width);
      const w = widths.reduce((a, v) => a + v, 0) + ls * Math.max(0, chars.length - 1);
      const align = P.align || 'center', x0 = align === 'left' ? 0 : align === 'right' ? -w : -w / 2;
      env.note({ text: str, x: x0, y: -px * 0.82, w, h: px * 1.15, px, color: cool });
      const rate = P.speed ?? Math.max(5, 60 / Math.max(4, chars.length)), dur = Math.max(0.2, chars.length / rate);
      const frac = clamp(env.lt / dur), tau = P.tau ?? 0.35;
      let cx = x0;
      for (let i = 0; i < chars.length; i++) {
        const chFrac = (i + 0.65) / chars.length, welded = env.lt - chFrac * dur;
        if (welded >= 0) {
          const T = Math.exp(-welded / tau);
          if (T > 0.04) MV.glow(cx + widths[i] / 2, -px * 0.32, px * 0.55, T > 0.6 ? '#FFC060' : '#FF8A2A', T * 0.5);
          ctx.fillStyle = T > 0.02 ? heatMix(T, cool) : cool;
          ctx.fillText(chars[i], cx, 0);
        }
        cx += widths[i] + ls;
      }
      if (frac < 1) {
        const tx = x0 + w * frac, sc = px / 130;
        arcGlow(ctx, tx, -px * 0.28, env.t * 50, 1, sc);
        ctx.save(); ctx.translate(tx, -px * 0.28); ctx.rotate(-0.95);
        const g = ctx.createLinearGradient(-14 * sc, 0, 14 * sc, 0);
        g.addColorStop(0, '#5E6974'); g.addColorStop(0.5, '#E6ECF2'); g.addColorStop(1, '#4C5560');
        ctx.fillStyle = g; ctx.fillRect(-10 * sc, 6 * sc, 20 * sc, 66 * sc);
        ctx.fillStyle = '#C8813E'; ctx.fillRect(-6 * sc, -6 * sc, 12 * sc, 14 * sc);
        ctx.restore();
      }
      ctx.restore();
    }
  });

  // ------------------------------------------------------------------ markers (video/06 `marker` + `system` legend)
  // Numbered pins on this layer's own box (P.items: [{x, y, label}], fractions of the box), staggered by
  // P.step beats, with a leader line to an optional legend list (P.legend, default on).
  D('markers', {
    cat: 'ui', at: 'visual', enter: 'none',
    draw(ctx, P, env) {
      const items = P.items || [], b = env.box, u = env.u;
      const step = env.T(P.step ?? 0.3), accent = col(P.color || 'a1');
      const legendOn = P.legend !== false, side = P.legendAt === 'right' ? 1 : -1;
      const r0 = (P.r ?? 20) * u, size = P.legendSize ?? 30 * u, rowH = size * 1.8;
      // legend docks INSIDE the box, hugging its left/right edge, so it never runs past the frame.
      const labelW = Math.min(0.42 * b.w, 220 * u), inset = 24 * u;
      const dotX = side > 0 ? b.x + b.w - inset : b.x + inset;
      const legendTop = b.y + b.h * (P.legendY ?? 0.08);
      items.forEach((it, i) => {
        const t0 = i * step, age = env.lt - t0; if (age < 0) return;
        const k = E.oB(clamp(age / 0.4)), x = b.x + it.x * b.w, y = b.y + it.y * b.h, r = r0 * k;
        if (age < 0.8) { ctx.save(); ctx.strokeStyle = accent; ctx.globalAlpha = 1 - age / 0.8; ctx.lineWidth = 3 * u; MV.circle(x, y, r0 + 60 * u * E.o(age / 0.8)); ctx.stroke(); ctx.restore(); }
        ctx.save(); ctx.globalAlpha *= clamp(k * 2);
        MV.glow(x, y, r * 3, '#000000', 0.3);
        ctx.fillStyle = accent; MV.circle(x, y, r); ctx.fill();
        ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 3 * u; ctx.stroke();
        MV.text(String(i + 1), x, y + r * 0.4, { font: env.font('head', 800, Math.max(1, r * 1.2)), color: '#14161B', align: 'center' });
        ctx.restore();
        if (legendOn && it.label) {
          const ly = legendTop + i * rowH, textX = side > 0 ? dotX - 20 * u : dotX + 20 * u;
          ctx.save(); ctx.globalAlpha *= clamp(k * 2) * 0.5; ctx.strokeStyle = accent; ctx.lineWidth = 2 * u;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(dotX, ly); ctx.stroke(); ctx.restore();
          ctx.save(); ctx.globalAlpha *= clamp(k * 2);
          ctx.fillStyle = 'rgba(8,10,13,0.7)'; MV.rr(side > 0 ? dotX - 22 * u - labelW : dotX - 22 * u, ly - size * 0.62, labelW + 22 * u, size * 1.24, size * 0.3); ctx.fill();
          ctx.fillStyle = accent; MV.circle(dotX, ly, 11 * u); ctx.fill();
          env.note({ text: it.label, x: side > 0 ? textX - labelW : textX, y: ly - size * 0.5, w: labelW, h: size * 1.1, px: size, color: col('ink') });
          MV.text(it.label, textX, ly + size * 0.32, { font: env.font('body', 600, size), color: col('ink'), align: side > 0 ? 'right' : 'left' });
          ctx.restore();
        }
      });
    }
  });

  // ------------------------------------------------------------------ stamp (video/08 makePlaque + plaque)
  // Hydraulic press slams a steel plaque with debossed text: descend, impact glow + dust, stamped letters
  // cool from white-hot, lift off. P.lead (seconds/beats, default 0.35s) = anticipation before impact.
  const plaqueCache = new Map();
  function getPlaque(w, h) {
    const key = Math.round(w) + 'x' + Math.round(h); let c = plaqueCache.get(key);
    if (!c) {
      c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
      const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, c.width, c.height);
      gr.addColorStop(0, '#B9C2CC'); gr.addColorStop(0.5, '#A3ADB8'); gr.addColorStop(1, '#8E98A4');
      g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height); g.lineWidth = 1;
      for (let i = 0; i < 500; i++) {
        const y = hash(i * 1.31 + 5) * c.height, x = hash(i * 2.17 + 9) * (c.width + 200) - 200, len = 60 + hash(i * 3.9 + 1) * 300;
        g.strokeStyle = hash(i * 5.3) > 0.5 ? `rgba(255,255,255,${(0.05 + 0.1 * hash(i * 7.7)).toFixed(3)})` : `rgba(40,48,58,${(0.05 + 0.1 * hash(i * 8.9)).toFixed(3)})`;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y); g.stroke();
      }
      const sh = g.createLinearGradient(0, 0, c.width, 0); sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.35, 'rgba(255,255,255,0.14)'); sh.addColorStop(0.5, 'rgba(255,255,255,0)');
      g.fillStyle = sh; g.fillRect(0, 0, c.width, c.height);
      plaqueCache.set(key, c);
    }
    return c;
  }
  D('stamp', {
    cat: 'media', at: 'stage', enter: 'pop',
    draw(ctx, P, env) {
      const b = env.box, u = env.u, sc = b.h / 250;
      const lead = P.lead != null ? env.T(P.lead) : 0.35, d = env.lt - lead;
      const PLQ = getPlaque(b.w, b.h);
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 24 * u; ctx.shadowOffsetY = 10 * u; ctx.fillStyle = '#3A424C'; MV.rr(b.x, b.y, b.w, b.h, 12 * u); ctx.fill(); ctx.restore();
      ctx.save(); MV.rr(b.x, b.y, b.w, b.h, 12 * u); ctx.clip(); ctx.drawImage(PLQ, b.x, b.y, b.w, b.h);
      const bv = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
      bv.addColorStop(0, 'rgba(255,255,255,0.18)'); bv.addColorStop(0.12, 'rgba(255,255,255,0)'); bv.addColorStop(0.88, 'rgba(0,0,0,0)'); bv.addColorStop(1, 'rgba(0,0,0,0.3)');
      ctx.fillStyle = bv; ctx.fillRect(b.x, b.y, b.w, b.h); ctx.restore();
      for (const [sx, sy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const x = b.x + 18 * sc + sx * (b.w - 36 * sc), y = b.y + 18 * sc + sy * (b.h - 36 * sc);
        ctx.fillStyle = '#5B6570'; MV.circle(x, y, 7 * sc); ctx.fill();
        ctx.strokeStyle = '#2A3038'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 4 * sc, y); ctx.lineTo(x + 4 * sc, y); ctx.stroke();
      }
      const label = String(P.text ?? '');
      if (d >= 0 && label) {
        const size = Math.min(b.h * 0.5, MV.fitFont(label, 700, 130 * sc, b.w - 70 * sc, env.theme.head, '4px', 20));
        const f = env.font('head', 700, size), cx = b.x + b.w / 2, cy = b.y + b.h / 2 + size * 0.36;
        env.note({ text: label, x: cx - (b.w - 70 * sc) / 2, y: cy - size * 0.85, w: b.w - 70 * sc, h: size * 1.1, px: size, color: '#161A1F' });
        MV.text(label, cx + 2, cy + 3, { font: f, color: 'rgba(255,255,255,0.55)', align: 'center', ls: '4px' });
        MV.text(label, cx - 1.5, cy - 2, { font: f, color: 'rgba(0,0,0,0.55)', align: 'center', ls: '4px' });
        MV.text(label, cx, cy, { font: f, color: '#161A1F', align: 'center', ls: '4px' });
        const T = Math.exp(-d / 0.45);
        if (T > 0.02) {
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          MV.text(label, cx, cy, { font: f, color: heatMix(T, '#000000'), align: 'center', ls: '4px', alpha: Math.min(1, T * 1.3) }); ctx.restore();
          MV.glow(cx, cy - size * 0.35, b.w * 0.55, '#FF8A2A', 0.45 * T);
        }
        for (let j = 0; j < 22; j++) {
          const age = d - hash(j + 50) * 0.05; if (age < 0 || age > 0.9) continue;
          const side = j % 2 ? 1 : -1, ox = b.x + (side > 0 ? b.w : 0), oy = b.y + b.h * (0.3 + 0.7 * hash(j + 3));
          const vx = side * (150 + 450 * hash(j + 5)) * u, vy = (-120 - 300 * hash(j + 7)) * u;
          const x = ox + vx * age, y = oy + vy * age + 700 * u * age * age, k = age / 0.9;
          ctx.fillStyle = `rgba(176,166,150,${(0.5 * (1 - k)).toFixed(3)})`; MV.circle(x, y, (1.2 + 2.6 * hash(j + 9)) * (1 + 0.6 * k) * u); ctx.fill();
        }
      }
      const down = E.i(clamp((env.lt - (lead - 0.1)) / 0.1)), up = E.io(clamp((env.lt - (lead + 0.06)) / 0.34)), pos = d < 0 ? down : 1 - up;
      if (pos > 0.001 && env.lt < lead + 0.42) {
        const lift = (1 - pos) * (b.h + 60 * u), hx0 = b.x - 10 * u, hy = b.y - 10 * u - lift, hw = b.w + 20 * u, hh = b.h + 20 * u;
        ctx.save();
        ctx.fillStyle = '#39414B'; ctx.fillRect(b.x + b.w / 2 - 34 * sc, hy - 260 * u, 68 * sc, 260 * u);
        const g = ctx.createLinearGradient(hx0, 0, hx0 + hw, 0); g.addColorStop(0, '#2A3038'); g.addColorStop(0.5, '#56606C'); g.addColorStop(1, '#232830');
        ctx.fillStyle = g; MV.rr(hx0, hy, hw, hh, 10 * u); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2; MV.rr(hx0, hy, hw, hh, 10 * u); ctx.stroke();
        ctx.restore();
      }
      if (d >= 0 && d < 0.35) MV.glow(b.x + b.w / 2, b.y + b.h, b.w * 0.7, '#FFE2B0', 0.5 * Math.exp(-d * 12));
    }
  });

  // ------------------------------------------------------------------ sequencer (video/08 4x4 tack-point grid)
  // P.cols x P.rows step pads on a steel slab, one pad per P.div-th of a beat (default 16ths), P.pattern
  // (array of 0/1) lights armed pads as the playhead crosses them; synced to env.beat (seconds/beat).
  D('sequencer', {
    cat: 'media', at: 'stage', enter: 'fade',
    draw(ctx, P, env) {
      const cols = P.cols ?? 4, rows = P.rows ?? 4, n = cols * rows, pattern = P.pattern || [];
      const b = env.box, u = env.u, g = Math.min(b.w / cols, b.h / rows);
      const div = P.div ?? 4, stepDur = env.beat / div, step = Math.floor(env.lt / stepDur) % n;
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 30 * u; ctx.fillStyle = '#20262E'; MV.rr(b.x, b.y, b.w, b.h, 12 * u); ctx.fill(); ctx.restore();
      ctx.save(); MV.rr(b.x, b.y, b.w, b.h, 12 * u); ctx.clip();
      const sg = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
      sg.addColorStop(0, '#2A3038'); sg.addColorStop(0.5, '#171B21'); sg.addColorStop(1, '#0B0D10');
      ctx.fillStyle = sg; ctx.fillRect(b.x, b.y, b.w, b.h);
      for (let i = 0; i < 60; i++) {
        const y = b.y + hash(i + 1) * b.h, x = b.x + hash(i + 2) * b.w - 100 * u, len = (60 + hash(i + 3) * 220) * u;
        ctx.strokeStyle = hash(i + 4) > 0.5 ? 'rgba(200,212,226,0.05)' : 'rgba(0,0,0,0.08)';
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y); ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = 'rgba(214,226,240,0.28)'; ctx.lineWidth = 2; MV.rr(b.x + 1, b.y + 1, b.w - 2, b.h - 2, 12 * u); ctx.stroke();
      for (let i = 0; i < n; i++) {
        const cx = b.x + (i % cols + 0.5) * g, cy = b.y + (Math.floor(i / cols) + 0.5) * g, r = g * 0.32, on = !!pattern[i];
        const sinceHit = (((env.lt - i * stepDur) % (n * stepDur)) + n * stepDur) % (n * stepDur);
        const isNow = i === step, T = on ? Math.exp(-sinceHit / 0.5) : 0;
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; MV.circle(cx + r * 0.08, cy + r * 0.14, r * 1.1); ctx.fill();
        const gr = ctx.createRadialGradient(cx + r * 0.35, cy + r * 0.35, r * 0.1, cx, cy, r);
        gr.addColorStop(0, on ? '#5A6672' : '#3D444C'); gr.addColorStop(1, '#12151A');
        ctx.fillStyle = gr; MV.circle(cx, cy, r); ctx.fill();
        if (isNow) { ctx.save(); ctx.strokeStyle = col(P.color || 'a1'); ctx.globalAlpha = 0.9; ctx.lineWidth = r * 0.16; MV.circle(cx, cy, r * 1.18); ctx.stroke(); ctx.restore(); }
        if (T > 0.03) {
          MV.glow(cx, cy, r * (2 + 3 * T), T > 0.6 ? '#FFC060' : col(P.color || 'a1'), T * 0.8);
          ctx.save(); ctx.fillStyle = col(P.color || 'a1'); ctx.globalAlpha = Math.min(1, T * 1.2); MV.circle(cx, cy, r * 0.55); ctx.fill(); ctx.restore();
        }
      }
    }
  });

  // ------------------------------------------------------------------ kaleido (video/08 `kaleido`)
  // Kaleidoscope mirror of a photo (P.src asset key, P.segments), rotating continuously — no strobing,
  // so it never breaks the 3-flashes/s rule on its own.
  D('kaleido', {
    cat: 'fx', at: 'stage', enter: 'fade',
    draw(ctx, P, env) {
      const img = env.img(P.src); if (!img) return;
      const b = env.box, R = Math.max(b.w, b.h) * 0.8, n = P.segments ?? 10, a = TAU / n;
      const asset = (KV.SB.assets || {})[P.src] || {};
      const [sx, sy, sw, sh] = P.crop || asset.crop || [0, 0, img.width, img.height];
      const rot = env.lt * (P.speed ?? 0.25), dh = R * sh / sw;
      ctx.save(); ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip();
      for (let k = 0; k < n; k++) {
        ctx.save(); ctx.rotate(rot + k * a); if (k % 2) ctx.scale(1, -1);
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.lineTo(R * Math.cos(-a / 2 - 0.004), R * Math.sin(-a / 2 - 0.004));
        ctx.lineTo(R * Math.cos(a / 2 + 0.004), R * Math.sin(a / 2 + 0.004));
        ctx.closePath(); ctx.clip();
        ctx.drawImage(img, sx, sy, sw, sh, 0, -dh / 2, R, dh);
        ctx.restore();
      }
      ctx.restore();
    }
  });

  // ------------------------------------------------------------------ model3d (video/06 solid/buildModel/projector/drawModel)
  // Illustrative 3D weldment (painter's-algorithm flat-shaded solid), slow rotation, a laser section line
  // sweeping in P.scan: [inBeat, outBeat], and its weld seams lighting up as the scan passes them.
  function solid3(v, faces) {
    const c = v.reduce((a, p) => [a[0] + p[0] / v.length, a[1] + p[1] / v.length, a[2] + p[2] / v.length], [0, 0, 0]);
    return {
      faces: faces.map(ix => {
        const pv = ix.map(i => v[i]), fc = pv.reduce((a, p) => [a[0] + p[0] / pv.length, a[1] + p[1] / pv.length, a[2] + p[2] / pv.length], [0, 0, 0]);
        const uu = pv[1].map((x, j) => x - pv[0][j]), ww = pv[2].map((x, j) => x - pv[0][j]);
        let nn = [uu[1] * ww[2] - uu[2] * ww[1], uu[2] * ww[0] - uu[0] * ww[2], uu[0] * ww[1] - uu[1] * ww[0]];
        const nl = Math.hypot(...nn) || 1; nn = nn.map(x => x / nl);
        if (nn[0] * (fc[0] - c[0]) + nn[1] * (fc[1] - c[1]) + nn[2] * (fc[2] - c[2]) < 0) nn = nn.map(x => -x);
        return { v: pv, c: fc, n: nn };
      })
    };
  }
  const box3 = (x0, x1, y0, y1, z0, z1) => solid3([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
    [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [3, 2, 6, 7], [0, 3, 7, 4], [1, 2, 6, 5]]);
  const gusset3 = (x0, x1, zw, zo, y0, y1) => solid3([[x0, y0, zw], [x0, y1, zw], [x0, y0, zo], [x1, y0, zw], [x1, y1, zw], [x1, y0, zo]],
    [[0, 1, 2], [3, 4, 5], [0, 1, 4, 3], [1, 2, 5, 4], [0, 2, 5, 3]]);
  function defaultPart() { // simple weldment: base plate + rib + 4 corner gussets
    const SOL = [], SECT = [], SEAMS = [], add = (s, sect) => { SOL.push(s); SECT.push(sect); };
    add(box3(-160, 160, 0, 10, -80, 80), x => Math.abs(x) <= 160 && [[0, -80], [10, -80], [10, 80], [0, 80]]);
    add(box3(-160, 160, 10, 58, -6, 6), x => Math.abs(x) <= 160 && [[10, -6], [58, -6], [58, 6], [10, 6]]);
    for (const gx of [-110, 110]) for (const sg of [-1, 1]) add(gusset3(gx - 5, gx + 5, sg * 6, sg * 48, 10, 50), x => Math.abs(x - gx) <= 5 && [[10, sg * 6], [50, sg * 6], [10, sg * 48]]);
    SEAMS.push([[-160, 10, -6], [160, 10, -6]], [[-160, 10, 6], [160, 10, 6]]);
    for (const gx of [-110, 110]) for (const sg of [-1, 1]) SEAMS.push([[gx, 10, sg * 6], [gx, 50, sg * 6]]);
    return { SOL, SECT, SEAMS };
  }
  function buildFromSpec(spec) {
    const SOL = [], SECT = [], SEAMS = spec.seams || [];
    (spec.parts || spec).forEach(p => {
      if (!p.box) return; const [x0, x1, y0, y1, z0, z1] = p.box;
      SOL.push(box3(x0, x1, y0, y1, z0, z1)); SECT.push(x => Math.abs(x - (x0 + x1) / 2) <= (x1 - x0) / 2 && [[y0, z0], [y1, z0], [y1, z1], [y0, z1]]);
    });
    return { SOL, SECT, SEAMS };
  }
  const partCache = new Map();
  function getPart(P) {
    const key = P.parts ? JSON.stringify(P.parts) : 'default'; let part = partCache.get(key);
    if (!part) { part = P.parts ? buildFromSpec(P.parts) : defaultPart(); partCache.set(key, part); }
    return part;
  }
  function projector3(yaw, pitch, scale, cx, cy) {
    const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), Dp = 1700;
    const rot = p => { const x1 = p[0] * cyw + p[2] * syw, z1 = -p[0] * syw + p[2] * cyw; return [x1, p[1] * cp - z1 * sp, p[1] * sp + z1 * cp]; };
    const Pf = p => { const r = rot([p[0], p[1] - 30, p[2]]), k = Dp / (Dp + r[2]) * scale; return [cx + r[0] * k, cy - r[1] * k, r[2]]; };
    Pf.rot = rot; Pf.D = Dp; return Pf;
  }
  const LIGHT3 = (() => { const l = [-0.35, 0.78, -0.52], n = Math.hypot(...l); return l.map(x => x / n); })();
  D('model3d', {
    cat: 'media', at: 'stage', enter: 'fade',
    draw(ctx, P, env) {
      const part = getPart(P), b = env.box, u = env.u;
      const scale = (P.scale ?? 1) * Math.min(b.w, b.h) / 380;
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      const yaw = (P.yaw ?? 0.55) + env.lt * (P.spin ?? 0.12), pitch = P.pitch ?? -0.42;
      const Pf = projector3(yaw, pitch, scale, cx, cy);
      if (P.grid !== false) {
        ctx.save(); ctx.strokeStyle = 'rgba(120,170,255,0.14)'; ctx.lineWidth = 1; ctx.beginPath();
        for (let x = -200; x <= 200; x += 50) { const a1 = Pf([x, -2, -100]), a2 = Pf([x, -2, 100]); ctx.moveTo(a1[0], a1[1]); ctx.lineTo(a2[0], a2[1]); }
        for (let z = -100; z <= 100; z += 50) { const a1 = Pf([-200, -2, z]), a2 = Pf([200, -2, z]); ctx.moveTo(a1[0], a1[1]); ctx.lineTo(a2[0], a2[1]); }
        ctx.stroke(); ctx.restore();
      }
      const list = [];
      part.SOL.forEach(s => s.faces.forEach(fc => {
        const rc = Pf.rot([fc.c[0], fc.c[1] - 30, fc.c[2]]), rn = Pf.rot(fc.n);
        if (rn[0] * -rc[0] + rn[1] * -rc[1] + rn[2] * (-Pf.D - rc[2]) > 0) list.push({ fc, z: rc[2], lum: Math.max(0, rn[0] * LIGHT3[0] + rn[1] * LIGHT3[1] + rn[2] * LIGHT3[2]) });
      }));
      list.sort((a1, a2) => a2.z - a1.z);
      ctx.save(); ctx.lineJoin = 'round';
      list.forEach(it => {
        const pts = it.fc.v.map(Pf);
        ctx.globalAlpha = 0.95; ctx.fillStyle = MV.mixc('#15202F', '#A7BAD4', 0.18 + 0.82 * it.lum);
        ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 0.35; ctx.strokeStyle = col(P.edgeColor || '#38BDF8'); ctx.lineWidth = 1.4 * u;
        ctx.beginPath(); pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); }); ctx.stroke();
      });
      ctx.restore();
      const [sIn, sOut] = P.scan || [0, 2], sk = clamp((env.lt - env.T(sIn)) / Math.max(0.001, env.T(sOut) - env.T(sIn)));
      const [xr0, xr1] = P.xRange || [-170, 170], xs = lerp(xr0, xr1, E.io(sk));
      if (sk > 0 && sk < 1) {
        ctx.save(); const scanCol = col(P.scanColor || '#38BDF8');
        for (const [w2, c2, a2] of [[10 * u, scanCol, 0.25], [4 * u, scanCol, 0.7], [1.6 * u, '#FFFFFF', 1]]) {
          ctx.strokeStyle = c2; ctx.globalAlpha = (P.scanA ?? 0.9) * a2; ctx.lineWidth = w2; ctx.beginPath();
          part.SECT.forEach(fn => { const s = fn(xs); if (!s) return; s.forEach((yz, i) => { const q = Pf([xs, yz[0], yz[1]]); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.closePath(); });
          ctx.stroke();
        }
        ctx.restore();
      }
      if (P.seams !== false) {
        ctx.save(); ctx.lineCap = 'round';
        part.SEAMS.forEach(seam => {
          const midX = (seam[0][0] + seam[1][0]) / 2, k = sk >= 1 ? 1 : clamp((xs - midX) / 60 + 0.5);
          if (k <= 0) return;
          const a1 = Pf(seam[0]), a2 = Pf(seam[1]);
          ctx.globalAlpha = k; ctx.strokeStyle = 'rgba(255,138,42,0.35)'; ctx.lineWidth = 8 * u;
          ctx.beginPath(); ctx.moveTo(a1[0], a1[1]); ctx.lineTo(a2[0], a2[1]); ctx.stroke();
          ctx.strokeStyle = '#FFD7A1'; ctx.lineWidth = 3 * u;
          ctx.beginPath(); ctx.moveTo(a1[0], a1[1]); ctx.lineTo(a2[0], a2[1]); ctx.stroke();
        });
        ctx.restore();
      }
    }
  });

  // ------------------------------------------------------------------ seam transition (video/06 `wipe`)
  // Weld-seam wipe: a white-hot diagonal seam sweeps across, the incoming scene is revealed behind it,
  // sparks fly off the edge. tr: { type: 'seam', angle (deg, default 22), color, seed }.
  KV.transition('seam', (k, draw, tr, h) => {
    const { ctx, W, H, u, col: hcol } = h, e = E.io(k);
    const ang = (tr.angle ?? 22) * Math.PI / 180, nx = Math.cos(ang), ny = -Math.sin(ang), vx = -ny, vy = nx;
    const corners = [[0, 0], [W, 0], [0, H], [W, H]].map(p => p[0] * nx + p[1] * ny);
    const dMin = Math.min(...corners) - 60 * u, dMax = Math.max(...corners) + 60 * u;
    const d = lerp(dMin, dMax, e), cx = nx * d, cy = ny * d, G = (W + H) * 1.5;
    draw.a();
    ctx.save(); ctx.beginPath();
    ctx.moveTo(cx + vx * G, cy + vy * G); ctx.lineTo(cx - vx * G, cy - vy * G);
    ctx.lineTo(cx - vx * G - nx * G, cy - vy * G - ny * G); ctx.lineTo(cx + vx * G - nx * G, cy + vy * G - ny * G);
    ctx.closePath(); ctx.clip(); draw.b(); ctx.restore();
    if (k > 0 && k < 1) {
      const seamCol = hcol(tr.color || 'a1');
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      for (const [w2, c2, a2] of [[70 * u, seamCol, 0.12], [26 * u, seamCol, 0.35], [9 * u, '#FFD9A0', 0.9], [3 * u, '#FFFFFF', 1]]) {
        ctx.strokeStyle = c2; ctx.globalAlpha = a2; ctx.lineWidth = w2;
        ctx.beginPath(); ctx.moveTo(cx + vx * G, cy + vy * G); ctx.lineTo(cx - vx * G, cy - vy * G); ctx.stroke();
      }
      ctx.restore();
      const T0 = k * (tr.d || 0.6), rate = 140, life = [0.18, 0.5], lifeMax = life[1];
      const i1 = Math.floor(T0 * rate), i0 = Math.max(0, Math.floor((T0 - lifeMax) * rate) - 1);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      for (let i = i0; i <= i1; i++) {
        const hs = nn => hash(i * 7.13 + nn * 1.71 + (tr.seed || 0) * 13.1);
        const bTime = (i + hs(1) * 0.9) / rate, age = T0 - bTime, lifeI = lerp(life[0], lifeMax, hs(2));
        if (age < 0 || age > lifeI) continue;
        const along = (hs(5) - 0.5) * Math.max(W, H) * 1.3, ox = cx + vx * along, oy = cy + vy * along;
        const ang2 = Math.atan2(vy, vx) + Math.PI / 2 + (hs(3) - 0.5) * 1.6, sp = lerp(260, 1000, Math.pow(hs(4), 1.3)) * u;
        const vxp = Math.cos(ang2) * sp, vyp = Math.sin(ang2) * sp, g2 = 1700 * u;
        const x = ox + vxp * age, y = oy + vyp * age + 0.5 * g2 * age * age, kk = age / lifeI;
        ctx.globalAlpha = 1 - kk * kk;
        ctx.strokeStyle = kk < 0.22 ? '#FFF6D8' : kk < 0.5 ? '#FFC45A' : '#FF7A1F';
        ctx.lineWidth = 2.6 * u * (1 - 0.5 * kk);
        ctx.beginPath(); ctx.moveTo(x - vxp * 0.02, y - vyp * 0.02); ctx.lineTo(x, y); ctx.stroke();
      }
      ctx.restore();
    }
  });
})();
