import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/AppHeader";
import ApiTokenManager from "@/components/ApiTokenManager";
import type { Profile } from "@/lib/types";
import type { ApiToken } from "@/lib/apiTokens";
import { publicAppUrl } from "@/lib/appUrl";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: tokens }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase
      .from("api_tokens")
      .select("id, name, token_prefix, scope, created_at, last_used_at, expires_at")
      .order("created_at", { ascending: false }),
  ]);
  if (!profile) redirect("/login");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const mcpUrl = `${publicAppUrl(`${proto}://${host}`)}/api/mcp`;

  return (
    <div className="min-h-screen bg-zinc-50">
      <AppHeader profile={profile as Profile} />
      <main className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="mb-1 text-2xl font-bold">MCP access</h1>
        <p className="mb-8 text-sm text-zinc-500">
          Connect Claude (or any MCP client) to your drawings and notes. AI
          assistants can then search and read your content for context, and
          — with a read &amp; write token — create notes and diagrams for you.
        </p>
        <ApiTokenManager tokens={(tokens ?? []) as ApiToken[]} mcpUrl={mcpUrl} />
      </main>
    </div>
  );
}
