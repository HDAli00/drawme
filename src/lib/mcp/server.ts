import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { TokenScope } from "@/lib/apiTokens";
import {
  buildElements,
  elementSpec,
  sceneBounds,
  sceneWithoutFiles,
  summarizeScene,
  type ElementSpec,
  type Scene,
  type SceneElement,
} from "./scene";

export type McpContext = {
  supabase: SupabaseClient; // service role: every query below filters on owner_id
  userId: string;
  scope: TokenScope;
  appUrl: string;
};

type ToolResult = {
  content: (
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType: string }
  )[];
  isError?: boolean;
};

const text = (t: string): ToolResult => ({ content: [{ type: "text", text: t }] });
const json = (v: unknown): ToolResult => text(JSON.stringify(v, null, 2));
const fail = (t: string): ToolResult => ({ content: [{ type: "text", text: t }], isError: true });

const uuid = z.string().uuid();

export function createMcpServer(ctx: McpContext) {
  const { supabase, userId, appUrl } = ctx;
  const canWrite = ctx.scope === "read_write";

  const server = new McpServer(
    { name: "drawme", version: "1.0.0" },
    {
      instructions:
        "drawme holds the user's Excalidraw drawings and Markdown notes, grouped in folders. " +
        "Use search or list_items to find content, get_drawing / get_note to read it. " +
        (canWrite
          ? "You can create folders and notes, edit notes, and create or extend drawings from a simple " +
            "shape spec (rectangles/ellipses/diamonds with labels, text, and arrows connecting shapes by id). " +
            "In notes, embed a drawing with ![Title](drawing:<id>) and link notes with [[Note title]]."
          : "This token is read-only."),
    },
  );

  const drawingUrl = (id: string) => `${appUrl}/draw/${id}`;
  const noteUrl = (id: string) => `${appUrl}/notes/${id}`;

  async function folderExists(folderId: string) {
    const { data } = await supabase
      .from("folders")
      .select("id")
      .eq("id", folderId)
      .eq("owner_id", userId)
      .maybeSingle();
    return !!data;
  }

  // ------------------------------------------------------------------ read

  server.registerTool(
    "list_folders",
    {
      title: "List folders",
      description: "List the user's folders with how many drawings and notes each holds.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const [folders, drawings, notes] = await Promise.all([
        supabase.from("folders").select("id, name, created_at").eq("owner_id", userId).order("name"),
        supabase.from("drawings").select("folder_id").eq("owner_id", userId),
        supabase.from("notes").select("folder_id").eq("owner_id", userId),
      ]);
      if (folders.error) return fail(folders.error.message);
      const count = (rows: { folder_id: string | null }[] | null, id: string | null) =>
        (rows ?? []).filter((r) => r.folder_id === id).length;
      return json({
        folders: (folders.data ?? []).map((f) => ({
          ...f,
          drawings: count(drawings.data, f.id),
          notes: count(notes.data, f.id),
        })),
        unfiled: { drawings: count(drawings.data, null), notes: count(notes.data, null) },
      });
    },
  );

  server.registerTool(
    "list_items",
    {
      title: "List drawings and notes",
      description:
        "List drawings and/or notes, newest first. Filter by folder (use \"unfiled\" for items in no folder) or by title.",
      inputSchema: {
        kind: z.enum(["all", "drawing", "note"]).default("all"),
        folder_id: z.union([uuid, z.literal("unfiled")]).optional(),
        title_contains: z.string().max(200).optional(),
        limit: z.number().int().min(1).max(200).default(50),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ kind, folder_id, title_contains, limit }) => {
      const query = (table: "drawings" | "notes") => {
        let q = supabase
          .from(table)
          .select("id, title, folder_id, created_at, updated_at")
          .eq("owner_id", userId)
          .order("updated_at", { ascending: false })
          .limit(limit);
        if (folder_id === "unfiled") q = q.is("folder_id", null);
        else if (folder_id) q = q.eq("folder_id", folder_id);
        if (title_contains) q = q.ilike("title", `%${title_contains.replace(/[%_\\]/g, "\\$&")}%`);
        return q;
      };
      const [d, n] = await Promise.all([
        kind === "note" ? null : query("drawings"),
        kind === "drawing" ? null : query("notes"),
      ]);
      const err = d?.error ?? n?.error;
      if (err) return fail(err.message);
      const items = [
        ...(d?.data ?? []).map((r) => ({ kind: "drawing", ...r, url: drawingUrl(r.id) })),
        ...(n?.data ?? []).map((r) => ({ kind: "note", ...r, url: noteUrl(r.id) })),
      ]
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .slice(0, limit);
      return json({ items });
    },
  );

  server.registerTool(
    "search",
    {
      title: "Search drawings and notes",
      description:
        "Case-insensitive search over drawing titles, text written on drawings, note titles and note content.",
      inputSchema: {
        query: z.string().min(1).max(200),
        limit: z.number().int().min(1).max(100).default(20),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ query, limit }) => {
      const { data, error } = await supabase.rpc("search_items", {
        p_owner: userId,
        p_query: query,
        p_limit: limit,
      });
      if (error) return fail(error.message);
      return json({
        results: (data ?? []).map((r: { kind: string; id: string }) => ({
          ...r,
          url: r.kind === "drawing" ? drawingUrl(r.id) : noteUrl(r.id),
        })),
      });
    },
  );

  server.registerTool(
    "get_drawing",
    {
      title: "Read a drawing",
      description:
        "Read a drawing: a text summary of its shapes, labels, text and arrow connections (with element ids and " +
        "coordinates), plus its thumbnail image. Set include_elements to also get the raw Excalidraw elements.",
      inputSchema: {
        id: uuid,
        include_image: z.boolean().default(true),
        include_elements: z.boolean().default(false),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ id, include_image, include_elements }) => {
      const { data, error } = await supabase
        .from("drawings")
        .select("id, title, folder_id, scene, thumbnail, created_at, updated_at")
        .eq("id", id)
        .eq("owner_id", userId)
        .maybeSingle();
      if (error) return fail(error.message);
      if (!data) return fail(`No drawing with id ${id}.`);

      const header = [
        `# ${data.title}`,
        `id: ${data.id}`,
        `folder_id: ${data.folder_id ?? "(unfiled)"}`,
        `updated: ${data.updated_at}`,
        `url: ${drawingUrl(data.id)}`,
        "",
        summarizeScene(data.scene as Scene),
      ].join("\n");
      const result: ToolResult = { content: [{ type: "text", text: header }] };

      const m = include_image && data.thumbnail?.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
      if (m) result.content.push({ type: "image", mimeType: m[1], data: m[2] });
      else if (include_image)
        result.content.push({
          type: "text",
          text: "(No thumbnail yet — one is generated the next time the drawing is opened and edited in drawme.)",
        });

      if (include_elements) {
        result.content.push({
          type: "text",
          text: JSON.stringify(sceneWithoutFiles(data.scene as Scene)),
        });
      }
      return result;
    },
  );

  server.registerTool(
    "get_note",
    {
      title: "Read a note",
      description:
        "Read a Markdown note. Drawings embedded in it (![Title](drawing:<id>)) are listed so you can fetch them with get_drawing.",
      inputSchema: { id: uuid },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => {
      const { data, error } = await supabase
        .from("notes")
        .select("id, title, folder_id, content, created_at, updated_at")
        .eq("id", id)
        .eq("owner_id", userId)
        .maybeSingle();
      if (error) return fail(error.message);
      if (!data) return fail(`No note with id ${id}.`);
      const embeds = [...data.content.matchAll(/\]\(drawing:([0-9a-f-]{36})\)/g)].map((m) => m[1]);
      const wikiLinks = [...data.content.matchAll(/(!?)\[\[([^\]\n|]+)(?:\|[^\]\n]+)?\]\]/g)].map(
        (m) => ({ embed: m[1] === "!", title: m[2].trim() }),
      );
      return text(
        [
          `# ${data.title}`,
          `id: ${data.id}`,
          `folder_id: ${data.folder_id ?? "(unfiled)"}`,
          `updated: ${data.updated_at}`,
          `url: ${noteUrl(data.id)}`,
          embeds.length ? `embedded drawing ids: ${[...new Set(embeds)].join(", ")}` : null,
          wikiLinks.length
            ? `wiki links: ${wikiLinks.map((l) => `${l.embed ? "!" : ""}[[${l.title}]]`).join(", ")}`
            : null,
          "",
          "---",
          data.content,
        ]
          .filter((l) => l !== null)
          .join("\n"),
      );
    },
  );

  if (!canWrite) return server;

  // ----------------------------------------------------------------- write

  server.registerTool(
    "create_folder",
    {
      title: "Create a folder",
      description: "Create a folder for grouping drawings and notes.",
      inputSchema: { name: z.string().trim().min(1).max(100) },
    },
    async ({ name }) => {
      const { data, error } = await supabase
        .from("folders")
        .insert({ owner_id: userId, name })
        .select("id, name")
        .single();
      if (error) return fail(error.message);
      return json(data);
    },
  );

  server.registerTool(
    "create_note",
    {
      title: "Create a note",
      description:
        "Create a Markdown note. Embed a drawing with ![Title](drawing:<id>); link another note with [[Note title]].",
      inputSchema: {
        title: z.string().trim().min(1).max(200),
        content: z.string().max(500_000).default(""),
        folder_id: uuid.optional(),
      },
    },
    async ({ title, content, folder_id }) => {
      if (folder_id && !(await folderExists(folder_id))) return fail(`No folder with id ${folder_id}.`);
      const { data, error } = await supabase
        .from("notes")
        .insert({ owner_id: userId, title, content, folder_id: folder_id ?? null })
        .select("id, title, folder_id")
        .single();
      if (error) return fail(error.message);
      return json({ ...data, url: noteUrl(data.id) });
    },
  );

  server.registerTool(
    "update_note",
    {
      title: "Edit a note",
      description:
        "Change a note's title and/or content. mode 'replace' overwrites the content, 'append' adds to the end, " +
        "'prepend' adds to the start. Previous versions stay in the note's history.",
      inputSchema: {
        id: uuid,
        title: z.string().trim().min(1).max(200).optional(),
        content: z.string().max(500_000).optional(),
        mode: z.enum(["replace", "append", "prepend"]).default("append"),
      },
    },
    async ({ id, title, content, mode }) => {
      const { data: note, error } = await supabase
        .from("notes")
        .select("content")
        .eq("id", id)
        .eq("owner_id", userId)
        .maybeSingle();
      if (error) return fail(error.message);
      if (!note) return fail(`No note with id ${id}.`);

      const patch: { title?: string; content?: string } = {};
      if (title) patch.title = title;
      if (content !== undefined) {
        const sep = (a: string, b: string) => (a && b ? (a.endsWith("\n") ? "\n" : "\n\n") : "");
        patch.content =
          mode === "replace"
            ? content
            : mode === "append"
              ? note.content + sep(note.content, content) + content
              : content + sep(content, note.content) + note.content;
      }
      if (!Object.keys(patch).length) return fail("Nothing to update: pass title and/or content.");

      const { data, error: upErr } = await supabase
        .from("notes")
        .update(patch)
        .eq("id", id)
        .eq("owner_id", userId)
        .select("id, title, updated_at")
        .single();
      if (upErr) return fail(upErr.message);
      return json({ ...data, url: noteUrl(id) });
    },
  );

  const elementsInput = z
    .array(elementSpec)
    .min(1)
    .max(500)
    .describe(
      "Elements to draw. Shapes: {type:'rectangle'|'ellipse'|'diamond', id?, x, y, width?, height?, label?, " +
        "backgroundColor?, strokeColor?}. Text: {type:'text', x, y, text, fontSize?}. Arrows/lines: " +
        "{type:'arrow'|'line', from?: shapeId, to?: shapeId, label?} — or x,y,endX,endY for free arrows. " +
        "Coordinates are canvas pixels; y grows downward. Typical box: 160x80, spaced ~80px apart.",
    );

  server.registerTool(
    "create_drawing",
    {
      title: "Create a drawing",
      description:
        "Create a new Excalidraw drawing from a list of shapes, text and arrows (e.g. a diagram or flowchart). " +
        "Arrows connect to shapes by the ids you give the shapes, and stay attached when the user moves them.",
      inputSchema: {
        title: z.string().trim().min(1).max(200),
        folder_id: uuid.optional(),
        elements: elementsInput.optional(),
      },
    },
    async ({ title, folder_id, elements }) => {
      if (folder_id && !(await folderExists(folder_id))) return fail(`No folder with id ${folder_id}.`);
      let created: SceneElement[] = [];
      try {
        created = buildElements(elements ?? []).created;
      } catch (e) {
        return fail((e as Error).message);
      }
      const scene = { elements: created, appState: { viewBackgroundColor: "#ffffff" }, files: {} };
      const { data, error } = await supabase
        .from("drawings")
        .insert({ owner_id: userId, title, folder_id: folder_id ?? null, scene })
        .select("id, title, folder_id")
        .single();
      if (error) return fail(error.message);
      return json({ ...data, elements: created.length, url: drawingUrl(data.id) });
    },
  );

  server.registerTool(
    "add_to_drawing",
    {
      title: "Add to a drawing",
      description:
        "Add shapes, text and arrows to an existing drawing. Arrows may connect to new shapes (by your ids) or to " +
        "existing elements (by the Excalidraw ids shown in get_drawing). With placement 'auto' (default) the new " +
        "elements are moved to the right of the existing content, keeping their relative layout; use 'absolute' " +
        "to keep your coordinates (e.g. when placing next to specific existing shapes).",
      inputSchema: {
        id: uuid,
        elements: elementsInput,
        placement: z.enum(["auto", "absolute"]).default("auto"),
      },
    },
    async ({ id, elements, placement }) => {
      const { data, error } = await supabase
        .from("drawings")
        .select("scene")
        .eq("id", id)
        .eq("owner_id", userId)
        .maybeSingle();
      if (error) return fail(error.message);
      if (!data) return fail(`No drawing with id ${id}.`);

      const scene = (data.scene ?? {}) as Scene;
      const all = (Array.isArray(scene.elements) ? scene.elements : []) as SceneElement[];
      const live = all.filter((e) => !e.isDeleted);

      let specs: ElementSpec[] = elements;
      const bounds = sceneBounds(live);
      if (placement === "auto" && bounds) {
        const xs = specs.flatMap((s) => [s.x, "endX" in s ? s.endX : undefined]).filter((v): v is number => v != null);
        const ys = specs.flatMap((s) => [s.y, "endY" in s ? s.endY : undefined]).filter((v): v is number => v != null);
        const dx = xs.length ? bounds.maxX + 120 - Math.min(...xs) : 0;
        const dy = ys.length ? bounds.minY - Math.min(...ys) : 0;
        specs = specs.map((s) => ({
          ...s,
          ...(s.x != null ? { x: s.x + dx } : {}),
          ...(s.y != null ? { y: s.y + dy } : {}),
          ...("endX" in s && s.endX != null ? { endX: s.endX + dx } : {}),
          ...("endY" in s && s.endY != null ? { endY: s.endY + dy } : {}),
        })) as ElementSpec[];
      }

      let built;
      try {
        built = buildElements(specs, live);
      } catch (e) {
        return fail((e as Error).message);
      }
      for (const e of built.updatedExisting) {
        e.version = ((e.version as number) ?? 1) + 1;
        e.versionNonce = Math.floor(Math.random() * 2 ** 31);
        e.updated = Date.now();
      }

      const { error: upErr } = await supabase
        .from("drawings")
        .update({ scene: { ...scene, elements: [...live, ...built.created] } })
        .eq("id", id)
        .eq("owner_id", userId);
      if (upErr) return fail(upErr.message);
      return json({
        id,
        added: built.created.length,
        url: drawingUrl(id),
        note: "The thumbnail refreshes the next time the drawing is edited in drawme.",
      });
    },
  );

  server.registerTool(
    "rename_item",
    {
      title: "Rename a drawing, note or folder",
      inputSchema: {
        kind: z.enum(["drawing", "note", "folder"]),
        id: uuid,
        name: z.string().trim().min(1).max(200),
      },
      annotations: { idempotentHint: true },
    },
    async ({ kind, id, name }) => {
      const table = kind === "drawing" ? "drawings" : kind === "note" ? "notes" : "folders";
      const field = kind === "folder" ? "name" : "title";
      const { data, error } = await supabase
        .from(table)
        .update({ [field]: kind === "folder" ? name.slice(0, 100) : name })
        .eq("id", id)
        .eq("owner_id", userId)
        .select("id")
        .maybeSingle();
      if (error) return fail(error.message);
      if (!data) return fail(`No ${kind} with id ${id}.`);
      return text(`Renamed ${kind} ${id} to "${name}".`);
    },
  );

  server.registerTool(
    "move_item",
    {
      title: "Move a drawing or note to a folder",
      description: "Move a drawing or note into a folder, or out of all folders with folder_id null.",
      inputSchema: {
        kind: z.enum(["drawing", "note"]),
        id: uuid,
        folder_id: uuid.nullable(),
      },
      annotations: { idempotentHint: true },
    },
    async ({ kind, id, folder_id }) => {
      if (folder_id && !(await folderExists(folder_id))) return fail(`No folder with id ${folder_id}.`);
      const { data, error } = await supabase
        .from(kind === "drawing" ? "drawings" : "notes")
        .update({ folder_id })
        .eq("id", id)
        .eq("owner_id", userId)
        .select("id")
        .maybeSingle();
      if (error) return fail(error.message);
      if (!data) return fail(`No ${kind} with id ${id}.`);
      return text(`Moved ${kind} ${id} to ${folder_id ?? "Unfiled"}.`);
    },
  );

  return server;
}
