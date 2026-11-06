"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createDrawing(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const folderId = formData.get("folderId");
  const { data, error } = await supabase
    .from("drawings")
    .insert({
      owner_id: user.id,
      title: "Untitled drawing",
      folder_id: typeof folderId === "string" && folderId ? folderId : null,
    })
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

export async function moveDrawing(id: string, folderId: string | null) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("drawings")
    .update({ folder_id: folderId })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}

export async function createFolder(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const name = String(formData.get("name") ?? "").trim().slice(0, 100);
  if (!name) return;
  const { data, error } = await supabase
    .from("folders")
    .insert({ owner_id: user.id, name })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  redirect(`/dashboard?folder=${data.id}`);
}

export async function renameFolder(id: string, name: string) {
  const supabase = await createClient();
  const trimmed = name.trim().slice(0, 100);
  if (!trimmed) return;
  const { error } = await supabase
    .from("folders")
    .update({ name: trimmed })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}

// Drawings in the folder are kept and become unfiled.
export async function deleteFolder(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("folders").delete().eq("id", id);
  if (error) throw new Error(error.message);
  redirect("/dashboard");
}

export async function createNote(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const folderId = formData.get("folderId");
  const title = String(formData.get("title") ?? "").trim().slice(0, 200);
  const { data, error } = await supabase
    .from("notes")
    .insert({
      owner_id: user.id,
      title: title || "Untitled note",
      folder_id: typeof folderId === "string" && folderId ? folderId : null,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  redirect(`/notes/${data.id}`);
}

export async function moveNote(id: string, folderId: string | null) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("notes")
    .update({ folder_id: folderId })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}

export async function deleteNote(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("notes").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}

// Bulk actions for items selected on the dashboard.
export async function moveItems(
  drawingIds: string[],
  noteIds: string[],
  folderId: string | null,
) {
  const supabase = await createClient();
  const results = await Promise.all([
    drawingIds.length
      ? supabase.from("drawings").update({ folder_id: folderId }).in("id", drawingIds)
      : null,
    noteIds.length
      ? supabase.from("notes").update({ folder_id: folderId }).in("id", noteIds)
      : null,
  ]);
  const error = results.find((r) => r?.error)?.error;
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}

export async function deleteItems(drawingIds: string[], noteIds: string[]) {
  const supabase = await createClient();
  const results = await Promise.all([
    drawingIds.length
      ? supabase.from("drawings").delete().in("id", drawingIds)
      : null,
    noteIds.length ? supabase.from("notes").delete().in("id", noteIds) : null,
  ]);
  const error = results.find((r) => r?.error)?.error;
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}
