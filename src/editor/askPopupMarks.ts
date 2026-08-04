// Ask-AI mark decorations: the passage an "Ask AI about this" popup was opened
// on stays marked (.cm-ask-mark) so hovering it can recall the popup. This is a
// pure CM6 extension — state/askPopup.ts drives it via the effects below and
// reads it back with askMarkRanges. IMPORTANT: this module imports ONLY
// @codemirror/*. Importing anything under src/state would close the cycle
// createEditorState → askPopupMarks → state/editor → createEditorState (the
// same cycle that keeps Ctrl+Shift+A out of the CM keymap — see AskBar.tsx), so
// the state layer registers hover callbacks instead of being imported.
import { StateEffect, StateField, type EditorState, type Extension } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";

export const addAskMark = StateEffect.define<{ id: string; from: number; to: number }>({
  map: (v, m) => ({ id: v.id, from: m.mapPos(v.from), to: m.mapPos(v.to) }),
});
// Removes the mark carrying this id (matched via its data-ask-id attribute).
export const removeAskMark = StateEffect.define<string>();

const askMarkField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(addAskMark)) {
        const { id, from, to } = e.value;
        if (from < to) {
          deco = deco.update({
            add: [
              Decoration.mark({
                class: "cm-ask-mark",
                attributes: { "data-ask-id": id },
              }).range(from, to),
            ],
          });
        }
      } else if (e.is(removeAskMark)) {
        const id = e.value;
        deco = deco.update({
          filter: (_from, _to, value) => value.spec.attributes?.["data-ask-id"] !== id,
        });
      }
    }
    // A mark whose text was deleted has nothing left to anchor a hover to —
    // drop it rather than keep a zero-width ghost in the set.
    if (tr.docChanged) deco = deco.update({ filter: (from, to) => from < to });
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// The current marks with their ids — how state/askPopup harvests fresh
// positions before Editor.tsx's setState discards this field on a note swap.
export function askMarkRanges(state: EditorState): { id: string; from: number; to: number }[] {
  const out: { id: string; from: number; to: number }[] = [];
  const deco = state.field(askMarkField, false);
  if (!deco) return out;
  const iter = deco.iter();
  while (iter.value) {
    const id = iter.value.spec.attributes?.["data-ask-id"];
    if (id) out.push({ id, from: iter.from, to: iter.to });
    iter.next();
  }
  return out;
}

// Hover callbacks, registered by state/askPopup at its module init (it cannot
// be imported from here — see the header).
//
// The hover reports a SET of ids, not one. Asking a second question about the
// same passage lays a second mark over the identical range, and overlapping
// mark decorations render as NESTED spans — so `closest(".cm-ask-mark")` only
// ever found the innermost one and every other answer on that text was
// unreachable by hovering. What the pointer is really over is a document
// POSITION, and the honest answer to "which questions is this text carrying" is
// every mark covering that position; DOM nesting is an artefact of how CM6
// happens to paint two marks on one range, not a ranking.
let hoverCb: ((ids: string[], rect: DOMRect) => void) | null = null;
let leaveCb: (() => void) | null = null;
export function registerAskMarkHover(
  onHover: (ids: string[], rect: DOMRect) => void,
  onLeave: () => void,
): void {
  hoverCb = onHover;
  leaveCb = onLeave;
}

const askMarkHover = EditorView.domEventHandlers({
  mouseover(e, view) {
    const el = (e.target as HTMLElement | null)?.closest?.(".cm-ask-mark");
    if (!el) return false;
    const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
    // Endpoints are inclusive: a pointer on the first or last character of a
    // passage is still on it. That can over-report by one at a boundary two
    // separate passages share, which is the cheap side of the trade — the
    // expensive side is a question that cannot be reached at all.
    const covering =
      pos === null
        ? []
        : askMarkRanges(view.state)
            .filter((r) => r.from <= pos && pos <= r.to)
            .map((r) => r.id);
    // posAtCoords returns null outside the rendered content, and can snap to a
    // line boundary just off the mark, so the hovered span's OWN id is the
    // floor — that is exactly the old single-id behaviour, kept as a fallback
    // rather than dropping the hover on the floor.
    const own = el.getAttribute("data-ask-id");
    const ids = covering.length ? covering : own ? [own] : [];
    // The order here is DOCUMENT order, which is arbitrary for marks that share
    // a range — state/askPopup re-orders by entry creation before showing the
    // strip. It has to be done there: this module never sees an entry, and
    // importing the one that owns them would close the cycle in the header.
    //
    // The anchor stays the hovered element's own rect: it is the span actually
    // under the pointer, which is where the card should hang however many marks
    // turn out to cover it.
    if (ids.length) hoverCb?.(ids, el.getBoundingClientRect());
    return false;
  },
  mouseout(e) {
    const el = (e.target as HTMLElement | null)?.closest?.(".cm-ask-mark");
    if (!el) return false;
    // One mark range renders as several spans (wrapped lines, overlapping
    // decorations), and SEVERAL marks can sit on one passage — so the pointer
    // crosses between spans carrying DIFFERENT ids without ever leaving the
    // marked text. Any .cm-ask-mark under the destination therefore counts as
    // "still inside", whichever id it holds; the mouseover that immediately
    // follows re-reports what is really there, and state/askPopup's grace timer
    // covers the gap between the two events.
    const rel = e.relatedTarget instanceof Element ? e.relatedTarget.closest(".cm-ask-mark") : null;
    if (rel) return false;
    leaveCb?.();
    return false;
  },
});

export const askPopupMarks: Extension = [askMarkField, askMarkHover];
