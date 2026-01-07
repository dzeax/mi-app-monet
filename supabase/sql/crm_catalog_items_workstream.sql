do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.crm_catalog_items'::regclass
      and conname = 'crm_catalog_items_kind_check'
  ) then
    alter table public.crm_catalog_items
      drop constraint crm_catalog_items_kind_check;
  end if;
end$$;

alter table public.crm_catalog_items
  add constraint crm_catalog_items_kind_check
  check (kind in ('owner','type','workstream'));
