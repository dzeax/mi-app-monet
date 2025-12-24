-- Backfill missing ticket contributions from legacy ticket totals.
-- Idempotent: inserts only for tickets with zero contribution rows.

with alias_map as (
  select
    client_slug,
    lower(alias) as alias_key,
    person_id
  from public.crm_people_aliases
),
missing_tickets as (
  select t.*
  from public.crm_data_quality_tickets t
  where not exists (
    select 1
    from public.crm_data_quality_contributions c
    where c.ticket_id = t.id
  )
  and (coalesce(t.work_hours, 0) + coalesce(t.prep_hours, 0)) > 0
)
insert into public.crm_data_quality_contributions (
  ticket_id,
  client_slug,
  effort_date,
  owner,
  person_id,
  work_hours,
  prep_hours,
  workstream,
  notes
)
select
  t.id,
  t.client_slug,
  case
    when t.assigned_date is null then (timezone('utc', now()))::date
    when extract(year from t.assigned_date) >= 2026 then (timezone('utc', now()))::date
    else t.assigned_date
  end as effort_date,
  t.owner,
  a.person_id,
  coalesce(t.work_hours, 0),
  coalesce(t.prep_hours, coalesce(t.work_hours, 0) * 0.35),
  'Data Quality',
  null
from missing_tickets t
left join alias_map a
  on a.client_slug = t.client_slug
  and a.alias_key = lower(trim(t.owner));
