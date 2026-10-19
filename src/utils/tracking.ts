import { canInitializeTracking, type ConsentProfile } from './consent';

const RECEIPT_DEDUPE_KEY_PREFIX = 'vnj-tracking-dedupe:v1:';

function readTrackingProfile(): ConsentProfile | null {
  if (typeof document === 'undefined') return null;

  try {
    const configurationNode = document.getElementById('tracking-consent-configuration');
    const configuration = configurationNode?.textContent ? JSON.parse(configurationNode.textContent) : null;
    if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration)) return null;
    const profile = (configuration as Record<string, unknown>).profile;
    return profile && typeof profile === 'object' && !Array.isArray(profile) ? profile as ConsentProfile : null;
  } catch {
    return null;
  }
}

export function generateEventId() {
  return 'evt_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 11);
}

function normalizeReceiptId(receiptId: unknown): string | undefined {
  if (typeof receiptId !== 'string') return undefined;
  return receiptId.trim().length > 0 ? receiptId : undefined;
}

function getReceiptDedupeKey(profileId: string, receiptId: string): string {
  return `${RECEIPT_DEDUPE_KEY_PREFIX}${encodeURIComponent(profileId)}:${encodeURIComponent(receiptId)}`;
}

function hasEmittedReceipt(profileId: string, receiptId: string): boolean {
  try {
    return window.sessionStorage.getItem(getReceiptDedupeKey(profileId, receiptId)) === '1';
  } catch {
    return false;
  }
}

function rememberEmittedReceipt(profileId: string, receiptId: string): void {
  try {
    window.sessionStorage.setItem(getReceiptDedupeKey(profileId, receiptId), '1');
  } catch {
    // Storage can be unavailable; tracking remains consent-gated and best-effort.
  }
}

export function trackConversion(eventName: string, payload: Record<string, unknown> = {}, receiptId?: string): string | undefined {
  const profile = readTrackingProfile();
  const profileId = typeof profile?.id === 'string' ? profile.id : undefined;
  if (typeof window === 'undefined' || !profile || !profileId || !canInitializeTracking(profile)) return undefined;
  const normalizedReceiptId = normalizeReceiptId(receiptId);
  if (normalizedReceiptId && hasEmittedReceipt(profileId, normalizedReceiptId)) return undefined;
  // event_id KHÔNG được là receiptId thô. Receipt hiện có dạng
  // "google-sheets-row:9", tức là nó nói cho mọi người mở trang — và mọi tag
  // bên thứ ba trong GTM — biết lead lưu ở đâu và đây là lead thứ mấy. Đối thủ
  // đọc được sản lượng lead chỉ bằng cách điền form.
  // Receipt vẫn được dùng để chống bắn trùng, nhưng chỉ ở sessionStorage của
  // chính khách, không rời khỏi trình duyệt.
  const eventId = generateEventId();
  const dataLayer = (window as typeof window & { dataLayer?: { push?: (event: Record<string, unknown>) => void } }).dataLayer;
  if (typeof dataLayer?.push !== 'function') return undefined;
  try {
    dataLayer.push({ ...payload, event: eventName, event_id: eventId });
  } catch {
    return undefined;
  }
  if (normalizedReceiptId) rememberEmittedReceipt(profileId, normalizedReceiptId);
  return eventId;
}

// docs/novabot_landing.md §21 — "Form bắt đầu": ghi nhận khi khách tương tác
// thật với form, KHÔNG phải khi trang tải hay khi form lọt vào khung nhìn.
// Đúng một lần cho mỗi lượt tải trang.
//
// Cờ ở cấp module là nguồn chính. Ngoài ra còn soi lên window vì LeadForm và
// LeadModal là hai khối script Astro riêng: nếu bộ đóng gói tách chúng thành
// hai bản sao module thì cờ cấp module sẽ có hai bản, và sự kiện sẽ bắn hai
// lần. Cờ trên window là bản duy nhất cho cả trang.
const FORM_START_WINDOW_FLAG = '__vnjFormStartEmitted';

let formStartEmitted = false;

type FormStartScope = typeof globalThis & { [FORM_START_WINDOW_FLAG]?: boolean };

export function trackFormStart(): string | undefined {
  if (formStartEmitted) return undefined;
  formStartEmitted = true;

  if (typeof window === 'undefined') return undefined;
  const scope = window as unknown as FormStartScope;
  if (scope[FORM_START_WINDOW_FLAG] === true) return undefined;
  scope[FORM_START_WINDOW_FLAG] = true;

  // Không kèm dữ liệu nào. §21 chỉ cho phép nhóm ứng dụng, vị trí CTA và
  // nguồn chiến dịch; không trường nào trong số đó đã xác định được tại thời
  // điểm khách vừa chạm vào ô đầu tiên, nên payload để rỗng.
  // trackConversion đã tự chặn khi chưa có đồng ý hoặc chưa có sink, và bọc
  // push trong try/catch nên không ném lỗi.
  return trackConversion('form_start');
}
