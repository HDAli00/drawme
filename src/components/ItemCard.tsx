"use client";

import { useState } from "react";
import type { GridItem } from "@/lib/items";
import { keyOf } from "@/lib/items";
import { formatDate } from "@/lib/format";
import { NoteIcon, PenIcon } from "./Icons";

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
    .slice(0, 120);
}

export type CardHandlers = {
  onPointerDown: (e: React.PointerEvent) => void;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent) => void;
  onMenuButton: (e: React.MouseEvent) => void;
};

export default function ItemCard({
  item,
  selected,
  renaming,
  onRename,
  ...handlers
}: CardHandlers & {
  item: GridItem;
  selected: boolean;
  renaming: boolean;
  onRename: (title: string | null) => void;
}) {
  const isNote = item.kind === "note";
  const image = isNote ? item.cover_image : item.thumbnail;
  const TypeIcon = isNote ? NoteIcon : PenIcon;

  return (
    <div
      data-item-key={keyOf(item)}
      role="option"
      aria-selected={selected}
      tabIndex={-1}
      draggable={!renaming}
      onPointerDown={handlers.onPointerDown}
      onClick={handlers.onClick}
      onDoubleClick={handlers.onDoubleClick}
      onContextMenu={handlers.onContextMenu}
      onDragStart={handlers.onDragStart}
      className={`group relative flex cursor-default flex-col overflow-hidden rounded-xl border bg-white shadow-sm transition outline-none ${
        selected
          ? "border-indigo-500 ring-2 ring-indigo-200"
          : "border-slate-200 hover:border-slate-300 hover:shadow-md"
      }`}
    >
      <div
        className={`relative flex h-36 items-center justify-center overflow-hidden ${
          selected ? "bg-indigo-50/60" : "bg-slate-50"
        }`}
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            draggable={false}
            className={`h-full w-full ${isNote ? "object-cover" : "object-contain p-2"}`}
          />
        ) : isNote ? (
          <NotePlaceholder content={item.content} />
        ) : (
          <span className="flex flex-col items-center gap-2 text-slate-300">
            <PenIcon className="size-8" />
            <span className="text-xs text-slate-400">Empty canvas</span>
          </span>
        )}

        <button
          type="button"
          onClick={handlers.onMenuButton}
          onDoubleClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={`Actions for ${item.title}`}
          className={`absolute top-2 right-2 flex size-7 items-center justify-center rounded-md bg-white/95 text-slate-500 shadow-sm ring-1 ring-slate-200 transition hover:text-slate-900 focus-visible:opacity-100 ${
            selected
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
          }`}
        >
          <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
            <circle cx="5" cy="12" r="1.75" />
            <circle cx="12" cy="12" r="1.75" />
            <circle cx="19" cy="12" r="1.75" />
          </svg>
        </button>
      </div>

      <div className="flex items-start gap-2.5 border-t border-slate-100 px-4 py-3">
        <TypeIcon
          className={`mt-0.5 size-4 shrink-0 ${isNote ? "text-amber-600" : "text-indigo-500"}`}
        />
        <div className="min-w-0 flex-1">
          {renaming ? (
            <RenameInput initial={item.title} onDone={onRename} />
          ) : (
            <p
              className="truncate text-sm font-medium text-slate-900"
              title={item.title}
            >
              {item.title}
            </p>
          )}
          <p className="mt-0.5 text-xs text-slate-500">
            Edited {formatDate(item.updated_at)}
          </p>
        </div>
      </div>
    </div>
  );
}

// A note without a cover: kept quiet — the opening line, nothing else.
function NotePlaceholder({ content }: { content: string }) {
  const text = excerpt(content);
  return (
    <div className="flex h-full w-full flex-col justify-center gap-2 bg-white px-5">
      <span className="block h-1 w-8 rounded-full bg-amber-400/70" />
      <span className="line-clamp-3 text-[13px] leading-relaxed text-slate-500">
        {text || <span className="text-slate-400">Empty note</span>}
      </span>
    </div>
  );
}

function RenameInput({
  initial,
  onDone,
}: {
  initial: string;
  onDone: (title: string | null) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <input
      autoFocus
      value={value}
      maxLength={200}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onDone(value.trim() && value !== initial ? value : null)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") onDone(null);
      }}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      className="w-full rounded-md border border-indigo-300 px-1.5 py-0.5 text-sm focus:ring-2 focus:ring-indigo-100 focus:outline-none"
    />
  );
}
