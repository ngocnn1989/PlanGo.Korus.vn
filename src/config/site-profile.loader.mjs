import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSiteProfile } from './site-profile.schema.mjs';

export const SITE_PROFILE_VIRTUAL_ID = 'virtual:site-profile';
export const SITE_PROFILE_RESOLVED_VIRTUAL_ID = '\0virtual:site-profile';

const defaultProfilesDirectory = fileURLToPath(new URL('./profiles/', import.meta.url));
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_PROFILE_JSON_BYTES = 64 * 1024;

function loaderError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function isInsideDirectory(parentDirectory, candidatePath) {
  const pathDifference = relative(parentDirectory, candidatePath);
  return pathDifference !== '' && !pathDifference.startsWith('..') && !pathDifference.includes('..\\') && !pathDifference.includes('../');
}

function normalizeSelectedSlug(selectedProfileId) {
  if (typeof selectedProfileId !== 'string' || selectedProfileId.length === 0) {
    throw loaderError('SITE_PROFILE_MISSING');
  }
  if (selectedProfileId.includes('/') || selectedProfileId.includes('\\') || selectedProfileId.includes('..')) {
    throw loaderError('SITE_PROFILE_TRAVERSAL');
  }
  if (selectedProfileId !== selectedProfileId.toLowerCase()) {
    throw loaderError('SITE_PROFILE_CASE_COLLISION');
  }
  if (!slugPattern.test(selectedProfileId)) {
    throw loaderError('SITE_PROFILE_INVALID');
  }
  return selectedProfileId;
}

function assertNoFilenameCaseCollisions(filenames) {
  const lowerCaseNames = new Set();
  for (const filename of filenames) {
    const key = filename.toLowerCase();
    if (lowerCaseNames.has(key)) {
      throw loaderError('SITE_PROFILE_FILENAME_CASE_COLLISION');
    }
    lowerCaseNames.add(key);
  }
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function profileFilenames(filenames) {
  return filenames.filter((filename) => typeof filename === 'string' && /\.(?:json|mjs)$/i.test(filename));
}

function assertRealDirectory(stats) {
  if (stats.isSymbolicLink()) throw loaderError('SITE_PROFILE_SYMLINK_DENIED');
  if (!stats.isDirectory()) throw loaderError('SITE_PROFILE_DIRECTORY_UNAVAILABLE');
}

function assertRealRegularFile(stats) {
  if (stats.isSymbolicLink()) throw loaderError('SITE_PROFILE_SYMLINK_DENIED');
  if (!stats.isFile()) throw loaderError('SITE_PROFILE_UNKNOWN');
}

function serializeProfile(profile) {
  return JSON.stringify(profile)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export async function loadSiteProfile({
  profilesDirectory = defaultProfilesDirectory,
  selectedProfileId = process.env.SITE_PROFILE,
  readDirectory = readdir,
  readProfileFile = readFile,
  readRealPath = realpath,
  statPath = lstat,
} = {}) {
  const slug = normalizeSelectedSlug(selectedProfileId);
  const resolvedProfilesDirectory = resolve(profilesDirectory);
  const directoryStats = await statPath(resolvedProfilesDirectory).catch(() => {
    throw loaderError('SITE_PROFILE_DIRECTORY_UNAVAILABLE');
  });
  assertRealDirectory(directoryStats);
  const parentDirectory = await readRealPath(resolvedProfilesDirectory).catch(() => {
    throw loaderError('SITE_PROFILE_DIRECTORY_UNAVAILABLE');
  });
  const filenames = await readDirectory(parentDirectory).catch(() => {
    throw loaderError('SITE_PROFILE_DIRECTORY_UNAVAILABLE');
  });
  const candidates = profileFilenames(filenames);
  assertNoFilenameCaseCollisions(candidates);

  const expectedJsonFilename = `${slug}.json`;
  const expectedModuleFilename = `${slug}.mjs`;
  const selectedJsonCandidates = candidates.filter((filename) => filename.toLowerCase() === expectedJsonFilename);
  const selectedModuleCandidates = candidates.filter((filename) => filename.toLowerCase() === expectedModuleFilename);
  if (
    selectedJsonCandidates.some((filename) => filename !== expectedJsonFilename)
    || selectedModuleCandidates.some((filename) => filename !== expectedModuleFilename)
  ) {
    throw loaderError('SITE_PROFILE_FILENAME_CASE_COLLISION');
  }
  if (selectedJsonCandidates.length > 0 && selectedModuleCandidates.length > 0) {
    throw loaderError('SITE_PROFILE_DUPLICATE_FORMAT');
  }
  if (selectedJsonCandidates.length === 0 && selectedModuleCandidates.length > 0) {
    throw loaderError('SITE_PROFILE_LEGACY_MODULE_DENIED');
  }
  if (selectedJsonCandidates.length === 0) {
    throw loaderError('SITE_PROFILE_UNKNOWN');
  }

  const selectedPath = resolve(parentDirectory, expectedJsonFilename);
  if (!isInsideDirectory(parentDirectory, selectedPath)) {
    throw loaderError('SITE_PROFILE_PATH_ESCAPE');
  }
  const selectedStats = await statPath(selectedPath).catch(() => {
    throw loaderError('SITE_PROFILE_UNKNOWN');
  });
  assertRealRegularFile(selectedStats);
  if (selectedStats.size > MAX_PROFILE_JSON_BYTES) throw loaderError('SITE_PROFILE_JSON_TOO_LARGE');

  const resolvedSelectedPath = await readRealPath(selectedPath).catch(() => {
    throw loaderError('SITE_PROFILE_UNKNOWN');
  });
  if (!isInsideDirectory(parentDirectory, resolvedSelectedPath)) {
    throw loaderError('SITE_PROFILE_PATH_ESCAPE');
  }

  let jsonBytes;
  try {
    jsonBytes = await readProfileFile(resolvedSelectedPath);
  } catch {
    throw loaderError('SITE_PROFILE_JSON_MALFORMED');
  }
  if (!Buffer.isBuffer(jsonBytes) || jsonBytes.length > MAX_PROFILE_JSON_BYTES) {
    throw loaderError('SITE_PROFILE_JSON_MALFORMED');
  }
  if (jsonBytes.subarray(0, 3).equals(Buffer.from([0xEF, 0xBB, 0xBF]))) {
    throw loaderError('SITE_PROFILE_JSON_BOM_DENIED');
  }
  let profile;
  try {
    profile = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(jsonBytes));
  } catch {
    throw loaderError('SITE_PROFILE_JSON_MALFORMED');
  }
  if (!isPlainObject(profile)) throw loaderError('SITE_PROFILE_JSON_NOT_PLAIN');

  assertSiteProfile(profile);
  if (profile.id !== slug) {
    throw loaderError('SITE_PROFILE_ID_MISMATCH');
  }
  return profile;
}

export function createSiteProfileVirtualPlugin(profile) {
  const serializedProfile = serializeProfile(assertSiteProfile(profile));

  return {
    name: 'vnj-site-profile-virtual-module',
    resolveId(id) {
      return id === SITE_PROFILE_VIRTUAL_ID ? SITE_PROFILE_RESOLVED_VIRTUAL_ID : null;
    },
    load(id) {
      return id === SITE_PROFILE_RESOLVED_VIRTUAL_ID ? `export default ${serializedProfile};` : null;
    },
  };
}
