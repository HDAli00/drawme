import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/AppHeader";
import AdminPanel from "@/components/AdminPanel";
import type { Library, Profile } from "@/lib/types";

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile || (profile as Profile).role !== "admin") {
    redirect("/dashboard");
  }

  // RLS: admins can select all profiles; everyone can read global libraries.
  const [{ data: users }, { data: globalLibraries }] = await Promise.all([
    supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: true }),
    supabase
      .from("libraries")
      .select("*")
      .eq("scope", "global")
      .order("created_at", { ascending: true }),
  ]);

  return (
    <div className="min-h-screen bg-zinc-50">
      <AppHeader profile={profile as Profile} />
      <main className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="mb-1 text-2xl font-bold">Admin</h1>
        <p className="mb-8 text-sm text-zinc-500">
          Manage users, roles and globally published shape libraries.
        </p>
        <AdminPanel
          users={(users ?? []) as Profile[]}
          globalLibraries={(globalLibraries ?? []) as Library[]}
          currentUserId={user.id}
        />
      </main>
    </div>
  );
}
