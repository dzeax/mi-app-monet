-- Campaign email unit performance + heatmap extensions
create extension if not exists "uuid-ossp";

alter table public.campaign_email_units
  add column if not exists sfmc_tracking text;

update public.campaign_email_units
set sfmc_tracking = null
where sfmc_tracking is not null
  and btrim(sfmc_tracking) = '';

create index if not exists campaign_email_units_client_tracking_idx
  on public.campaign_email_units (client_slug, sfmc_tracking);

create unique index if not exists campaign_email_units_client_tracking_unique_idx
  on public.campaign_email_units (client_slug, sfmc_tracking)
  where sfmc_tracking is not null and btrim(sfmc_tracking) <> '';

create table if not exists public.campaign_email_unit_kpis (
  id uuid primary key default uuid_generate_v4(),
  unit_id uuid not null references public.campaign_email_units(id) on delete cascade,
  client_slug text not null references public.crm_clients(slug) on delete cascade,
  sfmc_tracking text,
  deliveries numeric,
  open_rate numeric,
  ctr numeric,
  total_clicks numeric,
  unique_clicks numeric,
  unsubs numeric,
  revenue numeric,
  source text not null default 'manual',
  notes text,
  raw_payload jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists campaign_email_unit_kpis_unit_idx
  on public.campaign_email_unit_kpis (unit_id);

create index if not exists campaign_email_unit_kpis_client_tracking_idx
  on public.campaign_email_unit_kpis (client_slug, sfmc_tracking);

create table if not exists public.campaign_email_unit_heatmap (
  id uuid primary key default uuid_generate_v4(),
  unit_id uuid not null references public.campaign_email_units(id) on delete cascade,
  client_slug text not null references public.crm_clients(slug) on delete cascade,
  sfmc_tracking text,
  status text not null default 'not_requested' check (status in ('not_requested', 'request_submitted', 'completed', 'failed')),
  request_date date,
  days_since_sent integer,
  comment text,
  summary_visual_click_rate numeric,
  summary_cta_click_rate numeric,
  click_alerts text,
  source text not null default 'manual',
  raw_payload jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists campaign_email_unit_heatmap_unit_idx
  on public.campaign_email_unit_heatmap (unit_id);

create index if not exists campaign_email_unit_heatmap_client_tracking_idx
  on public.campaign_email_unit_heatmap (client_slug, sfmc_tracking);

create table if not exists public.campaign_email_unit_heatmap_sections (
  id uuid primary key default uuid_generate_v4(),
  heatmap_id uuid not null references public.campaign_email_unit_heatmap(id) on delete cascade,
  unit_id uuid not null references public.campaign_email_units(id) on delete cascade,
  client_slug text not null references public.crm_clients(slug) on delete cascade,
  sfmc_tracking text,
  section_key text not null,
  section_type text,
  section_position text,
  visual_click_rate numeric,
  cta_click_rate numeric,
  click_alerts text,
  source text not null default 'manual',
  raw_payload jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists campaign_email_unit_heatmap_sections_key_idx
  on public.campaign_email_unit_heatmap_sections (unit_id, section_key);

create index if not exists campaign_email_unit_heatmap_sections_heatmap_idx
  on public.campaign_email_unit_heatmap_sections (heatmap_id);

create index if not exists campaign_email_unit_heatmap_sections_tracking_idx
  on public.campaign_email_unit_heatmap_sections (client_slug, sfmc_tracking);

-- Shared updated_at trigger
create or replace function public.trigger_set_timestamp()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_timestamp on public.campaign_email_unit_kpis;
create trigger set_timestamp
before update on public.campaign_email_unit_kpis
for each row
execute procedure public.trigger_set_timestamp();

drop trigger if exists set_timestamp on public.campaign_email_unit_heatmap;
create trigger set_timestamp
before update on public.campaign_email_unit_heatmap
for each row
execute procedure public.trigger_set_timestamp();

drop trigger if exists set_timestamp on public.campaign_email_unit_heatmap_sections;
create trigger set_timestamp
before update on public.campaign_email_unit_heatmap_sections
for each row
execute procedure public.trigger_set_timestamp();

alter table public.campaign_email_unit_kpis enable row level security;
alter table public.campaign_email_unit_heatmap enable row level security;
alter table public.campaign_email_unit_heatmap_sections enable row level security;

drop policy if exists "Campaign unit KPIs readable by active users" on public.campaign_email_unit_kpis;
create policy "Campaign unit KPIs readable by active users"
  on public.campaign_email_unit_kpis for select
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
    )
  );

drop policy if exists "Campaign unit heatmap readable by active users" on public.campaign_email_unit_heatmap;
create policy "Campaign unit heatmap readable by active users"
  on public.campaign_email_unit_heatmap for select
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
    )
  );

drop policy if exists "Campaign unit heatmap sections readable by active users" on public.campaign_email_unit_heatmap_sections;
create policy "Campaign unit heatmap sections readable by active users"
  on public.campaign_email_unit_heatmap_sections for select
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
    )
  );

drop policy if exists "Editors can insert campaign unit KPIs" on public.campaign_email_unit_kpis;
create policy "Editors can insert campaign unit KPIs"
  on public.campaign_email_unit_kpis for insert
  with check (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role in ('editor', 'admin')
    )
  );

drop policy if exists "Editors can insert campaign unit heatmap" on public.campaign_email_unit_heatmap;
create policy "Editors can insert campaign unit heatmap"
  on public.campaign_email_unit_heatmap for insert
  with check (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role in ('editor', 'admin')
    )
  );

drop policy if exists "Editors can insert campaign unit heatmap sections" on public.campaign_email_unit_heatmap_sections;
create policy "Editors can insert campaign unit heatmap sections"
  on public.campaign_email_unit_heatmap_sections for insert
  with check (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role in ('editor', 'admin')
    )
  );

drop policy if exists "Editors can update campaign unit KPIs" on public.campaign_email_unit_kpis;
create policy "Editors can update campaign unit KPIs"
  on public.campaign_email_unit_kpis for update
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

drop policy if exists "Editors can update campaign unit heatmap" on public.campaign_email_unit_heatmap;
create policy "Editors can update campaign unit heatmap"
  on public.campaign_email_unit_heatmap for update
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

drop policy if exists "Editors can update campaign unit heatmap sections" on public.campaign_email_unit_heatmap_sections;
create policy "Editors can update campaign unit heatmap sections"
  on public.campaign_email_unit_heatmap_sections for update
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

drop policy if exists "Admins can delete campaign unit KPIs" on public.campaign_email_unit_kpis;
create policy "Admins can delete campaign unit KPIs"
  on public.campaign_email_unit_kpis for delete
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role = 'admin'
    )
  );

drop policy if exists "Admins can delete campaign unit heatmap" on public.campaign_email_unit_heatmap;
create policy "Admins can delete campaign unit heatmap"
  on public.campaign_email_unit_heatmap for delete
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role = 'admin'
    )
  );

drop policy if exists "Admins can delete campaign unit heatmap sections" on public.campaign_email_unit_heatmap_sections;
create policy "Admins can delete campaign unit heatmap sections"
  on public.campaign_email_unit_heatmap_sections for delete
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role = 'admin'
    )
  );
