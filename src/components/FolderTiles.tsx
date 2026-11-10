"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createFolder, deleteFolder, renameFolder } from "@/app/dashboard/actions";
import { GENERAL, GENERAL_LABEL } from "@/lib/items";
import { useFolderDrop } from "./useFolderDrop";
import ContextMenu from "./ContextMenu";
import { EditIcon, FolderIcon, InboxIcon, PlusIcon, TrashIcon } from "./Icons";

export type FolderSummary = {
  id: string | null; // null = General
  name: string;
  drawings: number;
  notes: number;
  updatedAt: string | null;
  previews: string[];
};

export default function FolderTiles({ folders }: { folders: FolderSummary[] }) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {folders.map((f) => (
        <FolderTile key={f.id ?? GENERAL} folder={f} />
      ))}
      {adding ? (
        <form
          action={async (fd) => {
            setAdding(false);
            await createFolder(fd);
          }}
          className="flex min-h-44 flex-col justify-center gap-2 rounded-xl border border-indigo-300 bg-white p-5 shadow-sm"
        >
          <label className="text-sm font-medium text-slate-700" htmlFor="new-folder">
            New folder
          </label>
          <input
            id="new-folder"
            autoFocus
            name="name"
            maxLength={100}
            placeholder="Folder name"
            onBlur={(e) => {
              if (!e.currentTarget.value.trim()) setAdding(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setAdding(false);
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
          />
          <p className="text-xs text-slate-400">Press Enter to create.</p>
        </form>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex min-h-44 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 text-sm font-medium text-slate-500 transition hover:border-indigo-400 hover:bg-white hover:text-indigo-600"
        >
          <PlusIcon className="size-5" />
          New folder
        </button>
      )}
    </div>
  );
}

function FolderTile({ folder }: { folder: FolderSummary }) {
  const router = useRouter();
  const { over, pending, dropProps } = useFolderDrop(folder.id);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(folder.name);
  const [busy, startTransition] = useTransition();
  const isGeneral = folder.id === null;
  const href = `/dashboard?folder=${folder.id ?? GENERAL}`;
  const total = folder.drawings + folder.notes;
  const Icon = isGeneral ? InboxIcon : FolderIcon;

  function submitRename() {
    setRenaming(false);
    if (folder.id && name.trim() && name !== folder.name) {
      startTransition(() => renameFolder(folder.id!, name));
    } else setName(folder.name);
  }

  return (
    <div
      {...dropProps}
      onContextMenu={(e) => {
        if (isGeneral) return;
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
      className={`group relative flex min-h-44 flex-col overflow-hidden rounded-xl border bg-white shadow-sm transition ${
        over
          ? "scale-[1.02] border-indigo-500 ring-4 ring-indigo-200"
          : "border-slate-200 hover:border-slate-300 hover:shadow-md"
      } ${pending || busy ? "opacity-60" : ""}`}
    >
      <Link
        href={href}
        className="absolute inset-0 z-0"
        aria-label={`Open ${folder.name}`}
        draggable={false}
      />
      <div className="pointer-events-none relative flex h-24 gap-1 bg-slate-50 p-2">
        {folder.previews.length ? (
          folder.previews.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={src}
              alt=""
              className="h-full min-w-0 flex-1 rounded-md bg-white object-cover ring-1 ring-slate-200"
            />
          ))
        ) : (
          <span className="flex flex-1 items-center justify-center text-slate-300">
            <Icon className="size-9" />
          </span>
        )}
        {over && (
          <span className="absolute inset-0 flex items-center justify-center bg-indigo-600/80 text-sm font-medium text-white">
            Move here
          </span>
        )}
      </div>
      <div className="pointer-events-none relative flex flex-1 items-start gap-3 px-4 py-3">
        <span
          className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${
            isGeneral ? "bg-slate-100 text-slate-600" : "bg-indigo-50 text-indigo-600"
          }`}
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          {renaming ? (
            <input
              autoFocus
              value={name}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
              onBlur={submitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitRename();
                if (e.key === "Escape") {
                  setName(folder.name);
                  setRenaming(false);
                }
              }}
              className="pointer-events-auto w-full rounded-md border border-indigo-300 px-1.5 py-0.5 text-sm focus:outline-none"
            />
          ) : (
            <p className="truncate text-sm font-semibold text-slate-900">
              {busy ? name : folder.name}
              {isGeneral && (
                <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-slate-500 uppercase">
                  Default
                </span>
              )}
            </p>
          )}
          <p className="mt-0.5 text-xs text-slate-500">
            {total === 0
              ? "Empty"
              : `${folder.drawings} drawing${folder.drawings === 1 ? "" : "s"} · ${folder.notes} note${folder.notes === 1 ? "" : "s"}`}
          </p>
        </div>
        {!isGeneral && (
          <button
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setMenu({ x: r.right - 240, y: r.bottom + 4 });
            }}
            aria-label={`Actions for ${folder.name}`}
            className="pointer-events-auto flex size-7 shrink-0 items-center justify-center rounded-md text-slate-400 opacity-0 transition group-hover:opacity-100 hover:bg-slate-100 hover:text-slate-700 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
              <circle cx="5" cy="12" r="1.75" />
              <circle cx="12" cy="12" r="1.75" />
              <circle cx="19" cy="12" r="1.75" />
            </svg>
          </button>
        )}
      </div>

      {menu && folder.id && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          title={folder.name}
          onClose={() => setMenu(null)}
          items={[
            { label: "Open", onSelect: () => router.push(href) },
            { label: "Rename", icon: EditIcon, onSelect: () => setRenaming(true) },
            "separator",
            {
              label: "Delete folder",
              icon: TrashIcon,
              danger: true,
              onSelect: () => {
                if (
                  confirm(
                    `Delete folder "${folder.name}"? Its drawings and notes are kept and moved to ${GENERAL_LABEL}.`,
                  )
                ) {
                  startTransition(() => deleteFolder(folder.id!));
                }
              },
            },
          ]}
        />
      )}
    </div>
  );
}
