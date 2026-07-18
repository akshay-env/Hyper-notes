// File tree (FileTree.qml, 32px rows): recursive folders/notes with rotating
// chevron, per-depth guide lines, and selection/hover highlights. Folders expand
// from the reactive vault store; clicking a note opens it in a tab. Right-click a
// row for the context menu (open / new note / new folder / rename / delete).
//
// Multi-select (Explorer semantics): plain click = select one row (and open the
// note / toggle the folder); Ctrl+click = toggle the row in the selection
// without opening; Shift+click = select the visible range from the anchor.
// Delete on a multi-selection bins everything selected in one confirm.
import { type Component, For, Show, createSignal, createMemo, createEffect, onMount, onCleanup } from "solid-js";
import { Menu } from "@ark-ui/solid/menu";
import { Portal } from "solid-js/web";
import { MenuPointAnchor } from "../core/MenuPointAnchor";
import { TreeChevron, TrashIcon, DocIcon, FolderIcon } from "../icons/Icons";
import { type VaultNode } from "../../state/vaultTypes";
import { vaultTree, toggleExpand, countItems, getNode } from "../../state/vault";
import {
  activeNotePath,
  selectNoteByPath,
  createNoteIn,
  openNewFolder,
  openRename,
  requestDelete,
  treeSearchQuery,
  treeSelection,
  treeSelectOnly,
  treeToggleSelect,
  treeSelectRange,
  clearTreeSelection,
  treeAnchorPath,
  movePaths,
} from "../../state/ui";

// Filter the tree to nodes matching `q` (case-insensitive). A folder is kept if
// its own name matches (then its whole subtree shows) or any descendant matches
// (then the path to the match shows). Matched folders are force-expanded so the
// results are visible without clicking. Returns plain copies (not store nodes).
function filterTree(nodes: VaultNode[], q: string): VaultNode[] {
  const out: VaultNode[] = [];
  for (const n of nodes) {
    const selfMatch = n.name.toLowerCase().includes(q);
    if (!n.isFolder) {
      if (selfMatch) out.push(n);
      continue;
    }
    if (selfMatch) {
      out.push({ ...n, expanded: true });
    } else {
      const kids = filterTree(n.children ?? [], q);
      if (kids.length) out.push({ ...n, expanded: true, children: kids });
    }
  }
  return out;
}

// The rows exactly as rendered, top to bottom — Shift ranges span this order.
function flattenVisible(nodes: VaultNode[]): string[] {
  const out: string[] = [];
  for (const n of nodes) {
    out.push(n.path);
    if (n.isFolder && (n.expanded ?? false)) out.push(...flattenVisible(n.children ?? []));
  }
  return out;
}

// The FileTree instance publishes its visible row order here so the (module-
// scoped) row click handler can build Shift ranges against the filtered view.
let visibleOrder: () => string[] = () => [];

// Context-menu state (module-scoped so any row can open it).
interface CtxMenu {
  x: number;
  y: number;
  node: VaultNode;
}
const [ctxMenu, setCtxMenu] = createSignal<CtxMenu | null>(null);

// ── Drag-and-drop state (module-scoped so any row + the container can share it) ─
// `dragPaths` holds the vault paths being dragged (one row, or the whole
// multi-selection when a selected row is grabbed). `dropTarget` is the parent
// folder that would receive the drop — a folder path, or "" for the vault root
// (null = nothing highlighted).
const [dragPaths, setDragPaths] = createSignal<string[] | null>(null);
const [dropTarget, setDropTarget] = createSignal<string | null>(null);
function endDrag() {
  setDragPaths(null);
  setDropTarget(null);
}

// Parent directory of a vault path ("" for a root-level item), matching vault.ts.
const parentOf = (p: string) => {
  const i = p.lastIndexOf("/");
  return i <= 0 ? "" : p.slice(0, i);
};

// Can at least one of `paths` legally move into `targetParent`? Rejects moving a
// node into its own current parent (no-op) or a folder into itself/a descendant.
function canDropInto(paths: string[], targetParent: string): boolean {
  return paths.some((p) => {
    if (parentOf(p) === targetParent) return false;
    if (targetParent === p || targetParent.startsWith(p + "/")) return false;
    return true;
  });
}

const TreeRow: Component<{ node: VaultNode; depth: number }> = (props) => {
  const expanded = () => props.node.expanded ?? false; // reactive via store
  // Children mount on expand and stay mounted through the collapse animation, so
  // both directions can animate; they unmount only once the height transition ends.
  let childrenEl: HTMLDivElement | undefined;
  const [mounted, setMounted] = createSignal(expanded());
  createEffect(() => {
    if (expanded()) setMounted(true);
  });
  const onChildrenTransitionEnd = (e: TransitionEvent) => {
    if (e.target === childrenEl && e.propertyName === "grid-template-rows" && !expanded()) {
      setMounted(false);
    }
  };
  const selected = () => !props.node.isFolder && activeNotePath() === props.node.path;
  const picked = () => treeSelection().has(props.node.path);
  const label = () =>
    props.node.isFolder ? props.node.name : props.node.name.replace(/\.md$/i, "");

  const onClick = (e: MouseEvent) => {
    const path = props.node.path;
    if (e.ctrlKey || e.metaKey) {
      treeToggleSelect(path); // membership only — don't open/toggle
      return;
    }
    if (e.shiftKey) {
      const order = visibleOrder();
      const a = order.indexOf(treeAnchorPath());
      const b = order.indexOf(path);
      if (a >= 0 && b >= 0) {
        treeSelectRange(order.slice(Math.min(a, b), Math.max(a, b) + 1));
      } else {
        treeSelectOnly(path);
      }
      return;
    }
    treeSelectOnly(path);
    if (props.node.isFolder) toggleExpand(path);
    else selectNoteByPath(path);
  };

  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    // Right-clicking outside the current selection retargets it (Explorer-style).
    if (!treeSelection().has(props.node.path)) treeSelectOnly(props.node.path);
    setCtxMenu({ x: e.clientX, y: e.clientY, node: props.node });
  };

  // Where a drop on THIS row lands: into a folder, or into a note's own folder.
  const dropParent = () =>
    props.node.isFolder ? props.node.path : parentOf(props.node.path);
  // Highlight this row when it (a folder) is the current drop target.
  const dropInto = () => props.node.isFolder && dropTarget() === props.node.path;

  const onDragStart = (e: DragEvent) => {
    const path = props.node.path;
    const sel = treeSelection();
    // Grabbing a selected row drags the whole selection; otherwise just this row.
    const paths = sel.has(path) && sel.size > 1 ? [...sel] : [path];
    if (!sel.has(path)) treeSelectOnly(path);
    setDragPaths(paths);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", paths.join("\n"));
    }
  };

  const onDragOver = (e: DragEvent) => {
    const paths = dragPaths();
    if (!paths) return;
    e.stopPropagation(); // over a row — don't let the container claim the root
    if (canDropInto(paths, dropParent())) {
      e.preventDefault(); // allow the drop
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      setDropTarget(dropParent());
    } else {
      setDropTarget(null);
    }
  };

  const onDrop = (e: DragEvent) => {
    const paths = dragPaths();
    if (!paths) return;
    e.preventDefault();
    e.stopPropagation();
    if (canDropInto(paths, dropParent())) movePaths(paths, dropParent());
    endDrag();
  };

  return (
    <>
      <div
        class={`tree-row ${props.node.isFolder ? "folder" : ""} ${selected() ? "selected" : ""} ${picked() ? "picked" : ""} ${dropInto() ? "drop-into" : ""}`}
        style={{ "padding-left": `${4 + props.depth * 14}px` }}
        draggable={true}
        onClick={onClick}
        onContextMenu={onContextMenu}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragEnd={endDrag}
      >
        <For each={Array.from({ length: props.depth })}>
          {(_, i) => <div class="tree-depth-line" style={{ left: `${13 + i() * 14}px` }} />}
        </For>

        <Show when={props.node.isFolder} fallback={<span class="tree-row__gap" />}>
          <span class={`tree-chevron ${expanded() ? "expanded" : ""}`}>
            <TreeChevron />
          </span>
        </Show>

        <span class="tree-row__label">{label()}</span>
      </div>

      <Show when={props.node.isFolder}>
        <div
          class="tree-children"
          classList={{ open: expanded() }}
          ref={childrenEl}
          onTransitionEnd={onChildrenTransitionEnd}
        >
          <div class="tree-children__inner">
            <Show when={mounted()}>
              <For each={props.node.children ?? []}>
                {(child) => <TreeRow node={child} depth={props.depth + 1} />}
              </For>
            </Show>
          </div>
        </div>
      </Show>
    </>
  );
};

// Total item count for a set of paths (folders count their contents), skipping
// paths nested under other selected paths — the parent's count covers them.
function selectionCount(paths: string[]): number {
  const tops = paths.filter((p) => !paths.some((q) => q !== p && p.startsWith(q + "/")));
  let total = 0;
  for (const p of tops) {
    const n = getNode(p);
    total += n ? (n.isFolder ? countItems(n) : 1) : 0;
  }
  return total;
}

// The context menu for the right-clicked node (notes vs folders differ). With a
// multi-selection containing the node, Delete acts on the whole selection.
//
// Anchored to the pointer rather than a trigger element, because the trigger is
// whichever row was right-clicked. Keyboard navigation, typeahead, click-outside
// and Escape come from the menu primitive; only the actions below are ours.
const ContextMenu: Component<{ onClose: () => void }> = (props) => {
  // ctxMenu clears the instant an action runs, but the panel lingers for its exit
  // animation — latch the last non-null menu so the items don't blank out.
  const held = createMemo<CtxMenu | null>((prev) => ctxMenu() ?? prev ?? null, null);
  const node = () => held()?.node;
  const multi = () => {
    const n = node();
    if (!n) return null;
    const sel = treeSelection();
    return sel.has(n.path) && sel.size > 1 ? [...sel] : null;
  };
  const run = (fn: () => void) => () => {
    fn();
    props.onClose();
  };

  const onDelete = () => {
    const n = node();
    if (!n) return;
    const m = multi();
    if (m) requestDelete(m, `${m.length} items`, selectionCount(m));
    else requestDelete([n.path], n.name, n.isFolder ? countItems(n) : 1);
  };

  return (
    <Menu.Root
      open={ctxMenu() !== null}
      onOpenChange={(e) => {
        if (!e.open) props.onClose();
      }}
      lazyMount
      unmountOnExit
    >
      <MenuPointAnchor point={() => ctxMenu()} />
      <Portal>
        <Menu.Positioner>
          <Menu.Content class="tree-context-menu">
            <Show when={node()}>
              {(n) => (
                <>
                  <Show when={!n().isFolder && !multi()}>
                    <Menu.Item
                      value="open"
                      class="tree-context-item"
                      onSelect={run(() => selectNoteByPath(n().path))}
                    >
                      <DocIcon size={13} />
                      <span>Open</span>
                    </Menu.Item>
                  </Show>
                  <Show when={n().isFolder && !multi()}>
                    <Menu.Item
                      value="new-note"
                      class="tree-context-item"
                      onSelect={run(() => createNoteIn(n().path))}
                    >
                      <DocIcon size={13} />
                      <span>New note</span>
                    </Menu.Item>
                    <Menu.Item
                      value="new-folder"
                      class="tree-context-item"
                      onSelect={run(() => openNewFolder(n().path))}
                    >
                      <FolderIcon size={13} />
                      <span>New folder</span>
                    </Menu.Item>
                  </Show>
                  <Show when={!multi()}>
                    <Menu.Item
                      value="rename"
                      class="tree-context-item"
                      onSelect={run(() => openRename(n().path, n().name, n().isFolder))}
                    >
                      <span class="tree-context-item__gap" />
                      <span>Rename</span>
                    </Menu.Item>
                  </Show>
                  <Menu.Separator class="tree-context-sep" />
                  <Menu.Item
                    value="delete"
                    class="tree-context-item tree-context-item--danger"
                    onSelect={run(onDelete)}
                  >
                    <TrashIcon size={13} />
                    <span>{multi() ? `Delete ${multi()!.length} items` : "Delete"}</span>
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

const FileTree: Component = () => {
  // Any click or Escape dismisses the context menu; Escape also drops a
  // multi-selection, and Delete bins it.
  const close = () => setCtxMenu(null);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      close();
      clearTreeSelection();
    } else if (e.key === "Delete" && treeSelection().size > 0) {
      const target = e.target as HTMLElement | null;
      if (target && (target.closest(".cm-editor") || target.isContentEditable || /^(INPUT|TEXTAREA)$/.test(target.tagName))) return;
      const sel = [...treeSelection()];
      requestDelete(
        sel,
        sel.length === 1 ? (getNode(sel[0])?.name ?? "item") : `${sel.length} items`,
        selectionCount(sel),
      );
    }
  };
  onMount(() => {
    document.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
  });
  onCleanup(() => {
    document.removeEventListener("click", close);
    document.removeEventListener("keydown", onKey);
  });

  // Empty query → the live store (expand toggles work); otherwise a filtered view.
  const query = () => treeSearchQuery().trim().toLowerCase();
  const displayTree = createMemo(() =>
    query() === "" ? vaultTree : filterTree(vaultTree, query()),
  );
  const order = createMemo(() => flattenVisible(displayTree()));
  visibleOrder = order;

  // Click on the empty area below the rows → drop the selection.
  const onBlankClick = (e: MouseEvent) => {
    if (!(e.target as HTMLElement).closest(".tree-row")) clearTreeSelection();
  };

  // Dragging over the blank area (rows stopPropagation, so this only fires off a
  // row) targets the vault root; dropping there moves the items to top level.
  const onTreeDragOver = (e: DragEvent) => {
    const paths = dragPaths();
    if (!paths || !canDropInto(paths, "")) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    setDropTarget("");
  };
  const onTreeDrop = (e: DragEvent) => {
    const paths = dragPaths();
    if (!paths) return;
    e.preventDefault();
    if (canDropInto(paths, "")) movePaths(paths, "");
    endDrag();
  };

  return (
    <div
      class={`tree ${dropTarget() === "" ? "drop-root" : ""}`}
      onClick={onBlankClick}
      onDragOver={onTreeDragOver}
      onDrop={onTreeDrop}
    >
      <For each={displayTree()}>{(node) => <TreeRow node={node} depth={0} />}</For>

      <Show when={query() !== "" && displayTree().length === 0}>
        <div class="tree-empty">No matches</div>
      </Show>

      {/* Stays mounted; the menu owns its own open state and presence. */}
      <ContextMenu onClose={close} />
    </div>
  );
};

export default FileTree;
