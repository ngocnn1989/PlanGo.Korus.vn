// Guard hồi quy cho đồ thị liên kết nội bộ (WP2.6).
//
// Bối cảnh: kiểm toán 2026-09-07 phát hiện trang chủ không có một liên kết nào
// về chính nó (logo là href="#"), liên kết rời trang duy nhất trỏ tới /terms
// đang 404, và /landing nằm trong sitemap mà không có liên kết nội bộ nào trỏ
// tới. Script này chạy trên HTML ĐÃ BUILD nên nó kiểm tra thứ thực sự được
// phục vụ, không phải ý định trong source.
//
// Chạy sau `astro build`. Fail-closed: bất kỳ vi phạm nào cũng thoát khác 0.

import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const clientDir = fileURLToPath(new URL('../dist/client', import.meta.url));

async function htmlFiles(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await htmlFiles(full));
    else if (entry.name.endsWith('.html')) found.push(full);
  }
  return found;
}

/** "dist/client/terms/index.html" -> "/terms/" ; "dist/client/index.html" -> "/" */
function routeOf(file) {
  const rel = relative(clientDir, file).split(sep).join('/');
  if (rel === 'index.html') return '/';
  if (rel.endsWith('/index.html')) return `/${rel.slice(0, -'/index.html'.length)}/`;
  return `/${rel.replace(/\.html$/, '')}`;
}

const files = await htmlFiles(clientDir);
assert.ok(files.length > 0, 'no built HTML found - run astro build first');

const routes = new Set(files.map(routeOf));
// Chấp nhận cả hai dạng có và không có dấu gạch chéo cuối là cùng một đích.
const routeExists = (path) => routes.has(path) || routes.has(`${path}/`) || routes.has(path.replace(/\/$/, ''));

const failures = [];
const inboundFromOtherPage = new Set();

for (const file of files) {
  const route = routeOf(file);
  const html = await readFile(file, 'utf8');
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);

  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));

  let selfLinks = 0;

  for (const href of hrefs) {
    // Bỏ qua liên kết ngoài, mailto, tel, và tài nguyên tĩnh.
    if (/^(?:https?:)?\/\/|^mailto:|^tel:/i.test(href)) continue;
    if (/\.(?:css|js|svg|png|jpe?g|webp|ico|xml|txt|woff2?)$/i.test(href)) continue;

    // 1. Anchor rỗng: liên kết chết, không đi đâu cả.
    if (href === '#') {
      failures.push(`${route}: có href="#" (liên kết chết)`);
      continue;
    }

    // 2. Anchor cùng trang: ID phải tồn tại trên chính trang đó.
    if (href.startsWith('#')) {
      const id = href.slice(1);
      if (!ids.has(id)) failures.push(`${route}: anchor ${href} trỏ tới ID không có trên trang này`);
      continue;
    }

    if (!href.startsWith('/')) continue;

    const [path, fragment] = href.split('#');
    const target = path === '' ? route : path;

    // 3. Route đích phải tồn tại.
    if (!routeExists(target)) {
      failures.push(`${route}: liên kết tới ${href} nhưng route ${target} không tồn tại`);
      continue;
    }

    // 4. Anchor liên trang: ID phải tồn tại trên trang đích.
    if (fragment) {
      const targetFile = files.find((candidate) => {
        const candidateRoute = routeOf(candidate);
        return candidateRoute === target || candidateRoute === `${target}/` || candidateRoute === target.replace(/\/$/, '');
      });
      if (targetFile) {
        const targetHtml = await readFile(targetFile, 'utf8');
        const targetIds = new Set([...targetHtml.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
        if (!targetIds.has(fragment)) {
          failures.push(`${route}: liên kết ${href} trỏ tới ID không có trên trang đích`);
        }
      }
    }

    const normalizedTarget = target.endsWith('/') ? target : `${target}/`;
    const normalizedRoute = route.endsWith('/') ? route : `${route}/`;
    if (normalizedTarget === normalizedRoute) {
      // "/#products" đứng trên chính trang "/" là anchor cuộn trong trang,
      // hoàn toàn hợp lệ và có thể xuất hiện nhiều lần. Chỉ liên kết tự trỏ
      // KHÔNG có fragment mới là dư thừa - đó là dấu hiệu cùng một mảng
      // navigation bị render ở nhiều vị trí.
      if (!fragment) selfLinks += 1;
    } else {
      inboundFromOtherPage.add(normalizedTarget);
    }
  }

  // 5. Một trang không được tự trỏ về chính nó quá một lần. Trước khi sửa,
  // trang chủ tự trỏ nhiều lần vì cùng một mảng nav được render ở 4 vị trí.
  if (selfLinks > 1) {
    failures.push(`${route}: tự trỏ về chính nó ${selfLinks} lần (tối đa 1)`);
  }
}

// 6. Mọi URL trong sitemap phải có ít nhất một liên kết nội bộ trỏ tới, trừ
// trang gốc. Trang mồ côi trong sitemap là lỗi SEO.
let sitemap = '';
try {
  sitemap = await readFile(join(clientDir, 'sitemap.xml'), 'utf8');
} catch {
  // Không có sitemap thì bỏ qua kiểm tra này.
}
if (sitemap) {
  for (const match of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const path = new URL(match[1]).pathname;
    if (path === '/') continue;
    if (!inboundFromOtherPage.has(path.endsWith('/') ? path : `${path}/`)) {
      failures.push(`sitemap: ${path} không có liên kết nội bộ nào trỏ tới (trang mồ côi)`);
    }
  }
}

if (failures.length > 0) {
  console.error('verify-internal-links: FAIL');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`verify-internal-links: PASS (${files.length} trang, ${routes.size} route, 0 liên kết gãy)`);
