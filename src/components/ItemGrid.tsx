"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { deleteItems, moveItems } from "@/app/dashboard/actions";
import type { Folder } from "@/lib/types";
import DrawingCard from "./DrawingCard";
import NoteCard from "./NoteCard";

export type GridItem =
  | {
      kind: "drawing";
      id: string;
      title: string;
      thumbnail: string | null;
      updated_at: string;
      folder_id: string | null;
    }
  | {
      kind: "note";
      id: string;
      title: string;
      content: string;
      updated_at: string;
      folder_id: string | null;
    };

const keyOf = (item: { kind: string; id: string }) => `${item.kind}:${item.id}`;

// The dashboard grid. Ticking cards selects them; the bar above the grid
// then moves or deletes the whole selection at once.
export default function ItemGrid({
  items,
  folders,
}: {
  items: GridItem[];
  folders: Folder[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const selecting = selected.size > 0;

  // Drop selections for items no longer shown (moved away, deleted, or a
  // different folder opened).
  const visibleKeys = useMemo(() => new Set(items.map(keyOf)), [items]);
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set([...prev].filter((k) => visibleKeys.has(k)));
      return next.size === prev.size ? prev : next;
    });
  }, [visibleKeys]);

  useEffect(() => {
    if (!selecting) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSelected(new Set());
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selecting]);

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectedIds() {
    const drawingIds: string[] = [];
    const noteIds: string[] = [];
    for (const key of selected) {
      const [kind, id] = key.split(":");
      (kind === "note" ? noteIds : drawingIds).push(id);
    }
    return { drawingIds, noteIds };
  }

  function moveSelected(folderId: string | null) {
    const { drawingIds, noteIds } = selectedIds();
    startTransition(async () => {
      await moveItems(drawingIds, noteIds, folderId);
      setSelected(new Set());
    });
  }

  function deleteSelected() {
    const count = selected.size;
    if (
      !confirm(
        `Delete ${count} item${count === 1 ? "" : "s"}? This cannot be undone.`,
      )
    ) {
      return;
    }
    const { drawingIds, noteIds } = selectedIds();
    startTransition(async () => {
      await deleteItems(drawingIds, noteIds);
      setSelected(new Set());
    });
  }

  const allSelected = items.length > 0 && selected.size === items.length;

  return (
    <div>
      <div
        className={`sticky top-0 z-10 mb-4 flex min-h-11 flex-wrap items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
          selecting
            ? "border border-indigo-200 bg-indigo-50"
            : "border border-transparent"
        }`}
      >
        <label className="flex items-center gap-2 text-zinc-600">
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = selecting && !allSelected;
            }}
            onChange={() =>
              setSelected(allSelected ? new Set() : new Set(items.map(keyOf)))
            }
            className="size-4 accent-indigo-600"
            aria-label="Select all"
          />
          {selecting ? `${selected.size} selected` : "Select"}
        </label>

        {selecting && (
          <>
            <select
              value=""
              disabled={pending}
              onChange={(e) => {
                const value = e.target.value;
                if (value) moveSelected(value === "__unfiled" ? null : value);
              }}
              aria-label="Move selected to folder"
              className="rounded-md border border-indigo-300 bg-white px-2 py-1 text-sm text-zinc-700"
            >
              <option value="">Move to folder…</option>
              <option value="__unfiled">Unfiled</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  📁 {f.name}
                </option>
              ))}
            </select>
            <button
              onClick={deleteSelected}
              disabled={pending}
              className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-zinc-700 hover:border-red-300 hover:bg-red-50 hover:text-red-600"
            >
              Delete
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="ml-auto text-zinc-500 hover:text-zinc-800"
            >
              {pending ? "Working…" : "Clear selection"}
            </button>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const key = keyOf(item);
          const selection = {
            selected: selected.has(key),
            selecting,
            onToggle: () => toggle(key),
          };
          return item.kind === "note" ? (
            <NoteCard key={key} note={item} folders={folders} {...selection} />
          ) : (
            <DrawingCard
              key={key}
              drawing={item}
              folders={folders}
              {...selection}
            />
          );
        })}
      </div>
    </div>
  );
}
