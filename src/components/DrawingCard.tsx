"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { renameDrawing, deleteDrawing } from "@/app/dashboard/actions";

type DrawingSummary = {
  id: string;
  title: string;
  thumbnail: string | null;
  updated_at: string;
};

export default function DrawingCard({ drawing }: { drawing: DrawingSummary }) {
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
    <div className="group relative flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition hover:shadow-md">
      <Link
        href={`/draw/${drawing.id}`}
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
        <div className="flex shrink-0 gap-1 opacity-0 transition group-hover:opacity-100">
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
