import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  R2_VARIANTS,
  createR2ObjectKey,
  deleteR2Object,
  r2Configuration,
  r2CleanupStatus,
  r2ProfilePermissionAllowed,
  r2ProjectPermissionAllowed,
  r2PublicUrl,
  safeR2ObjectKey,
  uploadR2Object,
  validR2DerivativeFile,
  validateR2UploadRequest,
} from '../../supabase/functions/_shared/r2Media.js';
import { normalizeMediaReference } from './mediaReferences.js';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const PROFILE_ID = '22222222-2222-4222-8222-222222222222';
const GROUP_ID = '33333333-3333-4333-8333-333333333333';
const source = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const config = r2Configuration({
  R2_MEDIA_ENABLED: 'true', R2_ACCOUNT_ID: 'abc123-account', R2_ACCESS_KEY_ID: 'test-access-key-id',
  R2_SECRET_ACCESS_KEY: 'test-secret-access-key-that-is-long-enough', R2_BUCKET_NAME: 'lahat-media',
  R2_PUBLIC_BASE_URL: 'https://media.lahatliwa.studio',
});

function variants() {
  return Object.entries(R2_VARIANTS).map(([variant, rule]) => ({
    variant, mimeType: 'image/webp', sizeBytes: Math.min(rule.maxBytes, 1000), width: Math.min(rule.maxDimension, 600), height: 400,
  }));
}

test('R2 configuration and public URLs use only a trusted HTTPS base', () => {
  assert.equal(config.configured, true);
  const key = createR2ObjectKey('project_gallery', PROJECT_ID, GROUP_ID, 'display');
  assert.equal(key, `projects/gallery/${PROJECT_ID}/${GROUP_ID}/display.webp`);
  assert.equal(r2PublicUrl(config, key), `https://media.lahatliwa.studio/${key}`);
  assert.equal(r2Configuration({ ...config, R2_PUBLIC_BASE_URL: 'http://media.example.test' }).configured, false);
});

test('object keys are server-selected and traversal or arbitrary prefixes are rejected', () => {
  assert.equal(safeR2ObjectKey(`profiles/photos/${PROFILE_ID}/${GROUP_ID}/thumbnail.webp`).endsWith('thumbnail.webp'), true);
  for (const unsafe of ['../secret', '/projects/file.webp', 'other/prefix/file.webp', `projects/gallery/${PROJECT_ID}/${GROUP_ID}/display.png`, `projects//gallery/${GROUP_ID}/display.webp`]) {
    assert.equal(safeR2ObjectKey(unsafe), '');
  }
});

test('upload registration requires all three bounded WebP derivatives and valid targets', () => {
  const valid = validateR2UploadRequest({ category: 'project_cover', projectId: PROJECT_ID, variants: variants() });
  assert.equal(valid.ok, true);
  assert.equal(validateR2UploadRequest({ category: 'project_cover', projectId: PROJECT_ID, variants: variants().slice(1) }).code, 'VARIANTS_REQUIRED');
  assert.equal(validateR2UploadRequest({ category: 'profile_photo', creativeMemberId: PROFILE_ID, variants: variants().map((item, index) => index ? item : { ...item, mimeType: 'image/png' }) }).code, 'DERIVATIVE_INVALID');
  assert.equal(validateR2UploadRequest({ category: 'project_gallery', projectId: 'not-a-project', variants: variants() }).code, 'PROJECT_REQUIRED');
});

test('derivative upload validation checks extension, MIME, exact size, and WebP signature', () => {
  const signature = new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]);
  const valid = { variant: 'display', filename: 'display.webp', mimeType: 'image/webp', sizeBytes: 12, expectedBytes: 12, signature };
  assert.equal(validR2DerivativeFile(valid), true);
  assert.equal(validR2DerivativeFile({ ...valid, filename: 'display.png' }), false);
  assert.equal(validR2DerivativeFile({ ...valid, mimeType: 'image/png' }), false);
  assert.equal(validR2DerivativeFile({ ...valid, expectedBytes: 13 }), false);
  assert.equal(validR2DerivativeFile({ ...valid, signature: new Uint8Array(12) }), false);
});

test('project and profile permissions reject unrelated active accounts', () => {
  const project = { status: 'draft', owner_user_id: 'owner', created_by: 'creator' };
  assert.equal(r2ProjectPermissionAllowed({ role: 'creative', userId: 'owner', project }), true);
  assert.equal(r2ProjectPermissionAllowed({ role: 'editor', userId: 'other', project, accessLevel: 'editor' }), true);
  assert.equal(r2ProjectPermissionAllowed({ role: 'viewer', userId: 'other', project }), false);
  assert.equal(r2ProjectPermissionAllowed({ role: 'admin', userId: 'admin', project }, 'delete'), true);
  assert.equal(r2ProjectPermissionAllowed({ role: 'admin', userId: 'admin', project: { ...project, status: 'published' } }, 'delete'), false);
  assert.equal(r2ProfilePermissionAllowed({ role: 'creative', creativeMemberId: PROFILE_ID, targetCreativeMemberId: PROFILE_ID }), true);
  assert.equal(r2ProfilePermissionAllowed({ role: 'creative', creativeMemberId: PROFILE_ID, targetCreativeMemberId: PROJECT_ID }), false);
});

test('server-mediated upload signs R2 internally and returns no credential-bearing URL', async () => {
  const key = createR2ObjectKey('site_image', PROJECT_ID, GROUP_ID, 'display');
  let request;
  const response = { ok: true, status: 200 };
  const returned = await uploadR2Object(async (url, options) => { request = { url, options }; return response; }, config, key, 'image/webp', new Uint8Array([1, 2, 3]));
  assert.equal(returned, response);
  assert.equal(request.url.includes(config.accessKeyId), false);
  assert.match(request.options.headers.Authorization, /^AWS4-HMAC-SHA256 Credential=/);
  assert.equal(request.options.headers['Cache-Control'], 'public, max-age=31536000, immutable');
  assert.equal(JSON.stringify(returned).includes(config.accessKeyId), false);
});

test('missing R2 objects are an idempotent cleanup success', async () => {
  const key = createR2ObjectKey('site_image', PROJECT_ID, GROUP_ID, 'thumbnail');
  const result = await deleteR2Object(async () => ({ ok: false, status: 404 }), config, key);
  assert.deepEqual(result, { deleted: true, alreadyMissing: true });
});

test('cleanup failures advance to manual review only after the retry limit', () => {
  assert.equal(r2CleanupStatus(1), 'retry_required');
  assert.equal(r2CleanupStatus(7), 'retry_required');
  assert.equal(r2CleanupStatus(8), 'manual_required');
});

test('provider-neutral normalization preserves an R2 public reference without exposing object internals', () => {
  const url = `https://media.lahatliwa.studio/projects/gallery/${PROJECT_ID}/${GROUP_ID}/expanded.webp`;
  const media = normalizeMediaReference({ provider: 'cloudflare_r2', url, media_group_id: GROUP_ID, media_variant: 'expanded' });
  assert.equal(media.provider, 'cloudflare_r2');
  assert.equal(media.publicUrl, url);
  assert.equal(media.mediaGroupId, GROUP_ID);
  assert.equal(media.storagePath, null);
});

test('new public media is R2-only, keeps legacy rendering, and leaks no upload authorization', () => {
  const client = source('src/lib/r2Media.js');
  const storage = source('src/lib/storage.js');
  const form = source('src/components/admin/ProjectForm.jsx');
  const edge = source('supabase/functions/r2-media/index.ts');
  const uploadEdge = source('supabase/functions/r2-media-upload/index.ts');
  const worker = source('supabase/functions/process-storage-cleanup/index.ts');
  assert.match(client, /r2-media-upload/);
  assert.doesNotMatch(client, /R2_ACCESS_KEY_ID|uploadUrl|X-Amz-Credential/);
  assert.doesNotMatch(edge, /uploadUrl|X-Amz-Credential/);
  assert.match(uploadEdge, /file\.name\.toLowerCase\(\)/);
  assert.match(storage, /uploadManagedWebsiteImage/);
  assert.doesNotMatch(storage, /supabase\.storage\.from\(BUCKET\)\.upload/);
  assert.match(client, /R2_UPLOAD_UNAVAILABLE/);
  assert.doesNotMatch(client, /fallback:\s*true/);
  assert.doesNotMatch(form, /ExternalProjectFiles|Upload original|Drive-only project files/);
  assert.match(edge, /REFERENCE_NOT_SWITCHED/);
  assert.match(worker, /deleteR2Object/);
  assert.match(worker, /manual_required/);
});
