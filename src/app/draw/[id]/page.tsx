import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import EditorShell from "@/components/EditorShell";
import type { Drawing } from "@/lib/types";

export default async function DrawPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: drawing }, { data: libState }] = await Promise.all([
    supabase.from("drawings").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("user_library_state")
      .select("library_items")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (!drawing) notFound();
  const d = drawing as Drawing;

  return (
    <EditorShell
      drawingId={d.id}
      initialTitle={d.title}
      initialScene={d.scene ?? { elements: [], appState: {} }}
      initialLibraryItems={(libState?.library_items as unknown[]) ?? []}
      userId={user.id}
    />
  );
}
