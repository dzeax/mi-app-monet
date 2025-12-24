-- Migration helper: seed CRM people + aliases and backfill person_id
-- Safe to run multiple times; does not mutate existing owner strings.

-- Ensure person_id columns exist on dependent tables (older deployments).
alter table if exists public.crm_owner_rates
  add column if not exists person_id uuid references public.crm_people(id);

alter table if exists public.crm_data_quality_contributions
  add column if not exists person_id uuid references public.crm_people(id);

alter table if exists public.campaign_email_units
  add column if not exists person_id uuid references public.crm_people(id);

-- Seed canonical people for EMG.
with seeds as (
  select 'emg'::text as client_slug, 'Adrianna Bienko'::text as display_name, 'extern.adrianna.bienko@europcar.com'::text as email
  union all select 'emg', 'Bela Hanif', 'extern.bela.hanif@europcar.com'
  union all select 'emg', 'David Zea', 'extern.david.zea@europcar.com'
  union all select 'emg', 'Gina Reyes', 'extern.gina.reyes@europcar.com'
  union all select 'emg', 'Judit Jover', 'extern.judit.jover@europcar.com'
  union all select 'emg', 'Lucas Vialatte', 'extern.lucas.vialatte@europcar.com'
  union all select 'emg', 'Louis Bouquerel', 'extern.louis.bouquerel@europcar.com'
  union all select 'emg', 'Pierre Gasnier', 'extern.pierre.gasnier@europcar.com'
  union all select 'emg', 'Stephane Rabarinala', 'extern.stephane.rabarinala@europcar.com'
)
insert into public.crm_people (client_slug, display_name, email)
select s.client_slug, s.display_name, s.email
from seeds s
where not exists (
  select 1 from public.crm_people p
  where p.client_slug = s.client_slug
    and lower(p.display_name) = lower(s.display_name)
);

-- Seed aliases for canonical people.
with aliases as (
  select 'emg'::text as client_slug, 'Adrianna Bienko'::text as display_name, 'Adrianna'::text as alias
  union all select 'emg', 'Adrianna Bienko', 'extern.adrianna.bienko'
  union all select 'emg', 'Adrianna Bienko', 'extern.adrianna.bienko@europcar.com'
  union all select 'emg', 'Bela Hanif', 'Bela'
  union all select 'emg', 'Bela Hanif', 'extern.bela.hanif'
  union all select 'emg', 'Bela Hanif', 'extern.bela.hanif@europcar.com'
  union all select 'emg', 'David Zea', 'David'
  union all select 'emg', 'David Zea', 'extern.david.zea'
  union all select 'emg', 'David Zea', 'extern.david.zea@europcar.com'
  union all select 'emg', 'Gina Reyes', 'Gina'
  union all select 'emg', 'Gina Reyes', 'extern.gina.reyes'
  union all select 'emg', 'Gina Reyes', 'extern.gina.reyes@europcar.com'
  union all select 'emg', 'Judit Jover', 'Judit'
  union all select 'emg', 'Judit Jover', 'extern.judit.jover'
  union all select 'emg', 'Judit Jover', 'extern.judit.jover@europcar.com'
  union all select 'emg', 'Lucas Vialatte', 'Lucas'
  union all select 'emg', 'Lucas Vialatte', 'Lucas V.'
  union all select 'emg', 'Lucas Vialatte', 'extern.lucas.vialatte'
  union all select 'emg', 'Lucas Vialatte', 'extern.lucas.vialatte@europcar.com'
  union all select 'emg', 'Louis Bouquerel', 'Louis'
  union all select 'emg', 'Louis Bouquerel', 'extern.louis.bouquerel'
  union all select 'emg', 'Louis Bouquerel', 'extern.louis.bouquerel@europcar.com'
  union all select 'emg', 'Pierre Gasnier', 'Pierre'
  union all select 'emg', 'Pierre Gasnier', 'extern.pierre.gasnier'
  union all select 'emg', 'Pierre Gasnier', 'extern.pierre.gasnier@europcar.com'
  union all select 'emg', 'Stephane Rabarinala', 'Stephane'
  union all select 'emg', 'Stephane Rabarinala', 'extern.stephane.rabarinala'
  union all select 'emg', 'Stephane Rabarinala', 'extern.stephane.rabarinala@europcar.com'
)
insert into public.crm_people_aliases (client_slug, person_id, alias)
select a.client_slug, p.id, a.alias
from aliases a
join public.crm_people p
  on p.client_slug = a.client_slug
  and lower(p.display_name) = lower(a.display_name)
where not exists (
  select 1 from public.crm_people_aliases x
  where x.client_slug = a.client_slug
    and lower(x.alias) = lower(a.alias)
);

-- Add people entries for any remaining owners not covered by aliases.
with raw_owners as (
  select client_slug, owner from public.crm_owner_rates
  union
  select client_slug, owner from public.crm_data_quality_contributions
  union
  select client_slug, owner from public.campaign_email_units
  union
  select client_slug, label as owner from public.crm_catalog_items where kind = 'owner'
),
normalized as (
  select client_slug, trim(owner) as owner
  from raw_owners
  where owner is not null and trim(owner) <> ''
),
missing as (
  select n.client_slug, n.owner
  from normalized n
  left join public.crm_people_aliases a
    on a.client_slug = n.client_slug and lower(a.alias) = lower(n.owner)
  where a.id is null
)
insert into public.crm_people (client_slug, display_name)
select m.client_slug, m.owner
from missing m
where not exists (
  select 1 from public.crm_people p
  where p.client_slug = m.client_slug
    and lower(p.display_name) = lower(m.owner)
);

-- Ensure every person has a self-alias.
insert into public.crm_people_aliases (client_slug, person_id, alias)
select p.client_slug, p.id, p.display_name
from public.crm_people p
left join public.crm_people_aliases a
  on a.client_slug = p.client_slug and lower(a.alias) = lower(p.display_name)
where a.id is null;

-- Backfill person_id for existing rows.
update public.crm_owner_rates r
set person_id = a.person_id
from public.crm_people_aliases a
where r.person_id is null
  and a.client_slug = r.client_slug
  and lower(a.alias) = lower(r.owner);

update public.crm_data_quality_contributions c
set person_id = a.person_id
from public.crm_people_aliases a
where c.person_id is null
  and a.client_slug = c.client_slug
  and lower(a.alias) = lower(c.owner);

update public.campaign_email_units u
set person_id = a.person_id
from public.crm_people_aliases a
where u.person_id is null
  and a.client_slug = u.client_slug
  and lower(a.alias) = lower(u.owner);
