-- Public current-work lifecycle. Existing portfolio projects remain completed.
begin;

alter table public.projects
  add column if not exists work_status text not null default 'completed',
  add column if not exists progress_updates jsonb not null default '[]'::jsonb;

alter table public.projects drop constraint if exists projects_work_status_check;
alter table public.projects add constraint projects_work_status_check
  check (work_status in ('active','completed'));

alter table public.projects drop constraint if exists projects_progress_updates_check;
alter table public.projects add constraint projects_progress_updates_check check (
  jsonb_typeof(progress_updates) = 'array'
  and jsonb_array_length(progress_updates) <= 100
  and octet_length(progress_updates::text) <= 200000
);

create index if not exists projects_public_work_idx
  on public.projects(work_status, project_date desc, created_at desc)
  where status = 'published';

comment on column public.projects.work_status is
  'Public lifecycle: active projects appear in Current Work; completed projects remain in the portfolio.';
comment on column public.projects.progress_updates is
  'Bounded public project journal entries managed with the project record.';

commit;
