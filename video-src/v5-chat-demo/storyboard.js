// @template demo,demo-proof,12,17 · Show-don't-tell demo + spec stack · 30 s · 96 BPM (bar 2.5 s)
// Objective: conversion / late consideration · Audience: technical buyers (LinkedIn, Facebook, YouTube; muted autoplay)
// Beats: 0–2.5 s mid-action label (no intro) · 2.5–10 s demo: 3 numbered steps, nouns not adjectives · 10–13.75 s
//        visible result + 1 proof (hit) · 13.75–21.25 s <= 3 stat tiles, each with src · 21.25–25 s "Cấu hình tham
//        khảo" note · 25–30 s CTA end card (>= 4 s at 30 s)
// Replace: every <…>; tile values are PLACEHOLDERS (0) until the claims table has the real, sourced numbers; swap the
//          illustrations for the product photo / clip ('feature-photo', blocks/weld.md `markers` for annotations).
// Rules: references/ad_script_templates.md T12 + T17 · simulated footage is never presented as a real run
//        · owner policy: no superlative / absolute wording (references/legal_compliance.md)
var SB = {
  name: 'PlanGo_Chat_Demo', bpm: 96, fps: 30, theme: 'steel', aspects: ['16x9', '4x5', '9x16'], lang: 'vi',
  music: { preset: 'tech', engine: 2 },
  watermark: true,
  brief: {
    objective: 'conversion', template: 'demo', length: 30, hook: 'demo',
    audience: { role: '<kỹ sư / quản lý sản xuất>', situation: '<đang so sánh giải pháp>' },
    message: '<Sản phẩm> <làm việc gì> — xem tận mắt', key: '<Sản phẩm>',
    cta: 'Nhận bảng thông số', contact: '<web · hotline>', brand: '<Brand>', brandCue: 'watermark'
  },
  sources: {
    sResult: { text: '<kết quả thấy được>', type: 'spec', url: '<biên bản / video gốc>', date: '<dd/mm/yyyy>' },
    s1: { text: '<thông số A>', type: 'spec', url: '<datasheet>' },
    s2: { text: '<thông số B>', type: 'spec', url: '<datasheet>' },
    s3: { text: '<thông số C>', type: 'spec', url: '<datasheet>' },
    sHot: { text: '<web · hotline>', type: 'contact' }
  },
  transitions: { default: 'slide' },
  scenes: [
    { id: 'action', bars: 1, hook: 'demo', preset: 'hook-title', lines: ['<Đang làm gì>'], illus: { name: 'gear' } },
    { id: 'demo', bars: 3, preset: 'steps', title: '<Sản phẩm> làm việc', items: ['1 · <Bước 1>', '2 · <Bước 2>', '3 · <Bước 3>'], step: 3,
      illus: { name: 'laptop' } },
    // payoff = result (energy 3); its dip = action (energy 1)
    { id: 'result', bars: 1.5, hit: true, energy: 3, beat: 'proof', preset: 'hook-title', lines: ['*<Kết quả thấy được>*'],
      illus: { name: 'bulb' }, src: 'sResult' },
    { id: 'tiles', bars: 3, preset: 'stat-tiles', title: '<Tiêu đề thông số>', cols: { h: 3, f: 1, v: 1 }, items: [
      { value: 0, label: '<nhãn lợi ích 1>', src: 's1' }, { value: 0, suffix: ' <đv>', label: '<nhãn lợi ích 2>', src: 's2' },
      { value: 0, suffix: ' <đv>', label: '<nhãn lợi ích 3>', src: 's3' }] },
    { id: 'note', bars: 1.5, energy: 2, preset: 'statement', text: 'Cấu hình tham khảo', sub: '<Sản phẩm> · <tuỳ chọn theo xưởng>' }
  ],
  end: { preset: 'cta-endcard', logo: true, lines: ['<Sản phẩm>', '<web · hotline>'], cta: 'Nhận bảng thông số', src: 'sHot', bars: 2 }
};
