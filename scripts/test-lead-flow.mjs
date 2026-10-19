// WP8.5 - Integration test cho luồng lead chính.
//
// Kho này trước đây có 0 test. Hai defect làm hỏng dữ liệu đã được sửa ở
// WP5.1 và WP5.2 nằm trên cùng một đường đi, và cả hai đều không bị bất kỳ
// cổng kiểm chứng nào bắt được. Test này khoá lại hành vi đúng.
//
// Chạy offline: fetch được inject, không có mạng, không đụng provider thật.
//
// Không import trực tiếp lead-dispatch/index.ts được vì nó kéo theo
// site-profile.mjs -> `virtual:site-profile`, module chỉ tồn tại trong build
// Vite. Dùng cùng kỹ thuật tách module mà verify-runtime-lead-activation.mjs
// đang dùng: bỏ dòng import, strip type, nạp qua data: URL. Nhờ vậy test chạy
// được bằng node thuần trong CI mà không cần dựng cả Astro.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';

const dispatchSource = await readFile(
  fileURLToPath(new URL('../src/utils/lead-dispatch/index.ts', import.meta.url)),
  'utf8',
);
const isolated = stripTypeScriptTypes(
  dispatchSource
    .replace(/^import[^;]+;\r?\n/gm, '')
    .replace('export function createGoogleSheetsLeadDispatchPort', 'function createGoogleSheetsLeadDispatchPort')
    .replace(/\nclass UnavailableLeadDispatchPort[\s\S]*$/, '\nexport { createGoogleSheetsLeadDispatchPort };\n'),
  { mode: 'strip' },
);
const { createGoogleSheetsLeadDispatchPort } =
  await import(`data:text/javascript,${encodeURIComponent(isolated)}`);

// Bước chuẩn hoá payload nằm ở lead-request.ts và cũng kéo theo
// site-profile.mjs. Tách bằng cùng kỹ thuật, và bỏ export guardLeadRequest ở
// cuối file vì nó gọi resolver runtime; createLeadRequestGuard nhận dependency
// tiêm vào nên chạy được offline.
const requestSource = await readFile(
  fileURLToPath(new URL('../src/utils/lead-request.ts', import.meta.url)),
  'utf8',
);
const isolatedRequest = stripTypeScriptTypes(
  requestSource
    .replace(/^import[^;]+;\r?\n/gm, '')
    .replace(/\nexport const guardLeadRequest[\s\S]*$/, '\n'),
  { mode: 'strip' },
);
const { createLeadRequestGuard } =
  await import(`data:text/javascript,${encodeURIComponent(isolatedRequest)}`);

const ENDPOINT = 'https://script.google.invalid/macros/s/TEST/exec';
const PAYLOAD = {
  email: 'a@b.test',
  message: 'xin chào',
  name: 'Nguyễn A',
  phone: '+84900000000',
  consent_at: '2026-09-07T00:00:00.000Z',
};

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function recordingFetch(responses) {
  const calls = [];
  let index = 0;
  const impl = async (input, init) => {
    calls.push({ input, init });
    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return typeof next === 'function' ? next() : next();
  };
  return { calls, impl };
}

// --- Bộ khớp nối end-to-end: trình duyệt -> guard -> dây gửi đi -------------
const ORIGIN = 'https://landing.test';

function freshGuard() {
  return createLeadRequestGuard({
    allowedOrigins: new Set([ORIGIN]),
    idempotencyKeys: new Map(),
    now: () => Date.now(),
    rateLimits: new Map(),
  });
}

// Dựng đúng request mà trình duyệt gửi: multipart/form-data kèm consent và
// honeypot rỗng. Mỗi lần gọi dùng guard mới để rate limit không lẫn giữa test.
async function guardLead(fields, idempotencyKey) {
  const form = new FormData();
  form.append('data_consent', 'on');
  form.append('bot_trap', '');
  for (const [key, value] of Object.entries(fields)) form.append(key, value);

  const encoded = new Response(form);
  const bytes = await encoded.arrayBuffer();
  const request = new Request(`${ORIGIN}/api/leads`, {
    method: 'POST',
    body: bytes,
    headers: {
      'content-type': encoded.headers.get('content-type'),
      'content-length': String(bytes.byteLength),
      origin: ORIGIN,
      'idempotency-key': idempotencyKey,
    },
  });

  return freshGuard()(request, '203.0.113.10');
}

// Chạy trọn đường: chuẩn hoá rồi gửi đi, trả về body thật đã lên dây.
async function wireFor(fields, idempotencyKey) {
  const outcome = await guardLead(fields, idempotencyKey);
  assert.equal(outcome.kind, 'accepted', `guard phải chấp nhận lead, nhận được ${outcome.code ?? outcome.kind}`);

  const net = recordingFetch([() => jsonResponse({ result: 'success', row: 1 })]);
  const port = createGoogleSheetsLeadDispatchPort({ endpoint: ENDPOINT, fetchImplementation: net.impl });
  const dispatched = await port.dispatch(outcome.payload, idempotencyKey);

  assert.equal(dispatched.kind, 'accepted', 'lead phải tới được nơi tiếp nhận');
  assert.equal(
    net.calls[0].init.headers.get('Content-Type'),
    'application/x-www-form-urlencoded;charset=UTF-8',
    'khuôn dây không được đổi',
  );

  return {
    payload: outcome.payload,
    params: new URLSearchParams(net.calls[0].init.body.toString()),
    raw: net.calls[0].init.body.toString(),
  };
}

let failures = 0;
async function check(name, run) {
  try {
    await run();
    console.log(`  PASS  ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  FAIL  ${name}`);
    console.error(`        ${error.message}`);
  }
}

console.log('test-lead-flow:');

// --- WP5.1 -----------------------------------------------------------------
// Apps Script trả {"ok":true} không kèm định danh. Receipt phải suy ra từ
// idempotencyKey nên hai lần gửi khác nhau cho ra hai receipt khác nhau.
// Trước khi sửa, cả hai đều là hằng 'google-sheets-ack:ok', khiến dedupe key
// của tracking gộp mọi lead trong một phiên thành một và chỉ lead đầu tiên
// được ghi nhận chuyển đổi.
await check('receipt từ {ok:true} là duy nhất theo idempotencyKey', async () => {
  const first = recordingFetch([() => jsonResponse({ ok: true })]);
  const second = recordingFetch([() => jsonResponse({ ok: true })]);

  const portA = createGoogleSheetsLeadDispatchPort({ endpoint: ENDPOINT, fetchImplementation: first.impl });
  const portB = createGoogleSheetsLeadDispatchPort({ endpoint: ENDPOINT, fetchImplementation: second.impl });

  const a = await portA.dispatch(PAYLOAD, 'idem-key-aaaaaaaaaaaa');
  const b = await portB.dispatch(PAYLOAD, 'idem-key-bbbbbbbbbbbb');

  assert.equal(a.kind, 'accepted');
  assert.equal(b.kind, 'accepted');
  assert.notEqual(a.receiptId, b.receiptId, 'hai lead khác nhau không được dùng chung receipt');
  assert.match(a.receiptId, /idem-key-aaaaaaaaaaaa$/);
});

// Dạng ack tốt nhất: {result:'success', row:N} cho receipt gắn với dòng thật.
await check('receipt từ {result,row} gắn với số dòng thật', async () => {
  const net = recordingFetch([() => jsonResponse({ result: 'success', row: 42 })]);
  const port = createGoogleSheetsLeadDispatchPort({ endpoint: ENDPOINT, fetchImplementation: net.impl });
  const outcome = await port.dispatch(PAYLOAD, 'idem-key-cccccccccccc');
  assert.equal(outcome.kind, 'accepted');
  assert.equal(outcome.receiptId, 'google-sheets-row:42');
});

// --- WP5.2 -----------------------------------------------------------------
// Điều kiện fallback cũ là `!receiptId`, nên một lần ghi ĐÃ THÀNH CÔNG nhưng
// trả ack lạ vẫn kích hoạt POST thứ hai và tạo dòng lead trùng. Apps Script
// luôn trả HTTP 200, kể cả khi lỗi, nên đây là kịch bản thật.
await check('ack lạ với HTTP 200 KHÔNG gửi lại (chống lead trùng)', async () => {
  const net = recordingFetch([() => jsonResponse({ ok: false, error: 'boom' })]);
  const port = createGoogleSheetsLeadDispatchPort({ endpoint: ENDPOINT, fetchImplementation: net.impl });
  const outcome = await port.dispatch(PAYLOAD, 'idem-key-dddddddddddd');

  assert.equal(net.calls.length, 1, `chỉ được gửi 1 request, thực tế ${net.calls.length}`);
  assert.equal(outcome.kind, 'rejected');
});

// Provider thực sự từ chối (non-2xx) thì fallback JSON mới được phép chạy.
await check('provider từ chối bằng non-2xx thì mới fallback sang JSON', async () => {
  const responses = [
    () => jsonResponse({ error: 'unsupported media type' }, { ok: false, status: 415 }),
    () => jsonResponse({ result: 'success', row: 7 }),
  ];
  const net = recordingFetch(responses);
  const port = createGoogleSheetsLeadDispatchPort({ endpoint: ENDPOINT, fetchImplementation: net.impl });
  const outcome = await port.dispatch(PAYLOAD, 'idem-key-eeeeeeeeeeee');

  assert.equal(net.calls.length, 2, 'phải thử lại đúng một lần bằng JSON');
  assert.equal(net.calls[1].init.headers.get('Content-Type'), 'application/json');
  assert.equal(outcome.kind, 'accepted');
  assert.equal(outcome.receiptId, 'google-sheets-row:7');
});

// --- Secret ----------------------------------------------------------------
// Apps Script không đọc được header tùy chỉnh nên secret phải nằm trong body.
await check('secret nằm trong body, không chỉ ở header', async () => {
  const net = recordingFetch([() => jsonResponse({ result: 'success', row: 1 })]);
  const port = createGoogleSheetsLeadDispatchPort({
    endpoint: ENDPOINT,
    secret: 'test-secret-value',
    fetchImplementation: net.impl,
  });
  await port.dispatch(PAYLOAD, 'idem-key-ffffffffffff');

  const body = net.calls[0].init.body.toString();
  assert.match(body, /webhook_secret=test-secret-value/, 'secret phải có trong body');
  assert.equal(net.calls[0].init.headers.get('X-Korus-Webhook-Secret'), 'test-secret-value');
});

await check('không có secret thì không gửi trường webhook_secret', async () => {
  const net = recordingFetch([() => jsonResponse({ result: 'success', row: 1 })]);
  const port = createGoogleSheetsLeadDispatchPort({ endpoint: ENDPOINT, fetchImplementation: net.impl });
  await port.dispatch(PAYLOAD, 'idem-key-gggggggggggg');
  assert.doesNotMatch(net.calls[0].init.body.toString(), /webhook_secret/);
});

// --- Fail-closed -----------------------------------------------------------
await check('lỗi mạng trả về unavailable, không phải rejected', async () => {
  const impl = async () => { throw new Error('network down'); };
  const port = createGoogleSheetsLeadDispatchPort({ endpoint: ENDPOINT, fetchImplementation: impl });
  const outcome = await port.dispatch(PAYLOAD, 'idem-key-hhhhhhhhhhhh');
  assert.equal(outcome.kind, 'unavailable', 'phân biệt unavailable với rejected là có chủ đích');
});

await check('ack có key JSON trùng lặp bị từ chối', async () => {
  const raw = '{"result":"success","row":1,"row":2}';
  const net = recordingFetch([() => new Response(raw, { status: 200, headers: { 'Content-Type': 'application/json' } })]);
  const port = createGoogleSheetsLeadDispatchPort({ endpoint: ENDPOINT, fetchImplementation: net.impl });
  const outcome = await port.dispatch(PAYLOAD, 'idem-key-iiiiiiiiiiii');
  assert.equal(outcome.kind, 'rejected');
});

// --- company + application -------------------------------------------------
// Defect: form đã gửi hai trường này nhưng bước chuẩn hoá chỉ trích
// name/phone/email/message, nên chúng bị âm thầm loại bỏ và không bao giờ tới
// nơi tiếp nhận. Bốn test dưới khoá lại cả đường đi lẫn cách xử lý giá trị xấu.
await check('company + application hợp lệ đi hết đường tới payload gửi đi', async () => {
  const { params } = await wireFor(
    {
      name: 'Nguyễn A',
      phone: '+84900000000',
      company: '  Công ty May Mẫu  ',
      application: 'tieu-chuan',
      message: 'cần hàn kết cấu lớn',
    },
    'idem-key-jjjjjjjjjjjj',
  );

  assert.equal(params.get('company'), 'Công ty May Mẫu', 'company phải có trên dây và đã cắt khoảng trắng');
  assert.equal(params.get('application'), 'tieu-chuan', 'application phải có trên dây');
});

await check('vắng company + application thì không có trường rỗng rác', async () => {
  const { params } = await wireFor(
    { name: 'Nguyễn B', phone: '+84900000001' },
    'idem-key-kkkkkkkkkkkk',
  );

  assert.equal(params.get('name'), 'Nguyễn B', 'lead vẫn phải đi bình thường');
  assert.equal(params.has('company'), false, 'không được gửi khoá company rỗng');
  assert.equal(params.has('application'), false, 'không được gửi khoá application rỗng');
});

await check('application giá trị lạ bị bỏ, lead vẫn thành công', async () => {
  const { params } = await wireFor(
    {
      name: 'Nguyễn C',
      phone: '+84900000002',
      company: 'Xưởng C',
      application: 'hacker',
    },
    'idem-key-llllllllllll',
  );

  assert.equal(params.has('application'), false, 'giá trị ngoài danh sách phải bị bỏ');
  assert.equal(params.get('company'), 'Xưởng C', 'trường còn lại không được ảnh hưởng');
});

await check('company quá dài bị cắt đúng giới hạn, lead vẫn thành công', async () => {
  const { payload, params } = await wireFor(
    {
      name: 'Nguyễn D',
      phone: '+84900000003',
      company: 'X'.repeat(300),
      application: 'undecided',
    },
    'idem-key-mmmmmmmmmmmm',
  );

  assert.equal(payload.company.length, 200, 'company phải bị cắt còn 200 ký tự');
  assert.equal(params.get('company').length, 200, 'giá trị lên dây cũng phải là bản đã cắt');
  assert.equal(params.get('application'), 'undecided', 'lead vẫn đi trọn vẹn');
});

if (failures > 0) {
  console.error(`test-lead-flow: FAIL (${failures} test không đạt)`);
  process.exit(1);
}
console.log('test-lead-flow: PASS (12 test luồng lead)');
