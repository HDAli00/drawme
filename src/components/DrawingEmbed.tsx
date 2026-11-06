"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type SceneRow = {
  title: string;
  updated_at: string;
  scene: {
    elements?: unknown[];
    appState?: Record<string, unknown>;
    files?: Record<string, unknown>;
  };
};

// One request per drawing per page, however often the preview re-renders.
const sceneCache = new Map<string, Promise<SceneRow | null>>();

// Called when a note opens, so embeds show drawings as they are now.
export function clearDrawingEmbedCache() {
  sceneCache.clear();
}

function loadScene(id: string) {
  let pending = sceneCache.get(id);
  if (!pending) {
    pending = Promise.resolve(
      createClient()
        .from("drawings")
        .select("title, updated_at, scene")
        .eq("id", id)
        .maybeSingle(),
    ).then(({ data }) => (data as SceneRow | null) ?? null);
    sceneCache.set(id, pending);
  }
  return pending;
}

// A read-only picture of a drawing inside a note. Editing happens in the
// drawing's own page, which the embed links to.
export default function DrawingEmbed({
  drawingId,
  label,
}: {
  drawingId: string;
  label: string;
}) {
  const container = useRef<HTMLSpanElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "empty">(
    "loading",
  );
  const [title, setTitle] = useState(label);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const row = await loadScene(drawingId);
      if (cancelled) return;
      if (!row) {
        setState("missing");
        return;
      }
      setTitle(row.title);
      const elements = ((row.scene?.elements ?? []) as { isDeleted?: boolean }[])
        .filter((el) => !el.isDeleted);
      if (elements.length === 0) {
        setState("empty");
        return;
      }
      try {
        // Excalidraw is large and browser-only, so load it on demand.
        const { exportToSvg } = await import("@excalidraw/excalidraw");
        const svg = await exportToSvg({
          elements: elements as never,
          appState: {
            ...(row.scene.appState ?? {}),
            exportBackground: true,
            viewBackgroundColor:
              (row.scene.appState?.viewBackgroundColor as string) ?? "#ffffff",
          } as never,
          files: (row.scene.files ?? {}) as never,
          exportPadding: 16,
        });
        if (cancelled || !container.current) return;
        svg.removeAttribute("width");
        svg.removeAttribute("height");
        svg.setAttribute("role", "img");
        svg.setAttribute("aria-label", row.title);
        container.current.replaceChildren(svg);
        setState("ready");
      } catch {
        if (!cancelled) setState("missing");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [drawingId]);

  return (
    <span className="my-3 block overflow-hidden rounded-lg border border-zinc-200 bg-white">
      <span className="flex items-center justify-between gap-2 border-b border-zinc-100 bg-zinc-50 px-3 py-1.5 text-xs">
        <span className="truncate font-medium text-zinc-600">✏️ {title}</span>
        {state !== "missing" && (
          <Link
            href={`/draw/${drawingId}`}
            className="shrink-0 text-indigo-600 hover:underline"
          >
            Open drawing →
          </Link>
        )}
      </span>
      <Link
        href={`/draw/${drawingId}`}
        aria-label={`Open ${title}`}
        className={`block ${state === "ready" ? "" : "pointer-events-none"}`}
      >
        <span
          ref={container}
          className="block max-h-[480px] [&>svg]:mx-auto [&>svg]:h-auto [&>svg]:max-h-[480px] [&>svg]:max-w-full"
        />
      </Link>
      {state !== "ready" && (
        <span className="block px-3 py-6 text-center text-sm text-zinc-400">
          {state === "loading" && "Loading drawing…"}
          {state === "empty" && "This drawing is empty."}
          {state === "missing" && "Drawing not found — it may have been deleted."}
        </span>
      )}
    </span>
  );
}
