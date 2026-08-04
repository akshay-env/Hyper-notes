// Keeps the hidden "(id:…)" tail of a compound link attached to it — which is
// the same thing as keeping it INVISIBLE, the one inviolable rule of this
// grammar (graph/wikilinkParse's header).
//
// The tail is drawn by a replacing decoration and registered as an atomic
// range, which stops the CARET from moving through it. That is all it stops.
// The document is still ordinary text, and any edit that damages the link's
// structure strands the parenthetical as plain prose:
//
//   [[Foo]]|(id:AB12)   type a space  →  "[[Foo]] (id:AB12)"
//                       the parser only consumes a tail that sits immediately
//                       after the brackets, so it detaches and SHOWS.
//   [[Foo]]|            backspace     →  "[[Foo](id:AB12)"  … then "[[Foo(id:AB12)"
//                       one keystroke past the chip eats a "]", and the second
//                       leaves the raw id sitting in the middle of the note.
//   [[Foo]](id:AB12)|   backspace     →  the atomic range dies as one unit, so
//                       the id is destroyed with NOTHING changing on screen.
//   select the label, delete          →  "[[]](id:AB12)" is not a link either.
//
// So this filter rewrites the offending transactions:
//
//   • An INSERTION at the tail's start moves to after the tail — which is what
//     the user meant anyway: carry on typing past the link.
//   • A DELETION that touches the link's STRUCTURE (the opening "[[", the
//     closing "]]", the tail, or the whole label at once) takes the entire link
//     instead. The chip disappears, which is honest feedback for an edit that
//     destroys the link, and undo brings it back. Deletions that stay inside
//     the label are untouched — editing the label is the whole point of showing
//     it, and it can never orphan anything.
//
// Links with no tail (a bare, not-yet-resolved [[A]]) are ignored entirely:
// there is nothing hidden to protect, so they stay freely editable.
import { EditorState, Transaction } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { noteLinkParts } from "../graph/wikilinkParse";

interface Change {
  from: number;
  to: number;
  insert: string;
}

// The compound link covering `pos`, with its marker boundaries in document
// coordinates. Resolved from the syntax tree so it agrees with
// editor/linkRanges about where a link is.
interface LinkAt {
  from: number; // start of "[["
  labelFrom: number; // end of "[[" = start of the label
  labelTo: number; // start of "]]" = end of the label
  tailFrom: number; // start of "(id:…)"
  to: number; // end of the link
}

function linkWithTailAt(state: EditorState, pos: number): LinkAt | null {
  const tree = syntaxTree(state);
  for (const side of [1, -1] as const) {
    let node: ReturnType<typeof tree.resolveInner> | null = tree.resolveInner(pos, side);
    while (node) {
      if (node.name === "Wikilink") {
        const parts = noteLinkParts(state.sliceDoc(node.from, node.to));
        if (!parts || parts.destFrom < 0) return null;
        return {
          from: node.from,
          labelFrom: node.from + 2,
          labelTo: node.from + parts.innerTo,
          tailFrom: node.from + parts.destFrom,
          to: node.to,
        };
      }
      node = node.parent;
    }
  }
  return null;
}

// Where a character typed at `pos` should actually go.
//
// Every marker in this grammar is two characters wide ("[[", "]]"), so each has
// an INTERIOR position the caret can legally occupy while the link shows its
// raw form — and a character landing there splits the marker, which un-parses
// the link and strands the "(id:…)" as visible prose. "[[Alpha]|]" plus a "Z"
// becomes "[[Alpha]Z](id:…)": no longer a link, id on screen.
//
// So an insertion inside a marker is nudged to the nearest position that keeps
// the link whole and still matches where the user was pointing: inside "[[" or
// "]]" it joins the LABEL (typing at the edge of the visible text means editing
// that text), and anywhere in the hidden tail it lands AFTER the link (there is
// nothing there to edit — the user is carrying on with the sentence).
//
// Returns null when `pos` needs no correction.
function redirectInsertion(state: EditorState, pos: number): number | null {
  const link = linkWithTailAt(state, pos);
  if (!link) return null;
  if (pos > link.from && pos < link.labelFrom) return link.labelFrom; // inside "[["
  if (pos > link.labelTo && pos < link.tailFrom) return link.labelTo; // inside "]]"
  if (pos >= link.tailFrom && pos < link.to) return link.to; // at/inside the tail
  return null;
}

// Grow a deletion range to swallow any compound link whose structure it would
// break. Ranges that only touch a link's label come back unchanged.
function expandOverLinks(state: EditorState, from: number, to: number): { from: number; to: number } {
  let f = from;
  let t = to;
  syntaxTree(state).iterate({
    // One character of slack on each side: a backspace directly after a link
    // has a range that only TOUCHES the node's end, and iterate() would
    // otherwise not report it.
    from: Math.max(0, from - 1),
    to: Math.min(state.doc.length, to + 1),
    enter: (n) => {
      if (n.name !== "Wikilink") return undefined;
      const parts = noteLinkParts(state.sliceDoc(n.from, n.to));
      if (!parts || parts.destFrom < 0) return false; // no hidden tail to protect
      const openTo = n.from + 2; // end of "[["
      const closeFrom = n.from + parts.innerTo; // start of "]]"
      const hitsOpen = from < openTo && to > n.from;
      const hitsCloseOrTail = from < n.to && to > closeFrom;
      // Emptying the label leaves "[[]](id:…)", which parses as nothing at all
      // — the tail would show. Deleting the label to empty therefore takes the
      // link too.
      const emptiesLabel = from <= openTo && to >= closeFrom;
      if (hitsOpen || hitsCloseOrTail || emptiesLabel) {
        f = Math.min(f, n.from);
        t = Math.max(t, n.to);
      }
      return false;
    },
  });
  return { from: f, to: t };
}

export const linkTailGuard = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged || tr.startState.readOnly) return tr;
  const state = tr.startState;

  const raw: Change[] = [];
  tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) =>
    raw.push({ from: fromA, to: toA, insert: inserted.toString() }),
  );

  let rewritten = false;
  const out: Change[] = [];
  for (const c of raw) {
    if (c.from === c.to && c.insert) {
      const at = redirectInsertion(state, c.from);
      if (at !== null) {
        out.push({ from: at, to: at, insert: c.insert });
        rewritten = true;
        continue;
      }
    } else if (c.to > c.from) {
      const ex = expandOverLinks(state, c.from, c.to);
      if (ex.from !== c.from || ex.to !== c.to) {
        out.push({ from: ex.from, to: ex.to, insert: c.insert });
        rewritten = true;
        continue;
      }
    }
    out.push(c);
  }
  if (!rewritten) return tr;

  // Expansion can make two neighbouring changes overlap (a multi-cursor delete
  // inside one link). CM6 rejects overlapping change specs, so they are merged
  // into one, inserts kept in document order.
  out.sort((a, b) => a.from - b.from || a.to - b.to);
  const merged: Change[] = [];
  for (const c of out) {
    const last = merged[merged.length - 1];
    if (last && c.from < last.to) {
      last.to = Math.max(last.to, c.to);
      last.insert += c.insert;
    } else {
      merged.push({ ...c });
    }
  }

  const userEvent = tr.annotation(Transaction.userEvent);
  return {
    changes: merged,
    // A single change gets an exact caret (just past whatever was inserted, or
    // where the deleted link stood). With several, the original selection is
    // mapped through instead — good enough, and never wrong enough to corrupt.
    selection:
      merged.length === 1
        ? { anchor: merged[0].from + merged[0].insert.length }
        : undefined,
    scrollIntoView: true,
    annotations: userEvent ? Transaction.userEvent.of(userEvent) : undefined,
  };
});
