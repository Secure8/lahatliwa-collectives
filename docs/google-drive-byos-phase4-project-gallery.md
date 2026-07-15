# Google Drive BYOS Phase 4: Project gallery originals

## Verified production state

Phase 4 is complete, deployed, enabled, and verified end to end in production project `fgelzlxfqeooxvvcpndd`. Supabase remains the default gallery destination. Eligible editors may explicitly select Google Drive Originals for newly added JPEG, PNG, or WebP project-gallery images.

The production frontend configuration is:

```text
VITE_GOOGLE_DRIVE_PROJECT_GALLERY_ENABLED=true
```

The tracked `.env.example` intentionally remains `false` so a new or local environment cannot enable external gallery uploads accidentally. The editor shows Google Drive only when the production flag, the existing connector flag, the existing server upload capability, and a connected eligible owner all pass. Supabase remains the default and remains available if Drive is unavailable.

No new SQL is required. Phase 4 uses the existing `external_media_objects` preview columns and the Phase 3 restricted browser grants. Do not broaden those grants.

## Supported flow

Phase 4 supports newly selected JPEG, PNG, and WebP project-gallery images only:

1. Validate and optimize the image using the current gallery-image limits.
2. Upload the prepared image privately to the managed Google Drive `Originals` folder through `google-drive-upload` with the server allowlisted `project_gallery_original` purpose.
3. Upload the same prepared image to the public Supabase `project-media/projects/gallery` path as the gallery preview.
4. Verify that preview server-side and attach its provider, bucket, and path to `external_media_objects` through `google-drive-media-lifecycle`.
5. Store only the safe media-object UUID, safe descriptive fields, and Supabase preview reference in the project gallery item.
6. Public rendering resolves the Supabase preview and ignores any competing URL when a valid external-media reference exists.

Existing string-based `gallery_images` and `gallery_items` continue to render. The preview path also remains in `gallery_images` for backward compatibility with existing admin counts and gallery behavior.

## Cleanup and failure handling

- A Drive failure is shown inline and never falls back silently to Supabase.
- If the Drive original succeeds but preview upload or metadata attachment fails, the new preview and Drive object are synchronously cleaned up.
- If project save fails, only artifacts created during that failed operation are removed. Previously saved media is not deleted.
- Removing saved external media prepares a short-lived, server-verified cleanup authorization before the project reference changes, then deletes by safe media UUID after save.
- Project deletion follows the same prepare-then-delete pattern. Existing Supabase cleanup jobs continue handling only Supabase paths; the existing worker is not taught to accept Drive IDs.
- Provider deletion treats a missing Drive file as an idempotent success. Failed cleanup remains recorded as `error` with a server-only cleanup state for administrator follow-up.

The browser never supplies or receives Drive file IDs, parent folder IDs, account IDs, credential references, tokens, or raw provider metadata.

## Deliberate limitations

- PDFs continue using Supabase Storage.
- Covers, thumbnails, profiles, site/CMS assets, service media, and media-library uploads remain on Supabase.
- The current prepared/optimized gallery image is the Drive original for this phase; raw high-resolution source preservation and resumable uploads are Phase 5 work.
- The existing 2 MB secure Edge upload ceiling remains; gallery optimization normally produces a file no larger than 1 MB.
- Google Drive is not registered as a generic operational or public-delivery provider.
- Phase 4 does not migrate or rewrite existing project media.

The current multipart Edge Function must not have its limit raised to accommodate large files or 1 GB video. Phase 5A must first introduce direct browser-to-provider resumable chunk transport, durable session state, recovery, cancellation, quota checks, and abandoned-session cleanup. Controlled video originals then belong in Phase 5B.

## Verified production deployment

The reviewed rollout deployed the updated `google-drive-upload` and `google-drive-connection-check` functions plus the new `google-drive-media-lifecycle` function. Server upload capability remained explicitly configured, and the frontend was built with `VITE_GOOGLE_DRIVE_PROJECT_GALLERY_ENABLED=true` only after controlled review.

Production verification confirmed:

- Supabase remains the default destination.
- Eligible editors can upload a private Drive image original.
- Public project galleries render the optimized Supabase preview.
- Project data and browser responses exclude raw provider identifiers.
- Retry protection avoids duplicate finalized media.
- Failed saves clean up newly created artifacts.
- Removing saved external media and deleting a project clean up both the Supabase preview and private Drive original.
- Disconnected and reconnect-required states fail safely without removing the Supabase option.

Do not apply SQL for Phase 4; none is introduced.

The corrected Phase 5–7 sequence is maintained in `docs/external-storage-architecture.md`: production resumable uploads and controlled large media first, historical-media migration second, and provider expansion plus production hardening last.
