import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/AppHeader";
import ItemGrid from "@/components/ItemGrid";
import FolderSidebar from "@/components/FolderSidebar";
import FolderTiles, { type FolderSummary } from "@/components/FolderTiles";
import { createDrawing, createNote } from "./actions";
import type { Folder, Profile } from "@/lib/types";
import { firstName } from "@/lib/profile";
import { GENERAL, GENERAL_LABEL, hrefOf, type GridItem } from "@/lib/items";
import {
  ArrowRightIcon,
  ClockIcon,
  FolderIcon,
  GridIcon,
  InboxIcon,
  NoteIcon,
  PenIcon,
  PlusIcon,
} from "@/components/Icons";

const RECENT_COUNT = 8;

// Views:
//   /dashboard                    home: folders, then recently edited items
//   /dashboard?folder=<id>        one folder (`general` = items in no folder)
//   /dashboard?type=all|drawing|note   every item, or every item of a kind
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

  const params = await searchParams;
  const folderParam = typeof params.folder === "string" ? params.folder : null;
  const typeParam = typeof params.type === "string" ? params.type : null;

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
      .select("id, title, content, cover_image, updated_at, folder_id")
      .order("updated_at", { ascending: false }),
    supabase.from("folders").select("*").order("name"),
  ]);
  if (!profile) redirect("/login");
  const p = profile as Profile;

  // Drawings and notes are listed together, most recently edited first.
  const items: GridItem[] = [
    ...(drawings ?? []).map((d) => ({ kind: "drawing" as const, ...d })),
    ...(notes ?? []).map((n) => ({ kind: "note" as const, ...n })),
  ].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const allFolders = (folders ?? []) as Folder[];

  const counts: Record<string, number> = { [GENERAL]: 0 };
  for (const d of items) {
    const key = d.folder_id ?? GENERAL;
    counts[key] = (counts[key] ?? 0) + 1;
  }

  // `unfiled` is the old name of General; unknown folders fall back home.
  const general = folderParam === GENERAL || folderParam === "unfiled";
  const currentFolder = allFolders.find((f) => f.id === folderParam) ?? null;
  const type =
    typeParam === "drawing" || typeParam === "note" || typeParam === "all"
      ? typeParam
      : null;

  if (!general && !currentFolder && !type) {
    return (
      <Home profile={p} items={items} folders={allFolders} />
    );
  }

  const visible = items.filter((d) =>
    general
      ? d.folder_id === null
      : currentFolder
        ? d.folder_id === currentFolder.id
        : type === "all" || d.kind === type,
  );
  const heading = general
    ? GENERAL_LABEL
    : currentFolder
      ? currentFolder.name
      : type === "drawing"
        ? "All drawings"
        : type === "note"
          ? "All notes"
          : "All items";
  const HeadingIcon = general
    ? InboxIcon
    : currentFolder
      ? FolderIcon
      : type === "drawing"
        ? PenIcon
        : type === "note"
          ? NoteIcon
          : GridIcon;
  const subtitle = general
    ? "The default folder. New drawings and notes land here unless you create them inside another folder."
    : currentFolder
      ? "Double-click to open. Drag items onto a folder in the sidebar to move them."
      : "Everything in your workspace, most recently edited first.";
  const sidebarSelected = general ? GENERAL : (currentFolder?.id ?? (type === "all" ? "all" : null));

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader profile={p} />

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-slate-500">
            <Link href="/dashboard" className="hover:text-slate-900">
              Workspace
            </Link>
            <span className="text-slate-300">/</span>
            <span className="truncate font-medium text-slate-700">{heading}</span>
          </nav>
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                <HeadingIcon className="size-5" />
              </span>
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-semibold tracking-tight text-slate-900">
                  {heading}
                  <span className="ml-2 align-middle text-sm font-medium text-slate-400">
                    {visible.length}
                  </span>
                </h1>
                <p className="text-sm text-slate-500">{subtitle}</p>
              </div>
            </div>
            <NewButtons folderId={currentFolder?.id ?? ""} />
          </div>
        </div>
      </section>

      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 md:flex-row md:items-start">
        <FolderSidebar
          folders={allFolders}
          counts={counts}
          total={items.length}
          selected={sidebarSelected}
        />
        <main data-selection-surface className="min-h-[60vh] min-w-0 flex-1 select-none">
          {visible.length > 0 ? (
            <ItemGrid items={visible} folders={allFolders} />
          ) : (
            <EmptyState
              icon={HeadingIcon}
              title={currentFolder || general ? "This folder is empty" : "Nothing here yet"}
              text={
                currentFolder || general
                  ? "Create a note or drawing here, or drag items in from another folder."
                  : "Create a note or a drawing to get started."
              }
            />
          )}
        </main>
      </div>
    </div>
  );
}

function Home({
  profile,
  items,
  folders,
}: {
  profile: Profile;
  items: GridItem[];
  folders: Folder[];
}) {
  const drawingCount = items.filter((i) => i.kind === "drawing").length;
  const noteCount = items.length - drawingCount;
  const latest = items[0] ?? null;

  const summaries: FolderSummary[] = [
    { id: null, name: GENERAL_LABEL },
    ...folders.map((f) => ({ id: f.id, name: f.name })),
  ].map((f) => {
    const inFolder = items.filter((i) => i.folder_id === f.id);
    return {
      ...f,
      drawings: inFolder.filter((i) => i.kind === "drawing").length,
      notes: inFolder.filter((i) => i.kind === "note").length,
      updatedAt: inFolder[0]?.updated_at ?? null,
      previews: inFolder
        .map((i) => (i.kind === "drawing" ? i.thumbnail : i.cover_image))
        .filter((src): src is string => !!src)
        .slice(0, 3),
    };
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader profile={profile} />

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 pt-8 pb-6 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-wider text-indigo-600 uppercase">
                Workspace
              </p>
              <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                Welcome back, {firstName(profile)}
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                New drawings and notes go to {GENERAL_LABEL}; open a folder to
                create them there instead.
              </p>
            </div>
            <NewButtons folderId="" />
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat href="/dashboard?type=drawing" icon={PenIcon} label="Drawings" value={drawingCount} />
            <Stat href="/dashboard?type=note" icon={NoteIcon} label="Notes" value={noteCount} />
            <Stat href="#folders" icon={FolderIcon} label="Folders" value={folders.length + 1} />
            <Stat
              href={latest ? hrefOf(latest) : "/dashboard?type=all"}
              icon={ClockIcon}
              label="Last edited"
              value={latest ? latest.title : "—"}
              small
            />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-10 px-4 py-8 sm:px-6">
        <section id="folders" className="scroll-mt-24">
          <SectionHeading
            title="Folders"
            text="Open a folder to work in it. Drag items onto a folder to move them."
          />
          <FolderTiles folders={summaries} />
        </section>

        <section data-selection-surface className="pb-24 select-none">
          <SectionHeading
            title="Recently edited"
            text="Click to select, drag across to select several, right-click or ⋯ for actions, and drag onto a folder to move."
            link={
              items.length > RECENT_COUNT
                ? { href: "/dashboard?type=all", label: `View all ${items.length} items` }
                : undefined
            }
          />
          {items.length ? (
            <ItemGrid items={items.slice(0, RECENT_COUNT)} folders={folders} />
          ) : (
            <EmptyState
              icon={GridIcon}
              title="Nothing here yet"
              text="Create a note or a drawing to get started."
            />
          )}
        </section>
      </div>
    </div>
  );
}

function NewButtons({ folderId }: { folderId: string }) {
  return (
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
  );
}

function SectionHeading({
  title,
  text,
  link,
}: {
  title: string;
  text: string;
  link?: { href: string; label: string };
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-500">{text}</p>
      </div>
      {link && (
        <Link
          href={link.href}
          className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-800"
        >
          {link.label}
          <ArrowRightIcon className="size-4" />
        </Link>
      )}
    </div>
  );
}

function Stat({
  href,
  icon: Icon,
  label,
  value,
  small,
}: {
  href: string;
  icon: (p: { className?: string }) => React.ReactNode;
  label: string;
  value: string | number;
  small?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-3 transition hover:border-indigo-300 hover:bg-white hover:shadow-sm"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-white text-slate-500 ring-1 ring-slate-200 transition group-hover:text-indigo-600 group-hover:ring-indigo-200">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium text-slate-500">{label}</span>
        <span
          className={`block truncate font-semibold text-slate-900 tabular-nums ${small ? "text-sm leading-7" : "text-lg"}`}
        >
          {value}
        </span>
      </span>
      <ArrowRightIcon className="size-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-500" />
    </Link>
  );
}

function EmptyState({
  icon: Icon,
  title,
  text,
}: {
  icon: (p: { className?: string }) => React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
      <span className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <Icon className="size-5" />
      </span>
      <p className="text-sm font-medium text-slate-900">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{text}</p>
    </div>
  );
}
