-- Catalog items for CRM (owners, types, etc.)
create table if not exists public.crm_catalog_items (
  id uuid primary key default uuid_generate_v4(),
  client_slug text not null references public.crm_clients(slug) on delete cascade,
  kind text not null check (kind in ('owner','type')),
  label text not null,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Unique label per client/kind (case-insensitive)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crm_catalog_items_client_kind_label_key'
  ) then
    alter table public.crm_catalog_items
      add constraint crm_catalog_items_client_kind_label_key unique (client_slug, kind, lower(label));
  end if;
end$$;

-- Update timestamp trigger
create or replace function public.trigger_set_timestamp()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_timestamp on public.crm_catalog_items;
create trigger set_timestamp
before update on public.crm_catalog_items
for each row
execute procedure public.trigger_set_timestamp();

alter table public.crm_catalog_items enable row level security;

drop policy if exists "CRM catalogs readable by active users" on public.crm_catalog_items;
create policy "CRM catalogs readable by active users"
  on public.crm_catalog_items for select
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
    )
  );

drop policy if exists "Editors can insert catalog items" on public.crm_catalog_items;
create policy "Editors can insert catalog items"
  on public.crm_catalog_items for insert
  with check (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role in ('editor', 'admin')
    )
  );

drop policy if exists "Editors can update catalog items" on public.crm_catalog_items;
create policy "Editors can update catalog items"
  on public.crm_catalog_items for update
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role in ('editor', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role in ('editor', 'admin')
    )
  );

drop policy if exists "Admins can delete catalog items" on public.crm_catalog_items;
create policy "Admins can delete catalog items"
  on public.crm_catalog_items for delete
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role = 'admin'
    )
  );
