-- Manual efforts (non-ticket, non-campaign)
create extension if not exists "uuid-ossp";

create table if not exists public.crm_manual_efforts (
  id uuid primary key default uuid_generate_v4(),
  client_slug text not null references public.crm_clients(slug) on delete cascade,
  effort_date date not null default (timezone('utc', now()))::date,
  person_id uuid not null references public.crm_people(id) on delete cascade,
  owner text not null,
  workstream text not null,
  input_unit text not null check (input_unit in ('hours','days')),
  input_value numeric not null check (input_value >= 0),
  hours numeric not null check (hours >= 0),
  comments text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists crm_manual_efforts_client_date_idx
  on public.crm_manual_efforts (client_slug, effort_date);

create index if not exists crm_manual_efforts_client_person_idx
  on public.crm_manual_efforts (client_slug, person_id);

create index if not exists crm_manual_efforts_client_workstream_idx
  on public.crm_manual_efforts (client_slug, workstream);

-- Update timestamp trigger (reuse shared function if present)
create or replace function public.trigger_set_timestamp()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_timestamp on public.crm_manual_efforts;
create trigger set_timestamp
before update on public.crm_manual_efforts
for each row
execute procedure public.trigger_set_timestamp();

alter table public.crm_manual_efforts enable row level security;

drop policy if exists "Manual efforts readable by active users" on public.crm_manual_efforts;
create policy "Manual efforts readable by active users"
  on public.crm_manual_efforts for select
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
    )
  );

drop policy if exists "Editors can insert manual efforts" on public.crm_manual_efforts;
create policy "Editors can insert manual efforts"
  on public.crm_manual_efforts for insert
  with check (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role in ('editor', 'admin')
    )
  );

drop policy if exists "Editors can update manual efforts" on public.crm_manual_efforts;
create policy "Editors can update manual efforts"
  on public.crm_manual_efforts for update
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

drop policy if exists "Admins can delete manual efforts" on public.crm_manual_efforts;
create policy "Admins can delete manual efforts"
  on public.crm_manual_efforts for delete
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role = 'admin'
    )
  );
