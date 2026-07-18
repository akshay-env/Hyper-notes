// Heading + list folding, Obsidian-style: a chevron floats in the left margin
// of a foldable line (visible on hover), clicking it collapses the section /
// sub-list into a "…" placeholder. Built on CM6's fold state (foldEffect /
// unfoldEffect / foldedRanges), so folds map correctly through edits.
import {
  ensureSyntaxTree,
  syntaxTree,
  codeFolding,
  foldEffect,
  unfoldEffect,
  foldedRanges,
} from "@codemirror/language";
import { type EditorState, type Text } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";

// ── Fold range computation ────────────────────────────────────────────────────
// Heading: folds to the line before the next heading of the same or higher
// level (or doc end). List item: folds its more-indented continuation lines.
function headingFoldRange(state: EditorState, lineNo: number): { from: number; to: number } | null {
  const doc = state.doc;
  const line = doc.line(lineNo);
  const m = /^(#{1,6})\s/.exec(line.text);
  if (!m) return null;
  const level = m[1].length;
  let end = doc.lines;
  for (let n = lineNo + 1; n <= doc.lines; n++) {
    const t = doc.line(n).text;
    const h = /^(#{1,6})\s/.exec(t);
    if (h && h[1].length <= level) {
      end = n - 1;
      break;
    }
  }
  if (end <= lineNo) return null;
  // Trim trailing blank lines out of the fold so the placeholder sits tight.
  while (end > lineNo && doc.line(end).text.trim() === "") end--;
  if (end <= lineNo) return null;
  return { from: line.to, to: doc.line(end).to };
}

const indentOf = (text: string): number => /^[\t ]*/.exec(text)![0].replace(/\t/g, "  ").length;
const isListLine = (text: string): boolean => /^[\t ]*([-*+]|\d+[.)])\s/.test(text);

function listFoldRange(state: EditorState, lineNo: number): { from: number; to: number } | null {
  const doc = state.doc;
  const line = doc.line(lineNo);
  if (!isListLine(line.text)) return null;
  const indent = indentOf(line.text);
  let end = lineNo;
  for (let n = lineNo + 1; n <= doc.lines; n++) {
    const t = doc.line(n).text;
    if (t.trim() === "") break; // blank line ends the item
    if (indentOf(t) <= indent) break;
    end = n;
  }
  if (end <= lineNo) return null;
  return { from: line.to, to: doc.line(end).to };
}

export function foldRangeForLine(state: EditorState, lineNo: number): { from: number; to: number } | null {
  return headingFoldRange(state, lineNo) ?? listFoldRange(state, lineNo);
}

function foldedAtLineEnd(state: EditorState, lineEnd: number): { from: number; to: number } | null {
  let found: { from: number; to: number } | null = null;
  foldedRanges(state).between(lineEnd, lineEnd, (from, to) => {
    if (from === lineEnd) {
      found = { from, to };
      return false;
    }
    return undefined;
  });
  return found;
}

// ── Chevron widgets ───────────────────────────────────────────────────────────
const CHEVRON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';

class FoldHandleWidget extends WidgetType {
  constructor(readonly folded: boolean) {
    super();
  }
  eq(o: FoldHandleWidget) {
    return o.folded === this.folded;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = "cm-fold-handle" + (this.folded ? " cm-fold-handle--folded" : "");
    el.innerHTML = CHEVRON;
    el.title = this.folded ? "Expand" : "Collapse";
    return el;
  }
  ignoreEvent() {
    return false; // clicks reach the mousedown handler below
  }
}

// ── Plugin: place a handle at the start of every foldable line ────────────────
function buildHandles(view: EditorView): DecorationSet {
  const state = view.state;
  const doc: Text = state.doc;
  ensureSyntaxTree(state, doc.length, 100) ?? syntaxTree(state);
  const decos = [];
  for (const { from, to } of view.visibleRanges) {
    let n = doc.lineAt(from).number;
    const endLine = doc.lineAt(to).number;
    for (; n <= endLine; n++) {
      const line = doc.line(n);
      const range = foldRangeForLine(state, n);
      if (!range) continue;
      const folded = foldedAtLineEnd(state, line.to) !== null;
      // side -1 keeps the handle before any live-preview decorations at the
      // same position (hidden "## " markers etc.).
      decos.push(Decoration.widget({ widget: new FoldHandleWidget(folded), side: -1 }).range(line.from));
    }
  }
  return Decoration.set(decos, true);
}

const foldHandles = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildHandles(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || u.transactions.some((t) => t.effects.length > 0)) {
        this.decorations = buildHandles(u.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

// Click on a chevron toggles the fold for its line.
const foldClicks = EditorView.domEventHandlers({
  mousedown(e, view) {
    const t = e.target as HTMLElement | null;
    const handle = t?.closest?.(".cm-fold-handle");
    if (!handle) return false;
    e.preventDefault();
    const pos = view.posAtDOM(handle);
    const line = view.state.doc.lineAt(pos);
    const existing = foldedAtLineEnd(view.state, line.to);
    if (existing) {
      view.dispatch({ effects: unfoldEffect.of(existing) });
    } else {
      const range = foldRangeForLine(view.state, line.number);
      if (range) view.dispatch({ effects: foldEffect.of(range) });
    }
    return true;
  },
});

// codeFolding() installs the fold state field + the "…" placeholder rendering.
export const foldingExtension = [codeFolding({ placeholderText: "…" }), foldHandles, foldClicks];
