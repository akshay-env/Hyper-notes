// CM6 DOM handlers for rendered [[wikilinks]] (the .cm-wikilink spans the live
// preview produces on non-cursor lines). Hover → show the preview card for the
// first target; left-click → open that first (shown) target. The right-click
// menu (EditorContextMenu) handles opening the other targets of a multi-target
// link, opening all in tabs, and adding a note.
import { EditorView } from "@codemirror/view";
import {
  parseWikilink,
  showWikilink,
  scheduleHideWikilink,
  hideWikilinkNow,
  openWikilinkTarget,
} from "../state/wikilink";

function wikilinkEl(e: Event): HTMLElement | null {
  const t = e.target as HTMLElement | null;
  return t?.closest?.(".cm-wikilink") ?? null;
}
function innerOf(el: HTMLElement): string {
  return el.getAttribute("data-wikilink") || el.textContent || "";
}

export const wikilinkInteractions = EditorView.domEventHandlers({
  mouseover(e) {
    const el = wikilinkEl(e);
    if (!el) return false;
    const { label, targets } = parseWikilink(innerOf(el));
    showWikilink({ label, targets, rect: el.getBoundingClientRect() });
    return false;
  },
  mouseout(e) {
    if (!wikilinkEl(e)) return false;
    scheduleHideWikilink();
    return false;
  },
  mousedown(e) {
    const el = wikilinkEl(e);
    if (!el) return false;
    // Keep the caret OFF the link for either button: a left-click opens it; a
    // right-click opens the menu. If the caret were allowed to land on the token
    // it would reveal the raw [[…]] markdown (and drop the .cm-wikilink span),
    // making the right-click menu lose the link it was over.
    e.preventDefault();
    if (e.button === 0) {
      const { targets } = parseWikilink(innerOf(el));
      if (targets[0]) openWikilinkTarget(targets[0]);
    }
    hideWikilinkNow();
    return true;
  },
});
