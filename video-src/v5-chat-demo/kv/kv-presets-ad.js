/* KV tier-1 presets for advertising scripts (references/ad_script_templates.md). Same contract as kv-presets.js:
 * P[name] = (scene, SB) => scene with layers; pure data, runs in Node (compile / lint / score) and in the browser.
 * Node: require('./kv-presets-ad.js')(P) extends the core preset table; browser: loaded after kv-presets.js, it extends
 * KV.presets. Every preset lays out 16:9, 4:5 and 9:16 itself and keeps `extra`, `trans`, `hit`, `energy`, `say`, `bg`.
 *   before-after     before, after ('asset' | { photo | illus | icon | layers, text, src }), labels, mode split|wipe|slider, at, illustrative, title
 *   compare          left / right { title }, rows [{ a, b, src }], mode 'old-new' | 'vs', step, title
 *   testimonial      quote, name, role, org, photo | illus | initials, src (claim key with consent), typical
 *   myth-fact        myth, fact, src, labels, at (fact appears), strikeAt
 *   question-hook    lines (question, ends with '?'), answer, answerAt, eyebrow, illus | photo, src
 *   listicle         title, items [text | { text, illus, src }], step, itemsIn, start
 *   countdown        until (ISO date, = brief.deadline), label, sub, days (only when true on every serving day), src, illus
 *   problem-agitate  lines (the problem), items (consequences, <= 3), turn, turnAt, photo | illus
 * Blocks used beyond kv-blocks.js: blocks/ad.js (footnote, strike, badge, vs, quotemark, reveal).
 */
(function (root) {
  'use strict';
  function extend(P) {
    const ill = (v, extra) => v == null ? null : Object.assign({ kind: 'illus' }, typeof v === 'string' ? { name: v } : v, extra);
    const sfx = (SB, name) => (SB.sfx === false ? undefined : name);
    const withSfx = (L, name, SB) => (SB.sfx === false || !name ? L : Object.assign({ sfx: name }, L));
    const out = (sc, layers) => Object.assign({}, sc, { layers: layers.filter(Boolean) });
    const kids = a => a.filter(Boolean); // card / group children are not filtered by the runtime
    const lng = SB => (/^en/i.test(String(SB.lang || '')) ? 'en' : 'vi');
    const base = SB => (typeof SB.theme === 'string' ? SB.theme : (SB.theme && SB.theme.base) || 'dark');
    const loud = SB => base(SB) === 'bright';
    // fixed pill colours (white text >= 4.5:1 on every theme); `green` / `red` text-free marks follow the theme brightness
    const RED = '#C62F38', GREEN = '#1E7D45';
    const TXT = {
      vi: { before: 'TRƯỚC', after: 'SAU', myth: 'HIỂU LẦM', fact: 'SỰ THẬT', old: 'Cách cũ', neu: 'Cách mới', illus: 'Minh hoạ', deadline: 'Hạn chót', dPre: 'Còn ', dSuf: ' ngày' },
      en: { before: 'BEFORE', after: 'AFTER', myth: 'MYTH', fact: 'FACT', old: 'Old way', neu: 'New way', illus: 'Illustration', deadline: 'Deadline', dPre: '', dSuf: ' days left' }
    };
    const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dateText = (iso, lg) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return !m ? String(iso || '') : lg === 'en' ? `${MON[+m[2] - 1]} ${+m[3]}, ${m[1]}` : `${m[3]}/${m[2]}/${m[1]}`; };
    // scene length in beats (bars | beats | dur: number s, 'Ns', 'Nb', 'Nbar')
    const beatsOf = (sc, SB) => {
      const beat = 60 / (SB.bpm || 100);
      if (sc.dur != null) { const m = /^(-?[\d.]+)\s*(s|b|beats?|bars?)?$/.exec(String(sc.dur).trim()); if (m) { const n = +m[1], u = typeof sc.dur === 'number' ? 's' : m[2] || 'b'; return u === 's' ? n / beat : u.startsWith('bar') ? n * 4 : n; } }
      return sc.beats != null ? sc.beats : (sc.bars ?? 2) * 4;
    };
    const half = b => Math.round(b * 2) / 2;
    const norm = v => (v == null ? {} : typeof v === 'string' ? { photo: v } : v);
    const isPhoto = v => typeof v === 'string' || !!(v && v.photo);
    // one visual layer: 'asset' | { photo, focus, zoom } | { illus } | { icon } | { layers } | a layer ({ kind })
    function vis(v, box, extra) {
      v = norm(v);
      if (v.kind) return Object.assign({ pos: box.pos, w: box.w, h: box.h }, v, extra);
      if (v.photo) return Object.assign({ kind: 'photo', src: v.photo, focus: v.focus, zoom: v.zoom || [1, 1.06], fit: 'cover', pos: box.pos, w: box.w, h: box.h }, extra);
      if (v.illus) return ill(v.illus, Object.assign({ pos: box.pos, size: box.size, idle: 'bob' }, extra, { radius: undefined }));
      if (v.icon) return Object.assign({ kind: 'icon', name: v.icon, color: v.color, pos: box.pos, size: box.size }, extra, { radius: undefined });
      if (v.layers) return Object.assign({ kind: 'group', layers: v.layers, pos: box.pos, w: box.w, h: box.h }, extra);
      return null;
    }
    const pill = (text, fill, ink) => ({ kind: 'text', text, style: 'label', px: { h: 36, f: 38, v: 40 }, bg: 'pill', bgColor: fill, color: ink, maxLines: 1, shadow: false, enter: 'none' });

    // ---------------------------------------------------------------- before-after (T8 BAB)
    // split (default unless both states are photos): two cards, the after card enters at `at`; 16:9 side by side, 4:5 / 9:16
    // stacked. wipe / slider: one full-frame (photos) or visual-zone (illustrations) reveal; texts swap at `at`.
    P['before-after'] = (sc, SB) => {
      const t = TXT[lng(SB)], lab = [].concat(sc.labels || [t.before, t.after]), B = norm(sc.before), A = norm(sc.after);
      const mode = sc.mode || (isPhoto(B) && isPhoto(A) ? 'wipe' : 'split'), at = sc.at ?? sc.switchAt ?? half(beatsOf(sc, SB) * 0.4);
      const chip = sc.illustrative && pill(t.illus, 'card', 'cardInk');
      const aSrc = A.src || sc.src;
      if (mode === 'split') {
        const tt = !!sc.title, pos = i => tt ? { h: [i ? 0.745 : 0.255, 0.6], f: [0.5, i ? 0.8 : 0.4], v: [0.5, i ? 0.8 : 0.4] }
          : { h: [i ? 0.745 : 0.255, 0.5], f: [0.5, i ? 0.755 : 0.245], v: [0.5, i ? 0.755 : 0.245] };
        const card = (S, i) => ({ kind: 'card', at: 'stage', pos: pos(i), w: { h: 0.47, f: 0.96, v: 0.96 }, h: tt ? { h: 0.8, f: 0.38, v: 0.38 } : { h: 0.92, f: 0.47, v: 0.47 },
          in: i ? at : 0, enter: i ? 'up' : 'pop', strip: i ? 'a1' : 'muted', sfx: sfx(SB, i ? 'whoosh' : null),
          layers: kids([vis(S, { pos: [0.5, 0.46], w: 0.92, h: 0.52, size: 0.48 }, { radius: 18, enter: 'none' }),
            Object.assign(pill(lab[i], i ? 'ink' : 'ink2', 'bg'), { pos: [0.17, 0.1] }),
            S.text && { kind: 'text', text: S.text, style: 'subtitle', pos: [0.5, 0.86], w: 0.9, maxLines: 2, enter: 'none', color: i ? 'ink' : 'ink2', src: i ? aSrc : S.src },
            i && chip && Object.assign({}, chip, { pos: [0.8, 0.1] })]) });
        return out(sc, [tt && { kind: 'text', text: sc.title, style: 'headline', at: 'top', pos: [0.5, 0.5], maxLines: 1, enter: 'mask' }, card(B, 0), card(A, 1)]);
      }
      const full = isPhoto(B) && isPhoto(A), box = { pos: [0.5, 0.46], w: 1, h: 1, size: 0.7 };
      const txt = (S, i) => S.text && { kind: 'text', text: S.text, style: 'title', at: 'copy', pos: { h: [0.5, 0.6], f: [0.5, 0.62], v: [0.5, 0.62] }, maxLines: 2,
        in: i ? at : 0, out: i ? undefined : at, enter: i ? 'mask' : 'none', color: i ? 'a1' : 'ink', src: i ? aSrc : S.src };
      const tag = (i) => Object.assign(pill(lab[i], i ? 'ink' : 'ink2', 'bg'), { at: 'copy', pos: { h: [0.5, 0.2], f: [0.5, 0.2], v: [0.5, 0.2] }, in: i ? at : 0, out: i ? undefined : at, enter: i ? 'pop' : 'none', sfx: i ? sfx(SB, 'whoosh') : undefined });
      return out(Object.assign(full ? { scrim: true } : {}, sc), [
        { kind: 'reveal', at: full ? 'full' : 'visual', wipeAt: at, to: mode === 'slider' ? 0.5 : 1, layers: [vis(B, box, { enter: 'none' }), vis(A, box, { enter: 'none' })] },
        tag(0), tag(1), txt(B, 0), txt(A, 1),
        chip && Object.assign({}, chip, { at: full ? 'copy' : 'visual', pos: full ? { h: [0.5, 0.9], f: [0.5, 0.92], v: [0.5, 0.92] } : [0.5, 0.95], in: at })
      ]);
    };

    // ---------------------------------------------------------------- compare (T16 old way vs new way; mode 'vs' needs proof per row)
    P.compare = (sc, SB) => {
      const t = TXT[lng(SB)], vs = sc.mode === 'vs', dark = base(SB) === 'dark' || base(SB) === 'steel';
      const rows = (sc.rows || []).map(r => (Array.isArray(r) ? { a: r[0], b: r[1] } : r)).slice(0, 4), n = Math.max(1, rows.length);
      const S = [Object.assign({ title: vs ? 'A' : t.old }, sc.left), Object.assign({ title: vs ? 'B' : t.neu }, sc.right)];
      const step = sc.step ?? 1, r0 = sc.rowsIn ?? 0.75, tt = !!sc.title;
      const pos = i => tt ? { h: [i ? 0.745 : 0.255, 0.6], f: [0.5, i ? 0.8 : 0.4], v: [0.5, i ? 0.8 : 0.4] }
        : { h: [i ? 0.745 : 0.255, 0.5], f: [0.5, i ? 0.755 : 0.245], v: [0.5, i ? 0.755 : 0.245] };
      const mk = i => vs ? { name: 'arrow', color: i ? 'a1' : 'ink2' } : i ? { name: 'check', color: dark ? '#4ADE80' : GREEN } : { name: 'cross', color: 'muted' };
      const card = i => ({ kind: 'card', at: 'stage', pos: pos(i), w: { h: 0.47, f: 0.96, v: 0.96 }, h: tt ? { h: 0.8, f: 0.38, v: 0.38 } : { h: 0.92, f: 0.47, v: 0.47 },
        in: 0, enter: 'up', strip: i ? 'a1' : 'muted', stroke: i && !vs ? 'a1' : undefined, lw: 4,
        layers: [{ kind: 'text', text: S[i].title, style: 'headline', pos: [0.5, 0.15], w: 0.84, maxLines: 1, enter: 'none', color: i || vs ? 'a1' : 'ink2' }]
          .concat(...rows.map((r, j) => {
            const y = 0.35 + (j + 0.5) * 0.6 / n, tin = r0 + j * step;
            return [Object.assign({ kind: 'icon', pos: [0.09, y], size: 0.08, in: tin, enter: 'pop' }, mk(i)),
              { kind: 'text', text: i ? r.b : r.a, style: { h: 'subtitle', f: 'body', v: 'body' }, pos: [0.555, y], w: 0.75, align: 'left', maxLines: 2, in: tin, enter: 'left',
                color: i ? 'ink' : 'ink2', src: i ? r.src : r.srcA, sfx: i ? sfx(SB, 'tick') : undefined }];
          })) });
      return out(sc, [tt && { kind: 'text', text: sc.title, style: 'headline', at: 'top', pos: [0.5, 0.5], maxLines: 1, enter: 'mask' }, card(0), card(1),
        { kind: 'vs', at: 'stage', mark: vs ? 'vs' : 'arrow', dir: { h: 'right', f: 'down', v: 'down' }, size: { h: 0.12, f: 0.1, v: 0.1 }, in: 0.5,
          pos: { h: [0.5, tt ? 0.6 : 0.5], f: [0.88, tt ? 0.6 : 0.5], v: [0.88, tt ? 0.6 : 0.5] } }]);
    };

    // ---------------------------------------------------------------- testimonial (T18; src must carry consent: true)
    P.testimonial = (sc, SB) => {
      const meta = [sc.role, sc.org].filter(Boolean).join(' · ');
      const ini = sc.initials || (sc.name ? String(sc.name).trim().split(/\s+/).slice(-1)[0].slice(0, 1).toUpperCase() : '');
      const vpos = { h: [0.5, 0.5], f: [0.5, 0.56], v: [0.5, 0.56] };
      const face = sc.photo ? { kind: 'photo', src: sc.photo, focus: sc.focus, at: 'visual', pos: vpos, w: { h: 0.78, f: 0.6, v: 0.72 }, h: { h: 0.84, f: 0.84, v: 0.8 }, radius: 28, shadow: true, zoom: [1, 1.05] }
        : sc.illus ? ill(sc.illus, { at: 'visual', pos: vpos, size: { h: 0.78, f: 0.78, v: 0.74 }, idle: 'bob' }) : null;
      return out(sc, [
        face,
        !face && ini && { kind: 'shape', shape: 'circle', fill: 'ink', at: 'visual', pos: vpos, size: { h: 0.56, f: 0.62, v: 0.6 }, enter: 'pop' },
        !face && ini && { kind: 'text', text: ini, style: 'display', at: 'visual', pos: vpos, color: 'bg', maxLines: 1, enter: 'pop' },
        // quote mark above the quote: top-left of the copy column on 16:9, first item of the copy stack on 4:5 / 9:16 / 1:1
        { kind: 'quotemark', at: 'copy', pos: [0.07, 0.1], size: 0.15, only: ['16x9'], enter: 'pop' }, // sound once (below): audio is shared by all aspects
        { kind: 'stack', at: 'copy', gap: 22, valign: { h: 0.72, f: 0.5, v: 0.5 }, layers: [
          { kind: 'quotemark', size: 0.17, only: ['4x5', '9x16', '1x1'], enter: 'pop', sfx: sfx(SB, 'pop') },
          { kind: 'text', text: sc.quote || sc.text || '', style: 'headline', maxLines: 4, enter: 'words', src: sc.src },
          sc.name && { kind: 'text', text: sc.name, style: 'subtitle', in: 1, enter: 'up', color: 'a1', maxLines: 1 },
          meta && { kind: 'text', text: meta, style: 'body', in: 1.25, enter: 'up', color: 'ink2', maxLines: 2 }] },
        sc.typical && { kind: 'footnote', note: sc.typical, in: 1.5 }
      ]);
    };

    // ---------------------------------------------------------------- myth-fact (T38)
    P['myth-fact'] = (sc, SB) => {
      const t = TXT[lng(SB)], lab = [].concat(sc.labels || [t.myth, t.fact]);
      const at = sc.at ?? sc.factAt ?? Math.max(2, half(beatsOf(sc, SB) * 0.4)), sk = sc.strikeAt ?? Math.max(1, at - 2);
      const pos = i => ({ h: [i ? 0.745 : 0.255, 0.5], f: [0.5, i ? 0.755 : 0.245], v: [0.5, i ? 0.755 : 0.245] });
      const card = (i, layers) => ({ kind: 'card', at: 'stage', pos: pos(i), w: { h: 0.47, f: 0.96, v: 0.96 }, h: { h: 0.9, f: 0.47, v: 0.47 },
        in: i ? at : 0, enter: i ? 'up' : 'pop', strip: i ? GREEN : RED, sfx: sfx(SB, i ? 'whoosh' : null), layers });
      return out(sc, [
        card(0, [Object.assign(pill(lab[0], RED, '#FFFFFF'), { pos: [0.5, 0.15] }),
          { kind: 'strike', text: sc.myth, style: 'headline', pos: [0.5, 0.57], w: 0.84, maxLines: 3, strikeAt: sk, color: 'ink2', enter: 'none' },
          { kind: 'icon', name: 'cross', disc: RED, color: '#FFFFFF', pos: [0.9, 0.15], size: 0.15, in: sk, enter: 'pop', sfx: sfx(SB, 'stamp') }]),
        card(1, [Object.assign(pill(lab[1], GREEN, '#FFFFFF'), { pos: [0.5, 0.15] }),
          { kind: 'text', text: sc.fact, style: 'headline', pos: [0.5, 0.57], w: 0.84, maxLines: 3, enter: 'none', color: 'ink', src: sc.src },
          { kind: 'icon', name: 'check', disc: GREEN, color: '#FFFFFF', pos: [0.9, 0.15], size: 0.15, in: at + 0.5, enter: 'pop', sfx: sfx(SB, 'chime') }])
      ]);
    };

    // ---------------------------------------------------------------- question-hook (T1; text-only stays in the copy band)
    P['question-hook'] = (sc, SB) => {
      const lines = [].concat(sc.lines || sc.question || ''), n = lines.length, side = sc.illus || sc.photo;
      const aAt = sc.answerAt ?? Math.max(2, half(beatsOf(sc, SB) * 0.5)), dark = base(SB) === 'dark' || base(SB) === 'steel';
      const layers = [{ kind: 'stack', at: 'copy', gap: 18, layers: [
        sc.eyebrow && { kind: 'text', text: sc.eyebrow, style: 'eyebrow' },
        ...lines.map((s, i) => withSfx({ kind: 'text', text: s, style: i === 0 && n > 1 ? 'title' : 'display', maxLines: 2, in: 0, enter: sc.enter || 'pop',
          color: i === n - 1 ? 'a1' : 'ink', outline: loud(SB) ? true : 0, outlineColor: 'white' }, i ? null : loud(SB) ? 'pop' : 'whoosh', SB)),
        sc.answer && withSfx({ kind: 'text', text: sc.answer, style: 'headline', in: aAt, enter: 'up', color: 'ink', maxLines: 2, src: sc.src }, 'chime', SB)] }];
      const badge = { kind: 'badge', mark: '?', flip: sc.answer ? 'check' : undefined, flipAt: aAt, fill: 'a1', flipFill: dark ? '#22C55E' : GREEN, enter: 'pop' };
      if (sc.illus) layers.push(ill(sc.illus, { at: 'visual', size: { h: 0.84, f: 0.7, v: 0.72 }, in: 0, idle: 'bob' }));
      if (sc.photo) layers.push({ kind: 'photo', src: sc.photo, at: 'visual', focus: sc.focus, zoom: [1, 1.08], radius: 28, shadow: true });
      layers.push(Object.assign(badge, side ? { at: 'visual', pos: [0.86, 0.14], size: 0.22 } : { at: 'visual', pos: [0.5, 0.48], size: { h: 0.56, f: 0.5, v: 0.55 } }));
      return out(sc, layers);
    };

    // ---------------------------------------------------------------- listicle (T39: numbered items cycling in one scene)
    P.listicle = (sc, SB) => {
      const it = (sc.items || []).map(o => (typeof o === 'string' ? { text: o } : o)), n = Math.max(1, it.length), tt = !!sc.title;
      const t0 = sc.itemsIn ?? 0, step = sc.step ?? (beatsOf(sc, SB) - t0) / n, first = sc.start ?? 1;
      const vp = [0.5, 0.45], copyPos = { h: [0.5, 0.52], f: [0.5, tt ? 0.64 : 0.5], v: [0.5, tt ? 0.64 : 0.5] };
      return out(sc, [tt && { kind: 'text', text: sc.title, style: 'headline', at: { h: 'top', f: 'copy', v: 'copy' }, pos: { h: [0.5, 0.5], f: [0.5, 0.13], v: [0.5, 0.13] }, maxLines: 1, enter: 'mask' }]
        .concat(...it.map((o, i) => {
          const tin = t0 + i * step, tout = i < it.length - 1 ? t0 + (i + 1) * step : undefined, num = String(first + i);
          const big = !o.illus && !o.photo;
          return [
            o.illus && ill(o.illus, { at: 'visual', pos: vp, size: { h: 0.72, f: 0.6, v: 0.62 }, in: tin, out: tout, idle: 'bob' }),
            o.photo && { kind: 'photo', src: o.photo, focus: o.focus, at: 'visual', pos: vp, w: 0.9, h: 0.8, radius: 28, in: tin, out: tout },
            withSfx({ kind: 'shape', shape: 'circle', fill: 'a1', at: 'visual', pos: big ? vp : [0.14, 0.12], size: big ? { h: 0.6, f: 0.48, v: 0.52 } : 0.2, in: tin, out: tout, enter: 'pop' }, 'pop', SB),
            { kind: 'text', text: num, style: 'display', px: big ? { h: 250, f: 210, v: 230 } : { h: 96, f: 84, v: 88 }, at: 'visual', pos: big ? vp : [0.14, 0.12], color: 'card', maxLines: 1, in: tin, out: tout, enter: 'pop' },
            { kind: 'text', text: o.text, style: 'title', at: 'copy', pos: copyPos, maxLines: 3, in: tin, out: tout, enter: 'mask', src: o.src },
            { kind: 'progress', at: 'visual', pos: [0.5, 0.96], n: it.length, i: i + 1, in: tin, out: tout, enter: 'none' }];
        })));
    };

    // ---------------------------------------------------------------- countdown (T29: a real, dated deadline)
    // The absolute date is the message. `days` ("N days left") is shown only when the owner confirms it is true on every
    // day the ad serves; kv lint requires brief.deadline (= until) and a deadline source. Every frame shows a TRUE date:
    // no scramble / count-up reveals that pass through other dates or numbers (QC F2) — the date and days just pop in.
    P.countdown = (sc, SB) => {
      const lg = lng(SB), t = TXT[lg], iso = sc.until || (SB.brief && SB.brief.deadline) || '';
      return out(sc, [
        { kind: 'stack', at: 'copy', gap: 24, layers: [
          { kind: 'text', text: sc.label || t.deadline, style: 'eyebrow', px: { h: 32, f: 34, v: 34 } },
          withSfx({ kind: 'text', text: dateText(iso, lg), style: 'display', maxLines: 1, in: 0, enter: 'pop', color: 'a1', src: sc.src, outline: loud(SB) ? true : 0, outlineColor: 'white' }, 'tick', SB),
          sc.days != null && { kind: 'text', text: t.dPre + sc.days + t.dSuf, style: 'headline', maxLines: 1, in: 1, enter: 'pop', src: sc.src },
          sc.sub && { kind: 'text', text: sc.sub, style: 'subtitle', in: 1.5, enter: 'up', color: 'ink2', maxLines: 2 }] },
        sc.illus === false ? null : sc.icon ? { kind: 'icon', name: sc.icon, at: 'visual', size: 0.6, disc: 'card' }
          : ill(sc.illus || 'clock', { at: 'visual', size: { h: 0.78, f: 0.66, v: 0.66 }, idle: 'bob', sfx: sfx(SB, 'tick') })
      ]);
    };

    // ---------------------------------------------------------------- problem-agitate (T7 PAS; the next scene solves, with hit: true)
    // problem on frame 0 · consequences as red pills on beats (buzz) · at `turnAt` everything leaves and the `turn` line
    // ('Còn nếu…') sits alone on a near-black frame. Blame the process, never people.
    P['problem-agitate'] = (sc, SB) => {
      const beats = beatsOf(sc, SB), items = [].concat(sc.items || []).slice(0, 3), lines = [].concat(sc.lines || sc.problem || ''), n = lines.length;
      const turnAt = sc.turn ? sc.turnAt ?? Math.max(half(beats * 0.6), beats - 2.5) : undefined;
      const i0 = sc.itemsIn ?? 1.5, step = sc.step ?? Math.max(1, half(((turnAt ?? beats) - i0 - 1) / Math.max(1, items.length)));
      return out(sc, [
        { kind: 'stack', at: 'copy', gap: 20, layers: [
          ...lines.map((s, i) => withSfx({ kind: 'text', text: s, style: i === n - 1 ? 'title' : 'headline', maxLines: 2, in: 0, enter: 'pop', out: turnAt, color: i === n - 1 ? 'a1' : 'ink' }, i ? null : 'whoosh', SB)),
          ...items.map((s, j) => withSfx({ kind: 'text', text: s, style: 'headline', bg: 'pill', bgColor: RED, color: '#FFFFFF', maxLines: 2, in: i0 + j * step, out: turnAt, enter: 'pop' }, 'buzz', SB))] },
        sc.photo ? { kind: 'photo', src: sc.photo, focus: sc.focus, at: 'visual', zoom: [1, 1.08], radius: 28, shadow: true, out: turnAt }
          : sc.illus ? ill(sc.illus, { at: 'visual', size: { h: 0.8, f: 0.62, v: 0.66 }, idle: 'bob', out: turnAt })
            : { kind: 'icon', name: 'warn', color: RED, at: 'visual', size: { h: 0.5, f: 0.4, v: 0.42 }, out: turnAt },
        sc.turn && { kind: 'shape', shape: 'rect', fill: '#05070B', at: 'full', in: turnAt, enter: { type: 'fade', dur: '0.25s' }, opacity: 0.94 },
        sc.turn && { kind: 'text', text: sc.turn, style: 'title', at: 'center', in: turnAt + 0.25, enter: 'fade', color: '#FFFFFF', maxLines: 2 }
      ]);
    };
    return P;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = extend;
  else if (root.KV && root.KV.presets) extend(root.KV.presets);
})(typeof window !== 'undefined' ? window : globalThis);
