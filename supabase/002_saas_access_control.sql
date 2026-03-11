-- 002_saas_access_control.sql
-- Sikrer SaaS-basert tilgangsstyring over Supabase Auth.

create extension if not exists pgcrypto;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  plan text not null default 'starter',
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text,
  role text not null default 'user' check (role in ('superadmin', 'company_admin', 'user')),
  company_id uuid references public.companies(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.profiles
  alter column role set default 'user',
  alter column is_active set default true;

alter table public.companies
  alter column is_active set default true,
  alter column plan set default 'starter';

create index if not exists idx_profiles_company_id on public.profiles(company_id);
create index if not exists idx_profiles_role on public.profiles(role);

create or replace function public.is_superadmin(_uid uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = _uid
      and p.role = 'superadmin'
      and p.is_active = true
  );
$$;

alter table public.profiles enable row level security;
alter table public.companies enable row level security;

-- Rydd opp gamle policy-navn før vi lager nye sikre policyer.
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "companies_select_member" on public.companies;
drop policy if exists "profiles_select_self_or_superadmin" on public.profiles;
drop policy if exists "profiles_update_self_or_superadmin" on public.profiles;
drop policy if exists "companies_select_member_or_superadmin" on public.companies;

create policy "profiles_select_self_or_superadmin"
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or public.is_superadmin(auth.uid())
);

create policy "profiles_update_self_or_superadmin"
on public.profiles
for update
to authenticated
using (
  id = auth.uid()
  or public.is_superadmin(auth.uid())
)
with check (
  id = auth.uid()
  or public.is_superadmin(auth.uid())
);

create policy "companies_select_member_or_superadmin"
on public.companies
for select
to authenticated
using (
  public.is_superadmin(auth.uid())
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.company_id = companies.id
  )
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do update
    set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();
