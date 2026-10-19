// Read the actual local HTML and CSP; never relax script execution to pass.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const url = new URL(process.argv[2] || 'http://127.0.0.1:4321/');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'local verification only');
const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
assert.equal(response.status, 200, 'local homepage responds');
const html = await response.text();
const policy = response.headers.get('content-security-policy');
assert.ok(policy, 'local CSP header exists');
const directives = new Map(policy.split(';').map((part) => {
  const [name, ...values] = part.trim().split(/\s+/);
  return [name, values];
}));
const allowed = directives.get('script-src-elem') || directives.get('script-src') || directives.get('default-src');
assert.ok(allowed, 'script execution has a policy');
assert.equal(allowed.includes("'unsafe-inline'"), false, 'arbitrary inline scripts remain blocked');
assert.equal(html.includes('window.__astro_dev_toolbar__'), false, 'no dev-toolbar inline bootstrap');
let inlineCount = 0;
for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
  const [, attributes, body] = match;
  if (/\bsrc\s*=/.test(attributes) || /\btype=["']application\/(?:ld\+)?json["']/.test(attributes)) continue;
  if (!body.trim()) continue;
  inlineCount++;
  const hash = `'sha256-${createHash('sha256').update(body).digest('base64')}'`;
  const nonce = /\bnonce=["']([^"']+)["']/.exec(attributes)?.[1];
  assert.ok(allowed.includes(hash) || (nonce && allowed.includes(`'nonce-${nonce}'`)), 'every executable inline script is explicitly authorized');
}
console.log(`verify-local-csp: PASS (HTTP 200; toolbar absent; script policy enforced; ${inlineCount} executable inline scripts checked)`);
