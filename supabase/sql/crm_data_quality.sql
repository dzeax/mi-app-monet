-- CRM clients (workspaces)
create table if not exists public.crm_clients (
  slug text primary key,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

-- Seed EMG client (idempotent)
insert into public.crm_clients (slug, name)
select 'emg', 'Europcar Mobility Group'
where not exists (select 1 from public.crm_clients where slug = 'emg');

-- Data Quality tickets (per client)
create table if not exists public.crm_data_quality_tickets (
  id uuid primary key default uuid_generate_v4(),
  client_slug text not null references public.crm_clients(slug) on delete cascade,
  status text not null,
  assigned_date date not null,
  due_date date,
  ticket_id text not null,
  title text not null,
  priority text not null check (priority in ('P1','P2','P3')),
  owner text not null,
  reporter text,
  type text,
  jira_url text,
  jira_assignee text,
  work_hours numeric not null default 0,
  prep_hours numeric,
  eta_date date,
  comments text,
  app_status text,
  app_status_updated_at timestamptz,
  app_status_updated_by uuid references auth.users(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Ticket contributions (multiple owners per ticket)
create table if not exists public.crm_data_quality_contributions (
  id uuid primary key default uuid_generate_v4(),
  ticket_id uuid not null references public.crm_data_quality_tickets(id) on delete cascade,
  client_slug text not null references public.crm_clients(slug) on delete cascade,
  effort_date date not null default (timezone('utc', now()))::date,
  owner text not null,
  person_id uuid references public.crm_people(id),
  work_hours numeric not null default 0,
  prep_hours numeric,
  workstream text not null default 'Data Quality',
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint crm_data_quality_contrib_unique_owner_date_stream unique (ticket_id, owner, effort_date, workstream)
);

-- Backfill for existing deployments (create table won't add new columns / constraints)
alter table public.crm_data_quality_contributions
  add column if not exists effort_date date;

alter table public.crm_data_quality_contributions
  add column if not exists workstream text;

alter table public.crm_data_quality_contributions
  add column if not exists person_id uuid references public.crm_people(id);

update public.crm_data_quality_contributions
set workstream = 'Data Quality'
where workstream is null;

alter table public.crm_data_quality_contributions
  alter column workstream set default 'Data Quality';

alter table public.crm_data_quality_contributions
  alter column workstream set not null;

create index if not exists crm_data_quality_contrib_person_idx
  on public.crm_data_quality_contributions (client_slug, person_id);

-- For historical data, attribute effort to the ticket assigned_date (Option A)
update public.crm_data_quality_contributions c
set effort_date = t.assigned_date
from public.crm_data_quality_tickets t
where c.ticket_id = t.id
  and c.effort_date is null;

alter table public.crm_data_quality_contributions
  alter column effort_date set default (timezone('utc', now()))::date;

alter table public.crm_data_quality_contributions
  alter column effort_date set not null;

-- App-only blocker status (do not sync from JIRA)
alter table public.crm_data_quality_tickets
  add column if not exists app_status text;

alter table public.crm_data_quality_tickets
  add column if not exists app_status_updated_at timestamptz;

alter table public.crm_data_quality_tickets
  add column if not exists app_status_updated_by uuid references auth.users(id);

create index if not exists crm_data_quality_tickets_app_status_idx
  on public.crm_data_quality_tickets (client_slug, app_status);

-- JIRA-derived acknowledgment timestamps (source of truth: JIRA)
-- Note: SLA clock starts when the ticket enters "Ready" (JIRA status).
alter table public.crm_data_quality_tickets
  add column if not exists jira_created_at timestamptz;

alter table public.crm_data_quality_tickets
  add column if not exists jira_ready_at timestamptz;

alter table public.crm_data_quality_tickets
  add column if not exists jira_ack_at timestamptz;

alter table public.crm_data_quality_tickets
  add column if not exists jira_ack_source text;

create index if not exists crm_data_quality_tickets_jira_ready_idx
  on public.crm_data_quality_tickets (client_slug, jira_ready_at);

create index if not exists crm_data_quality_tickets_jira_ack_idx
  on public.crm_data_quality_tickets (client_slug, jira_ack_at);

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'crm_data_quality_contrib_unique_owner'
  ) then
    alter table public.crm_data_quality_contributions
      drop constraint crm_data_quality_contrib_unique_owner;
  end if;
end$$;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'crm_data_quality_contrib_unique_owner_date'
  ) then
    alter table public.crm_data_quality_contributions
      drop constraint crm_data_quality_contrib_unique_owner_date;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'crm_data_quality_contrib_unique_owner_date_stream'
  ) then
    alter table public.crm_data_quality_contributions
      add constraint crm_data_quality_contrib_unique_owner_date_stream unique (ticket_id, owner, effort_date, workstream);
  end if;
end$$;

-- Update timestamp trigger for contributions
drop trigger if exists set_timestamp on public.crm_data_quality_contributions;
create trigger set_timestamp
before update on public.crm_data_quality_contributions
for each row
execute procedure public.trigger_set_timestamp();

-- Ensure ticket_id uniqueness per client
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crm_data_quality_tickets_client_ticket_key'
  ) then
    alter table public.crm_data_quality_tickets
      add constraint crm_data_quality_tickets_client_ticket_key unique (client_slug, ticket_id);
  end if;
end$$;

-- Update timestamp trigger (reuse if already present)
create or replace function public.trigger_set_timestamp()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_timestamp on public.crm_data_quality_tickets;
create trigger set_timestamp
before update on public.crm_data_quality_tickets
for each row
execute procedure public.trigger_set_timestamp();

-- RLS
alter table public.crm_clients enable row level security;
alter table public.crm_data_quality_tickets enable row level security;
alter table public.crm_data_quality_contributions enable row level security;

-- Policies: active users can read; editors/admins can insert/update; admins can delete
drop policy if exists "CRM clients readable by active users" on public.crm_clients;
create policy "CRM clients readable by active users"
  on public.crm_clients for select
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
    )
  );

drop policy if exists "CRM tickets readable by active users" on public.crm_data_quality_tickets;
create policy "CRM tickets readable by active users"
  on public.crm_data_quality_tickets for select
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
    )
  );

drop policy if exists "CRM contributions readable by active users" on public.crm_data_quality_contributions;
create policy "CRM contributions readable by active users"
  on public.crm_data_quality_contributions for select
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
    )
  );

drop policy if exists "Editors can insert CRM tickets" on public.crm_data_quality_tickets;
create policy "Editors can insert CRM tickets"
  on public.crm_data_quality_tickets for insert
  with check (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role in ('editor', 'admin')
    )
  );

drop policy if exists "Editors can insert CRM contributions" on public.crm_data_quality_contributions;
create policy "Editors can insert CRM contributions"
  on public.crm_data_quality_contributions for insert
  with check (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role in ('editor', 'admin')
    )
  );

drop policy if exists "Editors can update CRM tickets" on public.crm_data_quality_tickets;
create policy "Editors can update CRM tickets"
  on public.crm_data_quality_tickets for update
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

drop policy if exists "Editors can update CRM contributions" on public.crm_data_quality_contributions;
create policy "Editors can update CRM contributions"
  on public.crm_data_quality_contributions for update
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

drop policy if exists "Admins can delete CRM tickets" on public.crm_data_quality_tickets;
create policy "Admins can delete CRM tickets"
  on public.crm_data_quality_tickets for delete
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role = 'admin'
    )
  );

drop policy if exists "Admins can delete CRM contributions" on public.crm_data_quality_contributions;
create policy "Admins can delete CRM contributions"
  on public.crm_data_quality_contributions for delete
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role = 'admin'
    )
  );
