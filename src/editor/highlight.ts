// The single owner of the highlight syntax: what "highlighted text" looks like
// on disk, how to find one under a selection, and how to toggle it on/off as
// one transaction. This module still OWNS both encodings, but only WRITES one
// of them now: the context menu dropped its colour submenu, so `==text==` is
// the only form new highlights ever take. highlightAt/toggleHighlight still
// PARSE the legacy `<mark style="background:#hex">…</mark>` form too, so notes
// highlighted before that change keep rendering and can still be un-highlighted
// (toggleHighlight passes the hit's own hex right back in to unwrap it). The
// live preview (editor/livePreview.ts) and the reading-view renderer
// (editor/markdownRender.ts) both RENDER what this file writes/parses, but
// neither of them writes it — this module is the only place either form gets
// constructed or read, so the three can never drift out of sync with each other.
import { EditorSelection, type EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { isHex } from "../theme/colorEngine";

export interface HighlightHit {
  from: number; // start of the full marked-up range (incl. delimiters)
  to: number; // end of the full marked-up range (incl. delimiters)
  innerFrom: number; // start of the highlighted text itself
  innerTo: number; // end of the highlighted text itself
  hex: string | null; // null = the `==…==` form
}

// Matches EITHER encoding in one left-to-right pass, so scanning a line finds
// whichever form is actually there without a second pass:
//   group `style`/`markInner` → <mark style="background:#hex">inner</mark>
//   group `hlInner`          → ==inner==
// Both forms are single-line (matches the live preview's per-line scanner), so
// this only ever runs against one line's text, never the whole document.
const HIGHLIGHT_RE =
  /<mark(?:\s+style="(?<style>[^"]*)")?>(?<markInner>[\s\S]*?)<\/mark>|==(?<hlInner>[^=]+)==/g;

// The highlight (default or coloured) whose range CONTAINS [from, to) on the
// line `from` sits on — or null. "Contains" rather than "equals" on purpose:
// touching or partially selecting an existing highlight acts on the WHOLE
// token, the same way a caret anywhere inside a [[wikilink]] is treated as
// being "on" the whole link elsewhere in this editor.
export function highlightAt(state: EditorState, from: number, to: number): HighlightHit | null {
  const line = state.doc.lineAt(from);
  const relFrom = from - line.from;
  const relTo = to - line.from;

  HIGHLIGHT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = HIGHLIGHT_RE.exec(line.text))) {
    const s = m.index;
    const e = s + m[0].length;
    if (s > relFrom || relTo > e) continue; // this match doesn't contain the selection

    const g = m.groups;
    if (!g) continue;
    if (g.markInner !== undefined) {
      // Only a hex that passes isHex is ever trusted as a colour — a malformed
      // or hand-edited style attribute just falls back to "no colour" rather
      // than propagating garbage into a style string anywhere downstream.
      const raw = g.style ? /background:\s*(#[0-9a-fA-F]{3,8})/.exec(g.style)?.[1] : undefined;
      const hex = raw && isHex(raw) ? raw : null;
      const closeLen = "</mark>".length;
      const openLen = m[0].length - g.markInner.length - closeLen;
      return {
        from: line.from + s,
        to: line.from + e,
        innerFrom: line.from + s + openLen,
        innerTo: line.from + e - closeLen,
        hex,
      };
    }
    // g.hlInner matched — the `==…==` form.
    return {
      from: line.from + s,
      to: line.from + e,
      innerFrom: line.from + s + 2,
      innerTo: line.from + e - 2,
      hex: null,
    };
  }
  return null;
}

// Case-insensitive so a hand-typed `#FFD54A` in the note still reads as "the
// same colour" as the lowercase hex this module writes.
const sameColor = (a: string | null, b: string | null) =>
  (a ?? "").toLowerCase() === (b ?? "").toLowerCase();

const openTag = (hex: string | null) => (hex ? `<mark style="background:${hex}">` : "==");
const closeTag = (hex: string | null) => (hex ? "</mark>" : "==");

// Toggle the highlight covering [from, to) as ONE transaction (one undo step):
//   • no existing hit           → wrap the trimmed selection in `hex`'s form
//   • hit is already this `hex` → unwrap (drop the markers, keep the text)
//   • hit is a different colour → re-wrap the SAME inner text in the new form
// `hex === null` writes the Obsidian-standard `==text==`; any other value
// writes portable `<mark style="background:HEX">` (still parsed for legacy
// notes, though the context menu no longer offers a way to WRITE a new
// colour). Its one caller passes an existing hit's own hex to force the
// unwrap branch (the menu's highlight toggle, for "Remove highlight") instead
// of duplicating that branch.
export function toggleHighlight(view: EditorView, from: number, to: number, hex: string | null): void {
  const hit = highlightAt(view.state, from, to);

  if (hit) {
    const inner = view.state.sliceDoc(hit.innerFrom, hit.innerTo);
    if (sameColor(hit.hex, hex)) {
      view.dispatch({
        changes: { from: hit.from, to: hit.to, insert: inner },
        selection: EditorSelection.range(hit.from, hit.from + inner.length),
        userEvent: "input.highlight",
      });
    } else {
      const open = openTag(hex);
      view.dispatch({
        changes: { from: hit.from, to: hit.to, insert: open + inner + closeTag(hex) },
        selection: EditorSelection.range(hit.from + open.length, hit.from + open.length + inner.length),
        userEvent: "input.highlight",
      });
    }
    return;
  }

  // No hit — wrap the trimmed selection (leading/trailing whitespace stays
  // outside the markers, same rule the wikilink wrap uses in linkShortcuts.ts).
  const raw = view.state.sliceDoc(from, to);
  const wFrom = from + (raw.length - raw.trimStart().length);
  const wTo = to - (raw.length - raw.trimEnd().length);
  if (wFrom >= wTo) return; // whitespace-only selection — nothing to wrap
  const open = openTag(hex);
  view.dispatch({
    changes: [
      { from: wFrom, insert: open },
      { from: wTo, insert: closeTag(hex) },
    ],
    selection: EditorSelection.range(wFrom + open.length, wTo + open.length),
    userEvent: "input.highlight",
  });
}
