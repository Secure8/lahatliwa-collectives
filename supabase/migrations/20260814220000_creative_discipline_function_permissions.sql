begin;

-- The profile table's discipline constraint invokes this validator during an
-- authenticated update. Allow signed-in application users and server tasks to
-- execute only this validation function; the private schema remains otherwise
-- inaccessible.
grant execute on function private.valid_creative_disciplines(jsonb)
  to authenticated, service_role;

commit;
