// Dependency-free helpers for .excalidrawlib data. Library files come in two
// versions: v1 ({ library: Element[][] }) and v2 ({ libraryItems: LibraryItem[] }).

export type RawLibraryItem = {
  id: string;
  status: "published" | "unpublished";
  elements: unknown[];
  created: number;
  name?: string;
};

function randomId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function toLibraryItems(data: unknown): RawLibraryItem[] {
  if (!data || typeof data !== "object") return [];
  const obj = data as Record<string, unknown>;
  const raw = (obj.libraryItems ?? obj.library ?? []) as unknown[];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item): RawLibraryItem | null => {
      if (Array.isArray(item)) {
        // v1: bare array of elements
        return {
          id: randomId(),
          status: "unpublished",
          elements: item,
          created: Date.now(),
        };
      }
      if (item && typeof item === "object") {
        const it = item as Record<string, unknown>;
        return {
          id: typeof it.id === "string" ? it.id : randomId(),
          status: it.status === "published" ? "published" : "unpublished",
          elements: Array.isArray(it.elements) ? it.elements : [],
          created: typeof it.created === "number" ? it.created : Date.now(),
          ...(typeof it.name === "string" ? { name: it.name } : {}),
        };
      }
      return null;
    })
    .filter((x): x is RawLibraryItem => x !== null && x.elements.length > 0);
}

export function countLibraryItems(data: unknown): number {
  return toLibraryItems(data).length;
}

/** Merge two item lists, deduplicating by item id. */
export function mergeItems(
  existing: RawLibraryItem[],
  incoming: RawLibraryItem[],
): RawLibraryItem[] {
  const seen = new Set(existing.map((i) => i.id));
  return [...existing, ...incoming.filter((i) => !seen.has(i.id))];
}
