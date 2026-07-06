"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { countLibraryItems, toLibraryItems } from "@/lib/libraryUtils";
import type { Library, Profile } from "@/lib/types";

export default function AdminPanel({
  users,
  globalLibraries,
  currentUserId,
}: {
  users: Profile[];
  globalLibraries: Library[];
  currentUserId: string;
}) {
  const supabase = useRef(createClient()).current;
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function setRole(userId: string, role: "user" | "admin") {
    setBusy(userId);
    setError(null);
    // RLS + a DB trigger enforce that only admins can change roles.
    const { error } = await supabase
      .from("profiles")
      .update({ role })
      .eq("id", userId);
    if (error) setError(error.message);
    startTransition(() => router.refresh());
    setBusy(null);
  }

  async function publishGlobal(file: File) {
    setUploading(true);
    setError(null);
    try {
      const parsed = JSON.parse(await file.text());
      const items = toLibraryItems(parsed);
      if (!items.length) throw new Error("No shapes found in this file");

      const name = file.name.replace(/\.excalidrawlib$/i, "");
      const path = `global/${crypto.randomUUID()}.excalidrawlib`;
      const { error: storageError } = await supabase.storage
        .from("libraries")
        .upload(path, file, { contentType: "application/json" });
      const { error: rowError } = await supabase.from("libraries").insert({
        owner_id: null,
        name,
        scope: "global",
        data: { libraryItems: items },
        storage_path: storageError ? null : path,
      });
      if (rowError) throw new Error(rowError.message);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed");
    } finally {
      setUploading(false);
    }
  }

  async function deleteGlobal(lib: Library) {
    if (!confirm(`Remove global library "${lib.name}" for all users?`)) return;
    setBusy(lib.id);
    setError(null);
    const { error } = await supabase
      .from("libraries")
      .delete()
      .eq("id", lib.id);
    if (error) setError(error.message);
    else if (lib.storage_path) {
      await supabase.storage.from("libraries").remove([lib.storage_path]);
    }
    startTransition(() => router.refresh());
    setBusy(null);
  }

  return (
    <div className="flex flex-col gap-10">
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">Users</h2>
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs uppercase text-zinc-400">
              <tr>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-zinc-100 last:border-0">
                  <td className="px-4 py-3">{u.email}</td>
                  <td className="px-4 py-3">{u.display_name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                        u.role === "admin"
                          ? "bg-indigo-100 text-indigo-700"
                          : "bg-zinc-100 text-zinc-600"
                      }`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {u.id !== currentUserId &&
                      (u.role === "admin" ? (
                        <button
                          onClick={() => setRole(u.id, "user")}
                          disabled={busy === u.id}
                          className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs hover:bg-zinc-50 disabled:opacity-50"
                        >
                          Demote to user
                        </button>
                      ) : (
                        <button
                          onClick={() => setRole(u.id, "admin")}
                          disabled={busy === u.id}
                          className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                        >
                          Promote to admin
                        </button>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-lg font-semibold">Global libraries</h2>
        <p className="mb-3 text-sm text-zinc-500">
          Visible to every user in the Libraries page and editor.
        </p>
        {globalLibraries.length === 0 ? (
          <p className="mb-4 rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-400">
            No global libraries yet.
          </p>
        ) : (
          <ul className="mb-4 flex flex-col gap-2">
            {globalLibraries.map((lib) => (
              <li
                key={lib.id}
                className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3"
              >
                <div>
                  <p className="font-medium">{lib.name}</p>
                  <p className="text-xs text-zinc-400">
                    {countLibraryItems(lib.data)} shapes
                    {lib.description ? ` — ${lib.description}` : ""}
                  </p>
                </div>
                <button
                  onClick={() => deleteGlobal(lib)}
                  disabled={busy === lib.id}
                  className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <input
          ref={fileInput}
          type="file"
          accept=".excalidrawlib,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void publishGlobal(f);
            e.target.value = "";
          }}
        />
        <button
          onClick={() => fileInput.current?.click()}
          disabled={uploading}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {uploading ? "Publishing…" : "Publish global library (.excalidrawlib)"}
        </button>
      </section>
    </div>
  );
}
