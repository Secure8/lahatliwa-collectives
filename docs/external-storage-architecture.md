# External Storage Architecture — Phase 1

Status: design and local application foundation only. The proposed SQL in `supabase/external_storage_phase1.sql` has not been applied. External connections, uploads, migrations, and deletions are disabled.

## Objective and boundaries

Lahat Liwa will eventually let each eligible published creative connect storage they control. Google Drive is the first planned connector, while the internal model also reserves OneDrive, Dropbox, and S3-compatible providers. Phase 1 adds normalized media references, a provider interface, capability metadata, an admin foundation, an unapplied schema proposal, and safety documentation.

Phase 1 does not start OAuth, request provider permissions, store tokens, create folders, upload externally, move existing media, change the cleanup worker, or make public pages depend on an external provider. Supabase remains the only operational provider and the current upload destination.

## Repository media-system audit

### Bucket and delivery

The application uses one public Supabase Storage bucket: `project-media`.

- `src/lib/storage.js` uploads project covers, gallery images/PDFs, and external-link thumbnails. It stores project paths in database records and converts paths to public URLs with `getPublicUrl` at render time.
- `src/lib/contentApi.js` uploads profile, site, service, logo, hero, background, and media-library assets. These helpers generally store the returned public URL; media-library rows also retain `storage_path`.
- `src/lib/publicImages.js` accepts current paths, bucket-prefixed paths, public URLs, local paths, data URLs, and blob URLs without rewriting stored records.
- `src/lib/galleryItems.js` normalizes legacy `gallery_images` and current `gallery_items`. Uploaded images and PDFs use Supabase media URLs; external social/video/site links remain external.
- No application upload path uses signed URLs today. The cleanup reconciliation parser recognizes signed Supabase URLs so references are protected if one is encountered.

### Upload entry points and rules

| Entry point | Stored prefix | Accepted media | Limit and optimization |
| --- | --- | --- | --- |
| Project cover (`ProjectForm`) | `projects/covers/` | JPEG, PNG, WebP | 1 MB, longest side 1600 px, browser WebP optimization |
| Project gallery (`ProjectForm`) | `projects/gallery/` | JPEG, PNG, WebP, PDF | images 1 MB/1600 px with WebP optimization; PDFs 2 MB unchanged |
| External-gallery thumbnail (`ProjectForm`) | `projects/{slug}/external-thumbnails/` | JPEG, PNG, WebP | 300 KB/800 px with WebP optimization |
| Creative self-service profile photo (`MyProfile`) | `creative-profiles/{auth user}/profile/` | image types accepted by the shared site helper | 1.5 MB/2200 px with WebP optimization for JPEG/PNG/WebP |
| Creative self-service cover (`MyProfile`) | `creative-profiles/{auth user}/cover/` | image types accepted by the shared site helper | 1 MB/1800 px with WebP optimization for JPEG/PNG/WebP |
| Privileged creative editor | `creatives/` and `creatives/covers/` | site-image types | profile 1.5 MB/2200 px; cover 1 MB/1800 px |
| Site logo | `logos/` | JPEG, PNG, WebP, SVG | 300 KB/600 px; SVG unchanged, raster optimized |
| Hero portrait | `heroes/` | JPEG, PNG, WebP, SVG | profile-image rule |
| Home background | `backgrounds/` | JPEG, PNG, WebP, SVG | 1 MB/1600 px |
| Service branch icon | `service-branches/` | JPEG, PNG, WebP, SVG | 300 KB/600 px |
| Media icon library | `icons/` | SVG, PNG, WebP | 300 KB/600 px; media row stores URL and path |

The compression implementation is in `src/lib/imageCompression.js`. It resizes in the browser, encodes JPEG/PNG/WebP inputs to WebP through descending dimension/quality steps, and refuses the upload if the configured limit cannot be reached without further quality loss. SVGs and PDFs are never rasterized. Uploads use `upsert: false`, UUID filenames, and one-year cache control.

No direct project video upload exists. Videos are represented by external gallery links or the legacy `video_url`. PDF is the only uploaded document type in project galleries. Source files, archives, and other documents are not accepted by current upload helpers.

### Database references and ownership

Current media references include:

- `projects.cover_image`, `projects.gallery_images`, and `projects.gallery_items` (`url`, `thumbnail_url`, `thumbnail_storage_path`), plus external `video_url`, `social_post_url`, `live_url`, and `github_url`.
- `creative_members.profile_image_url` and `creative_members.cover_image`.
- `site_settings` logo, hero portrait, and background columns.
- nested image values in `page_content.content`.
- `service_branches.icon_url` and `service_branches.image_url`.
- `media_assets.url` and `media_assets.storage_path`.
- `admin_users.avatar_url`.

Projects have `owner_user_id`, `created_by`, and `updated_by`. A database trigger sets ownership to the authenticated creator on insert and preserves it on update. Project contributors live in `project_creatives`; credit does not grant physical-file ownership. Creative self-service uploads are scoped under the authenticated user ID and require a linked creative member. Privileged editors may manage shared creative/site media.

Selected ownership rule:

> The storage owner is the authenticated user or administrative owner who uploaded and manages the file—not automatically every credited contributor.

Future upload-destination choices must include only connections owned by the authenticated uploader. Collaborators cannot target another person's connection without a separately designed, explicit authorization model.

Current data cannot always identify the exact historical uploader for shared site assets or older creative records. Project ownership is reliable after the ownership migration; self-service profile prefixes identify the owning auth user; shared CMS/media assets are administratively managed. Any future backfill must classify ambiguous records for review rather than infer ownership from credits.

### Replacement, deletion, and orphan cleanup

- Project cover replacement and project gallery/thumbnail removal accumulate old paths. After the project record is saved, those paths are queued through `enqueue_project_media_cleanup`, deleted directly when possible, and marked complete through `complete_project_cleanup_paths`; failures stay queued.
- Failed project saves attempt to remove newly uploaded gallery objects.
- Project deletion first queues all collected project paths, deletes the project row, then attempts Storage deletion. Published projects cannot be deleted through the current UI permission helper.
- Profile and site-media replacement/removal update database references but do not directly delete old objects. The reconciliation worker can later identify unreferenced objects.
- Media-library deletion fails closed: it scans projects, creative profiles, settings, page content, and service branches; referenced files cannot be deleted. It removes the Storage object before deleting the `media_assets` row.
- `process-storage-cleanup` scans projects, creatives, settings, page content, services, media assets, and admin users, traverses `project-media`, and uses a 24-hour orphan safety window. A failed reference-source query aborts the scan. Reviewed orphans require explicit queue confirmation. The worker retries durable cleanup jobs, recovers stale locks, and moves exhausted jobs to manual review.
- Current cleanup is Supabase-specific and must remain unchanged in Phase 1.

Current cleanup paths that need provider-aware work later:

1. `src/lib/storage.js` `deleteImages`.
2. Project removal/replacement in `src/components/admin/ProjectForm.jsx`.
3. Project deletion in `src/pages/admin/AdminProjects.jsx`.
4. Media-library deletion/reference scanning in `src/lib/contentApi.js`.
5. Reference parsing and collection in `src/lib/projectMediaCleanup.js`.
6. `storage_cleanup_jobs`, `enqueue_project_media_cleanup`, and completion RPCs.
7. The `process-storage-cleanup` Edge Function, its reconciliation helper, cron, Vault bootstrap, retry/status SQL, and operator scripts.
8. Profile and CMS replacement paths that currently rely on reconciliation for orphan cleanup.

Future cleanup must distinguish Supabase media, external originals, Supabase public previews, and temporary migration copies. Project deletion must not silently delete an externally owned original. Preview removal and original deletion are separate decisions. Revoked credentials and provider failures create retryable, actionable jobs. Retained sources and active migration files are excluded from orphan deletion.

## Provider-neutral application model

`src/lib/mediaReferences.js` defines validated providers, connection/media/migration statuses, visibility values, and normalization of legacy Supabase paths or URLs. Existing values remain unchanged in the database; normalization is an in-memory compatibility layer.

`src/lib/storageProviders.js` defines the provider interface:

- `getCapabilities`
- `validateConnection`
- `createUploadSession`
- `completeUpload`
- `getDisplayUrl`
- `getDownloadUrl`
- `deleteObject`
- `copyObject`
- `verifyObject`
- `refreshMetadata`

Only `supabase` is operational for uploads and media delivery. Phase 2 makes Google Drive connection-capable through server-injected connect, verify, folder, and disconnect operations while all upload, copy, delete-object, and migration operations remain unsupported. Existing upload helpers remain the active Supabase implementation.

Capability declarations describe architectural expectations, not enabled actions. Google Drive is expected to support resumable upload, private delivery, copy, verification, and deletion, while recommending a separate public preview. No capability declaration enables a provider.

## Proposed schema

The unapplied migration proposes:

- `storage_connections`: owner, provider/account metadata, opaque `credential_secret_id`, connection state, default choice, capabilities, verification/error timestamps.
- `external_media_objects`: normalized metadata for both Supabase and external objects, owner-matched connection, checksums/dimensions/duration, visibility/state, and optional preview reference.
- `storage_migrations`: owner-matched source/media/destination references, transfer progress, verification state, retention, retries/errors, and lifecycle timestamps.

Composite foreign keys require each media object and migration destination to belong to the same `owner_user_id`. Existing project/profile rows do not need an external-media row or backfill. Status and provider fields use check constraints consistent with the repository's SQL style. Partial unique indexes protect one default connection, provider file identity, Supabase paths, and recovery queries.

## Permission and credential boundary

The proposed policies are:

1. Published creative owners may select only their own connection rows.
2. They may insert only an empty `pending` connection for `auth.uid()`; provider account identity, credentials, capabilities, status, verification, and errors must remain unset.
3. They may update only `display_name` and `is_default` through column grants. Ownership, provider, account identity, credential reference, status, and operational fields are not client-writable.
4. Published creative owners may select only their own external-media metadata and migration jobs.
5. Clients receive no insert/update/delete grants for media objects or migrations. Later phases must expose narrowly scoped, ownership-checking server operations.
6. Super Admins do not receive base-table access to other owners' records. Two read-only operational views expose only approved connection/progress/error fields and omit secret references, provider account IDs, external file IDs, paths, checksums, arbitrary metadata, and verification details.

`credential_secret_id` is only an opaque server-side reference. OAuth access/refresh tokens must live in Supabase Vault or an equivalent server-only secret boundary. Tokens must never be returned to browsers, local storage, project records, admin views, public APIs, analytics, or logs. Edge Functions should log stable error codes and correlation IDs, never authorization headers or provider responses containing credentials.

## Planned Google OAuth and upload flow

Phase 2 will use a server-generated state value bound to the authenticated owner, redirect through Google's consent screen, validate the callback server-side, store refresh credentials in Vault, register only the opaque secret reference, verify the account, create or select a root folder, and support disconnect/reconnect. The browser receives connection status—not provider tokens.

Phase 3A adds one isolated, server-authenticated multipart test upload for files up to 2 MB. It verifies ownership, Google identity, scopes, managed folders, file signatures, and returned provider metadata before marking an external-media row available. Normal project/profile/CMS uploads, resumable transport, public previews, idempotent upload sessions, and cleanup integration remain later Phase 3 work.

## Hybrid public-preview policy

Keep in Lahat Liwa/Supabase:

- optimized thumbnails and lightweight gallery previews;
- public project-cover previews;
- public creative-avatar/cover previews;
- brand assets, site imagery, and service icons.

Eligible for connected external storage:

- full-resolution photographs and original videos;
- large PDFs and downloadable masters;
- source files and archives.

Public pages resolve previews independently from originals. If a connection is revoked, a token expires, a provider is down, or an original is deleted externally, the gallery continues rendering its Supabase preview and reports only the original as unavailable. Current public pages remain entirely Supabase-backed until this fallback exists and is tested.

## Migration safety model

Required sequence:

`Copy → Verify → Register destination → Test preview/display → Switch reference → Retain source → Delete source after retention`

Copy never mutates the source. Verification compares filename, MIME type, bytes, provider checksum where available, an application checksum where practical, image dimensions or video duration where applicable, and a successful destination read. The destination is registered only after ownership and metadata checks. The application preview/display test must pass before reference switching.

The source is retained after switching. The final retention period is unresolved; the safe decision range is 7–30 days and should be selected using storage cost, recovery expectations, and observed failure rates before Phase 4. It must be server-configured rather than embedded in client code.

Every migration uses an idempotency key and monotonic state transitions. Workers must support retry, cancel before switching, stale-job recovery, partial-copy cleanup, provider disconnection/revocation, and audit events. Rollback after switching restores the source reference and re-tests display before retiring the destination. A failure at any stage keeps the source. Source deletion is a separate authorized job after retention and final reference verification.

## Feature flags

`src/lib/storageFeatureFlags.js` now separates the Phase 2 connection gate from later data movement:

- `externalStorageEnabled` enables the connection-management foundation.
- `googleDriveConnectorEnabled` is requested only by `VITE_GOOGLE_DRIVE_CONNECTOR_ENABLED=true` and still requires server capability verification.
- `externalUploadsEnabled` remains false.
- `storageMigrationEnabled` remains false.

They are client visibility gates, not security controls. A future enablement requires matching server-side configuration, deployed handlers, RLS/RPC enforcement, secret setup, monitoring, and a staged rollout. The admin page may explain planned storage, but its connection control stays disabled.

## Rollout checklist

### Phase 1

- [x] Provider-neutral abstraction and validation constants
- [x] Proposed schema and documented RLS model
- [x] Admin Storage foundation and role-aware navigation
- [x] Legacy Supabase compatibility model
- [x] Focused tests
- [x] No provider connection, upload, migration, or file mutation

### Phase 2

- [x] Google Cloud configuration and consent-screen runbook
- [x] Server-side Google authorization, PKCE, and one-time state validation
- [x] Vault-backed refresh-token references
- [x] Connection verification and managed root-folder creation
- [x] Disconnect and reconnect
- [ ] Manual SQL application, secret setup, deployment, and live credential verification after review

### Phase 3

- [x] Isolated small multipart test upload with server-selected destination
- [x] External-media registration, verification, and finalization-failure cleanup attempt
- [ ] Direct/resumable production upload sessions
- [ ] Metadata registration and ownership enforcement
- [ ] Optimized public previews
- [ ] Upload retry and recovery

### Phase 4

- [ ] Migration worker and idempotent copy
- [ ] Verification and display testing
- [ ] Reference switching
- [ ] Retention and rollback
- [ ] Separately authorized source deletion

### Phase 5

- [ ] Additional providers
- [ ] Monitoring, alerts, quotas, and cost controls
- [ ] Production hardening and recovery drills

## Unresolved decisions

- Final source-retention duration within the 7–30 day range.
- Whether external originals are deleted on project deletion by default, opt-in, or never without a second confirmation.
- Per-provider folder hierarchy and filename collision policy.
- Maximum external original sizes and resumable-upload thresholds.
- Checksum strategy where providers do not expose a compatible digest.
- Quota display, shared-drive/team-account policy, and owner-departure handling.
- Whether historical shared CMS media is assigned to a Super Admin owner or remains platform-owned.
- The explicit authorization model, if any, for assistants uploading into another owner's connected storage.
