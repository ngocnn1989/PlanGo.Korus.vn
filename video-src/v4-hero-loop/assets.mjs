// Asset analyzer (no image reading by the agent needed for the basics):
//   node assets.mjs <file...> [--json assets.meta.json]
// Per image: size, alpha, background (transparent / opaque light / opaque dark), content crop box, the blend to use
// for an opaque logo on a same-tone card ('multiply' on white, 'screen' on black), mean luma (dark/light photo ->
// needs a scrim under copy) and mean colour. init.mjs uses it for logos; the kv pipeline for every asset.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FFMPEG = process.env.FFMPEG || 'ffmpeg', FFPROBE = process.env.FFPROBE || 'ffprobe';
const bbox = (file, vf) => {
  const m = [...(spawnSync(FFMPEG, ['-hide_banner', '-i', file, '-vf', `${vf},bbox=min_val=40`, '-f', 'null', '-'], { encoding: 'utf8' }).stderr || '').matchAll(/x1:(\d+) x2:(\d+) y1:(\d+) y2:(\d+)/g)].pop();
  return m ? [+m[1], +m[3], +m[2] - +m[1] + 1, +m[4] - +m[3] + 1] : null;
};
const rgba = (file, vf) => [...spawnSync(FFMPEG, ['-v', 'error', '-i', file, '-vf', `${vf},format=rgba`, '-frames:v', '1', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 20 }).stdout];

export function analyzeImage(file) {
  const [w, h] = spawnSync(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file], { encoding: 'utf8' }).stdout.trim().split(',').map(Number);
  const corners = [[0, 0], [w - 2, 0], [0, h - 2], [w - 2, h - 2]].map(([x, y]) => rgba(file, `crop=2:2:${x}:${y},scale=1:1`));
  const alphaBox = bbox(file, 'format=rgba,alphaextract');
  const transparent = corners.some(c => c[3] < 250);
  const avg = rgba(file, 'scale=1:1:flags=area'), luma = Math.round(0.2126 * avg[0] + 0.7152 * avg[1] + 0.0722 * avg[2]);
  const cornerLuma = corners.map(c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]);
  let bg = 'transparent', crop = alphaBox, blend = null;
  if (!transparent) {
    const light = cornerLuma.every(l => l > 235), dark = cornerLuma.every(l => l < 25);
    bg = light ? 'opaque-light' : dark ? 'opaque-dark' : 'photo';
    if (light) { crop = bbox(file, 'format=gray,negate'); blend = 'multiply'; }
    else if (dark) { crop = bbox(file, 'format=gray'); blend = 'screen'; }
    else crop = [0, 0, w, h];
    if (crop && bg !== 'photo') { // keep a small margin around the content
      const m = Math.round(Math.min(w, h) * 0.015);
      crop = [Math.max(0, crop[0] - m), Math.max(0, crop[1] - m), Math.min(w, crop[2] + 2 * m), Math.min(h, crop[3] + 2 * m)];
      crop[2] = Math.min(crop[2], w - crop[0]); crop[3] = Math.min(crop[3], h - crop[1]);
    }
  }
  return { file: path.basename(file), w, h, bg, crop: crop || [0, 0, w, h], blend, luma, tone: luma < 90 ? 'dark' : luma > 170 ? 'light' : 'mid', mean: `#${avg.slice(0, 3).map(x => x.toString(16).padStart(2, '0')).join('')}` };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2), ji = argv.indexOf('--json'), out = ji >= 0 ? argv[ji + 1] : null;
  const files = argv.filter((a, i) => !a.startsWith('--') && i !== ji + 1 || ji < 0 && !a.startsWith('--'));
  if (!files.length) { console.error('usage: node assets.mjs <image...> [--json out.json]'); process.exit(2); }
  const res = files.map(f => analyzeImage(path.resolve(f)));
  for (const r of res) console.log(`${r.file.padEnd(40)} ${`${r.w}x${r.h}`.padEnd(10)} ${r.bg.padEnd(13)} tone ${r.tone.padEnd(5)} luma ${String(r.luma).padStart(3)}  crop [${r.crop.join(',')}]${r.blend ? '  blend ' + r.blend : ''}`);
  if (out) { fs.writeFileSync(out, JSON.stringify(Object.fromEntries(res.map(r => [r.file, r])), null, 2)); console.log('->', out); }
}
