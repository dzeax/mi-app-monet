-- Campaign Planning module
-- Creates storage table, helper trigger, and useful indexes.

-- Ensure pgcrypto is available (needed for gen_random_uuid on self-hosted Postgres)
create extension if not exists "pgcrypto";

create table if not exists public.campaign_planning (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  name text not null,
  partner text not null,
  database text not null,
  geo text,
  price numeric(12, 2) not null default 0,
  type text not null,
  status text not null,
  notes text,
  subject text,
  html text,
  from_name text,
  from_email text,
  reply_to text,
  unsubscribe_url text,
  category_id integer,
  language_id integer,
  tracking_domain text,
  preview_recipients text,
  ds_campaign_id text,
  ds_status text,
  ds_last_sync_at timestamptz,
  ds_error text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.campaign_planning
  add column if not exists subject text,
  add column if not exists html text,
  add column if not exists from_name text,
  add column if not exists from_email text,
  add column if not exists reply_to text,
  add column if not exists unsubscribe_url text,
  add column if not exists category_id integer,
  add column if not exists language_id integer,
  add column if not exists tracking_domain text,
  add column if not exists preview_recipients text,
  add column if not exists ds_campaign_id text,
  add column if not exists ds_status text,
  add column if not exists ds_last_sync_at timestamptz,
  add column if not exists ds_error text;

comment on table public.campaign_planning is 'Planning board items for campaign scheduling.';
comment on column public.campaign_planning.geo is 'ISO country code derived from database selection.';
comment on column public.campaign_planning.type is 'Commercial model (e.g. CPL, CPM, CPC, CPA).';
comment on column public.campaign_planning.status is 'Workflow state (Planning, Refining, Validation, Approved, Programmed, Profit).';

-- Updated_at helper
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_campaign_planning_updated on public.campaign_planning;
create trigger trg_campaign_planning_updated
before update on public.campaign_planning
for each row
execute function public.set_updated_at();

-- Indexes to keep filters/ordering fast
create index if not exists idx_campaign_planning_date on public.campaign_planning (date);
create index if not exists idx_campaign_planning_status on public.campaign_planning (status);
create index if not exists idx_campaign_planning_partner on public.campaign_planning (partner);

-- Enable row level security (service role bypasses it, but we keep the table ready for future policies)
alter table public.campaign_planning enable row level security;

-- DoctorSender persisted defaults per database
create table if not exists public.doctor_sender_defaults (
  database_key text primary key,
  database_name text not null,
  config jsonb not null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.doctor_sender_defaults is 'Overrides for DoctorSender defaults per database.';
comment on column public.doctor_sender_defaults.database_key is 'Normalized lowercase name used as unique key.';
comment on column public.doctor_sender_defaults.config is 'JSON payload with DoctorSender defaults (from/reply-to, tracking, recipients, etc.).';

create index if not exists idx_doctor_sender_defaults_name on public.doctor_sender_defaults (database_name);

drop trigger if exists trg_doctor_sender_defaults_updated on public.doctor_sender_defaults;
create trigger trg_doctor_sender_defaults_updated
before insert or update on public.doctor_sender_defaults
for each row
execute function public.set_updated_at();
