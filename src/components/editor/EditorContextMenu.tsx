// The app's own right-click menu. Mounted once at the shell level, it:
//   1. Suppresses the browser's native context menu EVERYWHERE (its "Reload",
//      "Inspect", "Save image as…" break the illusion of a native app).
//   2. Over a [[wikilink]] → a link menu: open note, each target, open all in
//      tabs, and "Add note" (append another target + create the note). Opening a
//      target from here CONVERTS the link to [display](id:…) first, single- and
//      multi-target alike, through the very same function the left-click uses
//      (state/wikilink's convertWikilinkAndOpen) — a link must not behave
//      differently depending on which mouse button reached it.
//   2b. Over an id link ([display](id:AAA,BBB)) → the near-mirror of that menu:
//      one row per id the destination carries, open all in tabs, and the same
//      "Add note". An id link is meant to be indistinguishable from a wikilink
//      to the reader, so it must not be the one link form where right-click does
//      less. It used to be exactly that: an id destination held a single target,
//      so this menu dropped both multi-target items — and since single-target
//      [[Name]] links convert to the id form the moment they resolve, "add
//      another note to this link" quietly became unreachable in a real vault.
//      That is the regression the list destination (graph/wikilinkParse) and
//      these rows undo.
//   3. Over a text selection → link it (as a wikilink or an external URL),
//      search for it, highlight/remove-highlight it, cut/copy/paste, or ask
//      the AI about it.
// Right-clicking the file tree still opens the tree's own menu (FileTree.tsx),
// which calls preventDefault itself before this handler ever sees the event.
import { type Component, Show, For, createSignal, createMemo, onMount, onCleanup } from "solid-js";
import { Menu } from "@ark-ui/solid/menu";
import { Portal } from "solid-js/web";
import { MenuPointAnchor } from "../core/MenuPointAnchor";
import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { editorView } from "../../state/editor";
import { setNoteSearchSeed, setNoteSearchOpen } from "../../state/ui";
import {
  openLinkAt,
  linkTargets,
  type HoverTarget,
  openAddNoteForLink,
  openNoteById,
  openAllNotesByIds,
} from "../../state/wikilink";
import { openAskPopupAt } from "../../state/askPopup";
import { findPathById } from "../../state/noteId";
// Both link-range walks are shared with the click handler (editor/
// wikilinkInteractions), which rewrites the range this menu only reads from —
// see editor/linkRanges for why they must be one implementation.
import { noteLinkAt, idLinkRangeAt } from "../../editor/linkRanges";
import { wrapSelectionInWikilink } from "../../editor/linkShortcuts";
import { highlightAt, toggleHighlight, type HighlightHit } from "../../editor/highlight";
import { clipWrite, clipRead } from "../../backend/clipboard";

// x/y are the raw pointer position. They no longer need clamping to the viewport
// — the menu's positioner is collision-aware and flips/shifts the panel itself.
type MenuState =
  | { kind: "selection"; x: number; y: number; selection: string; from: number; to: number }
  // A note link ([[A|B]] / [[A|B]](id:X,_)) — one row per segment, resolved
  // when the menu OPENED (state/wikilink's linkTargets) so the panel's labels
  // stay stable while it animates out. `segments`/`slots` are what openLinkAt
  // verifies the range against before rewriting anything. A dead slot keeps
  // its row rather than being filtered out, so the rows can show it as missing
  // instead of the link silently appearing to have one fewer target.
  | {
      kind: "link";
      x: number;
      y: number;
      segments: string[];
      slots: (string | null)[];
      targets: HoverTarget[];
      from: number;
      to: number;
    }
  // A LEGACY id link ([display](id:AAA,BBB)) — read-only form, still fully
  // usable from the menu until its note is opened and normalized. `paths[i]`
  // is what `ids[i]` pointed at when the menu opened; "" = deleted/binned.
  | {
      kind: "idlink";
      x: number;
      y: number;
      ids: string[];
      paths: string[];
      from: number;
      to: number;
    };

// A clipboard string that's plainly a URL — used by "Add external link" to
// prefer whatever's already on the clipboard over the "https://" placeholder.
const EXTERNAL_URL_RE = /^https?:\/\/\S+$/;

// Quote the selection for the "Search for…" row, capped so a long selection
// can't measure the row absurdly wide before the row's own CSS ellipsis (on
// its last span) ever gets a chance to clip it.
function truncateForLabel(text: string, max = 20): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

// A note path's title: its filename without ".md". The id link's own display
// text is the WRITER's prose (a whole sentence, after "Ask AI → save as note"),
// and the id is a hex token — neither names the note, so the menu row shows this.
function noteTitleOfPath(path: string): string {
  return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}

const EditorContextMenu: Component = () => {
  const [menu, setMenu] = createSignal<MenuState | null>(null);
  const close = () => setMenu(null);

  // Latch the last non-null menu. The menu closes ITSELF on select, and that
  // close runs before our onSelect handler — so reading menu() directly inside
  // an action would find null and every handler would bail at its `if (!m)`
  // guard, silently doing nothing. Holding the last value also keeps the panel's
  // labels stable while it animates out.
  const held = createMemo<MenuState | null>((prev) => menu() ?? prev ?? null, null);
  const sel = () => {
    const m = held();
    return m && m.kind === "selection" ? m : null;
  };
  const link = () => {
    const m = held();
    return m && m.kind === "link" ? m : null;
  };
  const idLink = () => {
    const m = held();
    return m && m.kind === "idlink" ? m : null;
  };

  const onContextMenu = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    // The tree row handler already ran and called preventDefault — leave it alone.
    if (e.defaultPrevented) return;

    // Kill the native menu app-wide.
    e.preventDefault();

    // Only over the editor.
    if (!target?.closest?.(".cm-content")) return;
    const view = editorView();
    if (!view) return;

    // (2) Right-clicked on a note link → the link menu. Resolve the whole link
    // (segments + hidden slots) from the document position via the syntax
    // tree, which works whether the link is rendered as a chip or showing its
    // raw [[ … ]] under the caret — and resolve every row NOW, so the panel's
    // labels stay stable while it animates out.
    const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
    const wl = pos == null ? null : noteLinkAt(view, pos);
    if (wl) {
      const targets = linkTargets(wl.segments, wl.slots);
      if (targets.length) {
        setMenu({
          kind: "link",
          x: e.clientX,
          y: e.clientY,
          segments: wl.segments,
          slots: wl.slots,
          targets,
          from: wl.from,
          to: wl.to,
        });
        return;
      }
    }

    // (2b) …or on an id link → the same menu shape, one row per id. Every id is
    // resolved HERE rather than in the row's label so the panel's text stays
    // stable while it animates out (the held() latch keeps the last state, not a
    // live lookup — a label that re-resolved on read would blank out mid-fade).
    const idl = pos == null ? null : idLinkRangeAt(view, pos);
    if (idl) {
      setMenu({
        kind: "idlink",
        x: e.clientX,
        y: e.clientY,
        ids: idl.ids,
        paths: idl.ids.map((id) => findPathById(id)),
        from: idl.from,
        to: idl.to,
      });
      return;
    }

    // (3) A text selection → the format/note menu.
    const range = view.state.selection.main;
    if (range.empty) return;
    const text = view.state.sliceDoc(range.from, range.to).trim();
    if (!text) return;
    // The RANGE stays exactly as CodeMirror selected it, untrimmed. Cut and Paste
    // use from/to as their change range, so trimming here would make them leave the
    // selection's own whitespace behind — Ctrl+L (which selects the trailing line
    // break) followed by Cut would strand a blank line. Consumers that need a tight
    // range trim it themselves: trimmedSel for external links, toggleHighlight
    // internally, and openAskPopupAt for the ask.
    setMenu({
      kind: "selection",
      x: e.clientX,
      y: e.clientY,
      selection: text,
      from: range.from,
      to: range.to,
    });
  };

  // Only the app-wide native-menu suppression stays on the document. Dismissal
  // (click-outside, Escape, scroll, focus loss) is the menu's own concern now.
  onMount(() => document.addEventListener("contextmenu", onContextMenu));
  onCleanup(() => document.removeEventListener("contextmenu", onContextMenu));

  // Run an action, then dismiss the menu.
  const run = (fn: () => void) => () => {
    fn();
    close();
  };

  // The captured selection, its outer whitespace trimmed off — so a wrapped
  // [[link]] is exactly the note title (no stray spaces that would resolve to a
  // different name).
  const trimmedSel = (view: EditorView, m: { from: number; to: number }) => {
    const raw = view.state.sliceDoc(m.from, m.to);
    const from = m.from + (raw.length - raw.trimStart().length);
    const to = m.to - (raw.length - raw.trimEnd().length);
    return from < to ? { from, to } : null;
  };

  // Wrap the selection in a link — the exact transaction bound to the "[" / "]"
  // keys (editor/linkShortcuts.ts), reused as-is so the menu and the key can
  // never drift apart. The note is resolved — or CREATED — and its id minted
  // right here, so the link is born as [[selection]](id:XYZ) with the id
  // already tracking in the background (the user's contract for this action).
  const addLink = () => {
    const m = sel();
    const view = editorView();
    close();
    if (!m || !view) return;
    wrapSelectionInWikilink(view);
    // Deferred by a frame on purpose. On close the menu restores focus to its
    // trigger; this menu is anchored to a point and HAS no trigger, so that
    // restore lands on <body> — and it runs after this handler. Focusing the
    // editor on the next frame puts the caret back where the user was.
    requestAnimationFrame(() => view.focus());
  };

  // [selection](url) — the URL portion is left SELECTED so typing replaces it
  // in one go, unless the clipboard already holds a URL: then that's used as
  // the target and the caret lands after the closing ")" instead.
  const addExternalLink = async () => {
    const m = sel();
    const view = editorView();
    close();
    if (!m || !view) return;
    const range = trimmedSel(view, m);
    if (!range) return;
    const text = view.state.sliceDoc(range.from, range.to);
    const clip = await clipRead();
    const fromClipboard = EXTERNAL_URL_RE.test(clip);
    const url = fromClipboard ? clip : "https://";
    const insert = `[${text}](${url})`;
    const urlFrom = range.from + 1 + text.length + 2; // past "[" + text + "]("
    view.dispatch({
      changes: { from: range.from, to: range.to, insert },
      selection: fromClipboard
        ? EditorSelection.cursor(range.from + insert.length) // caret after ")"
        : EditorSelection.range(urlFrom, urlFrom + url.length), // select "https://"
      userEvent: "input.link",
    });
    requestAnimationFrame(() => view.focus());
  };

  // Open the in-note find bar pre-seeded with the selection (NoteSearchBar
  // consumes and clears the seed). No editor-refocus here — unlike every other
  // action in this file, this one HANDS focus to the search field (owned by
  // another component), so forcing it back to the editor would fight that.
  const searchForSelection = () => {
    const m = sel();
    close();
    if (!m) return;
    setNoteSearchSeed(m.selection);
    setNoteSearchOpen(true);
  };

  // The highlight (default or legacy-coloured) covering the held selection, if
  // one exists — read fresh so both the item's label ("Highlight" vs. "Remove
  // highlight") and the hex passed to toggleHighlight reflect whether there's
  // actually something to remove.
  const currentHighlight = (): HighlightHit | null => {
    const m = sel();
    const view = editorView();
    return m && view ? highlightAt(view.state, m.from, m.to) : null;
  };

  // Wrap/unwrap the selection's highlight as one transaction — editor/
  // highlight.ts owns the encoding. Passing an existing hit's own hex forces
  // the unwrap branch for BOTH the default `==text==` form and a legacy
  // coloured `<mark>` highlight; no hit means wrap fresh in the default form.
  const applyHighlight = () => {
    const m = sel();
    const view = editorView();
    const hit = currentHighlight();
    close();
    if (!m || !view) return;
    toggleHighlight(view, m.from, m.to, hit ? hit.hex : null);
    requestAnimationFrame(() => view.focus());
  };

  // Cut/copy/paste route through backend/clipboard.ts (Tauri's OS clipboard
  // under the app, navigator.clipboard in the browser dev preview).
  const copySelection = () => {
    const m = sel();
    const view = editorView();
    close();
    if (!m || !view) return;
    void clipWrite(m.selection);
    requestAnimationFrame(() => view.focus());
  };
  const cutSelection = () => {
    const m = sel();
    const view = editorView();
    close();
    if (!m || !view) return;
    void clipWrite(m.selection);
    view.dispatch({
      changes: { from: m.from, to: m.to, insert: "" },
      selection: EditorSelection.cursor(m.from),
      userEvent: "delete.cut",
    });
    requestAnimationFrame(() => view.focus());
  };
  // An empty read — a genuinely empty clipboard OR a denied/failed read
  // (clipRead()'s contract returns "" either way) — must leave the selection
  // untouched rather than delete it out from under the user.
  const pasteOverSelection = () => {
    const m = sel();
    const view = editorView();
    close();
    if (!m || !view) return;
    void (async () => {
      const text = await clipRead();
      if (!text) {
        requestAnimationFrame(() => view.focus());
        return;
      }
      view.dispatch({
        changes: { from: m.from, to: m.to, insert: text },
        selection: EditorSelection.cursor(m.from + text.length),
        userEvent: "input.paste",
      });
      requestAnimationFrame(() => view.focus());
    })();
  };

  // Ask the AI about just this selection, in the context of the current note.
  // Opens the small popup anchored at the selection's END — the answer streams
  // into the popup (state/askPopup owns the flow: streaming, hover recall via
  // the range's mark, click-to-save-as-note).
  const askAboutSelection = () => {
    const m = sel();
    const view = editorView();
    close();
    if (!m || !view) return;
    const c = view.coordsAtPos(Math.min(m.to, view.state.doc.length));
    if (!c) return;
    // The RAW slice, not m.selection — openAskPopupAt trims text and range together
    // (both entry points share that), which only works if they still correspond.
    openAskPopupAt(view.state.sliceDoc(m.from, m.to), m.from, m.to, {
      x: c.left,
      y: c.top,
      width: 1,
      height: c.bottom - c.top,
    });
  };

  return (
    <Menu.Root
      open={menu() !== null}
      onOpenChange={(e) => {
        if (!e.open) close();
      }}
      lazyMount
      unmountOnExit
    >
      {/* Anchored to the pointer: the "trigger" is a position inside the
          CodeMirror surface, not a DOM node we own. */}
      <MenuPointAnchor point={() => menu()} />
      <Portal>
        <Menu.Positioner>
          <Menu.Content
            class="tree-context-menu editor-context-menu"
            classList={{
              "editor-context-menu--link":
                menu()?.kind === "link" || menu()?.kind === "idlink",
            }}
          >
            <Show when={link()}>
              {(l) => (
                <>
                  <div class="wikilink-menu__header">Open note</div>
                  {/* Opening a target from HERE fills its slot, exactly as a
                      left-click on it would — same function, same range, same
                      flush/mint/verify ordering (state/wikilink's openLinkAt).
                      The two entry points used not to agree, so the same link
                      behaved differently by mouse button. Which row was picked
                      is passed as an index, so a menu open of the SECOND
                      target fills that slot and navigates where the user
                      pointed. A dead slot's row is inert (openLinkAt's no-op
                      contract for dead ids) and says so. */}
                  <For each={l().targets}>
                    {(t, i) => (
                      <Menu.Item
                        // Indexed as well as titled: two segments can name the
                        // same note, and two rows sharing a value would make
                        // Ark treat them as one item.
                        value={`open:${i()}:${t.title}`}
                        class="wikilink-menu__row"
                        onSelect={run(() => {
                          if (t.path || t.canCreate) {
                            openLinkAt(
                              editorView(),
                              { from: l().from, to: l().to },
                              l().segments,
                              l().slots,
                              i(),
                            );
                          }
                        })}
                      >
                        <Show
                          when={t.path || t.canCreate}
                          fallback={
                            <>
                              <span>Note not found</span>
                              <span class="wikilink-menu__new">Missing</span>
                            </>
                          }
                        >
                          <span>{t.title}</span>
                          <Show when={!t.path}>
                            <span class="wikilink-menu__new">New</span>
                          </Show>
                        </Show>
                      </Menu.Item>
                    )}
                  </For>
                  <Menu.Separator class="wikilink-menu__divider" />
                  <Show when={l().targets.length > 1}>
                    <Menu.Item
                      value="open-all"
                      class="wikilink-menu__action"
                      onSelect={run(() =>
                        openLinkAt(
                          editorView(),
                          { from: l().from, to: l().to },
                          l().segments,
                          l().slots,
                          "all",
                        ),
                      )}
                    >
                      Open all in tabs
                    </Menu.Item>
                  </Show>
                  <Menu.Item
                    value="add-note"
                    class="wikilink-menu__action"
                    onSelect={run(() => openAddNoteForLink(l().from, l().to))}
                  >
                    Add note
                  </Menu.Item>
                </>
              )}
            </Show>

            {/* The near-mirror of the wikilink menu above, deliberately sharing
                its classes so the two forms are indistinguishable to the reader
                (and so this needs no CSS of its own). The one asymmetry is the
                row LABEL: a wikilink row shows its target, which IS a note
                title, while an id link's row shows the resolved note's filename
                — neither the raw id (a hex token) nor the link's display text
                (the writer's prose, often a whole sentence) names the note. */}
            <Show when={idLink()}>
              {(l) => (
                <>
                  <div class="wikilink-menu__header">Open note</div>
                  <For each={l().ids}>
                    {(id, i) => (
                      <Menu.Item
                        // Indexed as well as keyed by id: a hand-edited
                        // destination could repeat an id, and two rows sharing a
                        // value would make Ark treat them as one item.
                        value={`open-id:${i()}:${id}`}
                        class="wikilink-menu__row"
                        // A dead id is a NO-OP, matching openNoteById: the id
                        // names one specific (deleted/binned) note, and creating
                        // a fresh one under the link's display text would
                        // silently fork the content. Unlike an unresolved
                        // [[link]], this is NOT click-to-create — so the row says
                        // so and does nothing.
                        onSelect={run(() => {
                          if (l().paths[i()]) openNoteById(id);
                        })}
                      >
                        <Show
                          when={l().paths[i()]}
                          fallback={
                            <>
                              <span>Note not found</span>
                              <span class="wikilink-menu__new">Missing</span>
                            </>
                          }
                        >
                          <span>{noteTitleOfPath(l().paths[i()])}</span>
                        </Show>
                      </Menu.Item>
                    )}
                  </For>
                  <Menu.Separator class="wikilink-menu__divider" />
                  {/* Hidden for a single target, exactly as above: "open all" of
                      one note is just "open note", which is the row right there. */}
                  <Show when={l().ids.length > 1}>
                    <Menu.Item
                      value="open-all-ids"
                      class="wikilink-menu__action"
                      onSelect={run(() => openAllNotesByIds(l().ids))}
                    >
                      Open all in tabs
                    </Menu.Item>
                  </Show>
                  {/* Always offered, and the whole point of the fix: without it
                      a vault of converted links has nowhere to add a second
                      target. confirmAddNote branches on the range's own text, so
                      this hands it the id link's range exactly as the wikilink
                      menu hands it a [[ … ]] range. */}
                  <Menu.Item
                    value="add-note-id"
                    class="wikilink-menu__action"
                    onSelect={run(() => openAddNoteForLink(l().from, l().to))}
                  >
                    Add note
                  </Menu.Item>
                </>
              )}
            </Show>

            <Show when={sel()}>
              {(s) => (
                <>
                  <Menu.Item value="add-link" class="tree-context-item" onSelect={addLink}>
                    <span class="tree-context-item__gap" />
                    <span>Add link</span>
                  </Menu.Item>
                  <Menu.Item
                    value="add-external-link"
                    class="tree-context-item"
                    onSelect={addExternalLink}
                  >
                    <span class="tree-context-item__gap" />
                    <span>Add external link</span>
                  </Menu.Item>
                  <Menu.Item value="search" class="tree-context-item" onSelect={searchForSelection}>
                    <span class="tree-context-item__gap" />
                    <span>
                      Search for “<span class="editor-context-item__title">{truncateForLabel(s().selection)}</span>”
                    </span>
                  </Menu.Item>

                  <Menu.Item value="highlight" class="tree-context-item" onSelect={applyHighlight}>
                    <span class="ctx-fmt ctx-fmt--mark">H</span>
                    <span>{currentHighlight() ? "Remove highlight" : "Highlight"}</span>
                  </Menu.Item>

                  <Menu.Separator class="tree-context-sep" />
                  <Menu.Item value="cut" class="tree-context-item" onSelect={cutSelection}>
                    <span class="tree-context-item__gap" />
                    <span>Cut</span>
                  </Menu.Item>
                  <Menu.Item value="copy" class="tree-context-item" onSelect={copySelection}>
                    <span class="tree-context-item__gap" />
                    <span>Copy</span>
                  </Menu.Item>
                  <Menu.Item value="paste" class="tree-context-item" onSelect={pasteOverSelection}>
                    <span class="tree-context-item__gap" />
                    <span>Paste</span>
                  </Menu.Item>
                  <Menu.Item value="ask-ai" class="tree-context-item" onSelect={askAboutSelection}>
                    <svg class="ctx-ai" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 3l1.6 5 5 1.6-5 1.6L12 16l-1.6-4.8-5-1.6 5-1.6L12 3z" />
                    </svg>
                    <span>Ask AI about this</span>
                    <span class="ctx-shortcut">Ctrl+Shift+A</span>
                  </Menu.Item>
                </>
              )}
            </Show>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
};

export default EditorContextMenu;
