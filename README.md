# drawme

A cloud whiteboard built on the official [Excalidraw](https://github.com/excalidraw/excalidraw)
React package — with accounts, per-user persistent drawings, installable shape
libraries (AWS / GCP / Azure architecture icons pre-seeded), and an admin area.

**Stack:** Next.js (App Router, TypeScript, Tailwind) · `@excalidraw/excalidraw` · Supabase (Postgres, Auth, RLS, Storage) · Vercel.

## Features

- **Full Excalidraw editor** — all shapes, arrows, freedraw, text, images,
  styling, undo/redo, export to PNG/SVG/`.excalidraw`. The canvas is the real
  Excalidraw package (MIT), not a re-implementation.
- **Auth** — email/password via Supabase Auth (Google OAuth ready, see below),
  protected routes, session persistence.
- **Drawings** — dashboard with create/open/rename/delete, debounced autosave
  of the full scene (elements + appState + image files) as JSONB, thumbnails.
- **Shape libraries** — install global or personal libraries into the editor,
  import arbitrary `.excalidrawlib` files (stored in Supabase Storage +
  metadata row), installed libraries persist across sessions. AWS, GCP and
  Azure icon libraries are seeded globally.
- **Admin area** — list users, promote/demote roles, publish/remove global
  libraries. Authorization is enforced in the database via RLS (and a trigger
  guarding `profiles.role`), not just the UI.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in your Supabase values
npm run dev
```

### Database setup

Apply `supabase/migrations/00001_init.sql` to your Supabase project (SQL
editor or `supabase db push`). Then seed the global libraries and the initial
admin email:

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... INITIAL_ADMIN_EMAIL=... \
  node scripts/seed-global-libraries.mjs
```

The first account that signs up with `INITIAL_ADMIN_EMAIL` automatically gets
the `admin` role (via a database trigger reading `app_config`).

## Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | Supabase anon key (RLS applies) |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | Used only by the seed script — never shipped to the client |
| `INITIAL_ADMIN_EMAIL` | server only | Bootstrap admin account email |
| `NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED` | client | Set `true` to show the Google login button |

## Enabling Google OAuth (TODO)

Email/password works out of the box. To enable Google:

1. Create an OAuth client in [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   (type "Web application"). Add the authorized redirect URI shown in
   Supabase Dashboard → Authentication → Providers → Google
   (`https://<project-ref>.supabase.co/auth/v1/callback`).
2. In the Supabase Dashboard enable the Google provider and paste the client
   ID + secret.
3. Set `NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED=true` in Vercel and redeploy.

## Architecture notes

- Excalidraw is client-only: `src/components/EditorShell.tsx` loads the editor
  with `dynamic(..., { ssr: false })`; never import `@excalidraw/excalidraw`
  from server-rendered code.
- Autosave is debounced (1.5 s) and versioned via `getSceneVersion` so pure
  pointer movement doesn't trigger writes.
- RLS policies: users see/edit only their own profiles/drawings/libraries;
  `scope='global'` libraries are readable by all authenticated users and
  writable only by admins (`public.is_admin()` security-definer helper).
- Bundled seed libraries in `supabase/seed-libraries/` come from the MIT-licensed
  [excalidraw-libraries](https://github.com/excalidraw/excalidraw-libraries)
  collection; attribution is kept in `manifest.json`.

## License

Application code: MIT. Excalidraw is © Excalidraw contributors, MIT license.
