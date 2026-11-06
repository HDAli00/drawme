"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  renameDrawing,
  deleteDrawing,
  moveDrawing,
} from "@/app/dashboard/actions";
import type { Folder } from "@/lib/types";
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
        className="flex h-36 items-center justify-center bg-zinc-50"
      >
        {drawing.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={drawing.thumbnail}
            alt=""
            className="h-full w-full object-contain"
          />
        ) : (
          <span className="text-4xl text-zinc-300">✏️</span>
        )}
      </Link>
      <div className="flex items-center justify-between gap-2 border-t border-zinc-100 px-3 py-2">
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
              className="w-full rounded border border-indigo-300 px-1 py-0.5 text-sm focus:outline-none"
            />
          ) : (
            <Link
              href={`/draw/${drawing.id}`}
              onClick={selectOnClick(selection)}
              className="block truncate text-sm font-medium hover:text-indigo-600"
              title={drawing.title}
            >
              {pending ? title : drawing.title}
            </Link>
          )}
          <p className="text-xs text-zinc-400">
            {new Date(drawing.updated_at).toLocaleString()}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
          <select
            value={drawing.folder_id ?? ""}
            onChange={(e) => {
              const folderId = e.target.value || null;
              startTransition(() => moveDrawing(drawing.id, folderId));
            }}
            disabled={pending}
            title="Move to folder"
            aria-label="Move to folder"
            className="max-w-24 rounded border border-zinc-200 bg-white px-1 py-0.5 text-xs text-zinc-600"
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
            className="rounded p-1 text-zinc-500 hover:bg-zinc-100"
          >
            ✎
          </button>
          <button
            onClick={() => {
              if (confirm(`Delete "${drawing.title}"? This cannot be undone.`)) {
                startTransition(() => deleteDrawing(drawing.id));
              }
            }}
            title="Delete"
            className="rounded p-1 text-zinc-500 hover:bg-red-50 hover:text-red-600"
          >
            🗑
          </button>
        </div>
      </div>
    </div>
  );
}
