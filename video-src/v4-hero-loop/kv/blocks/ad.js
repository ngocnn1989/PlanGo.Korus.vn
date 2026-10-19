/* KV library "ad" — blocks for advertising scripts (used by kv-presets-ad.js and the starters in templates/ads/).
 *   footnote   source / proof / terms line (doc · no. · date) in the lower zone; text from `note` or the `src` claim key
 *   captions   burns the `say` lines as timed captions (sound-off parity); `SB.captions: 'burn'` adds it to every scene
 *   strike     text with a strike-through drawn across each line at `strikeAt` (scene time): myths, the old way
 *   badge      disc with a mark ('?', 'check', 'cross' or <= 3 characters) that flips to `flip` at `flipAt` (scene time)
 *   vs         divider disc between two compared panels: an arrow (old -> new, default) or 'VS'
 *   quotemark  opening quotation marks drawn as shapes (testimonials)
 *   reveal     before/after: layers[0], then layers[1] wiped in from the left up to `to` (1 wipe, 0.5 slider) at `wipeAt`
 * Times named *At are scene time (beats or '0.8s'), like `in`. Reference: blocks/ad.md.
 */
(function () {
  'use strict';
  const { clamp, E } = MV;
  const TAU = Math.PI * 2;
  const lang = () => (/^en/i.test(String((KV.SB && KV.SB.lang) || '')) ? 'en' : 'vi');

  // ------------------------------------------------------------------ footnote
  // text of a claim key: string form as written; object form -> proof doc · no. · date, else cite / doc / text
  KV.sourceNote = (k, lg) => {
    const s = KV.SB && KV.SB.sources ? KV.SB.sources[k] : null;
    if (s == null) return '';
    if (typeof s !== 'object') return String(s);
    const p = s.proof || {}, vi = (lg || lang()) === 'vi';
    if (p.doc) return [p.doc, p.no && (vi ? 'số ' : 'No. ') + p.no, p.date].filter(Boolean).join(' · ');
    return String(s.cite || s.doc || s.text || '');
  };
  KV.define('footnote', {
    cat: 'copy', at: 'lower', enter: 'fade', pos: [0.5, 0.86], h: 0.34,
    draw(ctx, P, env) {
      const body = P.note != null ? String(P.note) : P.text != null ? [].concat(P.text).join(' ') : KV.sourceNote(P.src);
      if (!body) return;
      const pre = P.prefix != null ? P.prefix : P.note != null || P.text != null ? '' : lang() === 'vi' ? 'Nguồn: ' : 'Source: ';
      const px = P.px != null ? KV.R(P.px) : env.A === 'h' ? 30 : 32; // >= kv lint minimum (26 / 28 px)
      const w = Math.min(env.box.w, px * (P.chars ?? 56) * 0.55);
      KV.blocks.text.draw(ctx, { text: pre + body, style: 'label', px, color: P.color || 'cardInk', bg: P.bg ?? 'box', bgColor: P.bgColor || 'card',
        shadow: false, maxLines: P.maxLines ?? 2, align: 'center', anchor: [0.5, 0.5], upper: false, ls: 0 },
        Object.assign({}, env, { box: { x: -w / 2, y: env.box.y, w, h: env.box.h }, revealType: null, reveal: 1 }));
    }
  });

  // ------------------------------------------------------------------ captions
  // spoken lines: measured lengths from vo.js (kv score) when present, else ~ words / rate + 0.3 s (vi 4.5, others 2.6 w/s)
  let CAP = null;
  function voLines() {
    const TL = KV.TL; if (!TL) return [];
    if (CAP && CAP.TL === TL) return CAP.v;
    const SB = KV.SB || {}, base = String((SB.voice && SB.voice.lang) || SB.lang || 'en').slice(0, 2).toLowerCase();
    const real = typeof VO !== 'undefined' && VO && VO.length ? VO : null;
    const v = real ? real.map(l => ({ t: l.t, dur: l.dur, text: String(l.text || ''), scene: l.scene }))
      : TL.events.filter(e => e.type === 'say' && e.text).map(e => {
        const lg = String(e.lang || base).slice(0, 2).toLowerCase();
        return { t: e.t, dur: KVC.words(e.text).length / (lg === 'vi' ? 4.5 : 2.6) + 0.3, text: String(e.text), scene: e.scene };
      });
    CAP = { TL, v }; return v;
  }
  // one line -> n balanced chunks of <= max characters (2 caption lines of ~42); a chunk ends at punctuation once it
  // holds >= 60 % of its share, so there are no one-word orphans
  function chunks(text, max) {
    const words = String(text).replace(/[*_]/g, '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean), outv = [];
    const len = words.join(' ').length, n = Math.max(1, Math.ceil(len / max)), share = len / n;
    let cur = '';
    for (const w of words) {
      const nx = cur ? cur + ' ' + w : w;
      if (cur && nx.length > max) { outv.push(cur); cur = w; continue; }
      cur = nx;
      if (outv.length < n - 1 && (cur.length >= share || (/[.!?…,;:]$/.test(w) && cur.length >= share * 0.6))) { outv.push(cur); cur = ''; }
    }
    if (cur) outv.push(cur);
    return outv;
  }
  KV.captionChunks = chunks;
  KV.define('captions', {
    cat: 'ui', at: 'lower', enter: 'none', pos: [0.5, 0.92],
    draw(ctx, P, env) {
      const t = env.t, own = !P.all, live = voLines().filter(l => (!own || l.scene === env.sc.id) && t >= l.t && t <= l.t + l.dur);
      if (!live.length) return;
      const l = live[live.length - 1], cs = chunks(l.text, P.maxChars ?? 84), tot = cs.reduce((a, c) => a + c.length, 0) || 1;
      let acc = 0, s = cs[cs.length - 1];
      for (const c of cs) { acc += c.length; if (t <= l.t + l.dur * acc / tot) { s = c; break; } }
      const px = P.px != null ? KV.R(P.px) : env.A === 'h' ? 44 : 48, w = Math.min(env.box.w, px * (P.chars ?? 22));
      // a footnote in the same scene keeps the bottom line: captions move up above it
      const note = (env.sc._layers || env.sc.layers || []).some(L => L && L.kind === 'footnote');
      if (note && P.dy == null) ctx.translate(0, -px * 1.6);
      KV.blocks.text.draw(ctx, { text: s, style: 'caption', px, color: P.color || '#FFFFFF', bg: 'box', bgColor: P.bgColor || 'rgba(8,10,14,0.8)', shadow: false,
        maxLines: 2, align: 'center', anchor: [0.5, 1], upper: false, ls: 0, font: 'body', weight: 700 },
        Object.assign({}, env, { box: { x: -w / 2, y: env.box.y, w, h: env.box.h }, revealType: null, reveal: 1 }));
    }
  });

  // ------------------------------------------------------------------ strike (text + animated strike-through)
  KV.define('strike', {
    cat: 'copy', enter: 'fade',
    draw(ctx, P, env) {
      KV.blocks.text.draw(ctx, P, env);
      const k = clamp((env.st - env.T(P.strikeAt ?? 2)) / env.T(P.strikeDur ?? '0.45s'));
      if (k <= 0) return;
      const st = KV.TEXT_STYLE[P.style || 'headline'] || KV.TEXT_STYLE.headline, px0 = P.px != null ? KV.R(P.px) : KV.R(st.px) || 60;
      const L = KV.textLayout(ctx, P, env, px0), align = P.align || (env.P.at === 'copy' && env.A === 'h' ? 'left' : 'center');
      const y0 = -(P.anchor || [0.5, 0.5])[1] * L.h, n = L.lines.length;
      ctx.save(); ctx.strokeStyle = env.col(P.strikeColor || '#D63B40'); ctx.lineWidth = Math.max(4 * env.u, L.px * 0.09); ctx.lineCap = 'round';
      L.lines.forEach((ln, li) => {
        const kl = clamp(k * n - li); if (kl <= 0) return;
        const x0 = (align === 'left' ? env.box.x : align === 'right' ? env.box.x + env.box.w - ln.w : -ln.w / 2) - L.px * 0.1;
        const y = y0 + (li + 0.8) * L.px * L.lineH - (L.lineH - 1) * L.px * 0.5 - L.px * 0.3;
        ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + (ln.w + L.px * 0.2) * E.o(kl), y); ctx.stroke();
      });
      ctx.restore();
    }
  });

  // ------------------------------------------------------------------ badge ('?' -> check)
  function mark(ctx, env, m, s, ink) {
    if (m === 'check') return MV.icon.check(0, 0, s * 0.22, ink, s * 0.075);
    if (m === 'cross') return MV.icon.cross(0, 0, s * 0.24, ink, s * 0.075);
    const str = String(m ?? '?').slice(0, 3), px = s * (str.length > 1 ? 0.34 : 0.56);
    env.note({ text: str, x: -s * 0.3, y: -px * 0.62, w: s * 0.6, h: px * 1.2, px, color: ink });
    MV.text(str, 0, px * 0.36, { font: env.font('head', 800, px), color: ink, align: 'center' });
  }
  KV.define('badge', {
    cat: 'media', enter: 'pop',
    draw(ctx, P, env) {
      const s = Math.min(env.box.w, env.box.h), fa = P.flip != null ? env.T(P.flipAt ?? 2) : Infinity;
      const k = clamp((env.st - fa) / env.T(P.flipDur ?? '0.35s')), back = k >= 0.5, sx = Math.max(0.03, Math.abs(Math.cos(k * Math.PI)));
      const fill = env.col(back ? (P.flipFill || P.fill || 'a3') : (P.fill || 'a1')), ink = P.color ? env.col(P.color) : KV.onColor(fill);
      ctx.save(); ctx.scale(sx, 1);
      ctx.save(); ctx.fillStyle = fill; ctx.shadowColor = env.theme.shadow; ctx.shadowBlur = 24 * env.u; ctx.shadowOffsetY = 8 * env.u; MV.circle(0, 0, s * 0.46); ctx.fill(); ctx.restore();
      if (P.ring !== false) { ctx.strokeStyle = env.col(P.ring || 'card'); ctx.lineWidth = s * 0.045; MV.circle(0, 0, s * 0.46); ctx.stroke(); }
      mark(ctx, env, back ? P.flip : P.mark ?? '?', s, ink);
      ctx.restore();
    }
  });

  // ------------------------------------------------------------------ vs divider
  KV.define('vs', {
    cat: 'media', enter: 'pop',
    draw(ctx, P, env) {
      const s = Math.min(env.box.w, env.box.h), fill = env.col(P.fill || 'a1'), ink = P.color ? env.col(P.color) : KV.onColor(fill);
      ctx.save(); ctx.fillStyle = fill; ctx.shadowColor = env.theme.shadow; ctx.shadowBlur = 24 * env.u; MV.circle(0, 0, s * 0.45); ctx.fill(); ctx.restore();
      ctx.strokeStyle = env.col(P.ring || 'card'); ctx.lineWidth = s * 0.05; MV.circle(0, 0, s * 0.45); ctx.stroke();
      if ((P.mark || 'arrow') === 'arrow') {
        ctx.save(); ctx.rotate({ right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[P.dir || 'right'] || 0);
        ctx.strokeStyle = ink; ctx.lineWidth = s * 0.085; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(-s * 0.2, 0); ctx.lineTo(s * 0.17, 0); ctx.moveTo(s * 0.02, -s * 0.15); ctx.lineTo(s * 0.19, 0); ctx.lineTo(s * 0.02, s * 0.15); ctx.stroke();
        ctx.restore();
      } else mark(ctx, env, P.mark === 'vs' ? 'VS' : P.mark, s, ink);
    }
  });

  // ------------------------------------------------------------------ quotation marks
  KV.define('quotemark', {
    cat: 'media', enter: 'pop',
    draw(ctx, P, env) {
      const s = Math.min(env.box.w, env.box.h), r = s * 0.17;
      ctx.fillStyle = env.col(P.color || 'a1');
      if (P.close) ctx.rotate(Math.PI);
      for (const dx of [-0.23, 0.23]) { // a filled dot with a tail sweeping up and right: the shape of a typeset opening mark
        const x = dx * s, y = s * 0.14;
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x - r, y); ctx.quadraticCurveTo(x - r * 1.15, y - r * 2.6, x + r * 1.05, y - r * 3.1);
        ctx.lineTo(x + r * 1.15, y - r * 2.55); ctx.quadraticCurveTo(x - r * 0.15, y - r * 2.0, x + r * 0.2, y - r * 0.35); ctx.closePath(); ctx.fill();
      }
    }
  });

  // ------------------------------------------------------------------ reveal (before / after wipe or slider)
  KV.define('reveal', {
    cat: 'media', enter: 'none',
    draw(ctx, P, env) {
      const b = env.box, kids = (P.layers || []).filter(Boolean).map((c, j) => Object.assign({ id: `${env.L.id}.${j}`, enter: 'none' }, c));
      const k = E.io(clamp((env.st - env.T(P.wipeAt ?? 2)) / env.T(P.dur ?? '0.8s'))), to = P.to ?? 1, x = b.x + b.w * to * k;
      // each state only where it is shown: transparent art (illustrations) must never leave a ghost of "before" under
      // "after" (QC F1). Clips reach past the box so shadows / idle motion are cut at the divider, not at the box edge.
      const far = Math.max(b.w, b.h) * 2, clipTo = (x0, x1, L) => { ctx.save(); ctx.beginPath(); ctx.rect(x0, b.y - far, x1 - x0, b.h + far * 2); ctx.clip(); env.draw(L, b); ctx.restore(); };
      if (kids[0] && !(k >= 1 && to >= 1)) { if (k <= 0) env.draw(kids[0], b); else clipTo(x, b.x + b.w + far, kids[0]); }
      if (kids[1] && k > 0) { if (k >= 1 && to >= 1) env.draw(kids[1], b); else clipTo(b.x - far, x, kids[1]); }
      if (k > 0 && (k < 1 || to < 1)) {
        const u = env.u, c = env.col(P.color || 'a1');
        ctx.save(); ctx.fillStyle = c; ctx.fillRect(x - 4 * u, b.y, 8 * u, b.h);
        if (to < 1) { // slider handle
          const y = b.y + b.h / 2, r = 34 * u;
          ctx.fillStyle = env.col('card'); ctx.strokeStyle = c; ctx.lineWidth = 6 * u; MV.circle(x, y, r); ctx.fill(); ctx.stroke();
          ctx.lineWidth = 5 * u; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
          for (const d of [-1, 1]) { ctx.moveTo(x + d * r * 0.2, y - r * 0.3); ctx.lineTo(x + d * r * 0.5, y); ctx.lineTo(x + d * r * 0.2, y + r * 0.3); }
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  });
})();
