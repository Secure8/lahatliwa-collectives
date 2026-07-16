# Cloudflare R2 public-media deployment runbook

This runbook describes a staged deployment. It does not authorize production changes. Existing Supabase and Google Drive files are not migrated or deleted by this rollout.

## 1. Architecture and security boundary

- The browser creates three website-ready WebP derivatives: `thumbnail` (up to 640 px/350 KB), `display` (up to 1800 px/1.2 MB), and `expanded` (up to 2800 px/2.5 MB).
- `r2-media` authenticates the user, verifies project/profile/site permission, selects every object key, and creates private metadata records.
- The browser sends each small derivative to `r2-media-upload`. That function validates the registered ID, group, extension, MIME type, byte size, WebP signature, category, owner, and current permission before it signs a server-to-server R2 request.
- No R2 access key ID, secret, object key, Authorization header, or unrestricted signed URL is returned to the browser.
- Supabase stores provider-neutral lifecycle metadata. Public project/profile records store only a trusted public R2 URL, or an existing Supabase reference during fallback.
- The public site changes `expanded.webp` to the appropriate sibling derivative for cards and gallery display. It uses ordinary unauthenticated HTTPS GET requests to the configured media domain.
- `process-storage-cleanup` deletes queued R2 objects, retries failures, treats 404 as success, and cleans expired incomplete/unreferenced uploads.
- A brand-new project or creative profile has no database ID that the server can authorize yet, so its first media selection uses the Supabase rollout fallback. Once the record exists, replacements and additional images use R2 when the feature is enabled. This avoids accepting client-selected, unattached R2 destinations.

## 2. Cloudflare account, bucket, and public delivery

1. In the intended Cloudflare account, create one R2 bucket dedicated to public website derivatives, for example `lahat-liwa-public-media`.
2. Do not place private originals, source archives, credentials, or user-provided arbitrary files in this public bucket.
3. Attach the production custom domain, preferably `media.lahatliwa.studio`, to the bucket and complete DNS validation.
4. Confirm the public base is HTTPS, has no path query, embedded credentials, or redirect to an untrusted origin.
5. Keep Cloudflare's development `r2.dev` URL disabled in production if the custom domain is the intended only delivery origin.
6. Configure cache behavior for immutable versioned object keys. Objects are never overwritten; replacements receive a new UUID group.

The current upload transport is an authenticated Supabase Edge proxy, so browser-to-R2 PUT CORS is not required. If bucket CORS is configured for public delivery, allow only `GET` and `HEAD` from the production site and local test origins; do not enable browser writes. Recheck CORS if the upload architecture changes later.

## 3. R2 API token

Create a bucket-scoped R2 API token with object read/write permission for only the public-media bucket. Avoid account-wide administrative permissions. Record its Access Key ID and Secret Access Key once, then store them only as Supabase Edge secrets. Never add either value to Vercel, source control, a `VITE_*` variable, browser logs, or database public columns.

## 4. Supabase secrets

Configure these only for Edge Functions:

- `R2_MEDIA_ENABLED=true`
- `R2_ACCOUNT_ID=<Cloudflare account ID>`
- `R2_ACCESS_KEY_ID=<bucket-scoped token access key ID>`
- `R2_SECRET_ACCESS_KEY=<bucket-scoped token secret>`
- `R2_BUCKET_NAME=<exact R2 bucket name>`
- `R2_PUBLIC_BASE_URL=https://media.lahatliwa.studio`
- Existing `PUBLIC_SITE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`
- Existing `STORAGE_CLEANUP_WORKER_SECRET` for the cleanup worker

`R2_MEDIA_ENABLED` should remain true on the server after the first R2 objects exist, even during a frontend rollback, so deletion and cleanup remain possible. Roll back new uploads with the frontend flag instead.

## 5. Vercel variables

The only new browser-safe setting is:

- `VITE_R2_MEDIA_ENABLED=false` during backend deployment and verification; change to `true` only for the staged activation.

Do not configure any R2 account ID, bucket, access key, secret, object key, or signing material in Vercel. Keep the existing Supabase public URL/anon key and any intentionally enabled legacy Google Drive UI flags unchanged until product owners choose otherwise.

## 6. Migration and Edge Function deployment order

1. Back up the database schema and confirm the current external-storage completion migration is present.
2. Apply `20260716090000_external_storage_completion.sql` if it is not already applied.
3. Apply `20260716110000_cloudflare_r2_public_media.sql` exactly once.
4. Deploy `r2-media-upload`.
5. Deploy `r2-media`.
6. Deploy the changed `process-storage-cleanup` worker.
7. Verify the existing cleanup schedule still calls the changed worker and its status endpoint is healthy.
8. Add/verify the Supabase secrets, leaving the Vercel frontend flag false.
9. Deploy the frontend with `VITE_R2_MEDIA_ENABLED=false`; confirm all existing Supabase URLs still render and uploads use the fallback.
10. Perform the disposable test below in a controlled environment. Only then enable `VITE_R2_MEDIA_ENABLED=true` for a limited production cohort/build.

The migration adds R2 provider metadata, derivative/group/public URL fields, provider-aware cleanup jobs, and a provider-aware job claim response. It does not copy, rewrite, or delete existing media.

## 7. Disposable end-to-end test

Use one draft project that can be deleted and one noncritical creative profile.

1. Sign in as an active account with project-edit permission. Confirm an unrelated viewer cannot upload.
2. Create or open the disposable draft, select a large JPEG/PNG with camera orientation metadata, and add it through the normal gallery uploader.
3. Confirm the UI mentions website image preparation but never R2, a bucket, object key, lifecycle status, or signed URL.
4. In browser network tools, confirm upload calls go only to Supabase Functions. Confirm responses contain media IDs, variants, and public URLs only—no R2 access key ID, secret, object key, Authorization header, or signed R2 URL.
5. Save the project. Confirm the public record points to `https://media.lahatliwa.studio/.../expanded.webp` and that `thumbnail.webp`, `display.webp`, and `expanded.webp` all load.
6. Confirm project cards request `display.webp`; confirm the gallery uses `display.webp` and opens `expanded.webp`.
7. Replace the image. Simulate one failed upload and confirm the old public image still renders. Retry successfully, save, and confirm the reference switches only after verification.
8. Run the cleanup worker after the old group is queued. Confirm all three old variants are deleted, their jobs complete, and a second run remains successful.
9. Remove a gallery image and confirm it is not deleted while still referenced, then is queued after the reference is removed.
10. Replace and remove the creative profile photo. Confirm the thumbnail/display behavior and cleanup.
11. Delete the disposable draft. Confirm cleanup preparation occurs before the database deletion and the R2 group is queued only after deletion authorization is finalized.
12. Disable only `VITE_R2_MEDIA_ENABLED`, redeploy the frontend test build, and confirm new uploads fall back to Supabase while existing R2 media continues to render and cleanup still works.

Do not declare production readiness until upload, delivery, replacement, deletion, worker retry, and rollback have all been observed against the live Cloudflare/Supabase configuration.

## 8. Monitoring and failure handling

- Monitor `storage_cleanup_jobs` by provider and status. Investigate rows reaching `manual_review`/manual-required lifecycle state.
- Monitor expired R2 uploads. Registered but unfinished groups are idempotently deleted; verified groups remain provisional for 24 hours until attached. The worker retains and activates a group if a live reference is found.
- A missing R2 object is treated as successful cleanup.
- A disabled or invalid R2 server configuration blocks deletion of a project that has registered R2 objects rather than silently orphaning them.
- Public 404s should be checked against the metadata group and cleanup history before any manual record edit.

## 9. Rollback

1. Set `VITE_R2_MEDIA_ENABLED=false` and redeploy the frontend. This sends new uploads through the existing Supabase fallback.
2. Keep R2 secrets and `R2_MEDIA_ENABLED=true` in Supabase so existing delivery, project deletion, and cleanup continue.
3. Do not roll back the database migration while R2 metadata or cleanup jobs exist.
4. Do not remove the custom domain while published records reference it.
5. Diagnose and correct the backend, retest with a disposable draft, then re-enable the frontend flag.

## 10. Google Drive transition and later cleanup

- The project editor no longer exposes Upload original, Upload project file, private-original, Drive-only, or archive panels.
- Existing Drive OAuth, connection verification, disconnect, private-file lifecycle, migrations, and cleanup code remain isolated for legacy records and a possible future optional private-backup feature.
- Existing Google Drive files and Supabase previews are untouched. Legacy Drive-backed gallery records continue rendering only their safe Supabase preview.
- The Storage page can still expose the separately flagged Google Drive connector/test tool to eligible users; it is not part of normal website media upload.
- Later removal can delete the unused `ExternalProjectFiles`, legacy gallery-upload helpers, Drive upload functions, flags, and related tests only after production metadata proves no active legacy records or product dependency remains. That later cleanup must be a separate reviewed change and must not delete provider files implicitly.
