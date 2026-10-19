import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolveRuntimeLeadActivation } from '../src/config/runtime-lead-activation.mjs';

const profile = Object.freeze({ canonical_origin: 'https://example.invalid', lead: { enabled: false } });
const endpoint = 'https://script.google.com/macros/s/Abcdefgh1234_-56/exec';

function resolution(env) {
  return resolveRuntimeLeadActivation({ profile, env });
}

function enabled(env) {
  const value = resolution(env);
  assert.equal(value.ok, true);
  assert.equal(value.enabled, true);
  return value;
}

assert.deepEqual(resolution({}), { ok: true, enabled: false, code: 'lead_disabled' });
const fallback = enabled({ LEAD_PROVIDER: 'google_sheets', GOOGLE_SHEET_WEBHOOK_URL: endpoint });
assert.deepEqual(fallback.allowedOrigins, ['https://example.invalid']);
assert.equal(fallback.canonicalOrigin, 'https://example.invalid');
assert.equal(fallback.webhookUrl, endpoint);
assert.equal(fallback.webhookSecret, '');
assert.deepEqual(enabled({ LEAD_PROVIDER: 'google_sheets', GOOGLE_SHEET_WEBHOOK_URL: endpoint, LEAD_ALLOWED_ORIGINS: 'https://one.invalid,https://two.invalid' }).allowedOrigins, ['https://one.invalid', 'https://two.invalid']);
assert.equal(enabled({ LEAD_PROVIDER: 'google_sheets', GOOGLE_SHEET_WEBHOOK_URL: endpoint, UNSELECTED_PROVIDER_URL: 'https://ignored.invalid' }).enabled, true);

for (const env of [
  { LEAD_PROVIDER: 'google_sheets' },
  { GOOGLE_SHEET_WEBHOOK_URL: endpoint },
  { LEAD_PROVIDER: 'unknown', GOOGLE_SHEET_WEBHOOK_URL: endpoint },
  { LEAD_PROVIDER: 'google_sheets', GOOGLE_SHEET_WEBHOOK_URL: 'http://script.google.com/macros/s/Abcdefgh1234_-56/exec' },
  { LEAD_PROVIDER: 'google_sheets', GOOGLE_SHEET_WEBHOOK_URL: `${endpoint}?x=1` },
  { LEAD_PROVIDER: 'google_sheets', GOOGLE_SHEET_WEBHOOK_URL: endpoint, LEAD_ALLOWED_ORIGINS: 'http://example.invalid' },
  { LEAD_PROVIDER: 'google_sheets', GOOGLE_SHEET_WEBHOOK_URL: endpoint, WEBHOOK_SECRET: 'bad value' },
]) assert.equal(resolution(env).ok, false);
assert.equal(resolution({ LEAD_PROVIDER: 'unknown', GOOGLE_SHEET_WEBHOOK_URL: endpoint }).code, 'lead_provider_unsupported');

const [dispatch, api, modal, base, landing, index, middleware, leadRequest] = await Promise.all([
  readFile(fileURLToPath(new URL('../src/utils/lead-dispatch/index.ts', import.meta.url)), 'utf8'),
  readFile(fileURLToPath(new URL('../src/pages/api/leads.ts', import.meta.url)), 'utf8'),
  readFile(fileURLToPath(new URL('../src/components/global/LeadModal.astro', import.meta.url)), 'utf8'),
  readFile(fileURLToPath(new URL('../src/layouts/BaseLayout.astro', import.meta.url)), 'utf8'),
  readFile(fileURLToPath(new URL('../src/layouts/LandingLayout.astro', import.meta.url)), 'utf8'),
  readFile(fileURLToPath(new URL('../src/pages/index.astro', import.meta.url)), 'utf8'),
  readFile(fileURLToPath(new URL('../src/middleware.ts', import.meta.url)), 'utf8'),
  readFile(fileURLToPath(new URL('../src/utils/lead-request.ts', import.meta.url)), 'utf8'),
]);

for (const consumer of [base, landing, index, modal, middleware, leadRequest, dispatch, api]) {
  assert.match(consumer, /resolveRuntimeLeadActivation/);
  assert.doesNotMatch(consumer, /env:\s*import\.meta\.env|env:\s*\{\s*\.\.\.\s*import\.meta\.env/);
  for (const key of ['LEAD_PROVIDER', 'GOOGLE_SHEET_WEBHOOK_URL', 'WEBHOOK_SECRET', 'LEAD_ALLOWED_ORIGINS']) {
    assert.match(consumer, new RegExp(`${key}:\\s*import\\.meta\\.env\\.${key}`));
  }
}
for (const consumer of [base, landing, index, modal]) assert.match(consumer, /leadResolution\.enabled/);
assert.match(dispatch, /fetchImplementation = fetch/);
assert.match(dispatch, /method: 'POST'/);
assert.match(dispatch, /application\/x-www-form-urlencoded;charset=UTF-8/);
assert.match(dispatch, /idempotency_key/);
assert.match(dispatch, /setTimeout\(\(\) => controller\.abort\(\), 5000\)/);
assert.match(dispatch, /redirect: 'follow'/);
assert.match(dispatch, /credentials: 'omit'/);
assert.match(dispatch, /length > ACK_BYTES/);
assert.match(api, /lead_provider_rejected/);
assert.match(api, /resolveRuntimeLeadActivation/);
// Cấu hình không hợp lệ phải fail-closed bằng 503 kèm đúng mã lỗi. Assertion
// tách thành hai phần sau khi WP8.6 thêm logging vào giữa nhánh này.
assert.match(api, /if \(!activation\.ok\) \{/);
assert.match(api, /return response\(503, \{ success: false, code: activation\.code \}\);/);
// Log không được chứa nội dung lead: chỉ mã kết quả và correlation id.
assert.doesNotMatch(api, /logLead\([^)]*outcome\.payload/);
assert.doesNotMatch(api, /console\.log\((?!JSON\.stringify\(record\))/);
assert.doesNotMatch(api, /persist|reread/);
assert.match(modal, /fetch\('\/api\/leads'/);
assert.doesNotMatch(modal, /script\.google\.com|result\.error/);

const isolatedDispatch = stripTypeScriptTypes(
  dispatch.replace(/^import[^;]+;\r?\n/gm, '').replace('export function createGoogleSheetsLeadDispatchPort', 'function createGoogleSheetsLeadDispatchPort').replace(/\nclass UnavailableLeadDispatchPort[\s\S]*$/, '\nexport { createGoogleSheetsLeadDispatchPort };\n'),
  { mode: 'strip' },
);
const { createGoogleSheetsLeadDispatchPort } = await import(`data:text/javascript,${encodeURIComponent(isolatedDispatch)}`);
const payload = { name: 'A', phone: '+1', email: '', message: '' };
const key = 'abcdefghijklmnop';
let call;
const port = createGoogleSheetsLeadDispatchPort({
  endpoint,
  secret: 'offline-secret',
  fetchImplementation: async (input, init) => {
    call = { input, init };
    return new Response('{"success":true,"receiptId":"offline:receipt"}', { status: 200 });
  },
});
assert.deepEqual(await port.dispatch(payload, key), { kind: 'accepted', receiptId: 'offline:receipt' });
assert.equal(call.input, endpoint);
assert.equal(call.init.method, 'POST');
assert.equal(call.init.headers.get('Content-Type'), 'application/x-www-form-urlencoded;charset=UTF-8');
assert.equal(call.init.headers.get('X-Korus-Webhook-Secret'), 'offline-secret');
// Secret phải nằm TRONG BODY, không chỉ ở header: Google Apps Script không
// cho doPost(e) đọc header tùy chỉnh, nên secret gửi qua header là vô dụng với
// provider này. Assertion này khoá lại hành vi đó.
assert.equal(call.init.body.toString(), 'name=A&phone=%2B1&email=&message=&idempotency_key=abcdefghijklmnop&webhook_secret=offline-secret');
// Secret vẫn phải được gửi kèm ở header cho provider có khả năng đọc header.
assert.equal(call.init.headers.get('X-Korus-Webhook-Secret'), 'offline-secret');
assert.equal(call.init.redirect, 'follow');
assert.equal(call.init.credentials, 'omit');
assert.equal(call.init.signal instanceof AbortSignal, true);
const rowPort = createGoogleSheetsLeadDispatchPort({ endpoint, fetchImplementation: async () => new Response('{"result":"success","row":7}', { status: 200 }) });
assert.deepEqual(await rowPort.dispatch(payload, key), { kind: 'accepted', receiptId: 'google-sheets-row:7' });
for (const response of [
  new Response('', { status: 200 }),
  new Response('<html/>', { status: 200 }),
  new Response('{"success":true,"success":true,"receiptId":"offline:receipt"}', { status: 200 }),
  new Response('{"success":true,"receiptId":"offline:receipt","extra":true}', { status: 200 }),
  new Response('{"success":true,"receiptId":1}', { status: 200 }),
  new Response('{"success":true,"receiptId":"offline:receipt"}', { status: 503 }),
]) {
  const rejected = createGoogleSheetsLeadDispatchPort({ endpoint, fetchImplementation: async () => response });
  assert.deepEqual(await rejected.dispatch(payload, key), { kind: 'rejected' });
}
const unavailable = createGoogleSheetsLeadDispatchPort({ endpoint, fetchImplementation: async () => { throw new Error('offline'); } });
assert.deepEqual(await unavailable.dispatch(payload, key), { kind: 'unavailable' });

const isolatedApi = stripTypeScriptTypes(
  api.replace(/^import[^;]+;\r?\n/gm, '').replace('export function createLeadPostHandler', 'function createLeadPostHandler').replace(/\nexport const POST[\s\S]*$/, '\nexport { createLeadPostHandler };\n'),
  { mode: 'strip' },
);
const { createLeadPostHandler } = await import(`data:text/javascript,${encodeURIComponent(isolatedApi)}`);
for (const code of ['lead_configuration_invalid', 'lead_provider_unsupported']) {
  let guardCalls = 0;
  const handler = createLeadPostHandler({
    resolveActivation: () => ({ ok: false, enabled: false, code }),
    guard: async () => { guardCalls += 1; throw new Error('guard must not run'); },
    getDispatchPort: () => ({ dispatch: async () => { throw new Error('dispatch must not run'); } }),
  });
  const response = await handler({ request: new Request('https://example.invalid/api/leads', { method: 'POST' }), clientAddress: undefined });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { success: false, code });
  assert.equal(guardCalls, 0);
}

// Traverse the real handler: reservation state and receipts must remain tied
// to provider acceptance after the discriminated-union type correction.
for (const vector of [
  { result: { kind: 'accepted', receiptId: 'offline:accepted' }, status: 200, body: { success: true, receiptId: 'offline:accepted' } },
  { result: { kind: 'rejected' }, status: 502, body: { success: false, code: 'lead_provider_rejected' } },
  { result: { kind: 'unavailable' }, status: 503, body: { success: false, code: 'lead_unavailable' } },
  { result: null, status: 503, body: { success: false, code: 'lead_unavailable' } },
]) {
  let commits = 0;
  let releases = 0;
  let dispatchCalls = 0;
  const handler = createLeadPostHandler({
    resolveActivation: () => fallback,
    guard: async () => ({
      kind: 'accepted', payload, idempotencyKey: key,
      reservation: { commit: () => { commits++; }, release: () => { releases++; } },
    }),
    getDispatchPort: () => ({ dispatch: async (actualPayload, actualKey) => {
      dispatchCalls++;
      assert.deepEqual(actualPayload, payload);
      assert.equal(actualKey, key);
      if (!vector.result) throw new Error('offline-provider-failure');
      return vector.result;
    } }),
  });
  const result = await handler({ request: new Request('https://example.invalid/api/leads', { method: 'POST' }), clientAddress: undefined });
  assert.equal(result.status, vector.status);
  assert.deepEqual(await result.json(), vector.body);
  assert.equal(dispatchCalls, 1);
  assert.equal(commits, vector.status === 200 ? 1 : 0);
  assert.equal(releases, vector.status === 200 ? 0 : 1);
}
const disabledHandler = createLeadPostHandler({
  resolveActivation: () => resolution({}),
  guard: async () => { throw new Error('disabled guard must not run'); },
  getDispatchPort: () => { throw new Error('disabled dispatch must not run'); },
});
const disabledResponse = await disabledHandler({ request: new Request('https://example.invalid/api/leads', { method: 'POST' }), clientAddress: undefined });
assert.equal(disabledResponse.status, 503);
assert.deepEqual(await disabledResponse.json(), { success: false, code: 'lead_unavailable' });
assert.ok(Object.isFrozen(fallback) && Object.isFrozen(fallback.allowedOrigins));

console.log('runtime-lead-activation: PASS offline resolver/dispatch vectors; real API handler invalid/disabled/accepted/rejected/unavailable/exception, payload/receipt/reservation integrity');
