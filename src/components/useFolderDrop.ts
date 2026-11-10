"use client";

import { useState, useTransition } from "react";
import { moveItems } from "@/app/dashboard/actions";
import { ITEM_DRAG_TYPE, splitKeys } from "@/lib/items";

// Makes an element a drop target for workspace items dragged from a grid.
// folderId null is the General folder.
export function useFolderDrop(folderId: string | null) {
  const [over, setOver] = useState(false);
  const [pending, startTransition] = useTransition();

  const accepts = (e: React.DragEvent) =>
    e.dataTransfer.types.includes(ITEM_DRAG_TYPE);

  const dropProps = {
    onDragEnter(e: React.DragEvent) {
      if (!accepts(e)) return;
      e.preventDefault();
      setOver(true);
    },
    onDragOver(e: React.DragEvent) {
      if (!accepts(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setOver(true);
    },
    onDragLeave(e: React.DragEvent) {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
    },
    onDrop(e: React.DragEvent) {
      if (!accepts(e)) return;
      e.preventDefault();
      setOver(false);
      let keys: string[] = [];
      try {
        keys = JSON.parse(e.dataTransfer.getData(ITEM_DRAG_TYPE));
      } catch {
        return;
      }
      const { drawingIds, noteIds } = splitKeys(keys);
      if (!drawingIds.length && !noteIds.length) return;
      startTransition(() => moveItems(drawingIds, noteIds, folderId));
    },
  };

  return { over, pending, dropProps };
}
