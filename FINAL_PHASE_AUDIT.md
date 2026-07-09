# Final Phase Audit

Audit date: 2026-07-10

## Summary

This release-readiness pass covered the React/Vite codebase, public routes, admin routes, Supabase migrations, RLS policy posture, storage policy posture, deployment configuration, and build output for the current Lahat Liwa Collectives phase.

The project is build-ready after this pass. The final Supabase cleanup still needs to be applied in the Supabase SQL editor before the live database warnings can be considered resolved.

## Public Routes Checked

Checked by route map review, component import review, data query review, CSP review, fallback-content review, and production build:

- `/`
- `/about`
- `/projects`
- `/projects/:slug`
- `/services`
- `/contact`
- `/creatives`
- `/creatives/:slug`
- `/start-a-project`

Notes:

- Public routes are present in `src/App.jsx`.
- Public pages are still wrapped in `PublicContentProvider`.
- Project detail attribution includes `Work by`, `Published under Lahat Liwa Collectives`, and `Creative Credits`.
- Services page uses Supabase service branches first, while preserving configured CMS service icons/logos when available.
- CSP now allows YouTube iframe embeds and external HTTPS thumbnails/images needed by gallery cards.
- Live data/image checks still need a final browser pass against Supabase production data.

## Admin Routes Checked

Checked by route map review, guarded-route review, role helper review, form/save review, and production build:

- `/admin/login`
- `/admin/dashboard`
- `/admin/team`
- `/admin/projects`
- `/admin/projects/new`
- `/admin/projects/:id/edit`
- `/admin/creatives`
- `/admin/service-branches`
- `/admin/inquiries`
- `/admin/settings`
- `/admin/content`
- `/admin/content/home`
- `/admin/content/about`
- `/admin/content/services`
- `/admin/content/contact`
- `/admin/media/icons`

Notes:

- Admin routes are behind `ProtectedRoute`.
- Restricted team route uses `AdminRouteGuard`.
- Auth refresh no longer remounts the admin route and should not wipe edit progress when returning to a tab.
- Admin pages are route-level lazy-loaded to reduce the initial JS bundle.
- Live role testing still needs to be performed with real `super_admin`, disabled, and lower-role accounts.

## Supabase Warnings Fixed

Added `supabase/final_security_cleanup.sql`.

This migration:

- Recreates `public.set_updated_at()` with fixed `search_path = ''`.
- Replaces broad authenticated write policies for `site_settings`.
- Replaces broad authenticated write policies for `page_content`.
- Replaces broad authenticated write policies for `media_assets`.
- Replaces public project inquiry insert policy with field validation instead of `WITH CHECK (true)`.
- Adds admin-only read/update/delete policies for project inquiries.
- Replaces broad authenticated storage write policies on `project-media`.
- Removes broad public `storage.objects` SELECT/list access for `project-media`.
- Keeps the `project-media` bucket public for existing direct public object URLs.
- Adds admin-only storage object SELECT/list access for `project-media`.
- Allows project-media uploads only for `super_admin`, `admin`, `editor`, and `creative`.
- Restricts project-media update/delete to `super_admin` and `admin`.

Added follow-up storage cleanup migration:

- `supabase/final_storage_policy_cleanup.sql`
- Drops the old broad public SELECT/list policies for `storage.objects`.
- Recreates admin-only listing plus restricted team upload and admin update/delete policies.

## Supabase Warnings Accepted Or Remaining

- Leaked password protection is not fixable by SQL.
- Supabase leaked password protection requires Supabase Pro or above.
- If this project is on Supabase Free plan, accept this warning for now.
- Recommend strong admin passwords, limited admin accounts, and enabling leaked password protection after upgrading to Supabase Pro.

Historical migration files still contain older broad policies and old public helper references because they are migration history. Current/live policy posture is corrected by later migrations, especially `supabase/security_advisor_fixes.sql`, `supabase/team_rbac_upgrade.sql`, and `supabase/final_security_cleanup.sql`.

## Security Notes

- Current admin policy checks use private helpers such as `private.is_admin`, `private.is_owner`, and `private.has_role`.
- `public.is_admin` and `public.is_owner` are not re-enabled.
- `.env.local` is ignored by git and is not tracked.
- `.env.example` contains only safe placeholder keys.
- Frontend code uses only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- No service role key was found in frontend source or config scans.
- Vercel should only use `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

## Code Cleanup Performed

- Added admin route-level lazy loading in `src/App.jsx`.
- Removed empty temporary Vite log files.
- Updated package metadata from old `hevv-portfolio` naming to `lahat-liwa-collectives`.
- Cleaned old public defaults in `src/data/siteContent.js`.
- Updated public meta description in `index.html`.
- Updated README title and intro.
- Reduced remaining admin-only large radius and heavy shadow classes.
- Cleaned service wording from "Creative branches" to "Service branches".
- Updated CSP in `vercel.json` for YouTube embeds and external HTTPS images.
- Kept service branch content intact and preserved Tech branch repair SQL.

## Unused Files Removed

- `.codex-vite.err.log`
- `.codex-vite.out.log`

No migrations were deleted.

## Known Limitations

- Full live route testing requires a running Supabase project with representative project, creative, gallery, service branch, media, and inquiry data.
- Full admin workflow testing requires authenticated users for `super_admin`, `admin`, `editor`, `creative`, `viewer`, and disabled states.
- Storage ownership for editor/creative uploads is role-limited but not project-path ownership-limited because current upload paths do not encode a project owner before project creation.
- Historical migrations still show old broad policy text in source scans, but final current-state migrations override those policies.

## Recommended Next Steps

- Apply `supabase/final_security_cleanup.sql` in Supabase.
- Apply `supabase/restore_tech_service_branch.sql` if the live service branch table still contains the old seeded Creative row.
- Confirm Supabase security advisor warnings are reduced.
- Perform a browser pass on live public routes after Vercel redeploy.
- Perform an authenticated admin pass with a real `super_admin` account.
- Add lower-role test accounts for editor/creative/viewer before inviting real team members.

## Deployment Checklist

- Vercel production domain: `https://www.lahatliwa.studio`
- Supabase Auth Site URL: `https://www.lahatliwa.studio`
- Supabase Auth Redirect URLs:
  - `https://www.lahatliwa.studio`
  - `https://www.lahatliwa.studio/*`
  - `https://lahatliwa.studio`
  - `https://lahatliwa.studio/*`
- Vercel environment variables:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

## Before Pushing Live

1. Run `supabase/final_security_cleanup.sql`
2. Run `supabase/final_storage_policy_cleanup.sql`
3. Confirm Supabase warnings are reduced
4. Confirm current user remains `super_admin`
5. Run `npm.cmd run build`
6. Commit and push
7. Wait for Vercel redeploy
8. Test live public/admin routes

## Final Verification

- `npm.cmd run build` passed.
- Admin pages are code-split and the previous Vite chunk-size warning was removed by route-level lazy loading.
- `.env.local` is not tracked.
- No frontend service role key was found.
- The app is ready for public viewing after applying the final SQL migration and completing the live browser/admin pass.
