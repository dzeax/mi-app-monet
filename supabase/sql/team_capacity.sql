-- Team capacity contracts (weekly hours) + calendars
create extension if not exists "uuid-ossp";

create table if not exists public.team_capacity_contracts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  weekly_hours numeric not null check (weekly_hours >= 0),
  -- Legacy country_code kept for backward compatibility (treated as calendar_code in the app)
  country_code text not null check (country_code in ('ES','FR')),
  -- Contract country drives default vacation entitlement (ES=22, FR=30)
  contract_country_code text check (contract_country_code in ('ES','FR')),
  -- Calendar code drives holiday calendar (ES=Catalonia, FR=FR adjusted)
  calendar_code text check (calendar_code in ('ES','FR')),
  annual_vacation_days numeric check (annual_vacation_days >= 0),
  start_date date not null default (timezone('utc', now()))::date,
  end_date date,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint team_capacity_contracts_user_start_key unique (user_id, start_date)
);

create index if not exists team_capacity_contracts_user_idx
  on public.team_capacity_contracts (user_id);

create index if not exists team_capacity_contracts_country_idx
  on public.team_capacity_contracts (country_code);

create table if not exists public.team_holidays (
  id uuid primary key default uuid_generate_v4(),
  -- Calendar code (ES=Catalonia, FR=FR adjusted)
  country_code text not null check (country_code in ('ES','FR')),
  holiday_date date not null,
  label text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint team_holidays_country_date_key unique (country_code, holiday_date)
);

create index if not exists team_holidays_country_idx
  on public.team_holidays (country_code, holiday_date);

create table if not exists public.team_time_off (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  type text not null default 'vacation' check (type in ('vacation','sick','other')),
  start_day_fraction numeric not null default 1 check (start_day_fraction in (0.5, 1)),
  end_day_fraction numeric not null default 1 check (end_day_fraction in (0.5, 1)),
  reason text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint team_time_off_range_check check (end_date >= start_date)
);

create index if not exists team_time_off_user_idx
  on public.team_time_off (user_id, start_date, end_date);

-- Flag users that should appear in Team Capacity
alter table public.app_users
  add column if not exists in_team_capacity boolean;

update public.app_users
set in_team_capacity = true
where in_team_capacity is null;

alter table public.app_users
  alter column in_team_capacity set default true;

alter table public.app_users
  alter column in_team_capacity set not null;

-- Backfill / idempotent column adds for existing deployments
alter table public.team_capacity_contracts
  add column if not exists contract_country_code text;

alter table public.team_capacity_contracts
  add column if not exists calendar_code text;

alter table public.team_capacity_contracts
  add column if not exists annual_vacation_days numeric;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'team_capacity_contracts_contract_country_check'
  ) then
    alter table public.team_capacity_contracts
      add constraint team_capacity_contracts_contract_country_check
      check (contract_country_code is null or contract_country_code in ('ES','FR'));
  end if;
end$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'team_capacity_contracts_calendar_check'
  ) then
    alter table public.team_capacity_contracts
      add constraint team_capacity_contracts_calendar_check
      check (calendar_code is null or calendar_code in ('ES','FR'));
  end if;
end$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'team_capacity_contracts_annual_vacation_check'
  ) then
    alter table public.team_capacity_contracts
      add constraint team_capacity_contracts_annual_vacation_check
      check (annual_vacation_days is null or annual_vacation_days >= 0);
  end if;
end$$;

update public.team_capacity_contracts
set contract_country_code = country_code
where contract_country_code is null;

update public.team_capacity_contracts
set calendar_code = country_code
where calendar_code is null;

update public.team_capacity_contracts
set annual_vacation_days = case contract_country_code when 'FR' then 30 when 'ES' then 22 else null end
where annual_vacation_days is null;

alter table public.team_time_off
  add column if not exists type text;

alter table public.team_time_off
  add column if not exists start_day_fraction numeric;

alter table public.team_time_off
  add column if not exists end_day_fraction numeric;

update public.team_time_off
set type = 'vacation'
where type is null;

update public.team_time_off
set start_day_fraction = 1
where start_day_fraction is null;

update public.team_time_off
set end_day_fraction = 1
where end_day_fraction is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'team_time_off_type_check'
  ) then
    alter table public.team_time_off
      add constraint team_time_off_type_check
      check (type in ('vacation','sick','other'));
  end if;
end$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'team_time_off_start_fraction_check'
  ) then
    alter table public.team_time_off
      add constraint team_time_off_start_fraction_check
      check (start_day_fraction in (0.5, 1));
  end if;
end$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'team_time_off_end_fraction_check'
  ) then
    alter table public.team_time_off
      add constraint team_time_off_end_fraction_check
      check (end_day_fraction in (0.5, 1));
  end if;
end$$;

alter table public.team_time_off
  alter column type set default 'vacation';

alter table public.team_time_off
  alter column type set not null;

alter table public.team_time_off
  alter column start_day_fraction set default 1;

alter table public.team_time_off
  alter column start_day_fraction set not null;

alter table public.team_time_off
  alter column end_day_fraction set default 1;

alter table public.team_time_off
  alter column end_day_fraction set not null;

-- Seed 2026 holidays (ES = Catalonia, FR = adjusted company calendar)
insert into public.team_holidays (country_code, holiday_date, label)
values
  -- France official (2026)
  ('FR', '2026-01-01', 'New Year''s Day'),
  ('FR', '2026-04-06', 'Easter Monday'),
  ('FR', '2026-05-01', 'Labour Day'),
  ('FR', '2026-05-08', 'Victory in Europe Day'),
  ('FR', '2026-05-14', 'Ascension Day'),
  ('FR', '2026-05-25', 'Pentecost Monday'),
  ('FR', '2026-07-14', 'Bastille Day'),
  ('FR', '2026-08-15', 'Assumption of Mary'),
  ('FR', '2026-11-11', 'Armistice Day'),
  ('FR', '2026-12-25', 'Christmas Day'),
  -- France company days
  ('FR', '2026-12-24', 'Company day'),
  ('FR', '2026-12-31', 'Company day'),
  -- Spain (Catalonia) 2026
  ('ES', '2026-01-01', 'Año Nuevo'),
  ('ES', '2026-01-06', 'Reyes Magos'),
  ('ES', '2026-04-03', 'Viernes Santo'),
  ('ES', '2026-04-06', 'Lunes de Pascua'),
  ('ES', '2026-05-01', 'Día del Trabajador'),
  ('ES', '2026-05-25', 'Segunda Pascua'),
  ('ES', '2026-06-24', 'Sant Joan'),
  ('ES', '2026-09-11', 'Diada de Catalunya'),
  ('ES', '2026-09-24', 'La Mercè'),
  ('ES', '2026-10-12', 'Fiesta Nacional de España'),
  ('ES', '2026-11-01', 'Todos los Santos'),
  ('ES', '2026-12-06', 'Día de la Constitución'),
  ('ES', '2026-12-08', 'Inmaculada Concepción'),
  ('ES', '2026-12-25', 'Navidad'),
  ('ES', '2026-12-26', 'Sant Esteve')
on conflict (country_code, holiday_date) do nothing;

-- Timestamp trigger (reuse shared function if present)
create or replace function public.trigger_set_timestamp()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_timestamp on public.team_capacity_contracts;
create trigger set_timestamp
before update on public.team_capacity_contracts
for each row
execute procedure public.trigger_set_timestamp();

drop trigger if exists set_timestamp on public.team_holidays;
create trigger set_timestamp
before update on public.team_holidays
for each row
execute procedure public.trigger_set_timestamp();

drop trigger if exists set_timestamp on public.team_time_off;
create trigger set_timestamp
before update on public.team_time_off
for each row
execute procedure public.trigger_set_timestamp();

-- RLS
alter table public.team_capacity_contracts enable row level security;
alter table public.team_holidays enable row level security;
alter table public.team_time_off enable row level security;

drop policy if exists "Team capacity readable by admins" on public.team_capacity_contracts;
create policy "Team capacity readable by admins"
  on public.team_capacity_contracts for select
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role = 'admin'
    )
  );

drop policy if exists "Admins can insert team capacity" on public.team_capacity_contracts;
create policy "Admins can insert team capacity"
  on public.team_capacity_contracts for insert
  with check (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role = 'admin'
    )
  );

drop policy if exists "Admins can update team capacity" on public.team_capacity_contracts;
create policy "Admins can update team capacity"
  on public.team_capacity_contracts for update
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

drop policy if exists "Admins can delete team capacity" on public.team_capacity_contracts;
create policy "Admins can delete team capacity"
  on public.team_capacity_contracts for delete
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role = 'admin'
    )
  );

drop policy if exists "Team holidays readable by admins" on public.team_holidays;
create policy "Team holidays readable by admins"
  on public.team_holidays for select
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role = 'admin'
    )
  );

drop policy if exists "Admins can insert team holidays" on public.team_holidays;
create policy "Admins can insert team holidays"
  on public.team_holidays for insert
  with check (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role = 'admin'
    )
  );

drop policy if exists "Admins can update team holidays" on public.team_holidays;
create policy "Admins can update team holidays"
  on public.team_holidays for update
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

drop policy if exists "Admins can delete team holidays" on public.team_holidays;
create policy "Admins can delete team holidays"
  on public.team_holidays for delete
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role = 'admin'
    )
  );

drop policy if exists "Team time off readable by admins" on public.team_time_off;
create policy "Team time off readable by admins"
  on public.team_time_off for select
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role = 'admin'
    )
  );

drop policy if exists "Admins can insert team time off" on public.team_time_off;
create policy "Admins can insert team time off"
  on public.team_time_off for insert
  with check (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role = 'admin'
    )
  );

drop policy if exists "Admins can update team time off" on public.team_time_off;
create policy "Admins can update team time off"
  on public.team_time_off for update
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

drop policy if exists "Admins can delete team time off" on public.team_time_off;
create policy "Admins can delete team time off"
  on public.team_time_off for delete
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role = 'admin'
    )
  );
