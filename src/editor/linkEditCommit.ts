// The parent-side half of the label/title contract (graph/wikilinkParse's
// LABELS section): editing a link's segment text renames the note its slot
// pins. This plugin watches the caret enter and leave note links; a commit
// runs when the caret LEAVES an edited link (or the editor blurs) — never per
// keystroke, so typing "Banana" doesn't rename the child to "B", "Ba", "Ban"…
//
// What a commit does, per segment of the edited link:
//   • Slot holds a real id AND the segment's OLD text was that note's title
//     (a title-tracking label) → the note is renamed to the new text.
//     renamePath then sweeps every other note's title-tracking segments, so
//     one label edit propagates vault-wide.
//   • The old text was NOT the note's title → it is prose (an Ask-AI passage
//     label, or a label the user broke from the title on purpose). Editing
//     prose renames nothing — fixing a typo in a passage must never rename a
//     note to the whole passage.
//   • Slot empty ("_" / bare form) → the segment resolves by title anyway; the
//     edit simply retargets it. Nothing to rename.
//   • Segments ADDED or REMOVED (the pipe count changed) → the hidden slot
//     list is realigned: kept segments keep their ids (matched by text, in
//     order), new segments start unresolved ("_" — they fill on click, per
//     "nothing is created while typing"), removed segments' ids are dropped.
//     No renames in this case — added/edited/removed can't be told apart
//     reliably once the count moves, and a wrong rename is worse than none.
//
// A rejected rename (empty/illegal/duplicate name) is NOT an error: the label
// simply stays as written, which under the labels-are-the-writer's rule is a
// valid prose label.
//
// The commit runs in a microtask — a ViewPlugin's update() must not dispatch.
// It re-reads the link from the CURRENT document and verifies before touching
// anything; when the text no longer parses as a link (the user broke the
// [[…]] mid-edit), everything is left alone.
import { ViewPlugin, type ViewUpdate, EditorView } from "@codemirror/view";
import {
  noteLinkParts,
  splitRawSegments,
  unescapeSegment,
  normalizeTarget,
  titleKey,
  compoundLink,
  slotFor,
} from "../graph/wikilinkParse";
import { wikilinkRangeAt } from "./linkRanges";
import { renameNoteById, noteTitleOfPath } from "../state/wikilink";
import { findPathById } from "../state/noteId";

interface Tracked {
  from: number; // start of the link node, mapped through edits while inside
  to: number; // end of the link node, mapped likewise
  raw: string; // the link's full text when the caret ENTERED it
}

// The base title a segment names: unescaped, trimmed, anchor/".md" dropped,
// folder prefix removed. "" when the segment names nothing.
function segmentTitle(rawSeg: string): string {
  return normalizeTarget(unescapeSegment(rawSeg)).split("/").pop()?.trim() ?? "";
}

function commit(view: EditorView, t: Tracked): void {
  if (!view.dom.isConnected) return; // editor swapped/destroyed underneath us
  const len = view.state.doc.length;
  const probe = Math.max(0, Math.min(t.from + 1, len));
  const range = wikilinkRangeAt(view, probe);
  if (!range) return; // the link is gone (or broken mid-edit) — leave it be
  // The link found must be THE tracked link, starting exactly where it did.
  // Without this, a tracked position that drifted (a document-wide reload
  // collapses interior positions to 0) resolves to whatever link happens to sit
  // near the drifted spot, and the diff below would then compare an unrelated
  // link against a stale baseline — renaming a note after some other link's
  // label. The `update` hook drops tracking when the range collapses; this is
  // the second lock on the same door, because the cost of being wrong here is
  // a wrong vault-wide rename.
  if (range.from !== t.from) return;
  const newRaw = view.state.sliceDoc(range.from, range.to);
  if (newRaw === t.raw) return; // untouched
  const oldParts = noteLinkParts(t.raw);
  const newParts = noteLinkParts(newRaw);
  if (!oldParts || !newParts) return;
  const oldSegs = splitRawSegments(oldParts.inner);
  const newSegs = splitRawSegments(newParts.inner);
  const oldSlots = oldSegs.map((_, i) => slotFor(oldParts.slots, i));

  if (oldSegs.length === newSegs.length) {
    // In-place edits: rename the pinned note of every title-tracking segment
    // whose text changed.
    const newSlots = newSegs.map((_, i) => slotFor(newParts.slots, i));
    for (let i = 0; i < newSegs.length; i++) {
      if (oldSegs[i].raw === newSegs[i].raw) continue;
      const id = oldSlots[i];
      if (!id) continue; // title-resolved segment — the edit IS the retarget
      // The slot must still pin the SAME note. If it doesn't, this segment was
      // not edited — it was REPLACED (pasting a different link over the tracked
      // one brings that link's own hidden slots with it), and renaming the old
      // slot's note after the new link's label would rename a note the user
      // never touched.
      if (newSlots[i] !== id) continue;
      const path = findPathById(id);
      if (!path) continue; // dead id — nothing to rename
      const oldTitle = segmentTitle(oldSegs[i].raw);
      if (titleKey(oldTitle) !== titleKey(noteTitleOfPath(path))) continue; // prose label
      const newTitle = segmentTitle(newSegs[i].raw);
      if (!newTitle) continue;
      renameNoteById(id, newTitle);
    }
    return;
  }

  // Segment count changed: realign the slot list. Kept segments keep their
  // ids — matched by raw text, order-preserving — new ones start unresolved.
  let oi = 0;
  const newSlots = newSegs.map((ns) => {
    for (let k = oi; k < oldSegs.length; k++) {
      if (oldSegs[k].raw === ns.raw) {
        oi = k + 1;
        return oldSlots[k];
      }
    }
    return null;
  });
  const currentSlots = newSegs.map((_, i) => slotFor(newParts.slots, i));
  const differs =
    newSlots.length !== currentSlots.length ||
    newSlots.some((s, i) => s !== currentSlots[i]) ||
    // A parenthetical whose stored length drifted from the segment count is
    // realigned even when the per-segment reading matches (healing).
    (newParts.slots !== null && newParts.slots.length !== newSegs.length);
  if (!differs) return;
  // Verified splice: the doc hasn't changed since newRaw was read (same
  // microtask as the update that scheduled us, but re-check anyway — a wrong
  // offset corrupts the note).
  if (view.state.sliceDoc(range.from, range.to) !== newRaw) return;
  view.dispatch({
    changes: {
      from: range.from,
      to: range.to,
      insert: compoundLink(newParts.inner, newSlots),
    },
    userEvent: "input.wikilink",
  });
}

export const linkEditCommit = ViewPlugin.fromClass(
  class {
    tracked: Tracked | null = null;

    update(u: ViewUpdate) {
      if (u.state.readOnly) {
        this.tracked = null;
        return;
      }
      // Keep the tracked link's range pinned through edits made while inside
      // it (assoc chosen so text typed at either edge stays outside).
      if (u.docChanged && this.tracked) {
        const from = u.changes.mapPos(this.tracked.from, 1);
        const to = u.changes.mapPos(this.tracked.to, -1);
        // A collapsed range means the tracked link was wholly replaced — which
        // is exactly what a document-wide reload does (reloadEditorDoc
        // dispatches one change over the entire doc, and mapPos collapses every
        // interior position to its start). The baseline we would diff against
        // describes text that no longer exists at a position that no longer
        // means anything, so tracking is ABANDONED rather than carried: a
        // commit from here renamed whichever note the drifted position happened
        // to land in. Those reloads are routine — every ensureNoteId on the
        // open note triggers one — so this is the common path, not a corner.
        if (from >= to) this.tracked = null;
        else this.tracked = { ...this.tracked, from, to };
      }
      if (!u.docChanged && !u.selectionSet && !u.focusChanged) return;

      // The link under the caret NOW (only meaningful while focused).
      const head = u.state.selection.main.head;
      const cur = u.view.hasFocus ? wikilinkRangeAt(u.view, head) : null;
      const t = this.tracked;

      if (t) {
        // "Still inside" tolerates a transient tree miss during fast typing
        // (the head hasn't left the mapped range): committing on a hiccup
        // would lose the entry baseline the prose-guard diffs against.
        const stillInside =
          (cur !== null && cur.from === t.from) ||
          (cur === null && u.view.hasFocus && head >= t.from && head <= t.to);
        if (!stillInside) {
          // Caret left the tracked link (or focus left the editor) → commit.
          this.tracked = null;
          const view = u.view;
          queueMicrotask(() => commit(view, t));
        } else if (cur) {
          // Re-anchor the range on the freshly parsed node; the entry
          // baseline (`raw`) is the one thing that must NOT refresh.
          this.tracked = { from: cur.from, to: cur.to, raw: t.raw };
        }
      }
      if (cur && !this.tracked) {
        this.tracked = { from: cur.from, to: cur.to, raw: u.state.sliceDoc(cur.from, cur.to) };
      }
    }
  },
);
