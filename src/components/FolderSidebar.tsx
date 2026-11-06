"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  createFolder,
  deleteFolder,
  renameFolder,
} from "@/app/dashboard/actions";
import type { Folder } from "@/lib/types";

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
    <aside className="w-full shrink-0 md:w-56">
      <nav className="flex flex-col gap-0.5 text-sm">
        <SidebarLink
          href="/dashboard"
          label="All items"
          count={total}
          active={selected === null}
        />
        <SidebarLink
          href={`/dashboard?folder=${UNFILED}`}
          label="Unfiled"
          count={counts[UNFILED] ?? 0}
          active={selected === UNFILED}
        />

        <div className="mt-4 mb-1 flex items-center justify-between px-2">
          <span className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">
            Folders
          </span>
          <button
            onClick={() => setAdding(true)}
            className="rounded px-1 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800"
            title="New folder"
            aria-label="New folder"
          >
            +
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
              className="w-full rounded border border-indigo-300 px-2 py-1 text-sm focus:outline-none"
            />
          </form>
        )}

        {folders.length === 0 && !adding && (
          <p className="px-2 py-1 text-xs text-zinc-400">
            No folders yet. Click + to create one.
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

function SidebarLink({
  href,
  label,
  count,
  active,
}: {
  href: string;
  label: string;
  count: number;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center justify-between rounded-md px-2 py-1.5 ${
        active
          ? "bg-indigo-50 font-medium text-indigo-700"
          : "text-zinc-700 hover:bg-zinc-100"
      }`}
    >
      <span className="truncate">{label}</span>
      <span className="text-xs text-zinc-400">{count}</span>
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
          className="w-full rounded border border-indigo-300 px-2 py-1 text-sm focus:outline-none"
        />
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-1">
      <div className="min-w-0 flex-1">
        <SidebarLink
          href={`/dashboard?folder=${folder.id}`}
          label={`📁 ${pending ? name : folder.name}`}
          count={count}
          active={active}
        />
      </div>
      <div className="flex opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
        <button
          onClick={() => setRenaming(true)}
          title="Rename folder"
          className="rounded p-1 text-xs text-zinc-500 hover:bg-zinc-200"
        >
          ✎
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
          className="rounded p-1 text-xs text-zinc-500 hover:bg-red-50 hover:text-red-600"
        >
          🗑
        </button>
      </div>
    </div>
  );
}
