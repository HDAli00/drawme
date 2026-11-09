"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  createFolder,
  deleteFolder,
  renameFolder,
} from "@/app/dashboard/actions";
import type { Folder } from "@/lib/types";
import {
  EditIcon,
  FolderIcon,
  GridIcon,
  InboxIcon,
  PlusIcon,
  TrashIcon,
} from "./Icons";

const UNFILED = "unfiled";

export default function FolderSidebar({
  folders,
  counts,
  total,
  selected,
}: {
  folders: Folder[];
  counts: Record<string, number>;
  total: number;
  selected: string | null;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <aside className="w-full shrink-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:sticky md:top-24 md:w-60">
      <nav className="flex flex-col gap-0.5 text-sm" aria-label="Folders">
        <GroupLabel>Browse</GroupLabel>
        <SidebarLink
          href="/dashboard"
          label="All items"
          icon={GridIcon}
          count={total}
          active={selected === null}
        />
        <SidebarLink
          href={`/dashboard?folder=${UNFILED}`}
          label="Unfiled"
          icon={InboxIcon}
          count={counts[UNFILED] ?? 0}
          active={selected === UNFILED}
        />

        <div className="mt-4 mb-1 flex items-center justify-between border-t border-slate-100 pt-4 pr-1">
          <GroupLabel inline>Folders</GroupLabel>
          <button
            onClick={() => setAdding(true)}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            title="New folder"
            aria-label="New folder"
          >
            <PlusIcon className="size-4" />
          </button>
        </div>

        {adding && (
          <form
            action={async (formData) => {
              setAdding(false);
              await createFolder(formData);
            }}
            className="px-1 pb-1"
          >
            <input
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
              className="w-full rounded-md border border-indigo-300 px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-100 focus:outline-none"
            />
          </form>
        )}

        {folders.length === 0 && !adding && (
          <p className="px-2.5 py-1 text-xs leading-relaxed text-slate-400">
            No folders yet. Use + to create one.
          </p>
        )}

        {folders.map((f) => (
          <FolderItem
            key={f.id}
            folder={f}
            count={counts[f.id] ?? 0}
            active={selected === f.id}
          />
        ))}
      </nav>
    </aside>
  );
}

function GroupLabel({
  children,
  inline,
}: {
  children: React.ReactNode;
  inline?: boolean;
}) {
  return (
    <span
      className={`px-2.5 text-[11px] font-semibold tracking-wider text-slate-400 uppercase ${
        inline ? "" : "mb-1 block"
      }`}
    >
      {children}
    </span>
  );
}

function SidebarLink({
  href,
  label,
  icon: Icon,
  count,
  active,
}: {
  href: string;
  label: string;
  icon: (p: { className?: string }) => React.ReactNode;
  count: number;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 transition-colors ${
        active
          ? "bg-indigo-50 font-medium text-indigo-700"
          : "text-slate-700 hover:bg-slate-100"
      }`}
    >
      <Icon
        className={`size-4 shrink-0 ${active ? "text-indigo-600" : "text-slate-400"}`}
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span
        className={`shrink-0 text-xs tabular-nums ${active ? "text-indigo-500" : "text-slate-400"}`}
      >
        {count}
      </span>
    </Link>
  );
}

function FolderItem({
  folder,
  count,
  active,
}: {
  folder: Folder;
  count: number;
  active: boolean;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(folder.name);
  const [pending, startTransition] = useTransition();

  function submitRename() {
    setRenaming(false);
    if (name.trim() && name !== folder.name) {
      startTransition(() => renameFolder(folder.id, name));
    } else {
      setName(folder.name);
    }
  }

  if (renaming) {
    return (
      <div className="px-1 py-0.5">
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
          className="w-full rounded-md border border-indigo-300 px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-100 focus:outline-none"
        />
      </div>
    );
  }

  return (
    <div className="group relative">
      <div className="min-w-0">
        <SidebarLink
          href={`/dashboard?folder=${folder.id}`}
          label={pending ? name : folder.name}
          icon={FolderIcon}
          count={count}
          active={active}
        />
      </div>
      <div className="absolute top-1/2 right-1 flex -translate-y-1/2 rounded-md bg-white opacity-0 shadow-sm ring-1 ring-slate-200 transition group-hover:opacity-100 focus-within:opacity-100">
        <button
          onClick={() => setRenaming(true)}
          title="Rename folder"
          aria-label="Rename folder"
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <EditIcon className="size-3.5" />
        </button>
        <button
          onClick={() => {
            if (
              confirm(
                `Delete folder "${folder.name}"? Its drawings are kept and moved to Unfiled.`,
              )
            ) {
              startTransition(() => deleteFolder(folder.id));
            }
          }}
          title="Delete folder"
          aria-label="Delete folder"
          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
        >
          <TrashIcon className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
