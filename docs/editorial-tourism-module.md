# Aklan Tourism Portal and Liwa Editorial Studio

## Release state

This module is additive and fail-closed. It creates no tourism claims or demo records. The migration inserts one feature-flag row with every release flag set to `false`. Until an authorized administrator explicitly enables the flags, the existing public site remains unchanged, tourism routes resolve to the existing not-found experience, Editorial Studio reports that it is disabled, editorial inquiry context is unavailable, and editorial R2 uploads are rejected server-side.

Nothing in this implementation deploys migrations, Edge Functions, Vercel assets, schedules, or production data.

## Architecture

- The existing React Router tree remains authoritative. Public tourism and private editorial pages are route-level lazy chunks.
- The existing `ProtectedRoute` session and `admin_users` record remain authoritative for private access.
- `src/features/editorial/editorialCapabilities.js` is the frontend capability map. The migration mirrors the same decisions in `private.has_editorial_capability` so UI hiding never substitutes for database authorization.
- `editorial_revisions.document` is a versioned allowlisted block document. The browser normalizer and PostgreSQL check both reject unsupported block types and raw HTML/CSS/JavaScript fields.
- `EditorialDocumentRenderer` renders the same safe document in public and preview modes. The editor only creates supported structures.
- Public data is read through RLS-protected tables. Only `published_revision_id` is rendered publicly; working revisions are never public.
- The current inquiry, theme, navigation, R2 derivative, storage budget, cleanup, and audit foundations are reused.

## Roles and capabilities

| Capability | Writer | Editor | Admin | Super Admin |
| --- | --- | --- | --- | --- |
| Enter Editorial Studio | Yes | Yes | Yes | Yes |
| Create, edit own/assigned, submit | Yes | Yes | Yes | Yes |
| Review, request changes, approve | No | Yes | Yes | Yes |
| Schedule, publish, archive | No | Yes | Yes | Yes |
| Arrange tourism homepage | No | Yes | Yes | Yes |
| Manage taxonomy, contributors, settings, audit | No | No | Yes | Yes |

Creative and viewer roles do not receive editorial access. Writer is deliberately excluded from project, creative-profile, website-settings, storage-monitoring, and inquiry routes.

## Routes

Public routes: `/explore`, `/journal`, `/journal/:slug`, `/events`, `/events/:slug`, `/places`, `/places/:slug`, `/activities`, `/activities/:slug`, `/local-products`, and `/local-products/:slug`.

Editorial Studio routes are handled inside `/editorial/*`, including `/editorial`, `/editorial/new`, `/editorial/drafts`, `/editorial/assigned`, `/editorial/review`, `/editorial/content/:id/edit`, `/editorial/content/:id/preview`, `/editorial/homepage`, `/editorial/events`, `/editorial/details`, `/editorial/history`, `/editorial/media`, `/editorial/sources`, and `/editorial/corrections`.

Admin routes are handled inside `/admin/editorial/*`, including overview, content, review, homepage, categories, tags, municipalities, contributors, settings, and audit.

## Database objects

Migration `20260719090000_editorial_tourism_foundation.sql` adds:

- fail-closed feature flags and module settings;
- categories, tags, municipalities, and contributors;
- posts, immutable revisions, per-user autosaves, post tags, type-specific event/place/activity/product details, verified sources, and stable published metadata snapshots;
- homepage sections/items, corrections, and audit events;
- writer role support in the team role constraint and claim policies;
- centralized SQL capability checks;
- RPC-only workflow field protection;
- revision save, conflict detection, restoration, and submit/request-changes/approve/schedule/publish/archive RPCs;
- a service-role function for publishing due scheduled posts;
- `external_media_objects.editorial_post_id`, editorial R2 categories, indexes, and target constraints;
- RLS and minimum grants for public, editorial, and administrator access.

## Workflow

1. A writer, editor, or administrator creates a draft.
2. Saving creates a validated immutable revision and moves `current_revision_id`.
3. Submit moves `draft` or `needs_revision` to `submitted`. Request changes moves it back to `needs_revision`.
4. An editor or administrator requests changes or approves the current revision.
5. An editor or administrator publishes immediately or schedules a future time.
6. Only `published_revision_id` and its metadata/details snapshot are publicly readable. Starting a new revision keeps that snapshot live until the replacement is approved and published.
7. Archive removes the public record without deleting its revisions and records an audit event. Editors can restore an older revision as a new immutable revision.

The editor keeps a bounded, validated per-user autosave after a 1.2-second debounce. Formal saves use `current_revision_id` as an optimistic-concurrency token; a newer server revision returns `EDITORIAL_REVISION_CONFLICT` instead of silently overwriting work.

Direct client updates cannot modify protected workflow fields. The trigger requires the controlled RPC transaction marker.

Scheduled publication is implemented as the service-role-only `private.publish_due_editorial_posts()` function. A scheduler is intentionally not created automatically because the repository does not currently define a trusted database cron convention. Configure an approved Supabase Cron job after review, or publish scheduled records manually. The release flag can remain off until that operational choice is made.

## Managed media and cleanup

Editorial cover and inline images use the existing three-variant WebP R2 path. The browser never receives R2 credentials. Both R2 Edge Functions verify the editorial feature flag, active team account, role, ownership/assignment, draft status, and target record.

Deletion and expiry checks scan `editorial_posts.cover_image_url` plus every revision document for any URL in the media group. Any query error fails closed. Supabase object reconciliation also includes posts, revisions, municipalities, and editorial settings. Deploy the migration before the updated cleanup worker so those reference tables exist.

The current editor exposes managed cover upload when `editorial_media_uploads_enabled` is true. Inline blocks accept only HTTPS or same-origin paths; a richer asset picker can be added later without changing the stored document contract.

Editors can attach and verify HTTPS sources in the Studio Sources workspace. Only verified source records are exposed on public detail pages. Admin/Super Admin homepage composition supports private section creation, visibility control, published-story placement, removal, and ordering; the separate homepage flag remains the final release gate.

## Contextual inquiries

Tourism detail pages show `Inquire` only when `public_inquiries_enabled` is true. The browser submits a bounded type/slug hint. `submit-service-request` rechecks the feature flag and resolves a matching published post with the service role; it stores only canonical ID, type, slug, and title in `request_metadata`. A spoofed or unpublished context is rejected. Existing inquiry delivery, rate limits, idempotency, and admin viewing remain authoritative.

## Deployment order (not performed)

1. Review and back up the target Supabase project.
2. Apply `20260719090000_editorial_tourism_foundation.sql` while all new flags remain off.
3. Verify RLS with disposable writer, editor, admin, creative, and anonymous sessions.
4. Deploy `r2-media`, `r2-media-upload`, `process-storage-cleanup`, `submit-service-request`, and `invite-team-member`.
5. Run cleanup dry-run and confirm editorial reference-source counts appear with no scan error.
6. Deploy the Vercel frontend while flags remain off; verify the existing site and admin routes.
7. Invite disposable writer/editor accounts and test the complete workflow with non-public test wording.
8. If scheduled publication is required, configure and verify an approved service-role scheduler for `private.publish_due_editorial_posts()`.
9. Enable `module_enabled` and `editorial_studio_enabled` first.
10. Enable `editorial_media_uploads_enabled` only after R2 upload/replacement/cleanup tests pass.
11. Publish reviewed real content, then enable `public_portal_enabled` and optionally `public_inquiries_enabled`.
12. Enable `homepage_tourism_enabled` last. It is independent from the public route flag and renders only configured, visible sections with published records.

## Disable and rollback

For the quickest safe rollback, turn off `homepage_tourism_enabled`, then `public_inquiries_enabled`, `public_portal_enabled`, `editorial_media_uploads_enabled`, `editorial_studio_enabled`, and finally `module_enabled`. These fail-closed controls hide the additive surfaces without affecting projects, creatives, the normal inquiry route, or existing public media. Do not roll back by deleting published records or R2 objects. If application rollback is required, redeploy the previously approved frontend and Edge Function versions while leaving the additive tables in place; schema removal should be a separately reviewed maintenance change after a backup and reference audit.

## Local verification commands

- `npm run test:editorial`
- `node --test`
- `npm run build`
- `npm audit --audit-level=high`
- `git diff --check`

## Existing configuration reused

No new Vercel variable or Supabase secret is introduced. The module reuses:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `PUBLIC_SITE_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `R2_MEDIA_ENABLED`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `R2_PUBLIC_BASE_URL`
- inquiry secrets already required by `submit-service-request`, including `INQUIRY_RATE_LIMIT_SECRET` and the configured email-delivery values.

## Manual acceptance test

1. Keep all flags off and confirm the existing homepage, projects, creatives, inquiry, and admin UI are unchanged. Confirm `/explore` does not expose the module.
2. Enable module + studio only. Sign in as Writer; create a disposable journal draft, add every supported block, save, preview, and submit. Confirm project/admin settings routes remain restricted.
3. Sign in as Editor; request changes, have Writer save a new revision, then approve. Confirm Writer cannot approve or publish through direct API calls.
4. Upload a disposable cover. Save it, replace it, run cleanup dry-run, and confirm the active revision/cover prevents deletion. Remove the reference and confirm cleanup is queued, never immediately assumed safe.
5. Publish with non-factual test wording clearly marked `TEST — NOT TOURISM INFORMATION`.
6. Enable the public portal. Test every index/detail route at mobile and desktop sizes, filters/back-forward history, metadata, keyboard order, images, and corrections.
7. Enable contextual inquiries. Submit from the disposable detail page and confirm canonical context appears in the existing inquiry details. Try a changed slug and confirm rejection.
8. Archive the disposable post. Confirm it disappears publicly, its working history stays private, and the audit event remains available to Admin/Super Admin.
9. Delete only the disposable database records through an approved maintenance process after confirming media cleanup. This implementation does not add destructive UI deletion.

## Known operational limitations

- No real tourism content or seeded claims are included.
- Scheduled publication needs an approved external scheduler, as described above.
- The existing application does not provide a general notification center or analytics product, so the module does not invent one. Workflow audit is complete; email/in-app editorial assignment notifications can be added against a future authoritative notification system.
- Type-specific event/place/activity/product fields have a dedicated Studio form, RLS, public rendering, expiry support, and stable publication snapshots. The shared canvas intentionally supports the bounded initial block set rather than every optional block proposed in the product blueprint; related-content, map, video, and inline managed-asset-picker blocks remain future extensions to the same allowlisted schema.
- Inline managed-media upload uses the same safe document URL contract, but the first UI exposes managed cover upload only. The feature flag should stay off if a full inline asset picker is a release requirement.
