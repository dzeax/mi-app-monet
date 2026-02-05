-- Migration: align campaign planning statuses with new nomenclature.

update public.campaign_planning
set status = case lower(status)
  when 'planning' then 'Planning'
  when 'backlog' then 'Planning'
  when 'refining' then 'Refining'
  when 'wip' then 'Refining'
  when 'validation' then 'Validation'
  when 'approved' then 'Approved'
  when 'ready' then 'Approved'
  when 'programmed' then 'Programmed'
  when 'reporting' then 'Profit'
  when 'completed' then 'Profit'
  when 'profit' then 'Profit'
  else 'Planning'
end;
