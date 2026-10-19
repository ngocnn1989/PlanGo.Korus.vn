// Listening substitute (kr-video-score): band balance with the mux EQ, per-scene loudness, breath windows, presence-mid
// (harshness), hit onsets vs picture (5 ms windows, ±1 frame) + low-band tail per hit, build-up rise, whoosh peaks.
//   node measure.mjs [music.wav|final.mp4] [--busy a-b] [--project <dir>]
// Sections come from TL.S (per-section numbers are information: SFX-heavy scenes are meant to be bright).
// The verdict uses the music-bed reference window: --busy a-b, else TL.mixRef, else the middle 50 % of the video.
// Targets there: low-mid +4..+6 dB, mid-high +7..+10 dB, presence-mid (2.5-6 kHz vs 150 Hz-2 kHz) <= -6 dB (kids -8).
// Exit code 0 always (it informs mixing); qa.mjs is the delivery gate.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { audioTargets, EQ_DEFAULT } from './lib/synth.mjs';

const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const PROJECT = path.resolve(opt('project', process.cwd()));
const TL = new Function(fs.readFileSync(path.join(PROJECT, 'timeline.js'), 'utf8') + '; return TL;')();
const CFG = fs.existsSync(path.join(PROJECT, 'video.config.json')) ? JSON.parse(fs.readFileSync(path.join(PROJECT, 'video.config.json'), 'utf8')) : {};
const FILE = path.resolve(PROJECT, argv[0] && !argv[0].startsWith('--') ? argv[0] : 'music.wav');
const KIDS = (TL.audience || CFG.audience) === 'kids';
const EQ = /\.wav$/i.test(FILE) ? (audioTargets(CFG.audio || {}, KIDS ? 'kids' : undefined).eq || EQ_DEFAULT) + ',' : '';
const ff = (a, b, af) => spawnSync(process.env.FFMPEG || 'ffmpeg', ['-hide_banner', '-ss', String(a), '-to', String(b), '-i', FILE, '-vn', '-af', af, '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
const num = s => s === undefined ? NaN : /-inf/.test(s) ? -Infinity : parseFloat(s);
const rms = (a, b, band) => num((ff(a, b, `${EQ}${band}astats=measure_perchannel=none`).match(/RMS level dB:\s*(-?[\d.]+|-inf)/g) || []).pop()?.split(':')[1]);
const lufs = (a, b) => num((ff(a, b, `${EQ}ebur128`).split('Summary:')[1] || '').match(/I:\s+(-?[\d.]+) LUFS/)?.[1]);
const f1 = x => Number.isFinite(x) ? x.toFixed(1) : String(x);
const mark = (x, lo, hi) => (x >= lo && x <= hi ? 'ok ' : 'OFF');

console.log(`file ${path.basename(FILE)}${EQ ? ' (mux EQ applied)' : ''}`);
const sections = Object.entries(TL.S || { all: [0, TL.dur] });
const loud = sections.map(([id, [a, b]]) => [id, a, b, lufs(a, b)]);
console.log('\nsection        window         LUFS   low-mid   mid-high');
for (const [id, a, b, L] of loud) {
  let bands = '';
  if (b - a >= 2) {
    const lo = rms(a, b, 'lowpass=f=150,'), mid = rms(a, b, 'highpass=f=150,lowpass=f=2000,'), hi = rms(a, b, 'highpass=f=2000,');
    bands = `${f1(lo - mid).padStart(7)}   ${f1(mid - hi).padStart(7)}`;
  }
  console.log(`${id.padEnd(14)} ${String(a).padStart(5)}-${String(b).padEnd(7)} ${f1(L).padStart(6)}  ${bands}`);
}
const busy = opt('busy') ? opt('busy').split('-').map(Number) : TL.mixRef || [+(TL.dur * 0.25).toFixed(2), +(TL.dur * 0.75).toFixed(2)];
const lo = rms(busy[0], busy[1], 'lowpass=f=150,'), mid = rms(busy[0], busy[1], 'highpass=f=150,lowpass=f=2000,'), hi = rms(busy[0], busy[1], 'highpass=f=2000,');
console.log(`\nmix reference ${busy[0]}-${busy[1]}: low-mid ${f1(lo - mid)} dB [${mark(lo - mid, 4, 6)}]  mid-high ${f1(mid - hi)} dB [${mark(mid - hi, 7, 10)}]   whole ${f1(lufs(0, TL.dur))} LUFS`);
const pres = rms(busy[0], busy[1], 'highpass=f=2500,lowpass=f=6000,'), PMAX = KIDS ? -8 : -6;
console.log(`presence-mid ${f1(pres - mid)} dB [${mark(pres - mid, -30, PMAX)}] (2.5-6 kHz vs 150 Hz-2 kHz, <= ${PMAX}${KIDS ? ' kids' : ''}: harsh top tires listeners)`);
// ---- 5 ms RMS windows over the whole file (one ffmpeg pass per band); power-average them for any span
function win5(pre = '') {
  const out = spawnSync(process.env.FFMPEG || 'ffmpeg', ['-hide_banner', '-nostats', '-i', FILE, '-vn', '-af', `${pre}aresample=48000,asetnsamples=n=240:p=0,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level`, '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 256 << 20 }).stderr;
  return [...out.matchAll(/RMS_level=(-?[\d.]+|-inf)/g)].map(m => m[1] === '-inf' ? -200 : +m[1]); // window k = [k*5 ms, (k+1)*5 ms)
}
const W5 = win5(), L5 = win5('lowpass=f=150,'), dt = 0.005; let H5c = null; const H5 = () => H5c || (H5c = win5('highpass=f=1000,'));
const span = (A, a, b) => { const i0 = Math.max(0, Math.floor(a / dt)), i1 = Math.min(A.length, Math.ceil(b / dt)); let s = 0, n = 0; for (let i = i0; i < i1; i++) { s += Math.pow(10, A[i] / 10); n++; } return n ? 10 * Math.log10(s / n || 1e-20) : NaN; };
const HEAVY = new Set(['stamp', 'boom', 'crash', 'kick', 'clap', 'snare', 'tada', 'shatter', 'drop', 'braam']);
const hits = (TL.events || []).filter(e => e.type === 'hit' || (e.type === 'sfx' && HEAVY.has(e.name)));
if (hits.length) {
  console.log(`hit onsets (5 ms windows, ±1 frame = ±${(1000 / TL.fps).toFixed(0)} ms; after a breath: first window >= -20 dBFS, else first +10 dB step) · low decay = <150 Hz first 100 ms minus the 100 ms before the next beat (>= 0 dB; corpus 0.5-7.8 dB with the groove's bass in the window):`);
  for (const e of hits) {
    const gap = (TL.audioGaps || []).some(([, b]) => b <= e.t + 1e-3 && e.t - b < 0.05), k0 = Math.max(1, Math.round((e.t - 0.06) / dt)), k1 = Math.min(W5.length - 1, Math.round((e.t + 0.06) / dt));
    let k = -1; for (let i = k0; i <= k1 && k < 0; i++) if (gap ? W5[i] >= -20 : W5[i] - W5[i - 1] >= 10) k = i;
    const on = k < 0 ? NaN : k * dt, err = (on - e.t) * 1000, tail = span(L5, e.t, e.t + 0.1) - span(L5, e.t + TL.beat - 0.1, e.t + TL.beat - 0.005);
    console.log(`  ${(e.type === 'hit' ? 'hit' : e.name).padEnd(8)} ${e.t.toFixed(3)}  onset ${Number.isFinite(on) ? on.toFixed(3) : 'n/a  '}  err ${Number.isFinite(err) ? err.toFixed(0).padStart(4) + ' ms' : '   - '} ${!Number.isFinite(on) ? 'n/a (no clear step: busy bed)' : Math.abs(err) <= 1000 / TL.fps + 0.5 ? 'ok ' : 'OFF'}   low decay ${f1(tail)} dB ${tail >= 0 ? 'ok' : 'OFF (sub grows after the hit)'}`);
  }
}
for (const t1 of TL.builds || []) { // engine 2 build-ups: above 1 kHz the bar before the target rises (riser + roll; the pickup beat drops kick/bass)
  const a = span(H5(), t1 - TL.bar, t1 - TL.bar + TL.beat), b = span(H5(), t1 - TL.beat, t1 - 0.14), vo = (TL.events || []).some(e => e.type === 'say' && e.t < t1 && e.t > t1 - TL.bar - 2);
  console.log(`build into ${t1.toFixed(2)} s: rise > 1 kHz ${f1(b - a)} dB ${b - a >= 3 ? 'ok' : 'OFF'} (>= 3 dB${vo ? '; a voice line in the bar: review' : ''})`);
}
// whoosh peaks: 25 ms RMS (above 1 kHz) inside [t - 0.2, t + d + 0.3]; the move's midpoint is t + d/2 (±0.1 s)
const SJ = fs.existsSync(path.join(PROJECT, 'score.json')) ? JSON.parse(fs.readFileSync(path.join(PROJECT, 'score.json'), 'utf8')) : null;
const wh = SJ ? (SJ.sfx || []).filter(s => s.trans && s.sfx.some(n => n === 'whoosh' || n === 'swoosh')).map(s => TL.events.find(e => e.type === 'trans' && Math.abs(e.t - s.t) < 1e-3)).filter(Boolean)
  : (TL.events || []).filter(e => e.type === 'trans' && ['slide', 'wipe', 'zoom', 'band', 'iris'].includes(e.name));
if (wh.length) {
  console.log('whoosh peaks (25 ms RMS > 1 kHz; target t + d/2 ± 0.1 s; "shared" = another sound/voice/hit in the window: review only):');
  for (const e of wh) { let best = -1, bv = -Infinity; for (let t = Math.max(0, e.t - 0.2); t < e.t + e.d + 0.3; t += dt) { const v = span(H5(), t, t + 0.025); if (v > bv) { bv = v; best = t + 0.0125; } }
    const sj = SJ && (SJ.sfx || []).find(s => s.trans && Math.abs(s.t - e.t) < 1e-3), shared = (sj && sj.sfx.length > 1) || (TL.events || []).some(x => x !== e && x.type !== 'trans' && x.t > e.t - 0.25 && x.t < e.t + e.d + 0.3);
    console.log(`  ${e.name.padEnd(8)} ${e.t.toFixed(2)} d ${e.d.toFixed(2)}  peak ${best.toFixed(3)}  vs ${(e.t + e.d / 2).toFixed(3)} ${shared ? 'shared' : Math.abs(best - e.t - e.d / 2) <= 0.1 ? 'ok' : 'OFF'}`); }
}
if ((TL.audioGaps || []).length) {
  console.log('breath windows (RMS inside [a+0.02, b-0.02], target < -30 dBFS):');
  for (const [a, b] of TL.audioGaps) {
    const r = num((ff(a + 0.02, b - 0.02, 'astats=measure_perchannel=none').match(/RMS level dB:\s*(-?[\d.]+|-inf)/g) || []).pop()?.split(':')[1]);
    console.log(`  ${a}-${b}  ${f1(r)} ${r < -30 ? 'ok' : 'OFF'}`);
  }
}
