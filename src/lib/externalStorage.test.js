import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  DEFAULT_MEDIA_BUCKET,
  DEFAULT_STORAGE_PROVIDER,
  MEDIA_OBJECT_STATUSES,
  STORAGE_CONNECTION_STATUSES,
  STORAGE_MIGRATION_STATUSES,
  STORAGE_PROVIDERS,
  extractSupabaseStoragePath,
  normalizeExistingMedia,
  normalizeMediaReference,
} from './mediaReferences.js';
import {
  OPERATIONAL_STORAGE_PROVIDERS,
  STORAGE_PROVIDER_CAPABILITIES,
  createStorageProvider,
  storageProviderCatalog,
} from './storageProviders.js';
import { STORAGE_FEATURE_FLAGS } from './storageFeatureFlags.js';
import { SAFE_STORAGE_OPERATION_FIELDS, canAccessStoragePage, canSeeStorageNavigation } from './storageAdmin.js';

const projectRoot = new URL('../../', import.meta.url);
const source = (path) => readFile(new URL(path, projectRoot), 'utf8');

test('Supabase remains the only operational and default provider', () => {
  assert.equal(DEFAULT_STORAGE_PROVIDER, 'supabase');
  assert.equal(DEFAULT_MEDIA_BUCKET, 'project-media');
  assert.deepEqual(OPERATIONAL_STORAGE_PROVIDERS, ['supabase']);
  assert.deepEqual(storageProviderCatalog().filter((item) => item.operational).map((item) => item.provider), ['supabase']);
});

test('provider, connection, media, and migration values are closed allowlists', () => {
  assert.deepEqual(STORAGE_PROVIDERS, ['supabase', 'google_drive', 'onedrive', 'dropbox', 's3_compatible']);
  assert.equal(STORAGE_CONNECTION_STATUSES.includes('reconnect_required'), true);
  assert.equal(MEDIA_OBJECT_STATUSES.includes('verification_required'), true);
  assert.equal(STORAGE_MIGRATION_STATUSES.includes('retention_period'), true);
  assert.throws(() => normalizeMediaReference({ provider: 'arbitrary_cloud' }), /Unsupported storage provider/);
});

test('legacy Supabase paths and URLs normalize without rewriting their original values', () => {
  const path = normalizeExistingMedia('project-media/projects/gallery/example.webp');
  assert.equal(path.provider, 'supabase');
  assert.equal(path.bucket, 'project-media');
  assert.equal(path.storagePath, 'projects/gallery/example.webp');
  assert.equal(path.originalValue, 'project-media/projects/gallery/example.webp');

  const publicUrl = 'https://example.supabase.co/storage/v1/object/public/project-media/creative-profiles/user/avatar.webp?version=1';
  const normalized = normalizeExistingMedia(publicUrl);
  assert.equal(normalized.storagePath, 'creative-profiles/user/avatar.webp');
  assert.equal(normalized.originalValue, publicUrl);
  assert.equal(extractSupabaseStoragePath('https://example.com/not-our-bucket/file.webp'), '');
});

test('normalized media supports owner, external metadata, previews, and safe defaults', () => {
  const media = normalizeMediaReference({
    provider: 'google_drive', owner_user_id: 'owner', storage_connection_id: 'connection',
    external_file_id: 'file', filename: 'master.mov', mime_type: 'video/quicktime', size_bytes: 42,
    preview_provider: 'supabase', preview_bucket: 'project-media', preview_path: 'previews/master.webp',
  });
  assert.equal(media.ownerUserId, 'owner');
  assert.equal(media.externalFileId, 'file');
  assert.deepEqual(media.preview, { provider: 'supabase', bucket: 'project-media', storagePath: 'previews/master.webp' });
  assert.equal(media.status, 'available');
});

test('planned providers expose stable capabilities but reject all operations', async () => {
  const provider = createStorageProvider('google_drive');
  assert.equal(provider.operational, false);
  assert.equal(provider.getCapabilities().publicPreviewRecommended, true);
  assert.deepEqual(await provider.createUploadSession(), {
    ok: false, code: 'STORAGE_PROVIDER_UNSUPPORTED', provider: 'google_drive', operation: 'createUploadSession',
    message: 'google_drive is not configured for createUploadSession.',
  });
  assert.equal(await provider.deleteObject({ externalFileId: 'never-called' }).then((result) => result.ok), false);
});

test('Supabase display and deletion adapters require an injected client and preserve the bucket', async () => {
  const calls = [];
  const fakeClient = { storage: { from(bucket) { calls.push(bucket); return {
    getPublicUrl(path) { return { data: { publicUrl: `https://storage.test/${bucket}/${path}` } }; },
    async remove(paths) { calls.push(paths); return { error: null }; },
  }; } } };
  const provider = createStorageProvider('supabase', { supabaseClient: fakeClient });
  assert.equal((await provider.getDisplayUrl('projects/cover.webp')).url, 'https://storage.test/project-media/projects/cover.webp');
  assert.equal((await provider.deleteObject('projects/cover.webp')).ok, true);
  assert.deepEqual(calls, ['project-media', 'project-media', ['projects/cover.webp']]);
});

test('capability declarations are immutable and do not imply operation enablement', () => {
  assert.equal(Object.isFrozen(STORAGE_PROVIDER_CAPABILITIES), true);
  assert.equal(Object.isFrozen(STORAGE_PROVIDER_CAPABILITIES.supabase), true);
  assert.equal(STORAGE_PROVIDER_CAPABILITIES.supabase.publicDelivery, true);
  assert.equal(STORAGE_PROVIDER_CAPABILITIES.google_drive.publicDelivery, false);
  assert.equal(storageProviderCatalog().find((item) => item.provider === 'google_drive').operational, false);
});

test('all external storage actions are disabled in Phase 1', () => {
  assert.deepEqual(STORAGE_FEATURE_FLAGS, {
    externalStorageEnabled: false,
    googleDriveConnectorEnabled: false,
    storageMigrationEnabled: false,
  });
});

test('Storage navigation and route access are limited to Super Admins and linked published creatives', () => {
  assert.equal(canSeeStorageNavigation({ role: 'super_admin' }), true);
  assert.equal(canSeeStorageNavigation({ role: 'creative', adminUser: { creative_member_id: 'creative' } }), true);
  assert.equal(canSeeStorageNavigation({ role: 'creative', adminUser: {} }), false);
  assert.equal(canSeeStorageNavigation({ role: 'admin' }), false);
  assert.equal(canSeeStorageNavigation({ role: 'viewer' }), false);
  assert.equal(canAccessStoragePage({ role: 'creative', creativeMemberId: 'creative', isPublished: true }), true);
  assert.equal(canAccessStoragePage({ role: 'creative', creativeMemberId: 'creative', isPublished: false }), false);
  assert.equal(canAccessStoragePage({ role: 'editor', creativeMemberId: 'creative', isPublished: true }), false);
});

test('Super Admin operational client fields contain no credential or private object metadata', () => {
  assert.equal(SAFE_STORAGE_OPERATION_FIELDS.some((field) => /credential|secret|token|file_id|path|checksum|verification/i.test(field)), false);
});

test('admin Storage foundation is non-operational and present in desktop/mobile shared navigation', async () => {
  const [page, app, layout] = await Promise.all([
    source('src/pages/admin/Storage.jsx'), source('src/App.jsx'), source('src/components/admin/AdminLayout.jsx'),
  ]);
  assert.match(page, /Connect Google Drive/);
  assert.match(page, /disabled aria-describedby="google-drive-disabled-reason"/);
  assert.match(page, /Nothing is being moved automatically/);
  assert.doesNotMatch(page, /from\(['"]storage_connections/);
  assert.doesNotMatch(page, /credential_secret_id|access_token|refresh_token/);
  assert.match(app, /allow=\{\['super_admin', 'creative'\]\}/);
  assert.match(layout, /\['Storage', '\/admin\/storage', HardDrive, canSeeStorageNavigation\]/);
  assert.equal((layout.match(/visibleGroups\.map/g) || []).length >= 2, true);
});

test('proposed migration has ownership enforcement, safe views, and no plaintext token columns', async () => {
  const migration = await source('supabase/external_storage_phase1.sql');
  for (const table of ['storage_connections', 'external_media_objects', 'storage_migrations']) assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
  assert.match(migration, /foreign key \(storage_connection_id, owner_user_id\)/);
  assert.match(migration, /foreign key \(destination_connection_id, owner_user_id\)/);
  assert.match(migration, /grant update \(display_name, is_default\)/);
  assert.match(migration, /storage_connection_operations/);
  assert.match(migration, /storage_migration_operations/);
  assert.doesNotMatch(migration, /\b(access_token|refresh_token|oauth_token)\b/i);
});

test('existing upload, public gallery, payload, and cleanup paths remain Supabase-backed and provider-neutral code is additive', async () => {
  const [storage, projectForm, gallery, cleanup, worker] = await Promise.all([
    source('src/lib/storage.js'), source('src/components/admin/ProjectForm.jsx'), source('src/lib/galleryItems.js'),
    source('src/lib/projectMediaCleanup.js'), source('supabase/functions/process-storage-cleanup/index.ts'),
  ]);
  assert.match(storage, /const BUCKET = 'project-media'/);
  assert.match(storage, /supabase\.storage\.from\(BUCKET\)\.upload/);
  assert.match(projectForm, /cover_image: form\.cover_image/);
  assert.match(projectForm, /gallery_items: \[\.\.\.imageItems, \.\.\.externalItems\]/);
  assert.match(gallery, /normalizeProjectGallery/);
  assert.doesNotMatch(cleanup, /external_media_objects|storage_connections|google_drive/);
  assert.match(worker, /const REFERENCE_SOURCES = \['projects', 'creative_members', 'site_settings', 'page_content', 'service_branches', 'media_assets', 'admin_users'\]/);
  assert.doesNotMatch(worker, /external_media_objects|storage_migrations|google_drive/);
});

test('the architecture keeps OAuth, copying, retention, and cleanup integration in later phases', async () => {
  const design = await source('docs/external-storage-architecture.md');
  assert.match(design, /Copy → Verify → Register destination → Test preview\/display → Switch reference → Retain source → Delete source after retention/);
  assert.match(design, /7–30 days/);
  assert.match(design, /Phase 2/);
  assert.match(design, /Current cleanup is Supabase-specific and must remain unchanged in Phase 1/);
});
