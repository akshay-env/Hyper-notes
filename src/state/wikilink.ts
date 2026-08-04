// Note-link interaction state + helpers. Powers the editor hover-preview card
// and click-to-open for the compound link form [[A|B|C]](id:X,Y,Z) — every
// segment is a TARGET, the first one is also the label, and segment i resolves
// by slot i of the hidden id list (or by title while its slot is "_"). The CM6
// dom handlers (editor/wikilinkInteractions) feed this; WikilinkHoverCard
// renders from it.
//
// It also owns the document REWRITES a link can undergo, because they have
// callers on either side of the editor/component boundary and all must survive
// ensureNoteId replacing the buffer underneath them: openLinkAt (fill the
// clicked slot with a freshly minted id, on open), confirmAddNote (append one
// more target), and renameNoteById (the label-edit → rename-the-child commit,
// driven by editor/linkEditCommit).
import { createSignal } from "solid-js";
import type { EditorView } from "@codemirror/view";
import { findPathByTitle } from "./vault";
import { readDoc } from "./documents";
import { selectNoteByPath, createNoteIn, activeNoteFolder, renamePath } from "./ui";
import { editorView, flushEditor, reloadEditorDoc } from "./editor";
import {
  parseWikilinkInner,
  titleKey,
  normalizeTarget,
  noteLinkParts,
  splitRawSegments,
  unescapeSegment,
  escapeSegment,
  compoundLink,
  slotFor,
  linkDestination,
  parseIdTargets,
} from "../graph/wikilinkParse";
// The [[ … ]] tree walk, shared with the right-click menu and the click handler
// so all three agree byte-for-byte about where a link starts and ends. Safe to
// reach for from state/: editor/linkRanges imports only @codemirror and
// graph/wikilinkParse — nothing under state/ — so it cannot point back here.
import { wikilinkRangeAt } from "../editor/linkRanges";
import { findPathById, ensureNoteId } from "./noteId";

// ── Hover model ───────────────────────────────────────────────────────────────
// One entry per link target, whatever resolves it. `path` is "" when the target
// resolves to nothing; `canCreate` distinguishes WHY: a title target with no
// note yet is click-to-create ("New"), a slot whose id is dead is a deliberate
// no-op ("Missing" — the id names one specific deleted note, and creating a
// fresh one under the label would silently fork the content).
//
// Dead targets are KEPT in the list rather than filtered out: the card and the
// menu must be able to show them as missing, and dropping one would silently
// renumber the rows so the second target of a two-target link looked like the
// only one.
export interface HoverTarget {
  title: string; // shown: the resolved note's title, or the segment text
  path: string;
  canCreate: boolean;
}
export interface WikilinkHover {
  label: string;
  rect: DOMRect;
  targets: HoverTarget[];
}
export const [wikilinkHover, setWikilinkHover] = createSignal<WikilinkHover | null>(null);

// A note path's title: its filename without ".md". Shown wherever a target
// needs a name and its segment text is prose (a passage label) or a raw id.
export function noteTitleOfPath(path: string): string {
  return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}

// segments+slots → hover/menu targets, resolved NOW. Shared by the editor's
// hover handler and the right-click menu so the two can never disagree about
// what a link's rows are.
export function linkTargets(segments: string[], slots: (string | null)[]): HoverTarget[] {
  return segments.map((seg, i) => {
    const id = slots[i] ?? null;
    if (id) {
      const p = findPathById(id);
      return { title: p ? noteTitleOfPath(p) : seg, path: p, canCreate: false };
    }
    return { title: seg, path: findPathByTitle(seg), canCreate: true };
  });
}

// Re-exported so callers keep importing it from here; the implementation is
// shared with the graph builder (see graph/wikilinkParse).
export const parseWikilink = parseWikilinkInner;

// Title → path resolution lives in state/vault (beside vaultTree), because the
// "[[" autocomplete needs the same answer and importing THIS module from an
// editor extension would close an import cycle. Re-exported so the rest of the
// app can keep asking the link layer.
export { findPathByTitle };

// True when a wikilink target already resolves to a note in the vault.
export function wikilinkExists(title: string): boolean {
  return findPathByTitle(title) !== "";
}

// Resolve a note title to its path + current text (embed transclusion reads
// through this so ![[Note]] renders the same doc the editor would open).
export function resolveNoteByTitle(title: string): { path: string; text: string } | null {
  const path = findPathByTitle(title);
  if (!path) return null;
  return { path, text: readDoc(path) };
}

// Resolve a link target to a note path, CREATING the note if nothing resolves
// yet — clicking an unresolved [[link]] is how you make the note. The new note
// goes in the folder of the note that holds the link and is named after the
// target's plain basename (no anchor, no folder prefix, no ".md"), with
// Windows-illegal filename characters stripped — a label can be arbitrary
// prose now ("Add link" wraps any selection), and a filename the fs rejects
// would leave a store-only note that never survives a restart. Returns ""
// only when the target names nothing at all.
//
// Split from openWikilinkTarget because several callers need the path BEFORE
// navigating: they mint the target's id and rewrite the link in the buffer
// they are leaving, which needs the resolved note while the editor still holds
// the referring note.
export function resolveOrCreateWikilinkTarget(title: string): string {
  const path = findPathByTitle(title);
  if (path) return path;
  const name = normalizeTarget(title)
    .split("/")
    .pop()
    ?.replace(/[\\:*?"<>|]/g, "")
    .trim();
  if (!name) return "";
  return createNoteIn(activeNoteFolder(), name, false);
}

// Open a note by title, creating it first if it doesn't exist yet.
export function openWikilinkTarget(title: string) {
  const path = resolveOrCreateWikilinkTarget(title);
  if (path) selectNoteByPath(path);
}
export function openAllWikilinkTargets(titles: string[]) {
  for (const t of titles) openWikilinkTarget(t);
}

// Open a note by its stable id. Unlike a title link, a dead id is a NO-OP, not
// a click-to-create: the id names one specific note (deleted/binned), and
// creating a fresh note under a display text would silently fork the content.
export function openNoteById(id: string): void {
  const path = findPathById(id);
  if (path) selectNoteByPath(path);
}

// "Open all in tabs" over raw ids (legacy links and widget-context fallbacks).
// Opens the ids that resolve and SKIPS the ones that don't — openNoteById's
// contract exactly.
export function openAllNotesByIds(ids: string[]): void {
  for (const id of ids) openNoteById(id);
}

// ── Opening a link = resolving its slots ──────────────────────────────────────
// Opening is where a link's empty slots FILL. The wanted target(s) — the one
// the user clicked, a menu row, or all of them for "Open all in tabs" — are
// resolved: a real slot opens by id (dead → no-op), an empty one
// resolves-or-CREATES its segment's note, gets an id minted, and the slot list
// in the document is rewritten with it. Only the wanted slots fill — "nothing
// is created while typing; the note is created when you click it" is the
// user's rule, applied per segment — and the visible [[…]] text never moves
// (the label is preserved byte-for-byte; only the hidden parenthetical
// changes).
//
// `view`/`range` may be null (no editor) and the state may be readOnly
// (reading mode): then nothing is rewritten and this degrades to plain "open
// the link" — an unrewritable link must still work as a link. The rewrite is
// also skipped when the range no longer holds the same link (the menu captured
// it when it opened; the doc may have changed) — a splice at a wrong offset
// corrupts the note the user was reading, which is the one unacceptable
// outcome here.

// The link as it reads RIGHT NOW, or null when this range holds nothing we are
// allowed to rewrite. The range is clamped, and its text has to still parse as
// a note link with exactly `segments` (same text, same order).
function linkSourceAt(
  view: EditorView,
  range: { from: number; to: number },
  segments: string[],
): { from: number; raw: string; inner: string; slots: (string | null)[] } | null {
  const len = view.state.doc.length;
  const from = Math.max(0, Math.min(range.from, len));
  const to = Math.max(from, Math.min(range.to, len));
  if (to - from < 4) return null;
  const raw = view.state.sliceDoc(from, to);
  const parts = noteLinkParts(raw);
  if (!parts) return null;
  const segs = splitRawSegments(parts.inner);
  if (segs.length !== segments.length) return null;
  const found = segs.map((s) => unescapeSegment(s.raw).trim());
  if (found.some((t, i) => t !== segments[i])) return null;
  return {
    from,
    raw,
    inner: parts.inner,
    slots: segs.map((_, i) => slotFor(parts.slots, i)),
  };
}

export function openLinkAt(
  view: EditorView | null,
  range: { from: number; to: number } | null,
  segments: string[],
  slots: (string | null)[],
  open: number | "all" = 0,
): void {
  if (!segments.length) return;

  // Reading mode is a view, not an edit session: no rewrite there (the state is
  // readOnly, so a dispatch would be dropped anyway).
  const src =
    view && range && !view.state.readOnly ? linkSourceAt(view, range, segments) : null;
  // The DOCUMENT's slots win over the caller's snapshot when both exist — the
  // menu may have been open across an edit that filled a slot.
  const liveSlots = src ? src.slots : slots;

  const wanted = (i: number) => open === "all" || i === open;

  // Resolve every wanted target. Real slot → by id, dead id → "" (a deliberate
  // no-op, never click-to-create). Empty slot → resolve-or-CREATE by title.
  const paths = segments.map((seg, i) => {
    if (!wanted(i)) return "";
    const id = liveSlots[i] ?? null;
    return id ? findPathById(id) : resolveOrCreateWikilinkTarget(seg);
  });

  // Fill the wanted empty slots, if there is a link to write them into.
  const fillIdx = segments
    .map((_, i) => i)
    .filter((i) => wanted(i) && liveSlots[i] === null && paths[i] !== "");
  if (view && src && fillIdx.length) {
    // ⚠ ensureNoteId CAN REPLACE THIS DOCUMENT (state/noteId's header: it
    // flushes the live buffer, mints the id into the target's frontmatter and
    // reloads the buffer — skip any of the three and the link we are about to
    // write goes permanently dead). When a target IS the open note (a
    // self-link), withNoteId inserts a frontmatter block at the very TOP and
    // every position below shifts. So ALL ids are minted before a single
    // offset is used: one lenBefore before the first call, one shift after the
    // last, collapsing however many replacements happened into one delta.
    const lenBefore = view.state.doc.length;
    flushEditor();
    const newSlots = liveSlots.slice();
    for (const i of fillIdx) newSlots[i] = ensureNoteId(paths[i]);
    reloadEditorDoc();

    // withNoteId only ever writes at the TOP of a note, strictly before any
    // position a rendered link can occupy, so the delta is a usable shift — but
    // a HINT only: the authoritative range comes back out of the freshly parsed
    // tree, and the rewrite happens only if that range still holds
    // character-for-character the same link we read before. On failure the
    // notes are still created and the navigation still happens — only the
    // splice is abandoned.
    const len = view.state.doc.length;
    const hint = Math.max(0, Math.min(src.from + (len - lenBefore), len));
    const fresh = wikilinkRangeAt(view, hint);
    if (fresh && view.state.sliceDoc(fresh.from, fresh.to) === src.raw) {
      view.dispatch({
        changes: { from: fresh.from, to: fresh.to, insert: compoundLink(src.inner, newSlots) },
        userEvent: "input.wikilink",
      });
    }
  }

  // Navigate LAST, so the rewrite is already in the buffer when the note swap
  // flushes it (components/editor/Editor flushes the outgoing buffer).
  if (open === "all") {
    for (const p of paths) if (p) selectNoteByPath(p);
  } else if (paths[open]) {
    selectNoteByPath(paths[open]);
  }
}

// ── Label edit → rename the target ────────────────────────────────────────────
// The parent-side half of the two-way label/title contract (the grammar
// header's LABELS section): editing a segment's text renames the note its slot
// pins. Driven by editor/linkEditCommit when the caret leaves an edited link.
// renamePath then does everything a rename always does — including rewriting
// OTHER notes' segments that still read as the old title — so one label edit
// propagates everywhere titles are tracked. Returns false when the rename was
// rejected (empty/illegal/duplicate name); the label then simply stays as the
// user wrote it, which under the labels-are-the-writer's rule is a valid state
// (a prose label), not an error to undo.
export function renameNoteById(id: string, newTitle: string): boolean {
  const path = findPathById(id);
  if (!path) return false;
  const clean = newTitle.trim();
  if (!clean) return false;
  if (titleKey(noteTitleOfPath(path)) === titleKey(clean)) return true; // already that title
  return renamePath(path, clean) !== null;
}

function stripFrontmatter(text: string): string {
  const m = /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n?/.exec(text);
  return m ? text.slice(m[0].length) : text;
}

// A short preview of a note for the hover card.
export interface NotePreview {
  title: string;
  exists: boolean;
  lines: string[];
}
export function notePreview(title: string): NotePreview {
  const path = findPathByTitle(title);
  if (!path) return { title, exists: false, lines: [] };
  return notePreviewByPath(path);
}
// Preview an already-resolved note (id slots skip title resolution — resolving
// the label again could land on a same-named note in another folder).
export function notePreviewByPath(path: string): NotePreview {
  const noteTitle = noteTitleOfPath(path);
  const body = stripFrontmatter(readDoc(path));
  const out: string[] = [];
  for (const raw of body.split("\n")) {
    const l = raw.trim();
    if (!l) continue;
    const clean = l
      .replace(/^#{1,6}\s+/, "") // heading marks
      .replace(/^>\s?/, "") // blockquote
      .replace(/^[-*+]\s+/, "• ") // bullets
      // [[A|B]](id:…) and [[A|B]] → the first segment's text, unescaped.
      .replace(/\[\[((?:\\.|[^\\\]\n])+)\]\](?:\(id:[A-Za-z0-9_,]+\))?/g, (_, i: string) =>
        unescapeSegment(splitRawSegments(i)[0].raw).trim(),
      )
      // legacy [display](id:X) → its display text
      .replace(/\[([^\]\n]+)\]\(\s*id:[A-Za-z0-9,]+\s*\)/g, "$1")
      .replace(/[`*_~]/g, ""); // inline emphasis/code marks
    if (out.length === 0 && clean === noteTitle) continue; // skip a leading H1 = title
    out.push(clean);
    if (out.length >= 4) break;
  }
  return { title: noteTitle, exists: true, lines: out };
}

// ── Hover show/hide with a small close delay (so the pointer can travel from the
//    link into the card without it vanishing). ─────────────────────────────────
let hideTimer: number | undefined;
export function showWikilink(h: WikilinkHover) {
  clearTimeout(hideTimer);
  setWikilinkHover(h);
}
export function scheduleHideWikilink() {
  clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => setWikilinkHover(null), 160);
}
export function cancelHideWikilink() {
  clearTimeout(hideTimer);
}
export function hideWikilinkNow() {
  clearTimeout(hideTimer);
  setWikilinkHover(null);
}

// ── "Add note" to a link ──────────────────────────────────────────────────────
// From the link's right-click menu: name a note, and it's appended as another
// target of the link — created (in the current note's folder) if it doesn't
// exist yet and its id minted RIGHT THEN, because "Add note" is an explicit
// act of naming (the same contract as the autocomplete's "New note" row):
//   [[A]](id:X)   → [[A | B]](id:X,Y)
//   [[A]]         → [[A | B]](id:_,Y)      (A's slot stays empty until clicked)
// `addNoteLink` holds the document range of the link being extended while the
// name dialog is open.
export const [addNoteLink, setAddNoteLink] = createSignal<{ from: number; to: number } | null>(null);

export function openAddNoteForLink(from: number, to: number) {
  setAddNoteLink({ from, to });
}
export function cancelAddNote() {
  setAddNoteLink(null);
}

// Append `name` as another target of the link at the stored range. The stored
// range was captured when the menu opened, so it is validated first: if the doc
// has changed underneath and the range no longer points at a note link, the
// note is still created but nothing is written at the stale offset.
//
// FEEDBACK: appending a target changes nothing on screen (only the first
// segment is the label), so the caret is dropped INSIDE the link — just before
// the closing "]]" — and the editor refocused, which reveals the raw
// [[a | b | name]] under it. The ids stay hidden even in that reveal (the live
// preview hides the parenthetical unconditionally), so this is safe for every
// link — there is no longer a form whose reveal would leak machine identity.
export function confirmAddNote(rawName: string) {
  const target = addNoteLink();
  setAddNoteLink(null);
  // Drop characters that would break the [[…|…]] syntax as a TITLE (| [ ] # ^)
  // or aren't valid in a filename (/ \ : * ? " < >). The name only ever becomes
  // a note title here, and titles must stay grammar-clean so the segment that
  // carries this name needs no escapes.
  const name = rawName.replace(/[\\/:*?"<>|[\]#^]/g, "").trim();
  const view = editorView();
  if (!target || !name || !view) return;

  const docLen = view.state.doc.length;
  const from = Math.max(0, Math.min(target.from, docLen));
  const to = Math.max(from, Math.min(target.to, docLen));
  const raw = view.state.sliceDoc(from, to);

  // The link at the range, in EITHER form. A legacy [display](id:X) range is
  // migrated in the same breath (display survives as the first segment — the
  // old form escaped "[" only, the segment grammar wants | and ] covered too),
  // so the append below has one shape to reason about.
  const parts = noteLinkParts(raw);
  let inner: string | null = null;
  let slots: (string | null)[] = [];
  if (parts) {
    const segs = splitRawSegments(parts.inner);
    inner = parts.inner;
    slots = segs.map((_, i) => slotFor(parts.slots, i));
  } else {
    const d = linkDestination(raw);
    const ids = d ? parseIdTargets(d.dest) : [];
    if (d && ids.length && /^\[/.test(raw)) {
      inner = escapeSegment(raw.slice(1, d.close).replace(/\\\[/g, "["));
      slots = ids.slice();
      // The legacy destination may pin MORE ids than it has labels (the old
      // multi form had one display for n targets) — give the extras their
      // notes' titles, mirroring normalizeNoteLinks.
      const extra = slots.slice(1).map((id) => {
        const p = id ? findPathById(id) : "";
        return escapeSegment(p ? noteTitleOfPath(p) : "Missing note");
      });
      if (extra.length) inner = [inner, ...extra].join("|");
    }
  }

  if (inner !== null) {
    // Duplicate target? By title against every segment, and (below, once the
    // id is known) by id against every slot — no duplicate targets, but still
    // reveal the link so the click visibly did something.
    const want = titleKey(normalizeTarget(name));
    const dupTitle = splitRawSegments(inner).some(
      (s) => titleKey(normalizeTarget(unescapeSegment(s.raw))) === want,
    );

    // 1. Resolve the named note, creating it WITHOUT navigating — the path is
    //    needed while this editor still holds the REFERRING note, because the
    //    target's id has to be minted before the link pointing at it is
    //    written.
    const path = resolveOrCreateWikilinkTarget(name);
    if (path) {
      const lenBefore = view.state.doc.length;
      // 2. ⚠ ensureNoteId CAN REPLACE THIS VERY DOCUMENT — see openLinkAt
      //    above; identical hazard, identical shift-and-verify answer.
      const id = ensureNoteId(path);
      const len = view.state.doc.length;
      const shift = len - lenBefore;
      const sFrom = Math.max(0, Math.min(from + shift, len));
      const sTo = Math.max(sFrom, Math.min(to + shift, len));
      // 3. The hint is VERIFIED before anything is written: the shifted range
      //    must still hold, character for character, the link that was
      //    right-clicked. When it doesn't, the splice is skipped outright —
      //    the note has still been created (the useful half), and a link that
      //    failed to gain a target is trivially repairable, whereas a note
      //    spliced at a wrong offset is not.
      if (view.state.sliceDoc(sFrom, sTo) === raw) {
        const dupId = slots.includes(id);
        if (!dupTitle && !dupId) {
          const newInner = `${inner} | ${escapeSegment(name)}`;
          const insert = compoundLink(newInner, [...slots, id]);
          view.dispatch({
            changes: { from: sFrom, to: sTo, insert },
            // Caret just before the closing "]]" — the reveal IS the feedback.
            selection: { anchor: sFrom + 2 + newInner.length },
            userEvent: "input.wikilink",
          });
        } else {
          // Already a target: nothing to insert, but still drop the caret
          // inside the link so the user sees its targets rather than nothing.
          // Clamped: on a still-legacy range `inner` is the MIGRATED (longer)
          // text while the doc still holds the legacy form, so the arithmetic
          // can overshoot — and a selection past doc.length makes CM throw.
          view.dispatch({
            selection: { anchor: Math.min(sFrom + 2 + inner.length, view.state.doc.length) },
          });
        }
      }
    }
    // Live preview only reveals raw markdown while the editor HAS focus, and
    // the reveal is the whole point. The AddNote dialog (Ark) restores focus on
    // close, and that restore runs after this handler — so focus on the next
    // frame to land past it.
    requestAnimationFrame(() => view.focus());
    return;
  }

  // The stored range no longer points at a link — skip the insert (a stale
  // offset would corrupt unrelated text) and just create the named note.
  if (!findPathByTitle(name)) {
    const base = normalizeTarget(name).split("/").pop()?.trim() ?? "";
    if (base) createNoteIn(activeNoteFolder(), base, false); // create, don't leave the note
  }
}
