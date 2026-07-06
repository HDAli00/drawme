"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createDrawing() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("drawings")
    .insert({ owner_id: user.id, title: "Untitled drawing" })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  redirect(`/draw/${data.id}`);
}

export async function renameDrawing(id: string, title: string) {
  const supabase = await createClient();
  const trimmed = title.trim();
  if (!trimmed) return;
  const { error } = await supabase
    .from("drawings")
    .update({ title: trimmed.slice(0, 200) })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}

export async function deleteDrawing(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("drawings").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}
