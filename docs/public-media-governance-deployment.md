# Public-media governance, migration, and accounting runbook

This document describes the local implementation added after the initial Cloudflare R2 rollout. It is an operator runbook, not authorization to deploy, migrate, modify, or delete production data.

## Architecture

- Existing Supabase and Google Drive references continue rendering through the provider-neutral public URL helpers.
- Every new project and creative profile begins as a server-created incomplete draft with a server-generated UUID and an expiration time.
- All ordinary project, profile, site, branding, service, and media-library image uploads create the existing three WebP derivatives and send them through the authenticated R2 Edge proxy. An unavailable R2 service returns a structured error and preserves the current reference.
- `external_media_objects` remains the media ledger. The governance migration extends it with trusted byte counts, source/destination trace fields, verification, accounting, retention, and reconciliation timestamps. It does not create a competing media registry.
- `storage_migrations` remains the durable migration tracker. Stable identities, bounded claims, stale-lock recovery, retry counts, destination groups, state, retention, and cleanup timestamps are added to the existing table.
- `storage_reservations` reserves a conservative derivative-set allowance before transfer. Finalization uses R2 `HEAD` results to reconcile the reservation to provider-verified bytes.
- Provider inventory scans run only when a Super Admin explicitly starts reconciliation. Dashboard metrics come from one protected server aggregation and never list every media row in the browser.
- Suspected missing, orphaned, overdue, or unclassified objects are detected and recorded. A repeated finding is promoted only after its recheck time. Reconciliation never deletes an object.
- Physical deletion remains in `process-storage-cleanup`, including retained migrated Supabase sources. The worker rechecks live references immediately before queuing a retained source.

## Migration states

`not_started` → `in_progress` → `uploaded` → `verified` → `activated` → `retained_for_rollback` → `queued_for_source_deletion` → `completed`.

`failed`, `manual_review`, `paused`, `cancelled`, and `rolled_back` are non-happy-path states. A failed migration never intentionally switches the source reference. Failed records can be returned to `queued`; stale locks older than 15 minutes are recovered by the bounded claim function.

Discovery identity is a SHA-256 digest of provider, bucket, source path, record type, record ID, field, and optional checksum. The unique migration identity index prevents duplicate discovery records.

## Upload and activation flow

1. Create an incomplete project or creative draft through `r2-media`.
2. Check the protected storage policy before browser transformation or transfer.
3. Reserve the configured conservative derivative allowance.
4. Register the existing media group and three variants using server-generated object keys.
5. Upload through `r2-media-upload`; no unrestricted signed URL or R2 key is returned.
6. Verify byte size and MIME type with server-side `HEAD` requests.
7. Store trusted bytes/checksum metadata and reconcile the reservation.
8. Save the public record, confirm the new reference, activate the group, and queue a replaced group only after the old reference is gone.
9. Mark the incomplete record complete. Expired placeholder drafts whose slug still has the server `draft-` prefix are removed by the cleanup worker.

## Budget policy and reservations

The singleton `storage_policies` row defaults to 9 GiB with a 512 MiB safety reserve. It is configurable by an active Super Admin. Threshold defaults are 60%, 75%, 85%, 90%, 95%, and 100% for information, warning, strong warning, large-upload restriction, non-admin pause, and blocking.

The evaluation includes active trusted R2 bytes, unexpired reservations, the configured reserve, and a conservative complete derivative-set allowance. At 90%, unusually large non-admin uploads are restricted; at 95%, non-admin uploads pause; at 100%, every upload is blocked unless an active Super Admin supplies an explicit reason. Overrides are server-authorized and audited. Reservations are consumed with provider-verified bytes or released after registration, transfer, verification, or cancellation failure.

Dashboard values are labeled as internally tracked, provider verified, estimated, and synchronized-at. They are application measurements, not Cloudflare invoice totals.

## Controlled Supabase migration

Discovery scans only active public database references in the `project-media` bucket. JPEG, PNG, and WebP sources can be queued. RAW, PSD, archives, documents, private Drive files, unknown extensions, unsafe paths, oversized Edge-transform sources, and signature mismatches go to manual review.

Each bounded migration job downloads the source server-side, validates it, creates the three standard WebP variants using pinned ImageMagick WASM, reserves capacity, uploads and verifies every variant, then switches the exact stored reference. The source is retained for the configured rollback period. No source cleanup job is created until the deadline has passed and a fresh reference scan proves that the path is unused.

The Edge transformer is deliberately limited to 5 MiB source images. Larger eligible images are reported for manual/offline migration instead of risking Edge memory or timeout failure.

## Reconciliation and cleanup

- `public-media-migration` scans a bounded R2 ledger/inventory set for missing objects, size mismatches, orphan keys, unclassified keys, and long-lived provisional rows.
- `supabase-media-reconciliation` separately scans a bounded Supabase inventory and reference set for missing migration sources, retained sources past deadline, orphans, and unclassified paths.
- Both write cached `storage_reconciliation_runs` and `storage_reconciliation_findings`. They do not delete or queue deletion.
- A database trigger carries the original detection time forward and promotes a repeated due finding to `confirmed`.
- `process-storage-cleanup` expires reservations, removes only untouched expired placeholder drafts, handles provisional R2 groups, rechecks retained source references, queues due Supabase sources, and performs provider-aware retry/manual-review deletion.

## Security

- Migration discovery, batches, policy changes, global metrics, reconciliation, inspection, manual review, verification, and emergency authorization require an active exact Super Admin in the Edge Function.
- Service-role-only RPCs perform reservation, migration claims, and global aggregation. RLS protects policy, audit, reservation, run, finding, and authorization tables.
- Ordinary authenticated queries do not receive R2 object keys, provider authorization, credentials, or unrestricted upload URLs. The admin migration response exposes only a source filename and safe status metadata.
- Emergency Supabase fallback is disabled by default. When enabled in policy, an active Super Admin must create a ten-minute, one-use, audited authorization. The separate upload accepts only one bounded WebP and is not called by ordinary upload UI.

## Required configuration

Supabase Edge secrets (existing R2 rollout values; no values belong in source control):

- `R2_MEDIA_ENABLED=true`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `R2_PUBLIC_BASE_URL=https://media.lahatliwa.studio`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PUBLIC_SITE_URL`
- `STORAGE_CLEANUP_WORKER_SECRET`

Vercel browser variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_R2_MEDIA_ENABLED=true` after backend verification

Never place R2 credentials, bucket-management credentials, private object keys, the Supabase service role, or cleanup-worker secrets in Vercel `VITE_*` variables.

## Local verification

Run the focused governance and R2 tests, then the complete Node test suite, dependency audits, whitespace check, Edge bundling check, and optimized Vite build. A live migration cannot be proven locally without a configured Supabase project and disposable R2/Supabase objects. Migration transformation now runs sequentially in the authenticated Super Admin browser; the Edge bundle must contain no ImageMagick/WASM import.

## Exact deployment order

1. Back up the production schema and verify migrations `20260716090000` and `20260716110000` are already applied.
2. Verify `20260716140000_public_media_governance.sql` is applied, then apply `20260717140000_browser_public_media_migration.sql` in staging while migration remains paused.
3. Configure/verify the Edge secrets listed above; keep emergency fallback disabled and migration paused.
4. Deploy `r2-media-upload` first so it recognizes migration-scoped uploads.
5. Deploy `public-media-migration`, then `storage-governance`. Redeploy the unchanged reconciliation/cleanup functions only if their deployed versions predate `20260716140000`.
6. Verify the cleanup worker's existing schedule and secret. Do not run source cleanup as part of deployment.
7. Deploy the frontend with `VITE_R2_MEDIA_ENABLED=true` only after the functions pass staging checks. Confirm old Supabase references still render.
8. In Admin → Storage, leave migration paused, run **Scan**, and review unsupported/manual-review sources.
9. Resume migration and use **Migrate one** once. Do not start another record until the first record, public page, ledger, and retained source are confirmed.
10. Run the reconciliation checks below, pause migration again, and only then repeat with another disposable record if desired.

## Rollback

1. Pause migration in Storage immediately. Do not delete R2 groups or retained Supabase sources.
2. Disable new frontend R2 uploads if necessary; new uploads must become unavailable, not fall back silently.
3. Keep the R2 functions, credentials, public domain, ledger columns, and cleanup worker available for already-published R2 references.
4. Revert the frontend/backend code only after confirming its older version can render R2 URLs and will not create Supabase fallback uploads.
5. Do not reverse the governance migration after records use its columns. Use a reviewed forward migration for schema corrections.
6. For an individual migrated reference still inside retention, manually review the migration record and restore its original Supabase reference only after confirming the retained source exists. Mark the migration rolled back; do not delete the R2 group until the restored reference is verified.

## Manual migration test (one disposable project)

1. In staging, create a disposable project whose cover is an existing still JPEG/PNG/WebP below 25 MiB and 40 megapixels. Record the public URL and confirm it loads.
2. Sign in as an active Super Admin. Open Admin → Storage → Public media operations.
3. Keep migration paused. Preview/discover a small batch and confirm the record shows the source filename/category/project, not a private R2 key.
4. Confirm a second discovery does not create a duplicate migration.
5. Resume migration and press **Migrate one** exactly once. Confirm the progress rail advances through prepare, download, each derivative, upload, provider verification, activation, and retention without starting a second record.
6. Confirm all three destination variants are ledger-verified before the project URL changes, the public project loads from `media.lahatliwa.studio`, and the Supabase source still exists.
7. Force or simulate one upload/verification failure on a second disposable image; confirm its original Supabase reference remains active and retry state is visible.
8. Run R2 and Supabase reconciliation. Confirm run timestamps and no deletion. Re-run after the configured interval to validate finding promotion.
9. Do not shorten production retention for testing. In staging only, set a short permitted retention, wait, run cleanup, and confirm a referenced source is protected. Remove the source reference safely, rerun cleanup, and confirm the provider-aware job completes while the audit/migration row remains.
10. Pause migration and delete only the disposable project through normal application cleanup.

## Manual end-to-end new upload test

1. In staging, sign in as an allowed editor and start a disposable project. Before selecting media, confirm an incomplete server draft exists with a UUID and `draft-` slug.
2. Upload a large JPEG/PNG/WebP cover. Confirm the budget check occurs before the three uploads and the browser receives no R2 credential or private object key.
3. Save the project. Confirm the public reference changes only after all variants verify and the draft becomes complete.
4. Replace the cover and simulate R2 unavailability. Confirm the old image remains, the UI shows a structured unavailable message, and no Supabase object or partial active group is created.
5. Retry successfully. Confirm the new group becomes active only after the saved reference changes and the old group is queued for cleanup.
6. Repeat with a new creative profile photo and with a site/branding image.
7. Raise staging usage across the warning thresholds. Confirm informational/warning messages, non-admin large-upload restriction, the 95% pause, and 100% block. Confirm a Super Admin override requires a reason and creates an audit event.
8. Cancel/fail one upload and verify its reservation is released; complete one upload and verify reserved bytes reconcile to provider-verified bytes.
9. Run the cleanup worker twice. Confirm successful deletion is idempotent and failed jobs retry before manual review.

## Assumptions and limits

- Supabase remains the public database and legacy public-media renderer; this phase does not migrate private Drive originals or archive files.
- The existing hidden Google Drive public-preview attachment code still describes Supabase previews and is retained only for legacy compatibility. It is not mounted in the normal project editor and must not be re-enabled without a provider-aware R2 preview update.
- Reconciliation is intentionally bounded. A truncated inventory is reported and requires another paginated/offline operator pass; it is never treated as permission to delete unseen objects.
- R2 list/HEAD results are provider verification at a point in time, not Cloudflare billing data.
