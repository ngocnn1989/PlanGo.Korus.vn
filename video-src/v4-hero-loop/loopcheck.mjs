// Seamless-loop check on the final encodes: frame 0 vs the last frame (PSNR / SSIM) + a side-by-side image in qa/.
//   node loopcheck.mjs [--variant all|16x9,...] [--project <dir>]
// qa.mjs runs the same comparison automatically when video.config.json has "loop": true.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FFMPEG = process.env.FFMPEG || 'ffmpeg';

/** Returns { psnr, ssim, image } comparing the first and last frame of `file`. */
export function loopCompare(file, frames, outImage) {
  const dir = path.dirname(outImage), first = path.join(dir, '_first.png'), last = path.join(dir, '_last.png');
  spawnSync(FFMPEG, ['-v', 'error', '-y', '-i', file, '-vf', 'select=eq(n\\,0)', '-frames:v', '1', first]);
  spawnSync(FFMPEG, ['-v', 'error', '-y', '-i', file, '-vf', `select=eq(n\\,${frames - 1})`, '-frames:v', '1', last]);
  const r = spawnSync(FFMPEG, ['-hide_banner', '-i', first, '-i', last, '-lavfi', '[0][1]psnr;[0][1]ssim', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  spawnSync(FFMPEG, ['-v', 'error', '-y', '-i', first, '-i', last, '-filter_complex', '[0][1]hstack=2,scale=iw/2:-1', outImage]);
  for (const f of [first, last]) try { fs.rmSync(f); } catch { }
  return { psnr: parseFloat((r.match(/PSNR .*average:([\d.]+|inf)/) || [])[1]), ssim: parseFloat((r.match(/SSIM .*All:([\d.]+)/) || [])[1]), image: outImage };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
  const P = path.resolve(opt('project', process.cwd()));
  const CFG = JSON.parse(fs.readFileSync(path.join(P, 'video.config.json'), 'utf8'));
  const TL = new Function(fs.readFileSync(path.join(P, 'timeline.js'), 'utf8') + '; return TL;')();
  const n = Math.round(TL.dur * (CFG.fps || 60)), names = opt('variant', 'all') === 'all' ? Object.keys(CFG.variants) : opt('variant').split(',');
  fs.mkdirSync(path.join(P, 'qa'), { recursive: true });
  for (const v of names) {
    const f = path.join(P, `${CFG.name}_${v}.mp4`);
    if (!fs.existsSync(f)) { console.log(`${v.padEnd(5)} not built`); continue; }
    const r = loopCompare(f, n, path.join(P, 'qa', `${CFG.name}_${v}_loop_first_last.png`));
    console.log(`${v.padEnd(5)} frame 0 vs ${n - 1}: PSNR ${r.psnr} dB  SSIM ${r.ssim}  -> ${path.relative(P, r.image)}`);
  }
}
