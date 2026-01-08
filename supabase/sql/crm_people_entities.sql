-- People entities per client/year (Dataventure / Equancy, etc.)
create extension if not exists "uuid-ossp";

create table if not exists public.crm_people_entities (
  id uuid primary key default uuid_generate_v4(),
  client_slug text not null references public.crm_clients(slug) on delete cascade,
  year int not null,
  person_id uuid not null references public.crm_people(id) on delete cascade,
  entity text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint crm_people_entities_unique unique (client_slug, year, person_id)
);

create index if not exists crm_people_entities_client_year_idx
  on public.crm_people_entities (client_slug, year);

create index if not exists crm_people_entities_person_idx
  on public.crm_people_entities (person_id);

-- Reuse timestamp trigger
create or replace function public.trigger_set_timestamp()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_timestamp on public.crm_people_entities;
create trigger set_timestamp
before update on public.crm_people_entities
for each row
execute procedure public.trigger_set_timestamp();

alter table public.crm_people_entities enable row level security;

drop policy if exists "CRM people entities readable by active users" on public.crm_people_entities;
create policy "CRM people entities readable by active users"
  on public.crm_people_entities for select
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
    )
  );

drop policy if exists "Editors can insert CRM people entities" on public.crm_people_entities;
create policy "Editors can insert CRM people entities"
  on public.crm_people_entities for insert
  with check (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role in ('editor', 'admin')
    )
  );

drop policy if exists "Editors can update CRM people entities" on public.crm_people_entities;
create policy "Editors can update CRM people entities"
  on public.crm_people_entities for update
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

drop policy if exists "Admins can delete CRM people entities" on public.crm_people_entities;
create policy "Admins can delete CRM people entities"
  on public.crm_people_entities for delete
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role = 'admin'
    )
  );
