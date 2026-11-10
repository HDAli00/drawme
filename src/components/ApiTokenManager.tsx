"use client";

import { useState, useTransition } from "react";
import { createApiToken, revokeApiToken } from "@/app/settings/actions";
import type { ApiToken, TokenScope } from "@/lib/apiTokens";

function fmt(date: string | null) {
  return date ? new Date(date).toLocaleDateString() : "—";
}

function CopyBlock({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center justify-between text-xs font-medium text-zinc-600">
        <span>{label}</span>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="text-indigo-600 hover:underline"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto rounded-md bg-zinc-900 p-3 text-xs text-zinc-100">
        {value}
      </pre>
    </div>
  );
}

export default function ApiTokenManager({
  tokens,
  mcpUrl,
}: {
  tokens: ApiToken[];
  mcpUrl: string;
}) {
  const [name, setName] = useState("");
  const [scope, setScope] = useState<TokenScope>("read_write");
  const [expires, setExpires] = useState("90");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const token = newToken ?? "<your token>";
  const claudeCode = `claude mcp add --transport http drawme ${mcpUrl} \\\n  --header "Authorization: Bearer ${token}"`;
  const jsonConfig = JSON.stringify(
    {
      mcpServers: {
        drawme: {
          type: "http",
          url: mcpUrl,
          headers: { Authorization: `Bearer ${token}` },
        },
      },
    },
    null,
    2,
  );

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Create an access token</h3>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            startTransition(async () => {
              const res = await createApiToken(
                name,
                scope,
                expires === "never" ? null : Number(expires),
              );
              if ("error" in res) setError(res.error);
              else {
                setNewToken(res.token);
                setName("");
              }
            });
          }}
        >
          <label className="flex flex-col text-sm">
            <span className="mb-1 text-zinc-600">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Claude Code on laptop"
              maxLength={100}
              required
              className="w-64 rounded-md border border-zinc-300 px-3 py-1.5"
            />
          </label>
          <label className="flex flex-col text-sm">
            <span className="mb-1 text-zinc-600">Access</span>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as TokenScope)}
              className="rounded-md border border-zinc-300 px-3 py-1.5"
            >
              <option value="read_write">Read &amp; write</option>
              <option value="read">Read only</option>
            </select>
          </label>
          <label className="flex flex-col text-sm">
            <span className="mb-1 text-zinc-600">Expires</span>
            <select
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-1.5"
            >
              <option value="30">in 30 days</option>
              <option value="90">in 90 days</option>
              <option value="365">in 1 year</option>
              <option value="never">never</option>
            </select>
          </label>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {pending ? "Creating…" : "Create token"}
          </button>
        </form>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        {newToken && (
          <div className="mt-5 rounded-md border border-amber-300 bg-amber-50 p-4">
            <p className="mb-3 text-sm font-medium text-amber-900">
              Copy this token now — it won&apos;t be shown again.
            </p>
            <CopyBlock label="Token" value={newToken} />
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Connect a client</h3>
        <CopyBlock label="MCP server URL" value={mcpUrl} />
        <CopyBlock label="Claude Code" value={claudeCode} />
        <CopyBlock
          label="Claude Desktop, Cursor and other clients (mcp.json)"
          value={jsonConfig}
        />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Your tokens</h3>
        {tokens.length === 0 ? (
          <p className="text-sm text-zinc-500">No tokens yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-zinc-500">
              <tr>
                <th className="pb-2">Name</th>
                <th className="pb-2">Token</th>
                <th className="pb-2">Access</th>
                <th className="pb-2">Last used</th>
                <th className="pb-2">Expires</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tokens.map((t) => (
                <tr key={t.id} className="border-t border-zinc-100">
                  <td className="py-2">{t.name}</td>
                  <td className="py-2 font-mono text-xs text-zinc-500">{t.token_prefix}…</td>
                  <td className="py-2">{t.scope === "read" ? "Read only" : "Read & write"}</td>
                  <td className="py-2">{fmt(t.last_used_at)}</td>
                  <td className="py-2">{t.expires_at ? fmt(t.expires_at) : "Never"}</td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        if (!confirm(`Revoke "${t.name}"? Clients using it stop working.`)) return;
                        startTransition(() => revokeApiToken(t.id));
                      }}
                      className="text-red-600 hover:underline"
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
