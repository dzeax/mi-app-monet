-- Shared catalog overrides (optional)
create table if not exists public.catalog_overrides (
  key text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid references auth.users(id)
);

create or replace function public.trigger_set_timestamp()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_timestamp_catalog_overrides on public.catalog_overrides;
create trigger set_timestamp_catalog_overrides
before update on public.catalog_overrides
for each row execute procedure public.trigger_set_timestamp();

alter table public.catalog_overrides enable row level security;

drop policy if exists "Overrides readable by active users" on public.catalog_overrides;
create policy "Overrides readable by active users"
  on public.catalog_overrides for select
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
    )
  );

drop policy if exists "Editors can upsert overrides" on public.catalog_overrides;
create policy "Editors can upsert overrides"
  on public.catalog_overrides for all
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

-- Optional seed
insert into public.catalog_overrides (key, data)
values ('global', '{}'::jsonb)
on conflict (key) do nothing;

