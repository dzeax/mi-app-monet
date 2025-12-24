-- Daily rates per owner (per client)
create table if not exists public.crm_owner_rates (
  id uuid primary key default uuid_generate_v4(),
  client_slug text not null references public.crm_clients(slug) on delete cascade,
  owner text not null,
  person_id uuid references public.crm_people(id),
  daily_rate numeric not null check (daily_rate >= 0),
  currency text not null default 'EUR',
  valid_from date not null default (timezone('utc', now()))::date,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Backfill for existing deployments
alter table public.crm_owner_rates
  add column if not exists person_id uuid references public.crm_people(id);

create index if not exists crm_owner_rates_client_person_idx
  on public.crm_owner_rates (client_slug, person_id);

-- Ensure one active rate per client/owner (latest row wins on conflict)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crm_owner_rates_client_owner_key'
  ) then
    alter table public.crm_owner_rates
      add constraint crm_owner_rates_client_owner_key unique (client_slug, owner);
  end if;
end$$;

-- Reuse timestamp trigger
create or replace function public.trigger_set_timestamp()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_timestamp on public.crm_owner_rates;
create trigger set_timestamp
before update on public.crm_owner_rates
for each row
execute procedure public.trigger_set_timestamp();

alter table public.crm_owner_rates enable row level security;

drop policy if exists "CRM owner rates readable by active users" on public.crm_owner_rates;
create policy "CRM owner rates readable by active users"
  on public.crm_owner_rates for select
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
    )
  );

drop policy if exists "Editors can upsert owner rates" on public.crm_owner_rates;
create policy "Editors can upsert owner rates"
  on public.crm_owner_rates for insert
  with check (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role in ('editor', 'admin')
    )
  );

drop policy if exists "Editors can update owner rates" on public.crm_owner_rates;
create policy "Editors can update owner rates"
  on public.crm_owner_rates for update
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

drop policy if exists "Admins can delete owner rates" on public.crm_owner_rates;
create policy "Admins can delete owner rates"
  on public.crm_owner_rates for delete
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role = 'admin'
    )
  );
