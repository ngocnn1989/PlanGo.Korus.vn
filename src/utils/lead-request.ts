import siteProfile from '../config/site-profile.mjs';
import { PROVINCE_CODES } from '../content/vn-provinces';
import { resolveRuntimeLeadActivation } from '../config/runtime-lead-activation.mjs';

const MAX_CONTENT_LENGTH_BYTES = 16 * 1024;
// Form thật gửi 8 trường: name, phone, province, company, application, message,
// email, bot_trap. Ô tick `data_consent` đã bị gỡ khỏi giao diện, nhưng một client
// cũ vẫn có thể gửi kèm nên phải tính là trường thứ 9. Ngưỡng 12 còn dư 3
// chỗ. Nếu form về sau thêm trường, đếm lại ở đây trước khi sửa, vì vượt
// ngưỡng là từ chối cả lead.
const MAX_FIELDS = 12;
const MAX_NAME_LENGTH = 120;
const MAX_PHONE_LENGTH = 40;
const MAX_EMAIL_LENGTH = 254;
const MAX_MESSAGE_LENGTH = 2000;
// Trường phân loại tuỳ chọn: giới hạn phòng thủ ở server rộng hơn maxlength
// của form (120) để một trình duyệt bỏ qua maxlength cũng không làm hỏng lead.
const MAX_COMPANY_LENGTH = 200;
const REQUEST_WINDOW_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 100;
// Ngưỡng cũ là 5. Khách gặp một lỗi bất kỳ rồi bấm "Thử gửi lại" đúng như
// trang mời là tiêu hết suất trong vài chục giây, và từ đó mọi lần gửi đều
// hỏng thật — lỗi tạm biến thành lỗi vĩnh viễn. Đã xảy ra trên production
// 10/09. 12 vẫn chặn được spam nhưng không phạt người dùng thật.
const MAX_REQUESTS_PER_WINDOW = 12;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[0-9+().\s-]+$/;
// CHÚ Ý: company KHÔNG nằm trong bảng này. Bảng này từ chối cả lead khi vượt
// độ dài. Với một trường phân loại tuỳ chọn thì mất lead là cái giá quá đắt,
// nên company được cắt bớt ở bước chuẩn hoá thay vì bị từ chối.
const FIELD_LENGTHS = new Map<string, number>([
  ['name', MAX_NAME_LENGTH],
  ['phone', MAX_PHONE_LENGTH],
  ['email', MAX_EMAIL_LENGTH],
  ['message', MAX_MESSAGE_LENGTH],
]);

// Gói quan tâm (trường `application`) khớp đúng applicationOptions trong src/content/landing-contact.ts.
// Giá trị ngoài danh sách bị bỏ đi (coi như chưa chọn) chứ không từ chối lead:
// một lead thật quan trọng hơn một trường phân loại.
const LEAD_APPLICATIONS = [
  'co-ban',
  'tieu-chuan',
  'nang-cao',
  'doanh-nghiep',
  'undecided',
] as const;

export type LeadApplication = (typeof LEAD_APPLICATIONS)[number];

const ALLOWED_APPLICATIONS: ReadonlySet<string> = new Set<string>(LEAD_APPLICATIONS);

type LeadRequestCode =
  | 'bot_rejected'
  | 'duplicate_request'
  | 'idempotency_required'
  | 'invalid_request'
  | 'lead_unavailable'
  | 'method_not_allowed'
  | 'payload_too_large'
  | 'rate_limited';

export type NormalizedLeadPayload = {
  email: string;
  message: string;
  name: string;
  phone: string;
  // Bằng chứng đồng ý xử lý dữ liệu cá nhân, lưu cùng lead. Từ 2026-09-10 ô
  // tick đã được gỡ, nên đây là dấu thời gian GỬI FORM — chính là thời điểm
  // khách thực hiện hành vi đồng ý được nêu ở dòng thông báo dưới nút gửi.
  // Cột này KHÔNG được mất: nơi tiếp nhận (Google Sheet) đang ghi nó.
  consent_at: string;
  // Hai trường phân loại tuỳ chọn. Vắng mặt là hợp lệ; khi vắng mặt thì khoá
  // bị bỏ hẳn khỏi payload để không tạo cột rỗng ở nơi tiếp nhận.
  company?: string;
  application?: LeadApplication;
  /** Mã tỉnh/thành (vn-provinces.ts). Tuỳ chọn; mã lạ bị bỏ, lead vẫn nhận. */
  province?: string;
};

export type LeadRequestRejected = {
  code: LeadRequestCode;
  kind: 'rejected';
  status: number;
};

export type LeadRequestAccepted = {
  idempotencyKey: string;
  kind: 'accepted';
  payload: NormalizedLeadPayload;
  reservation: LeadRequestReservation;
};

export type LeadRequestResult = LeadRequestAccepted | LeadRequestRejected;

export type LeadRequestReservation = {
  commit(): void;
  release(): void;
};

export type LeadRequestGuard = (
  request: Request,
  clientAddress: string | undefined,
) => Promise<LeadRequestResult>;

export type LeadRequestGuardDependencies = {
  allowedOrigins: Set<string> | null;
  idempotencyKeys: Map<string, number>;
  now: () => number;
  rateLimits: Map<string, RateLimitEntry>;
};

export type RateLimitEntry = {
  count: number;
  expiresAt: number;
};

const idempotencyKeys = new Map<string, number>();
const rateLimits = new Map<string, RateLimitEntry>();

function result(status: number, code: LeadRequestCode): LeadRequestRejected {
  return { code, kind: 'rejected', status };
}

function normalizeOrigin(value: string): string | null {
  try {
    const origin = new URL(value.trim());

    if (
      (origin.protocol !== 'http:' && origin.protocol !== 'https:') ||
      origin.username ||
      origin.password ||
      origin.pathname !== '/' ||
      origin.search ||
      origin.hash
    ) {
      return null;
    }

    return origin.origin;
  } catch {
    return null;
  }
}

function allowedOrigins(): Set<string> | null {
  const resolution = resolveRuntimeLeadActivation({ profile: siteProfile, env: {
    LEAD_PROVIDER: import.meta.env.LEAD_PROVIDER,
    GOOGLE_SHEET_WEBHOOK_URL: import.meta.env.GOOGLE_SHEET_WEBHOOK_URL,
    WEBHOOK_SECRET: import.meta.env.WEBHOOK_SECRET,
    LEAD_ALLOWED_ORIGINS: import.meta.env.LEAD_ALLOWED_ORIGINS,
  } });
  return resolution.ok && resolution.enabled ? new Set(resolution.allowedOrigins) : null;
}

function cleanupCaches(
  now: number,
  idempotencyCache: Map<string, number>,
  rateLimitCache: Map<string, RateLimitEntry>,
): void {
  for (const [key, expiresAt] of idempotencyCache) {
    if (expiresAt <= now) {
      idempotencyCache.delete(key);
    }
  }

  for (const [key, entry] of rateLimitCache) {
    if (entry.expiresAt <= now) {
      rateLimitCache.delete(key);
    }
  }
}

function evictOldest<T>(cache: Map<string, T>): void {
  while (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next();

    if (oldest.done || oldest.value === undefined) {
      return;
    }

    cache.delete(oldest.value);
  }
}

function isRateLimited(rateKey: string, now: number, rateLimitCache: Map<string, RateLimitEntry>): boolean {
  const existing = rateLimitCache.get(rateKey);

  if (existing) {
    if (existing.count >= MAX_REQUESTS_PER_WINDOW) {
      return true;
    }

    existing.count += 1;
    return false;
  }

  evictOldest(rateLimitCache);
  rateLimitCache.set(rateKey, { count: 1, expiresAt: now + REQUEST_WINDOW_MS });
  return false;
}

function reserveRequest(key: string, now: number, idempotencyCache: Map<string, number>): boolean {
  if (idempotencyCache.has(key)) {
    return true;
  }

  evictOldest(idempotencyCache);
  idempotencyCache.set(key, now + REQUEST_WINDOW_MS);
  return false;
}

function isValidText(value: FormDataEntryValue | null, maximumLength: number): value is string {
  return typeof value === 'string' && value.length <= maximumLength;
}

function isValidOptionalText(value: FormDataEntryValue | null, maximumLength: number): value is string | null {
  return value === null || (typeof value === 'string' && value.length <= maximumLength);
}

// Cắt khoảng trắng thừa rồi giới hạn độ dài. Không từ chối lead khi quá dài -
// chỉ giữ lại phần đầu, đủ để nhận diện doanh nghiệp.
function normalizeCompany(value: FormDataEntryValue | null): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().slice(0, MAX_COMPANY_LENGTH).trim();
}

// Tỉnh/thành: chỉ nhận đúng 34 mã của vn-provinces.ts; khác thì bỏ khoá.
function normalizeProvince(value: FormDataEntryValue | null): string {
  if (typeof value !== 'string') return '';
  const candidate = value.trim();
  return PROVINCE_CODES.has(candidate) ? candidate : '';
}

// Chỉ chấp nhận đúng danh sách đóng. Mọi giá trị khác trả về chuỗi rỗng, và
// bước dựng payload sẽ bỏ hẳn khoá đó.
function normalizeApplication(value: FormDataEntryValue | null): LeadApplication | '' {
  if (typeof value !== 'string') {
    return '';
  }

  const candidate = value.trim();

  return ALLOWED_APPLICATIONS.has(candidate) ? (candidate as LeadApplication) : '';
}

function hasValidContact(phone: string, email: string): boolean {
  return (
    (phone.length > 0 && PHONE_PATTERN.test(phone)) ||
    (email.length > 0 && EMAIL_PATTERN.test(email))
  );
}

export function createLeadRequestGuard(dependencies: LeadRequestGuardDependencies): LeadRequestGuard {
  return async (request, clientAddress) => {
  if (request.method !== 'POST') {
    return result(405, 'method_not_allowed');
  }

  const contentType = request.headers.get('content-type');
  const contentLength = request.headers.get('content-length');

  if (!contentLength || !/^\d+$/.test(contentLength) || !Number.isSafeInteger(Number(contentLength))) {
    return result(413, 'payload_too_large');
  }

  if (Number(contentLength) > MAX_CONTENT_LENGTH_BYTES) {
    return result(413, 'payload_too_large');
  }

  if (contentType?.toLowerCase().split(';', 1)[0].trim() !== 'multipart/form-data') {
    return result(400, 'invalid_request');
  }

  let fields: Array<[string, FormDataEntryValue]>;
  let formData: FormData;

  try {
    formData = await request.formData();
    fields = Array.from(formData.entries());
  } catch {
    return result(400, 'invalid_request');
  }

  if (fields.length > MAX_FIELDS) {
    return result(400, 'invalid_request');
  }

  for (const [fieldName, fieldValue] of fields) {
    if (typeof fieldValue !== 'string') {
      return result(400, 'invalid_request');
    }

    const maximumLength = FIELD_LENGTHS.get(fieldName);

    if (maximumLength !== undefined && fieldValue.length > maximumLength) {
      return result(400, 'invalid_request');
    }
  }

  // Ô tick đồng ý đã được gỡ theo quyết định owner 2026-09-10: giao diện thay
  // bằng dòng thông báo tĩnh ngay dưới nút gửi, nên hành vi gửi form CHÍNH LÀ
  // hành vi đồng ý. Vì vậy `data_consent` không còn bắt buộc và không còn mã
  // lỗi riêng. Nếu một client cũ vẫn gửi kèm trường này thì chấp nhận im lặng
  // (tương thích ngược) — nó chỉ tính vào MAX_FIELDS.
  // Dấu thời gian đồng ý vẫn được ghi: xem `consent_at` ở bước dựng payload,
  // nay lấy theo thời điểm gửi form. Nghị định 13/2023/NĐ-CP Điều 13 yêu cầu
  // chứng minh được đã thông báo trước khi xử lý; dòng thông báo tĩnh cộng
  // dấu thời gian này là vết kiểm tra đó.

  const honeypotValues = formData.getAll('bot_trap');

  for (const honeypotValue of honeypotValues) {
    if (typeof honeypotValue !== 'string') {
      return result(400, 'invalid_request');
    }

    if (honeypotValue.trim().length > 0) {
      return result(400, 'bot_rejected');
    }
  }

  const name = formData.get('name');
  const phone = formData.get('phone');
  const email = formData.get('email');
  const message = formData.get('message');

  if (
    !isValidText(name, MAX_NAME_LENGTH) ||
    !isValidOptionalText(phone, MAX_PHONE_LENGTH) ||
    !isValidOptionalText(email, MAX_EMAIL_LENGTH) ||
    !isValidOptionalText(message, MAX_MESSAGE_LENGTH)
  ) {
    return result(400, 'invalid_request');
  }

  const normalizedName = name.trim();
  const normalizedPhone = typeof phone === 'string' ? phone.trim() : '';
  const normalizedEmail = typeof email === 'string' ? email.trim() : '';
  const normalizedMessage = typeof message === 'string' ? message.trim() : '';
  const normalizedCompany = normalizeCompany(formData.get('company'));
  const normalizedApplication = normalizeApplication(formData.get('application'));
  const normalizedProvince = normalizeProvince(formData.get('province'));

  if (!normalizedName || !hasValidContact(normalizedPhone, normalizedEmail)) {
    return result(400, 'invalid_request');
  }

  const origins = dependencies.allowedOrigins;
  const requestOrigin = request.headers.get('origin');

  if (!origins || !requestOrigin?.trim()) {
    return result(503, 'lead_unavailable');
  }

  const normalizedOrigin = normalizeOrigin(requestOrigin);

  if (!normalizedOrigin) {
    return result(400, 'invalid_request');
  }

  if (!origins.has(normalizedOrigin)) {
    return result(503, 'lead_unavailable');
  }

  const idempotencyKey = request.headers.get('idempotency-key');

  if (!idempotencyKey || !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    return result(400, 'idempotency_required');
  }

  const now = dependencies.now();
  // Chỉ giới hạn theo IP khi thật sự biết IP. Bản cũ gộp mọi khách không xác
  // định được địa chỉ vào chung khoá 'unavailable', nghĩa là cả website dùng
  // chung một hạn mức — vào giờ cao điểm quảng cáo là chặn nhầm hàng loạt
  // khách thật. Không có IP thì bỏ qua vòng này; origin, honeypot, chống trùng
  // và kiểm tra trường vẫn còn nguyên.
  const clientKey = clientAddress?.trim() || '';
  const rateKey = clientKey ? `${normalizedOrigin}:${clientKey}` : '';
  const requestKey = `${normalizedOrigin}:${idempotencyKey}`;

  cleanupCaches(now, dependencies.idempotencyKeys, dependencies.rateLimits);

  if (rateKey && isRateLimited(rateKey, now, dependencies.rateLimits)) {
    return result(429, 'rate_limited');
  }

  if (reserveRequest(requestKey, now, dependencies.idempotencyKeys)) {
    return result(409, 'duplicate_request');
  }

  let finalized = false;
  const reservation: LeadRequestReservation = {
    commit: () => {
      finalized = true;
    },
    release: () => {
      if (!finalized) {
        dependencies.idempotencyKeys.delete(requestKey);
      }
    },
  };

  return {
    idempotencyKey,
    kind: 'accepted',
    payload: {
      email: normalizedEmail,
      message: normalizedMessage,
      name: normalizedName,
      phone: normalizedPhone,
      consent_at: new Date().toISOString(),
      ...(normalizedCompany ? { company: normalizedCompany } : {}),
      ...(normalizedApplication ? { application: normalizedApplication } : {}),
      ...(normalizedProvince ? { province: normalizedProvince } : {}),
    },
    reservation,
  };
  };
}

export const guardLeadRequest: LeadRequestGuard = (request, clientAddress) =>
  createLeadRequestGuard({
    allowedOrigins: allowedOrigins(),
    idempotencyKeys,
    now: () => Date.now(),
    rateLimits,
  })(request, clientAddress);
