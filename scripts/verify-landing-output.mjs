// Run after build. Check the rendered consumer (dist HTML), not source-code substrings.
// PlanGo: lợi ích b1–b4, giá hiển thị khớp AggregateOffer, FAQ/llms khớp trang.
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'dist/client');
const profileId = process.env.SITE_PROFILE || 'landing-plango';
const profile = JSON.parse(await readFile(resolve(root, `src/config/profiles/${profileId}.json`), 'utf8'));
const loadTs = async (file) => import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(await readFile(resolve(root, file), 'utf8'))).toString('base64')}`);
const { plangoProduct } = await loadTs('src/content/plango-product.ts');
const { plangoPlans } = await loadTs('src/content/plango-pricing.ts');
const html = await readFile(resolve(output, 'index.html'), 'utf8');
const llms = await readFile(resolve(output, 'llms.txt'), 'utf8');
const decode = (text) => text.replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/&#(?:39|x27);/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const plain = (text) => decode(text.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
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

// Metadata
const headings = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)];
assert.equal(headings.length, 1, 'one main heading');
assert.match(plain(headings[0][1]), /kế hoạch chuyền may/i, 'H1 names the job');
assert.equal(decode(/<title>(.*?)<\/title>/.exec(html)[1]), profile.page_copy.home.title);
assert.equal(meta('description'), profile.page_copy.home.description);
assert.match(meta('description'), /PlanGo/);
assert.equal(/<link\b[^>]*rel="canonical"[^>]*href="([^"]+)"/.exec(html)[1], `${profile.canonical_origin}/`);
assert.equal(meta('og:url'), `${profile.canonical_origin}/`);
assert.equal(meta('og:title'), profile.page_copy.home.title);
assert.equal(meta('og:locale'), 'vi_VN');
const hasNoindex = /<meta\b[^>]*name="robots"[^>]*content="[^"]*noindex/.test(html);
assert.equal(hasNoindex, !profile.indexable, 'robots meta follows profile.indexable');
const image = new URL(meta('og:image'));
assert.equal(image.origin, profile.canonical_origin);
assert.equal(meta('twitter:image'), image.href);
assert.match(meta('og:image:alt'), /PlanGo/);
await access(resolve(output, `.${decodeURIComponent(image.pathname)}`));

// Lợi ích b1–b4 (owner 19/10/2026) hiển thị và có trong llms.txt.
for (const { title, body } of plangoProduct.benefits) {
  assert.ok(visible.includes(title) && visible.includes(body), `visible benefit: ${title}`);
  assert.ok(llms.includes(title), `llms benefit: ${title}`);
}
for (const criterion of plangoProduct.scoringCriteria) assert.ok(visible.includes(criterion), `criterion: ${criterion}`);
for (const { text } of plangoProduct.claims) assert.ok(llms.includes(text), `llms claim: ${text}`);

// Entities: Organization (KORUS) + SoftwareApplication + FAQPage + WebPage.
const app = node('SoftwareApplication');
const organization = node('Organization');
const page = node('WebPage');
assert.equal(app.name, plangoProduct.name);
assert.equal(app.publisher['@id'], organization['@id']);
assert.equal(organization.name, plangoProduct.vendor);
assert.equal(page.mainEntity['@id'], app['@id']);
assert.equal(page.publisher['@id'], organization['@id']);
for (const key of ['review', 'aggregateRating']) assert.equal(key in app, false, `no unverified ${key}`);

// Giá: AggregateOffer khớp đúng mức "Từ … triệu/tháng" đang hiển thị (owner 19/10: 3/5/9).
const priced = plangoPlans.filter((plan) => plan.monthlyFrom);
assert.equal(app.offers['@type'], 'AggregateOffer');
assert.equal(app.offers.priceCurrency, 'VND');
assert.equal(Number(app.offers.lowPrice), Math.min(...priced.map((p) => p.monthlyFrom)) * 1e6);
assert.equal('highPrice' in app.offers, false, 'no invented price ceiling');
assert.equal(app.offers.priceSpecification.unitText, 'tháng');
for (const plan of plangoPlans) {
  assert.ok(visible.includes(plan.name), `plan card: ${plan.name}`);
  if (plan.monthlyFrom) {
    assert.ok(visible.includes(`${plan.monthlyFrom.toLocaleString('vi-VN')} triệu`) && visible.includes('/tháng'), `visible monthly price: ${plan.name}`);
    assert.ok(html.includes(`data-ung-dung="${plan.id}"`), `pricing CTA prefills plan: ${plan.id}`);
  }
}
assert.ok(html.includes('data-estimator'), 'price estimator rendered');

// Footer trên mọi trang
for (const route of ['index.html', 'privacy/index.html', 'terms/index.html', '404.html', '500.html']) {
  const pageHtml = await readFile(resolve(output, route), 'utf8');
  const footer = /<footer\b[^>]*data-site-footer[^>]*>([\s\S]*?)<\/footer>/.exec(pageHtml)?.[1];
  assert.ok(footer, `shared footer on ${route}`);
  assert.equal([...footer.matchAll(/data-footer-column=/g)].length, 3, `three footer columns on ${route}`);
  assert.match(footer, /id="(?:base-)?open-cookie-settings"/, 'cookie settings control is retained');
  assert.ok(footer.includes('href="/privacy"') || footer.includes('aria-current="page"'));
  assert.ok(footer.includes('href="/terms"') || footer.includes('aria-current="page"'));
  assert.equal(/VN-J|AiRobot|robot hàn/i.test(plain(pageHtml)), false, `no framework-origin brand on ${route}`);
}
for (const item of node('FAQPage').mainEntity) {
  assert.ok(visible.includes(plain(item.name)));
  assert.ok(visible.includes(plain(item.acceptedAnswer.text)), 'FAQ schema matches visible answer');
}
const robots = await readFile(resolve(output, 'robots.txt'), 'utf8');
assert.ok(robots.includes('Disallow: /api/') || robots.includes('Disallow: /'), 'robots.txt rendered');
const sitemap = await readFile(resolve(output, 'sitemap.xml'), 'utf8');
// indexable:false (trước G7) → sitemap rỗng có chủ đích.
assert.equal(sitemap.includes(`<loc>${profile.canonical_origin}/</loc>`), profile.indexable === true, 'sitemap follows profile.indexable');
assert.equal(/<loc>[^<]*(?:\/api\/|\/llms\.txt|\/thank-you|vercel\.app)/.test(sitemap), false);

// Production CSP không được mang 'unsafe-inline' cho style.
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
  if (html.includes('lead-form-wrapper')) assert.match(html, new RegExp(`data-msg-${name}="[^"]+"`));
}
const thankYou = await readFile(resolve(output, 'thank-you/index.html'), 'utf8');
assert.equal([...thankYou.matchAll(/<h1\b/g)].length, 1, 'thank-you has one heading');
assert.match(thankYou, /name="robots"[^>]*content="noindex,nofollow"/, 'thank-you stays noindex');
assert.equal(thankYou.includes('data-cta="header"'), false, 'no repeat-request CTA on confirmation page');
assert.ok(html.includes('data-cta="header"') && html.includes('back-to-top-btn'), 'homepage controls present');
assert.ok(thankYou.includes('data-thank-you-actions'), 'contact actions present');
console.log(`verify-landing-output: PASS (H1/metadata/OG; ${plangoProduct.benefits.length} benefits; 6 criteria; ${plangoProduct.claims.length} llms claims; SoftwareApplication+AggregateOffer = visible monthly prices; ${plangoPlans.length} plans + estimator; FAQ parity; footer on 5 pages without framework-origin brand; sitemap; production CSP; thank-you noindex)`);
