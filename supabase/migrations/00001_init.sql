-- drawme: initial schema, RLS, triggers, storage
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.app_config (
  key text primary key,
  value text not null
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

create table public.drawings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null default 'Untitled',
  scene jsonb not null default '{"elements": [], "appState": {}}'::jsonb,
  thumbnail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index drawings_owner_idx on public.drawings (owner_id, updated_at desc);

create table public.libraries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles (id) on delete cascade,
  name text not null,
  description text,
  scope text not null default 'user' check (scope in ('user', 'global')),
  data jsonb not null,
  storage_path text,
  created_at timestamptz not null default now(),
  -- global libraries have no owner; personal libraries must have one
  constraint libraries_scope_owner check ((scope = 'global') = (owner_id is null))
);
create index libraries_owner_idx on public.libraries (owner_id);
create index libraries_scope_idx on public.libraries (scope);

-- The set of library items currently installed in a user's editor
-- (mirrors Excalidraw's own localStorage persistence, but server-side).
create table public.user_library_state (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  library_items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Functions & triggers
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  admin_email text;
begin
  select value into admin_email from public.app_config where key = 'initial_admin_email';
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, ''), '@', 1)),
    case
      when admin_email is not null and lower(coalesce(new.email, '')) = lower(admin_email) then 'admin'
      else 'user'
    end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger drawings_set_updated_at
before update on public.drawings
for each row execute function public.set_updated_at();

create trigger user_library_state_set_updated_at
before update on public.user_library_state
for each row execute function public.set_updated_at();

-- Only admins may change the role column.
create or replace function public.protect_role_change()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'only admins can change roles';
  end if;
  return new;
end;
$$;

create trigger profiles_protect_role
before update on public.profiles
for each row execute function public.protect_role_change();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.app_config enable row level security;   -- no policies: deny all
alter table public.profiles enable row level security;
alter table public.drawings enable row level security;
alter table public.libraries enable row level security;
alter table public.user_library_state enable row level security;

-- profiles
create policy profiles_select_own_or_admin on public.profiles
  for select using (id = auth.uid() or public.is_admin());

create policy profiles_update_own on public.profiles
  for update using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_update_admin on public.profiles
  for update using (public.is_admin())
  with check (public.is_admin());

-- drawings: owner-only CRUD
create policy drawings_owner_all on public.drawings
  for all using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- libraries
create policy libraries_select_visible on public.libraries
  for select using (scope = 'global' or owner_id = auth.uid());

create policy libraries_insert_own on public.libraries
  for insert with check (scope = 'user' and owner_id = auth.uid());

create policy libraries_update_own on public.libraries
  for update using (scope = 'user' and owner_id = auth.uid())
  with check (scope = 'user' and owner_id = auth.uid());

create policy libraries_delete_own on public.libraries
  for delete using (scope = 'user' and owner_id = auth.uid());

create policy libraries_admin_all on public.libraries
  for all using (public.is_admin())
  with check (public.is_admin());

-- user_library_state: own row only
create policy user_library_state_own on public.user_library_state
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Storage: private bucket for uploaded .excalidrawlib files
-- Object paths: <user_id>/<filename> for personal, global/<filename> for global.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('libraries', 'libraries', false)
on conflict (id) do nothing;

create policy "libraries bucket: users manage own folder" on storage.objects
  for all using (
    bucket_id = 'libraries'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'libraries'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "libraries bucket: authenticated read global" on storage.objects
  for select using (
    bucket_id = 'libraries'
    and (storage.foldername(name))[1] = 'global'
    and auth.role() = 'authenticated'
  );

create policy "libraries bucket: admins manage global" on storage.objects
  for all using (
    bucket_id = 'libraries'
    and (storage.foldername(name))[1] = 'global'
    and public.is_admin()
  )
  with check (
    bucket_id = 'libraries'
    and (storage.foldername(name))[1] = 'global'
    and public.is_admin()
  );
