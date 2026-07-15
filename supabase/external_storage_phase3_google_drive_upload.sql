-- Phase 3A Google Drive test-upload browser exposure hardening.
-- REVIEW AND APPLY MANUALLY before enabling GOOGLE_DRIVE_UPLOAD_ENABLED.
-- This changes read grants only. It does not upload, migrate, copy, or delete media.

begin;

-- Owner-facing browser access keeps useful connection state while excluding provider
-- account IDs, Vault references, managed Drive folder IDs, and granted-scope internals.
revoke select on table public.storage_connections from authenticated;
grant select (
  id,
  owner_user_id,
  provider,
  provider_account_email,
  display_name,
  status,
  is_default,
  capabilities,
  connected_at,
  last_verified_at,
  last_error_code,
  last_error_message,
  created_at,
  updated_at,
  root_folder_health,
  disconnected_at
) on table public.storage_connections to authenticated;

-- External media remains read-only to eligible owners through the existing RLS policy,
-- but raw provider file/folder IDs, connection IDs, paths, checksums, and arbitrary
-- provider metadata are no longer selectable by browser clients.
revoke select on table public.external_media_objects from authenticated;
grant select (
  id,
  owner_user_id,
  provider,
  filename,
  mime_type,
  size_bytes,
  width,
  height,
  duration_seconds,
  visibility,
  status,
  preview_provider,
  preview_bucket,
  preview_path,
  created_at,
  updated_at
) on table public.external_media_objects to authenticated;

comment on table public.external_media_objects is
  'Provider-neutral media metadata. Provider identifiers and arbitrary metadata are server-only; authenticated owners receive a safe read-only column subset.';

notify pgrst, 'reload schema';

commit;
