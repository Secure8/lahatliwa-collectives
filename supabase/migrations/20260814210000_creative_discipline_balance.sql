begin;

-- Keep the public profile header readable by treating disciplines as a short,
-- curated list rather than an unrestricted paragraph. Preserve the existing
-- self-update guard mode while normalizing legacy data in this migration.
create temporary table creative_discipline_guard_states on commit drop as
select tgname as trigger_name, tgenabled as enabled_mode
from pg_trigger
where tgrelid = 'public.creative_members'::regclass
  and not tgisinternal
  and tgname = 'creative_members_guard_self_update';

do $$
declare guard record;
begin
  for guard in select trigger_name from creative_discipline_guard_states where enabled_mode <> 'D'
  loop
    execute format('alter table public.creative_members disable trigger %I', guard.trigger_name);
  end loop;
end;
$$;

update public.creative_members as member
set skills = case lower(member.slug)
  when 'jevin-ballester' then '["Website Creation", "Interface Customization", "Graphic Design", "Social Media Management", "Content Planning", "Photo & Video Editing"]'::jsonb
  when 'john-alfred-justo' then '["Photography", "Videography", "Photo & Video Editing"]'::jsonb
  when 'mack-matorre' then '["Photography", "Videography", "Photo & Video Editing"]'::jsonb
  when 'joshua-fernandez' then '["Graphic Design", "Content Creation", "Video Editing", "Digital Marketing"]'::jsonb
  when 'esshey-cahilig' then '["Creative Support", "Content Creation", "Digital Support"]'::jsonb
  else coalesce((
  select jsonb_agg(left(cleaned.value, 40) order by cleaned.ordinality)
  from (
    select btrim(entry.value) as value, entry.ordinality
    from jsonb_array_elements_text(
      case when jsonb_typeof(member.skills) = 'array' then member.skills else '[]'::jsonb end
    ) with ordinality as entry(value, ordinality)
    where btrim(entry.value) <> ''
    order by entry.ordinality
    limit 6
  ) as cleaned
  ), '[]'::jsonb)
end;

do $$
declare guard record;
begin
  for guard in select trigger_name, enabled_mode from creative_discipline_guard_states
  loop
    if guard.enabled_mode = 'O' then
      execute format('alter table public.creative_members enable trigger %I', guard.trigger_name);
    elsif guard.enabled_mode = 'A' then
      execute format('alter table public.creative_members enable always trigger %I', guard.trigger_name);
    elsif guard.enabled_mode = 'R' then
      execute format('alter table public.creative_members enable replica trigger %I', guard.trigger_name);
    end if;
  end loop;
end;
$$;

create or replace function private.valid_creative_disciplines(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(value) = 'array'
    and jsonb_array_length(value) <= 6
    and not exists (
      select 1
      from jsonb_array_elements_text(value) as discipline(item)
      where char_length(btrim(item)) = 0
         or char_length(btrim(item)) > 40
    );
$$;

revoke all on function private.valid_creative_disciplines(jsonb) from public;

alter table public.creative_members
  drop constraint if exists creative_members_skills_balance;

alter table public.creative_members
  add constraint creative_members_skills_balance
  check (private.valid_creative_disciplines(skills));

commit;
