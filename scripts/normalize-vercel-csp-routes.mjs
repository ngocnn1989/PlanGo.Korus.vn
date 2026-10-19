import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cspHeader = 'content-security-policy';

// Allowlist origin đã được duyệt cho quảng cáo. Guard vẫn fail-closed: bất kỳ
// origin nào ngoài danh sách này, mọi wildcard, và 'unsafe-inline' trong
// script-src/style-src đều làm hỏng build. Mở rộng danh sách là một quyết định
// có chủ ý, không phải nới lỏng guard.
const GTM = 'https://www.googletagmanager.com';
const FB_SDK = 'https://connect.facebook.net';
const FB = 'https://www.facebook.com';
const GA = 'https://www.google-analytics.com';
const GA_ALT = 'https://analytics.google.com';
const GA_REGION = 'https://region1.google-analytics.com';
const DOUBLECLICK = 'https://googleads.g.doubleclick.net';
// Script param builder (CAPI) do mẫu Meta Pixel chèn thêm. Duyệt có chủ ý cho
// quảng cáo Meta, cùng với form-action/frame-src tới www.facebook.com để pixel
// gửi được sự kiện và đồng bộ định danh.
const CAPI = 'https://capi-automation.s3.us-east-2.amazonaws.com';

// Origin nào được phép ở directive nào. Directive không có mặt ở đây thì không
// được chứa bất kỳ origin bên ngoài nào.
const ORIGIN_POLICY = {
  'script-src': new Set([GTM, FB_SDK, CAPI]),
  'connect-src': new Set([GTM, GA, GA_ALT, GA_REGION, FB, FB_SDK, CAPI]),
  'img-src': new Set([GTM, GA, GA_REGION, FB, DOUBLECLICK]),
  'frame-src': new Set([GTM, FB]),
  'form-action': new Set([FB]),
};

const HASH = /^'sha256-[A-Za-z0-9+/]+={0,2}'$/;
const KEYWORD = new Set(["'self'", "'none'", 'data:']);

function directives(csp) {
  return csp.split(';').map((value) => value.trim()).filter(Boolean);
}

function assertNarrowCsp(csp, label) {
  assert.equal(typeof csp, 'string', `missing CSP on ${label}`);

  const seen = new Set();
  for (const directive of directives(csp)) {
    const [name, ...sources] = directive.split(/\s+/);
    assert.equal(seen.has(name), false, `${label}: duplicate directive ${name}`);
    seen.add(name);

    for (const source of sources) {
      assert.equal(source.includes('*'), false, `${label}: ${name} must not use a wildcard`);

      // 'unsafe-inline' chỉ được phép ở directive -attr dạng thuộc tính style,
      // đúng như cấu hình gốc; không bao giờ ở script-src hay style-src.
      if (source === "'unsafe-inline'") {
        assert.equal(name, 'style-src-attr', `${label}: ${name} must not use unsafe-inline`);
        continue;
      }
      assert.equal(source === "'unsafe-eval'", false, `${label}: ${name} must not use unsafe-eval`);

      if (/^(?:https?:)?\/\//i.test(source)) {
        const allowed = ORIGIN_POLICY[name];
        assert.ok(allowed, `${label}: ${name} must not contain an external origin`);
        assert.ok(allowed.has(source), `${label}: ${source} is not an approved origin for ${name}`);
        continue;
      }

      assert.ok(KEYWORD.has(source) || HASH.test(source), `${label}: ${name} has unexpected source ${source}`);
    }
  }

  // script-src phải tồn tại, chứa 'self' và ít nhất một hash: đây là thứ ngăn
  // inline script tùy tiện chạy được.
  const scriptSrc = directives(csp).find((value) => value.toLowerCase().startsWith('script-src '));
  assert.ok(scriptSrc, `${label}: missing script-src`);
  const scriptSources = scriptSrc.split(/\s+/).slice(1);
  assert.ok(scriptSources.includes("'self'"), `${label}: script-src must include self`);
  assert.ok(scriptSources.some((source) => HASH.test(source)), `${label}: script-src must include a SHA-256 hash`);

  const scriptAttr = directives(csp).filter((value) => value.toLowerCase().startsWith('script-src-attr '));
  assert.ok(
    scriptAttr.length === 0 || (scriptAttr.length === 1 && scriptAttr[0] === "script-src-attr 'none'"),
    `${label}: script attributes must remain absent or denied`,
  );
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Với `trailingSlash: 'always'`, Vercel phục vụ mọi trang ở dạng có dấu gạch
 * chéo cuối. Astro chỉ phát header CSP cho biến thể không có dấu gạch chéo, nên
 * trang thật sẽ ship KHÔNG có CSP. Hàm này nhân bản header cho biến thể có dấu
 * gạch chéo của MỌI route mang CSP, thay vì hardcode một route như trước.
 */
export function normalizeVercelCspRoutes(config) {
  assert.ok(config && typeof config === 'object' && !Array.isArray(config), 'malformed config');
  assert.ok(Array.isArray(config.routes), 'malformed config routes');
  const original = cloneJson(config);

  const existing = new Set(config.routes.map((route) => route?.src).filter((src) => typeof src === 'string'));
  const routes = [];
  let added = 0;

  for (const route of config.routes) {
    routes.push(route);
    const src = route?.src;
    if (typeof src !== 'string') continue;
    const csp = route.headers && !Array.isArray(route.headers) ? route.headers[cspHeader] : undefined;
    if (typeof csp !== 'string') continue;

    assertNarrowCsp(csp, src);

    // Chỉ nhân bản route trang tĩnh dạng "/xxx" (không regex, không sẵn dấu
    // gạch chéo cuối, chưa có cặp tương ứng). Route gốc "/" không cần.
    if (!/^\/[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*$/.test(src)) continue;
    const trailing = `${src}/`;
    if (existing.has(trailing)) continue;

    routes.push({ ...route, src: trailing, headers: { ...route.headers } });
    existing.add(trailing);
    added += 1;
  }

  const normalized = { ...config, routes };
  assert.deepEqual(config, original, 'input config must not be mutated');
  assert.equal(
    normalized.routes.filter((route) => !route.__inserted).length >= original.routes.length,
    true,
    'no original route may be dropped',
  );
  // Gỡ các route vừa chèn ra thì phải thu lại đúng danh sách gốc.
  const withoutInserted = [];
  const insertedSrc = new Set();
  for (const route of routes) {
    if (typeof route?.src === 'string' && route.src.endsWith('/') && route.src !== '/'
      && !original.routes.some((item) => item?.src === route.src) && !insertedSrc.has(route.src)) {
      insertedSrc.add(route.src);
      continue;
    }
    withoutInserted.push(route);
  }
  assert.deepEqual(withoutInserted, original.routes, 'normalization must be purely additive');
  assert.equal(insertedSrc.size, added, 'inserted route accounting mismatch');

  return normalized;
}

export async function normalizeVercelCspConfig(configPath) {
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const normalized = normalizeVercelCspRoutes(config);
  await writeFile(configPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
}

async function synthetic() {
  const root = await mkdtemp(join(tmpdir(), 'normalize-vercel-csp-routes-'));
  const configPath = join(root, 'config.json');
  const narrow = "default-src 'self'; connect-src 'self' https://www.googletagmanager.com https://www.google-analytics.com;"
    + " script-src 'self' https://www.googletagmanager.com https://connect.facebook.net 'sha256-dGVzdA==';"
    + " img-src 'self' data: https://www.facebook.com; style-src 'self' 'sha256-dGVzdA=='; style-src-attr 'unsafe-inline'";
  const config = {
    version: 3,
    routes: [
      { src: '/', headers: { [cspHeader]: narrow } },
      { src: '/terms', headers: { [cspHeader]: narrow, 'x-route': 'canonical' } },
      { handle: 'filesystem' },
    ],
  };
  await writeFile(configPath, `${JSON.stringify(config)}\n`, 'utf8');
  await normalizeVercelCspConfig(configPath);
  const normalized = JSON.parse(await readFile(configPath, 'utf8'));

  // Nhân bản đúng một route "/terms" -> "/terms/", giữ nguyên header.
  assert.equal(normalized.routes.length, config.routes.length + 1);
  assert.equal(normalized.routes[2].src, '/terms/');
  assert.deepEqual(normalized.routes[2].headers, config.routes[1].headers);
  assert.equal(normalized.routes[1].headers[cspHeader], normalized.routes[2].headers[cspHeader]);
  // Route "/" không được nhân bản.
  assert.equal(normalized.routes.filter((route) => route.src === '//').length, 0);
  // Idempotent: chạy lại không thêm gì nữa.
  await normalizeVercelCspConfig(configPath);
  assert.deepEqual(JSON.parse(await readFile(configPath, 'utf8')), normalized);

  const withCsp = (csp) => ({ routes: [{ src: '/terms', headers: { [cspHeader]: csp } }] });
  // Negative: origin lạ, wildcard, unsafe-inline, unsafe-eval, thiếu hash,
  // origin đúng nhưng sai directive, và directive trùng lặp đều phải fail.
  assert.throws(() => normalizeVercelCspRoutes(withCsp(narrow.replace(GTM, 'https://external.invalid'))));
  assert.throws(() => normalizeVercelCspRoutes(withCsp(narrow.replace("script-src 'self'", "script-src 'self' *"))));
  assert.throws(() => normalizeVercelCspRoutes(withCsp(narrow.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'"))));
  assert.throws(() => normalizeVercelCspRoutes(withCsp(narrow.replace("script-src 'self'", "script-src 'self' 'unsafe-eval'"))));
  assert.throws(() => normalizeVercelCspRoutes(withCsp(narrow.replace(" 'sha256-dGVzdA=='", ''))));
  assert.throws(() => normalizeVercelCspRoutes(withCsp(`${narrow}; default-src 'self' ${GA}`)));
  assert.throws(() => normalizeVercelCspRoutes(withCsp(`${narrow}; script-src 'self'`)));
  assert.throws(() => normalizeVercelCspRoutes(withCsp(`${narrow}; script-src-attr 'unsafe-inline'`)));
  assert.throws(() => normalizeVercelCspRoutes({ routes: null }));

  await rm(root, { recursive: true, force: true });
  console.log('normalize-vercel-csp-routes: PASS synthetic clone validation');
}

if (process.argv[2] === '--synthetic-test') await synthetic();
else if (process.argv.length === 2) await normalizeVercelCspConfig(join(process.cwd(), '.vercel', 'output', 'config.json'));
else throw new Error('Usage: normalize-vercel-csp-routes.mjs [--synthetic-test]');
