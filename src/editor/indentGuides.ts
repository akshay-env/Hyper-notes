// Vertical indent guides on nested list lines (Obsidian's list guides). Each
// indented list-context line gets a line decoration carrying its indent depth;
// CSS paints one hairline per level via a repeating gradient sized by the
// measured space width (the editor font is proportional, so it's measured, not
// assumed).
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";

const INDENT_CHARS = 2; // markdown list nesting unit (tab counts as one unit)

const indentOf = (text: string): number => /^[\t ]*/.exec(text)![0].replace(/\t/g, "  ").length;
const isListLine = (text: string): boolean => /^[\t ]*([-*+]|\d+[.)])\s/.test(text);

// Width of one indent unit in px, measured from the editor's actual font.
function measureUnit(view: EditorView): number {
  const font = getComputedStyle(view.contentDOM).font;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  ctx.font = font;
  return ctx.measureText(" ".repeat(INDENT_CHARS)).width;
}

function buildGuides(view: EditorView, unitPx: number): DecorationSet {
  const doc = view.state.doc;
  const decos = [];
  for (const { from, to } of view.visibleRanges) {
    let n = doc.lineAt(from).number;
    const endLine = doc.lineAt(to).number;
    let inList = false;
    let prevIndent = 0;
    for (; n <= endLine; n++) {
      const text = doc.line(n).text;
      if (text.trim() === "") {
        inList = false;
        continue;
      }
      const list = isListLine(text);
      const indent = indentOf(text);
      // A line belongs to the list context if it's a list line, or an indented
      // continuation under one.
      const inContext = list || (inList && indent > prevIndent);
      if (list) {
        inList = true;
        prevIndent = indent;
      } else if (!inContext) {
        inList = false;
      }
      if (!inContext) continue;
      const levels = Math.floor(indent / INDENT_CHARS);
      if (levels < 1) continue;
      decos.push(
        Decoration.line({
          class: "cm-list-guides",
          attributes: { style: `--guide-w:${(levels * unitPx).toFixed(2)}px;--guide-unit:${unitPx.toFixed(2)}px` },
        }).range(doc.line(n).from),
      );
    }
  }
  return Decoration.set(decos, true);
}

export const indentGuides = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    unitPx: number;
    constructor(view: EditorView) {
      this.unitPx = measureUnit(view);
      this.decorations = buildGuides(view, this.unitPx);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) {
        this.decorations = buildGuides(u.view, this.unitPx);
      }
    }
  },
  { decorations: (v) => v.decorations },
);
