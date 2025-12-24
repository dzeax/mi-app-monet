-- Annual CRM budget pools + role assignments

create table if not exists public.crm_budget_roles (
  id uuid primary key default uuid_generate_v4(),
  client_slug text not null references public.crm_clients(slug) on delete cascade,
  year integer not null,
  role_name text not null,
  pool_amount numeric not null default 0,
  currency text not null default 'EUR',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists crm_budget_roles_client_year_name_idx
  on public.crm_budget_roles (client_slug, year, lower(role_name));

create index if not exists crm_budget_roles_client_year_idx
  on public.crm_budget_roles (client_slug, year);

create table if not exists public.crm_budget_assignments (
  id uuid primary key default uuid_generate_v4(),
  client_slug text not null references public.crm_clients(slug) on delete cascade,
  role_id uuid not null references public.crm_budget_roles(id) on delete cascade,
  person_id uuid not null references public.crm_people(id) on delete cascade,
  allocation_amount numeric,
  allocation_pct numeric,
  start_date date,
  end_date date,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists crm_budget_assignments_unique_idx
  on public.crm_budget_assignments (role_id, person_id, start_date, end_date);

create index if not exists crm_budget_assignments_client_role_idx
  on public.crm_budget_assignments (client_slug, role_id);

create index if not exists crm_budget_assignments_client_person_idx
  on public.crm_budget_assignments (client_slug, person_id);

-- Update timestamp trigger (reuse shared function if present)
create or replace function public.trigger_set_timestamp()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_timestamp on public.crm_budget_roles;
create trigger set_timestamp
before update on public.crm_budget_roles
for each row
execute procedure public.trigger_set_timestamp();

drop trigger if exists set_timestamp on public.crm_budget_assignments;
create trigger set_timestamp
before update on public.crm_budget_assignments
for each row
execute procedure public.trigger_set_timestamp();

alter table public.crm_budget_roles enable row level security;
alter table public.crm_budget_assignments enable row level security;

drop policy if exists "CRM budget roles readable by active users" on public.crm_budget_roles;
create policy "CRM budget roles readable by active users"
  on public.crm_budget_roles for select
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
    )
  );

drop policy if exists "CRM budget assignments readable by active users" on public.crm_budget_assignments;
create policy "CRM budget assignments readable by active users"
  on public.crm_budget_assignments for select
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
    )
  );

drop policy if exists "Editors can insert CRM budget roles" on public.crm_budget_roles;
create policy "Editors can insert CRM budget roles"
  on public.crm_budget_roles for insert
  with check (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role in ('editor', 'admin')
    )
  );

drop policy if exists "Editors can insert CRM budget assignments" on public.crm_budget_assignments;
create policy "Editors can insert CRM budget assignments"
  on public.crm_budget_assignments for insert
  with check (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role in ('editor', 'admin')
    )
  );

drop policy if exists "Editors can update CRM budget roles" on public.crm_budget_roles;
create policy "Editors can update CRM budget roles"
  on public.crm_budget_roles for update
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

drop policy if exists "Editors can update CRM budget assignments" on public.crm_budget_assignments;
create policy "Editors can update CRM budget assignments"
  on public.crm_budget_assignments for update
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

drop policy if exists "Admins can delete CRM budget roles" on public.crm_budget_roles;
create policy "Admins can delete CRM budget roles"
  on public.crm_budget_roles for delete
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role = 'admin'
    )
  );

drop policy if exists "Admins can delete CRM budget assignments" on public.crm_budget_assignments;
create policy "Admins can delete CRM budget assignments"
  on public.crm_budget_assignments for delete
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role = 'admin'
    )
  );

-- Seed EMG 2025 roles (pool per role)
with role_seed as (
  select 'emg'::text as client_slug, 2025::int as year, 'Senior Project Manager'::text as role_name, 64800::numeric as pool_amount, 'EUR'::text as currency, 1::int as sort_order
  union all select 'emg', 2025, 'Campaign Manager', 113000, 'EUR', 2
  union all select 'emg', 2025, 'Trigger Campaign Manager', 102000, 'EUR', 3
  union all select 'emg', 2025, 'Senior Campaign Manager', 79500, 'EUR', 4
)
insert into public.crm_budget_roles (client_slug, year, role_name, pool_amount, currency, sort_order)
select s.client_slug, s.year, s.role_name, s.pool_amount, s.currency, s.sort_order
from role_seed s
where not exists (
  select 1 from public.crm_budget_roles r
  where r.client_slug = s.client_slug
    and r.year = s.year
    and lower(r.role_name) = lower(s.role_name)
);

-- Seed EMG 2025 assignments (default full-year membership)
with role_map as (
  select id, client_slug, year, role_name
  from public.crm_budget_roles
  where client_slug = 'emg' and year = 2025
),
people_map as (
  select id, client_slug, display_name
  from public.crm_people
  where client_slug = 'emg'
),
assignment_seed as (
  select 'Senior Project Manager'::text as role_name, 'David Zea'::text as display_name
  union all select 'Campaign Manager', 'Bela Hanif'
  union all select 'Campaign Manager', 'Louis Bouquerel'
  union all select 'Campaign Manager', 'Gina Reyes'
  union all select 'Campaign Manager', 'Judit Jover'
  union all select 'Trigger Campaign Manager', 'Stephane Rabarinala'
  union all select 'Trigger Campaign Manager', 'Pierre Gasnier'
  union all select 'Trigger Campaign Manager', 'Lucas Vialatte'
  union all select 'Senior Campaign Manager', 'Adrianna Bienko'
)
insert into public.crm_budget_assignments (
  client_slug,
  role_id,
  person_id,
  start_date,
  end_date
)
select
  r.client_slug,
  r.id,
  p.id,
  '2025-01-01'::date,
  '2025-12-31'::date
from assignment_seed a
join role_map r on lower(r.role_name) = lower(a.role_name)
join people_map p on lower(p.display_name) = lower(a.display_name)
where not exists (
  select 1 from public.crm_budget_assignments b
  where b.role_id = r.id and b.person_id = p.id
);
