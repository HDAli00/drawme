"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type MenuItem =
  | {
      label: string;
      icon?: (p: { className?: string }) => React.ReactNode;
      onSelect?: () => void;
      // Opens a nested list in place of the menu.
      submenu?: MenuItem[];
      danger?: boolean;
      disabled?: boolean;
      hint?: string;
    }
  | "separator";

// A floating menu at a screen point, used for right-click and ⋯ menus.
export default function ContextMenu({
  x,
  y,
  title,
  items,
  onClose,
  above,
}: {
  x: number;
  y: number;
  // Open upwards from y (for menus launched from a bottom toolbar).
  above?: boolean;
  title?: string;
  items: MenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [stack, setStack] = useState<{ title?: string; items: MenuItem[] }[]>(
    [{ title, items }],
  );
  const [pos, setPos] = useState({ left: x, top: y });
  const current = stack[stack.length - 1];

  // Keep the menu inside the viewport.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({
      left: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(above ? y - height : y, window.innerHeight - height - 8)),
    });
  }, [x, y, above, stack]);

  useEffect(() => {
    function onDown(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    // Deferred so the event that opened the menu doesn't close it.
    const t = setTimeout(() => {
      document.addEventListener("pointerdown", onDown, true);
      window.addEventListener("keydown", onKey, true);
      window.addEventListener("blur", onClose);
      window.addEventListener("resize", onClose);
      document.addEventListener("scroll", onClose, true);
    });
    return () => {
      clearTimeout(t);
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("resize", onClose);
      document.removeEventListener("scroll", onClose, true);
    };
  }, [onClose]);

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [stack]);

  return createPortal(
    <div
      ref={ref}
      role="menu"
      data-keep-selection
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
        e.preventDefault();
        const buttons = [
          ...ref.current!.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
        ];
        const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = e.key === "ArrowDown" ? i + 1 : i - 1;
        buttons[(next + buttons.length) % buttons.length]?.focus();
      }}
      style={{ left: pos.left, top: pos.top }}
      className="fixed z-50 max-h-[70vh] w-60 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-xl ring-1 ring-slate-900/5"
    >
      {(current.title || stack.length > 1) && (
        <div className="flex items-center gap-1 border-b border-slate-100 px-2 pt-1 pb-1.5">
          {stack.length > 1 && (
            <button
              onClick={() => setStack((s) => s.slice(0, -1))}
              className="rounded px-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Back"
            >
              ‹
            </button>
          )}
          <span className="truncate px-1 text-xs font-medium text-slate-500">
            {current.title}
          </span>
        </div>
      )}
      {current.items.map((item, i) =>
        item === "separator" ? (
          <div key={i} className="my-1 border-t border-slate-100" />
        ) : (
          <button
            key={i}
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              if (item.submenu) {
                setStack((s) => [...s, { title: item.label, items: item.submenu! }]);
              } else {
                onClose();
                item.onSelect?.();
              }
            }}
            className={`flex w-full items-center gap-3 px-3 py-1.5 text-left outline-none disabled:cursor-default disabled:opacity-40 ${
              item.danger
                ? "text-red-600 hover:bg-red-50 focus:bg-red-50"
                : "text-slate-700 hover:bg-slate-100 focus:bg-slate-100"
            }`}
          >
            {item.icon ? (
              <item.icon className={`size-4 shrink-0 ${item.danger ? "" : "text-slate-400"}`} />
            ) : (
              <span className="size-4 shrink-0" />
            )}
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.submenu && <span className="text-slate-400">›</span>}
            {item.hint && (
              <span className="text-xs text-slate-400">{item.hint}</span>
            )}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}
