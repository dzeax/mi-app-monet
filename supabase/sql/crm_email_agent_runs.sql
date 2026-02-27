-- Agent run history for CRM email copy generator
create extension if not exists "uuid-ossp";

create table if not exists public.crm_email_agent_runs (
  id uuid primary key default uuid_generate_v4(),
  client_slug text not null references public.crm_clients(slug) on delete cascade,
  brief_id uuid references public.crm_email_briefs(id) on delete set null,
  run_group_id uuid not null,
  agent_name text not null check (agent_name in ('extract', 'plan', 'copy', 'qa', 'parse', 'mapping')),
  status text not null check (status in ('success', 'fallback', 'error')),
  model text not null,
  input_json jsonb not null default '{}'::jsonb,
  output_json jsonb not null default '{}'::jsonb,
  warnings_json jsonb not null default '[]'::jsonb,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists crm_email_agent_runs_client_brief_created_idx
  on public.crm_email_agent_runs (client_slug, brief_id, created_at desc);

create index if not exists crm_email_agent_runs_group_created_idx
  on public.crm_email_agent_runs (run_group_id, created_at desc);

create index if not exists crm_email_agent_runs_agent_created_idx
  on public.crm_email_agent_runs (agent_name, created_at desc);

alter table public.crm_email_agent_runs enable row level security;

drop policy if exists "CRM email agent runs readable by active users" on public.crm_email_agent_runs;
create policy "CRM email agent runs readable by active users"
  on public.crm_email_agent_runs for select
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
    )
  );

drop policy if exists "Editors can insert CRM email agent runs" on public.crm_email_agent_runs;
create policy "Editors can insert CRM email agent runs"
  on public.crm_email_agent_runs for insert
  with check (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role in ('editor', 'admin')
    )
  );

drop policy if exists "Admins can delete CRM email agent runs" on public.crm_email_agent_runs;
create policy "Admins can delete CRM email agent runs"
  on public.crm_email_agent_runs for delete
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role = 'admin'
    )
  );
