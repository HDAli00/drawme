"use client";

import { useTransition } from "react";
import Link from "next/link";
import { deleteNote, moveNote } from "@/app/dashboard/actions";
import type { Folder } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { NoteIcon, PenIcon, TrashIcon } from "./Icons";
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
        <span className="line-clamp-3 text-sm leading-relaxed text-slate-600">
          {text || <span className="text-slate-400">Empty note</span>}
        </span>
        {embeds > 0 && (
          <span className="mt-auto text-xs text-slate-400">
            <span className="inline-flex items-center gap-1">
              <PenIcon className="size-3" /> {embeds} drawing
              {embeds === 1 ? "" : "s"} embedded
            </span>
          </span>
        )}
      </Link>
      <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-3">
        <div className="min-w-0 flex-1">
          <Link
            href={`/notes/${note.id}`}
            onClick={selectOnClick(selection)}
            className="block truncate text-sm font-medium text-slate-900 hover:text-indigo-600"
            title={note.title}
          >
            <span className="inline-flex max-w-full items-center gap-1.5">
              <NoteIcon className="size-3.5 shrink-0 text-amber-600" />
              <span className="truncate">{note.title}</span>
            </span>
          </Link>
          <p className="mt-0.5 text-xs text-slate-500">
            Edited {formatDate(note.updated_at)}
          </p>
        </div>
        <div className="absolute top-2 right-2 z-10 flex items-center gap-0.5 rounded-lg bg-white/95 p-1 opacity-0 shadow-sm ring-1 ring-slate-200 transition group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100">
          <select
            value={note.folder_id ?? ""}
            onChange={(e) => {
              const folderId = e.target.value || null;
              startTransition(() => moveNote(note.id, folderId));
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
            onClick={() => {
              if (confirm(`Delete "${note.title}"? This cannot be undone.`)) {
                startTransition(() => deleteNote(note.id));
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
