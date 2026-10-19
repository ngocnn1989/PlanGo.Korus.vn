const PUBLIC_ENV_KEYS = new Set(['PUBLIC_ENABLE_TRACKING', 'PUBLIC_GTM_ID', 'PUBLIC_TRACKING_DELAY_MS']);
const GTM_ID = /^GTM-[A-Z0-9]{4,32}$/;
const DELAY = /^(?:0|[1-9][0-9]*)$/;

const fallbackConsentUi = Object.freeze({
  title: 'Measurement choices',
  description: 'Choose whether measurement may start.',
  accept_label: 'Allow',
  reject_label: 'Reject',
  revoke_label: 'Revoke',
  grant_ttl_ms: 86400000,
});

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizePublicValue(value) {
  return typeof value === 'string' ? value.trim() : value === undefined ? undefined : null;
}

function completeConsentUi(value) {
  return plainObject(value)
    && typeof value.title === 'string' && value.title.length > 0
    && typeof value.description === 'string' && value.description.length > 0
    && typeof value.accept_label === 'string' && value.accept_label.length > 0
    && typeof value.reject_label === 'string' && value.reject_label.length > 0
    && typeof value.revoke_label === 'string' && value.revoke_label.length > 0
    && Number.isSafeInteger(value.grant_ttl_ms) && value.grant_ttl_ms > 0;
}

function invalid() {
  return Object.freeze({ ok: false, code: 'tracking_configuration_invalid' });
}

/**
 * Xem chú thích cùng lý do ở runtime-lead-activation.mjs: không khai báo kiểu
 * thì `profile` bị coi là thuộc tính lạ và mọi nơi gọi đều báo ts(2353).
 *
 * @param {{ profile?: unknown, env?: Record<string, string | undefined> }} [options]
 * @returns {{ ok: boolean, enabled?: boolean, code?: string, gtmId?: string, delayMs?: number, profile?: any, consentUi?: any }}
 */
export function resolveRuntimeTrackingActivation({ profile, env = {} } = {}) {
  if (!plainObject(profile) || !plainObject(env)) return invalid();
  if (Object.keys(env).some((key) => !PUBLIC_ENV_KEYS.has(key))) return invalid();
  const flag = normalizePublicValue(env.PUBLIC_ENABLE_TRACKING);
  const gtmId = normalizePublicValue(env.PUBLIC_GTM_ID);
  const delay = normalizePublicValue(env.PUBLIC_TRACKING_DELAY_MS);
  if (flag === null || gtmId === null || delay === null) return invalid();
  const normalizedFlag = flag === undefined || flag === '' ? undefined : flag.toLowerCase();
  if (normalizedFlag !== undefined && normalizedFlag !== 'true' && normalizedFlag !== 'false') return invalid();
  if (gtmId !== undefined && gtmId !== '' && !GTM_ID.test(gtmId)) return invalid();
  if (delay !== undefined && (!DELAY.test(delay) || Number(delay) > 60000)) return invalid();
  const requested = normalizedFlag === 'true' || (gtmId !== undefined && gtmId !== '');
  if (normalizedFlag === 'true' && (gtmId === undefined || gtmId === '')) return invalid();
  if (normalizedFlag === 'false' || !requested) {
    return Object.freeze({ ok: true, code: 'tracking_disabled', enabled: false, gtmId: '', delayMs: 0, profile });
  }
  const consent = plainObject(profile.consent) && profile.consent.enabled === true
    && typeof profile.consent.vendor === 'string' && profile.consent.vendor.trim().length > 0
    && completeConsentUi(profile.consent.ui)
    ? profile.consent
    : { enabled: true, vendor: 'builtin_consent', ui: fallbackConsentUi };
  const effectiveProfile = {
    id: profile.id,
    tracking: { enabled: true, vendor: 'google_tag_manager' },
    consent,
  };
  return Object.freeze({ ok: true, code: 'tracking_enabled', enabled: true, gtmId, delayMs: delay === undefined ? 0 : Number(delay), profile: effectiveProfile });
}

export function serializeRuntimeTrackingActivation(resolution) {
  if (!plainObject(resolution) || resolution.ok !== true || resolution.enabled !== true) return '';
  return JSON.stringify({ profile: resolution.profile, gtmId: resolution.gtmId, delayMs: resolution.delayMs }).replace(/</g, '\\u003c');
}
