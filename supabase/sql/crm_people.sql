-- People directory for CRM owners/contributors
create table if not exists public.crm_people (
  id uuid primary key default uuid_generate_v4(),
  client_slug text not null references public.crm_clients(slug) on delete cascade,
  display_name text not null,
  email text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Unique display name per client (case-insensitive)
create unique index if not exists crm_people_client_display_lower_idx
  on public.crm_people (client_slug, lower(display_name));

create index if not exists crm_people_client_active_idx
  on public.crm_people (client_slug, is_active);

create table if not exists public.crm_people_aliases (
  id uuid primary key default uuid_generate_v4(),
  client_slug text not null references public.crm_clients(slug) on delete cascade,
  person_id uuid not null references public.crm_people(id) on delete cascade,
  alias text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Unique alias per client (case-insensitive)
create unique index if not exists crm_people_aliases_client_alias_lower_idx
  on public.crm_people_aliases (client_slug, lower(alias));

create index if not exists crm_people_aliases_client_person_idx
  on public.crm_people_aliases (client_slug, person_id);

-- Update timestamp trigger (reuse shared function if present)
create or replace function public.trigger_set_timestamp()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_timestamp on public.crm_people;
create trigger set_timestamp
before update on public.crm_people
for each row
execute procedure public.trigger_set_timestamp();

drop trigger if exists set_timestamp on public.crm_people_aliases;
create trigger set_timestamp
before update on public.crm_people_aliases
for each row
execute procedure public.trigger_set_timestamp();

alter table public.crm_people enable row level security;
alter table public.crm_people_aliases enable row level security;

drop policy if exists "CRM people readable by active users" on public.crm_people;
create policy "CRM people readable by active users"
  on public.crm_people for select
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
    )
  );

drop policy if exists "CRM people aliases readable by active users" on public.crm_people_aliases;
create policy "CRM people aliases readable by active users"
  on public.crm_people_aliases for select
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
    )
  );

drop policy if exists "Editors can insert CRM people" on public.crm_people;
create policy "Editors can insert CRM people"
  on public.crm_people for insert
  with check (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role in ('editor', 'admin')
    )
  );

drop policy if exists "Editors can insert CRM people aliases" on public.crm_people_aliases;
create policy "Editors can insert CRM people aliases"
  on public.crm_people_aliases for insert
  with check (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role in ('editor', 'admin')
    )
  );

drop policy if exists "Editors can update CRM people" on public.crm_people;
create policy "Editors can update CRM people"
  on public.crm_people for update
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

drop policy if exists "Editors can update CRM people aliases" on public.crm_people_aliases;
create policy "Editors can update CRM people aliases"
  on public.crm_people_aliases for update
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

drop policy if exists "Admins can delete CRM people" on public.crm_people;
create policy "Admins can delete CRM people"
  on public.crm_people for delete
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role = 'admin'
    )
  );

drop policy if exists "Admins can delete CRM people aliases" on public.crm_people_aliases;
create policy "Admins can delete CRM people aliases"
  on public.crm_people_aliases for delete
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role = 'admin'
    )
  );
