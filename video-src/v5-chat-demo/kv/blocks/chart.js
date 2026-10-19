/* KV library "chart" — data graphics that stay true while they animate: `bars` (+ `race`), `linechart`, `donut`.
 *   { kind: 'bars', at: 'visual', items: [{ label: '2023', value: 19 }, { label: '2024', value: 31 }], suffix: '%', src: 'c1' }
 * Rules built in: the axis appears before the values; a mark never shows a wrong value (every ease is clamped to 0..1, so
 * spring / back / anticipate eases cannot overshoot or undershoot a bar, line or segment); values count up with
 * their marks; every label is reported with env.note so kv lint checks its size, contrast and overlap on every aspect.
 * Times: beats or '0.8s'.
 */
(function () {
  'use strict';
  const { clamp, lerp, E } = MV;
  const D = KV.define, col = c => KV.col(c), TAU = Math.PI * 2;
  const fmt = (v, d = 0, P) => KV.fmtNum ? KV.fmtNum(v, d, P) : v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); // locale: kv-blocks.js
  const num = (P, v) => (P.prefix || '') + fmt(v, P.decimals || 0, P) + (P.suffix || '');
  // data progress stays inside 0..1: no overshoot past the true value, no undershoot below the baseline (spring / oB /
  // elastic / anticipate / iB eases only shape the timing; a mark never shows a wrong number)
  const easeOf = (e, d) => { const f = (e != null && KV.easeOf(e)) || d; return k => clamp(f(clamp(k))); };
  const pal = (P, o, i) => col(o.color || P.color || (P.colors ? P.colors[i % P.colors.length] : 'a' + (1 + i % 6)));
  const hexOr = (c, fb) => /^#[0-9a-f]{6}$/i.test(c) ? c : fb;
  // text helper: measured, reported to lint (env.note), drawn; returns its width
  function label(ctx, env, s, x, y, px, color, align = 'center', weight = 700, fam = 'body') {
    if (s == null || s === '') return 0;
    s = String(s); const font = env.font(fam, weight, px); ctx.font = font; ctx.letterSpacing = '0px'; const w = ctx.measureText(s).width;
    const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    env.note({ text: s, x: x0, y: y - px * 0.8, w, h: px, px, color });
    MV.text(s, x, y, { font, color, align });
    return w;
  }
  // 1-2-5 tick step for about n intervals over [a, b]
  function ticks(a, b, n = 4) {
    const raw = (b - a) / Math.max(1, n), p = Math.pow(10, Math.floor(Math.log10(raw || 1))), m = raw / p, st = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
    const out = []; for (let v = Math.floor(a / st + 1e-9) * st; v < b + st - 1e-9; v += st) out.push(+v.toFixed(10)); return { step: st, list: out }; // covers [a, b]
  }
  const minPx = env => (env.A === 'h' ? 26 : 28) * env.u;

  // ------------------------------------------------------------------ bars (column / row chart) and race mode
  D('bars', {
    cat: 'media', enter: 'fade',
    draw(ctx, P, env) {
      if (P.race) return race(ctx, P, env);
      const it = P.items || [], n = it.length, b = env.box, u = env.u; if (!n) return;
      const max = P.max ?? Math.max(...it.map(o => o.value)), step = env.T(P.step ?? '0.1s'), dur = env.T(P.grow ?? '0.8s'), e = easeOf(P.ease, E.o), t0 = env.T(P.lead ?? '0.25s');
      const ka = clamp(env.lt / 0.3), ink = col(P.labelColor || 'ink'), ink2 = col('ink2');
      if (!P.horizontal) {
        const gw = b.w / n, bw = gw * (P.barW ?? 0.62), lpx = Math.max(minPx(env), Math.min(gw * 0.3, 40 * u)), vpx = Math.max(minPx(env), Math.min(bw * 0.42, 52 * u));
        const base = b.y + b.h - lpx * 1.7, top = b.y + vpx * 1.6, H = base - top;
        ctx.save(); ctx.globalAlpha *= ka; ctx.fillStyle = col(P.axis || 'muted'); ctx.fillRect(b.x, base, b.w, 3 * u); ctx.restore(); // axis first
        it.forEach((o, i) => {
          const kr = clamp((env.lt - t0 - i * step) / dur), k = e(kr), x = b.x + gw * (i + 0.5), h = Math.max(0, o.value / max * H * k);
          if (kr <= 0) return;
          ctx.fillStyle = pal(P, o, 0); MV.rr(x - bw / 2, base - h, bw, h, Math.min(12 * u, bw / 4, h / 2)); ctx.fill();
          ctx.save(); ctx.globalAlpha *= clamp(kr * 4);
          label(ctx, env, num(P, o.value * k), x, base - h - vpx * 0.35, vpx, ink, 'center', 800, 'head');
          label(ctx, env, o.label, x, base + lpx * 1.25, lpx, ink2, 'center', 600);
          ctx.restore();
        });
      } else {
        const rh = b.h / n, bh = rh * (P.barW ?? 0.62), lpx = Math.max(minPx(env), Math.min(bh * 0.5, 40 * u)), vpx = lpx;
        ctx.font = env.font('body', 600, lpx); const lw = Math.min(b.w * 0.4, Math.max(...it.map(o => ctx.measureText(String(o.label ?? '')).width)) + lpx * 0.6);
        ctx.font = env.font('head', 800, vpx); const vw = ctx.measureText(num(P, max)).width + vpx * 0.6;
        const x0 = b.x + lw, W = b.w - lw - vw;
        ctx.save(); ctx.globalAlpha *= ka; ctx.fillStyle = col(P.axis || 'muted'); ctx.fillRect(x0 - 3 * u, b.y, 3 * u, b.h); ctx.restore();
        it.forEach((o, i) => {
          const kr = clamp((env.lt - t0 - i * step) / dur), k = e(kr), y = b.y + rh * (i + 0.5), w = Math.max(0, o.value / max * W * k);
          if (kr <= 0) return;
          ctx.fillStyle = pal(P, o, 0); MV.rr(x0, y - bh / 2, w, bh, Math.min(10 * u, bh / 4, w / 2)); ctx.fill();
          ctx.save(); ctx.globalAlpha *= clamp(kr * 4);
          label(ctx, env, o.label, x0 - lpx * 0.4, y + lpx * 0.36, lpx, ink2, 'right', 600);
          label(ctx, env, num(P, o.value * k), x0 + w + vpx * 0.3, y + vpx * 0.36, vpx, ink, 'left', 800, 'head');
          ctx.restore();
        });
      }
    }
  });
  // race: rows re-rank every period; values and ranks interpolate (ease io inside each period), axis max follows the
  // leader, colours stay with their item. race = { frames: [[v per item] per period], periods: ['2019', ...], perPeriod: 1, top: 8 }
  function race(ctx, P, env) {
    const R = P.race, F = R.frames || [], it = P.items || [], b = env.box, u = env.u; if (F.length < 1 || !it.length) return;
    const per = env.T(R.perPeriod ?? 1), q = clamp(env.lt / per, 0, F.length - 1), p = Math.min(F.length - 2, Math.floor(q)), f = F.length < 2 ? 0 : E.io(q - Math.max(0, p));
    const A = F[Math.max(0, p)], B = F[Math.min(F.length - 1, Math.max(0, p) + 1)];
    const rank = vals => { const o = vals.map((v, i) => [v, i]).sort((x, y) => y[0] - x[0] || x[1] - y[1]), r = []; o.forEach(([, i], j) => { r[i] = j; }); return r; };
    const ra = rank(A), rb = rank(B), top = Math.min(R.top ?? 8, it.length), rh = b.h / top, bh = rh * 0.72;
    const vals = it.map((_, i) => lerp(A[i] ?? 0, B[i] ?? 0, f)), mx = Math.max(1e-9, ...vals) * 1.0;
    const lpx = Math.max(minPx(env), Math.min(bh * 0.5, 38 * u)), lw = lpx * 0.5;
    ctx.font = env.font('head', 800, lpx); const vw = ctx.measureText(num(P, Math.max(...F.flat()))).width + lpx * 0.6, W = b.w - vw - lw;
    const note = env.note;
    it.forEach((o, i) => {
      const r = lerp(ra[i], rb[i], f); if (r > top - 0.02) return;
      const y = b.y + rh * (r + 0.5), w = Math.max(2 * u, vals[i] / mx * W), a = clamp(top - 0.02 - r); // the row leaving the top N fades out
      env.note = Math.abs(r - Math.round(r)) < 0.2 ? note : () => {}; // rows mid-swap cross each other for a moment: not measured
      ctx.save(); ctx.globalAlpha *= a;
      ctx.fillStyle = pal(P, o, i); MV.rr(b.x + lw, y - bh / 2, w, bh, Math.min(10 * u, bh / 4));  ctx.fill();
      const fg = KV.onColor(hexOr(pal(P, o, i), '#000000')), name = String(o.label ?? '');
      ctx.font = env.font('body', 700, lpx); const nw = ctx.measureText(name).width;
      if (nw + lpx < w) label(ctx, env, name, b.x + lw + w - lpx * 0.4, y + lpx * 0.36, lpx, fg, 'right', 700); // name inside the bar
      else label(ctx, env, name, b.x + lw + w + vw, y + lpx * 0.36, lpx, col('ink2'), 'left', 700);
      label(ctx, env, num(P, vals[i]), b.x + lw + w + lpx * 0.3, y + lpx * 0.36, lpx, col('ink'), 'left', 800, 'head');
      ctx.restore();
    });
    env.note = note;
    const pl = (R.periods || [])[Math.round(q)];
    if (pl != null) { const ppx = Math.max(minPx(env), Math.min(b.h * 0.16, 120 * u)); ctx.save(); ctx.globalAlpha *= 0.9; label(ctx, env, pl, b.x + b.w, b.y + b.h - ppx * 0.25, ppx, col(R.periodColor || 'ink2'), 'right', 800, 'head'); ctx.restore(); }
  }

  // ------------------------------------------------------------------ line chart with a leading point
  D('linechart', {
    cat: 'media', enter: 'fade',
    draw(ctx, P, env) {
      const S = (P.series || []).filter(s => s && (s.values || []).length > 1), b = env.box, u = env.u; if (!S.length) return;
      const all = S.flatMap(s => s.values), lo0 = P.min ?? Math.min(0, ...all), hi0 = P.max ?? Math.max(...all), tk = ticks(lo0, hi0, P.grid ?? 4);
      const lo = P.min ?? Math.min(lo0, tk.list[0]), hi = P.max ?? Math.max(hi0, tk.list[tk.list.length - 1] ?? hi0);
      const ypx = Math.max(minPx(env), 30 * u), xpx = ypx, ink2 = col('ink2'), dur = env.T(P.draw ?? '2s'), gap = env.T(P.seriesStep ?? P.draw ?? '2s'), t0 = env.T(P.lead ?? '0.3s');
      ctx.font = env.font('body', 600, ypx); const yw = P.yLabels === false ? 0 : Math.max(...tk.list.map(v => ctx.measureText(num(P, v)).width)) + ypx * 0.6;
      const L = b.x + yw, R = b.x + b.w - ypx * 2.2, T = b.y + ypx * 1.8, B = b.y + b.h - (P.xLabels ? xpx * 1.9 : ypx * 0.6);
      const X = (i, n) => L + i / (n - 1) * (R - L), Y = v => B - (v - lo) / ((hi - lo) || 1) * (B - T);
      // 1. axes / grid / labels
      ctx.save(); ctx.globalAlpha *= clamp(env.lt / 0.35);
      ctx.strokeStyle = col(P.gridColor || 'muted'); ctx.lineWidth = 1.5 * u; ctx.globalAlpha *= 0.55;
      ctx.beginPath(); for (const v of tk.list) if (v >= lo && v <= hi) { ctx.moveTo(L, Y(v)); ctx.lineTo(R, Y(v)); } ctx.stroke(); ctx.globalAlpha /= 0.55;
      if (yw) for (const v of tk.list) if (v >= lo && v <= hi) label(ctx, env, num(P, v), L - ypx * 0.4, Y(v) + ypx * 0.35, ypx, ink2, 'right', 600);
      const xl = P.xLabels || [], nx = Math.max(...S.map(s => s.values.length)), every = Math.max(1, Math.ceil(xl.length * xpx * 3.2 / (R - L)));
      xl.forEach((s, i) => { if (i % every === 0 || i === xl.length - 1) label(ctx, env, s, X(i, nx), B + xpx * 1.35, xpx, ink2, 'center', 600); });
      ctx.restore();
      // 2. series, one after another: line draws left -> right with a glowing head + value tag, area fades in after
      S.forEach((s, j) => {
        const vals = s.values, n = vals.length, c = col(s.color || 'a' + (1 + j % 6)), kr = clamp((env.lt - t0 - j * gap) / dur), k = easeOf(P.ease, E.io)(kr);
        if (kr <= 0) return;
        const pts = vals.map((v, i) => [X(i, nx), Y(v)]), q = k * (n - 1), i0 = Math.floor(q), f = q - i0;
        const head = i0 >= n - 1 ? pts[n - 1] : [lerp(pts[i0][0], pts[i0 + 1][0], f), lerp(pts[i0][1], pts[i0 + 1][1], f)];
        if (P.area) { const ka = clamp((env.lt - t0 - j * gap - dur) / 0.4); if (ka > 0) {
          const g = ctx.createLinearGradient(0, T, 0, B), rgb = KV.rgbOf(c).join(','); g.addColorStop(0, `rgba(${rgb},${0.3 * ka})`); g.addColorStop(1, `rgba(${rgb},0)`);
          ctx.beginPath(); ctx.moveTo(pts[0][0], B); pts.forEach(p => ctx.lineTo(p[0], p[1])); ctx.lineTo(pts[n - 1][0], B); ctx.closePath(); ctx.fillStyle = g; ctx.fill(); } }
        ctx.save(); ctx.strokeStyle = c; ctx.lineWidth = (P.lw ?? 6) * u; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); pts.slice(0, i0 + 1).forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.lineTo(head[0], head[1]); ctx.stroke(); ctx.restore();
        MV.glow(head[0], head[1], 30 * u, hexOr(c, '#FFFFFF'), kr < 1 ? 0.8 : 0.35);
        ctx.fillStyle = c; MV.circle(head[0], head[1], 9 * u); ctx.fill(); ctx.fillStyle = col('card'); MV.circle(head[0], head[1], 4 * u); ctx.fill();
        const v = i0 >= n - 1 ? vals[n - 1] : lerp(vals[i0], vals[i0 + 1], f);
        if (P.tag !== false) { // value tag above the head, kept inside the plot (+ the right margin)
          const s2 = (s.label && kr >= 1 ? s.label + ' ' : '') + num(P, v); ctx.font = env.font('head', 800, ypx); const tw = ctx.measureText(s2).width;
          label(ctx, env, s2, clamp(head[0], L + tw / 2, b.x + b.w - tw / 2), head[1] - ypx * 0.9, ypx, col(P.tagColor || 'ink'), 'center', 800, 'head');
        }
      });
      // 3. annotations: half a beat after the line passes the point
      for (const m of P.marks || []) {
        const s = S[m.series ?? 0]; if (!s) continue; const j = S.indexOf(s), n = s.values.length, at = t0 + j * gap + dur * easeInv(m.i / (n - 1)) + env.beat * 0.5;
        const ka = clamp((env.lt - at) / 0.35); if (ka <= 0) continue;
        const x = X(m.i, nx), y = Y(s.values[m.i]), c = col(m.color || s.color || 'a' + (1 + j % 6)), up = (m.dir ?? (y - T > (B - T) * 0.35 ? -1 : 1));
        ctx.save(); ctx.globalAlpha *= ka; ctx.strokeStyle = c; ctx.lineWidth = 4 * u; MV.circle(x, y, 18 * u * E.oB(ka)); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, y + up * 22 * u); ctx.lineTo(x, y + up * 60 * u); ctx.stroke();
        label(ctx, env, m.label, clamp(x, L + ypx * 3, R - ypx * 1), y + up * 60 * u + (up < 0 ? -ypx * 0.35 : ypx * 1.05), ypx, col('ink'), 'center', 700);
        ctx.restore();
      }
      // the draw ease is io by default: invert it for the mark timing (bisection; lin / custom eases are close enough)
      function easeInv(y) { const f = easeOf(P.ease, E.io); let a = 0, c = 1; for (let i = 0; i < 24; i++) { const m = (a + c) / 2; if (f(m) < y) a = m; else c = m; } return (a + c) / 2; }
    }
  });

  // ------------------------------------------------------------------ donut / pie sweep
  D('donut', {
    cat: 'media', enter: 'fade',
    draw(ctx, P, env) {
      const it = (P.items || []).filter(o => o && o.value > 0), b = env.box, u = env.u; if (!it.length) return;
      const tot = it.reduce((s, o) => s + o.value, 0), lab = P.labels !== false, Rr = Math.min(b.w, b.h) / 2 * (lab ? 0.62 : 0.96), th = clamp(P.thickness ?? 0.24, 0.05, 1);
      const sweep = env.T(P.sweep ?? '1.2s'), k = easeOf(P.ease, E.io)(env.lt / sweep), K = k * TAU, gap = (P.gap ?? 1.2) * Math.PI / 180;
      const lpx = Math.max(minPx(env), Math.min(Rr * 0.16, 38 * u));
      let a0 = -Math.PI / 2;
      it.forEach((o, i) => {
        const da = o.value / tot * TAU, end = Math.min(a0 + da, -Math.PI / 2 + K), c = pal(P, o, i);
        if (end > a0 + gap / 2) { ctx.beginPath(); ctx.arc(0, 0, Rr, a0 + gap / 2, end - (end >= a0 + da - 1e-9 ? gap / 2 : 0)); ctx.arc(0, 0, Rr * (1 - th), end - (end >= a0 + da - 1e-9 ? gap / 2 : 0), a0 + gap / 2, true); ctx.closePath(); ctx.fillStyle = c; ctx.fill(); }
        if (lab) { // label once its segment is complete: name + share, outside the ring
          const ka = clamp((K - (a0 + da + Math.PI / 2)) / 0.6 + 1); const mid = a0 + da / 2, cx = Math.cos(mid), cy = Math.sin(mid);
          if (K >= a0 + da + Math.PI / 2 - 1e-6 && ka > 0) { ctx.save(); ctx.globalAlpha *= clamp((env.lt - sweep * (a0 + da + Math.PI / 2) / TAU) / 0.3);
            const txt = (o.label ? o.label + ' ' : '') + (P.percent === false ? num(P, o.value) : Math.round(o.value / tot * 100) + '%');
            label(ctx, env, txt, cx * Rr * 1.12, cy * Rr * 1.14 + lpx * 0.35, lpx, col('ink'), cx > 0.25 ? 'left' : cx < -0.25 ? 'right' : 'center', 700); ctx.restore(); }
        }
        a0 += da;
      });
      if (P.center != null && P.center !== false) { // centre: a counting value ({ value, prefix, suffix, decimals, label }), true = total, or a string
        const C = P.center === true ? { value: tot } : typeof P.center === 'object' ? P.center : { text: String(P.center) }, cpx = Math.max(minPx(env), Rr * (1 - th) * 0.62);
        const s = C.text ?? ((C.prefix ?? P.prefix ?? '') + fmt(C.value * k, C.decimals ?? P.decimals ?? 0, P) + (C.suffix ?? P.suffix ?? ''));
        ctx.font = env.font('head', 800, cpx); const fit = Math.min(cpx, cpx * Rr * (1 - th) * 1.6 / Math.max(1, ctx.measureText(s).width));
        label(ctx, env, s, 0, C.label ? fit * 0.2 : fit * 0.36, fit, col(C.color || 'ink'), 'center', 800, 'head');
        if (C.label) label(ctx, env, C.label, 0, fit * 0.2 + lpx * 1.3, Math.max(minPx(env), lpx * 0.85), col('ink2'), 'center', 600);
      }
    }
  });
})();
