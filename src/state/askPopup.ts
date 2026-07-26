// The "Ask AI about this" selection popup. Right-clicking a selection (or
// Ctrl+Shift+A) opens a small popup anchored at the selection; the question is
// scoped to that passage and the answer streams into the POPUP, not the note.
// The asked-about range keeps a .cm-ask-mark in the editor: hovering it recalls
// the popup (query + answer), and clicking a finished popup saves both as a new
// note beside the one it came from AND replaces the asked-about passage with a
// [[wikilink]] to that note — so the answer is reachable from the source note
// like any other link, not an orphan. Entries live here keyed by mark id; the
// marks themselves are a pure CM extension (editor/askPopupMarks.ts) that
// cannot import this module, so hover is wired through registerAskMarkHover.
import { createSignal, type Accessor, type Setter } from "solid-js";
import { type StateEffect } from "@codemirror/state";
import { type EditorView } from "@codemirror/view";
import {
  addAskMark,
  removeAskMark,
  askMarkRanges,
  registerAskMarkHover,
} from "../editor/askPopupMarks";
import { editorView, flushEditor } from "./editor";
import { activeNotePath, createNoteIn } from "./ui";
import { readDoc } from "./documents";
import { llmProvider, llmKeyPresent, llmModel, llmBaseUrl, webSearchActive } from "./settings";
import { ask } from "../ai/llmService";
import { cancelAsk } from "../backend/llmApi";
import { buildNotebookContext } from "../ai/context";

export type AskPopupStatus = "input" | "asking" | "done" | "error";

// One asked-about passage. Signals are PER ENTRY so a recalled popup shows its
// own query/answer, not whichever ask ran last.
export interface AskPopupEntry {
  id: string;
  path: string;
  selection: string;
  from: number;
  to: number;
  query: Accessor<string>;
  setQuery: Setter<string>;
  answer: Accessor<string>;
  setAnswer: Setter<string>;
  searchStatus: Accessor<string | null>;
  setSearchStatus: Setter<string | null>;
  status: Accessor<AskPopupStatus>;
  setStatus: Setter<AskPopupStatus>;
  error: Accessor<string>;
  setError: Setter<string>;
}

const entries = new Map<string, AskPopupEntry>();
export const getAskEntry = (id: string): AskPopupEntry | undefined => entries.get(id);

// The open popup: which entry, anchored where. The rect (viewport coordinates)
// feeds Ark's getAnchorRect in AskPopup.tsx.
export const [askPopup, setAskPopup] = createSignal<{
  id: string;
  rect: { x: number; y: number; width: number; height: number };
} | null>(null);

/// Opens the popup for a passage. `selection` must be the RAW slice of [from, to)
/// — the two are trimmed together here so every entry point (right-click menu and
/// Ctrl+Shift+A) agrees. Trimming in the callers instead let them drift: the range
/// keys the .cm-ask-mark, the context anchor AND the span saveAskPopupAsNote
/// replaces with a [[wikilink]], so a line selected with Ctrl+L (CodeMirror
/// includes the trailing line break) had its newline swallowed by that replacement
/// on one path and not the other.
export function openAskPopupAt(
  selection: string,
  from: number,
  to: number,
  rect: { x: number; y: number; width: number; height: number },
): void {
  const lead = selection.length - selection.trimStart().length;
  const trail = selection.length - selection.trimEnd().length;
  const text = selection.trim();
  if (!text) return; // nothing but whitespace — no passage to ask about
  from += lead;
  to -= trail;

  const [query, setQuery] = createSignal("");
  const [answer, setAnswer] = createSignal("");
  const [searchStatus, setSearchStatus] = createSignal<string | null>(null);
  const [status, setStatus] = createSignal<AskPopupStatus>("input");
  const [error, setError] = createSignal("");
  const entry: AskPopupEntry = {
    id: crypto.randomUUID(),
    path: activeNotePath(),
    selection: text,
    from,
    to,
    query,
    setQuery,
    answer,
    setAnswer,
    searchStatus,
    setSearchStatus,
    status,
    setStatus,
    error,
    setError,
  };
  entries.set(entry.id, entry);
  // Mark the range up front so the hover anchor exists while still typing; a
  // popup abandoned empty removes it again in closeAskPopup.
  editorView()?.dispatch({ effects: addAskMark.of({ id: entry.id, from, to }) });
  cancelHideAskPopup();
  setAskPopup({ id: entry.id, rect });
}

// Hover recall over an existing mark.
export function openAskPopupForMark(id: string, rect: DOMRect): void {
  if (!entries.has(id)) return;
  const cur = askPopup();
  if (cur && cur.id !== id) {
    const shown = entries.get(cur.id);
    // A stray hover over another mark must not yank away a popup that's being
    // typed into or streamed — the same protection scheduleHide gives mouse-out.
    if (shown && (shown.status() === "input" || shown.status() === "asking")) return;
  }
  setAskPopup({ id, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } });
}

// ── Show/hide with a grace period (mirrors state/wikilink.ts) ─────────────────
let hideTimer: number | undefined;

export function closeAskPopup(): void {
  clearTimeout(hideTimer);
  const cur = askPopup();
  setAskPopup(null);
  if (!cur) return;
  const entry = entries.get(cur.id);
  // A popup parked with nothing typed must not leave a permanent mark behind.
  if (entry && entry.status() === "input" && !entry.query().trim()) {
    entries.delete(cur.id);
    editorView()?.dispatch({ effects: removeAskMark.of(cur.id) });
  }
}
export function scheduleHideAskPopup(): void {
  clearTimeout(hideTimer);
  const cur = askPopup();
  const entry = cur ? entries.get(cur.id) : undefined;
  // Typing/streaming must not vanish on a mouse-out — only a settled popup
  // ("done"/"error") hides on the grace timer; the others close explicitly.
  if (entry && (entry.status() === "input" || entry.status() === "asking")) return;
  hideTimer = window.setTimeout(() => closeAskPopup(), 300);
}
export function cancelHideAskPopup(): void {
  clearTimeout(hideTimer);
}

// ── Ask (streamed into the entry, not the note) ───────────────────────────────
// One in-flight popup request at a time, cancelled by id like the Ask bar's.
let activeRequestId: string | null = null;

// Mirrors state/ai.ts shortError: Rust command failures arrive as a plain
// string; local guards throw Error.
function shortAskError(e: unknown): string {
  const msg = typeof e === "string" ? e : e instanceof Error ? e.message : String(e);
  return msg.length > 160 ? msg.slice(0, 160) + "…" : msg;
}

export async function submitAskPopup(id: string, question: string): Promise<void> {
  const entry = entries.get(id);
  const q = question.trim();
  if (!entry || !q || activeRequestId) return;
  // No key → the popup already swaps its form for the "Set an API key in
  // Settings →" affordance while !aiEnabled(); this guard covers the same
  // key-removed race submitAsk does, surfacing it through the error state.
  if (!llmKeyPresent()) {
    entry.setError("Set an API key in Settings first.");
    entry.setStatus("error");
    return;
  }
  entry.setQuery(q);
  entry.setError("");
  entry.setAnswer("");
  entry.setSearchStatus(null);
  entry.setStatus("asking");
  // Context comes from the entry's own note, anchored POSITIONALLY: the passage is
  // marked in place so a word that appears several times in the note is still
  // unambiguous (see ai/selectionAnchor.ts).
  //
  // Two things have to agree here — the body and the offsets that index it. The
  // LIVE mark range is preferred over entry.from/to because the passage may have
  // moved since the popup opened (the same reason saveAskPopupAsNote reads it), but
  // both are only valid against the live buffer, and only while the entry's OWN
  // note is on screen: a recall firing with another note active would otherwise
  // index a completely different document. Falling back to the stored copy keeps
  // the ask working either way — a range that no longer fits is discarded by
  // resolveRange rather than marking the wrong span.
  const view = editorView();
  const onScreen = !!view && activeNotePath() === entry.path;
  const body = onScreen ? view!.state.doc.toString() : readDoc(entry.path);
  const live = onScreen ? askMarkRanges(view!.state).find((r) => r.id === id) : undefined;
  const { text: context } = buildNotebookContext(entry.path, body, {
    text: entry.selection,
    from: live ? live.from : entry.from,
    to: live ? live.to : entry.to,
  });
  const requestId = crypto.randomUUID();
  activeRequestId = requestId;
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
          entry.setSearchStatus(e.query);
          return;
        }
        entry.setSearchStatus(null);
        // No Typewriter here — the popup is small and immediate, so text lands
        // as the network delivers it.
        entry.setAnswer((a) => a + e.text);
      },
    });
    // A cancelled ask resolves normally too (see llmApi) — either way whatever
    // streamed in stays readable and saveable.
    entry.setStatus("done");
  } catch (e) {
    entry.setError(shortAskError(e));
    entry.setStatus("error");
  } finally {
    entry.setSearchStatus(null);
    activeRequestId = null;
  }
}

export function stopAskPopup(): void {
  if (!activeRequestId) return;
  void cancelAsk(activeRequestId);
}

// ── Save as note ──────────────────────────────────────────────────────────────
// The title doubles as the filename AND as the text of the wikilink that
// replaces the passage, so it must survive Windows and the vault's wikilink
// syntax alike: strip newlines, drop illegal characters, collapse runs of
// whitespace, cap the length.
function sanitiseTitle(raw: string): string {
  return raw
    .replace(/[\r\n]+/g, " ")
    .replace(/[\\/:*?"<>|#^[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60)
    .trim();
}
// Named after the SELECTED passage. A selection of nothing but punctuation or
// newlines sanitises down to empty, so fall back to the query and then to a
// constant — the note must never end up nameless.
function noteTitleFor(selection: string, query: string): string {
  return sanitiseTitle(selection) || sanitiseTitle(query) || "AI answer";
}

export function saveAskPopupAsNote(id: string): void {
  const entry = entries.get(id);
  if (!entry || entry.status() !== "done") return;
  // The quote stays even though the title now echoes the passage: the title is
  // flattened to one line and capped at 60 chars, so the quote is the only
  // faithful copy of a long or multi-line selection.
  const quoted = entry.selection
    .split("\n")
    .map((l) => "> " + l)
    .join("\n");
  const content = quoted + "\n\n**Q:** " + entry.query() + "\n\n" + entry.answer() + "\n";
  // The folder of the ENTRY's note (computed like activeNoteFolder, but from
  // entry.path) — hover recall may fire with a different note active, and the
  // saved note belongs beside the one that was asked about.
  const i = entry.path.lastIndexOf("/");
  const folder = i <= 0 ? "" : entry.path.slice(0, i);
  // Create it WITHOUT opening (confirmAddNote's "create, don't leave the note"),
  // and BEFORE editing the source: createNoteIn dedupes names (uniquePath in
  // state/vault.ts), so the file may land as "Name 2.md". The link has to carry
  // the name it ACTUALLY got — the requested one would resolve to the
  // pre-existing note instead of the one just created.
  const newPath = createNoteIn(folder, noteTitleFor(entry.selection, entry.query()), false, content);
  const linkName = newPath.split("/").pop()!.replace(/\.md$/i, "");

  const view = editorView();
  // Rewrite the passage only when the entry's own note is the one on screen:
  // hover recall can fire from any note, and we must never edit through an
  // editor holding a different document.
  if (view && activeNotePath() === entry.path) {
    // The LIVE mark range wins — the passage may have shifted since the entry
    // was created. entry.from/to is the fallback for a mark that is no longer in
    // the field (never seeded, or the note was swapped in without it).
    const live = askMarkRanges(view.state).find((r) => r.id === id);
    const len = view.state.doc.length;
    const from = Math.min(live ? live.from : entry.from, len);
    const to = Math.min(live ? live.to : entry.to, len);
    if (from < to) {
      // ONE transaction: splitting the replacement from the mark removal would
      // leave an intermediate state whose mark points at the new wikilink.
      view.dispatch({
        changes: { from, to, insert: "[[" + linkName + "]]" },
        effects: removeAskMark.of(id),
        userEvent: "input.wikilink",
      });
      // The range is a plain wikilink from here on, so the ask entry must stop
      // existing: the wikilink's own hover card owns that text now, and a
      // surviving entry would fight it for the hover.
      entries.delete(id);
    }
  }
  // Persist the parent note's new link (the buffer is the only copy of it).
  flushEditor();
  closeAskPopup();
}

// ── Mark persistence across tab switches ──────────────────────────────────────
// Editor.tsx swaps notes with view.setState(), which discards every StateField —
// marks included. The Editor harvests fresh positions into the entries just
// before each swap and reseeds the incoming note's marks just after.
export function captureAskMarks(view: EditorView, path: string): void {
  // The popup is anchored to viewport coordinates of the outgoing note.
  closeAskPopup();
  const live = new Map(askMarkRanges(view.state).map((r) => [r.id, r]));
  for (const entry of entries.values()) {
    if (entry.path !== path) continue;
    const r = live.get(entry.id);
    if (r) {
      entry.from = r.from;
      entry.to = r.to;
    } else {
      // The marked text was deleted (the field dropped the collapsed mark).
      // Keep the entry — collapse its range so it is never reseeded; a missing
      // mark just means no hover anchor.
      entry.to = entry.from;
    }
  }
}

export function syncAskMarks(view: EditorView, path: string): void {
  const len = view.state.doc.length;
  const effects: StateEffect<unknown>[] = [];
  for (const entry of entries.values()) {
    if (entry.path !== path) continue;
    const from = Math.min(entry.from, len);
    const to = Math.min(entry.to, len);
    if (from >= to) continue; // collapsed (or clamped away) — nothing to anchor
    effects.push(addAskMark.of({ id: entry.id, from, to }));
  }
  if (effects.length) view.dispatch({ effects });
}

// Hover recall wiring — the marks extension can't import this module (import
// cycle, see its header), so it calls back through this registration.
registerAskMarkHover(
  (id, rect) => {
    cancelHideAskPopup();
    openAskPopupForMark(id, rect);
  },
  () => scheduleHideAskPopup(),
);
