"use client";

import dynamic from "next/dynamic";

// Excalidraw touches window/document at import time, so it must never be
// server-rendered.
const ExcalidrawEditor = dynamic(() => import("./ExcalidrawEditor"), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen items-center justify-center text-zinc-400">
      Loading canvas…
    </div>
  ),
});

export type EditorShellProps = {
  drawingId: string;
  initialTitle: string;
  initialScene: {
    elements?: unknown[];
    appState?: Record<string, unknown>;
    files?: Record<string, unknown>;
  };
  initialLibraryItems: unknown[];
  userId: string;
};

export default function EditorShell(props: EditorShellProps) {
  return <ExcalidrawEditor {...props} />;
}
