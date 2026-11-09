import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/AppHeader";
import ItemGrid from "@/components/ItemGrid";
import FolderSidebar from "@/components/FolderSidebar";
import { createDrawing, createNote } from "./actions";
import type { Folder, Profile } from "@/lib/types";
import { firstName } from "@/lib/profile";
import {
  ClockIcon,
  FolderIcon,
  GridIcon,
  InboxIcon,
  NoteIcon,
  PenIcon,
  PlusIcon,
} from "@/components/Icons";

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
  const HeadingIcon =
    view === null ? GridIcon : view === UNFILED ? InboxIcon : FolderIcon;

  const p = profile as Profile;
  const drawingCount = drawings?.length ?? 0;
  const noteCount = notes?.length ?? 0;
  const lastEdited = items[0]?.updated_at ?? null;
  const folderId = currentFolder?.id ?? "";

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader profile={p} />

      {/* Page heading: greeting, primary actions and workspace figures. */}
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 pt-8 pb-6 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-wider text-indigo-600 uppercase">
                Workspace
              </p>
              <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                Welcome back, {firstName(p)}
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Your drawings and notes, organised in folders.
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <form action={createNote}>
                <input type="hidden" name="folderId" value={folderId} />
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  <NoteIcon className="size-4 text-slate-500" />
                  New note
                </button>
              </form>
              <form action={createDrawing}>
                <input type="hidden" name="folderId" value={folderId} />
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700"
                >
                  <PlusIcon className="size-4" />
                  New drawing
                </button>
              </form>
            </div>
          </div>

          <dl className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat icon={PenIcon} label="Drawings" value={drawingCount} />
            <Stat icon={NoteIcon} label="Notes" value={noteCount} />
            <Stat icon={FolderIcon} label="Folders" value={allFolders.length} />
            <Stat
              icon={ClockIcon}
              label="Last edited"
              value={lastEdited ? relativeTime(lastEdited) : "—"}
            />
          </dl>
        </div>
      </section>

      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 md:flex-row md:items-start">
        <FolderSidebar
          folders={allFolders}
          counts={counts}
          total={items.length}
          selected={view}
        />

        <main className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <HeadingIcon className="size-5 shrink-0 text-slate-400" />
              <h2 className="truncate text-base font-semibold text-slate-900">
                {heading}
              </h2>
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                {visible.length}
              </span>
            </div>
            <p className="hidden shrink-0 text-xs text-slate-400 sm:block">
              Sorted by last edited
            </p>
          </div>

          <div className="p-5">
            {visible.length > 0 ? (
              <ItemGrid items={visible} folders={allFolders} />
            ) : (
              <div className="rounded-lg border border-dashed border-slate-300 px-6 py-14 text-center">
                <span className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                  <HeadingIcon className="size-5" />
                </span>
                <p className="text-sm font-medium text-slate-900">
                  {view === null ? "Nothing here yet" : "This folder is empty"}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {view === null
                    ? "Create a note or a drawing to get started."
                    : "Create a note or drawing here, or move one in from its card’s folder menu."}
                </p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: (p: { className?: string }) => React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-white text-slate-500 ring-1 ring-slate-200">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <dt className="text-xs font-medium text-slate-500">{label}</dt>
        <dd className="truncate text-lg font-semibold text-slate-900 tabular-nums">
          {value}
        </dd>
      </div>
    </div>
  );
}

function relativeTime(iso: string) {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return "just now";
}
