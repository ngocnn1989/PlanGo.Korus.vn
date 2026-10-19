// kr-motion-video QA gate — measures the FINAL deliverable, never the intermediate picture track.
//   node qa.mjs [--variant all|16x9|9x16] [--times 1,5,9] [--project <dir>]
//   --deliver  also gate deliver.mjs outputs (qa/<Name>_<variant>_<preset>_deliver.json): missing, stale or FAIL = exit 1 [--deliver]
// Legal gate (kv/kv-legal.mjs): storyboard.js (compiled) or scene.js string literals, <Name>.srt/.vtt and vo.json are
// scanned once; check `legal` FAILs on any legal error (superlatives, absolute claims, political, obscene, ...).
// KV projects run in final mode: every text unit needs verdict 'ok' in legal_review.json (node kv.mjs legal --review-template).
// Checks per variant: container/codec, WxH, fps, frame count, duration, audio format, integrated loudness,
// true peak, declared breath gaps (TL.audioGaps; digital silence reads -inf and passes), photosensitive flash rate,
// seamless loop (when video.config.json has "loop": true), cover presence, audio translation (hook_onset and
// mono_folddown FAIL; phase_corr, phone_sim, max_short_term, vo_anchor, hook_event, end_ringout, loop_audio WARN;
// loudness_range WARN, INFO under 60 s: kr-video-score music_best_practices.md). Loudness targets follow
// video.config.json audio.class (social | r128 | atsc | stream-music | stream-speech; explicit lufs/tp win). Writes qa/<file>_qa.json and a contact
// sheet sampled from the final encode (9:16 sheets carry the platform safe-zone overlay; a variant can set its own
// "safeZones" or false). Exit code 1 when any check FAILs — report the tool's exit and every dimension, not a
// hand-picked subset.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { audioTargets } from './lib/synth.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const PROJECT = path.resolve(opt('project', process.cwd()));
const CFG = JSON.parse(fs.readFileSync(path.join(PROJECT, 'video.config.json'), 'utf8'));
const TL = (() => { const s = fs.readFileSync(path.join(PROJECT, 'timeline.js'), 'utf8'); return new Function(s + '; return TL;')(); })();
const FFMPEG = process.env.FFMPEG || 'ffmpeg', FFPROBE = process.env.FFPROBE || 'ffprobe';
const KIDS = (TL.audience || CFG.audience) === 'kids';
const A = audioTargets(CFG.audio || {}, KIDS ? 'kids' : undefined);
const VO = fs.existsSync(path.join(PROJECT, 'vo.json')) ? JSON.parse(fs.readFileSync(path.join(PROJECT, 'vo.json'), 'utf8')) : [];
const fps = CFG.fps || TL.fps || 60;
const names = opt('variant', 'all') === 'all' ? Object.keys(CFG.variants) : opt('variant').split(',');
const DEFAULT_SAFE = { top: 230, bottom: 400, right: { x: 940, y0: 1000, y1: 1520 } }; // 1080x1920 Shorts/Reels/TikTok union
const QA_DIR = path.join(PROJECT, 'qa');
fs.mkdirSync(QA_DIR, { recursive: true });
const loopTool = fs.existsSync(path.join(PROJECT, 'loopcheck.mjs')) ? path.join(PROJECT, 'loopcheck.mjs') : path.join(HERE, 'loopcheck.mjs');

const sh = (cmd, args) => spawnSync(cmd, args, { cwd: PROJECT, encoding: 'utf8', maxBuffer: 256 << 20 });
const dB = s => s === undefined ? NaN : /-inf/.test(s) ? -Infinity : parseFloat(s);

/** Photosensitivity screen (approximates the WCAG "three flashes" rule on whole-frame luma): a transition is a swing
 *  of >= 20/255 in mean luma between successive extrema; two opposing transitions make one flash. Returns the max
 *  number of flashes in any 1-second window. Flashes smaller than the frame are not detected. */
function flashRate(file) {
  const r = sh(FFMPEG, ['-v', 'error', '-i', file, '-vf', 'scale=64:-2,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-', '-an', '-f', 'null', '-']);
  const y = [...(r.stdout || '').matchAll(/YAVG=([\d.]+)/g)].map(m => +m[1]);
  const ext = [];
  let lo = 0, hi = 0, dir = 0;
  for (let i = 1; i < y.length; i++) {
    if (y[i] > y[hi]) hi = i;
    if (y[i] < y[lo]) lo = i;
    if (dir >= 0 && y[hi] - y[i] >= 20) { ext.push(hi); dir = -1; lo = i; hi = i; }
    else if (dir <= 0 && y[i] - y[lo] >= 20) { ext.push(lo); dir = 1; hi = i; lo = i; }
  }
  let worst = 0;
  for (let i = 0, j = 0; i < ext.length; i++) { while (ext[i] - ext[j] > fps) j++; worst = Math.max(worst, Math.floor((i - j + 1) / 2)); }
  return { flashes: worst, samples: y.length };
}

// legal gate, once per project (kv-legal.mjs in kv/ next to this tool, or the skill's scripts/kv/)
const LEGAL = await (async () => {
  const mod = [path.join(HERE, 'kv', 'kv-legal.mjs'), path.join(PROJECT, 'kv', 'kv-legal.mjs')].find(f => fs.existsSync(f));
  if (!mod) return { missing: true };
  if (!fs.existsSync(path.join(path.dirname(mod), 'legal', 'lexicon.json'))) { console.log('  legal ERROR legal gate not installed: kv/legal/lexicon.json is missing (copy kv/legal/ from the skill)'); return { missing: 'kv/legal/lexicon.json missing' }; } // integration
  const L = await import(pathToFileURL(mod).href), audience = TL.audience || CFG.audience; // kids rules for classic projects too
  const F = fs.existsSync(path.join(PROJECT, 'storyboard.js')) ? L.scanStoryboard(PROJECT, { audience, final: true }).findings
    : ['scene.js', `${CFG.name}.srt`, `${CFG.name}.vtt`, 'vo.json'].map(f => path.join(PROJECT, f)).filter(f => fs.existsSync(f)).flatMap(f => L.scanFile(f, { audience }).findings);
  const errors = F.filter(f => f.sev === 'error');
  for (const f of errors) console.log(`  legal ERROR ${f.where}: "${f.term}" (${f.cat}) — ${f.suggestion}`);
  for (const f of F.filter(f => f.sev === 'info')) console.log(`  legal info  ${f.where}: "${f.term}" (${f.note})`);
  return { errors: errors.length, warns: F.filter(f => f.sev === 'warn').length };
})();
let failed = 0;
for (const name of names) {
  const v = CFG.variants[name], file = path.join(PROJECT, `${CFG.name}_${name}.mp4`), checks = [];
  const add = (id, ok, value, expected, info = false) => checks.push({ id, status: info === 'warn' ? (ok ? 'PASS' : 'WARN') : info ? 'INFO' : ok ? 'PASS' : 'FAIL', value, expected });
  add('legal', !LEGAL.missing && !LEGAL.errors, LEGAL.missing ? (LEGAL.missing === true ? 'kv-legal.mjs missing' : LEGAL.missing) : `${LEGAL.errors} error(s), ${LEGAL.warns} warning(s)`, '0 legal errors (details: node kv/kv-legal.mjs .)');
  if (!fs.existsSync(file)) { add('file_exists', false, 'missing', file); }
  else {
    const pr = JSON.parse(sh(FFPROBE, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]).stdout);
    const vs = pr.streams.find(s => s.codec_type === 'video'), as = pr.streams.find(s => s.codec_type === 'audio');
    const expFrames = Math.round(TL.dur * fps), [rn, rd] = (vs?.r_frame_rate || '0/1').split('/').map(Number), rate = rn / rd;
    add('video_codec', vs?.codec_name === 'h264' && vs?.pix_fmt === 'yuv420p', `${vs?.codec_name}/${vs?.pix_fmt}`, 'h264/yuv420p');
    add('resolution', vs?.width === v.w && vs?.height === v.h, `${vs?.width}x${vs?.height}`, `${v.w}x${v.h}`);
    add('fps', Math.abs(rate - fps) < 0.01, rate, fps);
    add('frame_count', Math.abs(+vs?.nb_frames - expFrames) <= 1, +vs?.nb_frames, expFrames);
    add('duration', Math.abs(+pr.format.duration - TL.dur) <= 0.06, +(+pr.format.duration).toFixed(3), TL.dur);
    add('audio_format', as?.codec_name === 'aac' && +as?.sample_rate === 48000 && as?.channels === 2, `${as?.codec_name}/${as?.sample_rate}/${as?.channels}ch`, 'aac/48000/2ch');
    const eb = sh(FFMPEG, ['-hide_banner', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-']).stderr;
    const sum = eb.slice(eb.lastIndexOf('Summary:'));
    const I = parseFloat((sum.match(/I:\s+(-?[\d.]+) LUFS/) || [])[1]), P = parseFloat((sum.match(/Peak:\s+(-?[\d.]+) dBFS/) || [])[1]);
    add('integrated_loudness', Math.abs(I - A.lufs) <= 1.0, I, `${A.lufs} ±1 LUFS`);
    add('true_peak', P <= A.tp + 0.5, P, `<= ${A.tp + 0.5} dBTP`);
    // music best practices (kr-video-score/references/music_best_practices.md §4, §5, §8); corpus 02-10 passes all
    const lufsOf = af => parseFloat(((s => s.slice(s.lastIndexOf('Summary:')))(sh(FFMPEG, ['-hide_banner', '-nostats', '-i', file, '-vn', '-af', af + ',ebur128', '-f', 'null', '-']).stderr).match(/I:\s+(-?[\d.]+) LUFS/) || [])[1]);
    const MONO = 'pan=stereo|c0=0.5*c0+0.5*c1|c1=0.5*c0+0.5*c1';
    const hook = dB((sh(FFMPEG, ['-hide_banner', '-t', '0.25', '-i', file, '-vn', '-af', 'astats=measure_perchannel=none', '-f', 'null', '-']).stderr.match(/RMS level dB:\s*(-?[\d.]+|-inf)/g) || []).pop()?.split(':')[1]);
    add('hook_onset', hook >= -35, Number.isFinite(hook) ? +hook.toFixed(1) : String(hook), '0-0.25 s RMS >= -35 dBFS (sound from frame 0)');
    const fold = +(I - lufsOf(MONO)).toFixed(1);
    add('mono_folddown', fold <= 1.5, fold, '<= 1.5 LU lost in mono (phase cancellation)');
    const ph = (sh(FFMPEG, ['-hide_banner', '-nostats', '-i', file, '-vn', '-af', 'aphasemeter=video=0,ametadata=print:key=lavfi.aphasemeter.phase', '-f', 'null', '-']).stderr.match(/phase=(-?[\d.]+)/g) || []).map(x => +x.slice(6));
    const phase = ph.length ? +(ph.reduce((a, b) => a + b, 0) / ph.length).toFixed(2) : NaN;
    add('phase_corr', phase >= 0.3, phase, 'mean >= +0.3', 'warn');
    const phone = +(I - lufsOf(`highpass=f=250,highpass=f=250,${MONO}`)).toFixed(1);
    add('phone_sim', phone <= 6, phone, '<= 6 LU quieter on a phone speaker (250 Hz high-pass + mono)', 'warn');
    const LRA = parseFloat((sum.match(/LRA:\s+(-?[\d.]+) LU/) || [])[1]);
    // EBU R128 s1: LRA is not meaningful for short-form; a cap on the max short-term (3 s) loudness is
    add('loudness_range', LRA >= 3 && LRA <= 8, LRA, `3-8 LU (energy arc without pumping)${TL.dur < 60 ? '; info only under 60 s' : ''}`, TL.dur < 60 ? true : 'warn');
    const Ss = [...eb.slice(0, eb.lastIndexOf('Summary:')).matchAll(/\bS:\s*(-?[\d.]+)/g)].map(m => +m[1]).filter(v => v > -70), Smax = Ss.length ? Math.max(...Ss) : NaN;
    add('max_short_term', Smax - I <= (KIDS ? 3 : 5), Number.isFinite(Smax) ? +(Smax - I).toFixed(1) : 'n/a', `max short-term (3 s) <= integrated +${KIDS ? 3 : 5} LU${KIDS ? ' (kids)' : ''} (EBU R128 s1)`, 'warn');
    if (VO.length) { // dialogue-anchored: the voice carries the programme
      const sel = VO.filter(l => l.t < TL.dur).map(l => `between(t,${Math.max(0, l.t).toFixed(3)},${Math.min(TL.dur, l.t + l.dur).toFixed(3)})`).join('+');
      const Ivo = VO.reduce((s, l) => s + l.dur, 0) >= 0.4 ? lufsOf(`aselect='${sel}',asetpts=N/SR/TB`) : NaN;
      if (Number.isFinite(Ivo) && Ivo > -70) add('vo_anchor', Ivo >= I - 2, +(Ivo - I).toFixed(1), 'loudness inside voice lines >= integrated - 2 LU', 'warn');
      else add('vo_anchor', true, 'n/a', 'voice lines too short to measure', true);
    }
    const r5 = (a, b) => [...sh(FFMPEG, ['-hide_banner', '-nostats', '-ss', String(Math.max(0, a)), '-to', String(b), '-i', file, '-vn', '-af', 'aresample=48000,asetnsamples=n=240:p=0,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level', '-f', 'null', '-']).stderr.matchAll(/RMS_level=(-?[\d.]+|-inf)/g)].map(m => m[1] === '-inf' ? -200 : +m[1]);
    const rmsOf = (a, b) => dB((sh(FFMPEG, ['-hide_banner', '-nostats', '-ss', String(Math.max(0, a)), '-to', String(b), '-i', file, '-vn', '-af', 'astats=measure_perchannel=none', '-f', 'null', '-']).stderr.match(/RMS level dB:\s*(-?[\d.]+|-inf)/g) || []).pop()?.split(':')[1]);
    { // a salient onset inside beat 1: first 5 ms window >= -20 dBFS or a +10 dB step
      const w = r5(0, TL.beat + 0.05), k = w.findIndex((v, i) => v >= -20 || (i && v - w[i - 1] >= 10)), on = k < 0 ? NaN : k * 0.005;
      add('hook_event', on <= TL.beat + 1 / fps, Number.isFinite(on) ? +on.toFixed(3) : 'none', `salient onset <= 1 beat (${TL.beat.toFixed(2)} s)`, 'warn');
    }
    const endSc = (TL.scenes || []).find(s => s.end);
    if (!CFG.loop && endSc && TL.dur - endSc.t0 >= 1) { // end on a ringing tonic: decayed, not cut, not faded to nothing at once
      const st = rmsOf(endSc.t0, endSc.t0 + 0.5), tail = rmsOf(TL.dur - 0.1, TL.dur), body = rmsOf(endSc.t0 + 0.1, endSc.t0 + 0.6);
      add('end_ringout', tail <= st - 15 && body >= -30, `${Number.isFinite(tail) ? (tail - st).toFixed(1) : tail} dB / ${Number.isFinite(body) ? body.toFixed(1) : body} dBFS`, 'last 0.1 s <= sting -15 dB; sting >= -30 dBFS', 'warn');
    }
    // loop: the last 0.25 s leads into the first 0.25 s (0.25 s windows: 50 ms ones are dominated by the bar-1 kick transient)
    if (CFG.loop) { const head = rmsOf(0, 0.25), tail = rmsOf(TL.dur - 0.25, TL.dur); add('loop_audio', tail >= -35 && Math.abs(head - tail) <= 6, `${Number.isFinite(tail) ? tail.toFixed(1) : tail} / ${Number.isFinite(head) ? head.toFixed(1) : head} dBFS`, 'tail >= -35 dBFS, |head - tail| <= 6 dB (0.25 s)', 'warn'); }
    for (const [a, b] of TL.audioGaps || []) { // a declared "breath" before a hit must actually be near-silent
      if (a < 0) continue;
      const r = sh(FFMPEG, ['-hide_banner', '-ss', String(a + 0.02), '-to', String(b - 0.02), '-i', file, '-vn', '-af', 'astats=measure_perchannel=none', '-f', 'null', '-']).stderr;
      const rms = dB((r.match(/RMS level dB:\s*(-?[\d.]+|-inf)/g) || []).pop()?.split(':')[1]);
      add(`breath_gap_${a}`, rms < -30, Number.isFinite(rms) ? +rms.toFixed(1) : String(rms), '< -30 dBFS');
    }
    const fr = flashRate(file);
    add('flash_rate', fr.flashes <= 3, `${fr.flashes} in 1 s (max)`, '<= 3 whole-frame flashes / s');
    if (CFG.loop) {
      const { loopCompare } = await import(pathToFileURL(loopTool).href);
      const lr = loopCompare(file, expFrames, path.join(QA_DIR, `${CFG.name}_${name}_loop_first_last.png`));
      add('loop_seam', lr.ssim >= 0.9, `SSIM ${lr.ssim} PSNR ${lr.psnr}`, 'first vs last frame SSIM >= 0.9');
    }
    if (v.cover !== undefined) add('cover', fs.existsSync(path.join(PROJECT, `${CFG.name}_${name}_cover.jpg`)), 'jpg', 'present');
    // contact sheet from the final encode
    const times = opt('times') ? opt('times').split(',').map(Number)
      : TL.S ? Object.values(TL.S).map(([a, b]) => +(a + (b - a) * 0.6).toFixed(2))
        : Array.from({ length: 8 }, (_, i) => +((i + 0.5) * TL.dur / 8).toFixed(2));
    const portrait = v.h > v.w, tw = portrait ? 270 : 480, th = Math.round(tw * v.h / v.w), cols = portrait ? Math.min(times.length, 6) : Math.min(times.length, 4);
    const sz = v.safeZones === false ? null : v.safeZones || (v.h / v.w > 1.5 ? DEFAULT_SAFE : null);
    const overlay = sz ? `drawbox=x=0:y=0:w=${v.w}:h=${sz.top}:color=red@0.28:t=fill,drawbox=x=0:y=${v.h - sz.bottom}:w=${v.w}:h=${sz.bottom}:color=red@0.28:t=fill,drawbox=x=${sz.right.x}:y=${sz.right.y0}:w=${v.w - sz.right.x}:h=${sz.right.y1 - sz.right.y0}:color=red@0.28:t=fill,` : '';
    const inputs = times.flatMap(t => ['-ss', String(t), '-i', file]);
    const chains = times.map((t, j) => `[${j}:v]trim=end_frame=1,${overlay}scale=${tw}:${th}[v${j}]`).join(';'); // tiles in reading order = sheet_times
    const layout = times.map((_, j) => `${(j % cols) * tw}_${Math.floor(j / cols) * th}`).join('|');
    const sheet = path.join(QA_DIR, `${CFG.name}_${name}_sheet.png`);
    const r = sh(FFMPEG, ['-v', 'error', '-y', ...inputs, '-filter_complex', `${chains};${times.map((_, j) => `[v${j}]`).join('')}xstack=inputs=${times.length}:layout=${layout}:fill=black`, '-frames:v', '1', sheet]);
    if (r.status !== 0) process.stderr.write(r.stderr || '');
    add('contact_sheet', r.status === 0 && fs.existsSync(sheet), path.relative(PROJECT, sheet), 'written');
    add('sheet_times', true, times.join(','), 'tiles left-to-right, top-to-bottom', true);
  }
  const report = { file: path.relative(PROJECT, file), variant: name, generated_at: new Date().toISOString(), checks, result: checks.some(c => c.status === 'FAIL') ? 'FAIL' : 'PASS', warnings: checks.filter(c => c.status === 'WARN').length };
  fs.writeFileSync(path.join(QA_DIR, `${CFG.name}_${name}_qa.json`), JSON.stringify(report, null, 2));
  console.log(`\n${report.result}  ${report.file}`);
  for (const c of checks) console.log(`  ${c.status.padEnd(4)} ${c.id.padEnd(22)} ${String(c.value).padEnd(26)} expected ${c.expected}`);
  if (report.result === 'FAIL') failed++;
}
if (argv.includes('--deliver')) { // deliver.mjs outputs (--deliver): reads qa/*_deliver.json, never re-measures
  const want = (CFG.deliver && CFG.deliver.presets) || ['social', 'small'];
  console.log('\nDELIVERABLES (deliver.mjs; full checks in qa/*_deliver.json)');
  for (const name of names) {
    let bad = 0;
    const master = path.join(PROJECT, `${CFG.name}_${name}.mp4`), mtime = fs.existsSync(master) ? fs.statSync(master).mtimeMs : 0;
    for (const p of want) {
      const jf = path.join(QA_DIR, `${CFG.name}_${name}_${p}_deliver.json`);
      if (!fs.existsSync(jf)) { console.log(`  FAIL ${name.padEnd(5)} ${p.padEnd(10)} missing ${path.relative(PROJECT, jf)} (run: node deliver.mjs --variant ${name} --preset ${p})`); bad++; continue; }
      const d = JSON.parse(fs.readFileSync(jf, 'utf8')), stale = mtime > Date.parse(d.generated_at);
      const st = stale ? 'FAIL' : d.status === 'SKIP' ? 'INFO' : d.status;
      console.log(`  ${st.padEnd(4)} ${name.padEnd(5)} ${p.padEnd(10)} ${d.mb} MB (${d.pct_of_master} % of master) q=${d.q} VMAF ${d.vmaf && d.vmaf.mean} p1 ${d.vmaf && d.vmaf.p1} CAMBI ${d.cambi} TP ${d.audio && d.audio.tp} ${d.file}${stale ? '  STALE: master rebuilt after delivery' : ''}`);
      for (const c of (d.checks || []).filter(c => c.status === 'FAIL' || c.status === 'WARN')) console.log(`         ${c.status} ${c.id}: ${c.value} (expected ${c.expected})`);
      if (st === 'FAIL') bad++;
    }
    const mr = path.join(QA_DIR, `${CFG.name}_${name}_qa.json`); // count a variant once: skip if its master QA already FAILed
    if (bad && !(fs.existsSync(mr) && JSON.parse(fs.readFileSync(mr, 'utf8')).result === 'FAIL')) failed++;
  }
}
console.log(failed ? `\nQA FAILED for ${failed} variant(s)` : '\nQA PASSED — now look at the contact sheet(s) in qa/ before delivering');
process.exit(failed ? 1 : 0);
