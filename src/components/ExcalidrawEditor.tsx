"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Excalidraw,
  MainMenu,
  getSceneVersion,
  exportToBlob,
  getDataURL,
  restoreLibraryItems,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type {
  ExcalidrawImperativeAPI,
  LibraryItems,
} from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { createClient } from "@/lib/supabase/client";
import type { EditorShellProps } from "./EditorShell";
import LibraryDialog from "./LibraryDialog";

const SCENE_SAVE_DEBOUNCE_MS = 1500;
const LIBRARY_SAVE_DEBOUNCE_MS = 1000;
const THUMBNAIL_MAX_SIZE = 400;

// Only persist appState keys that represent document state (not UI state).
const PERSISTED_APP_STATE_KEYS = [
  "viewBackgroundColor",
  "gridSize",
  "gridStep",
  "gridModeEnabled",
] as const;

type SaveState = "saved" | "unsaved" | "saving" | "error";

export default function ExcalidrawEditor({
  drawingId,
  initialTitle,
  initialScene,
  initialLibraryItems,
  userId,
}: EditorShellProps) {
  const supabase = useRef(createClient()).current;
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [title, setTitle] = useState(initialTitle);
  const [libraryOpen, setLibraryOpen] = useState(false);

  const lastSavedVersion = useRef<number>(
    getSceneVersion((initialScene.elements ?? []) as OrderedExcalidrawElement[]),
  );
  const lastSavedAppState = useRef<string>("");
  const sceneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const libraryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedLibrary = useRef<string>(JSON.stringify(initialLibraryItems));
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  apiRef.current = api;

  const saveScene = useCallback(async () => {
    const currentApi = apiRef.current;
    if (!currentApi) return;
    setSaveState("saving");

    const elements = currentApi
      .getSceneElements()
      .filter((el) => !el.isDeleted);
    const appStateFull = currentApi.getAppState() as unknown as Record<
      string,
      unknown
    >;
    const appState: Record<string, unknown> = {};
    for (const key of PERSISTED_APP_STATE_KEYS) {
      if (appStateFull[key] !== undefined) appState[key] = appStateFull[key];
    }
    const files = currentApi.getFiles();
    const scene = { elements, appState, files };

    let thumbnail: string | undefined;
    try {
      if (elements.length > 0) {
        const blob = await exportToBlob({
          elements,
          appState: {
            viewBackgroundColor:
              (appState.viewBackgroundColor as string) ?? "#ffffff",
            exportBackground: true,
          },
          files,
          maxWidthOrHeight: THUMBNAIL_MAX_SIZE,
          mimeType: "image/png",
        });
        thumbnail = await getDataURL(blob);
      }
    } catch {
      // Thumbnails are best-effort.
    }

    const { error } = await supabase
      .from("drawings")
      .update({ scene, ...(thumbnail ? { thumbnail } : {}) })
      .eq("id", drawingId);

    if (error) {
      setSaveState("error");
    } else {
      lastSavedVersion.current = getSceneVersion(elements);
      lastSavedAppState.current = JSON.stringify(appState);
      setSaveState("saved");
    }
  }, [drawingId, supabase]);

  const handleChange = useCallback(() => {
    const currentApi = apiRef.current;
    if (!currentApi) return;
    const elements = currentApi.getSceneElements();
    const version = getSceneVersion(elements);
    const appStateFull = currentApi.getAppState() as unknown as Record<
      string,
      unknown
    >;
    const persisted: Record<string, unknown> = {};
    for (const key of PERSISTED_APP_STATE_KEYS) {
      if (appStateFull[key] !== undefined) persisted[key] = appStateFull[key];
    }
    const appStateJson = JSON.stringify(persisted);

    if (
      version === lastSavedVersion.current &&
      appStateJson === (lastSavedAppState.current || appStateJson)
    ) {
      // Initialize the appState baseline on first change.
      if (!lastSavedAppState.current) lastSavedAppState.current = appStateJson;
      return;
    }

    setSaveState("unsaved");
    if (sceneTimer.current) clearTimeout(sceneTimer.current);
    sceneTimer.current = setTimeout(saveScene, SCENE_SAVE_DEBOUNCE_MS);
  }, [saveScene]);

  const handleLibraryChange = useCallback(
    (items: LibraryItems) => {
      const json = JSON.stringify(items);
      if (json === lastSavedLibrary.current) return;
      if (libraryTimer.current) clearTimeout(libraryTimer.current);
      libraryTimer.current = setTimeout(async () => {
        const { error } = await supabase.from("user_library_state").upsert({
          user_id: userId,
          library_items: items as unknown as Record<string, unknown>[],
        });
        if (!error) lastSavedLibrary.current = json;
      }, LIBRARY_SAVE_DEBOUNCE_MS);
    },
    [supabase, userId],
  );

  function handleTitleChange(value: string) {
    setTitle(value);
    if (titleTimer.current) clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(async () => {
      const trimmed = value.trim();
      if (!trimmed) return;
      await supabase
        .from("drawings")
        .update({ title: trimmed.slice(0, 200) })
        .eq("id", drawingId);
    }, 800);
  }

  // Flush pending saves when the tab is hidden or closed.
  useEffect(() => {
    function flush() {
      if (sceneTimer.current) {
        clearTimeout(sceneTimer.current);
        sceneTimer.current = null;
        void saveScene();
      }
    }
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("beforeunload", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, [saveScene]);

  const saveLabel: Record<SaveState, string> = {
    saved: "Saved",
    unsaved: "Unsaved changes…",
    saving: "Saving…",
    error: "⚠ Save failed — retrying on next change",
  };

  return (
    <div className="flex h-screen flex-col">
      <div className="flex items-center justify-between gap-4 border-b border-zinc-200 bg-white px-4 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/dashboard"
            className="shrink-0 rounded-md border border-zinc-300 px-2.5 py-1 text-sm text-zinc-600 hover:bg-zinc-50"
          >
            ← Dashboard
          </Link>
          <input
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            className="w-64 truncate rounded-md border border-transparent px-2 py-1 text-sm font-medium hover:border-zinc-200 focus:border-indigo-400 focus:outline-none"
            aria-label="Drawing title"
          />
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span
            className={`text-xs ${
              saveState === "error" ? "text-red-600" : "text-zinc-400"
            }`}
          >
            {saveLabel[saveState]}
          </span>
          <button
            onClick={() => setLibraryOpen(true)}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Libraries
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <Excalidraw
          excalidrawAPI={(a) => setApi(a)}
          initialData={{
            elements: (initialScene.elements ??
              []) as OrderedExcalidrawElement[],
            appState: {
              ...(initialScene.appState ?? {}),
            } as Record<string, unknown>,
            files: (initialScene.files ?? {}) as never,
            libraryItems: restoreLibraryItems(
              initialLibraryItems as never,
              "unpublished",
            ),
            scrollToContent: true,
          }}
          onChange={handleChange}
          onLibraryChange={handleLibraryChange}
        >
          <MainMenu>
            <MainMenu.DefaultItems.LoadScene />
            <MainMenu.DefaultItems.Export />
            <MainMenu.DefaultItems.SaveAsImage />
            <MainMenu.DefaultItems.ClearCanvas />
            <MainMenu.DefaultItems.ToggleTheme />
            <MainMenu.DefaultItems.ChangeCanvasBackground />
          </MainMenu>
        </Excalidraw>
      </div>

      {libraryOpen && api && (
        <LibraryDialog
          api={api}
          userId={userId}
          onClose={() => setLibraryOpen(false)}
        />
      )}
    </div>
  );
}
