"use client";

import { useEffect, useRef, useState } from "react";
import {
  loadLibraryFromBlob,
  restoreLibraryItems,
} from "@excalidraw/excalidraw";
import type {
  ExcalidrawImperativeAPI,
  LibraryItems,
} from "@excalidraw/excalidraw/types";
import { createClient } from "@/lib/supabase/client";
import { countLibraryItems } from "@/lib/libraryUtils";
import type { Library } from "@/lib/types";

export default function LibraryDialog({
  api,
  userId,
  onClose,
}: {
  api: ExcalidrawImperativeAPI;
  userId: string;
  onClose: () => void;
}) {
  const supabase = useRef(createClient()).current;
  const [libraries, setLibraries] = useState<Library[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("libraries")
      .select("*")
      .order("scope", { ascending: false })
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setError(error.message);
        else setLibraries(data as Library[]);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function installLibrary(lib: Library) {
    setInstalling(lib.id);
    setError(null);
    try {
      const items = restoreLibraryItems(
        (lib.data.libraryItems ?? lib.data.library ?? []) as never,
        "unpublished",
      ) as LibraryItems;
      await api.updateLibrary({
        libraryItems: items,
        merge: true,
        openLibraryMenu: true,
        defaultStatus: "unpublished",
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Install failed");
    } finally {
      setInstalling(null);
    }
  }

  async function importFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const items = (await loadLibraryFromBlob(file)) as LibraryItems;
      if (!items.length) throw new Error("No shapes found in this file");

      // Install into the open editor (persisted via onLibraryChange).
      await api.updateLibrary({
        libraryItems: items,
        merge: true,
        openLibraryMenu: true,
        defaultStatus: "unpublished",
      });

      // Save as a personal library: raw file to Storage + metadata row.
      const name = file.name.replace(/\.excalidrawlib$/i, "");
      const path = `${userId}/${crypto.randomUUID()}.excalidrawlib`;
      const { error: storageError } = await supabase.storage
        .from("libraries")
        .upload(path, file, { contentType: "application/json" });
      const { error: rowError } = await supabase.from("libraries").insert({
        owner_id: userId,
        name,
        scope: "user",
        data: { libraryItems: items },
        storage_path: storageError ? null : path,
      });
      if (rowError) throw new Error(rowError.message);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setUploading(false);
    }
  }

  const globals = (libraries ?? []).filter((l) => l.scope === "global");
  const personal = (libraries ?? []).filter((l) => l.scope === "user");

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
          <h2 className="text-lg font-bold">Shape libraries</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        {libraries === null ? (
          <p className="text-sm text-zinc-400">Loading…</p>
        ) : (
          <>
            <Section
              title="Global libraries"
              empty="No global libraries published yet."
              libs={globals}
              installing={installing}
              onInstall={installLibrary}
            />
            <Section
              title="My libraries"
              empty="You haven't imported any libraries yet."
              libs={personal}
              installing={installing}
              onInstall={installLibrary}
            />
          </>
        )}

        <div className="mt-6 border-t border-zinc-100 pt-4">
          <p className="mb-2 text-sm font-medium">Import a .excalidrawlib file</p>
          <input
            ref={fileInput}
            type="file"
            accept=".excalidrawlib,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importFile(f);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-50"
          >
            {uploading ? "Importing…" : "Choose file…"}
          </button>
          <p className="mt-2 text-xs text-zinc-400">
            The file is installed into your editor and saved to “My libraries”.
            Browse more at{" "}
            <a
              href="https://libraries.excalidraw.com"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              libraries.excalidraw.com
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  empty,
  libs,
  installing,
  onInstall,
}: {
  title: string;
  empty: string;
  libs: Library[];
  installing: string | null;
  onInstall: (lib: Library) => void;
}) {
  return (
    <div className="mb-4">
      <h3 className="mb-2 text-sm font-semibold text-zinc-500">{title}</h3>
      {libs.length === 0 ? (
        <p className="text-sm text-zinc-400">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {libs.map((lib) => (
            <li
              key={lib.id}
              className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{lib.name}</p>
                <p className="text-xs text-zinc-400">
                  {countLibraryItems(lib.data)} shapes
                  {lib.description ? ` — ${lib.description}` : ""}
                </p>
              </div>
              <button
                onClick={() => onInstall(lib)}
                disabled={installing === lib.id}
                className="ml-3 shrink-0 rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {installing === lib.id ? "Installing…" : "Install"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
