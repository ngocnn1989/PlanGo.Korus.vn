// Chụp các trang design-src/*.html thành PNG đúng kích thước bằng Chrome headless.
// node design-src/render.mjs [name ...]  → src/assets/plango/<name>.png
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../src/assets/plango');
const CHROME = process.env.CHROME
  || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);

// Chụp ở mật độ 2x (ảnh ra gấp đôi kích thước khai báo) để nét trên màn hình Retina/2K.
const SCALE = Number(process.env.RENDER_SCALE || 2);

export const ASSETS = {
  dashboard: [1600, 1000],
  'step-chat': [960, 720],
  'step-options': [960, 720],
  'step-confirm': [960, 720],
  'problem-files': [960, 720],
  'data-safety': [960, 720],
  'before-after': [1200, 760],
  og: [1200, 630],
};

mkdirSync(OUT, { recursive: true });
const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(ASSETS);
for (const name of names) {
  const [w, h] = ASSETS[name];
  const out = join(OUT, `${name}.png`);
  execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=' + SCALE,
    '--allow-file-access-from-files', '--virtual-time-budget=2000',
    `--window-size=${w},${h}`, `--screenshot=${out}`, pathToFileURL(join(HERE, `${name}.html`)).href,
  ], { stdio: 'ignore' });
  console.log(`${name}: ${w * SCALE}x${h * SCALE} (${SCALE}x) → ${out}`);
}
