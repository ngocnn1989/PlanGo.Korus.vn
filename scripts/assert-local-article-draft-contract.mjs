import { createHash } from 'node:crypto';

import { validateUiComponentManifest } from './assert-ui-component-manifest-contract.mjs';

const ROOT_FIELDS = Object.freeze([
  'schema',
  'siteId',
  'scopeId',
  'policyVersion',
  'writerRef',
  'lang',
  'article',
  'markdown',
  'uiManifest',
]);
const ARTICLE_FIELDS = Object.freeze([
  'id',
  'slug',
  'title',
  'description',
  'authorName',
  'publishedAt',
  'imageAssetRef',
]);

const KEBAB_IDENTIFIER = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ARTICLE_IDENTIFIER = /^[A-Za-z0-9_-]+$/;
const LANGUAGE_PRIMARY = /^[a-z]{2,3}$/;
const LANGUAGE_SCRIPT = /^[A-Z][a-z]{3}$/;
const LANGUAGE_REGION = /^(?:[A-Z]{2}|\d{3})$/;
const LANGUAGE_VARIANT = /^[a-z0-9]{4,8}$/;
const RFC3339_UTC_MILLISECONDS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const EXECUTABLE_OR_AUTHORITY = /(?:<\/?[A-Za-z!][^>]*>|\{\{?|\}\}?|^\s*(?:import|export)\s|\b(?:script|javascript|data|file|https?|ftp):|\b(?:fetch|xmlhttprequest|websocket)\s*\(|(?:^|[\s(])(?:\/\/|\/|\.\.?\/))/im;
const FORBIDDEN_FIELD = /(?:mdx|jsx|html|script|import|export|path|url|href|src|network|fetch|lead|publish|deploy|credential|secret|token)/i;

export const ARTICLE_DRAFT_DENIAL_CODES = Object.freeze({
  OK: 'OK',
  DRAFT_NOT_PLAIN_OBJECT: 'DRAFT_NOT_PLAIN_OBJECT',
  ARTICLE_NOT_PLAIN_OBJECT: 'ARTICLE_NOT_PLAIN_OBJECT',
  UNKNOWN_FIELD: 'UNKNOWN_FIELD',
  FORBIDDEN_AUTHORITY_FIELD: 'FORBIDDEN_AUTHORITY_FIELD',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  LANG_REQUIRED: 'LANG_REQUIRED',
  INVALID_LANG: 'INVALID_LANG',
  UNSUPPORTED_SCHEMA: 'UNSUPPORTED_SCHEMA',
  INVALID_IDENTIFIER: 'INVALID_IDENTIFIER',
  INVALID_ARTICLE_ID: 'INVALID_ARTICLE_ID',
  INVALID_TEXT: 'INVALID_TEXT',
  INVALID_PUBLISHED_AT: 'INVALID_PUBLISHED_AT',
  INVALID_MARKDOWN: 'INVALID_MARKDOWN',
  EXECUTABLE_OR_AUTHORITY_CONTENT: 'EXECUTABLE_OR_AUTHORITY_CONTENT',
  NON_NFC_STRING: 'NON_NFC_STRING',
  UNPAIRED_SURROGATE: 'UNPAIRED_SURROGATE',
  NON_FINITE_NUMBER: 'NON_FINITE_NUMBER',
  INVALID_JSON_VALUE: 'INVALID_JSON_VALUE',
  CYCLIC_VALUE: 'CYCLIC_VALUE',
  INVALID_UI_MANIFEST: 'INVALID_UI_MANIFEST',
});

function result(code) {
  return Object.freeze({ ok: code === ARTICLE_DRAFT_DENIAL_CODES.OK, code });
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function unknownFieldCode(field) {
  return FORBIDDEN_FIELD.test(field)
    ? ARTICLE_DRAFT_DENIAL_CODES.FORBIDDEN_AUTHORITY_FIELD
    : ARTICLE_DRAFT_DENIAL_CODES.UNKNOWN_FIELD;
}

function exactFields(value, fields) {
  for (const field of Object.keys(value)) {
    if (!fields.includes(field)) return unknownFieldCode(field);
  }
  return null;
}

function hasRequiredFields(value, fields) {
  return fields.every((field) => Object.hasOwn(value, field));
}

function hasUnpairedSurrogate(value) {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xD800 && unit <= 0xDBFF) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xDC00 && next <= 0xDFFF)) return true;
      index += 1;
    } else if (unit >= 0xDC00 && unit <= 0xDFFF) {
      return true;
    }
  }
  return false;
}

function validateJsonTree(value, ancestors = new Set()) {
  if (typeof value === 'string') {
    if (hasUnpairedSurrogate(value)) return ARTICLE_DRAFT_DENIAL_CODES.UNPAIRED_SURROGATE;
    return value.normalize('NFC') === value ? null : ARTICLE_DRAFT_DENIAL_CODES.NON_NFC_STRING;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? null : ARTICLE_DRAFT_DENIAL_CODES.NON_FINITE_NUMBER;
  }
  if (value === null || typeof value === 'boolean') return null;
  if (typeof value !== 'object' || !isPlainObject(value) && !Array.isArray(value)) {
    return ARTICLE_DRAFT_DENIAL_CODES.INVALID_JSON_VALUE;
  }
  if (ancestors.has(value)) return ARTICLE_DRAFT_DENIAL_CODES.CYCLIC_VALUE;
  ancestors.add(value);
  for (const item of Array.isArray(value) ? value : Object.values(value)) {
    const code = validateJsonTree(item, ancestors);
    if (code) return code;
  }
  ancestors.delete(value);
  return null;
}

function codePointLength(value) {
  return Array.from(value).length;
}

function isKebabIdentifier(value, maximum) {
  return typeof value === 'string'
    && codePointLength(value) >= 1
    && codePointLength(value) <= maximum
    && KEBAB_IDENTIFIER.test(value);
}

function validateText(value, maximum) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.includes('\n')
    || value.includes('\r') || codePointLength(value) > maximum) {
    return ARTICLE_DRAFT_DENIAL_CODES.INVALID_TEXT;
  }
  return EXECUTABLE_OR_AUTHORITY.test(value)
    ? ARTICLE_DRAFT_DENIAL_CODES.EXECUTABLE_OR_AUTHORITY_CONTENT
    : null;
}

function isCanonicalLanguage(value) {
  if (typeof value !== 'string') return false;
  const subtags = value.split('-');
  if (!LANGUAGE_PRIMARY.test(subtags[0])) return false;
  let index = 1;
  if (subtags[index]?.length === 4 && /^[A-Za-z]{4}$/.test(subtags[index])) {
    if (!LANGUAGE_SCRIPT.test(subtags[index])) return false;
    index += 1;
  }
  if (LANGUAGE_REGION.test(subtags[index] ?? '')) index += 1;
  return subtags.slice(index).every((subtag) => LANGUAGE_VARIANT.test(subtag));
}

function validatePublishedAt(value) {
  if (typeof value !== 'string' || !RFC3339_UTC_MILLISECONDS.test(value)) return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}

function validateMarkdown(value) {
  if (typeof value !== 'string' || codePointLength(value) < 1 || codePointLength(value) > 20000
    || value.includes('\r') || /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/.test(value)) {
    return ARTICLE_DRAFT_DENIAL_CODES.INVALID_MARKDOWN;
  }
  return EXECUTABLE_OR_AUTHORITY.test(value)
    ? ARTICLE_DRAFT_DENIAL_CODES.EXECUTABLE_OR_AUTHORITY_CONTENT
    : null;
}

function validateArticle(article) {
  if (!isPlainObject(article)) return ARTICLE_DRAFT_DENIAL_CODES.ARTICLE_NOT_PLAIN_OBJECT;
  const unknown = exactFields(article, ARTICLE_FIELDS);
  if (unknown) return unknown;
  if (!hasRequiredFields(article, ARTICLE_FIELDS)) return ARTICLE_DRAFT_DENIAL_CODES.MISSING_REQUIRED_FIELD;
  if (typeof article.id !== 'string' || codePointLength(article.id) < 1 || codePointLength(article.id) > 80
    || !ARTICLE_IDENTIFIER.test(article.id)) {
    return ARTICLE_DRAFT_DENIAL_CODES.INVALID_ARTICLE_ID;
  }
  if (!isKebabIdentifier(article.slug, 120) || !isKebabIdentifier(article.imageAssetRef, 64)) {
    return ARTICLE_DRAFT_DENIAL_CODES.INVALID_IDENTIFIER;
  }
  for (const [field, maximum] of [['title', 160], ['description', 320], ['authorName', 120]]) {
    const code = validateText(article[field], maximum);
    if (code) return code;
  }
  return validatePublishedAt(article.publishedAt)
    ? null
    : ARTICLE_DRAFT_DENIAL_CODES.INVALID_PUBLISHED_AT;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isPlainObject(value)) {
    const canonical = {};
    for (const key of Object.keys(value).sort()) canonical[key] = canonicalize(value[key]);
    return canonical;
  }
  return value;
}

export function validateLocalArticleDraft(draft) {
  if (!isPlainObject(draft)) return result(ARTICLE_DRAFT_DENIAL_CODES.DRAFT_NOT_PLAIN_OBJECT);
  const unknown = exactFields(draft, ROOT_FIELDS);
  if (unknown) return result(unknown);
  if (!Object.hasOwn(draft, 'lang')) return result(ARTICLE_DRAFT_DENIAL_CODES.LANG_REQUIRED);
  if (!hasRequiredFields(draft, ROOT_FIELDS)) return result(ARTICLE_DRAFT_DENIAL_CODES.MISSING_REQUIRED_FIELD);
  if (draft.schema !== 'article-draft.v1') return result(ARTICLE_DRAFT_DENIAL_CODES.UNSUPPORTED_SCHEMA);
  if (!isKebabIdentifier(draft.siteId, 64) || !isKebabIdentifier(draft.scopeId, 64)
    || !isKebabIdentifier(draft.policyVersion, 64) || !isKebabIdentifier(draft.writerRef, 64)) {
    return result(ARTICLE_DRAFT_DENIAL_CODES.INVALID_IDENTIFIER);
  }
  if (!isCanonicalLanguage(draft.lang)) return result(ARTICLE_DRAFT_DENIAL_CODES.INVALID_LANG);
  const treeCode = validateJsonTree(draft);
  if (treeCode) return result(treeCode);
  const articleCode = validateArticle(draft.article);
  if (articleCode) return result(articleCode);
  const markdownCode = validateMarkdown(draft.markdown);
  if (markdownCode) return result(markdownCode);
  if (draft.uiManifest !== null) {
    const manifest = validateUiComponentManifest(draft.uiManifest);
    if (!manifest.ok) return result(ARTICLE_DRAFT_DENIAL_CODES.INVALID_UI_MANIFEST);
  }
  return result(ARTICLE_DRAFT_DENIAL_CODES.OK);
}

export function canonicalizeLocalArticleDraft(draft) {
  const validation = validateLocalArticleDraft(draft);
  if (!validation.ok) {
    const error = new Error(validation.code);
    error.name = 'LocalArticleDraftContractError';
    error.code = validation.code;
    throw error;
  }
  const canonicalJson = JSON.stringify(canonicalize(draft));
  const sha256 = createHash('sha256').update(Buffer.from(canonicalJson, 'utf8')).digest('hex');
  return Object.freeze({ canonicalJson, sha256 });
}

export function assertLocalArticleDraft(draft) {
  const validation = validateLocalArticleDraft(draft);
  if (!validation.ok) {
    const error = new Error(validation.code);
    error.name = 'LocalArticleDraftContractError';
    error.code = validation.code;
    throw error;
  }
  return validation;
}
