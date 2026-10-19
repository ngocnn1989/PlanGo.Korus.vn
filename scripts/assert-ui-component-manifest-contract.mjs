const ROOT_FIELDS = Object.freeze(['schema', 'siteId', 'pageId', 'tokens', 'components']);
const COMPONENT_FIELDS = Object.freeze(['id', 'props']);
const BREADCRUMB_PROP_FIELDS = Object.freeze(['segments']);
const ROI_PROP_FIELDS = Object.freeze([
  'title',
  'description',
  'weldersLabel',
  'salaryLabel',
  'calculateLabel',
  'resultLabel',
  'monthsLabel',
  'savingsLabel',
  'quoteLabel',
  'placeholder',
  'showLeadCta',
  'weldersDefault',
  'salaryDefault',
  'robotCost',
]);
const ALLOWED_COMPONENTS = new Set(['breadcrumbs', 'roi-calculator']);
const ALLOWED_TOKENS = new Set(Array.from({ length: 10 }, (_, index) => `brand-${index + 1}`));
const TEXT_PROPS = new Set([
  'title',
  'description',
  'weldersLabel',
  'salaryLabel',
  'calculateLabel',
  'resultLabel',
  'monthsLabel',
  'savingsLabel',
  'quoteLabel',
  'placeholder',
]);

const IDENTIFIER = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const INTERNAL_PATH = /^\/(?:[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*)?\/?$/;
const EXECUTABLE_CONTENT = /[<>{}`]|\b(?:html|jsx|mdx|script|import|export|javascript|data|file|https?)\b/i;
const FORBIDDEN_AUTHORITY_FIELD = /(?:lead|publish|deploy|credential|secret|token|url|href|src|path|action|handler|class|style|source)/i;
const EXECUTABLE_FIELD = /(?:html|jsx|mdx|script|import|export)/i;

export const UI_MANIFEST_DENIAL_CODES = Object.freeze({
  OK: 'OK',
  MANIFEST_NOT_PLAIN_OBJECT: 'MANIFEST_NOT_PLAIN_OBJECT',
  UNKNOWN_MANIFEST_FIELD: 'UNKNOWN_MANIFEST_FIELD',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  UNSUPPORTED_MANIFEST_VERSION: 'UNSUPPORTED_MANIFEST_VERSION',
  INVALID_IDENTIFIER: 'INVALID_IDENTIFIER',
  INVALID_TOKEN_LIST: 'INVALID_TOKEN_LIST',
  DUPLICATE_TOKEN: 'DUPLICATE_TOKEN',
  DISALLOWED_TOKEN: 'DISALLOWED_TOKEN',
  INVALID_COMPONENT_LIST: 'INVALID_COMPONENT_LIST',
  INVALID_COMPONENT_RECORD: 'INVALID_COMPONENT_RECORD',
  UNKNOWN_COMPONENT_FIELD: 'UNKNOWN_COMPONENT_FIELD',
  DUPLICATE_COMPONENT_ID: 'DUPLICATE_COMPONENT_ID',
  DISALLOWED_COMPONENT: 'DISALLOWED_COMPONENT',
  INVALID_PROPS: 'INVALID_PROPS',
  DISALLOWED_PROP: 'DISALLOWED_PROP',
  INVALID_SEGMENTS: 'INVALID_SEGMENTS',
  INVALID_BREADCRUMB_SEGMENT: 'INVALID_BREADCRUMB_SEGMENT',
  INVALID_INTERNAL_PATH: 'INVALID_INTERNAL_PATH',
  INVALID_TEXT_VALUE: 'INVALID_TEXT_VALUE',
  INVALID_NUMERIC_RANGE: 'INVALID_NUMERIC_RANGE',
  LEAD_CTA_FORBIDDEN: 'LEAD_CTA_FORBIDDEN',
  EXECUTABLE_CONTENT: 'EXECUTABLE_CONTENT',
  FORBIDDEN_AUTHORITY_FIELD: 'FORBIDDEN_AUTHORITY_FIELD',
});

function result(code) {
  return Object.freeze({ ok: code === UI_MANIFEST_DENIAL_CODES.OK, code });
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function unknownFieldCode(field, fallback) {
  if (EXECUTABLE_FIELD.test(field)) {
    return UI_MANIFEST_DENIAL_CODES.EXECUTABLE_CONTENT;
  }
  if (FORBIDDEN_AUTHORITY_FIELD.test(field)) {
    return UI_MANIFEST_DENIAL_CODES.FORBIDDEN_AUTHORITY_FIELD;
  }
  return fallback;
}

function exactFields(value, allowedFields, unknownCode) {
  for (const field of Object.keys(value)) {
    if (!allowedFields.includes(field)) {
      return unknownFieldCode(field, unknownCode);
    }
  }
  return null;
}

function hasRequiredFields(value, fields) {
  return fields.every((field) => Object.hasOwn(value, field));
}

function isSafeIdentifier(value) {
  return typeof value === 'string' && value.length <= 96 && IDENTIFIER.test(value);
}

function isSafeText(value) {
  return typeof value === 'string'
    && value.trim().length > 0
    && value.length <= 240
    && !EXECUTABLE_CONTENT.test(value);
}

function validateTokens(tokens) {
  if (!Array.isArray(tokens) || tokens.length === 0 || tokens.length > ALLOWED_TOKENS.size) {
    return UI_MANIFEST_DENIAL_CODES.INVALID_TOKEN_LIST;
  }
  const seen = new Set();
  for (const token of tokens) {
    if (typeof token !== 'string') {
      return UI_MANIFEST_DENIAL_CODES.INVALID_TOKEN_LIST;
    }
    if (seen.has(token)) {
      return UI_MANIFEST_DENIAL_CODES.DUPLICATE_TOKEN;
    }
    if (!ALLOWED_TOKENS.has(token)) {
      return UI_MANIFEST_DENIAL_CODES.DISALLOWED_TOKEN;
    }
    seen.add(token);
  }
  return null;
}

function validateBreadcrumbs(props) {
  if (!isPlainObject(props)) {
    return UI_MANIFEST_DENIAL_CODES.INVALID_PROPS;
  }
  const unknown = exactFields(props, BREADCRUMB_PROP_FIELDS, UI_MANIFEST_DENIAL_CODES.DISALLOWED_PROP);
  if (unknown) return unknown;
  if (!hasRequiredFields(props, BREADCRUMB_PROP_FIELDS)
    || !Array.isArray(props.segments)
    || props.segments.length === 0
    || props.segments.length > 8) {
    return UI_MANIFEST_DENIAL_CODES.INVALID_SEGMENTS;
  }
  for (const segment of props.segments) {
    if (!isPlainObject(segment) || !hasRequiredFields(segment, ['label', 'path'])
      || exactFields(segment, ['label', 'path'], UI_MANIFEST_DENIAL_CODES.INVALID_BREADCRUMB_SEGMENT)) {
      return UI_MANIFEST_DENIAL_CODES.INVALID_BREADCRUMB_SEGMENT;
    }
    if (!isSafeText(segment.label)) {
      return UI_MANIFEST_DENIAL_CODES.INVALID_TEXT_VALUE;
    }
    if (typeof segment.path !== 'string' || !INTERNAL_PATH.test(segment.path)) {
      return UI_MANIFEST_DENIAL_CODES.INVALID_INTERNAL_PATH;
    }
  }
  return null;
}

function validateRoiCalculator(props) {
  if (!isPlainObject(props)) {
    return UI_MANIFEST_DENIAL_CODES.INVALID_PROPS;
  }
  const unknown = exactFields(props, ROI_PROP_FIELDS, UI_MANIFEST_DENIAL_CODES.DISALLOWED_PROP);
  if (unknown) return unknown;
  if (!Object.hasOwn(props, 'showLeadCta')) {
    return UI_MANIFEST_DENIAL_CODES.MISSING_REQUIRED_FIELD;
  }
  if (props.showLeadCta !== false) {
    return UI_MANIFEST_DENIAL_CODES.LEAD_CTA_FORBIDDEN;
  }
  for (const field of TEXT_PROPS) {
    if (Object.hasOwn(props, field) && !isSafeText(props[field])) {
      return UI_MANIFEST_DENIAL_CODES.INVALID_TEXT_VALUE;
    }
  }
  const numericRanges = {
    weldersDefault: [0, 10000],
    salaryDefault: [0, 1000000000],
    robotCost: [1, 1000000000000],
  };
  for (const [field, [minimum, maximum]] of Object.entries(numericRanges)) {
    if (Object.hasOwn(props, field)
      && (!Number.isSafeInteger(props[field]) || props[field] < minimum || props[field] > maximum)) {
      return UI_MANIFEST_DENIAL_CODES.INVALID_NUMERIC_RANGE;
    }
  }
  return null;
}

function validateComponents(components) {
  if (!Array.isArray(components) || components.length === 0 || components.length > ALLOWED_COMPONENTS.size) {
    return UI_MANIFEST_DENIAL_CODES.INVALID_COMPONENT_LIST;
  }
  const seen = new Set();
  for (const component of components) {
    if (!isPlainObject(component)) {
      return UI_MANIFEST_DENIAL_CODES.INVALID_COMPONENT_RECORD;
    }
    const unknown = exactFields(component, COMPONENT_FIELDS, UI_MANIFEST_DENIAL_CODES.UNKNOWN_COMPONENT_FIELD);
    if (unknown) return unknown;
    if (!hasRequiredFields(component, COMPONENT_FIELDS) || typeof component.id !== 'string') {
      return UI_MANIFEST_DENIAL_CODES.INVALID_COMPONENT_RECORD;
    }
    if (seen.has(component.id)) {
      return UI_MANIFEST_DENIAL_CODES.DUPLICATE_COMPONENT_ID;
    }
    if (!ALLOWED_COMPONENTS.has(component.id)) {
      return UI_MANIFEST_DENIAL_CODES.DISALLOWED_COMPONENT;
    }
    const propsCode = component.id === 'breadcrumbs'
      ? validateBreadcrumbs(component.props)
      : validateRoiCalculator(component.props);
    if (propsCode) return propsCode;
    seen.add(component.id);
  }
  return null;
}

export function validateUiComponentManifest(manifest) {
  if (!isPlainObject(manifest)) {
    return result(UI_MANIFEST_DENIAL_CODES.MANIFEST_NOT_PLAIN_OBJECT);
  }
  const unknown = exactFields(manifest, ROOT_FIELDS, UI_MANIFEST_DENIAL_CODES.UNKNOWN_MANIFEST_FIELD);
  if (unknown) return result(unknown);
  if (!hasRequiredFields(manifest, ROOT_FIELDS)) {
    return result(UI_MANIFEST_DENIAL_CODES.MISSING_REQUIRED_FIELD);
  }
  if (manifest.schema !== 'ui-manifest.v1') {
    return result(UI_MANIFEST_DENIAL_CODES.UNSUPPORTED_MANIFEST_VERSION);
  }
  if (!isSafeIdentifier(manifest.siteId) || !isSafeIdentifier(manifest.pageId)) {
    return result(UI_MANIFEST_DENIAL_CODES.INVALID_IDENTIFIER);
  }
  const tokenCode = validateTokens(manifest.tokens);
  if (tokenCode) return result(tokenCode);
  const componentCode = validateComponents(manifest.components);
  if (componentCode) return result(componentCode);
  return result(UI_MANIFEST_DENIAL_CODES.OK);
}

export function assertUiComponentManifest(manifest) {
  const validation = validateUiComponentManifest(manifest);
  if (!validation.ok) {
    const error = new Error(validation.code);
    error.name = 'UiComponentManifestContractError';
    error.code = validation.code;
    throw error;
  }
  return validation;
}
