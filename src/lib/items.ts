// Drawings and notes shown together in the workspace.
export type GridItem =
  | {
      kind: "drawing";
      id: string;
      title: string;
      thumbnail: string | null;
      updated_at: string;
      folder_id: string | null;
    }
  | {
      kind: "note";
      id: string;
      title: string;
      content: string;
      cover_image: string | null;
      updated_at: string;
      folder_id: string | null;
    };

export const keyOf = (item: { kind: string; id: string }) =>
  `${item.kind}:${item.id}`;

export const hrefOf = (item: { kind: string; id: string }) =>
  item.kind === "note" ? `/notes/${item.id}` : `/draw/${item.id}`;

export function splitKeys(keys: Iterable<string>) {
  const drawingIds: string[] = [];
  const noteIds: string[] = [];
  for (const key of keys) {
    const [kind, id] = key.split(":");
    (kind === "note" ? noteIds : drawingIds).push(id);
  }
  return { drawingIds, noteIds };
}

// MIME type carried by a drag of workspace items (value: JSON list of keys).
export const ITEM_DRAG_TYPE = "application/x-drawme-items";

// The folder with no row in the database: items whose folder_id is null.
export const GENERAL = "general";
export const GENERAL_LABEL = "General";
