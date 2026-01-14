-- Public share links for CRM modules (Budget Execution, etc.)
create extension if not exists "uuid-ossp";

create table if not exists public.crm_public_shares (
  id uuid primary key default uuid_generate_v4(),
  client_slug text not null references public.crm_clients(slug) on delete cascade,
  module text not null,
  allowed_years int[] not null,
  token_hash text not null,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  revoked_at timestamptz,
  last_used_at timestamptz,
  use_count int not null default 0,
  constraint crm_public_shares_unique unique (client_slug, module, token_hash)
);

create index if not exists crm_public_shares_token_idx
  on public.crm_public_shares (token_hash);

create index if not exists crm_public_shares_client_module_idx
  on public.crm_public_shares (client_slug, module);

alter table public.crm_public_shares enable row level security;

drop policy if exists "Admins can read CRM public shares" on public.crm_public_shares;
create policy "Admins can read CRM public shares"
  on public.crm_public_shares for select
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role = 'admin'
    )
  );

drop policy if exists "Admins can insert CRM public shares" on public.crm_public_shares;
create policy "Admins can insert CRM public shares"
  on public.crm_public_shares for insert
  with check (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role = 'admin'
    )
  );

drop policy if exists "Admins can update CRM public shares" on public.crm_public_shares;
create policy "Admins can update CRM public shares"
  on public.crm_public_shares for update
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

drop policy if exists "Admins can delete CRM public shares" on public.crm_public_shares;
create policy "Admins can delete CRM public shares"
  on public.crm_public_shares for delete
  using (
    exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.is_active = true
        and au.role = 'admin'
    )
  );
