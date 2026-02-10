-- Restrict worklog visibility/mutations so editors only manage their own entries.

alter table public.work_manual_efforts enable row level security;

drop policy if exists "Work manual efforts readable by active users" on public.work_manual_efforts;
drop policy if exists "Editors can insert work manual efforts" on public.work_manual_efforts;
drop policy if exists "Editors can update work manual efforts" on public.work_manual_efforts;

drop policy if exists "Admins can read all work manual efforts" on public.work_manual_efforts;
create policy "Admins can read all work manual efforts"
  on public.work_manual_efforts for select
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role = 'admin'
    )
  );

drop policy if exists "Editors can read own work manual efforts" on public.work_manual_efforts;
create policy "Editors can read own work manual efforts"
  on public.work_manual_efforts for select
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role = 'editor'
    )
  );

drop policy if exists "Admins can insert work manual efforts" on public.work_manual_efforts;
create policy "Admins can insert work manual efforts"
  on public.work_manual_efforts for insert
  with check (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role = 'admin'
    )
  );

drop policy if exists "Editors can insert own work manual efforts" on public.work_manual_efforts;
create policy "Editors can insert own work manual efforts"
  on public.work_manual_efforts for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role = 'editor'
    )
  );

drop policy if exists "Admins can update work manual efforts" on public.work_manual_efforts;
create policy "Admins can update work manual efforts"
  on public.work_manual_efforts for update
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

drop policy if exists "Editors can update own work manual efforts" on public.work_manual_efforts;
create policy "Editors can update own work manual efforts"
  on public.work_manual_efforts for update
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role = 'editor'
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role = 'editor'
    )
  );
