-- Manual worklogs for monetization + internal efforts (workload)
create table if not exists public.work_manual_efforts (
  id uuid primary key default uuid_generate_v4(),
  scope text not null check (scope in ('monetization', 'internal')),
  effort_date date not null,
  user_id uuid references auth.users(id),
  owner text not null,
  workstream text not null,
  input_unit text not null check (input_unit in ('hours','days')),
  input_value numeric not null default 0,
  hours numeric not null default 0,
  comments text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists work_manual_efforts_scope_idx
  on public.work_manual_efforts (scope);

create index if not exists work_manual_efforts_scope_date_idx
  on public.work_manual_efforts (scope, effort_date);

create index if not exists work_manual_efforts_scope_user_idx
  on public.work_manual_efforts (scope, user_id);

-- Update timestamp trigger (reuse if already present)
drop trigger if exists set_timestamp on public.work_manual_efforts;
create trigger set_timestamp
before update on public.work_manual_efforts
for each row
execute procedure public.trigger_set_timestamp();

-- RLS
alter table public.work_manual_efforts enable row level security;

-- Policies: active users can read; editors/admins can insert/update; admins can delete
drop policy if exists "Work manual efforts readable by active users" on public.work_manual_efforts;
create policy "Work manual efforts readable by active users"
  on public.work_manual_efforts for select
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
    )
  );

drop policy if exists "Editors can insert work manual efforts" on public.work_manual_efforts;
create policy "Editors can insert work manual efforts"
  on public.work_manual_efforts for insert
  with check (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role in ('editor', 'admin')
    )
  );

drop policy if exists "Editors can update work manual efforts" on public.work_manual_efforts;
create policy "Editors can update work manual efforts"
  on public.work_manual_efforts for update
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

drop policy if exists "Admins can delete work manual efforts" on public.work_manual_efforts;
create policy "Admins can delete work manual efforts"
  on public.work_manual_efforts for delete
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role = 'admin'
    )
  );
