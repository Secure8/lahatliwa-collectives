do $$
begin
  if exists (
    select 1
    from public.service_branches
    where slug = 'lahat-liwa-creative'
    and name = 'Lahat Liwa Creative'
    and description = 'Branding support, visual direction, creative campaigns, and practical digital production.'
    and included_services = '["Branding support", "Visual direction", "Creative campaigns", "Digital production"]'::jsonb
  )
  and not exists (
    select 1
    from public.service_branches
    where slug = 'lahat-liwa-tech'
  ) then
    update public.service_branches
    set
      name = 'Lahat Liwa Tech',
      slug = 'lahat-liwa-tech',
      description = 'Simple technical help for devices, software setup, and everyday computer support.',
      included_services = '["IT Technician Services", "Computer Support", "Software / System Assistance", "Device Setup"]'::jsonb,
      cta_label = 'Get tech support',
      cta_url = '/start-a-project',
      updated_at = now()
    where slug = 'lahat-liwa-creative'
    and name = 'Lahat Liwa Creative'
    and description = 'Branding support, visual direction, creative campaigns, and practical digital production.'
    and included_services = '["Branding support", "Visual direction", "Creative campaigns", "Digital production"]'::jsonb;
  end if;
end;
$$;

notify pgrst, 'reload schema';
