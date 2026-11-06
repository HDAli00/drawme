"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createNote } from "@/app/dashboard/actions";
import { drawingEmbedMarkdown } from "@/lib/noteLinks";
import type { LinkTarget, Note } from "@/lib/types";
import MarkdownPreview from "./MarkdownPreview";
import DrawingPicker from "./DrawingPicker";
import NoteHistoryDialog from "./NoteHistoryDialog";
import { clearDrawingEmbedCache } from "./DrawingEmbed";

const SAVE_DEBOUNCE_MS = 800;
const SAVE_RETRY_MS = 3000;
const MODE_KEY = "drawme:note-mode";

type SaveState = "saved" | "unsaved" | "saving" | "error";
type Mode = "edit" | "split" | "preview";
type Draft = { baseUpdatedAt: string; title: string; content: string };

function draftKey(id: string) {
  return `drawme:note-draft:${id}`;
}

function readDraft(id: string): Draft | null {
  try {
    const raw = localStorage.getItem(draftKey(id));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

function writeDraft(id: string, draft: Draft) {
  try {
    localStorage.setItem(draftKey(id), JSON.stringify(draft));
  } catch {
    // Storage unavailable; the server save is still the primary copy.
  }
}

function clearDraft(id: string) {
  try {
    localStorage.removeItem(draftKey(id));
  } catch {
    // Ignore.
  }
}

export default function NoteEditor({
  note,
  drawings,
  notes,
}: {
  note: Note;
  drawings: (LinkTarget & { thumbnail: string | null })[];
  notes: LinkTarget[];
}) {
  const router = useRouter();
  const supabase = useRef(createClient()).current;
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [mode, setMode] = useState<Mode>("split");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  // Cursor position to restore once an insertion has rendered.
  const pendingCursor = useRef<number | null>(null);

  // Saves always use the latest text, even from timers and unload handlers.
  const latest = useRef({ title: note.title, content: note.content });
  const lastSaved = useRef({ title: note.title, content: note.content });
  const serverUpdatedAt = useRef(note.updated_at);
  const hasLocalEdits = useRef(false);
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isDirty = useCallback(
    () =>
      latest.current.title !== lastSaved.current.title ||
      latest.current.content !== lastSaved.current.content,
    [],
  );

  const writeNote = useCallback(async () => {
    if (!isDirty()) return true;
    setSaveState("saving");
    const snapshot = { ...latest.current };
    const { data, error } = await supabase
      .from("notes")
      .update({
        title: snapshot.title.trim().slice(0, 200) || "Untitled note",
        content: snapshot.content,
      })
      .eq("id", note.id)
      .select("updated_at")
      .single();
    if (error || !data) return false;

    serverUpdatedAt.current = data.updated_at;
    lastSaved.current = snapshot;
    if (isDirty()) {
      setSaveState("unsaved");
    } else {
      clearDraft(note.id);
      setSaveState("saved");
    }
    return true;
  }, [isDirty, note.id, supabase]);

  // Serialized so an older request can never land after a newer one.
  const save = useCallback((): Promise<void> => {
    const run = saveChain.current
      .then(() => writeNote())
      .catch(() => false)
      .then((ok) => {
        if (ok) return;
        setSaveState("error");
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          saveTimer.current = null;
          void save();
        }, SAVE_RETRY_MS);
      });
    saveChain.current = run;
    return run;
  }, [writeNote]);

  const flush = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    return save();
  }, [save]);

  const update = useCallback(
    (next: { title?: string; content?: string }) => {
      latest.current = { ...latest.current, ...next };
      if (next.title !== undefined) setTitle(next.title);
      if (next.content !== undefined) setContent(next.content);
      if (!isDirty()) return;
      hasLocalEdits.current = true;
      setSaveState("unsaved");
      writeDraft(note.id, {
        baseUpdatedAt: serverUpdatedAt.current,
        ...latest.current,
      });
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null;
        void save();
      }, SAVE_DEBOUNCE_MS);
    },
    [isDirty, note.id, save],
  );

  // On open: restore unsaved text left by a refresh or closed tab, otherwise
  // load the latest copy (the server render can be a cached older page).
  useEffect(() => {
    clearDrawingEmbedCache();
    try {
      const saved = localStorage.getItem(MODE_KEY) as Mode | null;
      if (saved === "edit" || saved === "split" || saved === "preview") {
        setMode(saved);
      }
    } catch {
      // Ignore.
    }

    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("notes")
        .select("title, content, updated_at")
        .eq("id", note.id)
        .maybeSingle();
      if (cancelled || !data || hasLocalEdits.current) return;
      serverUpdatedAt.current = data.updated_at;
      lastSaved.current = { title: data.title, content: data.content };

      const draft = readDraft(note.id);
      if (draft && draft.baseUpdatedAt === data.updated_at) {
        update({ title: draft.title, content: draft.content });
        void flush();
        return;
      }
      if (draft) clearDraft(note.id);
      latest.current = { title: data.title, content: data.content };
      setTitle(data.title);
      setContent(data.content);
    })();
    return () => {
      cancelled = true;
    };
    // Runs once per note.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  // Flush when the tab is hidden, closed, or the editor unmounts.
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === "hidden" && isDirty()) void flush();
    }
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!isDirty()) return;
      void flush();
      e.preventDefault();
      e.returnValue = "";
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (isDirty()) void flush();
    };
  }, [flush, isDirty]);

  function changeMode(next: Mode) {
    setMode(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      // Ignore.
    }
  }

  function insertAtCursor(text: string) {
    const el = textarea.current;
    const value = latest.current.content;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    // Embeds go on their own line.
    const before = value.slice(0, start);
    const after = value.slice(end);
    const prefix = before && !before.endsWith("\n") ? "\n" : "";
    const suffix = after.startsWith("\n") ? "" : "\n";
    const next = before + prefix + text + suffix + after;
    update({ content: next });
    pendingCursor.current = (before + prefix + text + suffix).length;
  }

  // Focus the textarea in the same commit as the insertion, so keys typed
  // straight after picking a drawing land in the note.
  useLayoutEffect(() => {
    const cursor = pendingCursor.current;
    const el = textarea.current;
    if (cursor === null || !el) return;
    pendingCursor.current = null;
    el.focus();
    el.setSelectionRange(cursor, cursor);
  }, [content]);

  const handleCreateNote = useCallback(
    async (newTitle: string) => {
      await flush();
      const form = new FormData();
      form.set("title", newTitle);
      form.set("folderId", note.folder_id ?? "");
      await createNote(form);
    },
    [flush, note.folder_id],
  );

  const backHref = note.folder_id
    ? `/dashboard?folder=${note.folder_id}`
    : "/dashboard";

  async function handleBack(e: React.MouseEvent) {
    e.preventDefault();
    if (isDirty()) await flush();
    await saveChain.current;
    if (isDirty()) return; // Save failed; it keeps retrying.
    router.push(backHref);
    router.refresh();
  }

  const saveLabel: Record<SaveState, string> = {
    saved: "Saved",
    unsaved: "Unsaved changes…",
    saving: "Saving…",
    error: "⚠ Save failed — retrying…",
  };

  return (
    <div className="flex h-screen flex-col bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-4 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href={backHref}
            onClick={handleBack}
            className="shrink-0 rounded-md border border-zinc-300 px-2.5 py-1 text-sm text-zinc-600 hover:bg-zinc-50"
          >
            ← Dashboard
          </Link>
          <input
            value={title}
            onChange={(e) => update({ title: e.target.value })}
            maxLength={200}
            className="w-64 min-w-0 truncate rounded-md border border-transparent px-2 py-1 text-sm font-medium hover:border-zinc-200 focus:border-indigo-400 focus:outline-none"
            aria-label="Note title"
          />
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <span
            className={`text-xs ${saveState === "error" ? "text-red-600" : "text-zinc-400"}`}
          >
            {saveLabel[saveState]}
          </span>
          <div className="flex rounded-md border border-zinc-300 text-sm">
            {(["edit", "split", "preview"] as const).map((m) => (
              <button
                key={m}
                onClick={() => changeMode(m)}
                className={`px-2.5 py-1 capitalize first:rounded-l-md last:rounded-r-md ${
                  mode === m
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-600 hover:bg-zinc-50"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <button
            onClick={() => setHistoryOpen(true)}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            History
          </button>
          <button
            onClick={() => {
              if (mode === "preview") changeMode("split");
              setPickerOpen(true);
            }}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Embed drawing
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {mode !== "preview" && (
          <div
            className={`flex min-h-0 flex-col ${mode === "split" ? "w-1/2 border-r border-zinc-200" : "w-full"}`}
          >
            <textarea
              ref={textarea}
              value={content}
              onChange={(e) => update({ content: e.target.value })}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "s") {
                  e.preventDefault();
                  void flush();
                }
              }}
              spellCheck
              placeholder={
                "# Start writing…\n\nLink notes with [[Note title]].\nEmbed a drawing with the “Embed drawing” button, or ![[Drawing title]]."
              }
              className="min-h-0 flex-1 resize-none p-6 font-mono text-sm leading-relaxed text-zinc-800 focus:outline-none"
              aria-label="Note content"
            />
          </div>
        )}
        {mode !== "edit" && (
          <div
            className={`min-h-0 overflow-y-auto ${mode === "split" ? "w-1/2" : "w-full"}`}
          >
            <div className="mx-auto max-w-3xl p-6">
              {content.trim() ? (
                <MarkdownPreview
                  content={content}
                  drawings={drawings}
                  notes={notes}
                  folderId={note.folder_id}
                  onCreateNote={handleCreateNote}
                />
              ) : (
                <p className="text-sm text-zinc-400">Nothing to preview yet.</p>
              )}
            </div>
          </div>
        )}
      </div>

      {pickerOpen && (
        <DrawingPicker
          drawings={drawings}
          folderId={note.folder_id}
          onPick={(d) => {
            setPickerOpen(false);
            insertAtCursor(drawingEmbedMarkdown(d));
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {historyOpen && (
        <NoteHistoryDialog
          noteId={note.id}
          onRestore={(rev) => {
            update({ title: rev.title, content: rev.content });
            void flush();
            setHistoryOpen(false);
          }}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </div>
  );
}
