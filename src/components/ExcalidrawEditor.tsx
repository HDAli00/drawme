"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Excalidraw,
  MainMenu,
  getSceneVersion,
  exportToBlob,
  getDataURL,
  restoreElements,
  restoreLibraryItems,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type {
  AppState,
  BinaryFileData,
  BinaryFiles,
  ExcalidrawImperativeAPI,
  LibraryItems,
} from "@excalidraw/excalidraw/types";
import type {
  ExcalidrawElement,
  OrderedExcalidrawElement,
} from "@excalidraw/excalidraw/element/types";
import { createClient } from "@/lib/supabase/client";
import type { EditorShellProps } from "./EditorShell";
import LibraryDialog from "./LibraryDialog";
import HistoryDialog from "./HistoryDialog";

const SCENE_SAVE_DEBOUNCE_MS = 1500;
const SCENE_SAVE_RETRY_MS = 3000;
const LIBRARY_SAVE_DEBOUNCE_MS = 1000;
const THUMBNAIL_MAX_SIZE = 400;
const DRAFT_WRITE_DEBOUNCE_MS = 300;

// Only persist appState keys that represent document state (not UI state).
const PERSISTED_APP_STATE_KEYS = [
  "viewBackgroundColor",
  "gridSize",
  "gridStep",
  "gridModeEnabled",
] as const;

type SaveState = "saved" | "unsaved" | "saving" | "error";

// The last scene Excalidraw reported through onChange. Saves always read from
// this snapshot rather than from the imperative API: once Excalidraw unmounts
// its scene is reset to empty, and saving from the API at that point would
// overwrite the stored drawing with a blank canvas.
type SceneSnapshot = {
  elements: readonly ExcalidrawElement[];
  appState: Record<string, unknown>;
  files: BinaryFiles;
};

type StoredScene = EditorShellProps["initialScene"];

// Unsaved changes are mirrored to localStorage so a refresh, crash or closed
// tab can never lose them: the next time the drawing opens, the draft is
// restored and saved. `baseUpdatedAt` is the server version the draft was
// made on top of, so a draft never overwrites newer work from elsewhere.
type Draft = { baseUpdatedAt: string; scene: StoredScene };

function draftKey(drawingId: string) {
  return `drawme:draft:${drawingId}`;
}

function readDraft(drawingId: string): Draft | null {
  try {
    const raw = localStorage.getItem(draftKey(drawingId));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

function writeDraft(drawingId: string, draft: Draft) {
  try {
    localStorage.setItem(draftKey(drawingId), JSON.stringify(draft));
  } catch {
    // Most likely over quota because of embedded images: keep the elements.
    try {
      localStorage.setItem(
        draftKey(drawingId),
        JSON.stringify({ ...draft, scene: { ...draft.scene, files: {} } }),
      );
    } catch {
      // Storage unavailable; the server save is still the primary copy.
    }
  }
}

function clearDraft(drawingId: string) {
  try {
    localStorage.removeItem(draftKey(drawingId));
  } catch {
    // Ignore.
  }
}

function pickPersistedAppState(appState: AppState | Record<string, unknown>) {
  const full = appState as unknown as Record<string, unknown>;
  const persisted: Record<string, unknown> = {};
  for (const key of PERSISTED_APP_STATE_KEYS) {
    if (full[key] !== undefined) persisted[key] = full[key];
  }
  return persisted;
}

export default function ExcalidrawEditor({
  drawingId,
  initialTitle,
  initialScene,
  initialUpdatedAt,
  initialLibraryItems,
  userId,
}: EditorShellProps) {
  const router = useRouter();
  const supabase = useRef(createClient()).current;
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [title, setTitle] = useState(initialTitle);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const [initialVersion] = useState(() =>
    getSceneVersion(
      restoreElements(
        (initialScene.elements ?? []) as ExcalidrawElement[],
        null,
      ),
    ),
  );
  const lastSavedVersion = useRef<number>(initialVersion);
  const lastSavedAppState = useRef<string>("");
  const latestScene = useRef<SceneSnapshot | null>(null);
  const hasLocalEdits = useRef(false);
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  const sceneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const libraryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedLibrary = useRef<string>(JSON.stringify(initialLibraryItems));
  const serverUpdatedAt = useRef<string>(initialUpdatedAt);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isDirty = useCallback(() => {
    const snapshot = latestScene.current;
    if (!snapshot) return false;
    return (
      getSceneVersion(snapshot.elements) !== lastSavedVersion.current ||
      JSON.stringify(snapshot.appState) !== lastSavedAppState.current
    );
  }, []);

  const writeScene = useCallback(
    async (withThumbnail: boolean) => {
      const snapshot = latestScene.current;
      if (!snapshot || !isDirty()) return true;
      setSaveState("saving");

      const elements = snapshot.elements.filter((el) => !el.isDeleted);
      const { appState, files } = snapshot;
      const version = getSceneVersion(snapshot.elements);
      const appStateJson = JSON.stringify(appState);
      const scene = { elements, appState, files };

      let thumbnail: string | null | undefined;
      if (withThumbnail) {
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
          } else {
            thumbnail = null;
          }
        } catch {
          // Thumbnails are best-effort.
        }
      }

      const { data, error } = await supabase
        .from("drawings")
        .update({ scene, ...(thumbnail !== undefined ? { thumbnail } : {}) })
        .eq("id", drawingId)
        .select("updated_at")
        .single();

      if (error || !data) return false;

      serverUpdatedAt.current = data.updated_at;
      lastSavedVersion.current = version;
      lastSavedAppState.current = appStateJson;
      if (isDirty()) {
        setSaveState("unsaved");
      } else {
        if (draftTimer.current) clearTimeout(draftTimer.current);
        clearDraft(drawingId);
        setSaveState("saved");
      }
      return true;
    },
    [drawingId, isDirty, supabase],
  );

  // Saves are serialized so an older, slower request can never land after a
  // newer one and roll the drawing back.
  const saveScene = useCallback(
    (withThumbnail: boolean): Promise<void> => {
      const run = saveChain.current
        .then(() => writeScene(withThumbnail))
        .catch(() => false)
        .then((ok) => {
          if (ok) return;
          setSaveState("error");
          // Keep retrying until the drawing is safely stored.
          if (sceneTimer.current) clearTimeout(sceneTimer.current);
          sceneTimer.current = setTimeout(() => {
            sceneTimer.current = null;
            void saveScene(true);
          }, SCENE_SAVE_RETRY_MS);
        });
      saveChain.current = run;
      return run;
    },
    [writeScene],
  );

  const flushScene = useCallback(() => {
    if (sceneTimer.current) {
      clearTimeout(sceneTimer.current);
      sceneTimer.current = null;
    }
    // Skip the thumbnail so the scene request goes out immediately.
    return saveScene(false);
  }, [saveScene]);

  const handleChange = useCallback(
    (
      elements: readonly OrderedExcalidrawElement[],
      appState: AppState,
      files: BinaryFiles,
    ) => {
      const persisted = pickPersistedAppState(appState);
      const appStateJson = JSON.stringify(persisted);
      // Initialize the appState baseline on first change.
      if (!lastSavedAppState.current) lastSavedAppState.current = appStateJson;

      latestScene.current = { elements, appState: persisted, files };
      if (!isDirty()) return;

      hasLocalEdits.current = true;
      setSaveState("unsaved");
      if (draftTimer.current) clearTimeout(draftTimer.current);
      draftTimer.current = setTimeout(() => {
        const snapshot = latestScene.current;
        if (!snapshot) return;
        writeDraft(drawingId, {
          baseUpdatedAt: serverUpdatedAt.current,
          scene: {
            elements: snapshot.elements.filter((el) => !el.isDeleted),
            appState: snapshot.appState,
            files: snapshot.files,
          },
        });
      }, DRAFT_WRITE_DEBOUNCE_MS);
      if (sceneTimer.current) clearTimeout(sceneTimer.current);
      sceneTimer.current = setTimeout(() => {
        sceneTimer.current = null;
        void saveScene(true);
      }, SCENE_SAVE_DEBOUNCE_MS);
    },
    [drawingId, isDirty, saveScene],
  );

  // Replace the canvas with a stored scene. With `asEdit`, the scene is
  // treated as a local change and saved (used for drafts and restores).
  const applyScene = useCallback(
    (scene: StoredScene, asEdit: boolean) => {
      const currentApi = api;
      if (!currentApi) return;
      const elements = restoreElements(
        (scene.elements ?? []) as ExcalidrawElement[],
        null,
      );
      const files = Object.values(scene.files ?? {}) as BinaryFileData[];
      if (files.length) currentApi.addFiles(files);
      lastSavedVersion.current = asEdit ? -1 : getSceneVersion(elements);
      lastSavedAppState.current = "";
      currentApi.updateScene({
        elements,
        appState: (scene.appState ?? {}) as unknown as AppState,
      });
      if (asEdit) {
        hasLocalEdits.current = true;
        latestScene.current = {
          elements,
          appState: pickPersistedAppState(scene.appState ?? {}),
          files: (scene.files ?? {}) as BinaryFiles,
        };
        void flushScene();
      }
    },
    [api, flushScene],
  );

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

  // Flush pending saves when the tab is hidden, closed, or the editor unmounts.
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === "hidden" && isDirty()) {
        void flushScene();
      }
    }
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!isDirty()) return;
      void flushScene();
      // Ask the browser to confirm so the save has time to finish.
      e.preventDefault();
      e.returnValue = "";
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (isDirty()) void flushScene();
    };
  }, [flushScene, isDirty]);

  // On open: restore unsaved changes left behind by a refresh or closed tab,
  // otherwise make sure we show the latest server copy (the server-rendered
  // scene can be stale when Next.js reuses a cached page on back/forward).
  useEffect(() => {
    if (!api) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("drawings")
        .select("scene, updated_at")
        .eq("id", drawingId)
        .maybeSingle();
      if (cancelled || error || !data || hasLocalEdits.current) return;

      serverUpdatedAt.current = data.updated_at;
      const draft = readDraft(drawingId);
      if (draft && draft.baseUpdatedAt === data.updated_at) {
        applyScene(draft.scene, true);
        return;
      }
      // A draft based on an older version was either saved already or is
      // superseded by newer work; never let it overwrite the server copy.
      if (draft) clearDraft(drawingId);
      if (data.updated_at !== initialUpdatedAt) {
        applyScene((data.scene ?? {}) as StoredScene, false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, applyScene, drawingId, initialUpdatedAt, supabase]);

  async function handleBackToDashboard(e: React.MouseEvent) {
    e.preventDefault();
    // Make sure the latest changes are stored before leaving, otherwise the
    // dashboard (or reopening the drawing) can show an older version.
    if (isDirty()) await flushScene();
    await saveChain.current;
    // Stay on the page if the save failed; it keeps retrying in the background.
    if (isDirty()) return;
    router.push("/dashboard");
    router.refresh();
  }

  const saveLabel: Record<SaveState, string> = {
    saved: "Saved",
    unsaved: "Unsaved changes…",
    saving: "Saving…",
    error: "⚠ Save failed — retrying…",
  };

  return (
    <div className="flex h-screen flex-col">
      <div className="flex items-center justify-between gap-4 border-b border-zinc-200 bg-white px-4 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/dashboard"
            onClick={handleBackToDashboard}
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
            onClick={() => setHistoryOpen(true)}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            History
          </button>
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

      {historyOpen && (
        <HistoryDialog
          drawingId={drawingId}
          onRestore={(scene) => {
            applyScene(scene, true);
            setHistoryOpen(false);
          }}
          onClose={() => setHistoryOpen(false)}
        />
      )}

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
