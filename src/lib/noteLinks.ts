import type { LinkTarget } from "./types";

// Link syntax supported in notes:
//   ![Title](drawing:<id>)  embed a drawing by id (what "Insert drawing" adds;
//                           survives renaming the drawing)
//   ![[Drawing title]]      embed a drawing by title
//   [[Title]]               link to a note (or drawing) by title
//   [[Title|label]]         same, shown as "label"
// Wiki links are rewritten into ordinary Markdown links with custom schemes
// before rendering, so the Markdown renderer can handle them.

export const DRAWING_SCHEME = "drawing:";
export const WIKI_SCHEME = "wiki:";
export const WIKI_EMBED_SCHEME = "wiki-embed:";

const WIKI_LINK = /(!?)\[\[([^\]\n|]+)(?:\|([^\]\n]+))?\]\]/g;

function escapeLabel(text: string) {
  return text.replace(/[\[\]\\]/g, "\\$&");
}

export function rewriteWikiLinks(markdown: string): string {
  // Leave fenced code blocks untouched.
  return markdown
    .split(/(^```[\s\S]*?^```)/m)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part.replace(WIKI_LINK, (_m, bang: string, target: string, alias?: string) => {
            const name = target.trim();
            const label = escapeLabel((alias ?? name).trim());
            const scheme = bang ? WIKI_EMBED_SCHEME : WIKI_SCHEME;
            return `${bang}[${label}](${scheme}${encodeURIComponent(name)})`;
          }),
    )
    .join("");
}

// Titles aren't unique, so prefer a match in the note's own folder, then the
// most recently edited one.
export function resolveByTitle(
  title: string,
  targets: LinkTarget[],
  folderId: string | null,
): LinkTarget | null {
  const wanted = title.trim().toLowerCase();
  const matches = targets.filter((t) => t.title.trim().toLowerCase() === wanted);
  if (matches.length === 0) return null;
  return [...matches].sort((a, b) => {
    const af = a.folder_id === folderId ? 0 : 1;
    const bf = b.folder_id === folderId ? 0 : 1;
    if (af !== bf) return af - bf;
    return b.updated_at.localeCompare(a.updated_at);
  })[0];
}

export function drawingEmbedMarkdown(drawing: { id: string; title: string }) {
  return `![${escapeLabel(drawing.title)}](${DRAWING_SCHEME}${drawing.id})`;
}
