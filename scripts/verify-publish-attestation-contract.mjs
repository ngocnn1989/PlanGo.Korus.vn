import {
  PUBLISH_ATTESTATION_DENIAL_CODES,
  validatePublishAttestationContract,
} from './assert-publish-attestation-contract.mjs';

const CODES = PUBLISH_ATTESTATION_DENIAL_CODES;

const acceptedEnvelope = Object.freeze({
  schemaVersion: 'v1',
  policyVersion: 'p1',
  siteId: 'site:example',
  scopeId: 'scope:article',
  artifactSha256: 'a'.repeat(64),
  writerRef: 'cap:writer',
  auditorRef: 'cap:auditor',
  publisherRef: 'cap:publisher',
  issuedAt: '2026-01-01T00:00:00.000Z',
  expiresAt: '2026-01-01T00:05:00.000Z',
  nonce: 'nonce:one',
  idempotencyKey: 'idem:one',
  auditorAttestationRef: 'attest:one',
});

const acceptedContext = Object.freeze({
  evaluationTime: '2026-01-01T00:01:00.000Z',
  replayDetected: false,
  policyMaxLifetimeMs: 300000,
});

function omit(value, field) {
  const copy = { ...value };
  delete copy[field];
  return copy;
}

function expectCase(name, envelope, context, expectedCode) {
  const actual = validatePublishAttestationContract(envelope, context);
  const expectedOk = expectedCode === CODES.OK;
  if (actual.ok !== expectedOk || actual.code !== expectedCode) {
    throw new Error(`${name}: expected ${expectedCode}, got ${actual.code}`);
  }
  console.log(`${name}: ${actual.code}`);
}

expectCase('accepted', acceptedEnvelope, acceptedContext, CODES.OK);
expectCase('envelope-not-plain-object', null, acceptedContext, CODES.ENVELOPE_NOT_PLAIN_OBJECT);
expectCase('context-not-plain-object', acceptedEnvelope, null, CODES.CONTEXT_NOT_PLAIN_OBJECT);
expectCase(
  'unknown-envelope-field',
  { ...acceptedEnvelope, unexpected: 'value' },
  acceptedContext,
  CODES.UNKNOWN_ENVELOPE_FIELD,
);
expectCase(
  'unknown-context-field',
  acceptedEnvelope,
  { ...acceptedContext, unexpected: true },
  CODES.UNKNOWN_CONTEXT_FIELD,
);
expectCase(
  'editable-approval-field',
  { ...acceptedEnvelope, approvalStatus: 'approved' },
  acceptedContext,
  CODES.MUTABLE_APPROVAL_FIELD,
);
expectCase(
  'editable-mdx-content-field',
  { ...acceptedEnvelope, mdxContent: '<approved />' },
  acceptedContext,
  CODES.UNTRUSTED_CONTENT_FIELD,
);
expectCase(
  'missing-writer-reference',
  omit(acceptedEnvelope, 'writerRef'),
  acceptedContext,
  CODES.MISSING_REQUIRED_FIELD,
);
expectCase(
  'missing-replay-decision',
  acceptedEnvelope,
  omit(acceptedContext, 'replayDetected'),
  CODES.MISSING_REQUIRED_FIELD,
);
expectCase(
  'missing-schema-version',
  omit(acceptedEnvelope, 'schemaVersion'),
  acceptedContext,
  CODES.SCHEMA_VERSION_REQUIRED,
);
expectCase(
  'missing-policy-version',
  omit(acceptedEnvelope, 'policyVersion'),
  acceptedContext,
  CODES.POLICY_VERSION_REQUIRED,
);
expectCase('missing-site', omit(acceptedEnvelope, 'siteId'), acceptedContext, CODES.SITE_ID_REQUIRED);
expectCase('missing-scope', omit(acceptedEnvelope, 'scopeId'), acceptedContext, CODES.SCOPE_ID_REQUIRED);
expectCase(
  'missing-artifact-hash',
  omit(acceptedEnvelope, 'artifactSha256'),
  acceptedContext,
  CODES.ARTIFACT_HASH_REQUIRED,
);
expectCase('missing-nonce', omit(acceptedEnvelope, 'nonce'), acceptedContext, CODES.NONCE_REQUIRED);
expectCase(
  'missing-idempotency-key',
  omit(acceptedEnvelope, 'idempotencyKey'),
  acceptedContext,
  CODES.IDEMPOTENCY_KEY_REQUIRED,
);
expectCase(
  'invalid-reference',
  { ...acceptedEnvelope, writerRef: 'raw/path' },
  acceptedContext,
  CODES.INVALID_FIELD_VALUE,
);
expectCase(
  'mismatched-artifact-hash',
  { ...acceptedEnvelope, artifactSha256: 'wrong-hash' },
  acceptedContext,
  CODES.ARTIFACT_HASH_INVALID,
);
expectCase(
  'writer-equals-auditor',
  { ...acceptedEnvelope, auditorRef: acceptedEnvelope.writerRef },
  acceptedContext,
  CODES.ACTOR_SEPARATION_VIOLATION,
);
expectCase(
  'auditor-equals-publisher',
  { ...acceptedEnvelope, publisherRef: acceptedEnvelope.auditorRef },
  acceptedContext,
  CODES.ACTOR_SEPARATION_VIOLATION,
);
expectCase(
  'duplicate-semantic-value',
  { ...acceptedEnvelope, idempotencyKey: acceptedEnvelope.nonce },
  acceptedContext,
  CODES.DUPLICATE_SEMANTIC_VALUE,
);
expectCase(
  'invalid-evaluation-time',
  acceptedEnvelope,
  { ...acceptedContext, evaluationTime: 'not-an-instant' },
  CODES.EVALUATION_TIME_INVALID,
);
expectCase(
  'invalid-time-window',
  { ...acceptedEnvelope, expiresAt: acceptedEnvelope.issuedAt },
  acceptedContext,
  CODES.INVALID_TIME_WINDOW,
);
expectCase(
  'pre-issued-evaluation',
  acceptedEnvelope,
  { ...acceptedContext, evaluationTime: '2025-12-31T23:59:59.000Z' },
  CODES.EVALUATION_BEFORE_ISSUED_AT,
);
expectCase(
  'expired-envelope',
  acceptedEnvelope,
  { ...acceptedContext, evaluationTime: '2026-01-01T00:06:00.000Z' },
  CODES.EXPIRED_ENVELOPE,
);
expectCase(
  'missing-policy-lifetime',
  acceptedEnvelope,
  omit(acceptedContext, 'policyMaxLifetimeMs'),
  CODES.POLICY_MAX_LIFETIME_INVALID,
);
expectCase(
  'zero-policy-lifetime',
  acceptedEnvelope,
  { ...acceptedContext, policyMaxLifetimeMs: 0 },
  CODES.POLICY_MAX_LIFETIME_INVALID,
);
expectCase(
  'fractional-policy-lifetime',
  acceptedEnvelope,
  { ...acceptedContext, policyMaxLifetimeMs: 1.5 },
  CODES.POLICY_MAX_LIFETIME_INVALID,
);
expectCase(
  'unsafe-policy-lifetime',
  acceptedEnvelope,
  { ...acceptedContext, policyMaxLifetimeMs: Number.MAX_SAFE_INTEGER + 1 },
  CODES.POLICY_MAX_LIFETIME_INVALID,
);
expectCase(
  'ttl-above-policy-lifetime',
  acceptedEnvelope,
  { ...acceptedContext, policyMaxLifetimeMs: 299999 },
  CODES.POLICY_MAX_LIFETIME_EXCEEDED,
);
expectCase(
  'replayed-envelope',
  acceptedEnvelope,
  { ...acceptedContext, replayDetected: true },
  CODES.REPLAYED_ENVELOPE,
);

console.log('publish-attestation oracle: PASS');
