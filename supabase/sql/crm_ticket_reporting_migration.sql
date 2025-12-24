-- Migration helper: merge Strategy Reporting data into Ticket Reporting (crm_data_quality_*)
-- Safe to run multiple times; uses upserts and conflict handling.

-- Ensure workstream column exists and is populated.
alter table public.crm_data_quality_contributions
  add column if not exists workstream text;

update public.crm_data_quality_contributions
set workstream = 'Data Quality'
where workstream is null;

alter table public.crm_data_quality_contributions
  alter column workstream set default 'Data Quality';

alter table public.crm_data_quality_contributions
  alter column workstream set not null;

-- Ensure unique constraint includes workstream.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'crm_data_quality_contrib_unique_owner_date'
  ) then
    alter table public.crm_data_quality_contributions
      drop constraint crm_data_quality_contrib_unique_owner_date;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'crm_data_quality_contrib_unique_owner_date_stream'
  ) then
    alter table public.crm_data_quality_contributions
      add constraint crm_data_quality_contrib_unique_owner_date_stream unique (ticket_id, owner, effort_date, workstream);
  end if;
end$$;

-- Insert missing tickets from Strategy into Ticket Reporting.
insert into public.crm_data_quality_tickets (
  client_slug,
  status,
  assigned_date,
  due_date,
  ticket_id,
  title,
  priority,
  owner,
  reporter,
  type,
  jira_url,
  jira_assignee,
  work_hours,
  prep_hours,
  eta_date,
  comments,
  created_by
)
select
  s.client_slug,
  coalesce(nullif(s.status, ''), 'Backlog'),
  s.created_date,
  s.due_date,
  s.jira_ticket,
  s.title,
  'P2',
  coalesce(nullif(s.jira_assignee, ''), 'Unassigned'),
  null,
  null,
  s.jira_url,
  s.jira_assignee,
  0,
  null,
  s.due_date,
  case
    when s.category is not null or s.brand is not null or s.segment is not null
      then concat(
        'Strategy meta - Category: ', coalesce(s.category, '-'),
        ', Brand: ', coalesce(s.brand, '-'),
        ', Segment: ', coalesce(s.segment, '-')
      )
    else s.notes
  end,
  s.created_by
from public.crm_strategy_tickets s
left join public.crm_data_quality_tickets d
  on d.client_slug = s.client_slug and d.ticket_id = s.jira_ticket
where d.id is null;

-- Insert strategy efforts as Ticket Reporting contributions with workstream = 'Strategy'.
insert into public.crm_data_quality_contributions (
  ticket_id,
  client_slug,
  effort_date,
  owner,
  work_hours,
  prep_hours,
  notes,
  workstream,
  created_by
)
select
  d.id,
  s.client_slug,
  coalesce(e.effort_date, s.created_date),
  e.owner,
  e.hours,
  0,
  e.notes,
  'Strategy',
  e.created_by
from public.crm_strategy_efforts e
join public.crm_strategy_tickets s on s.id = e.ticket_id
join public.crm_data_quality_tickets d
  on d.client_slug = s.client_slug and d.ticket_id = s.jira_ticket
on conflict (ticket_id, owner, effort_date, workstream)
do update set
  work_hours = excluded.work_hours,
  prep_hours = excluded.prep_hours,
  notes = excluded.notes,
  updated_at = timezone('utc', now());
