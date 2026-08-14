begin;

-- Creatives may remove only notifications addressed to their own profile.
-- The original inquiry stays available to the Super Admin for moderation.
grant delete on public.creative_notifications to authenticated;

drop policy if exists "Creatives delete own notifications" on public.creative_notifications;
create policy "Creatives delete own notifications"
on public.creative_notifications
for delete
to authenticated
using (creative_member_id = private.current_creative_member_id());

notify pgrst, 'reload schema';
commit;
