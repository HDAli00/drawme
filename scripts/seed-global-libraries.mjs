/**
 * Seeds global shape libraries and the initial-admin email into Supabase.
 * Server-side only — requires the service_role key.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... INITIAL_ADMIN_EMAIL=... \
 *     node scripts/seed-global-libraries.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const url =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    "Missing SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false },
});

const dir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "supabase",
  "seed-libraries",
);

function toLibraryItems(data) {
  const raw = data?.libraryItems ?? data?.library ?? [];
  return raw
    .map((item) =>
      Array.isArray(item)
        ? {
            id: Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
            status: "unpublished",
            elements: item,
            created: Date.now(),
          }
        : item,
    )
    .filter((i) => i && Array.isArray(i.elements) && i.elements.length > 0);
}

// 1. Initial admin email → app_config (read by the handle_new_user trigger).
const adminEmail = process.env.INITIAL_ADMIN_EMAIL;
if (adminEmail) {
  const { error } = await supabase
    .from("app_config")
    .upsert({ key: "initial_admin_email", value: adminEmail });
  if (error) throw new Error(`app_config upsert failed: ${error.message}`);
  console.log(`app_config.initial_admin_email = ${adminEmail}`);

  // If that user already signed up before this was set, promote them now.
  const { data: existing } = await supabase
    .from("profiles")
    .select("id, role")
    .ilike("email", adminEmail)
    .maybeSingle();
  if (existing && existing.role !== "admin") {
    await supabase
      .from("profiles")
      .update({ role: "admin" })
      .eq("id", existing.id);
    console.log(`promoted existing profile ${existing.id} to admin`);
  }
}

// 2. Global libraries.
const manifest = JSON.parse(
  await readFile(path.join(dir, "manifest.json"), "utf8"),
);

for (const entry of manifest.libraries) {
  const raw = JSON.parse(await readFile(path.join(dir, entry.file), "utf8"));
  const items = toLibraryItems(raw);
  if (!items.length) {
    console.warn(`skipping ${entry.file}: no items`);
    continue;
  }

  const { data: existing } = await supabase
    .from("libraries")
    .select("id")
    .eq("scope", "global")
    .eq("name", entry.name)
    .maybeSingle();

  if (existing) {
    console.log(`exists: ${entry.name} (${items.length} shapes)`);
    continue;
  }

  const { error } = await supabase.from("libraries").insert({
    owner_id: null,
    name: entry.name,
    description: entry.description,
    scope: "global",
    data: { libraryItems: items },
  });
  if (error) throw new Error(`insert ${entry.name} failed: ${error.message}`);
  console.log(`seeded: ${entry.name} (${items.length} shapes)`);
}

console.log("done");
