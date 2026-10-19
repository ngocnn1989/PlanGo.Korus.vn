const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LANGUAGE_PATTERN = /^[a-z]{2,3}(?:-[A-Z]{2})?$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SAFE_ASSET_PATH_PATTERN = /^\/(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/;
const SAFE_VENDOR_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const THEME_TOKEN_PATTERN = /^#[0-9A-Fa-f]{6}$/;
const IMAGE_EXTENSION_PATTERN = /\.(?:svg|png|jpg|jpeg|webp)$/i;

function profileError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function requireRecord(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw profileError(code);
  }
}

function requireExactKeys(value, requiredKeys, code, optionalKeys = []) {
  requireRecord(value, code);
  const allowedKeys = new Set([...requiredKeys, ...optionalKeys]);

  if (Object.keys(value).length !== requiredKeys.length + optionalKeys.filter((key) => Object.hasOwn(value, key)).length) {
    throw profileError(code);
  }

  for (const key of requiredKeys) {
    if (!Object.hasOwn(value, key)) {
      throw profileError(code);
    }
  }

  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw profileError(code);
    }
  }
}

function requireExactOrderedKeys(value, requiredKeys, code) {
  requireExactKeys(value, requiredKeys, code);
  if (!requiredKeys.every((key, index) => Object.keys(value)[index] === key)) {
    throw profileError(code);
  }
}

function requireString(value, code, { allowEmpty = false, maxLength = 256 } = {}) {
  if (typeof value !== 'string' || value.length > maxLength || (!allowEmpty && value.trim().length === 0)) {
    throw profileError(code);
  }
}

function requireBoolean(value, code) {
  if (typeof value !== 'boolean') {
    throw profileError(code);
  }
}

function requireSlug(value, code) {
  requireString(value, code, { maxLength: 96 });
  if (!SLUG_PATTERN.test(value)) {
    throw profileError(code);
  }
}

function requireHttpsUrl(value, code, { allowEmpty = false } = {}) {
  requireString(value, code, { allowEmpty, maxLength: 2048 });
  if (allowEmpty && value === '') {
    return;
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash || parsed.search) {
      throw profileError(code);
    }
  } catch (error) {
    if (error?.code === code) {
      throw error;
    }
    throw profileError(code);
  }
}

function requireOptionalHttpsUrl(value, enabled, code) {
  requireHttpsUrl(value, code, { allowEmpty: !enabled });
  if (enabled && value === '') {
    throw profileError(code);
  }
}

function requireLocalAssetPath(value, code) {
  requireString(value, code, { maxLength: 512 });
  if (!SAFE_ASSET_PATH_PATTERN.test(value)) {
    throw profileError(code);
  }
}

function requireSafeRelativePath(value, code, { image = false, maxLength = 240 } = {}) {
  requireString(value, code, { maxLength });
  if (!/^\/(?:[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*\/?)?$/.test(value) || /[\s<:%\u0000-\u001F\u007F]/.test(value) || value.split('/').some((segment) => segment === '.' || segment === '..')) {
    throw profileError(code);
  }
  if (image && !IMAGE_EXTENSION_PATTERN.test(value)) {
    throw profileError(code);
  }
}

// Đường dẫn điều hướng được phép mang một fragment (#section) để trỏ tới một
// mục trên trang chủ. Giữ riêng khỏi requireSafeRelativePath vì hàm đó còn
// dùng cho đường dẫn ảnh và không được nới lỏng.
function requireSafeNavPath(value, code, { maxLength = 128 } = {}) {
  requireString(value, code, { maxLength });
  const REJECT = new RegExp('[\\s<:%\\u0000-\\u001F\\u007F]');
  if (!/^\/(?:[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*\/?)?(?:#[A-Za-z0-9._~-]+)?$/.test(value)
    || REJECT.test(value)
    || value.split('/').some((segment) => segment === '.' || segment === '..')) {
    throw profileError(code);
  }
}

function requireVendor(value, enabled, code) {
  requireString(value, code, { allowEmpty: !enabled, maxLength: 128 });
  if (value !== '' && !SAFE_VENDOR_PATTERN.test(value)) {
    throw profileError(code);
  }
}

function validateBrand(brand) {
  requireExactKeys(brand, ['name', 'slogan', 'logo_url', 'favicon_url'], 'PROFILE_SCHEMA_BRAND');
  requireString(brand.name, 'PROFILE_SCHEMA_BRAND_NAME', { maxLength: 160 });
  requireString(brand.slogan, 'PROFILE_SCHEMA_BRAND_SLOGAN', { maxLength: 320 });
  requireLocalAssetPath(brand.logo_url, 'PROFILE_SCHEMA_BRAND_LOGO_URL');
  requireLocalAssetPath(brand.favicon_url, 'PROFILE_SCHEMA_BRAND_FAVICON_URL');
}

function validateCompanyInfo(companyInfo) {
  requireExactKeys(companyInfo, ['working_hours'], 'PROFILE_SCHEMA_COMPANY_INFO');
  requireString(companyInfo.working_hours, 'PROFILE_SCHEMA_COMPANY_WORKING_HOURS', { maxLength: 320 });
}

function validateContact(contact) {
  requireExactKeys(contact, ['phone', 'email'], 'PROFILE_SCHEMA_CONTACT');
  requireExactKeys(contact.phone, ['display', 'raw', 'enabled'], 'PROFILE_SCHEMA_PHONE');
  requireString(contact.phone.display, 'PROFILE_SCHEMA_PHONE_DISPLAY', { allowEmpty: true, maxLength: 96 });
  requireString(contact.phone.raw, 'PROFILE_SCHEMA_PHONE_RAW', { allowEmpty: true, maxLength: 48 });
  requireBoolean(contact.phone.enabled, 'PROFILE_SCHEMA_PHONE_ENABLED');
  if (contact.phone.enabled && (contact.phone.display.trim() === '' || contact.phone.raw.trim() === '')) {
    throw profileError('PROFILE_SCHEMA_PHONE_ENABLED_VALUE');
  }

  requireExactKeys(contact.email, ['value', 'enabled'], 'PROFILE_SCHEMA_EMAIL');
  requireString(contact.email.value, 'PROFILE_SCHEMA_EMAIL_VALUE', { allowEmpty: true, maxLength: 254 });
  requireBoolean(contact.email.enabled, 'PROFILE_SCHEMA_EMAIL_ENABLED');
  if (contact.email.value !== '' && !EMAIL_PATTERN.test(contact.email.value)) {
    throw profileError('PROFILE_SCHEMA_EMAIL_VALUE');
  }
  if (contact.email.enabled && contact.email.value === '') {
    throw profileError('PROFILE_SCHEMA_EMAIL_ENABLED_VALUE');
  }
}

function validateSocialMedia(socialMedia) {
  requireExactKeys(socialMedia, ['linkedin', 'youtube', 'facebook', 'twitter'], 'PROFILE_SCHEMA_SOCIAL_MEDIA');
  for (const key of ['linkedin', 'youtube', 'facebook', 'twitter']) {
    requireHttpsUrl(socialMedia[key], `PROFILE_SCHEMA_SOCIAL_${key.toUpperCase()}`, { allowEmpty: true });
  }
}

function validateChatWidgets(chatWidgets) {
  requireExactKeys(chatWidgets, ['enabled', 'zalo', 'messenger', 'whatsapp', 'line', 'wechat', 'telegram'], 'PROFILE_SCHEMA_CHAT_WIDGETS');
  requireBoolean(chatWidgets.enabled, 'PROFILE_SCHEMA_CHAT_ENABLED');

  for (const key of ['zalo', 'messenger', 'whatsapp', 'line', 'telegram']) {
    const widget = chatWidgets[key];
    requireExactKeys(widget, ['enabled', 'url'], `PROFILE_SCHEMA_CHAT_${key.toUpperCase()}`);
    requireBoolean(widget.enabled, `PROFILE_SCHEMA_CHAT_${key.toUpperCase()}_ENABLED`);
    if (widget.enabled && !chatWidgets.enabled) {
      throw profileError('PROFILE_SCHEMA_CHAT_ENABLED_MISMATCH');
    }
    requireOptionalHttpsUrl(widget.url, widget.enabled, `PROFILE_SCHEMA_CHAT_${key.toUpperCase()}_URL`);
  }

  requireExactKeys(chatWidgets.wechat, ['enabled', 'qr_image_url', 'wechat_id'], 'PROFILE_SCHEMA_CHAT_WECHAT');
  requireBoolean(chatWidgets.wechat.enabled, 'PROFILE_SCHEMA_CHAT_WECHAT_ENABLED');
  if (chatWidgets.wechat.enabled && !chatWidgets.enabled) {
    throw profileError('PROFILE_SCHEMA_CHAT_ENABLED_MISMATCH');
  }
  requireString(chatWidgets.wechat.qr_image_url, 'PROFILE_SCHEMA_CHAT_WECHAT_QR_IMAGE_URL', { allowEmpty: true, maxLength: 512 });
  requireString(chatWidgets.wechat.wechat_id, 'PROFILE_SCHEMA_CHAT_WECHAT_ID', { allowEmpty: true, maxLength: 128 });
  if (chatWidgets.wechat.qr_image_url !== '') {
    requireLocalAssetPath(chatWidgets.wechat.qr_image_url, 'PROFILE_SCHEMA_CHAT_WECHAT_QR_IMAGE_URL');
  }
  if (chatWidgets.wechat.enabled && chatWidgets.wechat.wechat_id.trim() === '') {
    throw profileError('PROFILE_SCHEMA_CHAT_WECHAT_ENABLED_VALUE');
  }
}

function validateI18n(i18n) {
  requireExactKeys(i18n, ['enabled', 'default_lang', 'supported_langs'], 'PROFILE_SCHEMA_I18N');
  requireBoolean(i18n.enabled, 'PROFILE_SCHEMA_I18N_ENABLED');
  requireString(i18n.default_lang, 'PROFILE_SCHEMA_I18N_DEFAULT_LANG', { maxLength: 16 });
  if (!LANGUAGE_PATTERN.test(i18n.default_lang)) {
    throw profileError('PROFILE_SCHEMA_I18N_DEFAULT_LANG');
  }
  if (!Array.isArray(i18n.supported_langs) || i18n.supported_langs.length === 0 || i18n.supported_langs.length > 32) {
    throw profileError('PROFILE_SCHEMA_I18N_SUPPORTED_LANGS');
  }

  const languages = new Set();
  for (const language of i18n.supported_langs) {
    requireString(language, 'PROFILE_SCHEMA_I18N_SUPPORTED_LANGS', { maxLength: 16 });
    if (!LANGUAGE_PATTERN.test(language) || languages.has(language)) {
      throw profileError('PROFILE_SCHEMA_I18N_SUPPORTED_LANGS');
    }
    languages.add(language);
  }
  if (!languages.has(i18n.default_lang)) {
    throw profileError('PROFILE_SCHEMA_I18N_DEFAULT_NOT_SUPPORTED');
  }
  if (i18n.enabled || i18n.supported_langs.length !== 1 || i18n.supported_langs[0] !== i18n.default_lang) {
    throw profileError('PROFILE_SCHEMA_I18N_SINGLE_LOCALE');
  }
}

function validateNavigation(navigation) {
  requireExactKeys(navigation, ['primary', 'cta'], 'PROFILE_SCHEMA_NAVIGATION');
  if (!Array.isArray(navigation.primary) || navigation.primary.length < 1 || navigation.primary.length > 8) {
    throw profileError('PROFILE_SCHEMA_NAVIGATION_PRIMARY');
  }
  for (const item of navigation.primary) {
    requireExactKeys(item, ['label', 'path'], 'PROFILE_SCHEMA_NAVIGATION_PRIMARY_ITEM');
    requireString(item.label, 'PROFILE_SCHEMA_NAVIGATION_PRIMARY_LABEL', { maxLength: 80 });
    requireSafeNavPath(item.path, 'PROFILE_SCHEMA_NAVIGATION_PRIMARY_PATH', { maxLength: 128 });
  }
  requireExactKeys(navigation.cta, ['label', 'action'], 'PROFILE_SCHEMA_NAVIGATION_CTA');
  requireString(navigation.cta.label, 'PROFILE_SCHEMA_NAVIGATION_CTA_LABEL', { maxLength: 240 });
  if (navigation.cta.action !== 'lead_modal') {
    throw profileError('PROFILE_SCHEMA_NAVIGATION_CTA_ACTION');
  }
}

function validateCopyRecord(record, keys, code) {
  requireExactKeys(record, keys, code);
  for (const key of keys) {
    requireString(record[key], `${code}_${key.toUpperCase()}`, { maxLength: 240 });
  }
}

function requirePresentationString(value, code, maximumCodePoints) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.includes('\r') || value.includes('\n')
    || /[\u0000-\u001F\u007F-\u009F]/.test(value) || Array.from(value).length > maximumCodePoints) {
    throw profileError(code);
  }
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if ((unit >= 0xD800 && unit <= 0xDBFF && !((value.charCodeAt(index + 1) >= 0xDC00) && (value.charCodeAt(index + 1) <= 0xDFFF)))
      || (unit >= 0xDC00 && unit <= 0xDFFF)) {
      throw profileError(code);
    }
    if (unit >= 0xD800 && unit <= 0xDBFF) index += 1;
  }
}

function requireBoundedSafeInteger(value, code, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw profileError(code);
  }
}

function validateBlogListCopy(blogList) {
  requireExactOrderedKeys(blogList, ['title', 'description', 'read_more_label'], 'PROFILE_SCHEMA_PAGE_COPY_BLOG_LIST_TITLE');
  requirePresentationString(blogList.title, 'PROFILE_SCHEMA_PAGE_COPY_BLOG_LIST_TITLE', 120);
  requirePresentationString(blogList.description, 'PROFILE_SCHEMA_PAGE_COPY_BLOG_LIST_DESCRIPTION', 480);
  requirePresentationString(blogList.read_more_label, 'PROFILE_SCHEMA_PAGE_COPY_BLOG_LIST_READ_MORE_LABEL', 120);
}

function validateRoiDefaults(roiDefaults) {
  requireExactOrderedKeys(roiDefaults, ['welders_default', 'salary_default', 'robot_cost'], 'PROFILE_SCHEMA_PAGE_COPY_ROI_DEFAULTS_WELDERS_DEFAULT');
  requireBoundedSafeInteger(roiDefaults.welders_default, 'PROFILE_SCHEMA_PAGE_COPY_ROI_DEFAULTS_WELDERS_DEFAULT', 1, 100000);
  requireBoundedSafeInteger(roiDefaults.salary_default, 'PROFILE_SCHEMA_PAGE_COPY_ROI_DEFAULTS_SALARY_DEFAULT', 0, 1000000000);
  requireBoundedSafeInteger(roiDefaults.robot_cost, 'PROFILE_SCHEMA_PAGE_COPY_ROI_DEFAULTS_ROBOT_COST', 0, 1000000000000);
}

function validateLeadModalCopy(leadModal) {
  requireExactOrderedKeys(leadModal, ['title', 'description', 'name_label', 'phone_label', 'message_label', 'submit_label'], 'PROFILE_SCHEMA_PAGE_COPY_LEAD_MODAL_TITLE');
  requirePresentationString(leadModal.title, 'PROFILE_SCHEMA_PAGE_COPY_LEAD_MODAL_TITLE', 120);
  requirePresentationString(leadModal.description, 'PROFILE_SCHEMA_PAGE_COPY_LEAD_MODAL_DESCRIPTION', 480);
  for (const key of ['name_label', 'phone_label', 'message_label', 'submit_label']) {
    requirePresentationString(leadModal[key], `PROFILE_SCHEMA_PAGE_COPY_LEAD_MODAL_${key.toUpperCase()}`, 120);
  }
}

function validatePageCopy(pageCopy) {
  requireExactKeys(pageCopy, ['header', 'footer', 'home', 'roi', 'errors', 'blog_list', 'roi_defaults', 'lead_modal'], 'PROFILE_SCHEMA_PAGE_COPY');
  validateCopyRecord(pageCopy.header, ['brand_suffix', 'cta_label'], 'PROFILE_SCHEMA_PAGE_COPY_HEADER');
  validateCopyRecord(pageCopy.footer, ['products_heading', 'quick_links_heading', 'contact_heading', 'hours_label', 'phone_label', 'email_label', 'copyright'], 'PROFILE_SCHEMA_PAGE_COPY_FOOTER');
  validateCopyRecord(pageCopy.home, ['title', 'description', 'hero_headline', 'hero_body', 'hero_cta', 'hero_image_alt', 'hero_image_src'], 'PROFILE_SCHEMA_PAGE_COPY_HOME');
  requireSafeRelativePath(pageCopy.home.hero_image_src, 'PROFILE_SCHEMA_PAGE_COPY_HOME_HERO_IMAGE_SRC', { image: true, maxLength: 128 });
  validateCopyRecord(pageCopy.roi, ['title', 'description', 'welders_label', 'salary_label', 'calculate_label', 'result_label', 'months_label', 'savings_label', 'quote_label', 'placeholder'], 'PROFILE_SCHEMA_PAGE_COPY_ROI');
  validateCopyRecord(pageCopy.errors, ['not_found_title', 'not_found_heading', 'not_found_body', 'home_label', 'server_title', 'server_heading', 'server_body', 'retry_label'], 'PROFILE_SCHEMA_PAGE_COPY_ERRORS');
  validateBlogListCopy(pageCopy.blog_list);
  validateRoiDefaults(pageCopy.roi_defaults);
  validateLeadModalCopy(pageCopy.lead_modal);
}

function validateSurface(surface) {
  requireExactKeys(surface, ['design_system_enabled', 'proof_page_count'], 'PROFILE_SCHEMA_SURFACE');
  requireBoolean(surface.design_system_enabled, 'PROFILE_SCHEMA_SURFACE_DESIGN_SYSTEM_ENABLED');
  if (!Number.isInteger(surface.proof_page_count) || surface.proof_page_count < 0 || surface.proof_page_count > 20) {
    throw profileError('PROFILE_SCHEMA_SURFACE_PROOF_PAGE_COUNT');
  }
  if (!surface.design_system_enabled && surface.proof_page_count !== 0) {
    throw profileError('PROFILE_SCHEMA_SURFACE_DISABLED_PROOF_COUNT');
  }
}

function validateThemeTokens(themeTokens) {
  const tokenKeys = ['brand_1', 'brand_2', 'brand_3', 'brand_4', 'brand_5', 'brand_6', 'brand_7', 'brand_8', 'brand_9', 'brand_10'];
  requireExactKeys(themeTokens, tokenKeys, 'PROFILE_SCHEMA_THEME_TOKENS');
  for (const key of tokenKeys) {
    requireString(themeTokens[key], `PROFILE_SCHEMA_THEME_${key.toUpperCase()}`, { maxLength: 7 });
    if (!THEME_TOKEN_PATTERN.test(themeTokens[key])) {
      throw profileError(`PROFILE_SCHEMA_THEME_${key.toUpperCase()}`);
    }
  }
}

function validateLead(lead) {
  requireExactKeys(lead, ['enabled', 'destination'], 'PROFILE_SCHEMA_LEAD', ['turnstile_site_key']);
  requireBoolean(lead.enabled, 'PROFILE_SCHEMA_LEAD_ENABLED');
  requireOptionalHttpsUrl(lead.destination, lead.enabled, 'PROFILE_SCHEMA_LEAD_DESTINATION');
  if (Object.hasOwn(lead, 'turnstile_site_key')) {
    requireString(lead.turnstile_site_key, 'PROFILE_SCHEMA_LEAD_TURNSTILE_SITE_KEY', { allowEmpty: true, maxLength: 256 });
  }
}

function validateVendorConfiguration(configuration, key) {
  requireExactKeys(configuration, ['enabled', 'vendor'], `PROFILE_SCHEMA_${key}`);
  requireBoolean(configuration.enabled, `PROFILE_SCHEMA_${key}_ENABLED`);
  requireVendor(configuration.vendor, configuration.enabled, `PROFILE_SCHEMA_${key}_VENDOR`);
}

function requireConsentLabel(value, code) {
  requireString(value, code, { maxLength: 960 });
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if ((unit >= 0xD800 && unit <= 0xDBFF && !((value.charCodeAt(index + 1) >= 0xDC00) && (value.charCodeAt(index + 1) <= 0xDFFF)))
      || (unit >= 0xDC00 && unit <= 0xDFFF)) {
      throw profileError(code);
    }
    if (unit >= 0xD800 && unit <= 0xDBFF) index += 1;
  }
  if (Array.from(value).length > 240 || /[\u0000-\u001F\u007F-\u009F]/.test(value)) {
    throw profileError(code);
  }
}

function validateConsentConfiguration(consent) {
  requireExactKeys(consent, ['enabled', 'vendor', 'ui'], 'PROFILE_SCHEMA_CONSENT');
  requireBoolean(consent.enabled, 'PROFILE_SCHEMA_CONSENT_ENABLED');
  requireVendor(consent.vendor, consent.enabled, 'PROFILE_SCHEMA_CONSENT_VENDOR');
  if (!consent.enabled) {
    if (consent.ui !== null) throw profileError('PROFILE_SCHEMA_CONSENT_UI_DISABLED');
    return;
  }
  requireExactKeys(consent.ui, ['title', 'description', 'accept_label', 'reject_label', 'revoke_label', 'grant_ttl_ms'], 'PROFILE_SCHEMA_CONSENT_UI');
  for (const field of ['title', 'description', 'accept_label', 'reject_label', 'revoke_label']) {
    requireConsentLabel(consent.ui[field], `PROFILE_SCHEMA_CONSENT_UI_${field.toUpperCase()}`);
  }
  if (!Number.isSafeInteger(consent.ui.grant_ttl_ms) || consent.ui.grant_ttl_ms <= 0) {
    throw profileError('PROFILE_SCHEMA_CONSENT_UI_GRANT_TTL_MS');
  }
}

export function assertSiteProfile(profile) {
  requireExactKeys(profile, ['id', 'canonical_origin', 'theme_id', 'brand', 'company_info', 'contact', 'social_media', 'chat_widgets', 'i18n', 'lead', 'tracking', 'consent', 'navigation', 'surface', 'page_copy', 'theme_tokens'], 'PROFILE_SCHEMA_ROOT', ['indexable']);
  requireSlug(profile.id, 'PROFILE_SCHEMA_ID');
  requireHttpsUrl(profile.canonical_origin, 'PROFILE_SCHEMA_CANONICAL_ORIGIN');
  requireSlug(profile.theme_id, 'PROFILE_SCHEMA_THEME_ID');
  if (Object.hasOwn(profile, 'indexable')) requireBoolean(profile.indexable, 'PROFILE_SCHEMA_INDEXABLE');
  validateBrand(profile.brand);
  validateCompanyInfo(profile.company_info);
  validateContact(profile.contact);
  validateSocialMedia(profile.social_media);
  validateChatWidgets(profile.chat_widgets);
  validateI18n(profile.i18n);
  validateNavigation(profile.navigation);
  validateSurface(profile.surface);
  validatePageCopy(profile.page_copy);
  validateThemeTokens(profile.theme_tokens);
  validateLead(profile.lead);
  validateVendorConfiguration(profile.tracking, 'TRACKING');
  validateConsentConfiguration(profile.consent);
  if (profile.tracking.enabled && !profile.consent.enabled) {
    throw profileError('PROFILE_SCHEMA_TRACKING_CONSENT_REQUIRED');
  }
  return profile;
}
