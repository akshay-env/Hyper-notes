// Clicking a rendered checkbox should toggle it, not drop the caret into the
// "[ ]" source. The live-preview renders task markers as widgets (.cm-task for
// GFM [ ]/[x], .cm-task-alt for [/]/[-]…); this handler intercepts the mousedown,
// flips the char inside the brackets, and lets the decoration rebuild the box.
import { EditorView } from "@codemirror/view";

export const taskInteractions = EditorView.domEventHandlers({
  mousedown(e, view) {
    const target = e.target as HTMLElement | null;
    const box = target?.closest?.(".cm-task, .cm-task-alt") as HTMLElement | null;
    if (!box) return false;
    e.preventDefault(); // don't place the caret / reveal the line
    const pos = view.posAtDOM(box);
    const line = view.state.doc.lineAt(pos);
    const m = /^(\s*[-*+]\s+)\[(.)\]/.exec(line.text);
    if (!m) return false;
    const at = line.from + m[1].length + 1; // the char between the brackets
    const next = m[2] === " " ? "x" : " "; // done ⇄ not-done (also clears /,-,…)
    view.dispatch({ changes: { from: at, to: at + 1, insert: next } });
    return true;
  },
});
