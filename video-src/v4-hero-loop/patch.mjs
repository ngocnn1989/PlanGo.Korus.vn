// Fix a late change without a full re-render: render only [from, to) for each variant, splice it into the existing
// picture track (_video_only_<variant>.mp4), re-mux the audio, then run qa.mjs.
//   node patch.mjs --from 25.5 [--to <dur>] [--variant all|16x9,9x16] [--workers N] [--encoder auto|x264|nvenc|qsv] [--no-qa] [--project <dir>]
// Pick `from` a little before the first frame that changes (the edit must not alter frames before it).
// The spliced track is re-encoded once with the renderer's settings (CRF from the variant, same encoder choice, bt709).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const P = path.resolve(opt('project', process.cwd()));
const CFG = JSON.parse(fs.readFileSync(path.join(P, 'video.config.json'), 'utf8'));
const TL = new Function(fs.readFileSync(path.join(P, 'timeline.js'), 'utf8') + '; return TL;')();
const fps = CFG.fps || TL.fps || 60, from = +opt('from', NaN), to = +opt('to', TL.dur);
if (!(from >= 0 && to > from)) { console.error('usage: node patch.mjs --from <s> [--to <s>] [--variant ...]'); process.exit(2); }
const names = opt('variant', 'all') === 'all' ? Object.keys(CFG.variants) : opt('variant').split(',');
const script = f => fs.existsSync(path.join(P, f)) ? path.join(P, f) : path.join(HERE, f);
const run = (cmd, args) => { const r = spawnSync(cmd, args, { cwd: P, stdio: 'inherit' }); if (r.status !== 0) throw new Error(`${path.basename(cmd)} failed (${r.status})`); };
const frames = f => +spawnSync(process.env.FFPROBE || 'ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', f], { encoding: 'utf8' }).stdout.trim();
const ENC = fs.existsSync(path.join(P, 'lib', 'encoders.mjs')) ? path.join(P, 'lib', 'encoders.mjs') : path.join(HERE, 'lib', 'encoders.mjs');
const { pickEncoder, encodeArgs } = await import(pathToFileURL(ENC).href);
const encoder = pickEncoder(opt('encoder', CFG.encoder || 'auto'), { gpu: CFG.gpu || process.env.KV_GPU || 'high' });
const f0 = Math.round(from * fps), f1 = Math.round(to * fps), total = Math.round(TL.dur * fps);

for (const v of names) {
  const base = path.join(P, `_video_only_${v}.mp4`), seg = path.join(P, `_patch_${v}.mp4`), tmp = path.join(P, `_video_only_${v}.new.mp4`);
  if (!fs.existsSync(base)) throw new Error(`missing ${base} — run a full build first`);
  run(process.execPath, [script('render.mjs'), '--project', P, '--variant', v, '--from', String(from), '--to', String(to), '--video', seg, '--encoder', encoder, ...(opt('workers') ? ['--workers', opt('workers')] : [])]);
  const parts = [`[0:v]trim=end_frame=${f0},setpts=PTS-STARTPTS[a]`, '[1:v]setpts=PTS-STARTPTS[b]'];
  let cat = '[a][b]concat=n=2:v=1:a=0[v]';
  if (f1 < total) { parts.push(`[0:v]trim=start_frame=${f1},setpts=PTS-STARTPTS[c]`); cat = '[a][b][c]concat=n=3:v=1:a=0[v]'; }
  run(process.env.FFMPEG || 'ffmpeg', ['-v', 'error', '-y', '-i', base, '-i', seg, '-filter_complex', `${parts.join(';')};${cat}`, '-map', '[v]',
    ...encodeArgs(encoder, CFG.variants[v].crf || 14, fps), '-movflags', '+faststart', tmp]);
  const n = frames(tmp);
  if (n !== total) { fs.rmSync(tmp, { force: true }); throw new Error(`${v}: spliced track has ${n} frames, expected ${total}`); }
  fs.renameSync(tmp, base); fs.rmSync(seg, { force: true });
  console.log(`patched ${v}: frames ${f0}-${f1 - 1} re-rendered (${n} total)`);
}
run(process.execPath, [script('build.mjs'), '--project', P, '--mux-only', '--variant', names.join(',')]);
if (!argv.includes('--no-qa')) run(process.execPath, [script('qa.mjs'), '--project', P, '--variant', names.join(',')]);
