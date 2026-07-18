// Ask-AI orchestration (mirrors the Qt NoteEditor.submitAsk): build notebook
// context, drop a "> question" blockquote at the cursor, then stream the model's
// answer into the note beneath it. One request at a time; cancellable (Stop) and
// self-cancelling if the user switches notes mid-stream. The request itself runs in
// Rust — Stop cancels it by id rather than aborting a fetch in this process.
import { createSignal } from "solid-js";
import { editorView, flushEditor } from "./editor";
import { activeNotePath } from "./ui";
import { llmProvider, llmKeyPresent, llmModel, llmBaseUrl, webSearchActive, aiTypingSpeed } from "./settings";
import { ask } from "../ai/llmService";
import { cancelAsk } from "../backend/llmApi";
import { buildNotebookContext } from "../ai/context";
import { Typewriter } from "../ai/typewriter";

export const [askOpen, setAskOpen] = createSignal(false);
export const [asking, setAsking] = createSignal(false); // request in flight
export const [askError, setAskError] = createSignal("");

// The editor passage a selection-scoped ask targets (from the right-click "Ask AI
// about this"). Null for an ordinary whole-note ask. Holds the text, the document
// range (so the answer drops just below the highlight), and the note it came from
// (so switching notes mid-ask can't apply a stale range to the wrong note).
export const [askSelection, setAskSelection] = createSignal<
  { text: string; from: number; to: number; path: string } | null
>(null);

// Id of the in-flight Rust request, or null when idle. Stop cancels by this id.
let activeRequestId: string | null = null;
// The typewriter draining the current answer, so Stop can halt on-screen typing too.
let activeTyper: Typewriter | null = null;
// Set by stopAsk so the completion path can tell a cancel from a natural finish —
// Rust resolves both the same way.
let cancelled = false;

// What the model is currently looking up on the web, for the Ask bar's status line.
// Empty string means "searching, query not known yet"; null means not searching.
export const [searchStatus, setSearchStatus] = createSignal<string | null>(null);

export function openAsk() {
  setAskError("");
  setAskOpen(true);
}
export function closeAsk() {
  setAskOpen(false);
  setAskSelection(null);
}

// From the editor's right-click "Ask AI about this": remember the highlighted
// range, then open the Ask bar so the next submit answers about just that text.
export function startAskAboutSelection(text: string, from: number, to: number) {
  setAskError("");
  setAskSelection({ text, from, to, path: activeNotePath() });
  setAskOpen(true);
}
export function stopAsk() {
  if (!activeRequestId) return;
  cancelled = true;
  activeTyper?.stop(); // halt on-screen typing immediately, not just the network
  void cancelAsk(activeRequestId);
}

function shortError(e: unknown): string {
  // Rust command failures arrive as a plain string; local guards throw Error.
  const msg = typeof e === "string" ? e : e instanceof Error ? e.message : String(e);
  return msg.length > 160 ? msg.slice(0, 160) + "…" : msg;
}

export async function submitAsk(question: string): Promise<void> {
  const q = question.trim();
  if (!q || asking()) return;
  // No key → don't touch the note. The AskBar already shows the
  // "Set an API key in Settings →" link while the bar is open.
  if (!llmKeyPresent()) return;
  const view = editorView();
  if (!view) return;

  setAskError("");
  const path = activeNotePath();
  // Only honour the selection scope if it belongs to the note we're asking in —
  // otherwise (the user switched notes with the bar open) fall back to a normal
  // whole-note ask so the answer can't land at a stale offset in the wrong note.
  const rawSel = askSelection();
  const sel = rawSel && rawSel.path === path ? rawSel : null;
  // The notebook context is built for the model only — never surfaced in the UI.
  const { text: context } = buildNotebookContext(path, view.state.doc.toString(), sel?.text);

  // Drop the question as a blockquote on a fresh line; the answer streams below.
  // For a selection ask, anchor to the end of the highlighted passage; otherwise
  // to the current cursor line.
  const insertPos = sel ? Math.min(sel.to, view.state.doc.length) : view.state.selection.main.head;
  const line = view.state.doc.lineAt(insertPos);
  const anchor = line.to;
  const lead = line.text.trim() === "" ? "" : "\n";
  const block = `${lead}\n> ${q}\n\n`;
  view.dispatch({ changes: { from: anchor, insert: block }, selection: { anchor: anchor + block.length } });
  view.focus();

  // Reveal the streamed answer as smooth typing rather than in network bursts.
  const typer = new Typewriter(view, anchor + block.length, aiTypingSpeed);
  activeTyper = typer;

  const requestId = crypto.randomUUID();
  activeRequestId = requestId;
  cancelled = false;
  setAsking(true);
  setSearchStatus(null);
  try {
    await ask({
      requestId,
      provider: llmProvider(),
      model: llmModel(),
      baseUrl: llmBaseUrl(),
      context,
      question: q,
      webSearch: webSearchActive(),
      onEvent: (e) => {
        if (e.type === "search") {
          setSearchStatus(e.query);
          return;
        }
        if (activeNotePath() !== path) {
          typer.stop(); // the note changed underneath us — stop writing into it
          stopAsk();
          return;
        }
        setSearchStatus(null);
        typer.push(e.text); // queued; drained at the user's typing speed
      },
    });
    // Let the typewriter finish emptying its buffer before we close out — the network
    // is done, but the on-screen typing may still be catching up.
    if (!cancelled) await typer.finish();
    // A cancelled ask keeps the bar open (the user may want to retype); only a
    // run that finished on its own closes it.
    if (!cancelled) {
      if (activeNotePath() === path) {
        const end = Math.min(typer.pos, view.state.doc.length);
        view.dispatch({ changes: { from: end, insert: "\n" } });
      }
      setAskOpen(false);
      setAskSelection(null);
    }
    flushEditor();
  } catch (e) {
    typer.stop();
    setAskError(shortError(e));
    flushEditor();
  } finally {
    setAsking(false);
    setSearchStatus(null);
    activeRequestId = null;
    activeTyper = null;
  }
}
