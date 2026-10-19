/**
 * Pure precondition validation for a future trusted publisher. The caller must
 * provide the evaluation time, replay decision, and policy lifetime explicitly;
 * this module does not read clocks, stores, identities, signatures, or
 * environment state.
 */

const ENVELOPE_FIELDS = Object.freeze([
  'schemaVersion',
  'policyVersion',
  'siteId',
  'scopeId',
  'artifactSha256',
  'writerRef',
  'auditorRef',
  'publisherRef',
  'issuedAt',
  'expiresAt',
  'nonce',
  'idempotencyKey',
  'auditorAttestationRef',
]);

const CONTEXT_FIELDS = Object.freeze([
  'evaluationTime',
  'replayDetected',
  'policyMaxLifetimeMs',
]);

const MUTABLE_APPROVAL_FIELD = /approval|approved|reviewer|human[-_]?review/i;
const UNTRUSTED_CONTENT_FIELD = /(?:mdx|jsx|html|script|content|path|url|source|import)/i;
const SAFE_REFERENCE = /^[a-z][a-z0-9._:-]{0,191}$/;
const SAFE_VERSION = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const REQUIRED_FIELD_CODES = Object.freeze({
  schemaVersion: 'SCHEMA_VERSION_REQUIRED',
  policyVersion: 'POLICY_VERSION_REQUIRED',
  siteId: 'SITE_ID_REQUIRED',
  scopeId: 'SCOPE_ID_REQUIRED',
  artifactSha256: 'ARTIFACT_HASH_REQUIRED',
  nonce: 'NONCE_REQUIRED',
  idempotencyKey: 'IDEMPOTENCY_KEY_REQUIRED',
});
const REQUIRED_CONTEXT_FIELD_CODES = Object.freeze({
  policyMaxLifetimeMs: 'POLICY_MAX_LIFETIME_INVALID',
});

export const PUBLISH_ATTESTATION_DENIAL_CODES = Object.freeze({
  OK: 'OK',
  ENVELOPE_NOT_PLAIN_OBJECT: 'ENVELOPE_NOT_PLAIN_OBJECT',
  CONTEXT_NOT_PLAIN_OBJECT: 'CONTEXT_NOT_PLAIN_OBJECT',
  UNKNOWN_ENVELOPE_FIELD: 'UNKNOWN_ENVELOPE_FIELD',
  UNKNOWN_CONTEXT_FIELD: 'UNKNOWN_CONTEXT_FIELD',
  MUTABLE_APPROVAL_FIELD: 'MUTABLE_APPROVAL_FIELD',
  UNTRUSTED_CONTENT_FIELD: 'UNTRUSTED_CONTENT_FIELD',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  SCHEMA_VERSION_REQUIRED: 'SCHEMA_VERSION_REQUIRED',
  POLICY_VERSION_REQUIRED: 'POLICY_VERSION_REQUIRED',
  SITE_ID_REQUIRED: 'SITE_ID_REQUIRED',
  SCOPE_ID_REQUIRED: 'SCOPE_ID_REQUIRED',
  ARTIFACT_HASH_REQUIRED: 'ARTIFACT_HASH_REQUIRED',
  NONCE_REQUIRED: 'NONCE_REQUIRED',
  IDEMPOTENCY_KEY_REQUIRED: 'IDEMPOTENCY_KEY_REQUIRED',
  INVALID_FIELD_VALUE: 'INVALID_FIELD_VALUE',
  ARTIFACT_HASH_INVALID: 'ARTIFACT_HASH_INVALID',
  ACTOR_SEPARATION_VIOLATION: 'ACTOR_SEPARATION_VIOLATION',
  DUPLICATE_SEMANTIC_VALUE: 'DUPLICATE_SEMANTIC_VALUE',
  EVALUATION_TIME_INVALID: 'EVALUATION_TIME_INVALID',
  INVALID_TIME_WINDOW: 'INVALID_TIME_WINDOW',
  EVALUATION_BEFORE_ISSUED_AT: 'EVALUATION_BEFORE_ISSUED_AT',
  EXPIRED_ENVELOPE: 'EXPIRED_ENVELOPE',
  POLICY_MAX_LIFETIME_INVALID: 'POLICY_MAX_LIFETIME_INVALID',
  POLICY_MAX_LIFETIME_EXCEEDED: 'POLICY_MAX_LIFETIME_EXCEEDED',
  REPLAYED_ENVELOPE: 'REPLAYED_ENVELOPE',
});

function result(code) {
  return Object.freeze({
    ok: code === PUBLISH_ATTESTATION_DENIAL_CODES.OK,
    code,
  });
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOnlyFields(value, allowedFields, unknownCode) {
  for (const field of Object.keys(value)) {
    if (allowedFields.includes(field)) {
      continue;
    }
    if (MUTABLE_APPROVAL_FIELD.test(field)) {
      return PUBLISH_ATTESTATION_DENIAL_CODES.MUTABLE_APPROVAL_FIELD;
    }
    if (UNTRUSTED_CONTENT_FIELD.test(field)) {
      return PUBLISH_ATTESTATION_DENIAL_CODES.UNTRUSTED_CONTENT_FIELD;
    }
    return unknownCode;
  }
  return null;
}

function isSafeReference(value) {
  return typeof value === 'string'
    && SAFE_REFERENCE.test(value)
    && !/^(?:data|file|ftp|http|https|javascript):/.test(value);
}

function parseIsoInstant(value) {
  if (typeof value !== 'string' || !ISO_INSTANT.test(value)) {
    return Number.NaN;
  }
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value
    ? milliseconds
    : Number.NaN;
}

/**
 * Validates an immutable publish-attestation envelope without side effects.
 *
 * @param {object} envelope The fixed publish-attestation envelope.
 * @param {object} context Explicit deterministic input: evaluationTime and
 * replayDetected, and policyMaxLifetimeMs. A trusted publisher supplies these
 * after its own checks and policy resolution.
 * @returns {{ok: boolean, code: string}}
 */
export function validatePublishAttestationContract(envelope, context) {
  if (!isPlainObject(envelope)) {
    return result(PUBLISH_ATTESTATION_DENIAL_CODES.ENVELOPE_NOT_PLAIN_OBJECT);
  }

  const envelopeFieldCode = hasOnlyFields(
    envelope,
    ENVELOPE_FIELDS,
    PUBLISH_ATTESTATION_DENIAL_CODES.UNKNOWN_ENVELOPE_FIELD,
  );
  if (envelopeFieldCode) {
    return result(envelopeFieldCode);
  }

  for (const field of ENVELOPE_FIELDS) {
    if (!Object.hasOwn(envelope, field)) {
      return result(
        PUBLISH_ATTESTATION_DENIAL_CODES[REQUIRED_FIELD_CODES[field]]
          ?? PUBLISH_ATTESTATION_DENIAL_CODES.MISSING_REQUIRED_FIELD,
      );
    }
  }

  if (!isPlainObject(context)) {
    return result(PUBLISH_ATTESTATION_DENIAL_CODES.CONTEXT_NOT_PLAIN_OBJECT);
  }
  const contextFieldCode = hasOnlyFields(
    context,
    CONTEXT_FIELDS,
    PUBLISH_ATTESTATION_DENIAL_CODES.UNKNOWN_CONTEXT_FIELD,
  );
  if (contextFieldCode) {
    return result(contextFieldCode);
  }
  for (const field of CONTEXT_FIELDS) {
    if (!Object.hasOwn(context, field)) {
      return result(
        PUBLISH_ATTESTATION_DENIAL_CODES[REQUIRED_CONTEXT_FIELD_CODES[field]]
          ?? PUBLISH_ATTESTATION_DENIAL_CODES.MISSING_REQUIRED_FIELD,
      );
    }
  }

  if (typeof envelope.schemaVersion !== 'string' || envelope.schemaVersion.length === 0) {
    return result(PUBLISH_ATTESTATION_DENIAL_CODES.SCHEMA_VERSION_REQUIRED);
  }
  if (typeof envelope.policyVersion !== 'string' || envelope.policyVersion.length === 0) {
    return result(PUBLISH_ATTESTATION_DENIAL_CODES.POLICY_VERSION_REQUIRED);
  }
  if (!SAFE_VERSION.test(envelope.schemaVersion) || !SAFE_VERSION.test(envelope.policyVersion)) {
    return result(PUBLISH_ATTESTATION_DENIAL_CODES.INVALID_FIELD_VALUE);
  }

  if (!/^[a-f0-9]{64}$/.test(envelope.artifactSha256)) {
    return result(PUBLISH_ATTESTATION_DENIAL_CODES.ARTIFACT_HASH_INVALID);
  }

  const references = [
    envelope.siteId,
    envelope.scopeId,
    envelope.writerRef,
    envelope.auditorRef,
    envelope.publisherRef,
    envelope.nonce,
    envelope.idempotencyKey,
    envelope.auditorAttestationRef,
  ];
  if (typeof envelope.siteId !== 'string' || envelope.siteId.length === 0) {
    return result(PUBLISH_ATTESTATION_DENIAL_CODES.SITE_ID_REQUIRED);
  }
  if (typeof envelope.scopeId !== 'string' || envelope.scopeId.length === 0) {
    return result(PUBLISH_ATTESTATION_DENIAL_CODES.SCOPE_ID_REQUIRED);
  }
  if (typeof envelope.nonce !== 'string' || envelope.nonce.length === 0) {
    return result(PUBLISH_ATTESTATION_DENIAL_CODES.NONCE_REQUIRED);
  }
  if (typeof envelope.idempotencyKey !== 'string' || envelope.idempotencyKey.length === 0) {
    return result(PUBLISH_ATTESTATION_DENIAL_CODES.IDEMPOTENCY_KEY_REQUIRED);
  }
  if (!references.every(isSafeReference)) {
    return result(PUBLISH_ATTESTATION_DENIAL_CODES.INVALID_FIELD_VALUE);
  }

  if (envelope.writerRef === envelope.auditorRef
    || envelope.writerRef === envelope.publisherRef
    || envelope.auditorRef === envelope.publisherRef) {
    return result(PUBLISH_ATTESTATION_DENIAL_CODES.ACTOR_SEPARATION_VIOLATION);
  }

  if (envelope.nonce === envelope.idempotencyKey
    || envelope.nonce === envelope.auditorAttestationRef
    || envelope.idempotencyKey === envelope.auditorAttestationRef) {
    return result(PUBLISH_ATTESTATION_DENIAL_CODES.DUPLICATE_SEMANTIC_VALUE);
  }

  const issuedAt = parseIsoInstant(envelope.issuedAt);
  const expiresAt = parseIsoInstant(envelope.expiresAt);
  const evaluationTime = parseIsoInstant(context.evaluationTime);
  if (!Number.isFinite(evaluationTime)) {
    return result(PUBLISH_ATTESTATION_DENIAL_CODES.EVALUATION_TIME_INVALID);
  }
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) {
    return result(PUBLISH_ATTESTATION_DENIAL_CODES.INVALID_FIELD_VALUE);
  }
  if (issuedAt >= expiresAt) {
    return result(PUBLISH_ATTESTATION_DENIAL_CODES.INVALID_TIME_WINDOW);
  }
  if (!Number.isSafeInteger(context.policyMaxLifetimeMs)
    || context.policyMaxLifetimeMs <= 0) {
    return result(PUBLISH_ATTESTATION_DENIAL_CODES.POLICY_MAX_LIFETIME_INVALID);
  }
  if (evaluationTime < issuedAt) {
    return result(PUBLISH_ATTESTATION_DENIAL_CODES.EVALUATION_BEFORE_ISSUED_AT);
  }
  if (evaluationTime > expiresAt) {
    return result(PUBLISH_ATTESTATION_DENIAL_CODES.EXPIRED_ENVELOPE);
  }
  if (expiresAt - issuedAt > context.policyMaxLifetimeMs) {
    return result(PUBLISH_ATTESTATION_DENIAL_CODES.POLICY_MAX_LIFETIME_EXCEEDED);
  }
  if (context.replayDetected !== false && context.replayDetected !== true) {
    return result(PUBLISH_ATTESTATION_DENIAL_CODES.INVALID_FIELD_VALUE);
  }
  if (context.replayDetected) {
    return result(PUBLISH_ATTESTATION_DENIAL_CODES.REPLAYED_ENVELOPE);
  }

  return result(PUBLISH_ATTESTATION_DENIAL_CODES.OK);
}

export function assertPublishAttestationContract(envelope, context) {
  const validation = validatePublishAttestationContract(envelope, context);
  if (!validation.ok) {
    const error = new Error(validation.code);
    error.name = 'PublishAttestationContractError';
    error.code = validation.code;
    throw error;
  }
  return validation;
}
