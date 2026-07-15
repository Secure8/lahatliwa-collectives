# Supabase Security Advisor audit

Audit date: 2026-07-15
Production project: `fgelzlxfqeooxvvcpndd`
Applied after explicit approval: `supabase/security_advisor_hardening.sql`

## Conclusions

| Finding | Classification | Decision |
| --- | --- | --- |
| `storage_connection_operations` SECURITY DEFINER view | Genuine, actionable | Convert to `security_invoker`, add Super Admin RLS, retain safe-column grants. |
| `storage_migration_operations` SECURITY DEFINER view | Genuine, actionable | Convert to `security_invoker`, add Super Admin RLS, narrow authenticated base-table reads to operational columns. |
| `pg_net` in `public` | Genuine hygiene warning, unsafe to change in place | Leave installed. Version 0.20.3 is non-relocatable and an active cleanup Cron job calls `net.http_post` every five minutes. Test a supported Supabase-managed reinstall/upgrade in staging or obtain Supabase Support guidance before any change. |
| `list_eligible_inquiry_creatives()` executable by `anon` | Intentional application permission | Keep `anon` and `authenticated`. The signed-out inquiry form calls it and it returns only five published-profile fields for creatives linked to active Team accounts. |
| `list_eligible_inquiry_creatives()` executable by `authenticated` | Intentional application permission | Keep it so a signed-in visitor opening the public inquiry route gets the same choices. |
| `list_inquiry_team_members()` executable by `authenticated` | Intentional application permission | Keep it. Supabase users share the database role `authenticated`; the function returns rows only when `auth.uid()` belongs to an active Team record. |
| `perform_team_inquiry_action(uuid,text,jsonb)` executable by `authenticated` | Intentional application permission | Keep it. Direct table writes are revoked and this RPC is the command boundary. It rejects non-Team callers before reading an inquiry and performs action-specific assignee/Super Admin checks. |

The audit also found an unnecessary implicit `PUBLIC` execute privilege on `private.is_active_inquiry_team_member(uuid)`. The `private` schema is not available to `anon`, so this was not an anonymous Data API path; the applied migration removes the default grant and retains only authenticated execution for RLS.

## Exact application call sites

- `src/pages/StartProject.jsx:74` calls `list_eligible_inquiry_creatives()` while loading the public inquiry choices.
- `src/pages/admin/AdminInquiries.jsx:63` calls `list_inquiry_team_members()` while loading the authenticated Team workspace.
- `src/pages/admin/AdminInquiries.jsx:118` calls `perform_team_inquiry_action(...)` for workflow controls.
- `src/pages/admin/AdminInquiries.jsx:140` calls `perform_team_inquiry_action(...)` to mark a viewed inquiry as read.
- `src/pages/admin/Storage.jsx:245` reads `storage_connection_operations` only inside the Super Admin operations view.
- No frontend, server helper, or Edge Function calls `storage_migration_operations`.
- No Edge Function calls any of the three listed inquiry RPCs or either operational view.

## Production evidence and application result

- PostgreSQL 17.6. The migration completed successfully with all built-in postconditions and committed its transaction.
- Both operational views now have `security_invoker=true` and retain `security_barrier=true`.
- Both storage base tables retain RLS and now include narrow authenticated `SELECT` policies for active Super Admins. Sensitive connection and migration columns remain unavailable to authenticated clients.
- Anonymous execution of `list_eligible_inquiry_creatives()` returned three eligible published creatives.
- An active creative Team identity received five rows from `list_inquiry_team_members()`.
- The active Super Admin saw two safe connection-operation rows. A non-Team authenticated identity and an active non-Super Team identity each saw zero connection and migration operation rows.
- An authorized Super Admin `mark_read` action succeeded through `perform_team_inquiry_action(...)`; a non-Team authenticated identity was rejected by the function's active-Team check.
- `pg_net` remains version 0.20.3, owned by `supabase_admin`, in `public`, and non-relocatable.
- The active `process-storage-cleanup-every-5-minutes` Cron job remains on `*/5 * * * *`; its active state, database, username, schedule, and command MD5 are identical to the pre-apply baseline.
- A post-apply Advisor run no longer reports either SECURITY DEFINER view error. The intentional RPC warnings and documented `pg_net` warning remain.

All listed SECURITY DEFINER functions and their role helpers now use an empty `search_path`; every referenced relation/helper is schema-qualified. There is no dynamic SQL in the action RPC. Its return value contains only success, inquiry ID, and action.

## Possible breaking changes

- Authenticated clients will no longer be able to read sensitive `storage_migrations` fields (`media_object_id`, destination connection/file IDs, source bucket/path, or verification details) directly. Repository-wide search found no caller. A future owner-facing migration UI must use a reviewed RPC or a separate owner-only safe view.
- The three intentional SECURITY DEFINER RPC warnings will remain in Security Advisor. Revoking them would break the public inquiry form or Team workspace. They should be tracked as reviewed exceptions unless the application is redesigned around new database roles or a separate trusted API.
- The `pg_net` warning will remain. Moving or reinstalling it without a supported procedure could interrupt cleanup scheduling and discard extension-owned queue/response state.
- The service role loses unnecessary direct execute/select grants on the listed RPCs and safe views. Current Edge Functions use neither; service-role access to underlying storage tables is unchanged.

## Phase 4 conflict review

No Phase 4 file is changed by this audit. The frontend flag remains `VITE_GOOGLE_DRIVE_PROJECT_GALLERY_ENABLED=false`.

The applied SQL does not mention `external_media_objects`, the Phase 4 media lifecycle function, provider payloads, or Google Drive feature flags. It preserves the Phase 3 safe `storage_connections` columns used by the Storage page and Phase 4 connection checks. Edge Functions continue using the service role against base tables, so the new authenticated Super Admin RLS policies do not alter their behavior. There is no Phase 4 SQL migration to conflict with.

## Verification results

- All 20 configured `test:*` scripts passed.
- The isolated Security Advisor suite passed 6/6 tests, including the public, non-Team authenticated, owner/Super Admin, Team-member, and admin permission matrix.
- The Vite production build passed (1,739 modules transformed).
- `git diff --check` passed; only existing line-ending conversion warnings were printed.
- Phase 4 was SHA-256 checked before and after the audit: all 29 pre-existing modified/untracked Phase 4 files were byte-for-byte unchanged.
- The repository has no configured lint or standalone type-check command, so neither could be run separately.
- The production migration completed successfully; its built-in postconditions verified view options, sensitive-column denial, and RPC grants before commit.

## Rollback SQL

This rollback restores the production state observed before the proposed migration. Review it again against live catalogs before use.

```sql
begin;

alter view public.storage_connection_operations reset (security_invoker);
alter view public.storage_migration_operations reset (security_invoker);

drop policy if exists "Super Admins can read storage connection operations" on public.storage_connections;
drop policy if exists "Super Admins can read storage migration operations" on public.storage_migrations;

revoke select on table public.storage_connections from authenticated;
grant select (
  id, owner_user_id, provider, provider_account_email, display_name, status,
  is_default, capabilities, connected_at, last_verified_at, last_error_code,
  last_error_message, created_at, updated_at, root_folder_health, disconnected_at
) on table public.storage_connections to authenticated;
grant select on table public.storage_migrations to authenticated;

revoke all on table public.storage_connection_operations from public, anon, authenticated;
revoke all on table public.storage_migration_operations from public, anon, authenticated;
grant select on table public.storage_connection_operations to authenticated, service_role;
grant select on table public.storage_migration_operations to authenticated, service_role;

alter function private.user_role(uuid) set search_path = public, private, pg_temp;
alter function private.has_role(uuid, text[]) set search_path = public, private, pg_temp;
alter function private.is_active_inquiry_team_member(uuid) set search_path = public, private, pg_temp;
alter function public.list_eligible_inquiry_creatives() set search_path = public, private, pg_temp;
alter function public.list_inquiry_team_members() set search_path = public, private, pg_temp;
alter function public.perform_team_inquiry_action(uuid, text, jsonb) set search_path = public, private, pg_temp;

revoke all on function public.list_eligible_inquiry_creatives() from public;
grant execute on function public.list_eligible_inquiry_creatives() to anon, authenticated, service_role;
revoke all on function public.list_inquiry_team_members() from public, anon;
grant execute on function public.list_inquiry_team_members() to authenticated, service_role;
revoke all on function public.perform_team_inquiry_action(uuid, text, jsonb) from public, anon;
grant execute on function public.perform_team_inquiry_action(uuid, text, jsonb) to authenticated, service_role;
grant execute on function private.is_active_inquiry_team_member(uuid) to public, authenticated;

notify pgrst, 'reload schema';
commit;
```

No Edge Function or frontend deployment was performed, and Phase 4 remains disabled.
