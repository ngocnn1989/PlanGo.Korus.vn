import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const scriptDirectory = fileURLToPath(new URL('.', import.meta.url));
const seoHead = await readFile(join(scriptDirectory, '../src/components/seo/SeoHead.astro'), 'utf8');
// Breadcrumbs.astro đã được retire ở WP8.4: 0 importer trong toàn bộ src/.
const robotsRoute = await readFile(join(scriptDirectory, '../src/pages/robots.txt.ts'), 'utf8');

for (const source of [seoHead]) {
  assert.match(source, /replace\(\/</, 'JSON-LD escapes less-than');
  assert.match(source, /replace\(\/\\u2028/, 'JSON-LD escapes U+2028');
  assert.match(source, /replace\(\/\\u2029/, 'JSON-LD escapes U+2029');
}

assert.match(seoHead, /siteProfile\.canonical_origin/, 'canonical is profile-derived');
assert.match(seoHead, /siteProfile\.i18n\.enabled/, 'hreflang requires enabled locale support');
assert.equal(seoHead.includes('/images/og-default.jpg'), false, 'no missing OG default image');
assert.equal(seoHead.includes('VNJ-'), false, 'no generated SKU');
assert.equal(seoHead.includes('Math.random'), false, 'no generated Product data');
assert.match(seoHead, /hasAuthoritativeOffer/, 'Product JSON-LD requires authoritative fields');
assert.match(robotsRoute, /Disallow: \/api\//, 'robots disallows API');
assert.match(robotsRoute, /Disallow: \/_server\//, 'robots disallows server internals');
assert.match(robotsRoute, /siteProfile\.canonical_origin/, 'robots sitemap uses selected profile origin');
assert.equal(robotsRoute.includes('vn-j-robotics.com'), false, 'robots has no hardcoded origin');

console.log('verify-seo-truth: PASS (source oracles)');
