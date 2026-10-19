import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolveRuntimeTrackingActivation, serializeRuntimeTrackingActivation } from '../src/config/runtime-tracking-activation.mjs';

const baseProfile = {
  id: 'staging',
  tracking: { enabled: false, vendor: '' },
  consent: { enabled: false, vendor: '', ui: null },
};
const fallbackUi = {
  title: 'Measurement choices',
  description: 'Choose whether measurement may start.',
  accept_label: 'Allow',
  reject_label: 'Reject',
  revoke_label: 'Revoke',
  grant_ttl_ms: 86400000,
};
const enabled = (env, profile = baseProfile) => resolveRuntimeTrackingActivation({ profile, env });

const disabled = enabled({});
assert.deepEqual(disabled, { ok: true, code: 'tracking_disabled', enabled: false, gtmId: '', delayMs: 0, profile: baseProfile });
assert.equal(enabled({}, { ...baseProfile, tracking: { enabled: true, vendor: 'google_tag_manager' }, consent: { enabled: true, vendor: 'local_consent', ui: fallbackUi } }).enabled, false);
for (const configuration of [
  enabled({ PUBLIC_GTM_ID: 'GTM-ABCD' }),
  enabled({ PUBLIC_ENABLE_TRACKING: ' TrUe ', PUBLIC_GTM_ID: 'GTM-ABCD' }),
]) {
  assert.equal(configuration.ok, true);
  assert.equal(configuration.enabled, true);
  assert.equal(configuration.profile.tracking.vendor, 'google_tag_manager');
  assert.deepEqual(configuration.profile.consent.ui, fallbackUi);
}
assert.equal(enabled({ PUBLIC_ENABLE_TRACKING: 'false', PUBLIC_GTM_ID: 'GTM-ABCD' }).enabled, false);
for (const env of [
  { PUBLIC_ENABLE_TRACKING: 'true' },
  { PUBLIC_ENABLE_TRACKING: 'maybe' },
  { PUBLIC_GTM_ID: 'GTM-bad' },
  { PUBLIC_TRACKING_DELAY_MS: '' },
  { PUBLIC_TRACKING_DELAY_MS: '1.5' },
  { PUBLIC_TRACKING_DELAY_MS: '60001' },
  { LEAD_PROVIDER: 'google_sheets' },
]) assert.equal(enabled(env).code, 'tracking_configuration_invalid');
assert.equal(enabled({ PUBLIC_GTM_ID: 'GTM-ABCD', PUBLIC_TRACKING_DELAY_MS: '0' }).delayMs, 0);
assert.equal(enabled({ PUBLIC_GTM_ID: 'GTM-ABCD', PUBLIC_TRACKING_DELAY_MS: '60000' }).delayMs, 60000);
const profileUi = { ...fallbackUi, title: 'Profile choice', grant_ttl_ms: 1 };
const overridden = enabled({ PUBLIC_GTM_ID: 'GTM-ABCD' }, { ...baseProfile, consent: { enabled: true, vendor: 'local_consent', ui: profileUi } });
assert.equal(overridden.profile.consent.ui, profileUi);
const serialized = serializeRuntimeTrackingActivation(enabled({ PUBLIC_GTM_ID: 'GTM-ABCD' }));
assert.equal(serialized.includes('LEAD_'), false);
assert.equal(serialized.includes('<'), false);

const resolverSource = await readFile(fileURLToPath(new URL('../src/config/runtime-tracking-activation.mjs', import.meta.url)), 'utf8');
const providerSource = await readFile(fileURLToPath(new URL('../src/components/tracking/TrackingProvider.astro', import.meta.url)), 'utf8');
const consentSource = await readFile(fileURLToPath(new URL('../src/components/tracking/TrackingConsent.astro', import.meta.url)), 'utf8');
const landingSource = await readFile(fileURLToPath(new URL('../src/layouts/LandingLayout.astro', import.meta.url)), 'utf8');
const astroConfig = await readFile(fileURLToPath(new URL('../astro.config.mjs', import.meta.url)), 'utf8');
const gitignore = await readFile(fileURLToPath(new URL('../.gitignore', import.meta.url)), 'utf8');
assert.match(providerSource, /resolveRuntimeTrackingActivation/);
assert.match(providerSource, /if \(!trackingActivation\.ok\) throw new Error\('tracking_configuration_invalid'\)/);
assert.match(consentSource, /if \(!trackingActivation\.ok\) throw new Error\('tracking_configuration_invalid'\)/);
assert.match(providerSource, /window\.setTimeout\(inject, delayMs\)/);
assert.match(providerSource, /if \(!canInitializeTracking\(profile\)\) return;/);
assert.doesNotMatch(resolverSource, /\bfetch\s*\(|https?:\/\//);
assert.equal((landingSource.match(/<TrackingConsent\s*\/>/g) ?? []).length, 1);
assert.match(astroConfig, /connect-src 'self' https:\/\/www\.googletagmanager\.com/);
assert.match(astroConfig, /resources: \["'self'", 'https:\/\/www\.googletagmanager\.com', 'https:\/\/connect\.facebook\.net', 'https:\/\/capi-automation\.s3\.us-east-2\.amazonaws\.com'\]/);
assert.doesNotMatch(astroConfig, /\*|'unsafe-eval'/);
// Repo phẳng: không còn tiền tố web/ của monorepo gốc.
assert.match(gitignore, /^\.env$/m);
assert.match(gitignore, /^\.env\.\*$/m);
assert.match(gitignore, /^!\.env\.example$/m);
assert.doesNotMatch(gitignore, /^!web\/\.env\.example$/m);
console.log('runtime-tracking-activation: PASS (disabled, enablement, fallback, override, delay, denial, consent gate)');
