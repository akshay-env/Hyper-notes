// Self-contained in-note find for the editor. CM6's own @codemirror/search only
// paints .cm-searchMatch while its panel is open (index.js: `if (!panel) return
// Decoration.none`), and we drive a custom NoteSearchBar with no panel — so we
// own the highlighting here: a StateField holds the term, a ViewPlugin marks
// every match in the viewport, and the match at the current selection gets the
// -selected class. Navigation/counting live in state/editor.ts via matchPositions.
import { StateEffect, StateField, RangeSetBuilder, type EditorState } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";

export const setSearchTerm = StateEffect.define<string>();

export const searchTermField = StateField.define<string>({
  create: () => "",
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setSearchTerm)) value = e.value;
    return value;
  },
});

const matchMark = Decoration.mark({ class: "cm-searchMatch" });
const selectedMark = Decoration.mark({ class: "cm-searchMatch cm-searchMatch-selected" });

function buildHighlights(view: EditorView): DecorationSet {
  const term = view.state.field(searchTermField);
  const builder = new RangeSetBuilder<Decoration>();
  if (!term) return builder.finish();
  const needle = term.toLowerCase();
  const sel = view.state.selection.main;
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to).toLowerCase();
    let i = text.indexOf(needle);
    while (i !== -1) {
      const start = from + i;
      const end = start + needle.length;
      const isSelected = sel.from === start && sel.to === end;
      builder.add(start, end, isSelected ? selectedMark : matchMark);
      i = text.indexOf(needle, i + needle.length);
    }
  }
  return builder.finish();
}

const searchHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildHighlights(view);
    }
    update(u: ViewUpdate) {
      if (
        u.docChanged ||
        u.viewportChanged ||
        u.selectionSet ||
        u.transactions.some((t) => t.effects.some((e) => e.is(setSearchTerm)))
      ) {
        this.decorations = buildHighlights(u.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

export const noteSearchExtension = [searchTermField, searchHighlighter];

// Offsets of every (non-overlapping, case-insensitive) match across the whole
// document — the source of truth for the "n / total" counter and navigation.
export function matchPositions(state: EditorState, term: string): number[] {
  const res: number[] = [];
  if (!term) return res;
  const hay = state.doc.toString().toLowerCase();
  const needle = term.toLowerCase();
  let i = hay.indexOf(needle);
  while (i !== -1) {
    res.push(i);
    i = hay.indexOf(needle, i + needle.length);
  }
  return res;
}
