// CM6 DOM handlers for rendered note links (the .cm-wikilink spans the live
// preview produces on non-cursor lines). Hover → show the preview card for the
// link's targets; left-click → open the first (shown) target. The right-click
// menu (EditorContextMenu) handles opening the other targets, opening all in
// tabs, and adding a note.
//
// A left-click is also where a link's SLOT fills. [[Name]] is the typed form;
// clicking it resolves-or-creates the clicked target, mints its id, and the
// hidden (id:…) list is appended/filled in place — the visible text never
// moves. That rewrite lives in state/wikilink's openLinkAt (the right-click
// menu runs the identical path — a link must not behave differently depending
// on which mouse button reached it); this file is what it is for: DOM events.
//
// RESOLUTION IS POSITION-FIRST: the handlers read the link out of the syntax
// tree at the clicked element's position (editor/linkRanges.noteLinkAt), which
// is the same walk the menu and the rewrite use. The span's data attributes
// are only the FALLBACK for spans that live inside block widgets (table cells,
// embed cards — markdownRender's output), where posAtDOM lands on the widget,
// not on any link. Those fallbacks open without rewriting — there is no
// syntax-tree range to rewrite through.
import { EditorView } from "@codemirror/view";
import {
  showWikilink,
  scheduleHideWikilink,
  hideWikilinkNow,
  openLinkAt,
  linkTargets,
  noteTitleOfPath,
  openWikilinkTarget,
  type HoverTarget,
} from "../state/wikilink";
import { selectNoteByPath } from "../state/ui";
import { findPathById } from "../state/noteId";
import { noteLinkAt } from "./linkRanges";
import { splitRawSegments, unescapeSegment } from "../graph/wikilinkParse";

function wikilinkEl(e: Event): HTMLElement | null {
  const t = e.target as HTMLElement | null;
  return t?.closest?.(".cm-wikilink") ?? null;
}

// Whether this span lives inside a block WIDGET (an embed card, a rendered
// table) rather than in the editor's own text flow. It matters because
// posAtDOM on such a span reports the WIDGET's document position — a position
// that has nothing to do with the link, and that can coincide exactly with the
// end of an unrelated link sitting just before the widget. Resolving the tree
// there would then open (and slot-fill, and create a note for) a link the user
// never clicked. Inside a widget the attributes are the only truth available,
// and they are complete, so the tree walk is skipped outright.
function inWidget(el: HTMLElement): boolean {
  return !!el.closest(".cm-embed-card, .cm-table-wrap, .md-render, .cm-embed");
}

// Hover/click targets for a widget-context span, from the attribute contract
// editor/markdownRender emits. null → not a note-link span at all.
function attributeTargets(el: HTMLElement): HoverTarget[] | null {
  // Compound / bare links: data-wikilink carries the raw inner text and
  // data-link-slots the positional slot list ("_" for unresolved). Checked
  // FIRST because a compound span carries data-note-id too, and only this
  // branch knows the slot POSITIONS — which segment each id belongs to, and
  // which segments resolve by title instead.
  const inner = el.getAttribute("data-wikilink");
  if (inner !== null) {
    const segments = splitRawSegments(inner).map((s) => unescapeSegment(s.raw).trim());
    const slotAttr = el.getAttribute("data-link-slots");
    const slots = slotAttr
      ? slotAttr.split(",").map((s) => (s === "_" ? null : s))
      : segments.map(() => null);
    // linkTargets is the same resolver the in-editor path uses, so a title that
    // names a real note resolves here too — a rendered link must not claim its
    // targets are all new notes just because it is being viewed inside an
    // embed.
    return linkTargets(segments, slots);
  }
  // Legacy [display](id:X) spans: ids only, no titles to resolve.
  const noteId = el.getAttribute("data-note-id");
  if (noteId !== null) {
    const ids = (el.getAttribute("data-note-ids") || noteId).split(",").filter(Boolean);
    return ids.map((id) => {
      const p = findPathById(id);
      return { title: p ? noteTitleOfPath(p) : "Note not found", path: p, canCreate: false };
    });
  }
  return null;
}

// Open a widget-context link's first target: by id when its slot is real, by
// title (creating it) otherwise — the same first-target rule a click in the
// editor follows, minus the slot-filling rewrite (there is no syntax-tree range
// to rewrite through).
function openFromAttributes(el: HTMLElement): void {
  const targets = attributeTargets(el);
  const first = targets?.[0];
  if (!first) return;
  if (first.path) selectNoteByPath(first.path);
  else if (first.canCreate) openWikilinkTarget(first.title);
  // dead id → deliberate no-op
}

export const wikilinkInteractions = EditorView.domEventHandlers({
  mouseover(e, view) {
    const el = wikilinkEl(e);
    if (!el) return false;
    const pos = inWidget(el) ? -1 : view.posAtDOM(el);
    const info = pos >= 0 ? noteLinkAt(view, pos) : null;
    const targets = info
      ? linkTargets(info.segments, info.slots)
      : attributeTargets(el);
    if (!targets || !targets.length) return false;
    // The card appears when at least one target is alive OR creatable. A link
    // whose every target is a dead id shows nothing: there is nothing to
    // preview and no click-to-create story (see openNoteById), so the --new
    // dimming is the whole signal.
    if (!targets.some((t) => t.path || t.canCreate)) return false;
    showWikilink({
      label: el.textContent || "",
      targets,
      rect: el.getBoundingClientRect(),
    });
    return false;
  },
  mouseout(e) {
    if (!wikilinkEl(e)) return false;
    scheduleHideWikilink();
    return false;
  },
  mousedown(e, view) {
    const el = wikilinkEl(e);
    if (!el) return false;
    // Keep the caret OFF the link for either button: a left-click opens it; a
    // right-click opens the menu. If the caret were allowed to land on the token
    // it would reveal the raw [[…]] markdown (and drop the .cm-wikilink span),
    // making the right-click menu lose the link it was over.
    e.preventDefault();
    if (e.button === 0) {
      const pos = inWidget(el) ? -1 : view.posAtDOM(el);
      const info = pos >= 0 ? noteLinkAt(view, pos) : null;
      if (info) {
        // One target or five, the same path: open (and, for an empty slot,
        // create + fill) the first target. The range comes from the syntax
        // tree; openLinkAt re-verifies it before writing anything.
        openLinkAt(view, { from: info.from, to: info.to }, info.segments, info.slots, 0);
      } else {
        // Widget-context fallback: open without rewriting.
        openFromAttributes(el);
      }
    }
    hideWikilinkNow();
    return true;
  },
});
