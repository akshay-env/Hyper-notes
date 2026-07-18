// UI-chrome state + the orchestration that ties tabs, the document store, and the
// vault tree together (design phase — no backend yet, but the wiring is real).
// Panels open/closed, active note, graph toggle, tree search, dialogs, and the
// create/rename/delete flows that keep tabs + documents in step with the tree.
import { createSignal } from "solid-js";
import { type Tab } from "./vaultTypes";
import { createFolder, createNote, renameNode, moveNode, replaceTree, getNode, noteBasenameCount } from "./vault";
import { createDoc, renameDoc, replaceDocs, rewriteLinksForRename } from "./documents";
import { moveToBin, loadBinEntries } from "./bin";
import { flushEditor, reloadEditorDoc } from "./editor";
import { isTauri } from "./platform";
import { vaultRoot, setVaultRoot, setVaultName, baseName } from "./session";
import {
  readVaultFs,
  listBinFs,
  createFolderFs,
  createNoteFs,
  renamePathFs,
  rawToVaultNode,
} from "../backend/vaultApi";
import { loadGraphCache } from "../graph/GraphCanvas";

export const [sidebarOpen, setSidebarOpen] = createSignal(true);
export const [rightPanelOpen, setRightPanelOpen] = createSignal(true);
export const [treeSearchQuery, setTreeSearchQuery] = createSignal("");

// In-app panels opened from the sidebar bottom row (own dimmed backdrop).
export const [settingsOpen, setSettingsOpen] = createSignal(false);
export function openSettings() {
  setSettingsOpen(true);
}
export function closeSettings() {
  setSettingsOpen(false);
}
export const [binOpen, setBinOpen] = createSignal(false);
export function openBin() {
  setBinOpen(true);
}
export function closeBin() {
  setBinOpen(false);
}

// ── Dialogs (mirror Main.qml modal state) ────────────────────────────────────
export const [newFolderOpen, setNewFolderOpen] = createSignal(false);
const [newFolderParent, setNewFolderParent] = createSignal("");
export { newFolderParent };

export interface DeleteTarget {
  paths: string[]; // one or many (multi-select delete)
  name: string; // display name when paths.length === 1
  count: number; // total items (folders count their contents)
}
export const [deleteTarget, setDeleteTarget] = createSignal<DeleteTarget | null>(null);

// ── File-tree multi-select ────────────────────────────────────────────────────
// Explorer-style: plain click selects one (and opens/toggles), Ctrl+click
// toggles membership, Shift+click selects the visible range from the anchor.
export const [treeSelection, setTreeSelection] = createSignal<ReadonlySet<string>>(
  new Set<string>(),
);
let treeAnchor = "";
export const treeAnchorPath = () => treeAnchor;

export function treeSelectOnly(path: string) {
  treeAnchor = path;
  setTreeSelection(new Set([path]));
}
export function treeToggleSelect(path: string) {
  const next = new Set(treeSelection());
  if (next.has(path)) next.delete(path);
  else next.add(path);
  treeAnchor = path;
  setTreeSelection(next);
}
// Range built by the tree (it knows the currently visible row order).
export function treeSelectRange(paths: string[]) {
  setTreeSelection(new Set(paths));
}
export function clearTreeSelection() {
  treeAnchor = "";
  if (treeSelection().size) setTreeSelection(new Set<string>());
}

// The folder that new notes/folders (created from the sidebar's create buttons)
// should go into, based on the current tree selection: a selected folder → into
// it; a selected note → into the note's folder; nothing selected → the vault
// root (""). Uses the anchor (last-clicked row) when several rows are selected.
export function newItemParent(): string {
  const sel = treeSelection();
  if (sel.size === 0) return "";
  const focus = treeAnchor && sel.has(treeAnchor) ? treeAnchor : [...sel][0];
  const node = getNode(focus);
  if (!node) return "";
  if (node.isFolder) return node.path;
  const i = focus.lastIndexOf("/");
  return i <= 0 ? "" : focus.slice(0, i);
}

export interface RenameTarget {
  path: string;
  name: string; // current display name (with extension for notes)
  isFolder: boolean;
}
export const [renameTarget, setRenameTarget] = createSignal<RenameTarget | null>(null);

// ── Tabs ─────────────────────────────────────────────────────────────────────
// There is ALWAYS at least one tab. When nothing is open that one tab is a blank
// "New tab" (path ""), which the editor area renders as the NewTabView. A blank
// tab is a slot: opening a note reuses the active blank tab instead of stacking a
// new one on top of it.
const blankTab = (): Tab => ({ name: "New tab", path: "" });
export const [openTabs, setOpenTabs] = createSignal<Tab[]>([blankTab()]);
export const [activeTabIndex, setActiveTabIndex] = createSignal(0);
export const [noteSearchOpen, setNoteSearchOpen] = createSignal(false);

// A blank "New tab": an empty slot to open into, and the app's un-closable resting
// state. The graph tab also has no path, so it must be excluded explicitly —
// otherwise it looks like a free slot and gets silently consumed or refuses to close.
export const isBlankTab = (t: Tab | undefined): boolean =>
  !!t && t.kind !== "graph" && t.path === "";

// True when the active tab is a blank "New tab" (an empty slot to open into).
const activeTabIsBlank = () => isBlankTab(openTabs()[activeTabIndex()]);

// ── Graph tab ─────────────────────────────────────────────────────────────────
// The graph lives in a tab rather than as a global overlay, so switching tabs shows
// that tab's content and closing the tab is the only close it needs.
export const graphViewActive = () => openTabs()[activeTabIndex()]?.kind === "graph";

/// Focus the graph tab, opening one if there isn't already one. Only ever one graph
/// tab exists — asking for it twice returns you to it rather than stacking copies.
export function openGraphTab() {
  const existing = openTabs().findIndex((t) => t.kind === "graph");
  if (existing >= 0) {
    setActiveTabIndex(existing);
    return;
  }
  const tab: Tab = { name: "Graph", path: "", kind: "graph" };
  // Reuse the active blank slot, matching how opening a note behaves.
  if (activeTabIsBlank()) {
    const cur = activeTabIndex();
    setOpenTabs((tabs) => tabs.map((t, i) => (i === cur ? tab : t)));
    return;
  }
  setOpenTabs((tabs) => [...tabs, tab]);
  setActiveTabIndex(openTabs().length - 1);
}

export function selectTab(i: number) {
  setActiveTabIndex(i);
  const t = openTabs()[i];
  if (t?.path) recordNav(t.path);
}
// Close a tab, but never drop below one tab. Closing the last remaining tab just
// resets it to a blank "New tab" (and closing an already-blank sole tab is a
// no-op) — so an empty tab is always present and can't be closed away.
export function closeTab(i: number) {
  const tabs = openTabs();
  if (tabs.length <= 1) {
    // Closing the sole tab resets it to a blank slot. Only a no-op when it's already
    // blank — a sole graph tab has no path but still closes.
    if (tabs[i] && !isBlankTab(tabs[i])) {
      setOpenTabs([blankTab()]);
      setActiveTabIndex(0);
    }
    return;
  }
  setOpenTabs((ts) => ts.filter((_, idx) => idx !== i));
  setActiveTabIndex((cur) => Math.max(0, Math.min(cur, openTabs().length - 1)));
}
export function newTab() {
  setOpenTabs((tabs) => [...tabs, blankTab()]);
  setActiveTabIndex(openTabs().length - 1);
}

// Move the tab at `from` to index `to` (drag-to-reorder in the tab strip). The
// active tab must keep pointing at the SAME tab after the array shuffles, so its
// index is remapped rather than left where it was.
export function reorderTabs(from: number, to: number) {
  const n = openTabs().length;
  if (from === to || from < 0 || to < 0 || from >= n || to >= n) return;
  setOpenTabs((ts) => {
    const a = ts.slice();
    const [moved] = a.splice(from, 1);
    a.splice(to, 0, moved);
    return a;
  });
  setActiveTabIndex((cur) => {
    if (cur === from) return to;
    if (from < cur && cur <= to) return cur - 1; // tabs between shifted left
    if (to <= cur && cur < from) return cur + 1; // tabs between shifted right
    return cur;
  });
}

// Vault path of the active note (drives editor doc, Outline, graph highlight).
// "" when there's no note open (empty vault, no tabs, or a blank "New tab").
export const activeNotePath = () => {
  const t = openTabs()[activeTabIndex()];
  return t && t.path ? t.path : "";
};

// Folder that contains the active note ("" when it's at the vault root, or no
// note is open). Notes created from a link go here — a link written inside a
// note keeps its new note next to that note.
export const activeNoteFolder = () => {
  const p = activeNotePath();
  const i = p.lastIndexOf("/");
  return i <= 0 ? "" : p.slice(0, i);
};

// Display helpers for the active note (breadcrumb + status bar path).
const nameFromPath = (p: string) => p.split("/").pop()?.replace(/\.md$/i, "") ?? "Note";
export const activeNoteName = () => nameFromPath(activeNotePath());
export const activeNoteCrumb = () =>
  activeNotePath().replace(/^\//, "").replace(/\.md$/i, "").split("/").join(" / ");
export const activeNoteRelPath = () => activeNotePath().replace(/^\//, "");

// ── Navigation history (back/forward arrows in the editor toolbar) ───────────
// A simple browser-style stack of visited note paths, empty until the first note
// is opened. Every note open/focus records an entry; Back/Forward walk the stack
// and re-open without recording.
const [navStack, setNavStack] = createSignal<string[]>([]);
const [navIndex, setNavIndex] = createSignal(-1);
let navWalking = false;

export const canGoBack = () => navIndex() > 0;
export const canGoForward = () => navIndex() < navStack().length - 1;

function recordNav(path: string) {
  if (navWalking || !path) return;
  const stack = navStack().slice(0, navIndex() + 1);
  if (stack[stack.length - 1] === path) return;
  stack.push(path);
  setNavStack(stack);
  setNavIndex(stack.length - 1);
}
export function goBack() {
  if (!canGoBack()) return;
  setNavIndex((i) => i - 1);
  navWalking = true;
  try {
    selectNoteByPath(navStack()[navIndex()]);
  } finally {
    navWalking = false;
  }
}
export function goForward() {
  if (!canGoForward()) return;
  setNavIndex((i) => i + 1);
  navWalking = true;
  try {
    selectNoteByPath(navStack()[navIndex()]);
  } finally {
    navWalking = false;
  }
}

// Open (or focus) a note by its vault path — tree click, graph node, wikilink.
export function selectNoteByPath(path: string) {
  recordNav(path);
  const idx = openTabs().findIndex((t) => t.path === path);
  if (idx >= 0) {
    setActiveTabIndex(idx);
    return;
  }
  // Reuse the active blank tab as the slot rather than stacking a new tab on top
  // of it — clicking a note from the sidebar with an empty tab open lands there.
  const cur = activeTabIndex();
  if (activeTabIsBlank()) {
    setOpenTabs((tabs) => tabs.map((t, i) => (i === cur ? { name: nameFromPath(path), path } : t)));
    return;
  }
  setOpenTabs((tabs) => [...tabs, { name: nameFromPath(path), path }]);
  setActiveTabIndex(openTabs().length - 1);
}

// ── Dialog open/close ─────────────────────────────────────────────────────────
export function openNewFolder(parentPath = "") {
  setNewFolderParent(parentPath);
  setNewFolderOpen(true);
}
export function openRename(path: string, name: string, isFolder: boolean) {
  setRenameTarget({ path, name, isFolder });
}
export function requestDelete(paths: string[], name: string, count = 1) {
  if (paths.length === 0) return;
  setDeleteTarget({ paths, name, count });
}
export function closeDialogs() {
  setNewFolderOpen(false);
  setDeleteTarget(null);
  setRenameTarget(null);
}

// ── Create / rename / delete flows (vault + documents + tabs kept in sync) ─────
// Fresh notes start EMPTY: the editor's inline-title widget (filename = H1) is
// the note's title. Seeding a literal "# Name" heading duplicated it — and went
// stale on rename, leaving a phantom "Untitled" in the body/Outline/word count.
const seedFor = (_path: string) => "";

// Create a folder from the New Folder dialog (parent captured on open).
export function confirmNewFolder(name: string) {
  const path = createFolder(newFolderParent(), name);
  setNewFolderOpen(false);
  const root = vaultRoot();
  if (root) createFolderFs(root, path).catch((e) => console.error("create folder:", e));
}

// Create a note under a folder ("" = root) and (by default) open it. `title`
// names it; omitted → "Untitled". `content` seeds its body (default empty). Pass
// `open: false` to create it without switching the editor to it (adding a link
// target — we stay on the note being edited). Returns the new note's vault path.
export function createNoteIn(parentPath: string, title?: string, open = true, content = ""): string {
  const path = createNote(parentPath, title);
  createDoc(path, content);
  if (open) selectNoteByPath(path);
  const root = vaultRoot();
  if (root) createNoteFs(root, path, content).catch((e) => console.error("create note:", e));
  return path;
}

// Turn the active (empty) "New tab" into a fresh root note — NewTabView's action.
export function createNoteInCurrentTab() {
  const path = createNote("");
  const seed = seedFor(path);
  createDoc(path, seed);
  const i = activeTabIndex();
  setOpenTabs((tabs) =>
    tabs.map((t, idx) => (idx === i ? { name: nameFromPath(path), path } : t)),
  );
  const root = vaultRoot();
  if (root) createNoteFs(root, path, seed).catch((e) => console.error("create note:", e));
}

// Rename a node by path; move its docs + open tabs along. Returns the node's
// new path, or null if the rename was rejected (empty/duplicate name).
export function renamePath(path: string, newName: string): string | null {
  flushEditor(); // persist any in-flight edits before paths move underneath us
  const wasNote = getNode(path)?.isFolder === false;
  const oldTitle = path.split("/").pop()!.replace(/\.md$/i, "");
  const res = renameNode(path, newName);
  if (!res) return null;
  for (const [oldPath, newPath] of res.noteMoves) {
    renameDoc(oldPath, newPath);
    setOpenTabs((tabs) =>
      tabs.map((tab) =>
        tab.path === oldPath ? { name: nameFromPath(newPath), path: newPath } : tab,
      ),
    );
  }
  const root = vaultRoot();
  // One fs rename of the top node moves the whole subtree on disk. Dispatch it
  // BEFORE the link rewrites so a note that links to itself gets its renamed file
  // written after the move (not overwritten by it).
  if (root) renamePathFs(root, path, res.newPath).catch((e) => console.error("rename:", e));
  // Repoint [[oldTitle]] links across the vault → the new title, but only when
  // the rename is unambiguous (no other note still carries the old basename, so
  // those links can only have meant this note).
  const newTitle = res.newPath.split("/").pop()!.replace(/\.md$/i, "");
  if (wasNote && oldTitle.toLowerCase() !== newTitle.toLowerCase() && noteBasenameCount(oldTitle) === 0) {
    rewriteLinksForRename(oldTitle, newTitle);
    reloadEditorDoc(); // reflect the rewrite in the open note if it links here
  }
  return res.newPath;
}

// Move a node into `targetParent` ("" = root), dragging its docs + open tabs
// along and mirroring the move to disk. Returns the new path, or null if the
// move was rejected (no-op, or a folder into itself/a descendant).
export function movePath(path: string, targetParent: string): string | null {
  flushEditor(); // persist in-flight edits before paths move underneath us
  const res = moveNode(path, targetParent);
  if (!res) return null;
  for (const [oldPath, newPath] of res.noteMoves) {
    renameDoc(oldPath, newPath);
    setOpenTabs((tabs) =>
      tabs.map((tab) =>
        tab.path === oldPath ? { name: nameFromPath(newPath), path: newPath } : tab,
      ),
    );
  }
  const root = vaultRoot();
  // One fs rename of the top node moves the whole subtree across folders on disk.
  if (root) renamePathFs(root, path, res.newPath).catch((e) => console.error("move:", e));
  return res.newPath;
}

// Move a whole selection into `targetParent`. Paths nested under another selected
// path are dropped — moving the ancestor already carries them.
export function movePaths(paths: string[], targetParent: string) {
  const tops = paths.filter((p) => !paths.some((q) => q !== p && p.startsWith(q + "/")));
  for (const p of tops) movePath(p, targetParent);
  clearTreeSelection();
}

// Rename/retitle a node from the Rename dialog.
export function confirmRename(newName: string) {
  const t = renameTarget();
  setRenameTarget(null);
  if (t) renamePath(t.path, newName);
}

// Inline-title rename of the note open in the editor (Obsidian's editable
// inline title). Returns the new path, or null when rejected.
export function renameActiveNote(newName: string): string | null {
  const path = activeNotePath();
  if (!path) return null;
  return renamePath(path, newName);
}

// Confirm a delete: move each selected subtree (and its docs) to the bin, and
// close any open tabs for them. Restorable from the BinPanel.
export function confirmDelete() {
  const t = deleteTarget();
  setDeleteTarget(null);
  if (!t) return;
  flushEditor();
  // Multi-select can hold a folder AND its children — binning the folder takes
  // the children with it, so drop any path nested under another selected path.
  const tops = t.paths.filter(
    (p) => !t.paths.some((q) => q !== p && p.startsWith(q + "/")),
  );
  const removed = new Set<string>();
  for (const p of tops) for (const r of moveToBin(p)) removed.add(r);
  setOpenTabs((tabs) => {
    const kept = tabs.filter((tab) => !removed.has(tab.path));
    return kept.length ? kept : [blankTab()]; // never leave zero tabs
  });
  setActiveTabIndex((cur) => Math.max(0, Math.min(cur, openTabs().length - 1)));
  clearTreeSelection();
}

// ── Vault open / load (Tauri) ─────────────────────────────────────────────────
// Prompt for a folder, then load it. No-op in the browser (no filesystem).
export async function openVaultDialog() {
  if (!isTauri()) return;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const dir = await open({ directory: true, multiple: false, title: "Open vault folder" });
  if (typeof dir === "string") await loadVault(dir);
}

// Read a real vault into the stores, replacing the mock seed.
export async function loadVault(root: string) {
  const data = await readVaultFs(root);
  replaceTree(data.tree.map(rawToVaultNode));
  replaceDocs(data.docs);
  setVaultRoot(root);
  setVaultName(baseName(root));
  setOpenTabs([blankTab()]); // always start with an empty tab, never zero
  setActiveTabIndex(0);
  try {
    loadBinEntries(await listBinFs(root));
  } catch (e) {
    console.error("list bin:", e);
  }
  // Warm the graph-layout cache (.hyperlink/graph.json) at startup, so the
  // FIRST graph open restores the saved layout with no initial shift.
  void loadGraphCache();
}

// ── Panel widths (resizable + persisted) ──────────────────────────────────────
// The docks are drag-resizable (ResizeHandle) and remember their width across
// sessions. `resizing` disables the width transition mid-drag so the edge tracks
// the pointer 1:1 (and re-enables it for the smooth collapse/expand toggle).
export const SIDEBAR_MIN = 190;
export const SIDEBAR_MAX = 460;
export const RIGHT_MIN = 220;
export const RIGHT_MAX = 480;
const SIDEBAR_DEFAULT = 240;
const RIGHT_DEFAULT = 280;

function loadWidth(key: string, fallback: number): number {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && v > 0 ? v : fallback;
  } catch {
    return fallback;
  }
}
function saveWidth(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(Math.round(value)));
  } catch {
    /* unavailable — session-only */
  }
}

export const [sidebarWidth, _setSidebarWidth] = createSignal(loadWidth("hln.sidebarWidth", SIDEBAR_DEFAULT));
export const [rightPanelWidth, _setRightPanelWidth] = createSignal(loadWidth("hln.rightPanelWidth", RIGHT_DEFAULT));
export const [resizing, setResizing] = createSignal(false);

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export function setSidebarWidth(v: number) {
  const w = clamp(v, SIDEBAR_MIN, SIDEBAR_MAX);
  _setSidebarWidth(w);
  saveWidth("hln.sidebarWidth", w);
}
export function setRightPanelWidth(v: number) {
  const w = clamp(v, RIGHT_MIN, RIGHT_MAX);
  _setRightPanelWidth(w);
  saveWidth("hln.rightPanelWidth", w);
}
export function resetSidebarWidth() {
  setSidebarWidth(SIDEBAR_DEFAULT);
}
export function resetRightPanelWidth() {
  setRightPanelWidth(RIGHT_DEFAULT);
}
