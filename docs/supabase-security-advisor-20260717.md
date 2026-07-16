# Supabase Security Advisor hardening — 2026-07-17

This change is local only. Nothing in this document has been deployed or applied to a live database.

## Current code posture

- The three public-media aggregate views are changed to security-invoker views and have no direct browser-role grants.
- Global storage monitoring continues through `storage-governance`, which authenticates an active Super Admin and calls the protected governance snapshot RPC with the service role.
- `get_my_public_media_usage()` still derives its only owner filter from `auth.uid()` and accepts no user ID. There is no current frontend caller, so execution is restricted to `service_role`.
- The public inquiry form obtains published, eligible creative display options from `inquiry-public-options`. Its response contains only `id`, `name`, `slug`, `role`, and `profile_image_url`.
- The inquiry dashboard obtains its safe Team list and performs transactional actions through `inquiry-workflow`. That function validates the caller's JWT and active Team account before either action.
- Direct browser execution is revoked from the three inquiry SECURITY DEFINER functions reported by Security Advisor.

## Why pg_net is deferred

Repository evidence shows the storage cleanup cron calls `net.http_post`. The prior catalog audit recorded `pg_net` as non-relocatable and owned by the managed `supabase_admin` role. Moving or recreating it in an ordinary application migration could disable cleanup scheduling or a Supabase-managed dependency. The 2026-07-17 migration therefore contains no extension DDL and no destructive dependency operation. The advisor warning is expected to remain until separate maintenance is completed.

## pg_net maintenance procedure

Perform this only against a staging project first and during an approved production maintenance window:

1. Export the installed extension row and supported versions from `pg_extension` and `pg_available_extension_versions`, including owner, namespace, version, and `relocatable` metadata.
2. Export every dependency from `pg_depend`, every active `cron.job`, all functions and triggers whose definitions contain `net.http_`, and any configured database webhook.
3. Record pending request and response queue counts from the installed `net` schema using the tables/views available in that exact extension version.
4. Pause only the documented application-owned cleanup cron jobs. Wait for in-flight requests to settle and record the final queue state. Do not alter unidentified or Supabase-managed jobs.
5. If the installed version is relocatable and Supabase documentation for that version supports it, test `ALTER EXTENSION pg_net SET SCHEMA extensions` in staging. Confirm that the `net` API schema, grants, scheduled calls, and webhook delivery still work.
6. If it is non-relocatable, do not force a move in an application migration. Use the Supabase-supported extension upgrade/reinstall path or contact Supabase Support with the dependency export. Never drop the extension with dependent-object cascading.
7. Re-enable the cleanup cron, invoke one disposable cleanup request, and verify the cron run, HTTP response, worker authentication, database audit row, and object outcome.
8. Re-run Security Advisor. Promote the exact tested procedure to production only if staging remains healthy and the installed production version/dependency graph matches.

## Deployment order

To avoid a frontend outage, deploy in this order after staging validation:

1. Deploy `inquiry-public-options` and the updated `inquiry-workflow` Edge Function. The latter has a narrowly limited pre-migration fallback only when PostgREST reports that the new service bridge does not exist.
2. Deploy the frontend that calls those endpoints. At this stage, existing database grants still support the verified-caller fallback.
3. Apply `20260717100000_security_advisor_findings_hardening.sql` last. The service bridge then becomes authoritative and the migration revokes the old browser grants.
4. Re-run the manual verification and Security Advisor checks.

The database migration must not be applied before both replacement Edge endpoints and their frontend callers are live.
