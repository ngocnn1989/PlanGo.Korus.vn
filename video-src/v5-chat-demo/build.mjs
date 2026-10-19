// kr-motion-video build pipeline, driven by video.config.json in the project folder:
//   audio script -> picture per variant -> two-pass loudnorm -> mux -> optional cover JPG.
//
//   node build.mjs [--variant all|16x9|9x16] [--mux-only] [--skip-audio] [--workers N] [--encoder auto|x264|nvenc|qsv|mf] [--project <dir>]
//
// --mux-only   reuse music.wav and the rendered picture track(s) (_video_only_<variant>.mp4)
// --skip-audio reuse music.wav but re-render pictures
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const has = k => argv.includes('--' + k);
const PROJECT = path.resolve(opt('project', process.cwd()));
const CFG = JSON.parse(fs.readFileSync(path.join(PROJECT, 'video.config.json'), 'utf8'));
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
// loudness targets: video.config.json audio.class (social -14/-1.5 default | r128 | atsc | stream-music | stream-speech);
// explicit audio.lufs / audio.tp win; audience 'kids' drops the 5 kHz shelf (lib/synth.mjs audioTargets)
const A = Object.assign({ script: 'music.mjs', wav: 'music.wav', eq: 'highpass=f=30,lowshelf=f=90:g=-2,highshelf=f=5000:g=3', lra: 11, bitrate: '320k' }, (await import('./lib/synth.mjs')).audioTargets(CFG.audio || {}, CFG.audience));
const WAV = path.join(PROJECT, A.wav);
const names = opt('variant', 'all') === 'all' ? Object.keys(CFG.variants) : opt('variant').split(',');
const renderScript = fs.existsSync(path.join(PROJECT, 'render.mjs')) ? path.join(PROJECT, 'render.mjs') : path.join(HERE, 'render.mjs');

const run = (cmd, args, capture = false) => {
  const r = spawnSync(cmd, args, { cwd: PROJECT, encoding: 'utf8', stdio: capture ? ['ignore', 'inherit', 'pipe'] : 'inherit' });
  if (r.status !== 0) { if (capture) process.stderr.write(r.stderr || ''); throw new Error(`${path.basename(cmd)} ${args[0] || ''} failed (exit ${r.status})`); }
  return r.stderr || '';
};

const t0 = Date.now();
if (!has('mux-only') && !has('skip-audio')) run(process.execPath, [path.join(PROJECT, A.script), WAV]);
if (!fs.existsSync(WAV)) throw new Error('missing ' + WAV + ' (run without --mux-only/--skip-audio once)');

// loudnorm pass 1 (measure) -> pass 2 (linear), so every variant gets the identical master
const log = run(FFMPEG, ['-hide_banner', '-i', WAV, '-af', `${A.eq},loudnorm=I=${A.lufs}:TP=${A.tp}:LRA=${A.lra}:print_format=json`, '-f', 'null', '-'], true);
const m = JSON.parse(log.slice(log.lastIndexOf('{'), log.lastIndexOf('}') + 1));
// Linear loudnorm does not enforce true peak (the EQ shelf can push input TP above 0 dBTP), and AAC adds
// inter-sample overshoot, so a sample-peak limiter sits 0.5 dB under the TP target.
const limit = Math.pow(10, (A.tp - 0.5) / 20).toFixed(3);
const LN = `loudnorm=I=${A.lufs}:TP=${A.tp}:LRA=${A.lra}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,alimiter=limit=${limit}:attack=1:release=60:level=false`;

for (const name of names) {
  const v = CFG.variants[name];
  if (!v) throw new Error(`unknown variant ${name}`);
  const pic = path.join(PROJECT, `_video_only_${name}.mp4`);
  if (!has('mux-only')) run(process.execPath, [renderScript, '--project', PROJECT, '--variant', name, '--video', pic, ...(opt('workers') ? ['--workers', opt('workers')] : []), ...(opt('encoder') ? ['--encoder', opt('encoder')] : [])]);
  const out = path.join(PROJECT, `${CFG.name}_${name}.mp4`);
  run(FFMPEG, ['-v', 'error', '-y', '-i', pic, '-i', WAV, '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
    '-af', `${A.eq},${LN}`, '-ar', '48000', '-c:a', 'aac', '-b:a', A.bitrate, '-movflags', '+faststart', '-shortest', out]);
  console.log(`final -> ${out}`);
  if (v.cover !== undefined) {
    const cover = path.join(PROJECT, `${CFG.name}_${name}_cover.jpg`);
    run(FFMPEG, ['-v', 'error', '-y', '-ss', String(v.cover), '-i', out, '-frames:v', '1', '-q:v', '2', cover]);
    console.log(`cover -> ${cover}`);
  }
}
console.log(`build done in ${((Date.now() - t0) / 1000).toFixed(0)}s — next: node qa.mjs --variant <name>`);
