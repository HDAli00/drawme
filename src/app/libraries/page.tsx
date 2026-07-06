import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/AppHeader";
import LibraryList from "@/components/LibraryList";
import type { Library, Profile } from "@/lib/types";
import type { RawLibraryItem } from "@/lib/libraryUtils";

export default async function LibrariesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: libraries }, { data: libState }] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase
        .from("libraries")
        .select("*")
        .order("scope", { ascending: false })
        .order("created_at", { ascending: true }),
      supabase
        .from("user_library_state")
        .select("library_items")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

  if (!profile) redirect("/login");

  return (
    <div className="min-h-screen bg-zinc-50">
      <AppHeader profile={profile as Profile} />
      <main className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="mb-1 text-2xl font-bold">Shape libraries</h1>
        <p className="mb-8 text-sm text-zinc-500">
          Installed libraries appear in the editor&apos;s library sidebar and
          persist across sessions and devices.
        </p>
        <LibraryList
          libraries={(libraries ?? []) as Library[]}
          installedItems={
            ((libState?.library_items ?? []) as RawLibraryItem[])
          }
          userId={user.id}
          isAdmin={(profile as Profile).role === "admin"}
        />
      </main>
    </div>
  );
}
