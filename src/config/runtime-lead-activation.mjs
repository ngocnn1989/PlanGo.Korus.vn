const SAFE_WEBHOOK_ID = /^[A-Za-z0-9_-]{8,160}$/;
const SAFE_SECRET = /^[\x21-\x7e]{1,256}$/;

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function text(value) {
  return typeof value === 'string' ? value.trim() : value === undefined ? '' : null;
}

function headerValue(value) {
  return typeof value === 'string' ? value : value === undefined ? '' : null;
}

function normalizeHttpsOrigin(value) {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && url.pathname === '/' && !url.search && !url.hash ? url.origin : null;
  } catch {
    return null;
  }
}

function validEndpoint(value) {
  try {
    const url = new URL(value);
    const match = /^\/macros\/s\/([A-Za-z0-9_-]+)\/exec$/.exec(url.pathname);
    return url.protocol === 'https:' && url.hostname === 'script.google.com' && !url.username
      && !url.password && !url.port && !url.search && !url.hash && match !== null
      && SAFE_WEBHOOK_ID.test(match[1]) ? url.toString() : null;
  } catch {
    return null;
  }
}

function allowedOrigins(value, canonicalOrigin) {
  if (value === '') return [canonicalOrigin];
  const origins = [];
  for (const entry of value.split(',')) {
    const origin = normalizeHttpsOrigin(entry);
    if (!origin || origins.includes(origin)) return null;
    origins.push(origin);
  }
  return origins.length > 0 ? origins : null;
}

/** @returns {Readonly<{ ok: false, enabled: false, code: string }>} */
function invalid(code = 'lead_configuration_invalid') {
  return Object.freeze({ ok: false, enabled: false, code });
}

/**
 * State and required fields travel together. Consumers can narrow with
 * `ok` and `enabled` without asserting that optional values exist.
 *
 * @param {{ profile?: unknown, env?: Record<string, string | undefined> }} [options]
 * @returns {Readonly<
 *   { ok: false, enabled: false, code: string } |
 *   { ok: true, enabled: false, code: 'lead_disabled' } |
 *   { ok: true, enabled: true, code: 'lead_enabled', provider: 'google_sheets',
 *     webhookUrl: string, webhookSecret: string, allowedOrigins: readonly string[], canonicalOrigin: string }
 * >}
 */
export function resolveRuntimeLeadActivation({ profile, env = {} } = {}) {
  if (!plainObject(profile) || !plainObject(env)) return invalid();
  const provider = text(env.LEAD_PROVIDER);
  const endpoint = text(env.GOOGLE_SHEET_WEBHOOK_URL);
  const secret = headerValue(env.WEBHOOK_SECRET);
  const origins = text(env.LEAD_ALLOWED_ORIGINS);
  if ([provider, endpoint, secret, origins].includes(null)) return invalid();

  const configured = [provider, endpoint, secret, origins].some((value) => value !== '');
  if (!configured) return Object.freeze({ ok: true, enabled: false, code: 'lead_disabled' });
  if (provider === '') return invalid();
  if (provider !== 'google_sheets') return invalid('lead_provider_unsupported');
  if (endpoint === '') return invalid();
  const webhookUrl = validEndpoint(endpoint);
  const canonicalOrigin = typeof profile.canonical_origin === 'string'
    ? normalizeHttpsOrigin(profile.canonical_origin) : null;
  if (!webhookUrl || !canonicalOrigin || (secret !== '' && !SAFE_SECRET.test(secret))) return invalid();
  const normalizedOrigins = allowedOrigins(origins, canonicalOrigin);
  if (!normalizedOrigins) return invalid();

  return Object.freeze({
    ok: true,
    enabled: true,
    code: 'lead_enabled',
    provider,
    webhookUrl,
    webhookSecret: secret,
    allowedOrigins: Object.freeze(normalizedOrigins),
    canonicalOrigin,
  });
}
