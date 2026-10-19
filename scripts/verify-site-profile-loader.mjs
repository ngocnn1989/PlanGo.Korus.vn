import assert from 'node:assert/strict';
import { lstat, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SITE_PROFILE_VIRTUAL_ID,
  SITE_PROFILE_RESOLVED_VIRTUAL_ID,
  createSiteProfileVirtualPlugin,
  loadSiteProfile,
} from '../src/config/site-profile.loader.mjs';

const scriptDirectory = fileURLToPath(new URL('.', import.meta.url));
const temporaryRoot = await mkdtemp(join(tmpdir(), 'vnj-profile-json-'));
const stagingProfile = JSON.parse(
  await readFile(join(scriptDirectory, '../src/config/profiles/staging.json'), 'utf8'),
);

function validProfile(id) {
  return {
    ...stagingProfile,
    id,
    canonical_origin: `https://${id}.framework-ci.invalid`,
    theme_id: `framework-ci-${id}`,
  };
}

function profileWithPresentationMutation(id, mutate) {
  const profile = JSON.parse(JSON.stringify(validProfile(id)));
  mutate(profile.page_copy);
  return profile;
}

async function writeJson(id, profile = validProfile(id), prefix = '') {
  await writeFile(join(temporaryRoot, `${id}.json`), `${prefix}${JSON.stringify(profile)}`, 'utf8');
}

async function expectCode(action, code) {
  await assert.rejects(action, new RegExp(`^Error: ${code}$`));
}

try {
  const loadedStaging = await loadSiteProfile({ selectedProfileId: 'staging' });
  assert.deepEqual(loadedStaging, stagingProfile, 'staging JSON must load without changing values');
  assert.deepEqual(loadedStaging.page_copy.blog_list, {
    title: 'Preview News',
    description: 'Generic staging updates and preview content.',
    read_more_label: 'Read more',
  });
  assert.deepEqual(loadedStaging.page_copy.roi_defaults, {
    welders_default: 1,
    salary_default: 0,
    robot_cost: 0,
  });
  assert.deepEqual(loadedStaging.page_copy.lead_modal, {
    title: 'Preview request',
    description: 'Generic staging preview form.',
    name_label: 'Name',
    phone_label: 'Phone',
    message_label: 'Message',
    submit_label: 'Submit',
  });
  assert.equal(loadedStaging.lead.enabled, false, 'staging lead must remain disabled');
  assert.equal(loadedStaging.lead.destination, '', 'staging lead destination must remain empty');
  assert.deepEqual(loadedStaging.tracking, { enabled: false, vendor: '' }, 'staging tracking must remain disabled');
  assert.deepEqual(loadedStaging.consent, { enabled: false, vendor: '', ui: null }, 'staging consent must remain disabled');

  await writeJson('valid');
  assert.equal((await loadSiteProfile({ profilesDirectory: temporaryRoot, selectedProfileId: 'valid' })).id, 'valid');

  await expectCode(
    () => loadSiteProfile({ profilesDirectory: temporaryRoot, selectedProfileId: 'missing' }),
    'SITE_PROFILE_UNKNOWN',
  );
  await expectCode(
    () => loadSiteProfile({ profilesDirectory: temporaryRoot, selectedProfileId: '../outside' }),
    'SITE_PROFILE_TRAVERSAL',
  );

  await writeFile(join(temporaryRoot, 'malformed.json'), '{', 'utf8');
  await expectCode(
    () => loadSiteProfile({ profilesDirectory: temporaryRoot, selectedProfileId: 'malformed' }),
    'SITE_PROFILE_JSON_MALFORMED',
  );

  await writeJson('bom', validProfile('bom'), '\uFEFF');
  await expectCode(
    () => loadSiteProfile({ profilesDirectory: temporaryRoot, selectedProfileId: 'bom' }),
    'SITE_PROFILE_JSON_BOM_DENIED',
  );

  await writeFile(join(temporaryRoot, 'legacy.mjs'), 'throw new Error("must not execute");', 'utf8');
  await expectCode(
    () => loadSiteProfile({ profilesDirectory: temporaryRoot, selectedProfileId: 'legacy' }),
    'SITE_PROFILE_LEGACY_MODULE_DENIED',
  );

  await writeJson('duplicate');
  await writeFile(join(temporaryRoot, 'duplicate.mjs'), 'throw new Error("must not execute");', 'utf8');
  await expectCode(
    () => loadSiteProfile({ profilesDirectory: temporaryRoot, selectedProfileId: 'duplicate' }),
    'SITE_PROFILE_DUPLICATE_FORMAT',
  );

  await writeJson('mismatch', validProfile('other'));
  await expectCode(
    () => loadSiteProfile({ profilesDirectory: temporaryRoot, selectedProfileId: 'mismatch' }),
    'SITE_PROFILE_ID_MISMATCH',
  );

  await writeJson('schema', { ...validProfile('schema'), unexpected: true });
  await expectCode(
    () => loadSiteProfile({ profilesDirectory: temporaryRoot, selectedProfileId: 'schema' }),
    'PROFILE_SCHEMA_ROOT',
  );

  const presentationDenials = [
    ['blog-list-title', (pageCopy) => { pageCopy.blog_list.title = '\n'; }, 'PROFILE_SCHEMA_PAGE_COPY_BLOG_LIST_TITLE'],
    ['blog-list-description', (pageCopy) => { pageCopy.blog_list.description = '\u0000'; }, 'PROFILE_SCHEMA_PAGE_COPY_BLOG_LIST_DESCRIPTION'],
    ['blog-list-read-more', (pageCopy) => { pageCopy.blog_list.read_more_label = '\uD800'; }, 'PROFILE_SCHEMA_PAGE_COPY_BLOG_LIST_READ_MORE_LABEL'],
    ['roi-welders', (pageCopy) => { pageCopy.roi_defaults.welders_default = 0; }, 'PROFILE_SCHEMA_PAGE_COPY_ROI_DEFAULTS_WELDERS_DEFAULT'],
    ['roi-salary', (pageCopy) => { pageCopy.roi_defaults.salary_default = -1; }, 'PROFILE_SCHEMA_PAGE_COPY_ROI_DEFAULTS_SALARY_DEFAULT'],
    ['roi-robot-cost', (pageCopy) => { pageCopy.roi_defaults.robot_cost = 1000000000001; }, 'PROFILE_SCHEMA_PAGE_COPY_ROI_DEFAULTS_ROBOT_COST'],
    ['lead-modal-title', (pageCopy) => { pageCopy.lead_modal.title = '\n'; }, 'PROFILE_SCHEMA_PAGE_COPY_LEAD_MODAL_TITLE'],
    ['lead-modal-description', (pageCopy) => { pageCopy.lead_modal.description = '\u0000'; }, 'PROFILE_SCHEMA_PAGE_COPY_LEAD_MODAL_DESCRIPTION'],
    ['lead-modal-name', (pageCopy) => { pageCopy.lead_modal.name_label = '\uD800'; }, 'PROFILE_SCHEMA_PAGE_COPY_LEAD_MODAL_NAME_LABEL'],
    ['lead-modal-phone', (pageCopy) => { pageCopy.lead_modal.phone_label = '\n'; }, 'PROFILE_SCHEMA_PAGE_COPY_LEAD_MODAL_PHONE_LABEL'],
    ['lead-modal-message', (pageCopy) => { pageCopy.lead_modal.message_label = '\u0000'; }, 'PROFILE_SCHEMA_PAGE_COPY_LEAD_MODAL_MESSAGE_LABEL'],
    ['lead-modal-submit', (pageCopy) => { pageCopy.lead_modal.submit_label = '\uD800'; }, 'PROFILE_SCHEMA_PAGE_COPY_LEAD_MODAL_SUBMIT_LABEL'],
  ];
  for (const [id, mutate, code] of presentationDenials) {
    await writeJson(id, profileWithPresentationMutation(id, mutate));
    await expectCode(
      () => loadSiteProfile({ profilesDirectory: temporaryRoot, selectedProfileId: id }),
      code,
    );
  }

  await writeJson('case');
  await expectCode(
    () => loadSiteProfile({
      profilesDirectory: temporaryRoot,
      selectedProfileId: 'case',
      readDirectory: async () => ['case.json', 'CASE.json'],
    }),
    'SITE_PROFILE_FILENAME_CASE_COLLISION',
  );

  await writeFile(join(temporaryRoot, 'array.json'), '[]', 'utf8');
  await expectCode(
    () => loadSiteProfile({ profilesDirectory: temporaryRoot, selectedProfileId: 'array' }),
    'SITE_PROFILE_JSON_NOT_PLAIN',
  );

  await writeJson('linked');
  await expectCode(
    () => loadSiteProfile({
      profilesDirectory: temporaryRoot,
      selectedProfileId: 'linked',
      statPath: async (candidate) => candidate.endsWith('linked.json')
        ? { isSymbolicLink: () => true, isFile: () => false, isDirectory: () => false, size: 0 }
        : lstat(candidate),
    }),
    'SITE_PROFILE_SYMLINK_DENIED',
  );

  await writeJson('escape');
  await expectCode(
    () => loadSiteProfile({
      profilesDirectory: temporaryRoot,
      selectedProfileId: 'escape',
      readRealPath: async (candidate) => candidate === temporaryRoot
        ? temporaryRoot
        : join(tmpdir(), 'outside-profile.json'),
    }),
    'SITE_PROFILE_PATH_ESCAPE',
  );

  const virtualPlugin = createSiteProfileVirtualPlugin(loadedStaging);
  assert.equal(virtualPlugin.resolveId(SITE_PROFILE_VIRTUAL_ID), SITE_PROFILE_RESOLVED_VIRTUAL_ID);
  assert.equal(virtualPlugin.resolveId('not-virtual'), null);
  assert.equal(
    virtualPlugin.load(SITE_PROFILE_RESOLVED_VIRTUAL_ID),
    `export default ${JSON.stringify(loadedStaging)};`,
  );
  assert.equal(virtualPlugin.load('not-virtual'), null);
  const escapedVirtualSource = createSiteProfileVirtualPlugin({
    ...loadedStaging,
    brand: { ...loadedStaging.brand, name: '<preview>' },
  }).load(SITE_PROFILE_RESOLVED_VIRTUAL_ID);
  assert.match(escapedVirtualSource, /\\u003cpreview>/);
  assert.doesNotMatch(escapedVirtualSource, /<preview>/);

  const loaderSource = await readFile(join(scriptDirectory, '../src/config/site-profile.loader.mjs'), 'utf8');
  assert.doesNotMatch(loaderSource, /import\s*\(/, 'profiles must not be dynamically imported');
  assert.doesNotMatch(loaderSource, /pathToFileURL/, 'profiles must not be converted for evaluation');

  // Các khẳng định về src/pages/blog/[...page].astro đã được gỡ: route blog
  // chưa từng tồn tại trong bất kỳ commit nào của repo này (nó là tàn dư từ
  // monorepo gốc). Verifier trước đây luôn FAIL với ENOENT tại chỗ này.
  const [indexSource, leadModalSource] = await Promise.all([
    readFile(join(scriptDirectory, '../src/pages/index.astro'), 'utf8'),
    readFile(join(scriptDirectory, '../src/components/global/LeadModal.astro'), 'utf8'),
  ]);
  // Trang chủ phải lấy tiêu đề/mô tả từ profile, không đóng cứng trong markup.
  assert.match(indexSource, /siteProfile\.page_copy/);
  // ROI calculator đã bị gỡ khỏi sản phẩm (quyết định owner 2026-09-10: landing
  // một sản phẩm, không hiển thị số hoàn vốn giả định). Bốn khẳng định cũ khoá
  // cứng cách nối dây RoiCalculator nên chặn vĩnh viễn sau khi gỡ. Thay bằng
  // khẳng định ngược: trang không được tái xuất hiện ROI với số đóng cứng.
  assert.doesNotMatch(indexSource, /weldersDefault=|salaryDefault=|robotCost=/);
  assert.doesNotMatch(indexSource, /RoiCalculator/);
  assert.match(leadModalSource, /const \{ lead_modal: leadModal \} = siteProfile\.page_copy/);
  for (const field of ['title', 'description', 'name_label', 'phone_label', 'message_label', 'submit_label']) {
    assert.match(leadModalSource, new RegExp(`\\{leadModal\\.${field}\\}`));
  }
  assert.match(leadModalSource, /import \{ resolveRuntimeLeadActivation \} from '\.\.\/\.\.\/config\/runtime-lead-activation\.mjs';/);
  assert.match(leadModalSource, /const leadResolution = resolveRuntimeLeadActivation\(/);
  assert.match(leadModalSource, /if \(!leadResolution\.ok && leadResolution\.code !== 'lead_disabled'\) throw new Error\(leadResolution\.code\);/);
  assert.match(leadModalSource, /const leadEnabled = leadResolution\.enabled;/);
  assert.doesNotMatch(leadModalSource, /const leadEnabled = siteProfile\.lead\.enabled;/);
  // PlanGo 19/10/2026: popup luôn dựng; cờ data-lead-enabled quyết định gửi API hay hiện hotline/Zalo.
  assert.match(leadModalSource, /data-lead-enabled=\{String\(leadEnabled\)\}/);
  assert.match(leadModalSource, /form\.dataset\.leadEnabled !== "true"/);
  assert.match(leadModalSource, /fetch\('\/api\/leads'/);
  assert.match(leadModalSource, /if\(result\.success\)/);
  assert.match(leadModalSource, /typeof result\.code === 'string'/);
  assert.match(leadModalSource, /trackConversion\('submit_success'/);

  console.log('verify-site-profile-loader: PASS (15 JSON/virtual cases + 12 presentation denials)');
} catch (error) {
  console.error(`verify-site-profile-loader: FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
