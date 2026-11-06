import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NoteEditor from "@/components/NoteEditor";
import type { Note } from "@/lib/types";

export default async function NotePage({
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

  const [{ data: note }, { data: drawings }, { data: notes }] =
    await Promise.all([
      supabase.from("notes").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("drawings")
        .select("id, title, folder_id, updated_at, thumbnail")
        .order("updated_at", { ascending: false }),
      supabase
        .from("notes")
        .select("id, title, folder_id, updated_at")
        .order("updated_at", { ascending: false }),
    ]);

  if (!note) notFound();

  return (
    <NoteEditor
      note={note as Note}
      drawings={drawings ?? []}
      notes={(notes ?? []).filter((n) => n.id !== id)}
    />
  );
}
