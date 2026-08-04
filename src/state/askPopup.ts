// The "Ask AI about this" selection popup. Right-clicking a selection (or
// Ctrl+Shift+A) opens a small popup anchored at the selection; the question is
// scoped to that passage and the answer streams into the POPUP, not the note.
// The asked-about range keeps a .cm-ask-mark in the editor: hovering it recalls
// the popup (query + answer), and clicking a finished popup saves both as a new
// note beside the one it came from AND wraps the asked-about passage in a
// rename-proof id link to that note ([full passage](id:XYZ)) — the parent keeps
// every character of its own text, the child's filename is just a tidy starter
// name, and renaming the child never touches the parent. Entries live here
// keyed by mark id; the marks themselves are a pure CM extension
// (editor/askPopupMarks.ts) that cannot import this module, so hover is wired
// through registerAskMarkHover.
//
// One passage can carry SEVERAL questions — each one is its own entry with its
// own mark over the same range — so the open popup names a SET of entries plus
// which of them is showing. The card renders that set as a strip of chips (the
// multi-target link card's layout, deliberately reused) and the active entry's
// lifecycle underneath it. Everything else here is still keyed by a single id:
// asking, saving and closing all act on ONE entry, and the popup's activeId is
// what every caller passes.
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
import { hideWikilinkNow } from "./wikilink";
import { mintNoteId, linkifySelection } from "../graph/wikilinkParse";
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

// Insertion order IS creation order — an id is set once and never re-inserted
// (saveAskPopupAsNote deletes, it does not replace), so iterating this Map is
// how "oldest question first" is answered below.
const entries = new Map<string, AskPopupEntry>();
export const getAskEntry = (id: string): AskPopupEntry | undefined => entries.get(id);

export type AskRect = { x: number; y: number; width: number; height: number };

// The open popup: which entries the hovered passage carries, which one is
// showing, anchored where. The rect (viewport coordinates) feeds Ark's
// getAnchorRect in AskPopup.tsx.
//
// `ids` is always in creation order (see openAskPopupForMarks) and `activeId` is
// always one of them.
export const [askPopup, setAskPopup] = createSignal<{
  ids: string[];
  activeId: string;
  rect: AskRect;
} | null>(null);

// Every path that puts the ask card on screen goes through here, so the
// precedence rule below lives in exactly one place.
//
// PRECEDENCE: saving an answer wraps the asked-about passage in an id link, so
// any question still open on that text now sits on a range that is ALSO a link —
// and editor/wikilinkInteractions' mouseover fires on the same event as
// editor/askPopupMarks'. Both cards want the pointer. The ask card wins: it is
// the more specific thing the user built on that text (they asked about it and
// kept the other questions), while the link card only ever previews a note that
// is one click away anyway. Dismissing the link card here rather than teaching
// state/wikilink about ask marks keeps the dependency one-way — state/wikilink
// does not import this module, so this edge cannot cycle.
function showAskPopup(next: { ids: string[]; activeId: string; rect: AskRect }): void {
  hideWikilinkNow();
  setAskPopup(next);
}

// The per-entry signal bundle. Shared by the two ways an entry is born: a fresh
// selection (openAskPopupAt) and another question on a passage that already has
// one (askAnotherOnSamePassage).
function makeEntry(path: string, selection: string, from: number, to: number): AskPopupEntry {
  const [query, setQuery] = createSignal("");
  const [answer, setAnswer] = createSignal("");
  const [searchStatus, setSearchStatus] = createSignal<string | null>(null);
  const [status, setStatus] = createSignal<AskPopupStatus>("input");
  const [error, setError] = createSignal("");
  return {
    id: crypto.randomUUID(),
    path,
    selection,
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
}

/// Opens the popup for a passage. `selection` must be the RAW slice of [from, to)
/// — the two are trimmed together here so every entry point (right-click menu and
/// Ctrl+Shift+A) agrees. Trimming in the callers instead let them drift: the range
/// keys the .cm-ask-mark, the context anchor AND the span saveAskPopupAsNote
/// replaces with a [[wikilink]], so a line selected with Ctrl+L (CodeMirror
/// includes the trailing line break) had its newline swallowed by that replacement
/// on one path and not the other.
export function openAskPopupAt(selection: string, from: number, to: number, rect: AskRect): void {
  const lead = selection.length - selection.trimStart().length;
  const trail = selection.length - selection.trimEnd().length;
  const text = selection.trim();
  if (!text) return; // nothing but whitespace — no passage to ask about
  from += lead;
  to -= trail;

  const entry = makeEntry(activeNotePath(), text, from, to);
  entries.set(entry.id, entry);
  // Mark the range up front so the hover anchor exists while still typing; a
  // popup abandoned empty removes it again in closeAskPopup.
  editorView()?.dispatch({ effects: addAskMark.of({ id: entry.id, from, to }) });
  cancelHideAskPopup();
  // A fresh ask always opens ALONE, even over a passage that already carries
  // other questions: the strip is a recall affordance, and the thing the user
  // just started typing is the only thing they asked for.
  showAskPopup({ ids: [entry.id], activeId: entry.id, rect });
}

// Hover recall over the marks under the pointer. `ids` is whatever
// editor/askPopupMarks found covering that position, in document order —
// meaningless for marks sharing a range, so it is re-ordered here.
//
// CREATION ORDER, not document order: the strip must not reshuffle itself as the
// pointer moves a few pixels, and it must read the same on every hover of the
// same passage. Two marks over identical ranges have no stable relative document
// order at all, and even distinct ranges would sort by where the passages START,
// which says nothing about which question came first. This module is the only
// one that knows creation order (the entries Map's insertion order), and walking
// that Map filtered by the reported ids does the ordering, the de-duplication
// and the "drop ids with no entry" in a single pass.
export function openAskPopupForMarks(ids: string[], rect: DOMRect): void {
  const wanted = new Set(ids);
  const ordered = [...entries.keys()].filter((id) => wanted.has(id));
  if (!ordered.length) return; // every reported mark is orphaned — nothing to recall
  const cur = askPopup();
  // A stray hover over another passage must not yank away a popup that's being
  // typed into or streamed — the same protection scheduleHide gives mouse-out.
  // A hover that lands back on the popup's OWN entry is not stray, so it still
  // gets through (it is how the strip grows to include a sibling asked earlier).
  if (cur && !wanted.has(cur.activeId)) {
    const shown = entries.get(cur.activeId);
    if (shown && (shown.status() === "input" || shown.status() === "asking")) return;
  }
  // Default to the entry created LAST — the question you just asked is the one
  // you expect to see. Re-hovering a passage whose popup is already up keeps
  // whatever is showing instead, so the pointer travelling over the text can
  // never swap the answer out from under itself.
  const activeId =
    cur && wanted.has(cur.activeId) ? cur.activeId : ordered[ordered.length - 1];
  showAskPopup({
    ids: ordered,
    activeId,
    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
  });
}

// Which of the popup's entries is showing. Driven by hovering a chip in the
// strip, matching the link hover card where hovering a target reveals it.
export function setActiveAskEntry(id: string): void {
  const cur = askPopup();
  if (!cur || cur.activeId === id || !cur.ids.includes(id)) return;
  setAskPopup({ ...cur, activeId: id });
}

// The strip's "+" chip: another question about the SAME passage, without having
// to re-select it. The new entry becomes the active one, in "input" status, so
// the card swaps straight to the question form.
export function askAnotherOnSamePassage(): void {
  const cur = askPopup();
  const base = cur ? entries.get(cur.activeId) : undefined;
  if (!cur || !base) return;
  const view = editorView();
  // Only when the entry's OWN note is on screen. Hover recall can fire from any
  // note, and the range below is only meaningful against the live buffer — the
  // same rule submitAskPopup and saveAskPopupAsNote apply before touching it.
  if (!view || activeNotePath() !== base.path) return;
  // The LIVE mark range wins, with the stored from/to as the fallback for a mark
  // that is no longer in the field (never seeded, or the note was swapped in
  // without it) — the passage may have moved since the base entry was created.
  const live = askMarkRanges(view.state).find((r) => r.id === base.id);
  const len = view.state.doc.length;
  const from = Math.min(live ? live.from : base.from, len);
  const to = Math.min(live ? live.to : base.to, len);
  if (from >= to) return; // the passage is gone — nothing left to ask about
  // The doc's text is the truth, not base.selection: it may have been edited
  // under the mark while the popup sat open (saveAskPopupAsNote wraps the live
  // text for the same reason).
  const entry = makeEntry(base.path, view.state.sliceDoc(from, to), from, to);
  entries.set(entry.id, entry);
  view.dispatch({ effects: addAskMark.of({ id: entry.id, from, to }) });
  cancelHideAskPopup();
  showAskPopup({ ids: [...cur.ids, entry.id], activeId: entry.id, rect: cur.rect });
}

// ── Show/hide with a grace period (mirrors state/wikilink.ts) ─────────────────
let hideTimer: number | undefined;

export function closeAskPopup(): void {
  clearTimeout(hideTimer);
  const cur = askPopup();
  setAskPopup(null);
  if (!cur) return;
  // A popup parked with nothing typed must not leave a permanent mark behind.
  // Strictly the ACTIVE entry: the popup can hold several, and the siblings are
  // finished questions the user asked about the same passage — dropping those
  // because a newly-added one was abandoned would delete answers they never
  // touched.
  const entry = entries.get(cur.activeId);
  if (entry && entry.status() === "input" && !entry.query().trim()) {
    entries.delete(cur.activeId);
    editorView()?.dispatch({ effects: removeAskMark.of(cur.activeId) });
  }
}
export function scheduleHideAskPopup(): void {
  clearTimeout(hideTimer);
  const cur = askPopup();
  const entry = cur ? entries.get(cur.activeId) : undefined;
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
// The title is ONLY the child note's filename — a tidy starter name, per the
// design: the parent keeps the full passage as the id link's display text, so
// nothing is lost when this flattens and caps. It must survive Windows and the
// vault's wikilink syntax alike: strip newlines, drop illegal characters,
// collapse runs of whitespace, cap the length.
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
  // The child carries a minted id in its frontmatter from birth — that id, not
  // the filename, is what the parent's link resolves through, so renaming the
  // child never touches the parent again.
  const noteId = mintNoteId();
  // The quote stays even though the parent keeps the passage too: the child
  // should read standalone, with the asked-about text right above the answer.
  const quoted = entry.selection
    .split("\n")
    .map((l) => "> " + l)
    .join("\n");
  const content =
    `---\nid: ${noteId}\n---\n\n` +
    quoted +
    "\n\n**Q:** " +
    entry.query() +
    "\n\n" +
    entry.answer() +
    "\n";
  // The folder of the ENTRY's note (computed like activeNoteFolder, but from
  // entry.path) — hover recall may fire with a different note active, and the
  // saved note belongs beside the one that was asked about.
  const i = entry.path.lastIndexOf("/");
  const folder = i <= 0 ? "" : entry.path.slice(0, i);
  // Create it WITHOUT opening (confirmAddNote's "create, don't leave the note"),
  // and BEFORE editing the source. createNoteIn dedupes names (uniquePath in
  // state/vault.ts) — the filename can shift to "Name 2.md" freely, because the
  // parent's link rides the id, not the name.
  createNoteIn(folder, noteTitleFor(entry.selection, entry.query()), false, content);

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
      // The passage is wrapped, never replaced: the full selected text stays in
      // the parent as the link's display (the old behaviour swapped it for the
      // truncated child title — the user's text was silently cut down).
      // The live text under the mark is what gets wrapped — it may have drifted
      // from entry.selection while the popup sat open, and the doc's version is
      // the truth.
      //
      // ONE transaction: splitting the replacement from the mark removal would
      // leave an intermediate state whose mark points at the new link.
      view.dispatch({
        changes: { from, to, insert: linkifySelection(view.state.sliceDoc(from, to), noteId) },
        effects: removeAskMark.of(id),
        userEvent: "input.wikilink",
      });
      // The range is a plain link from here on, so the ask entry must stop
      // existing: the link's own hover card owns that text now, and a
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
  (ids, rect) => {
    cancelHideAskPopup();
    openAskPopupForMarks(ids, rect);
  },
  () => scheduleHideAskPopup(),
);
