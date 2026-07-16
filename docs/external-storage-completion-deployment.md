# External storage completion deployment runbook

This runbook covers the completed private-original, Drive-only project-file, profile-original, resumable-upload, authorized-access, replacement, archive, and cleanup lifecycle. It does not authorize deployment by itself.

## Production preflight

Before applying the timestamped migration, compare production with the three older standalone external-storage SQL scripts. Confirm that `storage_connections`, `external_media_objects`, the Vault helpers, `private.is_eligible_storage_owner`, folder metadata columns, and restricted browser grants already match the expected Phase 1–3 foundation. Do not replay the standalone scripts blindly.

Confirm the Google OAuth client still uses only `openid`, `email`, `profile`, and `https://www.googleapis.com/auth/drive.file`. Do not add public Drive sharing permissions.

## Required configuration

Vercel build variables:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_GOOGLE_DRIVE_CONNECTOR_ENABLED=true
VITE_GOOGLE_DRIVE_TEST_UPLOAD_ENABLED=true
VITE_GOOGLE_DRIVE_PROJECT_GALLERY_ENABLED=true
```

Supabase Edge secrets:

```text
GOOGLE_DRIVE_OAUTH_ENABLED=true
GOOGLE_DRIVE_UPLOAD_ENABLED=true
GOOGLE_DRIVE_CLIENT_ID
GOOGLE_DRIVE_CLIENT_SECRET
GOOGLE_DRIVE_REDIRECT_URI
PUBLIC_SITE_URL
```

Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_DB_URL`. The Google client secret must never be placed in Vercel or a `VITE_*` variable.

## Deployment order

1. Take a production schema snapshot and compare the existing external-storage foundation with the standalone Phase 1–3 scripts.
2. Apply `supabase/migrations/20260716090000_external_storage_completion.sql` once through the normal migration process.
3. Verify the new columns, constraints, indexes, private Vault-backed upload-session functions, and restricted authenticated column grants.
4. Deploy the updated `google-drive-connection-check` function so all managed subfolders are included in health checks.
5. Deploy `google-drive-resumable-upload`.
6. Deploy `google-drive-file-lifecycle`.
7. Deploy `google-drive-file-access`.
8. Deploy the updated legacy `google-drive-media-lifecycle` compatibility handler.
9. Deploy the updated `admin-member-actions` handler so member departure is blocked while private provider files or an active connection remain.
10. Deploy the updated `process-storage-cleanup` worker and confirm its existing schedule is healthy; it now processes expired resumable sessions before ordinary Supabase cleanup jobs.
11. Run authenticated disposable-account tests before deploying the frontend.
12. Deploy the frontend with the reviewed feature flags, then repeat the public-preview and mobile checks.

Rollback is non-destructive: disable the frontend Drive flags and `GOOGLE_DRIVE_UPLOAD_ENABLED`. Do not delete Drive folders, database rows, Vault secrets, or previews during rollback.

## Disposable end-to-end test

1. Use one disposable active Super Admin or published creative and a disposable Google account.
2. Connect Drive and verify one metadata-managed `Lahat Liwa` root with `Originals`, `Project Files`, `Profile Media`, and `Archive`.
3. Save a disposable project draft, reopen it, and select private-original storage for one gallery image.
4. Confirm the untouched source is in `Originals`; confirm only the optimized preview is in Supabase; publish and verify the public page requests only the Supabase preview.
5. Upload a ZIP, PSD, PDF, document, raw media file, and practical video project file through **Upload project file**. Confirm no Supabase preview is created.
6. Upload a file larger than one 8 MB chunk. Confirm progress, cancel, reselect-to-retry, and final server verification.
7. Open and download an authorized file. Repeat as an unauthorized user and verify access is denied without returning provider metadata.
8. Replace a Drive-only project file. Confirm the replacement becomes active only after verification and the previous file moves to `Archive`.
9. Replace a gallery original. Confirm the new preview is prepared separately, the previous private original is archived, and the public reference changes only when the project is saved.
10. Archive and restore a file. Confirm the Supabase public preview remains available. Then remove only the public preview and confirm the private file remains.
11. Permanently delete a disposable archived file using the explicit confirmation and verify both provider cleanup and lifecycle metadata.
12. Upload and replace both profile and cover media. Confirm private originals use `Profile Media`, public images use Supabase, and disconnect does not break the public profile.
13. Archive the disposable project and confirm private files move to `Archive` without permanent deletion or preview removal.
14. Force one failed provider cleanup or expired upload session in a non-production test environment. Confirm **Cleanup required** appears and retry is permission-checked.
15. Verify regular admin, editor, viewer, unpublished creative, and Auth-only accounts cannot use external storage. Verify a published contributor can view only files for projects they can actually view and cannot edit or delete them without project permission.

## Known operational limits

- Maximum external file size is 5 GB.
- Direct resumable upload uses 8 MB chunks and a one-hour session lifetime.
- Interrupted uploads use a clear reselect-to-retry workflow rather than persisting the provider session URL across browser restarts.
- Supabase Edge proxies authorized private downloads, so platform response-duration and bandwidth limits should be validated with representative large downloads before broad rollout.
- Shared Drives, provider webhooks, quota display/reservation, and historical Supabase-to-Drive migration are not part of this completion migration.
