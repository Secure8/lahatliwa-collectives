begin;

create table if not exists public.editorial_homepage_slides (
  slot_type text primary key check (slot_type in ('journal','event','place','activity','local_product')),
  post_id uuid unique references public.editorial_posts(id) on delete set null,
  enabled boolean not null default false,
  sort_order smallint not null check (sort_order between 0 and 4),
  eyebrow text not null default '' check (length(eyebrow) <= 80),
  description text not null default '' check (length(description) <= 240),
  focal_x smallint not null default 50 check (focal_x between 0 and 100),
  focal_y smallint not null default 50 check (focal_y between 0 and 100),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.editorial_homepage_slides(slot_type, sort_order)
values ('journal',0),('event',1),('place',2),('activity',3),('local_product',4)
on conflict (slot_type) do nothing;

create or replace function private.validate_editorial_homepage_slide()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  selected_post public.editorial_posts%rowtype;
begin
  new.eyebrow := btrim(coalesce(new.eyebrow,''));
  new.description := btrim(coalesce(new.description,''));
  new.updated_at := now();
  new.updated_by := auth.uid();

  if new.post_id is null then
    new.enabled := false;
    return new;
  end if;

  select * into selected_post from public.editorial_posts where id = new.post_id;
  if not found or selected_post.content_type <> new.slot_type then
    raise exception using errcode = '22023', message = 'The selected story does not match this slideshow slot.';
  end if;
  if selected_post.published_revision_id is null or selected_post.published_at is null
     or selected_post.archived_at is not null or selected_post.status <> 'published' then
    raise exception using errcode = '22023', message = 'Only a currently published story can be selected.';
  end if;
  if nullif(btrim(coalesce(selected_post.cover_image_url,'')),'') is null then
    raise exception using errcode = '22023', message = 'The selected story needs a cover image.';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_editorial_homepage_slide on public.editorial_homepage_slides;
create trigger validate_editorial_homepage_slide
before insert or update on public.editorial_homepage_slides
for each row execute function private.validate_editorial_homepage_slide();

create or replace function private.audit_editorial_homepage_slide()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  insert into public.editorial_audit_events(actor_user_id, post_id, action, details)
  values (
    auth.uid(),
    new.post_id,
    'homepage_slide_updated',
    jsonb_build_object(
      'slot_type', new.slot_type,
      'enabled', new.enabled,
      'sort_order', new.sort_order,
      'selection_changed', old.post_id is distinct from new.post_id
    )
  );
  return new;
end;
$$;

drop trigger if exists audit_editorial_homepage_slide on public.editorial_homepage_slides;
create trigger audit_editorial_homepage_slide
after update on public.editorial_homepage_slides
for each row when (old is distinct from new)
execute function private.audit_editorial_homepage_slide();

alter table public.editorial_homepage_slides enable row level security;

drop policy if exists editorial_homepage_slides_public_read on public.editorial_homepage_slides;
create policy editorial_homepage_slides_public_read
on public.editorial_homepage_slides for select to anon, authenticated
using (
  (select module_enabled and public_portal_enabled and homepage_tourism_enabled
   from public.editorial_feature_flags where singleton)
);

drop policy if exists editorial_homepage_slides_super_admin_read on public.editorial_homepage_slides;
create policy editorial_homepage_slides_super_admin_read
on public.editorial_homepage_slides for select to authenticated
using (private.editorial_role(auth.uid()) = 'super_admin');

drop policy if exists editorial_homepage_slides_super_admin_write on public.editorial_homepage_slides;
create policy editorial_homepage_slides_super_admin_write
on public.editorial_homepage_slides for update to authenticated
using (private.editorial_role(auth.uid()) = 'super_admin')
with check (private.editorial_role(auth.uid()) = 'super_admin');

revoke all on public.editorial_homepage_slides from public, anon, authenticated;
grant select on public.editorial_homepage_slides to anon, authenticated;
grant update on public.editorial_homepage_slides to authenticated;

revoke all on function private.validate_editorial_homepage_slide() from public, anon, authenticated;
revoke all on function private.audit_editorial_homepage_slide() from public, anon, authenticated;

comment on table public.editorial_homepage_slides is
  'Five reference-only Explore Aklan homepage slideshow slots. Public reads remain feature-flagged and selected posts remain protected by editorial_posts RLS.';

commit;
