-- Add optional profile fields for app users.
alter table app_users
  add column if not exists display_name text;

alter table app_users
  add column if not exists avatar_url text;

-- Optional: ensure future selects see most recent updates.
create index if not exists app_users_display_name_idx on app_users (lower(display_name)) where display_name is not null;
