"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteItems,
  moveItems,
  renameDrawing,
  renameNote,
} from "@/app/dashboard/actions";
import type { Folder } from "@/lib/types";
import {
  GENERAL_LABEL,
  ITEM_DRAG_TYPE,
  hrefOf,
  keyOf,
  splitKeys,
  type GridItem,
} from "@/lib/items";
import ItemCard from "./ItemCard";
import ContextMenu, { type MenuItem } from "./ContextMenu";
import { EditIcon, FolderIcon, InboxIcon, TrashIcon } from "./Icons";

export type { GridItem } from "@/lib/items";

type Menu = { x: number; y: number; keys: string[]; moveOnly?: boolean };
type Rect = { left: number; top: number; width: number; height: number };

// The workspace grid, with desktop-style selection:
// click selects, Ctrl/⌘-click toggles, Shift-click selects a range, dragging
// on empty space draws a selection box, double-click opens. Right-click or
// the ⋯ button opens actions; selected items can be dragged onto a folder.
// On touch screens a tap opens and a long press selects.
export default function ItemGrid({
  items,
  folders,
}: {
  items: GridItem[];
  folders: Folder[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [pending, startTransition] = useTransition();
  const wrapper = useRef<HTMLDivElement>(null);
  const pointerType = useRef("mouse");

  const keys = useMemo(() => items.map(keyOf), [items]);
  const byKey = useMemo(
    () => new Map(items.map((i) => [keyOf(i), i] as const)),
    [items],
  );

  // Drop selections for items no longer shown (moved away or deleted).
  useEffect(() => {
    const visible = new Set(keys);
    setSelected((prev) => {
      const next = new Set([...prev].filter((k) => visible.has(k)));
      return next.size === prev.size ? prev : next;
    });
  }, [keys]);

  const open = useCallback(
    (key: string) => {
      const item = byKey.get(key);
      if (item) router.push(hrefOf(item));
    },
    [byKey, router],
  );

  const remove = useCallback(
    (list: string[]) => {
      const n = list.length;
      const label =
        n === 1 ? `"${byKey.get(list[0])?.title}"` : `${n} items`;
      if (!confirm(`Delete ${label}? This cannot be undone.`)) return;
      const { drawingIds, noteIds } = splitKeys(list);
      startTransition(async () => {
        await deleteItems(drawingIds, noteIds);
        setSelected(new Set());
      });
    },
    [byKey],
  );

  const move = useCallback((list: string[], folderId: string | null) => {
    const { drawingIds, noteIds } = splitKeys(list);
    startTransition(async () => {
      await moveItems(drawingIds, noteIds, folderId);
      setSelected(new Set());
    });
  }, []);

  // Clicking anywhere outside the grid (and its menus) clears the selection.
  useEffect(() => {
    if (!selected.size) return;
    function onDown(e: PointerEvent) {
      const t = e.target as HTMLElement;
      const surface = wrapper.current?.closest("[data-selection-surface]");
      if (
        wrapper.current?.contains(t) ||
        surface?.contains(t) ||
        t.closest("[data-keep-selection]")
      )
        return;
      setSelected(new Set());
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [selected.size]);

  // Keyboard shortcuts while something is selected.
  useEffect(() => {
    if (!selected.size || menu || renaming) return;
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      const list = [...selected];
      if (e.key === "Escape") setSelected(new Set());
      else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        remove(list);
      } else if (e.key === "Enter" && list.length === 1) open(list[0]);
      else if (e.key === "F2" && list.length === 1) setRenaming(list[0]);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, menu, renaming, remove, open]);

  function selectOnly(key: string) {
    setSelected(new Set([key]));
    setAnchor(key);
  }

  function handleClick(key: string, e: React.MouseEvent) {
    wrapper.current?.focus({ preventScroll: true });
    if (pointerType.current === "touch") {
      if (selected.size) toggle(key);
      else open(key);
      return;
    }
    if (e.metaKey || e.ctrlKey) {
      toggle(key);
      setAnchor(key);
    } else if (e.shiftKey && anchor && keys.includes(anchor)) {
      const [a, b] = [keys.indexOf(anchor), keys.indexOf(key)].sort((x, y) => x - y);
      setSelected(new Set(keys.slice(a, b + 1)));
    } else {
      selectOnly(key);
    }
  }

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Right-click acts on the selection if the item is part of it, otherwise
  // on that item alone (as in Finder and Explorer).
  function openMenuFor(key: string, x: number, y: number) {
    let list = [...selected];
    if (!selected.has(key)) {
      selectOnly(key);
      list = [key];
    }
    setMenu({ x, y, keys: list });
  }

  function handleDragStart(key: string, e: React.DragEvent) {
    let list = [...selected];
    if (!selected.has(key)) {
      selectOnly(key);
      list = [key];
    }
    e.dataTransfer.setData(ITEM_DRAG_TYPE, JSON.stringify(list));
    e.dataTransfer.effectAllowed = "move";
    if (list.length > 1) {
      const badge = document.createElement("div");
      badge.textContent = `${list.length} items`;
      badge.style.cssText =
        "position:fixed;top:-100px;left:0;padding:6px 12px;border-radius:9999px;background:#4f46e5;color:#fff;font:600 13px system-ui,sans-serif;box-shadow:0 4px 12px rgb(0 0 0/.2)";
      document.body.appendChild(badge);
      e.dataTransfer.setDragImage(badge, 20, 16);
      setTimeout(() => badge.remove());
    }
  }

  // Rubber-band selection, started with the mouse on empty space anywhere in
  // the surrounding [data-selection-surface] (or the grid itself).
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  useEffect(() => {
    function onDown(e: PointerEvent) {
      const surface =
        wrapper.current?.closest<HTMLElement>("[data-selection-surface]") ??
        wrapper.current;
      if (surface?.contains(e.target as Node)) startMarquee(e);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  });

  function startMarquee(e: PointerEvent) {
    pointerType.current = e.pointerType;
    if (e.button !== 0 || e.pointerType !== "mouse") return;
    const t = e.target as HTMLElement;
    if (
      t.closest(
        "[data-item-key], [data-keep-selection], button, input, textarea, select, a, label, form",
      )
    )
      return;
    e.preventDefault();
    const selected = selectedRef.current;
    wrapper.current?.focus({ preventScroll: true });

    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    const base = additive ? new Set(selected) : new Set<string>();
    const start = { x: e.clientX, y: e.clientY };
    const cards = [
      ...(wrapper.current?.querySelectorAll<HTMLElement>("[data-item-key]") ?? []),
    ].map((el) => ({ key: el.dataset.itemKey!, rect: el.getBoundingClientRect() }));
    let moved = false;

    function onMove(ev: PointerEvent) {
      const left = Math.min(start.x, ev.clientX);
      const top = Math.min(start.y, ev.clientY);
      const width = Math.abs(ev.clientX - start.x);
      const height = Math.abs(ev.clientY - start.y);
      if (!moved && width + height < 5) return;
      moved = true;
      setMarquee({ left, top, width, height });
      const next = new Set(base);
      for (const c of cards) {
        const hit =
          c.rect.left < left + width &&
          c.rect.right > left &&
          c.rect.top < top + height &&
          c.rect.bottom > top;
        if (hit) next.add(c.key);
      }
      setSelected(next);
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setMarquee(null);
      if (!moved && !additive) setSelected(new Set());
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function moveMenu(list: string[]): MenuItem[] {
    const inFolder = (id: string | null) =>
      list.every((k) => byKey.get(k)?.folder_id === id);
    return [
      {
        label: GENERAL_LABEL,
        icon: InboxIcon,
        disabled: inFolder(null),
        onSelect: () => move(list, null),
      },
      ...folders.map((f) => ({
        label: f.name,
        icon: FolderIcon,
        disabled: inFolder(f.id),
        onSelect: () => move(list, f.id),
      })),
    ];
  }

  function menuItems(list: string[]): MenuItem[] {
    const single = list.length === 1 ? list[0] : null;
    return [
      ...(single
        ? ([
            { label: "Open", onSelect: () => open(single), hint: "Enter" },
            {
              label: "Rename",
              icon: EditIcon,
              onSelect: () => setRenaming(single),
              hint: "F2",
            },
          ] as MenuItem[])
        : []),
      { label: "Move to", icon: FolderIcon, submenu: moveMenu(list) },
      "separator",
      {
        label: list.length > 1 ? `Delete ${list.length} items` : "Delete",
        icon: TrashIcon,
        danger: true,
        hint: "Del",
        onSelect: () => remove(list),
      },
    ];
  }

  const count = selected.size;

  return (
    <div
      ref={wrapper}
      tabIndex={-1}
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "a" && !renaming) {
          e.preventDefault();
          setSelected(new Set(keys));
        }
      }}
      className="outline-none select-none"
    >
      {count > 0 && (
        <div
          data-keep-selection
          role="toolbar"
          aria-label="Selection"
          className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-slate-200 bg-white/95 p-1.5 pl-4 text-sm shadow-xl ring-1 ring-slate-900/5 backdrop-blur"
        >
          <span className="pr-2 font-medium whitespace-nowrap text-slate-900">
            {count} selected
          </span>
          <span className="h-5 w-px bg-slate-200" />
          <button
            disabled={pending}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setMenu({ x: r.left, y: r.top - 8, keys: [...selected], moveOnly: true });
            }}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 whitespace-nowrap text-slate-700 hover:bg-slate-100"
          >
            <FolderIcon className="size-4" /> Move to…
          </button>
          <button
            disabled={pending}
            onClick={() => remove([...selected])}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-slate-700 hover:bg-red-50 hover:text-red-700"
          >
            <TrashIcon className="size-4" /> Delete
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="rounded-lg px-2.5 py-1.5 whitespace-nowrap text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            aria-label="Clear selection"
          >
            {pending ? "Working…" : "✕"}
          </button>
        </div>
      )}

      <div
        role="listbox"
        aria-multiselectable="true"
        aria-label="Items"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      >
        {items.map((item) => {
          const key = keyOf(item);
          return (
            <ItemCard
              key={key}
              item={item}
              selected={selected.has(key)}
              renaming={renaming === key}
              onRename={(title) => {
                setRenaming(null);
                if (!title) return;
                startTransition(() =>
                  item.kind === "note"
                    ? renameNote(item.id, title)
                    : renameDrawing(item.id, title),
                );
              }}
              onPointerDown={(e) => {
                pointerType.current = e.pointerType;
              }}
              onClick={(e) => handleClick(key, e)}
              onDoubleClick={() => {
                if (pointerType.current !== "touch") open(key);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                openMenuFor(key, e.clientX, e.clientY);
              }}
              onDragStart={(e) => handleDragStart(key, e)}
              onMenuButton={(e) => {
                e.stopPropagation();
                const r = e.currentTarget.getBoundingClientRect();
                openMenuFor(key, r.right - 240, r.bottom + 4);
              }}
            />
          );
        })}
      </div>

      {marquee && (
        <div
          className="pointer-events-none fixed z-30 rounded-sm border border-indigo-500 bg-indigo-500/10"
          style={marquee}
        />
      )}

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          title={
            menu.moveOnly
              ? "Move to"
              : menu.keys.length > 1
                ? `${menu.keys.length} items selected`
                : byKey.get(menu.keys[0])?.title
          }
          items={menu.moveOnly ? moveMenu(menu.keys) : menuItems(menu.keys)}
          above={menu.moveOnly}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
