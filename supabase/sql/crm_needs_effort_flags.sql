-- Persistent "Needs effort" queue flags for CRM ticket reporting
create table if not exists public.crm_needs_effort_flags (
  id uuid primary key default uuid_generate_v4(),
  client_slug text not null references public.crm_clients(slug) on delete cascade,
  ticket_id uuid not null references public.crm_data_quality_tickets(id) on delete cascade,
  state text not null default 'open' check (state in ('open', 'dismissed', 'cleared')),
  dismiss_reason text check (dismiss_reason in ('no_effort_needed', 'duplicate', 'out_of_scope')),
  detected_by uuid references auth.users(id),
  dismissed_by uuid references auth.users(id),
  dismissed_at timestamptz,
  cleared_by uuid references auth.users(id),
  cleared_at timestamptz,
  last_detected_status text,
  last_detected_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint crm_needs_effort_flags_client_ticket_key unique (client_slug, ticket_id)
);

-- Backfill / idempotent column adds for existing deployments
alter table public.crm_needs_effort_flags
  add column if not exists state text not null default 'open';

alter table public.crm_needs_effort_flags
  add column if not exists dismiss_reason text;

alter table public.crm_needs_effort_flags
  add column if not exists detected_by uuid references auth.users(id);

alter table public.crm_needs_effort_flags
  add column if not exists dismissed_by uuid references auth.users(id);

alter table public.crm_needs_effort_flags
  add column if not exists dismissed_at timestamptz;

alter table public.crm_needs_effort_flags
  add column if not exists cleared_by uuid references auth.users(id);

alter table public.crm_needs_effort_flags
  add column if not exists cleared_at timestamptz;

alter table public.crm_needs_effort_flags
  add column if not exists last_detected_status text;

alter table public.crm_needs_effort_flags
  add column if not exists last_detected_at timestamptz not null default timezone('utc', now());

alter table public.crm_needs_effort_flags
  add column if not exists created_at timestamptz not null default timezone('utc', now());

alter table public.crm_needs_effort_flags
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crm_needs_effort_flags_state_check'
  ) then
    alter table public.crm_needs_effort_flags
      add constraint crm_needs_effort_flags_state_check
      check (state in ('open', 'dismissed', 'cleared'));
  end if;
end$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crm_needs_effort_flags_dismiss_reason_check'
  ) then
    alter table public.crm_needs_effort_flags
      add constraint crm_needs_effort_flags_dismiss_reason_check
      check (dismiss_reason is null or dismiss_reason in ('no_effort_needed', 'duplicate', 'out_of_scope'));
  end if;
end$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crm_needs_effort_flags_client_ticket_key'
  ) then
    alter table public.crm_needs_effort_flags
      add constraint crm_needs_effort_flags_client_ticket_key unique (client_slug, ticket_id);
  end if;
end$$;

create index if not exists crm_needs_effort_flags_client_state_idx
  on public.crm_needs_effort_flags (client_slug, state);

create index if not exists crm_needs_effort_flags_ticket_idx
  on public.crm_needs_effort_flags (ticket_id);

-- Ensure the timestamp trigger function exists
create or replace function public.trigger_set_timestamp()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_timestamp on public.crm_needs_effort_flags;
create trigger set_timestamp
before update on public.crm_needs_effort_flags
for each row
execute procedure public.trigger_set_timestamp();

-- RLS
alter table public.crm_needs_effort_flags enable row level security;

drop policy if exists "Needs effort flags readable by active users" on public.crm_needs_effort_flags;
create policy "Needs effort flags readable by active users"
  on public.crm_needs_effort_flags for select
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
    )
  );

drop policy if exists "Admins can insert needs effort flags" on public.crm_needs_effort_flags;
create policy "Admins can insert needs effort flags"
  on public.crm_needs_effort_flags for insert
  with check (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role = 'admin'
    )
  );

drop policy if exists "Admins can update needs effort flags" on public.crm_needs_effort_flags;
create policy "Admins can update needs effort flags"
  on public.crm_needs_effort_flags for update
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role = 'admin'
    )
  );

drop policy if exists "Admins can delete needs effort flags" on public.crm_needs_effort_flags;
create policy "Admins can delete needs effort flags"
  on public.crm_needs_effort_flags for delete
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role = 'admin'
    )
  );

