-- MCP access: personal access tokens that let an MCP client (Claude Code,
-- Claude Desktop, Cursor, ...) read and write a user's drawings, notes and
-- folders through /api/mcp.
--
-- Only a SHA-256 hash of each token is stored; the plain token is shown to
-- the user once, when it is created. The MCP endpoint looks tokens up with
-- the service role and scopes every query to the token's owner.

create table public.api_tokens (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  token_hash text not null unique,
  -- First characters of the token, shown in the UI so tokens can be told apart.
  token_prefix text not null,
  scope text not null default 'read_write' check (scope in ('read', 'read_write')),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz
);
create index api_tokens_owner_idx on public.api_tokens (owner_id, created_at desc);

alter table public.api_tokens enable row level security;

-- Users see and manage their own tokens (the hash is useless without the
-- token itself). Tokens are created and revoked from the settings page.
create policy api_tokens_owner_select on public.api_tokens
  for select using (owner_id = auth.uid());

create policy api_tokens_owner_insert on public.api_tokens
  for insert with check (owner_id = auth.uid());

create policy api_tokens_owner_delete on public.api_tokens
  for delete using (owner_id = auth.uid());

-- Full-text-ish search across a user's drawings (title + text on the canvas)
-- and notes (title + content). Called only by the MCP endpoint with the
-- service role, which passes the token owner's id explicitly.
create or replace function public.search_items(
  p_owner uuid,
  p_query text,
  p_limit integer default 20
)
returns table (
  kind text,
  id uuid,
  title text,
  folder_id uuid,
  updated_at timestamptz,
  snippet text
)
language sql stable
set search_path = public
as $$
  with q as (
    select '%' || replace(replace(replace(p_query, '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat
  )
  (
    select 'drawing'::text, d.id, d.title, d.folder_id, d.updated_at,
      coalesce(
        (select string_agg(el ->> 'text', ' / ')
           from jsonb_array_elements(
             case when jsonb_typeof(d.scene -> 'elements') = 'array'
               then d.scene -> 'elements' else '[]'::jsonb end
           ) el, q
          where el ->> 'type' = 'text' and el ->> 'text' ilike q.pat),
        ''
      )
    from public.drawings d, q
    where d.owner_id = p_owner
      and (
        d.title ilike q.pat
        or exists (
          select 1 from jsonb_array_elements(
            case when jsonb_typeof(d.scene -> 'elements') = 'array'
              then d.scene -> 'elements' else '[]'::jsonb end
          ) el
          where el ->> 'type' = 'text' and el ->> 'text' ilike q.pat
        )
      )
  )
  union all
  (
    select 'note'::text, n.id, n.title, n.folder_id, n.updated_at,
      case
        when strpos(lower(n.content), lower(p_query)) > 0 then
          substr(n.content, greatest(strpos(lower(n.content), lower(p_query)) - 80, 1), 200)
        else left(n.content, 200)
      end
    from public.notes n, q
    where n.owner_id = p_owner
      and (n.title ilike q.pat or n.content ilike q.pat)
  )
  order by updated_at desc
  limit greatest(least(p_limit, 100), 1);
$$;

revoke execute on function public.search_items(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.search_items(uuid, text, integer) to service_role;
