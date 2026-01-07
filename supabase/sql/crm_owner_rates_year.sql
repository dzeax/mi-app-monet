-- Add year dimension to CRM owner rates (one rate per owner per year)
-- Safe to run multiple times.

alter table public.crm_owner_rates
  add column if not exists year int;

update public.crm_owner_rates
set year = extract(year from valid_from)::int
where year is null and valid_from is not null;

update public.crm_owner_rates
set year = extract(year from created_at)::int
where year is null and created_at is not null;

update public.crm_owner_rates
set year = extract(year from timezone('utc', now()))::int
where year is null;

alter table public.crm_owner_rates
  alter column year set not null;

do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'crm_owner_rates_client_owner_key'
  ) then
    alter table public.crm_owner_rates drop constraint crm_owner_rates_client_owner_key;
  end if;
end$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crm_owner_rates_client_owner_year_key'
  ) then
    alter table public.crm_owner_rates
      add constraint crm_owner_rates_client_owner_year_key unique (client_slug, owner, year);
  end if;
end$$;

create index if not exists crm_owner_rates_client_year_idx
  on public.crm_owner_rates (client_slug, year);
