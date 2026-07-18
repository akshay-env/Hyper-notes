// Typing "[" or "]" with text selected wraps that text in a wikilink instead of
// replacing it — the fast way to turn a phrase into [[a link]]. A second "[" on
// an already-wrapped selection is a no-op (it's already a link).
//
// After wrapping, the selection is kept on the inner text so you can keep typing
// or hit "[" again without the caret jumping.
import { EditorSelection, type ChangeSpec } from "@codemirror/state";
import type { KeyBinding } from "@codemirror/view";

// Wrap every non-empty selection range in [[…]]. Returns false (letting the key
// insert normally) when nothing is selected.
function wrapSelectionInWikilink(view: {
  state: import("@codemirror/state").EditorState;
  dispatch: (tr: import("@codemirror/state").TransactionSpec) => void;
}): boolean {
  const { state } = view;
  if (state.selection.ranges.every((r) => r.empty)) return false;

  // Already-a-link guard, both ways round: the selection may contain the
  // brackets ("[[Note]]" selected), or — because wrapping leaves the INNER text
  // selected — sit right inside them. Pressing "[" again must not double-wrap.
  const alreadyLinked = (range: { from: number; to: number }): boolean => {
    const text = state.sliceDoc(range.from, range.to);
    if (/^\[\[[\s\S]*\]\]$/.test(text)) return true;
    const before = state.sliceDoc(Math.max(0, range.from - 2), range.from);
    const after = state.sliceDoc(range.to, Math.min(state.doc.length, range.to + 2));
    return before === "[[" && after === "]]";
  };
  if (state.selection.ranges.some((r) => !r.empty && alreadyLinked(r))) return true;

  const changes: ChangeSpec[] = [];
  for (const range of state.selection.ranges) {
    if (range.empty) continue;
    changes.push({ from: range.from, insert: "[[" }, { from: range.to, insert: "]]" });
  }
  if (!changes.length) return false;

  view.dispatch({
    changes,
    // Each range shifts by 2 per preceding "[[" inserted; keep the inner text selected.
    selection: EditorSelection.create(
      state.selection.ranges.map((r, i) => EditorSelection.range(r.from + 2 + i * 4, r.to + 2 + i * 4)),
      state.selection.mainIndex,
    ),
    scrollIntoView: true,
    userEvent: "input.wikilink",
  });
  return true;
}

// Bound to both brackets so either key does the same thing on a selection. With
// no selection they fall through to the default insert.
export const linkShortcutKeymap: KeyBinding[] = [
  { key: "[", run: wrapSelectionInWikilink },
  { key: "]", run: wrapSelectionInWikilink },
];
