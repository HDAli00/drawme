"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  countLibraryItems,
  mergeItems,
  toLibraryItems,
  type RawLibraryItem,
} from "@/lib/libraryUtils";
import type { Library } from "@/lib/types";

export default function LibraryList({
  libraries,
  installedItems,
  userId,
  isAdmin,
}: {
  libraries: Library[];
  installedItems: RawLibraryItem[];
  userId: string;
  isAdmin: boolean;
}) {
  const supabase = useRef(createClient()).current;
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const installedIds = new Set(installedItems.map((i) => i.id));

  function isInstalled(lib: Library) {
    const items = toLibraryItems(lib.data);
    return items.length > 0 && items.every((i) => installedIds.has(i.id));
  }

  async function saveInstalled(items: RawLibraryItem[]) {
    const { error } = await supabase
      .from("user_library_state")
      .upsert({ user_id: userId, library_items: items });
    if (error) throw new Error(error.message);
  }

  async function install(lib: Library) {
    setBusyId(lib.id);
    setError(null);
    try {
      await saveInstalled(mergeItems(installedItems, toLibraryItems(lib.data)));
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Install failed");
    } finally {
      setBusyId(null);
    }
  }

  async function uninstall(lib: Library) {
    setBusyId(lib.id);
    setError(null);
    try {
      const ids = new Set(toLibraryItems(lib.data).map((i) => i.id));
      await saveInstalled(installedItems.filter((i) => !ids.has(i.id)));
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Uninstall failed");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteLibrary(lib: Library) {
    if (!confirm(`Delete library "${lib.name}"?`)) return;
    setBusyId(lib.id);
    setError(null);
    try {
      const { error } = await supabase
        .from("libraries")
        .delete()
        .eq("id", lib.id);
      if (error) throw new Error(error.message);
      if (lib.storage_path) {
        await supabase.storage.from("libraries").remove([lib.storage_path]);
      }
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  async function uploadFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const items = toLibraryItems(parsed);
      if (!items.length) throw new Error("No shapes found in this file");

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
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const globals = libraries.filter((l) => l.scope === "global");
  const personal = libraries.filter((l) => l.scope === "user");

  return (
    <div className="flex flex-col gap-8">
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <Section
        title="Global libraries"
        subtitle="Published by admins — available to everyone."
        empty="No global libraries published yet."
      >
        {globals.map((lib) => (
          <Row
            key={lib.id}
            lib={lib}
            installed={isInstalled(lib)}
            busy={busyId === lib.id || pending}
            onInstall={() => install(lib)}
            onUninstall={() => uninstall(lib)}
            onDelete={isAdmin ? () => deleteLibrary(lib) : undefined}
          />
        ))}
      </Section>

      <Section
        title="My libraries"
        subtitle="Imported from .excalidrawlib files — only visible to you."
        empty="You haven't imported any libraries yet."
      >
        {personal.map((lib) => (
          <Row
            key={lib.id}
            lib={lib}
            installed={isInstalled(lib)}
            busy={busyId === lib.id || pending}
            onInstall={() => install(lib)}
            onUninstall={() => uninstall(lib)}
            onDelete={() => deleteLibrary(lib)}
          />
        ))}
      </Section>

      <div>
        <h2 className="mb-1 text-lg font-semibold">Import a library</h2>
        <p className="mb-3 text-sm text-zinc-500">
          Upload a <code>.excalidrawlib</code> file — find hundreds at{" "}
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
        <input
          ref={fileInput}
          type="file"
          accept=".excalidrawlib,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadFile(f);
            e.target.value = "";
          }}
        />
        <button
          onClick={() => fileInput.current?.click()}
          disabled={uploading}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {uploading ? "Uploading…" : "Upload .excalidrawlib"}
        </button>
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  empty,
  children,
}: {
  title: string;
  subtitle: string;
  empty: string;
  children: React.ReactNode[];
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mb-3 text-sm text-zinc-500">{subtitle}</p>
      {children.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-400">
          {empty}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">{children}</ul>
      )}
    </div>
  );
}

function Row({
  lib,
  installed,
  busy,
  onInstall,
  onUninstall,
  onDelete,
}: {
  lib: Library;
  installed: boolean;
  busy: boolean;
  onInstall: () => void;
  onUninstall: () => void;
  onDelete?: () => void;
}) {
  return (
    <li className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3">
      <div className="min-w-0">
        <p className="truncate font-medium">
          {lib.name}
          {installed && (
            <span className="ml-2 rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-700">
              installed
            </span>
          )}
        </p>
        <p className="text-xs text-zinc-400">
          {countLibraryItems(lib.data)} shapes
          {lib.description ? ` — ${lib.description}` : ""}
        </p>
      </div>
      <div className="ml-3 flex shrink-0 gap-2">
        {installed ? (
          <button
            onClick={onUninstall}
            disabled={busy}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-50 disabled:opacity-50"
          >
            Uninstall
          </button>
        ) : (
          <button
            onClick={onInstall}
            disabled={busy}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Install
          </button>
        )}
        {onDelete && (
          <button
            onClick={onDelete}
            disabled={busy}
            className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            Delete
          </button>
        )}
      </div>
    </li>
  );
}
