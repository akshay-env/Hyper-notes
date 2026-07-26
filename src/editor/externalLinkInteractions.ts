// CM6 DOM handler for rendered external links — the .cm-link spans the live
// preview produces for [label](url) and <autolink> on non-cursor lines, each
// carrying its URL in data-href. Left-click opens the URL in the system
// browser instead of dropping the caret into the raw syntax (mirror of
// wikilinkInteractions). The caret can still enter the link from the keyboard,
// which reveals the raw markdown for editing.
import { EditorView } from "@codemirror/view";
import { openExternal } from "../backend/openExternal";

function linkEl(e: Event): HTMLElement | null {
  const t = e.target as HTMLElement | null;
  return t?.closest?.(".cm-link[data-href]") ?? null;
}

export const externalLinkInteractions = EditorView.domEventHandlers({
  mousedown(e) {
    if (e.button !== 0) return false; // only left-click follows the link
    const el = linkEl(e);
    if (!el) return false;
    // Keep the caret OFF the link: letting it land would reveal the raw
    // [label](url) markdown instead of following it — the very bug this fixes.
    e.preventDefault();
    const href = el.getAttribute("data-href");
    if (href) void openExternal(href);
    return true;
  },
});
