"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  renameDrawing,
  deleteDrawing,
  moveDrawing,
} from "@/app/dashboard/actions";
import type { Folder } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { EditIcon, PenIcon, TrashIcon } from "./Icons";
import {
  CardCheckbox,
  cardRing,
  selectOnClick,
  type CardSelectionProps,
} from "./CardSelect";

type DrawingSummary = {
  id: string;
  title: string;
  thumbnail: string | null;
  updated_at: string;
  folder_id: string | null;
};

export default function DrawingCard({
  drawing,
  folders,
  ...selection
}: CardSelectionProps & {
  drawing: DrawingSummary;
  folders: Folder[];
}) {
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(drawing.title);
  const [pending, startTransition] = useTransition();

  function submitRename() {
    setRenaming(false);
    if (title.trim() && title !== drawing.title) {
      startTransition(() => renameDrawing(drawing.id, title));
    } else {
      setTitle(drawing.title);
    }
  }

  return (
    <div
      className={`group relative flex flex-col overflow-hidden rounded-xl border bg-white shadow-sm transition hover:shadow-md ${cardRing(selection.selected)}`}
    >
      <CardCheckbox {...selection} label={drawing.title} />
      <Link
        href={`/draw/${drawing.id}`}
        onClick={selectOnClick(selection)}
        className="flex h-36 items-center justify-center bg-slate-50"
      >
        {drawing.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={drawing.thumbnail}
            alt=""
            className="h-full w-full object-contain"
          />
        ) : (
          <span className="flex flex-col items-center gap-2 text-slate-300">
            <PenIcon className="size-8" />
            <span className="text-xs text-slate-400">Empty canvas</span>
          </span>
        )}
      </Link>
      <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-3">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={submitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitRename();
                if (e.key === "Escape") {
                  setTitle(drawing.title);
                  setRenaming(false);
                }
              }}
              className="w-full rounded-md border border-indigo-300 px-1.5 py-0.5 text-sm focus:ring-2 focus:ring-indigo-100 focus:outline-none"
            />
          ) : (
            <Link
              href={`/draw/${drawing.id}`}
              onClick={selectOnClick(selection)}
              className="block truncate text-sm font-medium text-slate-900 hover:text-indigo-600"
              title={drawing.title}
            >
              {pending ? title : drawing.title}
            </Link>
          )}
          <p className="mt-0.5 text-xs text-slate-500">
            Edited {formatDate(drawing.updated_at)}
          </p>
        </div>
        <div className="absolute top-2 right-2 z-10 flex items-center gap-0.5 rounded-lg bg-white/95 p-1 opacity-0 shadow-sm ring-1 ring-slate-200 transition group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100">
          <select
            value={drawing.folder_id ?? ""}
            onChange={(e) => {
              const folderId = e.target.value || null;
              startTransition(() => moveDrawing(drawing.id, folderId));
            }}
            disabled={pending}
            title="Move to folder"
            aria-label="Move to folder"
            className="max-w-28 rounded-md border border-slate-200 bg-white px-1 py-1 text-xs text-slate-600"
          >
            <option value="">Unfiled</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => setRenaming(true)}
            title="Rename"
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="Rename"
          >
            <EditIcon className="size-3.5" />
          </button>
          <button
            onClick={() => {
              if (confirm(`Delete "${drawing.title}"? This cannot be undone.`)) {
                startTransition(() => deleteDrawing(drawing.id));
              }
            }}
            title="Delete"
            className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
            aria-label="Delete"
          >
            <TrashIcon className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
