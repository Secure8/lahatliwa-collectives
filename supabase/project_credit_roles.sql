-- Unlimited project credit roles per creative.
-- Run after collective_phase1.sql and team_rbac_upgrade.sql.

alter table public.project_creatives
add column if not exists credit_roles text[] not null default '{}'::text[];

update public.project_creatives
set credit_roles = case
  when nullif(btrim(role), '') is not null then array[btrim(role)]
  when nullif(btrim(contribution_role), '') is not null then array[btrim(contribution_role)]
  else array['Contributor']
end
where coalesce(cardinality(credit_roles), 0) = 0;

comment on column public.project_creatives.credit_roles is
'Ordered, unlimited public credit labels for this creative on the project.';

notify pgrst, 'reload schema';
