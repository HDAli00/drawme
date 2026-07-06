import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/AppHeader";
import DrawingCard from "@/components/DrawingCard";
import { createDrawing } from "./actions";
import type { Profile } from "@/lib/types";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: drawings }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase
      .from("drawings")
      .select("id, title, thumbnail, updated_at")
      .order("updated_at", { ascending: false }),
  ]);

  if (!profile) redirect("/login");

  return (
    <div className="min-h-screen bg-zinc-50">
      <AppHeader profile={profile as Profile} />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Your drawings</h1>
          <form action={createDrawing}>
            <button
              type="submit"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              + New drawing
            </button>
          </form>
        </div>

        {drawings && drawings.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {drawings.map((d) => (
              <DrawingCard key={d.id} drawing={d} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-12 text-center text-zinc-500">
            <p className="mb-2 text-lg">No drawings yet</p>
            <p className="text-sm">
              Click “New drawing” to open a blank whiteboard.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
