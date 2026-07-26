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
let hoverCb: ((id: string, rect: DOMRect) => void) | null = null;
let leaveCb: (() => void) | null = null;
export function registerAskMarkHover(
  onHover: (id: string, rect: DOMRect) => void,
  onLeave: () => void,
): void {
  hoverCb = onHover;
  leaveCb = onLeave;
}

const askMarkHover = EditorView.domEventHandlers({
  mouseover(e) {
    const el = (e.target as HTMLElement | null)?.closest?.(".cm-ask-mark");
    if (!el) return false;
    const id = el.getAttribute("data-ask-id");
    if (id) hoverCb?.(id, el.getBoundingClientRect());
    return false;
  },
  mouseout(e) {
    const el = (e.target as HTMLElement | null)?.closest?.(".cm-ask-mark");
    if (!el) return false;
    // One mark range can render as several spans (wrapped lines, overlapping
    // decorations) — moving between spans of the SAME mark is not a leave.
    const rel = e.relatedTarget instanceof Element ? e.relatedTarget.closest(".cm-ask-mark") : null;
    if (rel && rel.getAttribute("data-ask-id") === el.getAttribute("data-ask-id")) return false;
    leaveCb?.();
    return false;
  },
});

export const askPopupMarks: Extension = [askMarkField, askMarkHover];
