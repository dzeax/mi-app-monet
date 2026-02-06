-- Track background JIRA sync lifecycle per CRM client.
create table if not exists public.crm_jira_sync_state (
  client_slug text primary key references public.crm_clients(slug) on delete cascade,
  is_running boolean not null default false,
  locked_until timestamptz,
  last_cursor_at timestamptz,
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  last_imported integer not null default 0,
  last_pages integer not null default 0,
  updated_at timestamptz not null default timezone('utc', now())
);

-- Backfill / idempotent column adds.
alter table public.crm_jira_sync_state
  add column if not exists is_running boolean not null default false;

alter table public.crm_jira_sync_state
  add column if not exists locked_until timestamptz;

alter table public.crm_jira_sync_state
  add column if not exists last_cursor_at timestamptz;

alter table public.crm_jira_sync_state
  add column if not exists last_started_at timestamptz;

alter table public.crm_jira_sync_state
  add column if not exists last_finished_at timestamptz;

alter table public.crm_jira_sync_state
  add column if not exists last_success_at timestamptz;

alter table public.crm_jira_sync_state
  add column if not exists last_error text;

alter table public.crm_jira_sync_state
  add column if not exists last_imported integer not null default 0;

alter table public.crm_jira_sync_state
  add column if not exists last_pages integer not null default 0;

alter table public.crm_jira_sync_state
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

create or replace function public.trigger_set_timestamp()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_timestamp on public.crm_jira_sync_state;
create trigger set_timestamp
before update on public.crm_jira_sync_state
for each row
execute procedure public.trigger_set_timestamp();

alter table public.crm_jira_sync_state enable row level security;

drop policy if exists "CRM sync state readable by active users" on public.crm_jira_sync_state;
create policy "CRM sync state readable by active users"
  on public.crm_jira_sync_state for select
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
    )
  );

drop policy if exists "Editors can upsert CRM sync state" on public.crm_jira_sync_state;
create policy "Editors can upsert CRM sync state"
  on public.crm_jira_sync_state for all
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
