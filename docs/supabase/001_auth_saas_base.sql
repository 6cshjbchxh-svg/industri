-- SaaS-grunnstruktur for auth + firma-tilknytning
-- Kjør i Supabase SQL Editor (etter at Auth er aktiv)

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

alter table public.companies enable row level security;
alter table public.profiles enable row level security;

-- En bruker kan lese sin egen profil.
create policy if not exists "profiles_select_own"
on public.profiles
for select
to authenticated
using (id = auth.uid());

-- En bruker kan oppdatere sitt navn på egen profil (men ikke rolle/company via klient).
create policy if not exists "profiles_update_own"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- En bruker kan lese sitt firma (når company_id er satt).
create policy if not exists "companies_select_member"
on public.companies
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.company_id = companies.id
  )
);

-- Opprett profil automatisk ved ny signup i Auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();
