// Bridges the CM6 editor instance to the rest of the UI (Outline reads its doc
// and scrolls it; NoteSearchBar drives find). The Qt Outline used
// editorRef.editorText + scrollToLine; this is the web equivalent — the mounted
// EditorView is published as a signal.
import { createSignal } from "solid-js";
import { EditorView } from "@codemirror/view";
import { setSearchTerm, matchPositions } from "../editor/noteSearch";
import { applyEditorMode, type EditorMode } from "../editor/createEditorState";
import { saveDoc, readDoc, docExists } from "./documents";
import { vaultRoot } from "./session";
import { writeNoteFs } from "../backend/vaultApi";

export const [editorView, setEditorView] = createSignal<EditorView | null>(null);

// ── Editing mode (Obsidian's Source / Live Preview / Reading) ─────────────────
export const [editorMode, setEditorModeRaw] = createSignal<EditorMode>("live");
export function setEditorMode(mode: EditorMode): void {
  setEditorModeRaw(mode);
  const view = editorView();
  if (view) applyEditorMode(view, mode);
}
const MODE_CYCLE: EditorMode[] = ["live", "source", "reading"];
export function cycleEditorMode(): void {
  const cur = MODE_CYCLE.indexOf(editorMode());
  setEditorMode(MODE_CYCLE[(cur + 1) % MODE_CYCLE.length]);
}

// The live text of the note currently in the editor. Updated on every edit and
// on every note swap, so the Outline + StatusBar reflect exactly what is shown
// (the EditorView reference is stable across setState, so we can't track it).
export const [editorDoc, setEditorDoc] = createSignal("");

// The vault path the editor currently holds (set by the Editor on each load).
// flushEditor() persists the live buffer to it — called before a rename/delete
// so in-flight edits are saved to the right note first.
let loadedPath = "";
export function setLoadedPath(path: string): void {
  loadedPath = path;
}
export function flushEditor(): void {
  const view = editorView();
  if (!view || !loadedPath) return;
  const text = view.state.doc.toString();
  saveDoc(loadedPath, text); // in-memory (UI truth)
  const root = vaultRoot();
  if (root) writeNoteFs(root, loadedPath, text).catch((e) => console.error("save note:", e));
}

// Re-sync the editor to the store's copy of the open note when it changed
// underneath us (e.g. a rename rewrote its [[links]]). No-op when the loaded
// note was itself moved (its key is gone — the Editor reloads via the path swap)
// or when nothing changed. The caret is clamped to the new length.
export function reloadEditorDoc(): void {
  const view = editorView();
  if (!view || !loadedPath || !docExists(loadedPath)) return;
  const text = readDoc(loadedPath);
  if (text === view.state.doc.toString()) return;
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: text },
    selection: { anchor: Math.min(view.state.selection.main.head, text.length) },
  });
}

// ── In-note find (NoteSearchBar.qml searchRun/Next/Prev/Clear + count/current) ─
export const [searchCount, setSearchCount] = createSignal(0);
export const [searchCurrent, setSearchCurrent] = createSignal(0);
let currentTerm = "";

// Select the idx-th match (length `len`) and scroll it into view.
function selectMatch(view: EditorView, positions: number[], idx: number, len: number) {
  const start = positions[idx];
  view.dispatch({
    selection: { anchor: start, head: start + len },
    effects: EditorView.scrollIntoView(start, { y: "center" }),
  });
  setSearchCount(positions.length);
  setSearchCurrent(idx);
}

export function runNoteSearch(term: string) {
  const view = editorView();
  if (!view) return;
  currentTerm = term;
  if (term.trim() === "") {
    clearNoteSearch();
    return;
  }
  view.dispatch({ effects: setSearchTerm.of(term) });
  const positions = matchPositions(view.state, term);
  if (positions.length === 0) {
    setSearchCount(0);
    setSearchCurrent(0);
    return;
  }
  // First match at or after the cursor.
  const from = view.state.selection.main.from;
  let idx = positions.findIndex((p) => p >= from);
  if (idx < 0) idx = 0;
  selectMatch(view, positions, idx, term.length);
}

export function noteSearchNext() {
  const view = editorView();
  if (!view || !currentTerm) return;
  const positions = matchPositions(view.state, currentTerm);
  if (positions.length === 0) return;
  const from = view.state.selection.main.from;
  let idx = positions.findIndex((p) => p > from);
  if (idx < 0) idx = 0; // wrap to first
  selectMatch(view, positions, idx, currentTerm.length);
}

export function noteSearchPrev() {
  const view = editorView();
  if (!view || !currentTerm) return;
  const positions = matchPositions(view.state, currentTerm);
  if (positions.length === 0) return;
  const from = view.state.selection.main.from;
  let idx = -1;
  for (let i = positions.length - 1; i >= 0; i--) {
    if (positions[i] < from) {
      idx = i;
      break;
    }
  }
  if (idx < 0) idx = positions.length - 1; // wrap to last
  selectMatch(view, positions, idx, currentTerm.length);
}

export function clearNoteSearch() {
  const view = editorView();
  currentTerm = "";
  setSearchCount(0);
  setSearchCurrent(0);
  if (view) view.dispatch({ effects: setSearchTerm.of("") });
}

// Scroll the editor to a 0-based document line (as the Outline emits) and place
// the cursor there, mirroring Outline.qml → editorRef.scrollToLine.
export function scrollEditorToLine(lineIndex: number): void {
  const view = editorView();
  if (!view) return;
  const n = Math.max(1, Math.min(lineIndex + 1, view.state.doc.lines));
  const line = view.state.doc.line(n);
  view.dispatch({
    selection: { anchor: line.from },
    effects: EditorView.scrollIntoView(line.from, { y: "start" }),
  });
  view.focus();
}
