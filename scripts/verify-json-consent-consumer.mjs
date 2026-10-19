import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { assertSiteProfile } from '../src/config/site-profile.schema.mjs';

const scriptDirectory = fileURLToPath(new URL('.', import.meta.url));
const readSource = (relativePath) => readFile(new URL(relativePath, import.meta.url), 'utf8');
const staging = JSON.parse(await readSource('../src/config/profiles/staging.json'));

function validEnabledProfile() {
  return {
    ...staging,
    tracking: { enabled: true, vendor: 'local-tracking' },
    consent: {
      enabled: true,
      vendor: 'local-consent',
      ui: {
        title: 'Tracking choices',
        description: 'Choose whether to enable configured tracking.',
        accept_label: 'Accept',
        reject_label: 'Reject',
        revoke_label: 'Revoke',
        grant_ttl_ms: 60000,
      },
    },
  };
}

assert.doesNotThrow(() => assertSiteProfile(staging));
assert.deepEqual(staging.consent, { enabled: false, vendor: '', ui: null });
assert.throws(() => assertSiteProfile({ ...staging, consent: { ...staging.consent, ui: {} } }), (error) => error?.code === 'PROFILE_SCHEMA_CONSENT_UI_DISABLED');
assert.throws(() => assertSiteProfile({ ...staging, tracking: { enabled: true, vendor: 'local-tracking' } }), (error) => error?.code === 'PROFILE_SCHEMA_TRACKING_CONSENT_REQUIRED');
const missingUi = validEnabledProfile();
delete missingUi.consent.ui;
assert.throws(() => assertSiteProfile(missingUi), (error) => error?.code === 'PROFILE_SCHEMA_CONSENT');
assert.throws(() => assertSiteProfile({ ...validEnabledProfile(), consent: { ...validEnabledProfile().consent, ui: { ...validEnabledProfile().consent.ui, title: 'bad\nlabel' } } }), (error) => error?.code === 'PROFILE_SCHEMA_CONSENT_UI_TITLE');
assert.throws(() => assertSiteProfile({ ...validEnabledProfile(), consent: { ...validEnabledProfile().consent, ui: { ...validEnabledProfile().consent.ui, title: '\uD800' } } }), (error) => error?.code === 'PROFILE_SCHEMA_CONSENT_UI_TITLE');
assert.throws(() => assertSiteProfile({ ...validEnabledProfile(), consent: { ...validEnabledProfile().consent, ui: { ...validEnabledProfile().consent.ui, title: 'x'.repeat(241) } } }), (error) => error?.code === 'PROFILE_SCHEMA_CONSENT_UI_TITLE');
assert.throws(() => assertSiteProfile({ ...validEnabledProfile(), consent: { ...validEnabledProfile().consent, ui: { ...validEnabledProfile().consent.ui, grant_ttl_ms: 0 } } }), (error) => error?.code === 'PROFILE_SCHEMA_CONSENT_UI_GRANT_TTL_MS');
assert.throws(() => assertSiteProfile({ ...validEnabledProfile(), consent: { ...validEnabledProfile().consent, ui: { ...validEnabledProfile().consent.ui, grant_ttl_ms: 1.5 } } }), (error) => error?.code === 'PROFILE_SCHEMA_CONSENT_UI_GRANT_TTL_MS');
assert.doesNotThrow(() => assertSiteProfile(validEnabledProfile()));

const [component, layout, landingLayout, provider, consent, resolver] = await Promise.all([
  readSource('../src/components/tracking/TrackingConsent.astro'),
  readSource('../src/layouts/BaseLayout.astro'),
  readSource('../src/layouts/LandingLayout.astro'),
  readSource('../src/components/tracking/TrackingProvider.astro'),
  readSource('../src/utils/consent.ts'),
  readSource('../src/config/runtime-tracking-activation.mjs'),
]);

assert.match(component, /import siteProfile from ['"]\.\.\/\.\.\/config\/site-profile\.mjs['"]/);
assert.match(component, /resolveRuntimeTrackingActivation/);
assert.match(component, /if \(!trackingActivation\.ok\) throw new Error\('tracking_configuration_invalid'\)/);
assert.match(component, /consentUi !== null/);
assert.match(component, /data-consent-state="unknown"/);
assert.match(component, /data-profile-id=\{trackingActivation\.profile\.id\}/);
assert.match(component, /data-grant-ttl-ms=\{String\(consentUi\.grant_ttl_ms\)\}/);
assert.equal((component.match(/<button\b/g) ?? []).length, 3);
for (const [action, label] of [['accept', 'accept_label'], ['reject', 'reject_label'], ['revoke', 'revoke_label']]) {
  assert.match(component, new RegExp(`data-consent-action="${action}"[^>]*>\\{consentUi\\.${label}\\}`));
}
assert.match(component, /import \{ grantConsent, revokeConsent \} from ['"]\.\.\/\.\.\/utils\/consent['"]/);
assert.match(component, /grantConsent\(profileId, Date\.now\(\) \+ grantTtlMs\)/);
assert.equal((component.match(/revokeConsent\(profileId\)/g) ?? []).length, 2);
assert.match(component, /root\.dataset\.consentState = state/);
assert.match(component, /const completeAction = \(state: 'granted' \| 'revoked'\) => \{\s*setState\(state\);\s*window\.location\.reload\(\);\s*\}/);
assert.equal((component.match(/window\.location\.reload\(\)/g) ?? []).length, 1);
assert.match(component, /if \(grantConsent\(profileId, Date\.now\(\) \+ grantTtlMs\)\) completeAction\('granted'\)/);
assert.equal((component.match(/if \(revokeConsent\(profileId\)\) completeAction\('revoked'\)/g) ?? []).length, 2);
assert.doesNotMatch(component, /readConsent|hasValidConsent|localStorage|set:html|innerHTML|onclick\s*=|https?:\/\/|googletagmanager|fetch\s*\(/i);
assert.doesNotMatch(component, /grant_ttl_ms\s*[:=]\s*\d+/);
assert.equal((layout.match(/import TrackingConsent from ['"]\.\.\/components\/tracking\/TrackingConsent\.astro['"]/g) ?? []).length, 1);
assert.equal((layout.match(/<TrackingConsent\s*\/>/g) ?? []).length, 1);
assert.equal((landingLayout.match(/import TrackingConsent from ['"]\.\.\/components\/tracking\/TrackingConsent\.astro['"]/g) ?? []).length, 1);
assert.equal((landingLayout.match(/<TrackingConsent\s*\/>/g) ?? []).length, 1);
assert.match(provider, /resolveRuntimeTrackingActivation/);
assert.match(provider, /if \(!trackingActivation\.ok\) throw new Error\('tracking_configuration_invalid'\)/);
assert.match(provider, /canInitializeTracking\(profile\)/);
assert.match(resolver, /tracking_configuration_invalid/);
// Mô hình thông báo + cho phép từ chối (opt-out), theo quyết định owner 10/09/2026:
// khách chưa chọn gì thì vẫn đo, phạm vi thu thập công bố tại /privacy. Khẳng định
// cũ khoá cứng logic opt-in ('granted' mới được đo) nên không còn đúng.
//
// Ba điều vẫn phải giữ, vì đây mới là phần bảo vệ người dùng thật:
//   1. Đã bấm từ chối thì phải chặn, và
//   2. Lựa chọn "đồng ý" vẫn phải có hạn dùng, không vĩnh viễn.
//   3. Mọi quyết định vẫn đi qua đúng một hàm hasValidConsent.
assert.match(consent, /if \(state\.status === 'revoked'\) return false;/);
assert.match(consent, /return state\.expiresAt !== undefined && state\.expiresAt > now;/);
assert.match(consent, /return hasTrackingConsentConfiguration\(profile\) && typeof profile\.id === 'string' && hasValidConsent\(profile\.id\)/);

const contentConfig = await readFile(new URL('../src/content.config.ts', import.meta.url), 'utf8');
assert.match(contentConfig, /loader: glob\(\{ pattern: "\*\*\/index\.md", base: "\.\/src\/content\/blog" \}\)/);
console.log('verify-json-consent-consumer: PASS (schema, disabled staging, gated UI, actions, mount)');
