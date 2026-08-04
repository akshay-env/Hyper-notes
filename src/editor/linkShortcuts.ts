// Typing "[" or "]" with text selected wraps that text in a link instead of
// replacing it — the fast way to turn a phrase into a link. A second "[" on an
// already-wrapped selection is a no-op (it's already a link). The editor's
// right-click "Add link" row calls the exact same transaction
// (wrapSelectionInWikilink is exported for it), so the key and the menu item
// can never drift apart.
//
// The wrap writes the compound form [[text]](id:XYZ) and the id exists FROM
// BIRTH: the selection's note is resolved — or CREATED, in the current note's
// folder — and its id minted before the link is written. That is the user's
// explicit contract for this gesture ("if the user selects a text and clicked
// [ to create the link, the ID should be created instantly"): unlike typing
// [[…]] by hand, wrapping a selection is an act of naming a note, the same as
// picking the autocomplete's "New note" row. The selected text survives
// byte-for-byte as the label (grammar characters escaped invisibly); the note
// it creates is named after the selection with filename-illegal characters
// stripped.
//
// A selection that cannot be a label in one piece (it spans lines) falls back
// to the plain [[text]] wrap with nothing created — a multi-line "label" is
// not a nameable note, and the bare form still resolves-or-creates on click.
//
// Returning false on an empty selection is load-bearing, not just tidy: it is
// what lets the keydown through to auto-close (autoClose.ts), which turns a
// bare "[" into "[]" and a second one into the "[[]]" wikilink skeleton. These
// bindings therefore own the with-a-selection case and auto-close owns the
// without-one case, and they cannot collide — a keymap claims the keydown
// before any text insertion exists for an input handler to see.
//
// Reaching into state/ from an editor extension is safe in this direction —
// and the state/wikilink import rides the same already-closed (and inert)
// cycle its siblings wikilinkComplete/wikilinkInteractions ride; see
// wikilinkComplete's header for the argument.
import {
  EditorSelection,
  type ChangeSpec,
  type EditorState,
  type SelectionRange,
  type TransactionSpec,
} from "@codemirror/state";
import type { KeyBinding } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { ensureNoteId } from "../state/noteId";
import { resolveOrCreateWikilinkTarget } from "../state/wikilink";
import {
  noteLinkParts,
  parseIdTargets,
  escapeSegment,
  compoundLink,
} from "../graph/wikilinkParse";

// Already-a-link guard, all four ways round. The selection may OVERLAP a link
// at all (wholly or partly), or — because wrapping leaves the label selected —
// sit right inside one, or sit inside a legacy [display](id:XYZ) as its display
// text. Pressing "[" must not wrap any of them.
//
// The overlap case is the one with teeth. A link's hidden "(id:…)" tail is part
// of the document but not of the picture, so dragging from before a chip to a
// word after it silently swallows the tail: the wrap would then escape that
// link's own brackets into label text — putting the machine id on screen as
// prose, destroying the original link, and creating a note named after the
// whole mess. The syntax tree is what sees the tail, hence the walk rather than
// a text test.
function overlapsLink(state: EditorState, range: { from: number; to: number }): boolean {
  let hit = false;
  syntaxTree(state).iterate({
    from: range.from,
    to: range.to,
    enter: (n) => {
      if (n.name === "Wikilink" || n.name === "Embed") {
        hit = true;
        return false;
      }
      return undefined;
    },
  });
  return hit;
}

function alreadyLinked(state: EditorState, range: { from: number; to: number }): boolean {
  const text = state.sliceDoc(range.from, range.to);
  if (noteLinkParts(text) !== null) return true;
  if (overlapsLink(state, range)) return true;
  const before = state.sliceDoc(Math.max(0, range.from - 2), range.from);
  if (before === "[[") {
    // Inside [[…]] — the closing "]]" (with or without an id tail) sits ahead.
    const after = state.sliceDoc(range.to, Math.min(state.doc.length, range.to + 2));
    if (after === "]]") return true;
  }
  if (state.sliceDoc(Math.max(0, range.from - 1), range.from) !== "[") return false;
  // Legacy form: enough lookahead for "](id:" plus a long destination list; the
  // destination is read through the grammar's own parseIdTargets, so this
  // agrees with the renderer about what counts as an id link.
  const rest = state.sliceDoc(range.to, Math.min(state.doc.length, range.to + 200));
  const m = /^\]\(([^)\n]*)\)/.exec(rest);
  return m ? parseIdTargets(m[1]).length > 0 : false;
}

// A selection that can be one link's label: non-empty, single-line. (Grammar
// characters are no longer a problem — they get escaped — but a label cannot
// cross a line break.)
const linkable = (text: string) => text !== "" && !text.includes("\n");

// Wrap every non-empty selection range in a link. Returns false (letting the
// key insert normally) when nothing is selected.
export function wrapSelectionInWikilink(view: {
  state: EditorState;
  dispatch: (tr: TransactionSpec) => void;
}): boolean {
  const state = view.state;
  const ranges = state.selection.ranges;
  if (ranges.every((r) => r.empty)) return false;
  if (ranges.some((r) => !r.empty && alreadyLinked(state, r))) return true;

  // Resolve-or-create EVERY range's note and mint EVERY id before a single
  // offset is spent, because ensureNoteId can replace this document: when the
  // selected text names the note the editor is currently showing (a
  // self-link), it mints an `id:` into that note's frontmatter and reloads the
  // buffer from the store — state/noteId's header explains why it must, and
  // why skipping it would leave the link we are about to write permanently
  // dead. withNoteId writes at the very TOP of the note, so the insertion is a
  // pure prefix and every position below moves by the same delta; one
  // `lenBefore` before the first mint and one length read after the last
  // collapses however many replacements happened into a single shift.
  const texts = ranges.map((r) => (r.empty ? "" : state.sliceDoc(r.from, r.to)));
  const paths = texts.map((t) =>
    linkable(t) ? resolveOrCreateWikilinkTarget(t.trim()) : "",
  );
  const lenBefore = state.doc.length;
  const ids = paths.map((p) => (p ? ensureNoteId(p) : ""));

  const now = view.state; // NOT `state` — ensureNoteId may have replaced it
  const len = now.doc.length;
  const shift = len - lenBefore;

  const changes: ChangeSpec[] = [];
  const selection: SelectionRange[] = [];
  let delta = 0; // length added by the changes BEFORE this one
  for (let i = 0; i < ranges.length; i++) {
    // Clamped so a delta this code did not predict can never produce an
    // out-of-range change spec (CM6 throws on one).
    const from = Math.max(0, Math.min(ranges[i].from + shift, len));
    const to = Math.max(from, Math.min(ranges[i].to + shift, len));
    if (ranges[i].empty) {
      selection.push(EditorSelection.cursor(from + delta));
      continue;
    }
    // The shift is a HINT, not gospel — a selection INSIDE the frontmatter sits
    // in the region withNoteId rewrote and does not move uniformly. So each
    // shifted range must still hold, character for character, the text that was
    // selected. If one doesn't, nothing at all is written: the notes/ids are
    // already made (harmless — they are the notes' own identity), whereas
    // wrapping at a wrong offset would splice brackets into unrelated prose.
    // The key is still reported as handled so it can't fall through and delete
    // the selection instead.
    if (now.sliceDoc(from, to) !== texts[i]) return true;
    const id = ids[i];
    // Grammar characters in the label are escaped — invisibly, the live
    // preview hides the backslashes — so the user's exact text is what shows.
    const body = escapeSegment(texts[i]);
    const insert = id ? compoundLink(body, [id]) : `[[${body}]]`;
    changes.push({ from, to, insert });
    // Keep the label selected. Positions here are POST-change, hence the
    // running delta; the label always starts 2 chars in ("[[").
    selection.push(EditorSelection.range(from + delta + 2, from + delta + 2 + body.length));
    delta += insert.length - (to - from);
  }
  if (!changes.length) return false;

  view.dispatch({
    changes,
    selection: EditorSelection.create(selection, state.selection.mainIndex),
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
