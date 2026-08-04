// Document ranges for the two note-link forms, resolved from a position through
// the syntax tree. Shared by the right-click menu (components/editor/
// EditorContextMenu — which needs the range to open a menu over it) and the
// click handler (editor/wikilinkInteractions — which needs it to REWRITE the
// link). Both must agree byte-for-byte about where a link starts and ends: the
// menu's "Add note" splices a target into the range it captured, and the click
// handler replaces the range wholesale, so a one-character disagreement between
// two copies of this walk would corrupt a note.
import type { EditorView } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import {
  idLinkTargets,
  noteLinkParts,
  splitRawSegments,
  unescapeSegment,
  slotFor,
} from "../graph/wikilinkParse";

// The [[ … ]] range covering document position `pos`, or null. Walks up the
// syntax tree from either side of `pos` so a click anywhere on the link (chip or
// raw) finds the whole Wikilink node — which, in the compound form, includes
// its hidden (id:…) parenthetical (the parser consumes it into the node).
export function wikilinkRangeAt(
  view: EditorView,
  pos: number,
): { from: number; to: number } | null {
  const tree = syntaxTree(view.state);
  for (const side of [1, -1] as const) {
    let node: ReturnType<typeof tree.resolveInner> | null = tree.resolveInner(pos, side);
    while (node) {
      if (node.name === "Wikilink") return { from: node.from, to: node.to };
      node = node.parent;
    }
  }
  return null;
}

// The fully parsed note link covering `pos`: its range, its RAW segments (with
// escapes, for byte-faithful rewrites), its unescaped/trimmed segment titles,
// and its slot list (segment i resolves by slots[i] when real, by title
// otherwise; all-null for the bare typed form). One walk + one parse, shared by
// the click handler, the hover card and the right-click menu so all three
// agree byte-for-byte about what the link at a position IS.
export interface NoteLinkAt {
  from: number;
  to: number;
  rawSegments: string[];
  segments: string[]; // unescaped + trimmed, aligned with rawSegments
  slots: (string | null)[]; // aligned with segments (padded with null)
}

export function noteLinkAt(view: EditorView, pos: number): NoteLinkAt | null {
  const range = wikilinkRangeAt(view, pos);
  if (!range) return null;
  const parts = noteLinkParts(view.state.sliceDoc(range.from, range.to));
  if (!parts) return null;
  const raw = splitRawSegments(parts.inner);
  return {
    from: range.from,
    to: range.to,
    rawSegments: raw.map((s) => s.raw),
    segments: raw.map((s) => unescapeSegment(s.raw).trim()),
    slots: raw.map((_, i) => slotFor(parts.slots, i)),
  };
}

// The [display](id:XYZ) range covering `pos`, plus every id it targets. A
// sibling of wikilinkRangeAt rather than a branch inside it, so the wikilink walk
// keeps resolving exactly as it always did (the two forms can be adjacent, and
// which one a boundary position belongs to must not change).
//
// An id link is a PLAIN markdown Link node — nothing about the tree marks it as
// a note reference — which is why the old wikilink-only walk missed it entirely
// and the menu fell through to the "text selection" branch, found an empty
// selection, and opened nothing at all. The destination is read through the
// grammar's own idLinkTargets (graph/wikilinkParse) so the menu and the renderer
// can never disagree about what counts as an id link.
//
// `ids` is the full destination list (id:AAA,BBB → ["AAA","BBB"]) and `id` is
// ids[0] — the target a plain left-click opens. The redundant `id` is kept
// deliberately: every existing call site asks only that question, and widening
// the shape without breaking them is the whole point of returning both.
export function idLinkRangeAt(
  view: EditorView,
  pos: number,
): { from: number; to: number; id: string; ids: string[] } | null {
  const tree = syntaxTree(view.state);
  for (const side of [1, -1] as const) {
    let node: ReturnType<typeof tree.resolveInner> | null = tree.resolveInner(pos, side);
    while (node) {
      if (node.name === "Link") {
        const ids = idLinkTargets(view.state.sliceDoc(node.from, node.to));
        if (ids.length) return { from: node.from, to: node.to, id: ids[0], ids };
      }
      node = node.parent;
    }
  }
  return null;
}
