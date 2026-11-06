"use client";

import { useTransition } from "react";
import Link from "next/link";
import { deleteNote, moveNote } from "@/app/dashboard/actions";
import type { Folder } from "@/lib/types";
import {
  CardCheckbox,
  cardRing,
  selectOnClick,
  type CardSelectionProps,
} from "./CardSelect";

type NoteSummary = {
  id: string;
  title: string;
  content: string;
  updated_at: string;
  folder_id: string | null;
};

// Plain-text preview of a note: drop Markdown syntax and embeds.
function excerpt(markdown: string) {
  return markdown
    .replace(/!\[\[[^\]]*\]\]/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, t, a) => a ?? t)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s*/gm, "")
    .replace(/^[#>\-*+\s]+|[`*_~]/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

export default function NoteCard({
  note,
  folders,
  ...selection
}: CardSelectionProps & {
  note: NoteSummary;
  folders: Folder[];
}) {
  const [pending, startTransition] = useTransition();
  const text = excerpt(note.content);
  const embeds =
    (note.content.match(/!\[\[[^\]]*\]\]|!\[[^\]]*\]\(drawing:[^)]*\)/g) ?? [])
      .length;

  return (
    <div
      className={`group relative flex flex-col overflow-hidden rounded-xl border bg-white shadow-sm transition hover:shadow-md ${cardRing(selection.selected)}`}
    >
      <CardCheckbox {...selection} label={note.title} />
      <Link
        href={`/notes/${note.id}`}
        onClick={selectOnClick(selection)}
        className="flex h-36 flex-col gap-2 overflow-hidden bg-amber-50/60 px-4 pt-11 pb-3"
      >
        <span className="line-clamp-3 text-sm leading-relaxed text-zinc-600">
          {text || <span className="text-zinc-400">Empty note</span>}
        </span>
        {embeds > 0 && (
          <span className="mt-auto text-xs text-zinc-400">
            ✏️ {embeds} drawing{embeds === 1 ? "" : "s"} embedded
          </span>
        )}
      </Link>
      <div className="flex items-center justify-between gap-2 border-t border-zinc-100 px-3 py-2">
        <div className="min-w-0 flex-1">
          <Link
            href={`/notes/${note.id}`}
            onClick={selectOnClick(selection)}
            className="block truncate text-sm font-medium hover:text-indigo-600"
            title={note.title}
          >
            📝 {note.title}
          </Link>
          <p className="text-xs text-zinc-400">
            {new Date(note.updated_at).toLocaleString()}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
          <select
            value={note.folder_id ?? ""}
            onChange={(e) => {
              const folderId = e.target.value || null;
              startTransition(() => moveNote(note.id, folderId));
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
            onClick={() => {
              if (confirm(`Delete "${note.title}"? This cannot be undone.`)) {
                startTransition(() => deleteNote(note.id));
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
