-- Deactivate legacy owner catalog items that duplicate people aliases.
-- Safe to run multiple times.

update public.crm_catalog_items c
set is_active = false
where c.client_slug = 'emg'
  and c.kind = 'owner'
  and c.is_active = true
  and exists (
    select 1
    from public.crm_people_aliases a
    join public.crm_people p
      on p.id = a.person_id
     and p.client_slug = a.client_slug
    where a.client_slug = c.client_slug
      and lower(a.alias) = lower(c.label)
      and lower(p.display_name) <> lower(c.label)
  );
