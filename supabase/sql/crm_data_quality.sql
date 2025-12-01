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
  created_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Ticket contributions (multiple owners per ticket)
create table if not exists public.crm_data_quality_contributions (
  id uuid primary key default uuid_generate_v4(),
  ticket_id uuid not null references public.crm_data_quality_tickets(id) on delete cascade,
  client_slug text not null references public.crm_clients(slug) on delete cascade,
  owner text not null,
  work_hours numeric not null default 0,
  prep_hours numeric,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint crm_data_quality_contrib_unique_owner unique (ticket_id, owner)
);

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
