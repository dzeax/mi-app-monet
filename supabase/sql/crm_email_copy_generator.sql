-- Email copy generator entities for CRM clients
create extension if not exists "uuid-ossp";

create table if not exists public.crm_brand_profiles (
  id uuid primary key default uuid_generate_v4(),
  client_slug text not null references public.crm_clients(slug) on delete cascade,
  profile_json jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists crm_brand_profiles_client_slug_uidx
  on public.crm_brand_profiles (client_slug);

create table if not exists public.crm_email_briefs (
  id uuid primary key default uuid_generate_v4(),
  client_slug text not null references public.crm_clients(slug) on delete cascade,
  campaign_name text not null,
  status text,
  send_date_text text,
  source_subject text,
  source_preheader text,
  raw_brief_text text,
  brief_json jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists crm_email_briefs_client_updated_idx
  on public.crm_email_briefs (client_slug, updated_at desc);

create index if not exists crm_email_briefs_client_campaign_idx
  on public.crm_email_briefs (client_slug, campaign_name);

create table if not exists public.crm_email_drafts (
  id uuid primary key default uuid_generate_v4(),
  client_slug text not null references public.crm_clients(slug) on delete cascade,
  brief_id uuid not null references public.crm_email_briefs(id) on delete cascade,
  variant_index integer not null check (variant_index >= 1 and variant_index <= 20),
  model text not null,
  source text not null check (source in ('openai', 'local-fallback')),
  draft_json jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists crm_email_drafts_brief_variant_uidx
  on public.crm_email_drafts (brief_id, variant_index);

create index if not exists crm_email_drafts_client_brief_idx
  on public.crm_email_drafts (client_slug, brief_id);

-- Update timestamp trigger (reuse shared function if present)
create or replace function public.trigger_set_timestamp()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_timestamp on public.crm_brand_profiles;
create trigger set_timestamp
before update on public.crm_brand_profiles
for each row
execute procedure public.trigger_set_timestamp();

drop trigger if exists set_timestamp on public.crm_email_briefs;
create trigger set_timestamp
before update on public.crm_email_briefs
for each row
execute procedure public.trigger_set_timestamp();

drop trigger if exists set_timestamp on public.crm_email_drafts;
create trigger set_timestamp
before update on public.crm_email_drafts
for each row
execute procedure public.trigger_set_timestamp();

alter table public.crm_brand_profiles enable row level security;
alter table public.crm_email_briefs enable row level security;
alter table public.crm_email_drafts enable row level security;

drop policy if exists "CRM brand profiles readable by active users" on public.crm_brand_profiles;
create policy "CRM brand profiles readable by active users"
  on public.crm_brand_profiles for select
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
    )
  );

drop policy if exists "CRM briefs readable by active users" on public.crm_email_briefs;
create policy "CRM briefs readable by active users"
  on public.crm_email_briefs for select
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
    )
  );

drop policy if exists "CRM drafts readable by active users" on public.crm_email_drafts;
create policy "CRM drafts readable by active users"
  on public.crm_email_drafts for select
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
    )
  );

drop policy if exists "Editors can insert CRM brand profiles" on public.crm_brand_profiles;
create policy "Editors can insert CRM brand profiles"
  on public.crm_brand_profiles for insert
  with check (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role in ('editor', 'admin')
    )
  );

drop policy if exists "Editors can insert CRM briefs" on public.crm_email_briefs;
create policy "Editors can insert CRM briefs"
  on public.crm_email_briefs for insert
  with check (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role in ('editor', 'admin')
    )
  );

drop policy if exists "Editors can insert CRM drafts" on public.crm_email_drafts;
create policy "Editors can insert CRM drafts"
  on public.crm_email_drafts for insert
  with check (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role in ('editor', 'admin')
    )
  );

drop policy if exists "Editors can update CRM brand profiles" on public.crm_brand_profiles;
create policy "Editors can update CRM brand profiles"
  on public.crm_brand_profiles for update
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

drop policy if exists "Editors can update CRM briefs" on public.crm_email_briefs;
create policy "Editors can update CRM briefs"
  on public.crm_email_briefs for update
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

drop policy if exists "Editors can update CRM drafts" on public.crm_email_drafts;
create policy "Editors can update CRM drafts"
  on public.crm_email_drafts for update
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

drop policy if exists "Admins can delete CRM brand profiles" on public.crm_brand_profiles;
create policy "Admins can delete CRM brand profiles"
  on public.crm_brand_profiles for delete
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role = 'admin'
    )
  );

drop policy if exists "Admins can delete CRM briefs" on public.crm_email_briefs;
create policy "Admins can delete CRM briefs"
  on public.crm_email_briefs for delete
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role = 'admin'
    )
  );

drop policy if exists "Admins can delete CRM drafts" on public.crm_email_drafts;
create policy "Admins can delete CRM drafts"
  on public.crm_email_drafts for delete
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role = 'admin'
    )
  );

