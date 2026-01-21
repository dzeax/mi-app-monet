-- Budget adjustments (e.g., carry-over between years)
create table if not exists public.crm_budget_adjustments (
  id uuid primary key default uuid_generate_v4(),
  client_slug text not null references public.crm_clients(slug) on delete cascade,
  from_year integer not null,
  to_year integer not null,
  role_id uuid not null references public.crm_budget_roles(id) on delete cascade,
  amount numeric not null default 0,
  type text not null default 'carryover',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint crm_budget_adjustments_unique unique (client_slug, from_year, to_year, role_id, type)
);

create index if not exists crm_budget_adjustments_client_to_year_idx
  on public.crm_budget_adjustments (client_slug, to_year);

create index if not exists crm_budget_adjustments_role_idx
  on public.crm_budget_adjustments (role_id);

-- Reuse timestamp trigger
create or replace function public.trigger_set_timestamp()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_timestamp on public.crm_budget_adjustments;
create trigger set_timestamp
before update on public.crm_budget_adjustments
for each row
execute procedure public.trigger_set_timestamp();

alter table public.crm_budget_adjustments enable row level security;

drop policy if exists "CRM budget adjustments readable by active users" on public.crm_budget_adjustments;
create policy "CRM budget adjustments readable by active users"
  on public.crm_budget_adjustments for select
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
    )
  );

drop policy if exists "Editors can insert CRM budget adjustments" on public.crm_budget_adjustments;
create policy "Editors can insert CRM budget adjustments"
  on public.crm_budget_adjustments for insert
  with check (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role in ('editor', 'admin')
    )
  );

drop policy if exists "Editors can update CRM budget adjustments" on public.crm_budget_adjustments;
create policy "Editors can update CRM budget adjustments"
  on public.crm_budget_adjustments for update
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

drop policy if exists "Admins can delete CRM budget adjustments" on public.crm_budget_adjustments;
create policy "Admins can delete CRM budget adjustments"
  on public.crm_budget_adjustments for delete
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role = 'admin'
    )
  );
