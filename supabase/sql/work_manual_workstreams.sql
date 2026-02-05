-- Manual worklog workstreams (shared across monetization + internal scopes)
create table if not exists public.work_manual_workstreams (
  id uuid primary key default uuid_generate_v4(),
  scope text not null check (scope in ('monetization', 'internal')),
  label text not null,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists work_manual_workstreams_scope_label_uidx
  on public.work_manual_workstreams (scope, label);

create index if not exists work_manual_workstreams_scope_idx
  on public.work_manual_workstreams (scope);

-- Update timestamp trigger (reuse if already present)
drop trigger if exists set_timestamp on public.work_manual_workstreams;
create trigger set_timestamp
before update on public.work_manual_workstreams
for each row
execute procedure public.trigger_set_timestamp();

-- RLS
alter table public.work_manual_workstreams enable row level security;

-- Policies: active users can read; editors/admins can insert/update; admins can delete
drop policy if exists "Work manual workstreams readable by active users" on public.work_manual_workstreams;
create policy "Work manual workstreams readable by active users"
  on public.work_manual_workstreams for select
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
    )
  );

drop policy if exists "Editors can insert work manual workstreams" on public.work_manual_workstreams;
create policy "Editors can insert work manual workstreams"
  on public.work_manual_workstreams for insert
  with check (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role in ('editor', 'admin')
    )
  );

drop policy if exists "Editors can update work manual workstreams" on public.work_manual_workstreams;
create policy "Editors can update work manual workstreams"
  on public.work_manual_workstreams for update
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

drop policy if exists "Admins can delete work manual workstreams" on public.work_manual_workstreams;
create policy "Admins can delete work manual workstreams"
  on public.work_manual_workstreams for delete
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role = 'admin'
    )
  );
