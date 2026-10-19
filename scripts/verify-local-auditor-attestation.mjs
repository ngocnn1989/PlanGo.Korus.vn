import { createHash, createPublicKey, verify } from 'node:crypto';

import { canonicalizeLocalArticleDraft } from './assert-local-article-draft-contract.mjs';
import { validatePublishAttestationContract } from './assert-publish-attestation-contract.mjs';

const INPUT_FIELDS = Object.freeze(['draft', 'attestation', 'trustRoot', 'context']);
const ATTESTATION_FIELDS = Object.freeze([
  'schemaVersion',
  'artifactSha256',
  'writerRef',
  'auditorRef',
  'publisherRef',
  'siteId',
  'scopeId',
  'policyVersion',
  'issuedAt',
  'expiresAt',
  'nonce',
  'idempotencyKey',
  'auditorAttestationRef',
  'keyFingerprint',
  'signatureBase64',
]);
const TRUST_ROOT_FIELDS = Object.freeze([
  'schemaVersion',
  'auditorRef',
  'publicKeySpkiDerBase64',
  'publicKeySha256',
  'allowedSiteId',
  'allowedScopeId',
  'allowedPolicyVersion',
  'validFrom',
  'validUntil',
]);
const REFERENCE = /^[a-z][a-z0-9._:-]{0,191}$/;
const VERSION = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const SPKI_BASE64 = /^[A-Za-z0-9+/]{59}=$/;
const SIGNATURE_BASE64 = /^[A-Za-z0-9+/]{86}==$/;
const FORBIDDEN_AUTHORITY_FIELD = /(?:private|mdx|jsx|html|body|path|script|network|url|href|src|content|import|export|fetch|socket|approval|approved|reviewer|credential|secret|token|pem|jwk|raw)/i;

const LOCAL_AUDITOR_ATTESTATION_DENIAL_CODES = Object.freeze({
  OK: 'OK',
  INPUT_NOT_PLAIN_OBJECT: 'INPUT_NOT_PLAIN_OBJECT',
  UNKNOWN_INPUT_FIELD: 'UNKNOWN_INPUT_FIELD',
  ATTESTATION_NOT_PLAIN_OBJECT: 'ATTESTATION_NOT_PLAIN_OBJECT',
  TRUST_ROOT_NOT_PLAIN_OBJECT: 'TRUST_ROOT_NOT_PLAIN_OBJECT',
  UNKNOWN_ATTESTATION_FIELD: 'UNKNOWN_ATTESTATION_FIELD',
  UNKNOWN_TRUST_ROOT_FIELD: 'UNKNOWN_TRUST_ROOT_FIELD',
  FORBIDDEN_AUTHORITY_FIELD: 'FORBIDDEN_AUTHORITY_FIELD',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  UNSUPPORTED_ATTESTATION_SCHEMA: 'UNSUPPORTED_ATTESTATION_SCHEMA',
  UNSUPPORTED_TRUST_ROOT_SCHEMA: 'UNSUPPORTED_TRUST_ROOT_SCHEMA',
  DRAFT_HASH_MISMATCH: 'DRAFT_HASH_MISMATCH',
  WRITER_REF_MISMATCH: 'WRITER_REF_MISMATCH',
  ATTESTATION_CONTRACT_INVALID: 'ATTESTATION_CONTRACT_INVALID',
  TRUST_BINDING_MISMATCH: 'TRUST_BINDING_MISMATCH',
  TRUST_VALIDITY_WINDOW_INVALID: 'TRUST_VALIDITY_WINDOW_INVALID',
  TRUST_VALIDITY_MISMATCH: 'TRUST_VALIDITY_MISMATCH',
  PUBLIC_KEY_ENCODING_INVALID: 'PUBLIC_KEY_ENCODING_INVALID',
  PUBLIC_KEY_FINGERPRINT_MISMATCH: 'PUBLIC_KEY_FINGERPRINT_MISMATCH',
  PUBLIC_KEY_NOT_ED25519: 'PUBLIC_KEY_NOT_ED25519',
  SIGNATURE_ENCODING_INVALID: 'SIGNATURE_ENCODING_INVALID',
  SIGNATURE_INVALID: 'SIGNATURE_INVALID',
});

function result(code) {
  return Object.freeze({ ok: code === LOCAL_AUDITOR_ATTESTATION_DENIAL_CODES.OK, code });
}

function verifiedResult(attestation) {
  return Object.freeze({
    ok: true,
    code: LOCAL_AUDITOR_ATTESTATION_DENIAL_CODES.OK,
    verified: Object.freeze({
      artifactSha256: attestation.artifactSha256,
      writerRef: attestation.writerRef,
      auditorRef: attestation.auditorRef,
      publisherRef: attestation.publisherRef,
      siteId: attestation.siteId,
      scopeId: attestation.scopeId,
      policyVersion: attestation.policyVersion,
      issuedAt: attestation.issuedAt,
      expiresAt: attestation.expiresAt,
      nonce: attestation.nonce,
      idempotencyKey: attestation.idempotencyKey,
      auditorAttestationRef: attestation.auditorAttestationRef,
      keyFingerprint: attestation.keyFingerprint,
    }),
  });
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function fieldsCode(value, fields, unknownCode) {
  for (const field of Object.keys(value)) {
    if (!fields.includes(field)) {
      return FORBIDDEN_AUTHORITY_FIELD.test(field)
        ? LOCAL_AUDITOR_ATTESTATION_DENIAL_CODES.FORBIDDEN_AUTHORITY_FIELD
        : unknownCode;
    }
  }
  return fields.every((field) => Object.hasOwn(value, field))
    ? null
    : LOCAL_AUDITOR_ATTESTATION_DENIAL_CODES.MISSING_REQUIRED_FIELD;
}

function parseInstant(value) {
  if (typeof value !== 'string' || !ISO_INSTANT.test(value)) return Number.NaN;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value
    ? milliseconds
    : Number.NaN;
}

function isCanonicalBase64(value, expression, byteLength) {
  if (typeof value !== 'string' || !expression.test(value)) return false;
  const decoded = Buffer.from(value, 'base64');
  return decoded.length === byteLength && decoded.toString('base64') === value;
}

function attestationValuesAreValid(attestation) {
  const references = [
    attestation.writerRef,
    attestation.auditorRef,
    attestation.publisherRef,
    attestation.siteId,
    attestation.scopeId,
    attestation.nonce,
    attestation.idempotencyKey,
    attestation.auditorAttestationRef,
  ];
  return references.every((value) => typeof value === 'string' && REFERENCE.test(value))
    && typeof attestation.policyVersion === 'string'
    && VERSION.test(attestation.policyVersion)
    && SHA256.test(attestation.artifactSha256)
    && SHA256.test(attestation.keyFingerprint)
    && Number.isFinite(parseInstant(attestation.issuedAt))
    && Number.isFinite(parseInstant(attestation.expiresAt));
}

function trustRootValuesAreValid(trustRoot) {
  return typeof trustRoot.auditorRef === 'string'
    && REFERENCE.test(trustRoot.auditorRef)
    && typeof trustRoot.allowedSiteId === 'string'
    && REFERENCE.test(trustRoot.allowedSiteId)
    && typeof trustRoot.allowedScopeId === 'string'
    && REFERENCE.test(trustRoot.allowedScopeId)
    && typeof trustRoot.allowedPolicyVersion === 'string'
    && VERSION.test(trustRoot.allowedPolicyVersion)
    && SHA256.test(trustRoot.publicKeySha256)
    && Number.isFinite(parseInstant(trustRoot.validFrom))
    && Number.isFinite(parseInstant(trustRoot.validUntil));
}

function toPublishEnvelope(attestation) {
  return {
    schemaVersion: 'publish-attestation.v1',
    policyVersion: attestation.policyVersion,
    siteId: attestation.siteId,
    scopeId: attestation.scopeId,
    artifactSha256: attestation.artifactSha256,
    writerRef: attestation.writerRef,
    auditorRef: attestation.auditorRef,
    publisherRef: attestation.publisherRef,
    issuedAt: attestation.issuedAt,
    expiresAt: attestation.expiresAt,
    nonce: attestation.nonce,
    idempotencyKey: attestation.idempotencyKey,
    auditorAttestationRef: attestation.auditorAttestationRef,
  };
}

function signedBytes(attestation) {
  const payload = {
    artifactSha256: attestation.artifactSha256,
    auditorAttestationRef: attestation.auditorAttestationRef,
    auditorRef: attestation.auditorRef,
    expiresAt: attestation.expiresAt,
    idempotencyKey: attestation.idempotencyKey,
    issuedAt: attestation.issuedAt,
    nonce: attestation.nonce,
    policyVersion: attestation.policyVersion,
    publisherRef: attestation.publisherRef,
    scopeId: attestation.scopeId,
    siteId: attestation.siteId,
    writerRef: attestation.writerRef,
  };
  return Buffer.from(`KORUS-AI-WEB-V1/attestation.v1\n${JSON.stringify(payload)}`, 'utf8');
}

/**
 * Verifies a caller-injected Auditor attestation over the exact canonical 05A draft.
 * No identity is established for the logical Writer or Publisher references.
 *
 * @param {object} input Exact draft, attestation, trust-root, and context tuple.
 * @returns {Readonly<{ok: boolean, code: string, verified?: object}>}
 */
export function verifyLocalAuditorAttestation(input) {
  if (!isPlainObject(input)) return result(LOCAL_AUDITOR_ATTESTATION_DENIAL_CODES.INPUT_NOT_PLAIN_OBJECT);
  const inputFieldsCode = fieldsCode(
    input,
    INPUT_FIELDS,
    LOCAL_AUDITOR_ATTESTATION_DENIAL_CODES.UNKNOWN_INPUT_FIELD,
  );
  if (inputFieldsCode) return result(inputFieldsCode);

  if (!isPlainObject(input.attestation)) {
    return result(LOCAL_AUDITOR_ATTESTATION_DENIAL_CODES.ATTESTATION_NOT_PLAIN_OBJECT);
  }
  const attestationFieldsCode = fieldsCode(
    input.attestation,
    ATTESTATION_FIELDS,
    LOCAL_AUDITOR_ATTESTATION_DENIAL_CODES.UNKNOWN_ATTESTATION_FIELD,
  );
  if (attestationFieldsCode) return result(attestationFieldsCode);

  if (!isPlainObject(input.trustRoot)) {
    return result(LOCAL_AUDITOR_ATTESTATION_DENIAL_CODES.TRUST_ROOT_NOT_PLAIN_OBJECT);
  }
  const trustRootFieldsCode = fieldsCode(
    input.trustRoot,
    TRUST_ROOT_FIELDS,
    LOCAL_AUDITOR_ATTESTATION_DENIAL_CODES.UNKNOWN_TRUST_ROOT_FIELD,
  );
  if (trustRootFieldsCode) return result(trustRootFieldsCode);

  const { attestation, trustRoot, context } = input;
  if (attestation.schemaVersion !== 'auditor-attestation.v1') {
    return result(LOCAL_AUDITOR_ATTESTATION_DENIAL_CODES.UNSUPPORTED_ATTESTATION_SCHEMA);
  }
  if (trustRoot.schemaVersion !== 'auditor-trust-root.v1') {
    return result(LOCAL_AUDITOR_ATTESTATION_DENIAL_CODES.UNSUPPORTED_TRUST_ROOT_SCHEMA);
  }
  if (!attestationValuesAreValid(attestation)) {
    return result(LOCAL_AUDITOR_ATTESTATION_DENIAL_CODES.ATTESTATION_CONTRACT_INVALID);
  }
  if (!trustRootValuesAreValid(trustRoot)) {
    return result(LOCAL_AUDITOR_ATTESTATION_DENIAL_CODES.TRUST_BINDING_MISMATCH);
  }

  let canonicalDraft;
  try {
    canonicalDraft = canonicalizeLocalArticleDraft(input.draft);
  } catch {
    return result(LOCAL_AUDITOR_ATTESTATION_DENIAL_CODES.ATTESTATION_CONTRACT_INVALID);
  }
  if (attestation.artifactSha256 !== canonicalDraft.sha256) {
    return result(LOCAL_AUDITOR_ATTESTATION_DENIAL_CODES.DRAFT_HASH_MISMATCH);
  }
  if (attestation.writerRef !== input.draft.writerRef) {
    return result(LOCAL_AUDITOR_ATTESTATION_DENIAL_CODES.WRITER_REF_MISMATCH);
  }

  const publishValidation = validatePublishAttestationContract(toPublishEnvelope(attestation), context);
  if (!publishValidation.ok) return result(publishValidation.code);

  if (attestation.auditorRef !== trustRoot.auditorRef
    || attestation.siteId !== trustRoot.allowedSiteId
    || attestation.scopeId !== trustRoot.allowedScopeId
    || attestation.policyVersion !== trustRoot.allowedPolicyVersion) {
    return result(LOCAL_AUDITOR_ATTESTATION_DENIAL_CODES.TRUST_BINDING_MISMATCH);
  }

  const validFrom = parseInstant(trustRoot.validFrom);
  const validUntil = parseInstant(trustRoot.validUntil);
  const issuedAt = parseInstant(attestation.issuedAt);
  const expiresAt = parseInstant(attestation.expiresAt);
  if (validFrom > validUntil) {
    return result(LOCAL_AUDITOR_ATTESTATION_DENIAL_CODES.TRUST_VALIDITY_WINDOW_INVALID);
  }
  if (issuedAt < validFrom || expiresAt > validUntil) {
    return result(LOCAL_AUDITOR_ATTESTATION_DENIAL_CODES.TRUST_VALIDITY_MISMATCH);
  }

  if (!isCanonicalBase64(trustRoot.publicKeySpkiDerBase64, SPKI_BASE64, 44)) {
    return result(LOCAL_AUDITOR_ATTESTATION_DENIAL_CODES.PUBLIC_KEY_ENCODING_INVALID);
  }
  const publicKeyDer = Buffer.from(trustRoot.publicKeySpkiDerBase64, 'base64');
  const publicKeyFingerprint = createHash('sha256').update(publicKeyDer).digest('hex');
  if (trustRoot.publicKeySha256 !== publicKeyFingerprint
    || attestation.keyFingerprint !== publicKeyFingerprint) {
    return result(LOCAL_AUDITOR_ATTESTATION_DENIAL_CODES.PUBLIC_KEY_FINGERPRINT_MISMATCH);
  }

  let publicKey;
  try {
    publicKey = createPublicKey({ key: publicKeyDer, format: 'der', type: 'spki' });
  } catch {
    return result(LOCAL_AUDITOR_ATTESTATION_DENIAL_CODES.PUBLIC_KEY_ENCODING_INVALID);
  }
  if (publicKey.asymmetricKeyType !== 'ed25519') {
    return result(LOCAL_AUDITOR_ATTESTATION_DENIAL_CODES.PUBLIC_KEY_NOT_ED25519);
  }
  if (!publicKey.export({ format: 'der', type: 'spki' }).equals(publicKeyDer)) {
    return result(LOCAL_AUDITOR_ATTESTATION_DENIAL_CODES.PUBLIC_KEY_ENCODING_INVALID);
  }

  if (!isCanonicalBase64(attestation.signatureBase64, SIGNATURE_BASE64, 64)) {
    return result(LOCAL_AUDITOR_ATTESTATION_DENIAL_CODES.SIGNATURE_ENCODING_INVALID);
  }
  const signature = Buffer.from(attestation.signatureBase64, 'base64');
  if (!verify(null, signedBytes(attestation), publicKey, signature)) {
    return result(LOCAL_AUDITOR_ATTESTATION_DENIAL_CODES.SIGNATURE_INVALID);
  }
  return verifiedResult(attestation);
}
