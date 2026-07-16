# External Storage Architecture and Production Roadmap

Status: Phases 1–4 are complete and deployed to production project `fgelzlxfqeooxvvcpndd`. Supabase remains a supported public-delivery layer for existing media, while new managed public images use R2. Phase 4 is enabled in production for controlled project-gallery image originals, while the repository `.env.example` intentionally keeps every Google Drive frontend gate disabled as a safe default. Historical-media migration is retired; existing Supabase media remains in place and is monitored.

## Objective and boundaries

Lahat Liwa lets each eligible published creative connect storage they control. Google Drive is the first production connector, while the internal model also reserves OneDrive, Dropbox, and S3-compatible providers. Phase 1 established normalized media references, a provider interface, capability metadata, the admin foundation, the production schema and permission model, and safety documentation.

Phase 1 deliberately did not start OAuth, request provider permissions, store tokens, create folders, upload externally, move existing media, change the cleanup worker, or make public pages depend on an external provider. Those capabilities were introduced only through separately reviewed later phases. Supabase remains the global operational/default provider.

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
- The centralized cleanup worker remains Supabase-specific. Phase 4 added a separate server-authorized, UUID-based Google Drive cleanup lifecycle for controlled project-gallery originals; the Supabase worker still never receives Drive file IDs.

Cleanup paths that still need generic provider-aware work in later phases:

1. `src/lib/storage.js` `deleteImages`.
2. Project removal/replacement in `src/components/admin/ProjectForm.jsx` beyond the controlled Phase 4 gallery-image lifecycle.
3. Project deletion in `src/pages/admin/AdminProjects.jsx` beyond the controlled Phase 4 gallery-image lifecycle.
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

Only `supabase` is classified as a generic operational provider and it remains the default for uploads and all public delivery. Google Drive has reviewed, purpose-specific operations for connection management, small test uploads, controlled project-gallery image originals, preview attachment, and owned-media deletion. It is intentionally not classified as a generic unrestricted provider: resumable large-file upload, generic copy/verification, migration, and direct public delivery are unfinished. Public project media continues to render through Supabase previews rather than Drive.

Capability declarations describe generic architectural expectations, not every controlled operation and not enabled actions. Google Drive is expected to support resumable upload, private delivery, copy, verification, and deletion, while requiring a separate public preview. No capability declaration enables a provider, makes Google Drive the default, or grants generic public-delivery capability.

## Production schema

Phase 1 introduced:

- `storage_connections`: owner, provider/account metadata, opaque `credential_secret_id`, connection state, default choice, capabilities, verification/error timestamps.
- `external_media_objects`: normalized metadata for both Supabase and external objects, owner-matched connection, checksums/dimensions/duration, visibility/state, and optional preview reference.
- `storage_migrations`: owner-matched source/media/destination references, transfer progress, verification state, retention, retries/errors, and lifecycle timestamps.

Composite foreign keys require each media object and migration destination to belong to the same `owner_user_id`. Existing project/profile rows do not need an external-media row or backfill. Status and provider fields use check constraints consistent with the repository's SQL style. Partial unique indexes protect one default connection, provider file identity, Supabase paths, and recovery queries.

## Permission and credential boundary

The implemented permission model is:

1. Published creative owners may select only their own connection rows.
2. They may insert only an empty `pending` connection for `auth.uid()`; provider account identity, credentials, capabilities, status, verification, and errors must remain unset.
3. They may update only `display_name` and `is_default` through column grants. Ownership, provider, account identity, credential reference, status, and operational fields are not client-writable.
4. Published creative owners may select only their own external-media metadata and migration jobs.
5. Clients receive no insert/update/delete grants for media objects or migrations. Later phases must expose narrowly scoped, ownership-checking server operations.
6. Super Admins do not receive base-table access to other owners' records. Two read-only operational views expose only approved connection/progress/error fields and omit secret references, provider account IDs, external file IDs, paths, checksums, arbitrary metadata, and verification details.

`credential_secret_id` is only an opaque server-side reference. OAuth access/refresh tokens must live in Supabase Vault or an equivalent server-only secret boundary. Tokens must never be returned to browsers, local storage, project records, admin views, public APIs, analytics, or logs. Edge Functions should log stable error codes and correlation IDs, never authorization headers or provider responses containing credentials.

## Planned Google OAuth and upload flow

Phase 2 uses a server-generated state value bound to the authenticated owner, redirects through Google's consent screen, validates the callback server-side, stores refresh credentials in Vault, registers only the opaque secret reference, verifies the account, creates or selects a root folder, and supports disconnect/reconnect. The browser receives connection status—not provider tokens.

Phase 3 added one isolated, server-authenticated multipart test upload for files up to 2 MB. It verifies ownership, Google identity, scopes, managed folders, file signatures, and returned provider metadata before marking an external-media row available.

Phase 4 added a separate project-gallery path that is disabled by default in repository examples and enabled through reviewed production configuration. Eligible editors may deliberately place a newly prepared JPEG, PNG, or WebP gallery image original in private Google Drive while a public optimized preview remains in the existing Supabase `project-media` bucket. Project JSON stores only a safe external-media UUID and Supabase preview reference. Covers, PDFs, thumbnails, profiles, CMS media, service media, and ordinary gallery uploads continue using Supabase.

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

Public pages resolve previews independently from originals. If a connection is revoked, a token expires, a provider is down, or an original is deleted externally, the gallery continues rendering its Supabase preview and reports only the original as unavailable. This fallback is implemented and production-verified for Phase 4 project-gallery images; other media classes remain entirely Supabase-backed until separately implemented and tested.

## Existing Supabase media policy

Existing public files stay in Supabase and keep their current website references. Monitoring may inventory, measure, and report missing or unreferenced objects, but it does not copy, switch, or delete them automatically. New managed public uploads use R2 independently of the existing Supabase library.

## Feature flags

`src/lib/storageFeatureFlags.js` separates connection management and each controlled data-movement surface:

- `externalStorageEnabled` enables the connection-management foundation.
- `googleDriveConnectorEnabled` is requested only by `VITE_GOOGLE_DRIVE_CONNECTOR_ENABLED=true` and still requires server capability verification.
- `googleDriveTestUploadEnabled` independently gates the Storage-page test.
- `googleDriveProjectGalleryEnabled` requires both the connector gate and `VITE_GOOGLE_DRIVE_PROJECT_GALLERY_ENABLED=true`; the editor also requires a connected account and server upload capability.
- `externalUploadsEnabled` remains false because Google Drive is not a generic unrestricted upload provider.

They are client visibility gates, not security controls. The production Phase 4 build uses `VITE_GOOGLE_DRIVE_PROJECT_GALLERY_ENABLED=true` after controlled end-to-end verification. The tracked `.env.example` remains false by design. Every enablement still requires matching server-side configuration, deployed handlers, RLS/RPC enforcement, secret setup, monitoring, and a staged rollout.

## Rollout checklist

### Phase 1

- [x] Provider-neutral abstraction and validation constants
- [x] Production schema and documented RLS model
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
- [x] SQL application, secret setup, production deployment, and live credential verification

### Phase 3

- [x] Isolated small multipart test upload with server-selected destination
- [x] External-media registration, verification, and finalization-failure cleanup attempt
- [x] Restricted browser exposure and safe response fields
- [x] Feature-gated production verification without changing default website uploads

### Phase 4

- [x] Explicit per-operation project-gallery destination with Supabase default
- [x] Private Drive image original plus public Supabase preview
- [x] Safe UUID-based project media reference with legacy string compatibility
- [x] Server-verified preview attachment and idempotent provider deletion
- [x] Partial-upload, failed-save, media-removal, and project-deletion cleanup paths
- [x] Separate frontend gate with a safe disabled repository default
- [x] Controlled production rollout and end-to-end verification

### Phase 5A — Production resumable upload foundation

- [ ] Generic resumable upload sessions
- [ ] Direct browser-to-provider chunk transport; never proxy whole large files through Supabase Edge Functions
- [ ] Durable upload-session state, idempotency, retry, resume, cancellation, and abandoned-session cleanup
- [ ] Server-enforced metadata registration, ownership, quota, capacity, size, and media policies
- [ ] Checksum, provider-result verification, finalization, and recovery strategy
- [ ] Public-preview lifecycle independent from private originals
- [ ] Provider-aware deletion and rollback

### Phase 5B — Controlled videos up to 1 GB

- [ ] Private Google Drive originals for approved MP4, WebM, and carefully validated MOV files
- [ ] Server-configured maximum up to 1 GB
- [ ] Chunk progress, interruption recovery, and resume through the Phase 5A session model
- [ ] Poster image and public web-ready preview policy
- [ ] Private-original access rules
- [ ] Abandoned and partially finalized video cleanup
- [ ] Provider quota validation
- [ ] Project-gallery video rendering through public previews only

The current Phase 4 multipart Edge Function is a small-file path. Its request limit must not simply be raised to 1 GB; Phase 5B depends on the resumable transport and durable lifecycle established in Phase 5A.

### Phase 5C — Other large originals

- [ ] Separately approve and feature-gate raw high-resolution photographs
- [ ] Separately approve and feature-gate large PDFs
- [ ] Separately approve and feature-gate downloadable masters, source files, and project archives
- [ ] Reuse the Phase 5A session, validation, preview, quota, recovery, and cleanup boundaries

### Retired historical-media migration

Historical-media migration is retired. Existing Supabase public files remain unchanged and monitored. The application has no migration trigger, browser transformation task, migration upload authorization, retry action, or automatic source-deletion path.

### Phase 7 — Provider expansion and production hardening

- [ ] Add OneDrive, Dropbox, and S3-compatible storage one provider at a time
- [ ] Operational monitoring and actionable alerts
- [ ] Provider quotas, capacity visibility, cost controls, and usage limits
- [ ] Credential retirement and owner-departure handling
- [ ] Provider-specific folder, filename collision, checksum, and account policies
- [ ] Rollback and recovery drills after Google Drive upload and migration workflows prove stable

## Unresolved decisions

- Whether later phases need a separate confirmation before external-original deletion beyond the existing project-delete confirmation.
- Per-provider folder hierarchy and filename collision policy.
- Phase 5A resumable chunk size, session expiry, cancellation, and abandoned-session rules.
- Maximum external original sizes and the threshold that requires resumable transport.
- Quota-reservation and capacity-check behavior before initiating a large upload.
- Checksum strategy where providers do not expose a compatible digest.
- Video container/codec validation, MOV acceptance rules, poster generation, and public web-ready preview format.
- Private-original access and download authorization rules.
- Quota display, shared-drive/team-account policy, and owner-departure handling.
- Whether historical shared CMS media is assigned to a Super Admin owner or remains platform-owned.
- The explicit authorization model, if any, for assistants uploading into another owner's connected storage.
