/* KV library "type" — kinetic type that does not fit the line-based `text` block: `textpath` (glyphs placed along a
 * circle or an SVG path, each turned to the path tangent; badges, rims, routes). Line-based reveals (`scramble`, `words`
 * with `per`, `track`, `weight`, `markerIn`) live on the `text` block itself (kv-blocks.js).
 *   { kind: 'textpath', at: 'visual', text: 'AI WELDING • AI WELDING • ', circle: 260, offset: [0, 0.25], dur: 8, px: 40 }
 * Short labels only (<= ~30 characters); circle radius >= 2.5 x the font size so glyphs do not collide.
 */
(function () {
  'use strict';
  const { clamp, lerp } = MV;
  const TAU = Math.PI * 2;
  KV.define('textpath', {
    cat: 'copy', enter: 'fade', reveals: ['type'],
    draw(ctx, P, env) {
      const u = env.u, px = (P.px ?? 44) * u, txt = [...String(P.text ?? '')], ink = env.col(P.color || 'ink');
      ctx.font = env.font(P.font || 'head', P.weight ?? env.theme.headW, px); ctx.letterSpacing = '0px'; ctx.textBaseline = 'alphabetic';
      const ls = (P.ls ?? 0) * u;
      // path in layer px: circle of radius `circle` (clockwise from 12 o'clock; side 'in' = glyphs read along the inside),
      // or d (unit 'px' around the origin, default; 'box' = 0..1 of the layer box)
      let len, at, ang;
      if (P.circle) { const r = P.circle * u, inside = P.side === 'in'; len = TAU * r;
        at = s => { const a = -Math.PI / 2 + (inside ? -1 : 1) * s / r; return [Math.cos(a) * r, Math.sin(a) * r]; };
        ang = s => (inside ? -1 : 1) * s / r + (inside ? Math.PI : 0); }
      else { const bx = P.unit === 'box', b = env.box, p = KV.pathOn(P.d, bx ? b.w : 1, bx ? b.h : 1, bx ? b.x : 0, bx ? b.y : 0); len = p.len; at = p.at; ang = p.angle; }
      // offset: start along the path as a fraction of its length; [from, to] slides over `dur` (beats / '4s') from the layer's in
      const off = Array.isArray(P.offset) ? lerp(P.offset[0], P.offset[1], clamp(env.lt / env.T(P.dur ?? '4s'))) : P.offset ?? 0;
      const closed = !!P.circle || /z\s*$/i.test(String(P.d || '').trim()), shown = env.revealType === 'type' ? Math.floor(env.reveal * txt.length + 1e-6) : txt.length;
      let s = off * len;
      txt.forEach((ch, i) => {
        const w = ctx.measureText(ch).width; let m = s + w / 2;
        if (closed) m = ((m % len) + len) % len; else if (m < 0 || m > len) { s += w + ls; return; }
        if (i < shown && ch.trim()) {
          const q = at(m); ctx.save(); ctx.translate(q[0], q[1]); ctx.rotate(ang(m));
          env.note({ text: ch, x: -w / 2, y: -px * 0.55, w, h: px * 0.9, px, color: ink }); // per glyph: lint sees real glyph boxes
          ctx.fillStyle = ink; ctx.fillText(ch, -w / 2, px * 0.35); ctx.restore();
        }
        s += w + ls;
      });
    }
  });
})();
