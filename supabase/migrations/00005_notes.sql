-- Markdown notes live next to drawings, in the same folders. A note can link
-- to other notes and embed drawings (rendered read-only in the note).

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  folder_id uuid references public.folders (id) on delete set null,
  title text not null default 'Untitled note' check (char_length(title) between 1 and 200),
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notes_owner_idx on public.notes (owner_id, updated_at desc);
create index notes_folder_idx on public.notes (folder_id);

alter table public.notes enable row level security;

create policy notes_owner_all on public.notes
  for all using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create trigger notes_set_updated_at
before update on public.notes
for each row execute function public.set_updated_at();

-- Same rule as drawings: only file a note into one of its owner's folders.
-- check_drawing_folder_owner() only reads folder_id and owner_id, so it
-- works for notes as well.
create trigger notes_check_folder_owner
before insert or update of folder_id on public.notes
for each row execute function public.check_drawing_folder_owner();

-- Version history for notes, kept the same way as for drawings: a snapshot
-- at most every 10 minutes, and always before a save that shrinks the note
-- a lot (e.g. text accidentally deleted). The last 50 are kept per note.
create table public.note_revisions (
  id bigint generated always as identity primary key,
  note_id uuid not null references public.notes (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  content text not null,
  created_at timestamptz not null default now()
);
create index note_revisions_note_idx
  on public.note_revisions (note_id, created_at desc);

alter table public.note_revisions enable row level security;

create policy note_revisions_select_own on public.note_revisions
  for select using (owner_id = auth.uid());

create or replace function public.record_note_revision()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.content is not distinct from old.content or old.content = '' then
    return new;
  end if;

  if char_length(new.content) < char_length(old.content) / 2 or not exists (
    select 1 from public.note_revisions
    where note_id = old.id
      and created_at > now() - interval '10 minutes'
  ) then
    insert into public.note_revisions (note_id, owner_id, title, content)
    values (old.id, old.owner_id, old.title, old.content);

    delete from public.note_revisions
    where note_id = old.id
      and id not in (
        select id from public.note_revisions
        where note_id = old.id
        order by created_at desc, id desc
        limit 50
      );
  end if;

  return new;
end;
$$;

create trigger notes_record_revision
before update of content on public.notes
for each row execute function public.record_note_revision();

revoke execute on function public.record_note_revision() from public, anon, authenticated;
