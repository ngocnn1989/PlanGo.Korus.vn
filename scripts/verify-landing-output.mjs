// Run after build. Check the rendered consumer, not source-code substrings.
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'dist/client');
const profile = JSON.parse(await readFile(resolve(root, 'src/config/profiles/landing-robot.json'), 'utf8'));
const productSource = await readFile(resolve(root, 'src/content/airobot-product.ts'), 'utf8');
const { airobotProduct } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(productSource)).toString('base64')}`);
const html = await readFile(resolve(output, 'index.html'), 'utf8');
const llms = await readFile(resolve(output, 'llms.txt'), 'utf8');
const decode = (text) => text.replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/&#(?:39|x27);/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const plain = (text) => decode(text.replace(/<[^>]+>/g, ' ')).replace(/\u2011/g, '-')
  .replace(/\s+/g, ' ').trim();
const visible = plain(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ''));
const nodes = [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
  .map((match) => JSON.parse(match[1]));
const node = (type) => {
  const found = nodes.filter((item) => item['@type'] === type);
  assert.equal(found.length, 1, `one ${type} entity`);
  return found[0];
};
const meta = (key) => {
  const tag = [...html.matchAll(/<meta\b[^>]*>/g)].map(([value]) => value)
    .find((value) => value.includes(`name="${key}"`) || value.includes(`property="${key}"`));
  assert.ok(tag, `${key} exists`);
  return decode(/content="([^"]*)"/.exec(tag)?.[1] ?? '');
};

const headings = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)];
assert.equal(headings.length, 1, 'one main heading');
assert.match(plain(headings[0][1]), /AiRobot.*robot hàn tự động/i, 'H1 identifies product and category');
assert.equal(decode(/<title>(.*?)<\/title>/.exec(html)[1]), profile.page_copy.home.title);
assert.equal(meta('description'), profile.page_copy.home.description);
assert.match(meta('description'), /AiRobot/);
assert.equal(/<link\b[^>]*rel="canonical"[^>]*href="([^"]+)"/.exec(html)[1], `${profile.canonical_origin}/`);
assert.equal(meta('og:url'), `${profile.canonical_origin}/`);
assert.equal(meta('og:title'), profile.page_copy.home.title);
assert.equal(meta('twitter:title'), profile.page_copy.home.title);
assert.equal(meta('og:locale'), 'vi_VN');
assert.equal(/<meta\b[^>]*name="robots"[^>]*content="[^"]*noindex/.test(html), false, 'production homepage is indexable');
const image = new URL(meta('og:image'));
assert.equal(image.origin, profile.canonical_origin);
assert.equal(meta('twitter:image'), image.href);
assert.match(meta('og:image:alt'), /AiRobot/);
await access(resolve(output, `.${decodeURIComponent(image.pathname)}`));

const product = node('Product');
const organization = node('Organization');
const page = node('WebPage');
assert.equal(product.name, airobotProduct.name);
assert.equal(product.manufacturer['@id'], organization['@id']);
assert.equal(page.mainEntity['@id'], product['@id']);
assert.equal(page.publisher['@id'], organization['@id']);
assert.equal(product['@id'], `${profile.canonical_origin}/#airobot`);
for (const key of ['offers', 'review', 'aggregateRating', 'sku', 'mpn']) {
  assert.equal(key in product, false, `no unverified ${key}`);
}
assert.ok(product.description.includes(airobotProduct.referenceNote));
assert.deepEqual(product.additionalProperty, airobotProduct.specifications.map(({ label, value }) => ({
  '@type': 'PropertyValue', name: label, value,
})));
for (const { label, value } of airobotProduct.specifications) {
  assert.ok(visible.includes(plain(label)) && visible.includes(plain(value)), `visible reference: ${label}`);
  assert.ok(llms.includes(`- ${label}: ${value}`), `llms reference: ${label}`);
}
for (const { h3, body } of airobotProduct.features) {
  assert.ok(visible.includes(plain(h3)) && visible.includes(plain(body)), `visible feature: ${h3}`);
  assert.ok(llms.includes(body), `llms feature: ${h3}`);
}
assert.ok(visible.includes(plain(airobotProduct.referenceNote)));
assert.ok(llms.includes(airobotProduct.referenceNote));
// Khối "Cấu hình tham chiếu" không còn liên kết công bố sản phẩm hiển thị
// (quyết định owner 2026-09-11). Nguồn vẫn được nêu trong llms.txt cho crawler.
assert.ok(llms.includes(airobotProduct.source));
const hotspots = [...html.matchAll(/<a\b[^>]*data-hotspot="(\d+)"[^>]*>/g)];
assert.equal(hotspots.length, 6, 'six system components, including the scan camera');
for (const [index, component] of airobotProduct.components.entries()) {
  assert.ok(hotspots[index][0].includes(`href="#cum-${index + 1}"`), 'hotspot links to its legend');
  assert.ok(html.includes(`id="cum-${index + 1}"`), 'legend target exists');
  assert.ok(visible.includes(component.label) && llms.includes(component.label), 'component labels agree');
}
for (const route of ['index.html', 'privacy/index.html', 'terms/index.html', '404.html', '500.html']) {
  const pageHtml = await readFile(resolve(output, route), 'utf8');
  const footer = /<footer\b[^>]*data-site-footer[^>]*>([\s\S]*?)<\/footer>/.exec(pageHtml)?.[1];
  assert.ok(footer, `shared footer on ${route}`);
  assert.equal([...footer.matchAll(/data-footer-column=/g)].length, 3, `three footer columns on ${route}`);
  assert.match(footer, /id="(?:base-)?open-cookie-settings"/, 'cookie settings control is retained');
  assert.ok(footer.includes('href="/privacy"') || footer.includes('aria-current="page"'));
  assert.ok(footer.includes('href="/terms"') || footer.includes('aria-current="page"'));
}
for (const item of node('FAQPage').mainEntity) {
  assert.ok(visible.includes(plain(item.name)));
  assert.ok(visible.includes(plain(item.acceptedAnswer.text)), 'FAQ schema matches visible answer');
}
assert.equal(JSON.stringify(nodes).includes('\u2011'), false, 'machine-readable brand keeps ASCII hyphen');
const robots = await readFile(resolve(output, 'robots.txt'), 'utf8');
assert.ok(robots.includes(`Sitemap: ${profile.canonical_origin}/sitemap.xml`));
assert.ok(robots.includes('Disallow: /api/'));
assert.equal(/Disallow:\s*\/$/m.test(robots), false);
// Sitemap một cấp phẳng: một file /sitemap.xml, không còn cặp index + 0.
const sitemap = await readFile(resolve(output, 'sitemap.xml'), 'utf8');
assert.ok(sitemap.includes(`<loc>${profile.canonical_origin}/</loc>`));
assert.equal(/<loc>[^<]*(?:\/api\/|\/llms\.txt|\/thank-you|vercel\.app)/.test(sitemap), false);
// Local Vite style allowance must never leak into the production CSP.
const config = JSON.parse(await readFile(resolve(root, '.vercel/output/config.json'), 'utf8'));
const policies = [];
const collectPolicies = (value) => {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (key.toLowerCase() === 'content-security-policy' && typeof child === 'string') policies.push(child);
    else collectPolicies(child);
  }
};
collectPolicies(config);
assert.ok(policies.length > 0, 'production CSP headers exist');
for (const policy of policies) {
  for (const directive of policy.split(';').map((part) => part.trim())) {
    if (/^(?:style-src|style-src-elem)\s/.test(directive)) {
      assert.equal(directive.includes("'unsafe-inline'"), false, 'dev style allowance absent from production');
    }
  }
}
for (const name of ['phone-has-letters', 'phone-too-short', 'phone-too-long']) {
  // Some CI builds deliberately omit the lead endpoint; validate when form is emitted.
  if (html.includes('lead-form-wrapper')) assert.match(html, new RegExp(`data-msg-${name}="[^"]+"`));
}
const thankYou = await readFile(resolve(output, 'thank-you/index.html'), 'utf8');
assert.equal([...thankYou.matchAll(/<h1\b/g)].length, 1, 'thank-you has one heading');
assert.match(thankYou, /name="robots"[^>]*content="noindex,nofollow"/, 'thank-you stays noindex');
assert.equal(thankYou.includes('data-cta="header"'), false, 'no repeat-request CTA on confirmation page');
assert.equal(thankYou.includes('back-to-top-btn'), false, 'no competing floating controls on thank-you');
assert.ok(html.includes('data-cta="header"') && html.includes('back-to-top-btn'), 'homepage controls unchanged');
assert.ok(thankYou.includes('data-thank-you-actions'), 'contact actions present');
assert.ok(thankYou.includes('href="/#he-thong"'), 'return-to-system link retained');
assert.equal(/<title>[^<]*\u2011/.test(thankYou), false, 'thank-you title uses machine-safe brand');
console.log(`verify-landing-output: PASS (headings; metadata/image; entity links; ${product.additionalProperty.length} shared facts; features; 6 diagram components; 3-column footer on 5 pages; FAQ parity; ASCII brand; robots/sitemap; no invented offers/reviews; production CSP; form messages; thank-you noindex/actions; homepage controls)`);
