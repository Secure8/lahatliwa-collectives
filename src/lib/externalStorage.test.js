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
  CONNECTION_CAPABLE_STORAGE_PROVIDERS,
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

test('Google Drive is connection-capable but rejects every media operation', async () => {
  const provider = createStorageProvider('google_drive');
  assert.equal(provider.operational, false);
  assert.equal(provider.connectionOperational, false);
  assert.deepEqual(CONNECTION_CAPABLE_STORAGE_PROVIDERS, ['google_drive']);
  assert.equal(provider.getCapabilities().connect, true);
  assert.equal(provider.getCapabilities().publicPreviewRecommended, true);
  assert.deepEqual(await provider.createUploadSession(), {
    ok: false, code: 'STORAGE_PROVIDER_UNSUPPORTED', provider: 'google_drive', operation: 'createUploadSession',
    message: 'google_drive is not configured for createUploadSession.',
  });
  assert.equal(await provider.deleteObject({ externalFileId: 'never-called' }).then((result) => result.ok), false);

  const calls = [];
  const connected = createStorageProvider('google_drive', { googleDriveConnectionClient: {
    verifyConnection: async (input) => { calls.push(input); return { ok: true, status: 'connected' }; },
  } });
  assert.equal(connected.connectionOperational, true);
  assert.equal((await connected.validateConnection({ id: 'connection' })).ok, true);
  assert.deepEqual(calls, [{ id: 'connection' }]);
  assert.equal((await connected.createUploadSession()).ok, false);
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

test('external storage flags keep Phase 4 disabled by default', () => {
  assert.deepEqual(STORAGE_FEATURE_FLAGS, {
    externalStorageEnabled: true,
    googleDriveConnectorEnabled: false,
    googleDriveTestUploadEnabled: false,
    googleDriveProjectGalleryEnabled: false,
    externalUploadsEnabled: false,
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

test('admin Storage exposes safe connection actions and an isolated flagged test upload', async () => {
  const [page, app, layout] = await Promise.all([
    source('src/pages/admin/Storage.jsx'), source('src/App.jsx'), source('src/components/admin/AdminLayout.jsx'),
  ]);
  assert.match(page, /Connect Google Drive/);
  assert.match(page, /Reconnect Google Drive/);
  assert.match(page, /Check connection/);
  assert.match(page, /Disconnect Google Drive/);
  assert.match(page, /Test a small Drive upload/);
  assert.match(page, /does not change website media references/);
  assert.match(page, /STORAGE_FEATURE_FLAGS\.googleDriveTestUploadEnabled/);
  assert.match(page, /state\.testUploadEnabled/);
  assert.match(page, /storage_connection_operations/);
  assert.doesNotMatch(page, /credential_secret_id|access_token|refresh_token/);
  assert.match(app, /allow=\{\['super_admin', 'creative'\]\}/);
  assert.match(layout, /\['Storage', '\/admin\/storage', HardDrive, canSeeStorageNavigation\]/);
  assert.equal((layout.match(/visibleGroups\.map/g) || []).length >= 2, true);
});

test('Phase 3 test upload is server-authenticated, flag-gated, and leaves normal uploads unchanged', async () => {
  const [upload, api, client, storage, content] = await Promise.all([
    source('supabase/functions/google-drive-upload/index.ts'),
    source('supabase/functions/_shared/googleDriveApi.js'),
    source('src/lib/googleDriveStorage.js'),
    source('src/lib/storage.js'),
    source('src/lib/contentApi.js'),
  ]);
  assert.match(upload, /authenticatedStorageOwner/);
  assert.match(upload, /env\.googleDriveUploadEnabled/);
  assert.match(upload, /folder_ids\?\.\[purpose\.folderRole\]/);
  assert.match(upload, /visibility: 'private'/);
  assert.match(upload, /resolveDriveUploadPurpose/);
  assert.match(upload, /verifyManagedFolder/);
  assert.match(upload, /deleteDriveFile/);
  assert.match(upload, /manual_cleanup_required/);
  assert.match(api, /uploadType=multipart/);
  assert.match(client, /google-drive-upload/);
  assert.match(client, /admin_test_upload/);
  assert.match(storage, /supabase\.storage\.from\(BUCKET\)\.upload/);
  assert.match(content, /supabase\.storage\.from\(BUCKET\)\.upload/);
});

test('Phase 4 is isolated, double-gated, and does not make Google Drive globally operational', async () => {
  const [flags, env, form, client, lifecycle, config, storagePage] = await Promise.all([
    source('src/lib/storageFeatureFlags.js'),
    source('.env.example'),
    source('src/components/admin/ProjectForm.jsx'),
    source('src/lib/googleDriveStorage.js'),
    source('supabase/functions/google-drive-media-lifecycle/index.ts'),
    source('supabase/config.toml'),
    source('src/pages/admin/Storage.jsx'),
  ]);
  assert.match(flags, /googleDriveProjectGalleryEnabled: googleDriveConnectorRequested && googleDriveProjectGalleryRequested/);
  assert.match(env, /VITE_GOOGLE_DRIVE_PROJECT_GALLERY_ENABLED=false/);
  assert.match(form, /serverEnabled: status\.projectGalleryUploadEnabled/);
  assert.match(form, /connection: status\.connection/);
  assert.match(form, /Google Drive is not currently available\. Your files were not uploaded/);
  assert.match(client, /project_gallery_original/);
  assert.match(client, /request_id/);
  assert.match(client, /google-drive-media-lifecycle/);
  assert.match(lifecycle, /authenticatedStorageOwner/);
  assert.match(lifecycle, /projectReferencesMediaObject/);
  assert.match(lifecycle, /validCleanupAuthorization/);
  assert.match(lifecycle, /env\.googleDriveUploadEnabled/);
  assert.match(config, /\[functions\.google-drive-media-lifecycle\]/);
  assert.match(storagePage, /uploadGoogleDriveTestFile/);
  assert.deepEqual(OPERATIONAL_STORAGE_PROVIDERS, ['supabase']);
});

test('Phase 3 SQL removes sensitive provider columns from authenticated browser grants', async () => {
  const sql = await source('supabase/external_storage_phase3_google_drive_upload.sql');
  assert.match(sql, /revoke select on table public\.storage_connections from authenticated/);
  assert.match(sql, /revoke select on table public\.external_media_objects from authenticated/);
  const [connectionSection, mediaSection = ''] = sql.split('revoke select on table public.external_media_objects from authenticated;');
  const connectionGrant = connectionSection.match(/grant select \(([\s\S]*?)\) on table public\.storage_connections/)?.[1] || '';
  const mediaGrant = mediaSection.match(/grant select \(([\s\S]*?)\) on table public\.external_media_objects/)?.[1] || '';
  assert.doesNotMatch(connectionGrant, /provider_account_id|credential_secret_id|root_folder_id|folder_ids|granted_scopes/);
  assert.doesNotMatch(mediaGrant, /storage_connection_id|external_file_id|external_parent_id|storage_path|metadata/);
  assert.match(mediaGrant, /filename/);
  assert.match(mediaGrant, /status/);
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

test('Phase 2 SQL keeps OAuth state and credentials server-only and is not a migration', async () => {
  const sql = await source('supabase/external_storage_phase2_google_drive.sql');
  assert.match(sql, /REVIEW ONLY; DO NOT APPLY automatically/);
  assert.match(sql, /private\.external_storage_oauth_states/);
  assert.match(sql, /state_hash text not null unique/);
  assert.match(sql, /pkce_verifier_secret_id uuid not null/);
  assert.match(sql, /now\(\) \+ interval '10 minutes'/);
  assert.match(sql, /vault\.create_secret/);
  assert.match(sql, /private\.server_consume_external_storage_oauth_state/);
  assert.match(sql, /consumed_at = now\(\)/);
  assert.match(sql, /credential_secret_id = coalesce\(v_new_secret_id/);
  assert.match(sql, /perform private\.delete_provider_secret\(v_connection\.credential_secret_id\)/);
  assert.match(sql, /revoke all on function private\.server_read_storage_connection_secret\(uuid,uuid\) from public, anon, authenticated, service_role/);
  assert.doesNotMatch(sql, /function public\.server_(?:create|consume|read|upsert|disconnect)/);
  assert.match(sql, /status not in \('revoked','disabled'\)/);
  assert.match(sql, /root_folder_health/);
});

test('existing upload, public gallery, payload, and cleanup paths remain Supabase-backed and provider-neutral code is additive', async () => {
  const [storage, projectForm, gallery, cleanup, worker] = await Promise.all([
    source('src/lib/storage.js'), source('src/components/admin/ProjectForm.jsx'), source('src/lib/galleryItems.js'),
    source('src/lib/projectMediaCleanup.js'), source('supabase/functions/process-storage-cleanup/index.ts'),
  ]);
  assert.match(storage, /const BUCKET = PROJECT_MEDIA_BUCKET/);
  assert.match(storage, /supabase\.storage\.from\(BUCKET\)\.upload/);
  assert.match(projectForm, /cover_image: form\.cover_image/);
  assert.match(projectForm, /gallery_items: \[\.\.\.imageItems, \.\.\.externalItems\]/);
  assert.match(gallery, /normalizeProjectGallery/);
  assert.doesNotMatch(cleanup, /external_media_objects|storage_connections/);
  assert.match(worker, /const REFERENCE_SOURCES = \['projects', 'creative_members', 'site_settings', 'page_content', 'service_branches', 'media_assets', 'admin_users'\]/);
  assert.match(worker, /cleanupExpiredExternalUploads/);
  assert.match(worker, /external_media_objects/);
  assert.match(worker, /cancelResumableDriveUpload/);
  assert.doesNotMatch(worker, /storage_migrations/);
});

test('the architecture documents the production state and preserves the corrected Phase 5–7 roadmap', async () => {
  const [design, phase2] = await Promise.all([
    source('docs/external-storage-architecture.md'), source('docs/google-drive-byos-phase2.md'),
  ]);
  assert.match(design, /Copy → Verify → Register destination → Test preview\/display → Switch reference → Retain source → Delete source after retention/);
  assert.match(design, /7–30 days/);
  assert.match(design, /Phases 1–4 are complete and deployed/);
  assert.match(design, /Phase 5A — Production resumable upload foundation/);
  assert.match(design, /Phase 5B — Controlled videos up to 1 GB/);
  assert.match(design, /Phase 5C — Other large originals/);
  assert.match(design, /Phase 6 — Historical-media migration/);
  assert.match(design, /Phase 7 — Provider expansion and production hardening/);
  assert.match(design, /centralized cleanup worker remains Supabase-specific/);
  assert.match(design, /must not simply be raised to 1 GB/);
  assert.match(phase2, /http:\/\/127\.0\.0\.1:54321\/functions\/v1\/google-drive-oauth-callback/);
  assert.match(phase2, /https:\/\/fgelzlxfqeooxvvcpndd\.supabase\.co\/functions\/v1\/google-drive-oauth-callback/);
  assert.match(phase2, /VITE_GOOGLE_DRIVE_CONNECTOR_ENABLED=true/);
  assert.match(phase2, /No media file upload/);
});
