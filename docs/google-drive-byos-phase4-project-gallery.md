# Google Drive BYOS Phase 4: Project gallery originals

## Local implementation state

Phase 4 is implemented locally and disabled by default. It is not deployed by this change.

The frontend gate is:

```text
VITE_GOOGLE_DRIVE_PROJECT_GALLERY_ENABLED=false
```

The editor shows Google Drive only when that flag, the existing connector flag, the existing server upload capability, and a connected eligible owner all pass. Supabase remains the default and remains available if Drive is unavailable.

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
- The current prepared/optimized gallery image is the Drive original for this phase; raw high-resolution source preservation and resumable uploads are later work.
- The existing 2 MB secure Edge upload ceiling remains; gallery optimization normally produces a file no larger than 1 MB.
- Google Drive is not registered as a generic operational or public-delivery provider.
- Phase 4 does not migrate or rewrite existing project media.

## Deployment prerequisites for a later approved rollout

1. Deploy the updated `google-drive-upload` and `google-drive-connection-check` functions.
2. Deploy the new `google-drive-media-lifecycle` function.
3. Confirm `GOOGLE_DRIVE_UPLOAD_ENABLED=true` remains intentional on the server.
4. Build the frontend with `VITE_GOOGLE_DRIVE_PROJECT_GALLERY_ENABLED=true` only after controlled review.
5. Verify an eligible owner, a disconnected owner, a reconnect-required account, partial failure cleanup, public preview rendering, media removal, and draft project deletion.

Do not apply SQL for Phase 4; none is introduced.
