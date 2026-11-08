import { randomUUID } from "node:crypto";
import { z } from "zod";

// Helpers for working with Excalidraw scenes on the server, where the
// Excalidraw package (browser-only) can't be imported:
//   - summarizeScene: turn a scene into text an LLM can reason about
//   - buildElements:  turn a small, LLM-friendly shape spec into real
//                     Excalidraw elements (shapes, labels, bound arrows)

type El = Record<string, unknown> & {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Scene = {
  elements?: unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
};

function liveElements(scene: Scene | null | undefined): El[] {
  const els = Array.isArray(scene?.elements) ? scene!.elements : [];
  return (els as El[]).filter((e) => e && typeof e === "object" && !e.isDeleted);
}

export function sceneBounds(elements: El[]) {
  if (elements.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const e of elements) {
    minX = Math.min(minX, e.x, e.x + e.width);
    minY = Math.min(minY, e.y, e.y + e.height);
    maxX = Math.max(maxX, e.x, e.x + e.width);
    maxY = Math.max(maxY, e.y, e.y + e.height);
  }
  return { minX, minY, maxX, maxY };
}

const r = (n: number) => Math.round(n);

/**
 * A compact, readable description of a drawing: the shapes with their labels,
 * free text, and which shapes arrows connect. Coordinates are included so a
 * model can place new elements relative to existing ones.
 */
export function summarizeScene(scene: Scene | null | undefined): string {
  const els = liveElements(scene);
  if (els.length === 0) return "The drawing is empty.";

  const byId = new Map(els.map((e) => [e.id, e]));
  const labelOf = (e: El | undefined): string | null => {
    if (!e) return null;
    if (e.type === "text") return String(e.text ?? "");
    const bound = (e.boundElements as { id: string; type: string }[] | null) ?? [];
    const t = bound.find((b) => b.type === "text");
    const textEl = t ? byId.get(t.id) : undefined;
    return textEl ? String(textEl.text ?? "") : null;
  };
  const name = (e: El | undefined) => {
    if (!e) return "?";
    const label = labelOf(e);
    return label ? `${e.type} "${label.replace(/\s+/g, " ")}"` : `${e.type} ${e.id}`;
  };

  const counts: Record<string, number> = {};
  for (const e of els) counts[e.type] = (counts[e.type] ?? 0) + 1;

  const shapes: string[] = [];
  const texts: string[] = [];
  const connections: string[] = [];
  const other: string[] = [];

  for (const e of els) {
    const pos = `at (${r(e.x)}, ${r(e.y)}) size ${r(e.width)}x${r(e.height)}`;
    if (e.type === "text") {
      if (e.containerId) continue; // reported as its container's label
      texts.push(`- [${e.id}] "${String(e.text ?? "").replace(/\n/g, "\\n")}" ${pos}`);
    } else if (e.type === "arrow" || e.type === "line") {
      const from = (e.startBinding as { elementId?: string } | null)?.elementId;
      const to = (e.endBinding as { elementId?: string } | null)?.elementId;
      const label = labelOf(e);
      if (from || to) {
        connections.push(
          `- [${e.id}] ${name(from ? byId.get(from) : undefined)} → ${name(to ? byId.get(to) : undefined)}` +
            (label ? ` (label "${label}")` : ""),
        );
      } else {
        other.push(`- [${e.id}] unattached ${e.type} ${pos}` + (label ? ` "${label}"` : ""));
      }
    } else if (["rectangle", "ellipse", "diamond", "frame", "magicframe"].includes(e.type)) {
      const label = labelOf(e) ?? (e.type.endsWith("frame") ? (e.name as string | null) : null);
      shapes.push(`- [${e.id}] ${e.type}${label ? ` "${label.replace(/\n/g, "\\n")}"` : ""} ${pos}`);
    } else {
      other.push(`- [${e.id}] ${e.type} ${pos}`);
    }
  }

  const b = sceneBounds(els)!;
  const parts = [
    `${els.length} elements (${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")}).`,
    `Bounding box: x ${r(b.minX)}..${r(b.maxX)}, y ${r(b.minY)}..${r(b.maxY)}.`,
  ];
  if (shapes.length) parts.push(`\nShapes:\n${shapes.join("\n")}`);
  if (connections.length) parts.push(`\nConnections:\n${connections.join("\n")}`);
  if (texts.length) parts.push(`\nText:\n${texts.join("\n")}`);
  if (other.length) {
    const max = 40;
    parts.push(
      `\nOther elements:\n${other.slice(0, max).join("\n")}` +
        (other.length > max ? `\n- ... and ${other.length - max} more` : ""),
    );
  }
  return parts.join("\n");
}

/** Scene without embedded image data (which can be megabytes of base64). */
export function sceneWithoutFiles(scene: Scene | null | undefined) {
  return {
    elements: liveElements(scene),
    appState: {
      viewBackgroundColor: scene?.appState?.viewBackgroundColor ?? "#ffffff",
    },
    fileIds: Object.keys(scene?.files ?? {}),
  };
}

// ---------------------------------------------------------------------------
// Element spec → Excalidraw elements
// ---------------------------------------------------------------------------

const color = z.string().max(32).optional();

const shapeSpec = z.object({
  type: z.enum(["rectangle", "ellipse", "diamond"]),
  id: z.string().max(64).optional().describe("Your own id, so arrows can refer to this shape"),
  x: z.number(),
  y: z.number(),
  width: z.number().positive().optional().describe("Default 160"),
  height: z.number().positive().optional().describe("Default 80"),
  label: z.string().max(2000).optional().describe("Text centred inside the shape"),
  strokeColor: color,
  backgroundColor: color.describe('e.g. "#a5d8ff", or "transparent"'),
  fillStyle: z.enum(["solid", "hachure", "cross-hatch"]).optional(),
  fontSize: z.number().positive().optional(),
});

const textSpec = z.object({
  type: z.literal("text"),
  id: z.string().max(64).optional(),
  x: z.number(),
  y: z.number(),
  text: z.string().min(1).max(5000),
  fontSize: z.number().positive().optional().describe("Default 20"),
  strokeColor: color,
});

const linearSpec = z.object({
  type: z.enum(["arrow", "line"]),
  id: z.string().max(64).optional(),
  from: z.string().optional().describe("id of the shape the arrow starts at"),
  to: z.string().optional().describe("id of the shape the arrow ends at"),
  x: z.number().optional().describe("Start point when not using from"),
  y: z.number().optional(),
  endX: z.number().optional().describe("End point when not using to"),
  endY: z.number().optional(),
  label: z.string().max(500).optional(),
  strokeColor: color,
  strokeStyle: z.enum(["solid", "dashed", "dotted"]).optional(),
});

export const elementSpec = z.discriminatedUnion("type", [shapeSpec, textSpec, linearSpec]);
export type ElementSpec = z.infer<typeof elementSpec>;
type LinearSpec = z.infer<typeof linearSpec>;

const isLinear = (s: ElementSpec): s is LinearSpec => s.type === "arrow" || s.type === "line";

function seed() {
  return Math.floor(Math.random() * 2 ** 31);
}

function base(type: string, x: number, y: number, width: number, height: number, extra: Record<string, unknown> = {}): El {
  return {
    id: randomUUID(),
    type,
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor: "#1e1e1e",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: seed(),
    version: 1,
    versionNonce: seed(),
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
    ...extra,
  };
}

const LINE_HEIGHT = 1.25;

function measure(text: string, fontSize: number) {
  const lines = text.split("\n");
  const longest = Math.max(...lines.map((l) => l.length), 1);
  return { width: longest * fontSize * 0.6, height: lines.length * fontSize * LINE_HEIGHT };
}

function textElement(text: string, x: number, y: number, fontSize: number, extra: Record<string, unknown> = {}) {
  const { width, height } = measure(text, fontSize);
  return base("text", x, y, width, height, {
    text,
    originalText: text,
    fontSize,
    fontFamily: 5, // Excalifont
    textAlign: "left",
    verticalAlign: "top",
    containerId: null,
    autoResize: true,
    lineHeight: LINE_HEIGHT,
    ...extra,
  });
}

/** Point where the ray from a shape's centre towards (tx, ty) leaves its box. */
function edgePoint(s: El, tx: number, ty: number) {
  const cx = s.x + s.width / 2;
  const cy = s.y + s.height / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const scale = 1 / Math.max(Math.abs(dx) / (s.width / 2), Math.abs(dy) / (s.height / 2));
  return { x: cx + dx * scale, y: cy + dy * scale };
}

function addBound(container: El, id: string, type: "text" | "arrow") {
  const list = ((container.boundElements as { id: string; type: string }[] | null) ?? []).slice();
  list.push({ id, type });
  container.boundElements = list;
}

/**
 * Build Excalidraw elements from specs. `existing` lets arrows connect to
 * shapes already in the drawing (by their Excalidraw id); those shapes are
 * returned in `updatedExisting` with the arrow binding added.
 */
export function buildElements(specs: ElementSpec[], existing: El[] = []) {
  const created: El[] = [];
  const shapes = new Map<string, El>();
  for (const e of existing) shapes.set(e.id, e);
  const touched = new Map<string, El>();

  // Shapes and text first so arrows can find them.
  for (const spec of specs) {
    if (spec.type === "text") {
      const t = textElement(spec.text, spec.x, spec.y, spec.fontSize ?? 20, {
        strokeColor: spec.strokeColor ?? "#1e1e1e",
      });
      if (spec.id) shapes.set(spec.id, t);
      created.push(t);
    } else if (!isLinear(spec)) {
      const width = spec.width ?? 160;
      const height = spec.height ?? 80;
      const shape = base(spec.type, spec.x, spec.y, width, height, {
        strokeColor: spec.strokeColor ?? "#1e1e1e",
        backgroundColor: spec.backgroundColor ?? "transparent",
        fillStyle: spec.fillStyle ?? "solid",
        roundness:
          spec.type === "rectangle" ? { type: 3 } : spec.type === "diamond" ? { type: 2 } : null,
      });
      created.push(shape);
      if (spec.id) shapes.set(spec.id, shape);
      if (spec.label) {
        const fontSize = spec.fontSize ?? 20;
        const m = measure(spec.label, fontSize);
        const label = textElement(
          spec.label,
          shape.x + (width - m.width) / 2,
          shape.y + (height - m.height) / 2,
          fontSize,
          {
            containerId: shape.id,
            textAlign: "center",
            verticalAlign: "middle",
            strokeColor: spec.strokeColor ?? "#1e1e1e",
          },
        );
        addBound(shape, label.id, "text");
        created.push(label);
      }
    }
  }

  for (const spec of specs) {
    if (!isLinear(spec)) continue;
    const from = spec.from ? shapes.get(spec.from) : undefined;
    const to = spec.to ? shapes.get(spec.to) : undefined;
    if (spec.from && !from) throw new Error(`Arrow "from" refers to unknown id "${spec.from}"`);
    if (spec.to && !to) throw new Error(`Arrow "to" refers to unknown id "${spec.to}"`);

    const center = (s: El) => ({ x: s.x + s.width / 2, y: s.y + s.height / 2 });
    let start = from ? center(from) : { x: spec.x ?? 0, y: spec.y ?? 0 };
    let end = to ? center(to) : { x: spec.endX ?? start.x + 150, y: spec.endY ?? start.y };
    if (from) start = edgePoint(from, end.x, end.y);
    if (to) end = edgePoint(to, start.x, start.y);
    // Leave a small gap so the arrowhead doesn't overlap the shape outline.
    const GAP = 6;
    const len = Math.hypot(end.x - start.x, end.y - start.y) || 1;
    const ux = (end.x - start.x) / len;
    const uy = (end.y - start.y) / len;
    if (from) start = { x: start.x + ux * GAP, y: start.y + uy * GAP };
    if (to) end = { x: end.x - ux * GAP, y: end.y - uy * GAP };

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const arrow = base(spec.type, start.x, start.y, Math.abs(dx), Math.abs(dy), {
      strokeColor: spec.strokeColor ?? "#1e1e1e",
      strokeStyle: spec.strokeStyle ?? "solid",
      roundness: { type: 2 },
      points: [[0, 0], [dx, dy]],
      lastCommittedPoint: null,
      startBinding: from ? { elementId: from.id, focus: 0, gap: GAP } : null,
      endBinding: to ? { elementId: to.id, focus: 0, gap: GAP } : null,
      startArrowhead: null,
      endArrowhead: spec.type === "arrow" ? "arrow" : null,
      elbowed: false,
    });
    created.push(arrow);
    if (spec.id) shapes.set(spec.id, arrow);

    for (const s of [from, to]) {
      if (!s) continue;
      addBound(s, arrow.id, "arrow");
      if (existing.includes(s)) touched.set(s.id, s);
    }

    if (spec.label) {
      const m = measure(spec.label, 16);
      const label = textElement(spec.label, start.x + dx / 2 - m.width / 2, start.y + dy / 2 - m.height / 2, 16, {
        containerId: arrow.id,
        textAlign: "center",
        verticalAlign: "middle",
        strokeColor: spec.strokeColor ?? "#1e1e1e",
      });
      addBound(arrow, label.id, "text");
      created.push(label);
    }
  }

  return { created, updatedExisting: [...touched.values()] };
}

/** Shift elements (all coordinates are absolute) by dx, dy. */
export function translate(elements: El[], dx: number, dy: number) {
  for (const e of elements) {
    e.x += dx;
    e.y += dy;
  }
}

export type { El as SceneElement };
