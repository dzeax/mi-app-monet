alter table public.crm_email_agent_runs
  drop constraint if exists crm_email_agent_runs_agent_name_check;

alter table public.crm_email_agent_runs
  add constraint crm_email_agent_runs_agent_name_check
  check (agent_name in ('extract', 'plan', 'copy', 'qa', 'parse', 'mapping'));
