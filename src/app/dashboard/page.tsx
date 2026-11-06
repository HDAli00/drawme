import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/AppHeader";
import DrawingCard from "@/components/DrawingCard";
import NoteCard from "@/components/NoteCard";
import FolderSidebar from "@/components/FolderSidebar";
import { createDrawing, createNote } from "./actions";
import type { Folder, Profile } from "@/lib/types";

// `?folder=<id>` shows one folder, `?folder=unfiled` the items in no folder.
const UNFILED = "unfiled";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { folder } = await searchParams;
  const selected = typeof folder === "string" ? folder : null;

  const [
    { data: profile },
    { data: drawings },
    { data: notes },
    { data: folders },
  ] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase
        .from("drawings")
        .select("id, title, thumbnail, updated_at, folder_id")
        .order("updated_at", { ascending: false }),
      supabase
        .from("notes")
        .select("id, title, content, updated_at, folder_id")
        .order("updated_at", { ascending: false }),
      supabase.from("folders").select("*").order("name"),
    ]);

  if (!profile) redirect("/login");

  // Drawings and notes are listed together, most recently edited first.
  const items = [
    ...(drawings ?? []).map((d) => ({ kind: "drawing" as const, ...d })),
    ...(notes ?? []).map((n) => ({ kind: "note" as const, ...n })),
  ].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const allFolders = (folders ?? []) as Folder[];
  const currentFolder = allFolders.find((f) => f.id === selected) ?? null;
  // An unknown folder id (e.g. one just deleted) falls back to all drawings.
  const view = selected === UNFILED ? UNFILED : (currentFolder?.id ?? null);

  const counts: Record<string, number> = { [UNFILED]: 0 };
  for (const d of items) {
    const key = d.folder_id ?? UNFILED;
    counts[key] = (counts[key] ?? 0) + 1;
  }

  const visible = items.filter((d) =>
    view === null
      ? true
      : view === UNFILED
        ? d.folder_id === null
        : d.folder_id === view,
  );
  const heading =
    view === null
      ? "All items"
      : view === UNFILED
        ? "Unfiled"
        : currentFolder!.name;

  return (
    <div className="min-h-screen bg-zinc-50">
      <AppHeader profile={profile as Profile} />
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8 md:flex-row">
        <FolderSidebar
          folders={allFolders}
          counts={counts}
          total={items.length}
          selected={view}
        />

        <main className="min-w-0 flex-1">
          <div className="mb-6 flex items-center justify-between gap-4">
            <h1 className="truncate text-2xl font-bold">{heading}</h1>
            <div className="flex shrink-0 gap-2">
              <form action={createNote}>
                <input
                  type="hidden"
                  name="folderId"
                  value={currentFolder?.id ?? ""}
                />
                <button
                  type="submit"
                  className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  + New note
                </button>
              </form>
              <form action={createDrawing}>
                <input
                  type="hidden"
                  name="folderId"
                  value={currentFolder?.id ?? ""}
                />
                <button
                  type="submit"
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  + New drawing
                </button>
              </form>
            </div>
          </div>

          {visible.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((item) =>
                item.kind === "note" ? (
                  <NoteCard key={item.id} note={item} folders={allFolders} />
                ) : (
                  <DrawingCard key={item.id} drawing={item} folders={allFolders} />
                ),
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-12 text-center text-zinc-500">
              <p className="mb-2 text-lg">
                {view === null ? "Nothing here yet" : "This folder is empty"}
              </p>
              <p className="text-sm">
                {view === null
                  ? "Create a note or a drawing to get started."
                  : "Create a note or drawing here, or move one in from its card’s folder menu."}
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
