"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { generateToken, type TokenScope } from "@/lib/apiTokens";

export async function createApiToken(
  name: string,
  scope: TokenScope,
  expiresInDays: number | null,
): Promise<{ token: string } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const trimmed = name.trim().slice(0, 100);
  if (!trimmed) return { error: "Give the token a name." };
  if (scope !== "read" && scope !== "read_write") return { error: "Invalid scope." };

  const { token, hash, prefix } = generateToken();
  const { error } = await supabase.from("api_tokens").insert({
    owner_id: user.id,
    name: trimmed,
    token_hash: hash,
    token_prefix: prefix,
    scope,
    expires_at: expiresInDays
      ? new Date(Date.now() + expiresInDays * 86_400_000).toISOString()
      : null,
  });
  if (error) return { error: error.message };

  revalidatePath("/settings");
  // Returned once; only the hash is stored.
  return { token };
}

export async function revokeApiToken(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("api_tokens").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}
