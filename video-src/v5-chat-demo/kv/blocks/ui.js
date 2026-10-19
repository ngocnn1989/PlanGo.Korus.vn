/* KV library "ui" — product / app demo pieces: `device` (phone or laptop frame with a scrolling screenshot and/or live KV
 * layers on its screen), `cursor` (pointer with click presses + ripples, moved with keys / follow) and `tap` (finger tap).
 *   { kind: 'device', type: 'phone', src: 'appScreen', at: 'visual', scroll: [0, 0.6], scrollAt: [1, 3] }
 *   { kind: 'cursor', at: 'visual', keys: [{ t: 1, pos: [0.3, 0.7] }, { t: 2, pos: [0.62, 0.4], arc: 0.2 }], clicks: [2] }
 * One interaction per beat; zoom into the detail with the scene camera (cam.keys) rather than shrinking UI text.
 */
(function () {
  'use strict';
  const { clamp, lerp, E } = MV;
  const D = KV.define, col = c => KV.col(c);

  // ------------------------------------------------------------------ device frame
  D('device', {
    cat: 'media', enter: 'up',
    draw(ctx, P, env) {
      const b = env.box, u = env.u, phone = (P.type || 'phone') !== 'laptop';
      const asp = phone ? (P.aspect ?? 9 / 19.5) : 16 / 10, body = col(P.body || '#1B2030'), scr = col(P.screen || '#FFFFFF');
      // fit: phone = rounded slab; laptop = lid (screen + bezel) over a thin base 8 % wider
      let fw, fh; if (phone) { fh = Math.min(b.h, b.w / asp); fw = fh * asp; } else { fw = Math.min(b.w / 1.08, b.h / (1 / asp + 0.12) * 1.0); fh = fw / asp * 1.06; }
      const bz = phone ? fw * 0.045 : fw * 0.03, x0 = -fw / 2, y0 = phone ? -fh / 2 : -(fh + fw * 0.06) / 2;
      const S = { x: x0 + bz, y: y0 + bz * (phone ? 1 : 1.2), w: fw - bz * 2, h: fh - bz * (phone ? 2 : 2.2) }, sr = phone ? fw * 0.11 : fw * 0.012;
      // soft floor shadow + body
      ctx.save(); ctx.globalAlpha *= 0.25; ctx.fillStyle = '#000000'; ctx.beginPath(); ctx.ellipse(0, (phone ? fh / 2 : fh / 2 + fw * 0.05) + 14 * u, fw * 0.42, 12 * u, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      ctx.fillStyle = body; MV.rr(x0, y0, fw, fh, phone ? fw * 0.16 : fw * 0.025); ctx.fill();
      if (!phone) { ctx.beginPath(); const yb = y0 + fh; ctx.moveTo(-fw * 0.54, yb + fw * 0.005); ctx.lineTo(fw * 0.54, yb + fw * 0.005); ctx.lineTo(fw * 0.5, yb + fw * 0.05); ctx.lineTo(-fw * 0.5, yb + fw * 0.05); ctx.closePath(); ctx.fillStyle = col(P.base || '#C9CED8'); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.18)'; MV.rr(-fw * 0.08, yb + fw * 0.005, fw * 0.16, fw * 0.012, fw * 0.006); ctx.fill(); }
      // screen: background, screenshot (fit to width, vertical scroll), then live child layers, all clipped
      ctx.save(); MV.rr(S.x, S.y, S.w, S.h, sr); ctx.clip(); ctx.fillStyle = scr; ctx.fillRect(S.x, S.y, S.w, S.h);
      const img = P.src ? env.img(P.src) : null;
      if (img) {
        const a = (KV.SB.assets || {})[P.src] || {}, [sx, sy, sw, sh] = P.crop || a.crop || [0, 0, img.width, img.height], s = S.w / sw, dh = sh * s;
        const sa = [].concat(P.scrollAt ?? []), t0 = env.T(sa[0] ?? 0), t1 = sa[1] != null ? env.T(sa[1]) : Math.max(t0 + 0.5, env.sc.dur - env.T(P.in));
        const k = P.scroll ? lerp(P.scroll[0], P.scroll[1], E.io(clamp((env.lt - t0) / Math.max(0.01, t1 - t0)))) : 0;
        ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, sx, sy, sw, sh, S.x, S.y - Math.max(0, dh - S.h) * k, S.w, dh);
      }
      for (const [j, c] of (P.layers || []).filter(Boolean).entries()) env.draw(Object.assign({ id: `${env.L.id}.${j}` }, c), S);
      if (P.gloss !== false) { const g = ctx.createLinearGradient(S.x, S.y, S.x + S.w * 0.7, S.y + S.h * 0.5); g.addColorStop(0, 'rgba(255,255,255,0.10)'); g.addColorStop(0.5, 'rgba(255,255,255,0.03)'); g.addColorStop(0.51, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(S.x, S.y, S.w, S.h); }
      ctx.restore();
      if (phone && P.notch !== false) { ctx.fillStyle = body; MV.rr(-S.w * 0.16, S.y + S.w * 0.03, S.w * 0.32, S.w * 0.075, S.w * 0.0375); ctx.fill(); }
      if (!phone) { ctx.fillStyle = 'rgba(255,255,255,0.25)'; MV.circle(0, y0 + bz * 0.6, Math.max(2, bz * 0.15)); ctx.fill(); }
    }
  });

  // ------------------------------------------------------------------ pointer with clicks
  // the layer position is the pointer tip; clicks: [scene beats] -> press (scale 0.88 for ~0.1 s) + ripple ring (0.4 s)
  D('cursor', {
    cat: 'fx', enter: 'fade', w: 0.07, h: 0.07,
    draw(ctx, P, env) {
      const s = Math.max(20 * env.u, Math.min(env.box.w, env.box.h)), u = env.u, c = col(P.color || '#FFFFFF'), ink = col(P.ink || '#141A26');
      let press = 0;
      for (const ck of [].concat(P.clicks || [])) {
        const d = env.st - env.T(ck); if (d < 0 || d > 0.5) continue;
        press = Math.max(press, d < 0.06 ? d / 0.06 : clamp(1 - (d - 0.06) / 0.08)); // down 60 ms, up 80 ms
        const k = clamp(d / 0.4); if (k < 1) { ctx.save(); ctx.globalAlpha *= (1 - k) * 0.9; ctx.strokeStyle = col(P.ripple || 'a1'); ctx.lineWidth = (6 * (1 - k) + 2) * u; MV.circle(0, 0, s * (0.15 + 0.85 * E.o(k))); ctx.stroke(); ctx.restore(); }
      }
      const sc = 1 - 0.12 * press; ctx.save(); ctx.scale(sc, sc);
      ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2, s * 0.06); ctx.strokeStyle = ink; ctx.fillStyle = c;
      if (P.style === 'dot') { MV.circle(0, 0, s * 0.18); ctx.globalAlpha *= 0.85; ctx.fill(); ctx.stroke(); }
      else if (P.style === 'hand') { // fingertip at the origin
        const w = s * 0.42; ctx.beginPath(); ctx.moveTo(-w * 0.18, 0.05 * s); ctx.lineTo(-w * 0.18, s * 0.5); ctx.quadraticCurveTo(-w * 0.9, s * 0.42, -w * 0.62, s * 0.68); ctx.lineTo(-w * 0.2, s * 1.05); ctx.lineTo(w * 0.85, s * 1.05); ctx.quadraticCurveTo(w * 1.05, s * 0.7, w * 0.95, s * 0.5); ctx.lineTo(w * 0.95, s * 0.42); ctx.quadraticCurveTo(w * 0.62, s * 0.3, w * 0.2, s * 0.42); ctx.lineTo(w * 0.18, s * 0.05); ctx.quadraticCurveTo(0, -s * 0.12, -w * 0.18, 0.05 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
      } else { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, s * 0.78); ctx.lineTo(s * 0.2, s * 0.6); ctx.lineTo(s * 0.34, s * 0.9); ctx.lineTo(s * 0.46, s * 0.84); ctx.lineTo(s * 0.32, s * 0.55); ctx.lineTo(s * 0.56, s * 0.55); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      ctx.restore();
    }
  });

  // ------------------------------------------------------------------ finger tap
  // taps: [beats after the layer's in] (default [0]): a dot presses and fades (0.3 s) while a ring expands (0.4 s)
  D('tap', {
    cat: 'fx', enter: 'none', w: 0.12, h: 0.12,
    draw(ctx, P, env) {
      const r = Math.min(env.box.w, env.box.h) / 2, u = env.u, c = col(P.color || 'a1');
      for (const tp of [].concat(P.taps ?? [0])) {
        const d = env.lt - env.T(tp); if (d < 0 || d > 0.6) continue;
        const kd = clamp(d / 0.3), kr = clamp(d / 0.4);
        if (kd < 1) { ctx.save(); ctx.globalAlpha *= 0.55 * (1 - kd); ctx.fillStyle = c; MV.circle(0, 0, r * 0.32 * (1 - 0.18 * Math.sin(Math.PI * clamp(d / 0.12)))); ctx.fill(); ctx.restore(); }
        if (kr < 1) { ctx.save(); ctx.globalAlpha *= 1 - kr; ctx.strokeStyle = c; ctx.lineWidth = (5 * (1 - kr) + 2) * u; MV.circle(0, 0, r * (0.3 + 0.7 * E.o(kr))); ctx.stroke(); ctx.restore(); }
      }
    }
  });
})();
