-- Campaigns table (production)
create extension if not exists "uuid-ossp";

create table if not exists public.campaigns (
  id uuid primary key default uuid_generate_v4(),
  date date not null,
  campaign text not null,
  advertiser text not null default '',
  invoice_office text not null default 'DAT',
  partner text not null,
  theme text not null default '',
  price numeric not null default 0,
  price_currency text not null default 'EUR',
  type text not null default 'CPL',
  v_sent integer not null default 0,
  routing_costs numeric not null default 0,
  routing_rate_override numeric,
  qty integer not null default 0,
  turnover numeric not null default 0,
  margin numeric not null default 0,
  ecpm numeric not null default 0,
  database text not null,
  geo text not null default '',
  database_type text not null default 'B2C',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.trigger_set_timestamp()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_timestamp on public.campaigns;
create trigger set_timestamp
before update on public.campaigns
for each row
execute procedure public.trigger_set_timestamp();

-- Unique composite (exact match). Needed for ON CONFLICT in upserts
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'campaigns_date_campaign_partner_database_key'
  ) then
    alter table public.campaigns
      add constraint campaigns_date_campaign_partner_database_key
      unique (date, campaign, partner, database);
  end if;
end$$;

alter table public.campaigns enable row level security;

drop policy if exists "Campaigns readable by active users" on public.campaigns;
create policy "Campaigns readable by active users"
  on public.campaigns for select
  using (
    exists (
      select 1
      from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
    )
  );

drop policy if exists "Editors can insert campaigns" on public.campaigns;
create policy "Editors can insert campaigns"
  on public.campaigns for insert
  with check (
    exists (
      select 1
      from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role in ('editor', 'admin')
    )
  );

drop policy if exists "Editors can update campaigns" on public.campaigns;
create policy "Editors can update campaigns"
  on public.campaigns for update
  using (
    exists (
      select 1
      from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role in ('editor', 'admin')
    )
  )
  with check (
    exists (
      select 1
      from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role in ('editor', 'admin')
    )
  );

drop policy if exists "Admins can delete campaigns" on public.campaigns;
create policy "Admins can delete campaigns"
  on public.campaigns for delete
  using (
    exists (
      select 1
      from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role = 'admin'
    )
  );
