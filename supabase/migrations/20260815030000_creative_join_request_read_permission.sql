begin;

-- RLS still limits rows to active Super Admin accounts. This table privilege
-- is required before PostgreSQL can evaluate that policy.
grant select on public.creative_join_requests to authenticated;
revoke all on public.creative_join_requests from anon;

notify pgrst, 'reload schema';
commit;
