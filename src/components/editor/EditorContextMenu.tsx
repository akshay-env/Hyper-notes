// The app's own right-click menu. Mounted once at the shell level, it:
//   1. Suppresses the browser's native context menu EVERYWHERE (its "Reload",
//      "Inspect", "Save image as…" break the illusion of a native app).
//   2. Over a [[wikilink]] → a link menu: open note, each target, open all in
//      tabs, and "Add note" (append another target + create the note).
//   3. Over a text selection → format it (bold/italic/highlight), turn it into a
//      new note (as a link, or by extracting the text into the note), or copy.
// Right-clicking the file tree still opens the tree's own menu (FileTree.tsx),
// which calls preventDefault itself before this handler ever sees the event.
import { type Component, Show, For, createSignal, createMemo, onMount, onCleanup } from "solid-js";
import { Menu } from "@ark-ui/solid/menu";
import { Portal } from "solid-js/web";
import { MenuPointAnchor } from "../core/MenuPointAnchor";
import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { DocIcon } from "../icons/Icons";
import { editorView } from "../../state/editor";
import { createNoteIn, activeNoteFolder, selectNoteByPath } from "../../state/ui";
import {
  wikilinkExists,
  openWikilinkTarget,
  openAllWikilinkTargets,
  openAddNoteForLink,
} from "../../state/wikilink";
import { startAskAboutSelection } from "../../state/ai";
import { parseWikilinkInner } from "../../graph/wikilinkParse";

// x/y are the raw pointer position. They no longer need clamping to the viewport
// — the menu's positioner is collision-aware and flips/shifts the panel itself.
type MenuState =
  | { kind: "selection"; x: number; y: number; selection: string; from: number; to: number }
  | { kind: "link"; x: number; y: number; targets: string[]; from: number; to: number };

// A note title derived from the first non-empty line of extracted text: heading
// marks removed, link/filename-breaking characters stripped, capped, else "Untitled".
function deriveTitle(text: string): string {
  const firstLine = text.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  const clean = firstLine.replace(/^#{1,6}\s*/, "").replace(/[\\/:*?"<>|[\]#^]/g, "").trim();
  return clean.slice(0, 60) || "Untitled";
}

// The [[ … ]] range covering document position `pos`, or null. Walks up the
// syntax tree from either side of `pos` so a click anywhere on the link (chip or
// raw) finds the whole Wikilink/Embed node.
function wikilinkRangeAt(view: EditorView, pos: number): { from: number; to: number } | null {
  const tree = syntaxTree(view.state);
  for (const side of [1, -1] as const) {
    let node: ReturnType<typeof tree.resolveInner> | null = tree.resolveInner(pos, side);
    while (node) {
      if (node.name === "Wikilink") return { from: node.from, to: node.to };
      node = node.parent;
    }
  }
  return null;
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

    // (2) Right-clicked on a wikilink → the link menu. Resolve the [[ … ]] from
    // the document position (via the syntax tree), which works whether the link
    // is rendered as a chip or showing its raw markdown under the caret.
    const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
    const wl = pos == null ? null : wikilinkRangeAt(view, pos);
    if (wl) {
      const inner = view.state.sliceDoc(wl.from + 2, wl.to - 2);
      const targets = parseWikilinkInner(inner).targets;
      if (targets.length) {
        setMenu({ kind: "link", x: e.clientX, y: e.clientY, targets, from: wl.from, to: wl.to });
        return;
      }
    }

    // (3) A text selection → the format/note menu.
    const range = view.state.selection.main;
    if (range.empty) return;
    const text = view.state.sliceDoc(range.from, range.to).trim();
    if (!text) return;
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

  // Wrap the selection in `marker` on both sides (bold / italic / highlight).
  const wrapFormat = (marker: string) => () => {
    const m = sel();
    const view = editorView();
    close();
    if (!m || !view) return;
    view.dispatch({
      changes: [
        { from: m.from, insert: marker },
        { from: m.to, insert: marker },
      ],
      selection: EditorSelection.range(m.from + marker.length, m.to + marker.length),
      userEvent: "input.format",
    });
    // Deferred by a frame on purpose. On close the menu restores focus to its
    // trigger; this menu is anchored to a point and HAS no trigger, so that
    // restore lands on <body> — and it runs after this handler. Focusing the
    // editor on the next frame puts the caret back where the user was.
    requestAnimationFrame(() => view.focus());
  };

  // Wrap the selection in [[…]] in place, then create the target note (in the
  // current note's folder) if it doesn't exist yet.
  const createNoteFromSelection = () => {
    const m = sel();
    const view = editorView();
    close();
    if (!m || !view) return;
    const range = trimmedSel(view, m);
    if (!range) return;
    const title = m.selection;
    const folder = activeNoteFolder();
    view.dispatch({
      changes: [
        { from: range.from, insert: "[[" },
        { from: range.to, insert: "]]" },
      ],
      selection: EditorSelection.cursor(range.to + 4),
      userEvent: "input.wikilink",
    });
    // Creating the note also opens it, swapping the editor — so wrap first.
    if (!wikilinkExists(title)) createNoteIn(folder, title);
  };

  // Ask the AI about just this selection, in the context of the current note.
  // Opens the Ask bar pre-scoped to the highlighted range (see state/ai).
  const askAboutSelection = () => {
    const m = sel();
    const view = editorView();
    close();
    if (!m || !view) return;
    startAskAboutSelection(m.selection, m.from, m.to);
  };

  // Move the selected text INTO a new note (in the current note's folder) and
  // replace it here with a link to that note, then open it. Obsidian's "extract".
  const extractToNote = () => {
    const m = sel();
    const view = editorView();
    close();
    if (!m || !view) return;
    const content = view.state.sliceDoc(m.from, m.to);
    const folder = activeNoteFolder();
    // Create the note first (unopened) so we know its real, collision-resolved
    // title, then link to exactly that.
    const path = createNoteIn(folder, deriveTitle(content), false, content);
    const realTitle = path.split("/").pop()!.replace(/\.md$/i, "");
    view.dispatch({
      changes: { from: m.from, to: m.to, insert: `[[${realTitle}]]` },
      userEvent: "input.wikilink",
    });
    selectNoteByPath(path); // flushes the current note (with the link), opens the new one
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
            classList={{ "editor-context-menu--link": menu()?.kind === "link" }}
          >
            <Show when={link()}>
              {(l) => (
                <>
                  <div class="wikilink-menu__header">Open note</div>
                  <For each={l().targets}>
                    {(t) => (
                      <Menu.Item
                        value={`open:${t}`}
                        class="wikilink-menu__row"
                        onSelect={run(() => openWikilinkTarget(t))}
                      >
                        <span>{t}</span>
                        <Show when={!wikilinkExists(t)}>
                          <span class="wikilink-menu__new">New</span>
                        </Show>
                      </Menu.Item>
                    )}
                  </For>
                  <Menu.Separator class="wikilink-menu__divider" />
                  <Show when={l().targets.length > 1}>
                    <Menu.Item
                      value="open-all"
                      class="wikilink-menu__action"
                      onSelect={run(() => openAllWikilinkTargets(l().targets))}
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

            <Show when={sel()}>
              {(s) => (
                <>
                  <Menu.Item value="ask-ai" class="tree-context-item" onSelect={askAboutSelection}>
                    <svg class="ctx-ai" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 3l1.6 5 5 1.6-5 1.6L12 16l-1.6-4.8-5-1.6 5-1.6L12 3z" />
                    </svg>
                    <span>Ask AI about this</span>
                  </Menu.Item>
                  <Menu.Separator class="tree-context-sep" />
                  <Menu.Item value="bold" class="tree-context-item" onSelect={wrapFormat("**")}>
                    <span class="ctx-fmt ctx-fmt--bold">B</span>
                    <span>Bold</span>
                  </Menu.Item>
                  <Menu.Item value="italic" class="tree-context-item" onSelect={wrapFormat("*")}>
                    <span class="ctx-fmt ctx-fmt--italic">I</span>
                    <span>Italic</span>
                  </Menu.Item>
                  <Menu.Item value="highlight" class="tree-context-item" onSelect={wrapFormat("==")}>
                    <span class="ctx-fmt ctx-fmt--mark">H</span>
                    <span>Highlight</span>
                  </Menu.Item>
                  <Menu.Separator class="tree-context-sep" />
                  <Menu.Item
                    value="create-note"
                    valueText={s().selection}
                    class="tree-context-item"
                    onSelect={createNoteFromSelection}
                  >
                    <DocIcon size={13} />
                    <span>
                      Create note “<span class="editor-context-item__title">{s().selection}</span>”
                    </span>
                  </Menu.Item>
                  <Menu.Item value="extract" class="tree-context-item" onSelect={extractToNote}>
                    <span class="tree-context-item__gap" />
                    <span>Extract to new note</span>
                  </Menu.Item>
                  <Menu.Separator class="tree-context-sep" />
                  <Menu.Item
                    value="copy"
                    class="tree-context-item"
                    onSelect={() => {
                      void navigator.clipboard.writeText(s().selection);
                      close();
                    }}
                  >
                    <span class="tree-context-item__gap" />
                    <span>Copy</span>
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
