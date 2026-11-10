import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/AppHeader";
import ApiTokenManager from "@/components/ApiTokenManager";
import ProfileForm from "@/components/ProfileForm";
import { Avatar } from "@/components/AppHeaderClient";
import { LogOutIcon, PlugIcon, UserIcon } from "@/components/Icons";
import type { Profile } from "@/lib/types";
import type { ApiToken } from "@/lib/apiTokens";
import { publicAppUrl } from "@/lib/appUrl";
import { displayName, initials } from "@/lib/profile";

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
  const p = profile as Profile;

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const mcpUrl = `${publicAppUrl(`${proto}://${host}`)}/api/mcp`;

  const memberSince = new Date(p.created_at).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader profile={p} />

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
          <p className="text-xs font-semibold tracking-wider text-indigo-600 uppercase">
            Settings
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Account &amp; integrations
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage your profile and how AI assistants connect to your workspace.
          </p>
        </div>
      </section>

      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6 md:flex-row md:items-start">
        <nav
          aria-label="Settings sections"
          className="flex gap-1 text-sm md:sticky md:top-24 md:w-48 md:shrink-0 md:flex-col"
        >
          <SectionLink href="#profile" icon={UserIcon}>
            Profile
          </SectionLink>
          <SectionLink href="#mcp" icon={PlugIcon}>
            MCP access
          </SectionLink>
          <SectionLink href="#session" icon={LogOutIcon}>
            Session
          </SectionLink>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <Section
            id="profile"
            title="Profile"
            description="How you appear across drawme."
          >
            <div className="flex items-center gap-4 border-b border-slate-100 px-6 py-5">
              <Avatar initials={initials(p)} size="lg" />
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-900">
                  {displayName(p)}
                </p>
                <p className="text-sm text-slate-500">
                  {p.role === "admin" ? "Administrator" : "Member"} · since{" "}
                  {memberSince}
                </p>
              </div>
            </div>
            <ProfileForm displayName={p.display_name} email={p.email} />
          </Section>

          {/* The token manager brings its own cards, so this group has a
              plain heading rather than a wrapping card. */}
          <div id="mcp" className="scroll-mt-24 pt-2">
            <div className="mb-4 px-1">
              <h2 className="text-base font-semibold text-slate-900">
                MCP access
              </h2>
              <p className="mt-0.5 text-sm text-slate-500">
                Connect Claude (or any MCP client) to your drawings and notes.
                Assistants can search and read your content — and, with a read
                &amp; write token, create notes and diagrams for you.
              </p>
            </div>
            <ApiTokenManager
              tokens={(tokens ?? []) as ApiToken[]}
              mcpUrl={mcpUrl}
            />
          </div>

          <Section
            id="session"
            title="Session"
            description="Sign out of drawme on this device."
          >
            <form
              action="/auth/signout"
              method="post"
              className="flex items-center justify-between gap-4 px-6 py-5"
            >
              <p className="text-sm text-slate-600">
                Signed in as{" "}
                <span className="font-medium text-slate-900">{p.email}</span>
              </p>
              <button
                type="submit"
                className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-red-300 hover:bg-red-50 hover:text-red-700"
              >
                <LogOutIcon className="size-4" />
                Sign out
              </button>
            </form>
          </Section>
        </div>
      </div>
    </div>
  );
}

function SectionLink({
  href,
  icon: Icon,
  children,
}: {
  href: string;
  icon: (p: { className?: string }) => React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className="flex items-center gap-2.5 rounded-md px-3 py-2 text-slate-600 transition-colors hover:bg-white hover:text-slate-900 hover:shadow-sm"
    >
      <Icon className="size-4 text-slate-400" />
      {children}
    </a>
  );
}

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
    >
      <header className="border-b border-slate-200 px-6 py-4">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <p className="mt-0.5 text-sm text-slate-500">{description}</p>
      </header>
      {children}
    </section>
  );
}
