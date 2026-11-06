"use client";

import { useMemo, useState } from "react";
import type { LinkTarget } from "@/lib/types";

type PickerDrawing = LinkTarget & { thumbnail: string | null };

export default function DrawingPicker({
  drawings,
  folderId,
  onPick,
  onClose,
}: {
  drawings: PickerDrawing[];
  folderId: string | null;
  onPick: (drawing: PickerDrawing) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");

  // Drawings from the note's own folder come first.
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return drawings
      .filter((d) => !q || d.title.toLowerCase().includes(q))
      .sort((a, b) => {
        const af = a.folder_id === folderId ? 0 : 1;
        const bf = b.folder_id === folderId ? 0 : 1;
        return af - bf || b.updated_at.localeCompare(a.updated_at);
      });
  }, [drawings, folderId, query]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Embed a drawing</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "Enter" && list[0]) {
              // Don't let the key also type a newline into the note.
              e.preventDefault();
              onPick(list[0]);
            }
          }}
          placeholder="Search drawings…"
          className="mb-4 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
        />
        {list.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-400">
            {drawings.length === 0
              ? "You have no drawings yet."
              : "No drawings match."}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
            {list.map((d) => (
              <button
                key={d.id}
                onClick={() => onPick(d)}
                className="flex flex-col overflow-hidden rounded-lg border border-zinc-200 text-left hover:border-indigo-400 hover:shadow"
              >
                <span className="flex h-24 items-center justify-center bg-zinc-50">
                  {d.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={d.thumbnail}
                      alt=""
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span className="text-2xl text-zinc-300">✏️</span>
                  )}
                </span>
                <span className="truncate border-t border-zinc-100 px-2 py-1.5 text-xs font-medium">
                  {d.title}
                  {d.folder_id === folderId && folderId && (
                    <span className="ml-1 text-zinc-400">· this folder</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
