// storyboard.js — the whole video as data. Reference: kr-motion-video/references/kv_framework.md
// Tier 1 = preset scene · tier 2 = layers · tier 3 = { kind: 'custom', draw(ctx, P, env) } or KV.define('name', {...}).
// Times inside a scene are beats (number) or '0.8s'. Any value can differ per aspect: { h: 16:9, f: 4:5, v: 9:16 }.
// Workflow: node kv.mjs make --until stills  ->  review stills/*/_sheet.png  ->  node kv.mjs make
var SB = {
  name: 'PlanGo_Hero_Loop', bpm: 100, fps: 30, theme: 'bright', aspects: ['16x9', '4x5', '9x16'], lang: 'vi',
  music: { preset: 'playful', key: 'C', engine: 2 }, // playful | corporate | tech | industrial | calm | cinematic
                                                 // engine 2: motif, build-ups, cadence, VO loudness mix; options: mode,
                                                 // scale ('penta'), motif [1, 3, 5], lift, swing, stems (kv_framework § Sound)
  voice: { lang: 'en-US', rate: 0 },             // used by `say` lines (Windows voices, or WAV files)
  sources: {},                                   // claim key -> source; numbers on screen need `src: key`
  transitions: { default: 'cut' },               // hard cuts inside a chapter; design the chapter changes (one family,
                                                 // <= 3 types): built-ins cut flash fade dip slide wipe iris zoom band +
                                                 // 41 library types (kv/blocks/trans.md, references/transitions.md)
  scenes: [
    { id: 'hook', bars: 2, preset: 'hook-title', lines: ['3 thói quen nhỏ', '*mỗi sáng*'], illus: { name: 'sun' } },
    { id: 'water', bars: 2, trans: { type: 'slide', dir: { h: 'left', v: 'up' } }, preset: 'word-card', word: 'Uống *nước*', sub: 'Một ly nước khi thức dậy', illus: { name: 'buddy', pose: 'cheer' }, say: false, number: 1, of: 3 },
    { id: 'move', bars: 2, trans: { type: 'wipe', dir: { h: 'left', v: 'up' } }, layers: [
      { kind: 'bg', style: 'sunburst' },
      { kind: 'illus', name: 'ball', at: 'visual', size: 0.7, enter: 'drop', sfx: 'boing' },
      { kind: 'text', text: 'Vận động *5 phút*', style: 'title', at: 'copy', enter: 'words', sfx: 'pop' },
      { kind: 'particles', type: 'confetti', at: 'visual', in: 0.5, sfx: 'sparkle' }
    ] },
    { id: 'read', bars: 2, energy: 1, layers: [                           // energy 1 = the dip before the payoff
      { kind: 'custom', at: 'visual', size: 0.8, draw(ctx, P, env) {         // tier 3: six orbiting dots
        const r = env.box.w * 0.38;
        for (let i = 0; i < 6; i++) { const a = env.lt * 1.5 + i * Math.PI / 3; ctx.fillStyle = env.col('a' + (1 + i)); MV.circle(Math.cos(a) * r, Math.sin(a) * r, 18 * env.u); ctx.fill(); }
      } },
      { kind: 'illus', name: 'book', at: 'visual', size: 0.5 },
      { kind: 'text', text: 'Đọc *1 trang* sách', style: 'title', at: 'copy', enter: 'mask', sfx: 'whoosh' }
    ] },
    { id: 'recap', bars: 2, trans: { type: 'slide', dir: { h: 'left', v: 'up' } }, preset: 'recap', title: 'Bắt đầu từ hôm nay', items: [
      { illus: { name: 'buddy', pose: 'cheer' }, label: 'Uống nước' }, { illus: 'ball', label: 'Vận động' }, { illus: 'book', label: 'Đọc sách' }
    ] }
  ],
  end: { title: 'Mỗi ngày một chút', lines: ['Theo dõi để xem thêm'], illus: { name: 'buddy', pose: 'wave' }, bars: 2 }
};
