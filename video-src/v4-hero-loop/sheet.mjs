// Contact sheet from PNG stills — one image to review instead of many (token saver for agents that "look").
//   node sheet.mjs <stillsDir> [--out <dir>/_sheet.png] [--cols 4] [--tile 480] [--match 00.95,12.60]
// Also used by `render.mjs --stills ... --sheet`. Tiles are labelled with the file's time.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FFMPEG = process.env.FFMPEG || 'ffmpeg', FFPROBE = process.env.FFPROBE || 'ffprobe';

// stills per ffmpeg call: one call with ~190 inputs + filter chains overflowed the Windows command line (spawn failed,
// "sheet failed: undefined"); bigger sets are built in row-aligned chunks and stacked into the same single sheet
const MAX_INPUTS = 40;

/** files: absolute PNG paths (same size). Returns the sheet path or throws. Huge sets only (no cols / tile given, and more
 *  than 150 stills or a full-size sheet taller than 16000 px): half-size tiles in twice the columns, so the sheet keeps its
 *  width and stays openable (e.g. 193 stills of 16:9 -> 8 × 25 tiles of 240 px). Up to 150 stills the sheet is unchanged. */
export function makeSheet(files, out, { cols, tile } = {}) {
  if (!files.length) throw new Error('makeSheet: no stills');
  const [w, h] = spawnSync(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', files[0]], { encoding: 'utf8' })
    .stdout.trim().split(',').map(Number);
  const portrait = h > w, th0 = Math.round((portrait ? 300 : 480) * h / w), tall = Math.ceil(files.length / (portrait ? 6 : 4)) * th0;
  const shrink = !tile && !cols && (files.length > 150 || tall > 16000) ? 2 : 1;
  const tw = tile || Math.round((portrait ? 300 : 480) / shrink), th = Math.round(tw * h / w);
  const nc = Math.min(files.length, cols || (portrait ? 6 : 4) * shrink);
  const label = f => path.basename(f, '.png').replace(/^f_/, '').replace(/[':\\]/g, '');
  // Windows ffmpeg builds often lack fontconfig: point drawtext at Arial under %WINDIR% (elsewhere fontconfig finds a font)
  const winFont = process.platform === 'win32' && (process.env.WINDIR || process.env.SystemRoot) ? path.join(process.env.WINDIR || process.env.SystemRoot, 'Fonts', 'arial.ttf').replace(/\\/g, '/') : null;
  const fontOpt = winFont && fs.existsSync(winFont) ? `:fontfile='${winFont.replace(':', '\\:')}'` : '';
  const ff = (args, what) => { const r = spawnSync(FFMPEG, ['-v', 'error', '-y', ...args], { encoding: 'utf8' }); if (r.error || r.status !== 0) throw new Error(`sheet failed (${what}): ` + (r.stderr || (r.error && r.error.message) || 'exit ' + r.status)); };
  const grid = (list, dest) => {
    const n = Math.min(list.length, nc);
    const chains = list.map((f, i) => `[${i}:v]scale=${tw}:${th},drawtext=text='${label(f)}'${fontOpt}:x=6:y=6:fontsize=${Math.max(14, Math.round(tw / 22))}:fontcolor=yellow:box=1:boxcolor=black@0.6[v${i}]`).join(';');
    const layout = list.map((_, i) => `${(i % n) * tw}_${Math.floor(i / n) * th}`).join('|');
    const stack = list.length === 1 ? '[v0]copy' : `${list.map((_, i) => `[v${i}]`).join('')}xstack=inputs=${list.length}:layout=${layout}:fill=black`;
    ff([...list.flatMap(f => ['-i', f]), '-filter_complex', `${chains};${stack}`, '-frames:v', '1', dest], `${list.length} tiles`);
  };
  if (files.length <= MAX_INPUTS) { grid(files, out); return out; }
  const per = Math.max(nc, Math.floor(MAX_INPUTS / nc) * nc), parts = [];
  try {
    for (let i = 0; i < files.length; i += per) { const p = out.replace(/\.png$/i, '') + `.part${parts.length}.png`; grid(files.slice(i, i + per), p); parts.push(p); }
    const pads = parts.map((_, i) => `[${i}:v]pad=${nc * tw}:ih:0:0:black[p${i}]`).join(';');   // a short last row is narrower
    ff([...parts.flatMap(p => ['-i', p]), '-filter_complex', `${pads};${parts.map((_, i) => `[p${i}]`).join('')}vstack=inputs=${parts.length}`, '-frames:v', '1', out], `stack of ${parts.length}`);
  } finally { for (const p of parts) fs.rmSync(p, { force: true }); }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
  const dir = argv[0];
  if (!dir || dir.startsWith('--')) { console.error('usage: node sheet.mjs <stillsDir> [--out file.png] [--cols N] [--tile px] [--match a,b]'); process.exit(2); }
  const match = opt('match') ? opt('match').split(',') : null;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.png') && !f.startsWith('_') && (!match || match.some(m => f.includes(m)))).sort().map(f => path.join(dir, f));
  console.log(makeSheet(files, path.resolve(opt('out', path.join(dir, '_sheet.png'))), { cols: +opt('cols', 0) || undefined, tile: +opt('tile', 0) || undefined }), files.length, 'tiles');
}
