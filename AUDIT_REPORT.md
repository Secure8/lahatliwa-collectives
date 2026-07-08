# Publishing and Security Audit

## Status

The project is ready for a production build after the Supabase migrations are applied in order.

Checked:

- React + Vite production build
- Supabase schema cache fix for `show_hero_portrait`
- Supabase schema support for `divider_line_color`
- Admin settings retry fallback for missing optional visual columns
- Public homepage portrait visibility logic
- Services page logo/icon CMS flow
- Home services preview using the same Services CMS icons
- Admin settings save payloads and fallbacks
- Upload type validation and automatic WebP compression
- Dependency audit
- Deployment headers
- Secret ignore rules
- Placeholder email/social fallback cleanup
- Supabase Security Advisor cleanup SQL

## Security Hardening Added

- Added `supabase/security_hardening.sql`.
- Added `supabase/security_advisor_fixes.sql`.
- Added an `admin_users` allowlist table.
- Added private `is_admin()` and `is_owner()` database helpers for RLS policies.
- Changed production write access from "any authenticated user" to explicit admins only.
- Restricted project, site settings, page content, media asset, and storage writes to admins.
- Removed broad public Storage object listing while keeping public bucket URLs usable for images.
- Removed admin allowlist dependency on public RPC-callable security-definer functions.
- Fixed the `public.set_updated_at` function search path.
- Kept public read access for published portfolio content and public image display through public bucket URLs.
- Added Vercel security headers in `vercel.json`.
- Added upload type validation for project images, site images, and icon/media uploads.
- Added automatic WebP compression for raster image uploads larger than 5 MB.
- Added a dependency override for `dompurify` and verified `npm audit` reports zero vulnerabilities.
- Removed fake fallback contact links so unconfigured public builds do not show placeholder email or `#` social URLs.
- Added a frontend retry path so background and portrait image settings can still save if Supabase is temporarily missing optional visual columns. Running the migration remains the permanent fix.

## Required Supabase Order

Run these in the Supabase SQL editor in this order:

```text
supabase/schema.sql
supabase/cms_update.sql
supabase/visual_cms_update.sql
supabase/security_hardening.sql
supabase/security_advisor_fixes.sql
```

Then add your admin user:

```sql
insert into public.admin_users (user_id, role)
values ('YOUR_SUPABASE_AUTH_USER_ID', 'owner')
on conflict (user_id) do update set role = excluded.role;

notify pgrst, 'reload schema';
```

Find `YOUR_SUPABASE_AUTH_USER_ID` in Supabase Authentication after creating your admin account.

## Important Notes

- Do not put a Supabase service role key in frontend code, `.env.local`, or Vercel.
- Keep only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel.
- If Supabase shows a schema cache error, rerun the latest migration and confirm it ends with `notify pgrst, 'reload schema';`.
- The app can skip missing optional visual columns during settings save, but those skipped settings will not persist until `supabase/visual_cms_update.sql` is applied.
- If you use a custom Supabase domain, update `vercel.json` so the CSP allows that domain.
- After running `security_hardening.sql` and `security_advisor_fixes.sql`, login alone is not enough. The user must also exist in `admin_users`.
- Enable leaked password protection in Supabase Dashboard under `Authentication -> Providers -> Email`. Supabase uses HaveIBeenPwned/Pwned Passwords for this protection.
- Set the real contact email and social links in `/admin/settings` before publishing.
- Set the preferred major divider color in `/admin/settings` after running the latest visual CMS migration.

## Verification

- `npm install`: completed
- `npm audit --audit-level=moderate`: completed with zero vulnerabilities
- `npm run build`: completed successfully
- Final leftover scan: no debug logs, task markers, local URLs, obvious service-role key strings, or placeholder domains found
- Frontend RPC scan: no admin allowlist checks depend on public `is_admin` or `is_owner` RPC calls
