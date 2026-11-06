"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Revision = {
  id: number;
  title: string;
  content: string;
  created_at: string;
};

export default function NoteHistoryDialog({
  noteId,
  onRestore,
  onClose,
}: {
  noteId: string;
  onRestore: (rev: Revision) => void;
  onClose: () => void;
}) {
  const supabase = useRef(createClient()).current;
  const [revisions, setRevisions] = useState<Revision[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("note_revisions")
      .select("id, title, content, created_at")
      .eq("note_id", noteId)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setError(error.message);
        else setRevisions(data as Revision[]);
      });
    return () => {
      cancelled = true;
    };
  }, [noteId, supabase]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Version history</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <p className="mb-4 text-sm text-zinc-500">
          Earlier versions are kept automatically. Restoring one replaces the
          note; the current text stays in this list.
        </p>

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        {revisions === null ? (
          !error && <p className="text-sm text-zinc-400">Loading…</p>
        ) : revisions.length === 0 ? (
          <p className="text-sm text-zinc-400">No earlier versions yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {revisions.map((rev) => (
              <li
                key={rev.id}
                className="flex items-center justify-between gap-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {new Date(rev.created_at).toLocaleString()}
                  </p>
                  <p className="truncate text-xs text-zinc-400">
                    {rev.content.slice(0, 80) || "(empty)"}
                  </p>
                </div>
                <button
                  onClick={() => onRestore(rev)}
                  className="shrink-0 rounded-md border border-zinc-300 px-2.5 py-1 text-sm text-zinc-700 hover:bg-zinc-50"
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
