begin;

-- Keep profile-header introductions as brief as a social-network bio. The
-- longer biography remains available in full_bio on the About section.
-- A CLI migration has no end-user JWT, so pause only the existing profile
-- update guard for this one data correction and restore its original mode
-- inside the same transaction.
create temporary table creative_bio_guard_states on commit drop as
select tgname as trigger_name, tgenabled as enabled_mode
from pg_trigger
where tgrelid = 'public.creative_members'::regclass
  and not tgisinternal
  and tgname = 'creative_members_guard_self_update';

do $$
declare guard record;
begin
  for guard in select trigger_name from creative_bio_guard_states where enabled_mode <> 'D'
  loop
    execute format('alter table public.creative_members disable trigger %I', guard.trigger_name);
  end loop;
end;
$$;

update public.creative_members
set short_bio = case lower(slug)
  when 'jevin-ballester' then 'Creative developer working across websites, visual content, editing, and practical digital experiences.'
  when 'john-alfred-justo' then 'Photographer and video editor focused on dependable visual storytelling for people, events, and brands.'
  when 'mack-matorre' then 'Photographer, videographer, and editor creating clear visual stories for people, places, and events.'
  when 'joshua-fernandez' then 'Graphic designer and content creator making brand visuals, short-form videos, UGC, and digital campaigns.'
  when 'esshey-cahilig' then 'Creative collaborator providing adaptable visual and digital support across Lahat Liwa projects.'
  else case
    when char_length(btrim(coalesce(short_bio, ''))) > 160
      then rtrim(left(btrim(short_bio), 157)) || '...'
    else short_bio
  end
end
where short_bio is not null
   or lower(slug) in ('jevin-ballester', 'john-alfred-justo', 'mack-matorre', 'joshua-fernandez', 'esshey-cahilig');

do $$
declare guard record;
begin
  for guard in select trigger_name, enabled_mode from creative_bio_guard_states
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

alter table public.creative_members
  drop constraint if exists creative_members_short_bio_length;

alter table public.creative_members
  add constraint creative_members_short_bio_length
  check (short_bio is null or char_length(btrim(short_bio)) <= 160);

commit;
