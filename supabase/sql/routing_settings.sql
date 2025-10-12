-- Routing settings (global plan for routing costs)
create table if not exists public.routing_settings (
  key text primary key,
  data jsonb,
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid references auth.users(id)
);

create or replace function public.trigger_set_timestamp()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_timestamp_routing_settings on public.routing_settings;
create trigger set_timestamp_routing_settings
before update on public.routing_settings
for each row
execute procedure public.trigger_set_timestamp();

alter table public.routing_settings enable row level security;

drop policy if exists "Routing settings readable by active users" on public.routing_settings;
create policy "Routing settings readable by active users"
  on public.routing_settings for select
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
    )
  );

drop policy if exists "Admins can upsert routing settings" on public.routing_settings;
create policy "Admins can upsert routing settings"
  on public.routing_settings for all
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

-- seed empty row if not present
insert into public.routing_settings (key, data)
values ('global', jsonb_build_object('defaultRate', 0.18, 'periods', jsonb_build_array()))
on conflict (key) do nothing;

