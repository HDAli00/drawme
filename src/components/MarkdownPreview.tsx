"use client";

import { memo, useMemo } from "react";
import Link from "next/link";
import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import DrawingEmbed from "./DrawingEmbed";
import {
  DRAWING_SCHEME,
  WIKI_EMBED_SCHEME,
  WIKI_SCHEME,
  resolveByTitle,
  rewriteWikiLinks,
} from "@/lib/noteLinks";
import type { LinkTarget } from "@/lib/types";

const OWN_SCHEMES = [DRAWING_SCHEME, WIKI_SCHEME, WIKI_EMBED_SCHEME];

function urlTransform(url: string) {
  return OWN_SCHEMES.some((s) => url.startsWith(s))
    ? url
    : defaultUrlTransform(url);
}

function decodeTarget(url: string, scheme: string) {
  try {
    return decodeURIComponent(url.slice(scheme.length));
  } catch {
    return url.slice(scheme.length);
  }
}

function MarkdownPreview({
  content,
  drawings,
  notes,
  folderId,
  onCreateNote,
}: {
  content: string;
  drawings: LinkTarget[];
  notes: LinkTarget[];
  folderId: string | null;
  onCreateNote: (title: string) => void;
}) {
  const components = useMemo<Components>(
    () => ({
      img({ src, alt }) {
        const url = typeof src === "string" ? src : "";
        if (url.startsWith(DRAWING_SCHEME)) {
          return (
            <DrawingEmbed
              drawingId={url.slice(DRAWING_SCHEME.length)}
              label={alt ?? "Drawing"}
            />
          );
        }
        if (url.startsWith(WIKI_EMBED_SCHEME)) {
          const title = decodeTarget(url, WIKI_EMBED_SCHEME);
          const drawing = resolveByTitle(title, drawings, folderId);
          return drawing ? (
            <DrawingEmbed drawingId={drawing.id} label={drawing.title} />
          ) : (
            <span className="my-3 block rounded-lg border border-dashed border-red-200 bg-red-50 px-3 py-4 text-center text-sm text-red-600">
              No drawing called “{title}”
            </span>
          );
        }
        // eslint-disable-next-line @next/next/no-img-element
        return <img src={url} alt={alt ?? ""} />;
      },
      a({ href, children }) {
        const url = href ?? "";
        if (url.startsWith(WIKI_SCHEME)) {
          const title = decodeTarget(url, WIKI_SCHEME);
          const note = resolveByTitle(title, notes, folderId);
          if (note) {
            return (
              <Link href={`/notes/${note.id}`} className="wikilink">
                {children}
              </Link>
            );
          }
          const drawing = resolveByTitle(title, drawings, folderId);
          if (drawing) {
            return (
              <Link href={`/draw/${drawing.id}`} className="wikilink">
                ✏️ {children}
              </Link>
            );
          }
          // Like Obsidian: a link to a missing note creates it.
          return (
            <button
              type="button"
              onClick={() => onCreateNote(title)}
              title={`Create note “${title}”`}
              className="wikilink wikilink-missing"
            >
              {children}
            </button>
          );
        }
        if (url.startsWith(DRAWING_SCHEME)) {
          return (
            <Link href={`/draw/${url.slice(DRAWING_SCHEME.length)}`}>
              {children}
            </Link>
          );
        }
        return (
          <a href={url} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        );
      },
    }),
    [drawings, notes, folderId, onCreateNote],
  );

  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={urlTransform}
        components={components}
      >
        {rewriteWikiLinks(content)}
      </ReactMarkdown>
    </div>
  );
}

export default memo(MarkdownPreview);
