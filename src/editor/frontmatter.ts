// Hides a leading YAML frontmatter block (--- … ---) in the live preview, the
// way the Qt LivePreviewEditor drops frontmatter rows. Each frontmatter line
// gets a line decoration that collapses it (display:none via .cm-frontmatter-
// line) — unless the cursor is inside the block, in which case it's shown raw so
// it can be edited.
import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";

const lineDeco = Decoration.line({ class: "cm-frontmatter-line" });

// [firstLine, lastLine] (1-based) of a leading `---`…`---` block, or null.
function frontmatterLines(doc: EditorView["state"]["doc"]): [number, number] | null {
  if (doc.lines < 2) return null;
  if (doc.line(1).text.trim() !== "---") return null;
  for (let n = 2; n <= doc.lines; n++) {
    if (doc.line(n).text.trim() === "---") return [1, n];
  }
  return null;
}

function build(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const range = frontmatterLines(view.state.doc);
  if (!range) return builder.finish();

  // Reveal (edit) the block only while it's focused with the cursor inside — so
  // an unfocused editor (e.g. on load, cursor at pos 0) keeps it collapsed.
  const from = view.state.doc.line(range[0]).from;
  const to = view.state.doc.line(range[1]).to;
  const head = view.state.selection.main.head;
  if (view.hasFocus && head >= from && head <= to) return builder.finish();

  for (let n = range[0]; n <= range[1]; n++) {
    const line = view.state.doc.line(n);
    builder.add(line.from, line.from, lineDeco);
  }
  return builder.finish();
}

export const frontmatterHiding = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet || u.viewportChanged || u.focusChanged)
        this.decorations = build(u.view);
    }
  },
  { decorations: (v) => v.decorations },
);
