-- Folders let users group their drawings on the dashboard. A drawing is in at
-- most one folder; deleting a folder moves its drawings back to "Unfiled".

create table public.folders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  created_at timestamptz not null default now()
);
create index folders_owner_idx on public.folders (owner_id, name);

alter table public.folders enable row level security;

create policy folders_owner_all on public.folders
  for all using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

alter table public.drawings
  add column folder_id uuid references public.folders (id) on delete set null;
create index drawings_folder_idx on public.drawings (folder_id);

-- A drawing may only be filed into one of its owner's own folders.
create or replace function public.check_drawing_folder_owner()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.folder_id is not null and not exists (
    select 1 from public.folders
    where id = new.folder_id and owner_id = new.owner_id
  ) then
    raise exception 'folder does not belong to the drawing owner';
  end if;
  return new;
end;
$$;

create trigger drawings_check_folder_owner
before insert or update of folder_id on public.drawings
for each row execute function public.check_drawing_folder_owner();

revoke execute on function public.check_drawing_folder_owner() from public, anon, authenticated;
