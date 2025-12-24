-- Strategy reporting (ticket-level consulting work tracking)
create extension if not exists "uuid-ossp";

create table if not exists public.crm_strategy_tickets (
  id uuid primary key default uuid_generate_v4(),
  client_slug text not null references public.crm_clients(slug) on delete cascade,
  jira_ticket text not null,
  jira_url text,
  title text not null default '',
  status text not null default 'Backlog',
  category text not null default 'Weekly Preparation',
  created_date date not null default (timezone('utc', now()))::date,
  due_date date,
  jira_assignee text,
  brand text,
  segment text,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint crm_strategy_tickets_client_jira_key unique (client_slug, jira_ticket)
);

-- Backfill for existing deployments (create table won't add new columns)
alter table public.crm_strategy_tickets
  add column if not exists created_date date not null default (timezone('utc', now()))::date;

create table if not exists public.crm_strategy_efforts (
  id uuid primary key default uuid_generate_v4(),
  ticket_id uuid not null references public.crm_strategy_tickets(id) on delete cascade,
  client_slug text not null references public.crm_clients(slug) on delete cascade,
  effort_date date,
  owner text not null,
  hours numeric not null default 0,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Update timestamp triggers
create or replace function public.trigger_set_timestamp()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_timestamp on public.crm_strategy_tickets;
create trigger set_timestamp
before update on public.crm_strategy_tickets
for each row
execute procedure public.trigger_set_timestamp();

drop trigger if exists set_timestamp on public.crm_strategy_efforts;
create trigger set_timestamp
before update on public.crm_strategy_efforts
for each row
execute procedure public.trigger_set_timestamp();

create index if not exists crm_strategy_tickets_client_status_idx
  on public.crm_strategy_tickets (client_slug, status);

create index if not exists crm_strategy_tickets_client_due_idx
  on public.crm_strategy_tickets (client_slug, due_date);

create index if not exists crm_strategy_tickets_client_created_idx
  on public.crm_strategy_tickets (client_slug, created_date);

create index if not exists crm_strategy_efforts_ticket_idx
  on public.crm_strategy_efforts (ticket_id);

create index if not exists crm_strategy_efforts_client_owner_idx
  on public.crm_strategy_efforts (client_slug, owner);

-- RLS
alter table public.crm_strategy_tickets enable row level security;
alter table public.crm_strategy_efforts enable row level security;

drop policy if exists "Strategy tickets readable by active users" on public.crm_strategy_tickets;
create policy "Strategy tickets readable by active users"
  on public.crm_strategy_tickets for select
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
    )
  );

drop policy if exists "Strategy efforts readable by active users" on public.crm_strategy_efforts;
create policy "Strategy efforts readable by active users"
  on public.crm_strategy_efforts for select
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
    )
  );

drop policy if exists "Editors can insert strategy tickets" on public.crm_strategy_tickets;
create policy "Editors can insert strategy tickets"
  on public.crm_strategy_tickets for insert
  with check (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role in ('editor', 'admin')
    )
  );

drop policy if exists "Editors can insert strategy efforts" on public.crm_strategy_efforts;
create policy "Editors can insert strategy efforts"
  on public.crm_strategy_efforts for insert
  with check (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role in ('editor', 'admin')
    )
  );

drop policy if exists "Editors can update strategy tickets" on public.crm_strategy_tickets;
create policy "Editors can update strategy tickets"
  on public.crm_strategy_tickets for update
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

drop policy if exists "Editors can update strategy efforts" on public.crm_strategy_efforts;
create policy "Editors can update strategy efforts"
  on public.crm_strategy_efforts for update
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

drop policy if exists "Admins can delete strategy tickets" on public.crm_strategy_tickets;
create policy "Admins can delete strategy tickets"
  on public.crm_strategy_tickets for delete
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role = 'admin'
    )
  );

drop policy if exists "Admins can delete strategy efforts" on public.crm_strategy_efforts;
create policy "Admins can delete strategy efforts"
  on public.crm_strategy_efforts for delete
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role = 'admin'
    )
  );
