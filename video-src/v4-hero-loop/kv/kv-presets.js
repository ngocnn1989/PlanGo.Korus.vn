/* KV tier-1 presets: scene data -> layers (pure data, runs in the browser and in Node for compile/lint/score).
 *   { id: 'hello', bars: 2, preset: 'word-card', word: 'Hello!', sub: 'Xin chào', illus: { name: 'buddy', pose: 'wave' } }
 * Any preset scene may add `extra: [layers]` (drawn with the preset) and override `bg`, `trans`, `hit`, `energy`.
 * Every preset lays out 16:9 (copy left / visual right), 4:5 (copy top / visual below) and 9:16 (safe zones) itself.
 */
(function (root) {
  'use strict';
  const P = {};
  const ill = (v, extra) => v == null ? null : Object.assign({ kind: 'illus' }, typeof v === 'string' ? { name: v } : v, extra);
  const withSfx = (L, name, SB) => (SB.sfx === false || !name ? L : Object.assign({ sfx: name }, L));
  const out = (sc, layers) => Object.assign({}, sc, { layers: layers.filter(Boolean) });
  const loudStyle = SB => SB.theme === 'bright' || (SB.theme && SB.theme.base === 'bright');

  // big hook lines (1-3), optional illustration or photo beside/below
  P['hook-title'] = (sc, SB) => {
    const lines = [].concat(sc.lines || sc.title || ''), side = sc.illus || sc.photo;
    const at = side ? 'copy' : 'stage', n = lines.length;
    // text-only on 9:16: an 85 % column keeps the frame-0 pop overshoot out of the right-hand UI zone (x > 950 below y 1000)
    const layers = [{ kind: 'stack', at, gap: 18, w: side ? undefined : { h: 1, f: 1, v: 0.85 }, layers: [
      sc.eyebrow && { kind: 'text', text: sc.eyebrow, style: 'eyebrow' },
      // stagger 0 (default): every line is on frame 0 (thumbnail / autoplay); a line may be an array = forced breaks
      ...lines.map((s, i) => withSfx({ kind: 'text', text: s, style: i === 0 && n > 1 ? 'title' : 'display', maxLines: 2, in: i * (sc.stagger ?? 0), enter: sc.enter || 'pop',
        color: i === n - 1 ? 'a1' : 'ink', outline: loudStyle(SB) ? true : 0, outlineColor: 'white' }, loudStyle(SB) ? 'pop' : 'whoosh', SB))] }];
    if (sc.illus) layers.push(ill(sc.illus, { at: 'visual', size: 0.9, in: 0, idle: 'bob' }));
    if (sc.photo) layers.push({ kind: 'photo', src: sc.photo, at: 'visual', focus: sc.focus, zoom: [1, 1.08], radius: 28, shadow: true });
    return out(sc, layers);
  };
  P['hook-photo'] = (sc) => out(Object.assign({ scrim: true }, sc), [
    { kind: 'photo', src: sc.photo, at: 'full', focus: sc.focus, zoom: sc.zoom || [1.12, 1] },
    ...[].concat(sc.lines || []).map((s, i) => ({ kind: 'text', text: s, style: i ? 'headline' : 'title', at: 'copy', pos: [0.5, 0.3 + i * 0.3], in: i * 0.5, enter: 'mask', color: i ? 'a1' : 'ink' }))
  ]);
  P['title-reveal'] = (sc) => out(sc, [{ kind: 'stack', at: 'stage', layers: [
    sc.eyebrow && { kind: 'text', text: sc.eyebrow, style: 'eyebrow' },
    { kind: 'text', text: sc.title, style: 'display', in: 0.25, enter: 'mask', maxLines: 2, sfx: sc.sfx ?? 'whoosh' },
    sc.sub && { kind: 'text', text: sc.sub, style: 'subtitle', in: 1.25, enter: 'up', color: 'ink2' }] }]);
  P.statement = (sc) => out(sc, [{ kind: 'stack', at: 'stage', gap: 40, layers: [
    { kind: 'text', text: sc.text, style: sc.style || 'title', enter: 'words', maxLines: 3, w: 0.92 },
    sc.sub && { kind: 'text', text: sc.sub, style: 'subtitle', in: 2, enter: 'up', color: 'ink2' }] }]);
  // vocabulary card (kids / language learning; promoted from pilot W8's greet()): progress dots · big word (spoken) ·
  // meaning pill · one illustration or a `pics` layer list (zone visual) · optional "repeat after me" chip that says
  // the word again slower. The illustration talks while the word is spoken (talk: true).
  // the word's pop / the repeat chip's ding land with the visual; the spoken word follows 0.3 s later (sayAt overrides),
  // so no SFX sits on the voice onset (kv lint sfx-vo: >= 0.25 s apart)
  P['word-card'] = (sc, SB) => {
    const say = sc.say === false ? null : sc.say || String(sc.word).replace(/[*]/g, '');
    const pics = sc.pics || (sc.illus ? [ill(sc.illus, { size: 0.78, pos: [0.5, 0.45], enter: 'pop', idle: sc.idle || 'bob', talk: say ? true : undefined, sfx: SB.sfx === false ? null : 'sparkle' })] : []);
    return out(Object.assign({}, sc, { say: undefined }), [
      sc.number != null && { kind: 'progress', at: { h: 'top', f: 'visual', v: 'visual' }, pos: { h: [0.5, 0.2], f: [0.5, 0], v: [0.5, 0] }, n: sc.of || 5, i: sc.number, enter: 'fade' },
      { kind: 'stack', at: 'copy', gap: 26, layers: [
        withSfx({ kind: 'text', text: sc.word, style: 'display', in: 0.5, enter: 'pop', color: sc.color || 'a1', outline: loudStyle(SB), outlineColor: 'white', maxLines: 2, align: 'center', say: say && { text: say, at: sc.sayAt ?? '0.3s' } }, 'pop', SB),
        sc.sub && { kind: 'text', text: sc.sub, style: sc.subStyle || 'headline', in: 1.5, enter: 'up', color: 'ink', bg: loudStyle(SB) ? 'pill' : null, bgColor: 'card', align: 'center', maxLines: 1 }] },
      ...pics.map(p => Object.assign({ at: 'visual' }, p)),
      sc.repeat && { kind: 'text', text: sc.repeat === true ? 'Repeat after me!' : sc.repeat, style: 'subtitle', at: 'visual', pos: [0.5, 0.95], in: sc.repeatAt ?? 4, enter: 'pop',
        bg: 'pill', bgColor: 'card', color: 'ink', sfx: SB.sfx === false ? null : 'ding', say: say && { text: say, rate: sc.repeatRate ?? -30, at: '0.3s' } }
    ]);
  };
  // character talking in a speech bubble
  P.talk = (sc, SB) => out(Object.assign({}, sc, { say: undefined }), [
    ill(sc.illus || { name: 'buddy', pose: 'wave' }, { at: { h: 'visual', f: 'visual', v: 'visual' }, size: 0.85, pos: [0.5, 0.6], idle: 'bob', talk: sc.talk || [0.5, (sc.bars || 2) * 4] }),
    withSfx({ kind: 'bubble', text: sc.text, at: 'copy', pos: [0.5, 0.55], in: 0.5, tail: { h: 'bottom-right', f: 'bottom-left', v: 'bottom-left' }, say: sc.say, w: 0.95 }, 'pop', SB)
  ]);
  P['feature-photo'] = (sc) => out(sc, [
    { kind: 'photo', src: sc.photo, at: 'visual', focus: sc.focus, zoom: sc.zoom || [1, 1.08], feather: sc.feather ?? 0, radius: sc.feather ? 0 : 28, shadow: !sc.feather },
    { kind: 'stack', at: 'copy', layers: [
      sc.eyebrow && { kind: 'text', text: sc.eyebrow, style: 'eyebrow' },
      { kind: 'text', text: sc.title, style: 'headline', in: 0.25, enter: 'mask', maxLines: 2 },
      sc.items && { kind: 'list', items: sc.items, in: 1, bullet: sc.bullet || 'diamond' }] }
  ]);
  P['stat-tiles'] = (sc) => out(sc, [
    sc.title && { kind: 'text', text: sc.title, style: 'headline', at: { h: 'top', f: 'copy', v: 'copy' }, pos: [0.5, 0.5], enter: 'mask' },
    { kind: 'tiles', items: sc.items, at: { h: 'center', f: 'visual', v: 'visual' }, pos: [0.5, 0.55], in: 0.5, step: 0.5, cols: sc.cols }
  ]);
  P.steps = (sc) => out(sc, [
    sc.title && { kind: 'text', text: sc.title, style: 'headline', at: { h: 'copy', f: 'copy', v: 'copy' }, pos: { h: [0.5, 0.15], f: [0.5, 0.3], v: [0.5, 0.35] } },
    { kind: 'list', items: sc.items, bullet: 'number', at: { h: 'copy', f: 'visual', v: 'visual' }, pos: { h: [0.5, 0.62], f: [0.5, 0.4], v: [0.5, 0.35] }, in: 0.75, step: sc.step ?? 1, style: 'subtitle' },
    sc.illus && ill(sc.illus, { at: { h: 'visual', f: 'visual', v: 'visual' }, size: { h: 0.8, f: 0.45, v: 0.5 }, pos: { h: [0.5, 0.5], f: [0.85, 0.85], v: [0.75, 0.9] }, idle: 'float' })
  ]);
  // grid of illustrations (or photos) with labels: recap of several ideas
  P.recap = (sc) => {
    const it = sc.items || [], n = it.length;
    const cols = { h: Math.min(n, 5), f: Math.min(n, 3), v: n > 4 ? 2 : Math.min(n, 2) };
    const cell = (i, a) => { const c = cols[a], r = Math.ceil(n / c), row = Math.floor(i / c), inRow = Math.min(c, n - row * c), col = i % c; return [(col + 0.5) / c + (c - inRow) / (2 * c), (row + 0.5) / r]; };
    const pos = i => ({ h: cell(i, 'h'), f: cell(i, 'f'), v: cell(i, 'v') });
    return out(sc, [
      sc.title && { kind: 'text', text: sc.title, style: 'headline', at: { h: 'top', f: 'copy', v: 'copy' }, pos: { h: [0.5, 0.6], f: [0.5, 0.45], v: [0.5, 0.55] }, maxLines: 2 },
      ...it.map((o, i) => ({ kind: 'group', at: { h: 'stage', f: 'visual', v: 'visual' }, pos: { h: [pos(i).h[0], 0.55], f: pos(i).f, v: pos(i).v },
        w: { h: 0.94 / cols.h, f: 0.94 / cols.f, v: 0.94 / cols.v }, h: { h: 0.6, f: 0.94 / Math.ceil(n / cols.f), v: 0.94 / Math.ceil(n / cols.v) }, in: 0.5 + i * (sc.step ?? 0.5), enter: 'pop', sfx: sc.sfx ?? 'pop',
        layers: [o.illus && ill(o.illus, { pos: [0.5, 0.4], size: 0.7, idle: 'bob', phase: i * 0.3, enter: 'none' }),
          o.label && { kind: 'text', text: o.label, style: 'caption', pos: [0.5, 0.88], enter: 'none', maxLines: 1, color: o.color || 'ink' }].filter(Boolean) }))
    ]);
  };
  P.panels = (sc) => {
    const it = sc.items || [], n = it.length, zt = sc.title ? { h: 'center', f: 'visual', v: 'visual' } : { h: 'stage', f: 'stage', v: 'stage' };
    return out(sc, [sc.title && { kind: 'text', text: sc.title, style: 'headline', at: { h: 'top', f: 'copy', v: 'copy' }, pos: [0.5, 0.55], maxLines: 2, enter: 'mask', src: sc.src }].concat(it.map((o, i) => ({
      kind: 'card', at: zt, in: i * (sc.step ?? 0.75), enter: 'up', sfx: sc.sfx ?? 'whoosh',
      pos: { h: [(i + 0.5) / n, 0.5], f: [0.5, (i + 0.5) / n], v: [0.5, (i + 0.5) / n] }, w: { h: 0.9 / n, f: 0.9, v: 0.95 }, h: { h: 0.85, f: 0.9 / n, v: 0.9 / n },
      layers: [o.photo ? { kind: 'photo', src: o.photo, focus: o.focus, pos: [0.5, 0.4], w: 0.92, h: 0.66, radius: 18, enter: 'none' } : o.illus ? ill(o.illus, { pos: [0.5, 0.4], size: 0.62, enter: 'none', idle: 'bob' }) : null,
        { kind: 'text', text: o.label, style: 'subtitle', pos: [0.5, 0.86], w: 0.9, enter: 'none', maxLines: 2 }].filter(Boolean)
    }))));
  };
  // closing card. Brand logo (brand.js) when present — never retyped; otherwise the title as plain text
  P['end-simple'] = (sc, SB) => out(Object.assign({ bg: SB.endBg }, sc), [{ kind: 'stack', at: 'stage', gap: 34, layers: [
    sc.illus && ill(sc.illus, { size: { h: 0.34, f: 0.3, v: 0.3 }, idle: 'bob' }),
    sc.logo ? { kind: 'logo', w: { h: 0.5, f: 0.75, v: 0.85 }, h: sc.logoH ?? 0.26, enter: 'scale', sfx: sc.sfx ?? 'chime' }
      : { kind: 'text', text: sc.title, style: 'title', enter: 'pop', color: 'a1', maxLines: 2, sfx: sc.sfx ?? 'chime', outline: loudStyle(SB), outlineColor: 'white' },
    ...[].concat(sc.lines || []).map((s, i) => ({ kind: 'text', text: s, style: 'subtitle', in: 1 + i * 0.5, color: 'ink2', maxLines: 2 })),
    sc.cta && { kind: 'button', text: sc.cta, in: 2, fill: 'a1' }] }]);
  // light card by default (opaque-paper logos multiply on it), even inside a dark video; `theme` / `bg` override
  P['cta-endcard'] = (sc, SB) => P['end-simple'](Object.assign({ logo: true, theme: 'light', bg: { style: 'paper' } }, sc), SB);

  // ad-script presets (kv-presets-ad.js, optional): Node extends the table here; the scene page loads that file next
  if (typeof module !== 'undefined' && module.exports) {
    let ad = null; try { ad = require('./kv-presets-ad.js'); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
    module.exports = ad ? ad(P) : P;
  } else { root.KV = root.KV || {}; root.KV.presets = P; }
})(typeof window !== 'undefined' ? window : globalThis);
