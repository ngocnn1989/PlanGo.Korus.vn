const CONSENT_VERSION = 1;
const CONSENT_KEY_PREFIX = 'vnj-consent:v1:';

type ConsentStatus = 'granted' | 'revoked';

export type ConsentState = { version: typeof CONSENT_VERSION; profileId: string; status: ConsentStatus; updatedAt: number; expiresAt?: number };
export type ConsentProfile = { id?: unknown; tracking?: { enabled?: unknown; vendor?: unknown }; consent?: { enabled?: unknown; vendor?: unknown; ui?: unknown } };

function isBrowser(): boolean { return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'; }
function isConfiguredVendor(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const normalized = value.trim();
  return normalized.length > 0 && !/^(?:not[ -]?configured|placeholder|x+)$/i.test(normalized);
}
function isValidProfileId(value: unknown): value is string { return typeof value === 'string' && /^[a-z0-9][a-z0-9-]*$/i.test(value); }
function isFiniteTimestamp(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value > 0; }
function getStorageKey(profileId: string): string { return `${CONSENT_KEY_PREFIX}${encodeURIComponent(profileId)}`; }

function parseConsentState(value: unknown, profileId: string): ConsentState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const state = value as Record<string, unknown>;
  if (state.version !== CONSENT_VERSION || state.profileId !== profileId || (state.status !== 'granted' && state.status !== 'revoked') || !isFiniteTimestamp(state.updatedAt)) return null;
  if (state.status === 'granted' && !isFiniteTimestamp(state.expiresAt)) return null;
  if (state.status === 'revoked' && state.expiresAt !== undefined) return null;
  return state.status === 'granted'
    ? { version: CONSENT_VERSION, profileId, status: 'granted', updatedAt: state.updatedAt, expiresAt: state.expiresAt as number }
    : { version: CONSENT_VERSION, profileId, status: 'revoked', updatedAt: state.updatedAt };
}

export function hasTrackingConsentConfiguration(profile: ConsentProfile): boolean {
  return isValidProfileId(profile.id) && profile.tracking?.enabled === true && profile.consent?.enabled === true && isConfiguredVendor(profile.tracking?.vendor) && isConfiguredVendor(profile.consent?.vendor);
}
export function readConsent(profileId: string): ConsentState | null {
  if (!isBrowser() || !isValidProfileId(profileId)) return null;
  try { const rawValue = window.localStorage.getItem(getStorageKey(profileId)); return rawValue === null ? null : parseConsentState(JSON.parse(rawValue), profileId); } catch { return null; }
}
// Mô hình thông báo + cho phép từ chối (opt-out), theo hướng Google khuyến nghị
// cho thị trường không bắt buộc opt-in trước.
//
// Bản cũ là opt-in cứng: chưa bấm "Đồng ý" thì GTM không nạp. Hệ quả là bên quản
// lý GTM không debug được tag, và số liệu luôn thiếu phần khách bỏ qua banner.
//
// Nay: chưa chọn gì → cho phép đo. Đã bấm "Từ chối" → chặn, và lựa chọn đó được
// giữ lại. Khách vẫn đổi ý được bất cứ lúc nào qua "Cài đặt cookie" ở footer.
export function hasValidConsent(profileId: string, now = Date.now()): boolean {
  const state = readConsent(profileId);
  if (state === null) return true;
  if (state.status === 'revoked') return false;
  return state.expiresAt !== undefined && state.expiresAt > now;
}
export function grantConsent(profileId: string, expiresAt: number): boolean {
  if (!isBrowser() || !isValidProfileId(profileId) || !isFiniteTimestamp(expiresAt) || expiresAt <= Date.now()) return false;
  const state: ConsentState = { version: CONSENT_VERSION, profileId, status: 'granted', updatedAt: Date.now(), expiresAt };
  try { window.localStorage.setItem(getStorageKey(profileId), JSON.stringify(state)); return true; } catch { return false; }
}
/**
 * Xoá các cookie đo lường đã đặt trước khi khách bấm Từ chối.
 *
 * Ngăn GTM nạp lại là chưa đủ: `_ga` và `_ga_<id>` vẫn nằm trong trình duyệt
 * và vẫn là định danh theo dõi. Từ chối mà dấu vết còn nguyên thì việc từ chối
 * không có hiệu lực thật.
 *
 * Chỉ xoá cookie đo lường đã biết tên, không đụng cookie khác. Phải xoá ở cả
 * host hiện tại lẫn domain cha vì GA đặt cookie ở `.domain`.
 */
function clearAnalyticsCookies(): void {
  if (typeof document === 'undefined') return;
  const names = document.cookie
    .split(';')
    .map((entry) => entry.split('=')[0]?.trim() ?? '')
    .filter((name) => name === '_ga' || name.startsWith('_ga_') || name === '_gid' || name.startsWith('_gac_') || name === '_fbp' || name === '_fbc');

  const host = window.location.hostname;
  const domains = [host, `.${host}`, `.${host.split('.').slice(-2).join('.')}`];

  for (const name of names) {
    for (const domain of domains) {
      document.cookie = `${name}=; Max-Age=0; path=/; domain=${domain}`;
    }
    document.cookie = `${name}=; Max-Age=0; path=/`;
  }
}

export function revokeConsent(profileId: string): boolean {
  if (!isBrowser() || !isValidProfileId(profileId)) return false;
  const state: ConsentState = { version: CONSENT_VERSION, profileId, status: 'revoked', updatedAt: Date.now() };
  try {
    window.localStorage.setItem(getStorageKey(profileId), JSON.stringify(state));
    clearAnalyticsCookies();
    return true;
  } catch { return false; }
}
export function canInitializeTracking(profile: ConsentProfile): boolean {
  return hasTrackingConsentConfiguration(profile) && typeof profile.id === 'string' && hasValidConsent(profile.id);
}
