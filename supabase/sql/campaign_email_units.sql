-- Campaign email units (production tracking per email/market/segment/touchpoint)
create extension if not exists "uuid-ossp";

create table if not exists public.campaign_email_units (
  id uuid primary key default uuid_generate_v4(),
  client_slug text not null references public.crm_clients(slug) on delete cascade,
  week integer,
  year integer,
  campaign_name text not null default '',
  brand text not null,
  send_date date not null,
  market text not null,
  scope text not null default 'Global', -- Global / Local
  segment text, -- Publics / Privilege / User / Clubber, etc.
  touchpoint text, -- Launch / Repush / Last call, etc.
  variant text not null default '', -- A/B test or creative variant
  owner text not null, -- persona que produce el email
  jira_ticket text not null,
  status text not null default 'Planned',
  hours_master_template numeric not null default 0,
  hours_translations numeric not null default 0,
  hours_copywriting numeric not null default 0,
  hours_assets numeric not null default 0,
  hours_revisions numeric not null default 0,
  hours_build numeric not null default 0, -- DE/Journey build
  hours_prep numeric not null default 0,
  hours_total numeric generated always as (
    coalesce(hours_master_template, 0)
    + coalesce(hours_translations, 0)
    + coalesce(hours_copywriting, 0)
    + coalesce(hours_assets, 0)
    + coalesce(hours_revisions, 0)
    + coalesce(hours_build, 0)
    + coalesce(hours_prep, 0)
  ) stored,
  days_total numeric generated always as (
    (coalesce(hours_master_template, 0)
     + coalesce(hours_translations, 0)
     + coalesce(hours_copywriting, 0)
     + coalesce(hours_assets, 0)
     + coalesce(hours_revisions, 0)
     + coalesce(hours_build, 0)
     + coalesce(hours_prep, 0)) / 7.0
  ) stored,
  budget_eur numeric, -- se recomienda calcular en app usando owner_rates
  created_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Update timestamp trigger (reuse shared function if present)
create or replace function public.trigger_set_timestamp()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_timestamp on public.campaign_email_units;
create trigger set_timestamp
before update on public.campaign_email_units
for each row
execute procedure public.trigger_set_timestamp();

-- Helpful indexes for common filters
create index if not exists campaign_email_units_client_send_date_idx
  on public.campaign_email_units (client_slug, send_date);

create index if not exists campaign_email_units_client_owner_idx
  on public.campaign_email_units (client_slug, owner);

  create index if not exists campaign_email_units_client_jira_idx
  on public.campaign_email_units (client_slug, jira_ticket);

-- Natural key to allow upserts without duplicates
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'campaign_email_units_natural_key'
  ) then
    alter table public.campaign_email_units
      drop constraint campaign_email_units_natural_key;
  end if;
  alter table public.campaign_email_units
    add constraint campaign_email_units_natural_key
    unique (client_slug, jira_ticket, send_date, market, segment, touchpoint, variant, owner);
end$$;

-- RLS
alter table public.campaign_email_units enable row level security;

drop policy if exists "Campaign units readable by active users" on public.campaign_email_units;
create policy "Campaign units readable by active users"
  on public.campaign_email_units for select
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
    )
  );

drop policy if exists "Editors can insert campaign units" on public.campaign_email_units;
create policy "Editors can insert campaign units"
  on public.campaign_email_units for insert
  with check (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role in ('editor', 'admin')
    )
  );

drop policy if exists "Editors can update campaign units" on public.campaign_email_units;
create policy "Editors can update campaign units"
  on public.campaign_email_units for update
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

drop policy if exists "Admins can delete campaign units" on public.campaign_email_units;
create policy "Admins can delete campaign units"
  on public.campaign_email_units for delete
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role = 'admin'
    )
  );
