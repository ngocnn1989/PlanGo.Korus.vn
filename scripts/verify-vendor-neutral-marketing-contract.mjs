import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { assertSiteProfile } from '../src/config/site-profile.schema.mjs';

const SOURCE_FILES = Object.freeze({
  schema: '../src/config/site-profile.schema.mjs',
  profile: '../src/config/site-profile.mjs',
  trackingProvider: '../src/components/tracking/TrackingProvider.astro',
  trackingConsent: '../src/components/tracking/TrackingConsent.astro',
  runtimeTracking: '../src/config/runtime-tracking-activation.mjs',
  runtimeLead: '../src/config/runtime-lead-activation.mjs',
  leadModal: '../src/components/global/LeadModal.astro',
  leadApi: '../src/pages/api/leads.ts',
  leadDispatch: '../src/utils/lead-dispatch/index.ts',
  consent: '../src/utils/consent.ts',
  tracking: '../src/utils/tracking.ts',
  seo: '../src/components/seo/SeoHead.astro',
  middleware: '../src/middleware.ts',
  astroConfig: '../astro.config.mjs',
  stagingProfile: '../src/config/profiles/staging.json',
  envExample: '../env.example',
});

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertMatch(source, pattern, message) {
  assert(pattern.test(source), message);
}

function assertNoMatch(source, pattern, message) {
  assert(!pattern.test(source), message);
}

async function readSources() {
  const entries = await Promise.all(
    Object.entries(SOURCE_FILES).map(async ([name, relativePath]) => [
      name,
      await readFile(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8'),
    ]),
  );
  return Object.fromEntries(entries);
}

const sources = await readSources();

const stagingProfile = assertSiteProfile(JSON.parse(sources.stagingProfile));
assert(
  stagingProfile.tracking.enabled === false && stagingProfile.tracking.vendor === '',
  'staging tracking must be disabled without a vendor',
);
assert(
  stagingProfile.consent.enabled === false && stagingProfile.consent.vendor === '',
  'staging consent must be disabled without a vendor',
);

assertMatch(
  sources.schema,
  /requireExactKeys\(configuration, \['enabled', 'vendor'\]/,
  'tracking and consent configuration must remain limited to enabled and vendor',
);
assertMatch(
  sources.schema,
  /profile\.tracking\.enabled && !profile\.consent\.enabled/,
  'tracking must remain invalid without configured consent',
);
const vendorConfigurationSchema = sources.schema.slice(
  sources.schema.indexOf('function validateVendorConfiguration'),
  sources.schema.indexOf('export function assertSiteProfile'),
);
assertNoMatch(
  vendorConfigurationSchema,
  /\b(?:secret|api[_-]?key|password|access[_-]?token)\b/i,
  'tracking and consent configuration must not require a secret',
);
assertMatch(
  sources.profile,
  /^import siteProfile from 'virtual:site-profile';\s+export default siteProfile;\s*$/,
  'site profile facade must remain virtual-only without a local provider destination',
);

assertMatch(sources.runtimeTracking, /PUBLIC_ENABLE_TRACKING.*PUBLIC_GTM_ID.*PUBLIC_TRACKING_DELAY_MS/s, 'tracking resolver must allow only the three public tracking inputs');
assertMatch(sources.runtimeTracking, /tracking_configuration_invalid/, 'invalid public tracking input must fail closed');
assertNoMatch(sources.runtimeTracking, /\b(?:LEAD_|secret|api[_-]?key|password|access[_-]?token)\b/i, 'tracking resolver must not accept lead or secret inputs');
assertMatch(
  sources.trackingProvider,
  /resolveRuntimeTrackingActivation[\s\S]*?PUBLIC_ENABLE_TRACKING[\s\S]*?PUBLIC_GTM_ID[\s\S]*?PUBLIC_TRACKING_DELAY_MS/,
  'tracking provider must use only the accepted public tracking resolver inputs',
);
assertMatch(
  sources.trackingProvider,
  /\{trackingActivation\.enabled && \(/,
  'tracking markup must remain conditionally suppressed by the consent gate',
);
assertMatch(sources.trackingProvider, /if \(!canInitializeTracking\(profile\)\) return;/, 'delayed injection must recheck consent before collection');
assertMatch(sources.trackingConsent, /resolveRuntimeTrackingActivation/, 'consent UI must use the accepted effective profile');
assertNoMatch(
  sources.trackingProvider,
  /process\.env|dotenv|readFile|readFileSync/,
  'tracking provider must not read server or local secret material',
);

assertMatch(sources.runtimeLead, /LEAD_PROVIDER.*GOOGLE_SHEET_WEBHOOK_URL.*WEBHOOK_SECRET.*LEAD_ALLOWED_ORIGINS/s, 'lead resolver must read only the selected server-side controls');
assertMatch(sources.runtimeLead, /lead_configuration_invalid/, 'invalid lead configuration must fail closed');
assertMatch(sources.runtimeLead, /lead_provider_unsupported/, 'unknown lead provider must be explicit');
assertNoMatch(sources.runtimeLead, /PUBLIC_|process\.env|console\./, 'lead resolver must remain server-only and silent');
assertMatch(sources.leadModal, /fetch\('\/api\/leads'/, 'lead modal must use only the relative API route');
assertNoMatch(sources.leadModal, /script\.google\.com|leadResolution\.(?:webhookUrl|webhookSecret)|result\.error/, 'lead modal must not expose provider values or obsolete response fields');
assertMatch(sources.leadApi, /lead_provider_rejected/, 'provider acknowledgement denial must be explicit');
assertNoMatch(sources.leadApi, /persist|reread|receiptsEqual/, 'lead API must not reintroduce persistence or reread');
assertMatch(sources.leadDispatch, /application\/x-www-form-urlencoded;charset=UTF-8/, 'lead dispatch must use the frozen form wire');
assertMatch(sources.leadDispatch, /X-Korus-Webhook-Secret/, 'optional secret header must remain server-only');
assertNoMatch(sources.leadDispatch, /console\.|localStorage|document\.|window\./, 'lead dispatch must have no client or logging surface');

assertMatch(
  sources.consent,
  /profile\.tracking\?\.enabled === true && profile\.consent\?\.enabled === true/,
  'consent configuration must require both tracking and consent enabled',
);
assertMatch(sources.envExample, /LEAD_PROVIDER=\s*\nGOOGLE_SHEET_WEBHOOK_URL=\s*\nWEBHOOK_SECRET=\s*\nLEAD_ALLOWED_ORIGINS=/, 'environment example must expose only blank lead names');
assertMatch(sources.envExample, /PUBLIC_ENABLE_TRACKING=\s*\nPUBLIC_GTM_ID=\s*\nPUBLIC_TRACKING_DELAY_MS=/, 'environment example must expose only blank public tracking names');
assertMatch(
  sources.consent,
  /return hasTrackingConsentConfiguration\(profile\)[\s\S]*?hasValidConsent\(profile\.id\)/,
  'tracking initialization must require valid consent',
);
assertMatch(
  sources.tracking,
  /!profile \|\| !profileId \|\| !canInitializeTracking\(profile\)\) return undefined/,
  'event emission must remain deny-by-default before consent initialization',
);
assertNoMatch(
  sources.tracking,
  /\b(?:email|phone|address|tax_id|full_name)\b/i,
  'tracking helper must not define direct PII event fields',
);
assert(
  sources.tracking.indexOf('!canInitializeTracking(profile)')
    < sources.tracking.indexOf('dataLayer.push'),
  'consent gate must execute before the event sink',
);

for (const directive of [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "connect-src 'self'",
]) {
  assert(sources.astroConfig.includes(directive), `CSP directive missing: ${directive}`);
}
assertMatch(sources.astroConfig, /vercel\(\{ staticHeaders: true \}\)/, 'static header mode must remain enabled');
assertNoMatch(
  sources.astroConfig,
  /(?:default-src|base-uri|object-src|frame-ancestors|form-action|connect-src)[^\n]*\*/,
  'CSP directives must not be broadened with a wildcard',
);
assertMatch(sources.middleware, /'Cache-Control': 'no-store'/, 'lead denial header must remain non-cacheable');
assertMatch(sources.middleware, /status: 403/, 'lead denial must remain explicit');

for (const staticMetadata of [
  '<title>{title}</title>',
  '<meta name="description" content={description} />',
  '<link rel="canonical" href={finalCanonical} />',
  '<meta name="robots" content="noindex,nofollow" />',
]) {
  assert(sources.seo.includes(staticMetadata), `crawler metadata missing: ${staticMetadata}`);
}
assertNoMatch(sources.seo, /http-equiv\s*=\s*["']refresh/i, 'crawler metadata must not use refresh redirects');

console.log('vendor-neutral marketing contract: PASS');
