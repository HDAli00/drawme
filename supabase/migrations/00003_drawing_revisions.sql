-- Keep a history of each drawing's scene so a bad save (or an accidental
-- clear) can always be undone. Rows are written by a trigger, never by the
-- client directly.

create table public.drawing_revisions (
  id bigint generated always as identity primary key,
  drawing_id uuid not null references public.drawings (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  scene jsonb not null,
  element_count integer not null,
  created_at timestamptz not null default now()
);
create index drawing_revisions_drawing_idx
  on public.drawing_revisions (drawing_id, created_at desc);

alter table public.drawing_revisions enable row level security;

create policy drawing_revisions_select_own on public.drawing_revisions
  for select using (owner_id = auth.uid());

create or replace function public.scene_element_count(scene jsonb)
returns integer
language sql immutable
set search_path = public
as $$
  select coalesce(jsonb_array_length(
    case when jsonb_typeof(scene -> 'elements') = 'array'
      then scene -> 'elements' else '[]'::jsonb end
  ), 0);
$$;

-- Snapshot the previous scene before it is overwritten. To keep the table
-- small, a snapshot is taken at most every 10 minutes per drawing, except
-- that a save which removes elements is always preceded by a snapshot.
create or replace function public.record_drawing_revision()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  old_count integer := public.scene_element_count(old.scene);
  new_count integer := public.scene_element_count(new.scene);
begin
  if new.scene is not distinct from old.scene or old_count = 0 then
    return new;
  end if;

  if new_count < old_count or not exists (
    select 1 from public.drawing_revisions
    where drawing_id = old.id
      and created_at > now() - interval '10 minutes'
  ) then
    insert into public.drawing_revisions (drawing_id, owner_id, scene, element_count)
    values (old.id, old.owner_id, old.scene, old_count);

    -- Keep the 50 most recent revisions per drawing.
    delete from public.drawing_revisions
    where drawing_id = old.id
      and id not in (
        select id from public.drawing_revisions
        where drawing_id = old.id
        order by created_at desc, id desc
        limit 50
      );
  end if;

  return new;
end;
$$;

create trigger drawings_record_revision
before update of scene on public.drawings
for each row execute function public.record_drawing_revision();

revoke execute on function public.record_drawing_revision() from public, anon, authenticated;
