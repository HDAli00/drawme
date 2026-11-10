"use client";

import { useState, useTransition } from "react";
import { updateProfile } from "@/app/settings/actions";

export default function ProfileForm({
  displayName,
  email,
}: {
  displayName: string | null;
  email: string;
}) {
  const [name, setName] = useState(displayName ?? "");
  const [status, setStatus] = useState<
    { kind: "saved" } | { kind: "error"; message: string } | null
  >(null);
  const [pending, startTransition] = useTransition();
  const dirty = name.trim() !== (displayName ?? "");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setStatus(null);
        startTransition(async () => {
          const res = await updateProfile(name);
          setStatus(
            "error" in res ? { kind: "error", message: res.error } : { kind: "saved" },
          );
        });
      }}
    >
      <div className="grid gap-5 px-6 py-5 sm:grid-cols-2">
        <Field label="Display name" hint="Shown in the header and on your workspace.">
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setStatus(null);
            }}
            maxLength={100}
            placeholder={email.split("@")[0]}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
          />
        </Field>
        <Field label="Email address" hint="Used to sign in. It can’t be changed here.">
          <input
            value={email}
            readOnly
            className="w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"
          />
        </Field>
      </div>
      <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50/60 px-6 py-3">
        {status?.kind === "saved" && (
          <span className="text-sm text-emerald-600">Saved</span>
        )}
        {status?.kind === "error" && (
          <span className="text-sm text-red-600">{status.message}</span>
        )}
        <button
          type="submit"
          disabled={!dirty || pending}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </span>
      {children}
      <span className="mt-1.5 block text-xs text-slate-500">{hint}</span>
    </label>
  );
}
