// Sinh bộ favicon từ logo tròn KORUS (brand_identity/derived/korus-mark.png, 512×512, nguồn favicon đã đăng ký).
// node design-src/favicon.mjs  → public/favicon-16x16.png, favicon-32x32.png, favicon-48x48 (tạm), favicon.ico,
//                                  apple-touch-icon.png (180, nền trắng), favicon.svg (nhúng PNG, không vẽ lại logo)
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../brand_identity/derived/korus-mark.png');
const PUB = resolve(HERE, '../public');
const ff = (args) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args]);

const png = (size, out, extra = '') =>
  ff(['-i', SRC, '-vf', `scale=${size}:${size}:flags=lanczos${extra}`, '-pix_fmt', 'rgba', out]);

for (const size of [16, 32, 48, 64]) png(size, resolve(PUB, `favicon-${size}x${size}.png`));
// Apple touch: nền trắng, logo 82% (iOS không giữ trong suốt).
ff(['-f', 'lavfi', '-i', 'color=white:s=180x180', '-i', SRC, '-filter_complex',
  '[1]scale=148:148:flags=lanczos[l];[0][l]overlay=16:16', '-frames:v', '1', resolve(PUB, 'apple-touch-icon.png')]);

// ICO chứa PNG 16/32/48 (định dạng PNG-in-ICO, trình duyệt hiện đại đều đọc được).
const entries = [16, 32, 48].map((s) => ({ s, data: readFileSync(resolve(PUB, `favicon-${s}x${s}.png`)) }));
const header = Buffer.alloc(6 + 16 * entries.length);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(entries.length, 4);
let offset = header.length;
entries.forEach(({ s, data }, i) => {
  const o = 6 + 16 * i;
  header.writeUInt8(s, o); header.writeUInt8(s, o + 1); header.writeUInt8(0, o + 2); header.writeUInt8(0, o + 3);
  header.writeUInt16LE(1, o + 4); header.writeUInt16LE(32, o + 6);
  header.writeUInt32LE(data.length, o + 8); header.writeUInt32LE(offset, o + 12);
  offset += data.length;
});
writeFileSync(resolve(PUB, 'favicon.ico'), Buffer.concat([header, ...entries.map((e) => e.data)]));

// SVG favicon: nhúng PNG 64px của logo gốc (không vẽ lại hình logo bằng vector).
const b64 = readFileSync(resolve(PUB, 'favicon-64x64.png')).toString('base64');
writeFileSync(resolve(PUB, 'favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 64 64"><image width="64" height="64" href="data:image/png;base64,${b64}"/></svg>\n`);
rmSync(resolve(PUB, 'favicon-48x48.png'));
rmSync(resolve(PUB, 'favicon-64x64.png'));
console.log('favicon: 16, 32, ico(16/32/48), apple-touch 180, svg — từ', SRC);
