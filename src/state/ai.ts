// Ask-AI orchestration for the bottom Ask bar (mirrors the Qt NoteEditor
// .submitAsk): build notebook context, drop a "> question" blockquote at the end
// of the note, then stream the model's answer into the note beneath it. One
// request at a time; cancellable (Stop) and self-cancelling if the user switches
// notes mid-stream. The request itself runs in Rust — Stop cancels it by id
// rather than aborting a fetch in this process. The selection-scoped "Ask AI
// about this" flow lives in state/askPopup.ts — it streams into an anchored
// popup, never into the note.
import { createSignal } from "solid-js";
import { EditorView } from "@codemirror/view";
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
  // The notebook context is built for the model only — never surfaced in the UI.
  const { text: context } = buildNotebookContext(path, view.state.doc.toString());

  // Drop the question as a blockquote on a fresh line; the answer streams below.
  // An ask always appends at the end of the note, so the conversation reads as
  // a log at the bottom (not wherever the caret happened to be — which is
  // offset 0 right after opening a note).
  const doc = view.state.doc;
  const line = doc.lineAt(doc.length);
  const anchor = line.to;
  // Blank line between the note's existing text and the conversation, except in
  // an empty note where a leading newline would just push everything down.
  const lead = anchor === 0 ? "" : line.text.trim() === "" ? "\n" : "\n\n";
  const block = `${lead}> ${q}\n\n`;
  // The one deliberate scroll of an ask: the user just hit Ask, so take them to the
  // conversation. Everything after this point follows the answer only while the reader
  // stays at the tail (Typewriter.atTail) — scrolling up during the answer must never
  // be undone, so nothing below re-scrolls.
  view.dispatch({
    changes: { from: anchor, insert: block },
    selection: { anchor: anchor + block.length },
    effects: EditorView.scrollIntoView(anchor + block.length, { y: "center" }),
  });
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
        // Trailing blank line so the next ask starts clean. No scrollIntoView: by the
        // time the answer ends the reader may well have scrolled up into it, and a
        // one-character edit at the very bottom is no reason to drag them back.
        const end = Math.min(typer.pos, view.state.doc.length);
        view.dispatch({ changes: { from: end, insert: "\n" } });
      }
      setAskOpen(false);
    }
    flushEditor();
  } catch (e) {
    typer.stop();
    setAskError(shortError(e));
    flushEditor();
  } finally {
    // Both exits, not just Stop: the typewriter listens on the view to tell the
    // reader's scrolling from its own, and an ask that ends naturally never passes
    // through stop(). Without this every question would leave its listeners behind.
    typer.dispose();
    setAsking(false);
    setSearchStatus(null);
    activeRequestId = null;
    activeTyper = null;
  }
}
