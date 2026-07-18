// Reactive vault tree. A Solid store holding the *live* structure of the open
// vault: folders expand/collapse and notes can be created, renamed, moved, and
// deleted. The mutations return the note-path deltas the caller needs to keep
// documents + open tabs in sync (see state/ui.ts, which orchestrates those
// side-effects) and mirror them to disk. Starts EMPTY — replaceTree() fills it
// from the folder the user opens.
import { createStore, produce, reconcile } from "solid-js/store";
import { type VaultNode } from "./vaultTypes";

// Deep clone a subtree — turns store proxies back into plain objects (bin
// snapshot/restore) and detaches the copy from the live store.
function cloneNodes(nodes: VaultNode[]): VaultNode[] {
  return nodes.map((n) => ({
    ...n,
    children: n.children ? cloneNodes(n.children) : undefined,
  }));
}

const [vaultTree, setVaultTree] = createStore<VaultNode[]>([]);
export { vaultTree };

// ── path helpers ────────────────────────────────────────────────────────────
// Directory that contains `path`: "" (root) for top-level items.
//   "/Projects/Research/X.md" → "/Projects/Research";  "/Inbox.md" → ""
function dirOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i <= 0 ? "" : path.slice(0, i);
}

// Sort order for a folder's children: folders first, then case-insensitive name.
function sortKey(a: VaultNode, b: VaultNode): number {
  if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

// Insert `node` into `list` at its sorted position (mutates a store draft).
function insertSorted(list: VaultNode[], node: VaultNode): void {
  let i = list.findIndex((n) => sortKey(node, n) < 0);
  if (i < 0) i = list.length;
  list.splice(i, 0, node);
}

// Depth-first search for the node at `path` within a draft/subtree.
function findNode(nodes: VaultNode[], path: string): VaultNode | undefined {
  for (const n of nodes) {
    if (n.path === path) return n;
    if (n.children) {
      const found = findNode(n.children, path);
      if (found) return found;
    }
  }
  return undefined;
}

// The children array a new item under `parentPath` belongs in ("" → root list).
function childListFor(draft: VaultNode[], parentPath: string): VaultNode[] | undefined {
  if (parentPath === "") return draft;
  const parent = findNode(draft, parentPath);
  if (!parent || !parent.isFolder) return undefined;
  if (!parent.children) parent.children = [];
  return parent.children;
}

// True if `path` is already taken anywhere in the tree.
export function pathExists(path: string): boolean {
  return findNode(vaultTree, path) !== undefined;
}

// A collision-free child path: base, "base 2", "base 3", … (ext incl. dot).
function uniquePath(parentPath: string, base: string, ext: string): string {
  const make = (name: string) => `${parentPath}/${name}${ext}`;
  if (!pathExists(make(base))) return make(base);
  for (let i = 2; ; i++) {
    if (!pathExists(make(`${base} ${i}`))) return make(`${base} ${i}`);
  }
}

// ── read helpers (non-reactive callers: title resolution, delete counts) ──────
export function collectDescendantNotes(node: VaultNode): string[] {
  if (!node.isFolder) return [node.path];
  const out: string[] = [];
  for (const c of node.children ?? []) out.push(...collectDescendantNotes(c));
  return out;
}

export function countItems(node: VaultNode): number {
  if (!node.isFolder) return 1;
  return 1 + (node.children ?? []).reduce((sum, c) => sum + countItems(c), 0);
}

export function getNode(path: string): VaultNode | undefined {
  return findNode(vaultTree, path);
}

// How many notes carry `title` as their basename (case-insensitive). Used to
// decide whether a rename can safely rewrite [[title]] links: only when this is
// 0 afterward (no other note still answers to the old name).
export function noteBasenameCount(title: string): number {
  const want = title.trim().toLowerCase();
  let count = 0;
  const walk = (ns: VaultNode[]) => {
    for (const n of ns) {
      if (n.isFolder) walk(n.children ?? []);
      else if (n.name.replace(/\.md$/i, "").toLowerCase() === want) count++;
    }
  };
  walk(vaultTree);
  return count;
}

// ── mutations ─────────────────────────────────────────────────────────────
// Expand/collapse a folder.
export function toggleExpand(path: string): void {
  setVaultTree(produce((draft) => {
    const n = findNode(draft, path);
    if (n?.isFolder) n.expanded = !n.expanded;
  }));
}

export function expandFolder(path: string): void {
  setVaultTree(produce((draft) => {
    const n = findNode(draft, path);
    if (n?.isFolder) n.expanded = true;
  }));
}

// Create a folder under `parentPath` ("" = root). Returns the new folder path.
export function createFolder(parentPath: string, name: string): string {
  const clean = name.trim() || "New Folder";
  const path = uniquePath(parentPath, clean, "");
  setVaultTree(produce((draft) => {
    const list = childListFor(draft, parentPath);
    if (!list) return;
    insertSorted(list, { name: path.split("/").pop()!, path, isFolder: true, expanded: false, children: [] });
    const parent = findNode(draft, parentPath);
    if (parent) parent.expanded = true;
  }));
  return path;
}

// Create a note under `parentPath` ("" = root). Returns the new note path.
export function createNote(parentPath: string, baseName = "Untitled"): string {
  const path = uniquePath(parentPath, baseName.replace(/\.md$/i, "").trim() || "Untitled", ".md");
  setVaultTree(produce((draft) => {
    const list = childListFor(draft, parentPath);
    if (!list) return;
    insertSorted(list, { name: path.split("/").pop()!, path, isFolder: false });
    const parent = findNode(draft, parentPath);
    if (parent) parent.expanded = true;
  }));
  return path;
}

// Rename (or retitle) a node. Rewrites descendant paths for a folder. Returns the
// list of note-path moves [oldPath, newPath] so docs + open tabs can follow.
export interface RenameResult {
  newPath: string;
  noteMoves: [string, string][];
}

export function renameNode(path: string, rawName: string): RenameResult | null {
  const node = getNode(path);
  if (!node) return null;
  const parentPath = dirOf(path);
  let newName = rawName.trim();
  if (!newName) return null;
  if (!node.isFolder && !/\.md$/i.test(newName)) newName += ".md";
  const newPath = parentPath === "" ? `/${newName}` : `${parentPath}/${newName}`;
  if (newPath === path) return { newPath, noteMoves: [] };

  const noteMoves: [string, string][] = [];
  // Recompute paths for `n` (now living at `np`) and everything beneath it.
  function rewrite(n: VaultNode, np: string): void {
    const old = n.path;
    n.path = np;
    if (!n.isFolder) noteMoves.push([old, np]);
    for (const c of n.children ?? []) rewrite(c, `${np}/${c.name}`);
  }

  setVaultTree(produce((draft) => {
    const list = childListFor(draft, parentPath);
    const target = list && findNodeShallow(list, path);
    if (!list || !target) return;
    target.name = newName;
    rewrite(target, newPath);
    // Name changed → re-sort the parent list.
    list.sort(sortKey);
  }));
  return { newPath, noteMoves };
}

// Move a node into `targetParent` ("" = root), preserving its whole subtree. The
// name is kept (collision-resolved under the new parent), so structure survives
// the move. Rejects no-op moves (already in that parent) and moving a folder into
// itself or one of its own descendants. Returns the note-path moves [old, new][]
// (so docs + open tabs can follow) plus the node's new path — or null if rejected.
export interface MoveResult {
  newPath: string;
  noteMoves: [string, string][];
}

export function moveNode(path: string, targetParent: string): MoveResult | null {
  const node = getNode(path);
  if (!node) return null;
  const currentParent = dirOf(path);
  if (targetParent === currentParent) return null; // already lives there
  // A folder can't be dropped into itself or into any of its own descendants.
  if (node.isFolder && (targetParent === path || targetParent.startsWith(path + "/"))) return null;
  // The destination must be an existing folder (root "" is always valid).
  if (targetParent !== "") {
    const tp = getNode(targetParent);
    if (!tp || !tp.isFolder) return null;
  }

  const base = node.isFolder ? node.name : node.name.replace(/\.md$/i, "");
  const ext = node.isFolder ? "" : ".md";
  const newPath = uniquePath(targetParent, base, ext);

  const noteMoves: [string, string][] = [];
  // Recompute paths for `n` (now living at `np`) and everything beneath it.
  function rewrite(n: VaultNode, np: string): void {
    const old = n.path;
    n.path = np;
    if (!n.isFolder) noteMoves.push([old, np]);
    for (const c of n.children ?? []) rewrite(c, `${np}/${c.name}`);
  }

  setVaultTree(produce((draft) => {
    const fromList = childListFor(draft, currentParent);
    if (!fromList) return;
    const i = fromList.findIndex((n) => n.path === path);
    if (i < 0) return;
    const [moved] = fromList.splice(i, 1);
    moved.name = newPath.split("/").pop()!;
    rewrite(moved, newPath);
    const toList = childListFor(draft, targetParent);
    if (!toList) return; // validated above — target is root or a real folder
    insertSorted(toList, moved);
    const parent = findNode(draft, targetParent);
    if (parent) parent.expanded = true;
  }));
  return { newPath, noteMoves };
}

// Delete a node (and, for a folder, its whole subtree). Returns the removed note
// paths so their documents can be dropped and any open tabs closed.
export function deleteNode(path: string): string[] {
  const node = getNode(path);
  if (!node) return [];
  const removed = collectDescendantNotes(node);
  const parentPath = dirOf(path);
  setVaultTree(produce((draft) => {
    const list = childListFor(draft, parentPath);
    if (!list) return;
    const i = list.findIndex((n) => n.path === path);
    if (i >= 0) list.splice(i, 1);
  }));
  return removed;
}

// Shallow (direct-children) lookup — used inside produce where `list` is already
// the correct sibling array.
function findNodeShallow(list: VaultNode[], path: string): VaultNode | undefined {
  return list.find((n) => n.path === path);
}

// ── Soft delete (recycle bin) ─────────────────────────────────────────────────
// Remove a node from the tree and return a PLAIN-object snapshot of the subtree
// (paths intact) so the bin can hold it and restore it later. Unlike deleteNode,
// nothing is discarded — the caller (bin) keeps the returned node + its docs.
export function detachNode(path: string): VaultNode | null {
  const node = getNode(path);
  if (!node) return null;
  const snapshot = cloneNodes([node])[0]; // capture before removal (store proxy → plain)
  const parentPath = dirOf(path);
  setVaultTree(produce((draft) => {
    const list = childListFor(draft, parentPath);
    if (!list) return;
    const i = list.findIndex((n) => n.path === path);
    if (i >= 0) list.splice(i, 1);
  }));
  return snapshot;
}

// Re-insert a previously-detached subtree under `parentPath` ("" = root). The
// subtree's paths are rewritten under a collision-free name; returns the note-path
// moves [oldStoredPath, newPath][] so the bin can restore documents under the
// right keys (matches renameNode's contract).
export function insertNode(parentPath: string, node: VaultNode): [string, string][] {
  const moves: [string, string][] = [];
  const fresh = cloneNodes([node])[0];
  const base = fresh.isFolder ? fresh.name : fresh.name.replace(/\.md$/i, "");
  const ext = fresh.isFolder ? "" : ".md";
  const newPath = uniquePath(parentPath, base, ext);
  fresh.name = newPath.split("/").pop()!;

  (function rewrite(n: VaultNode, np: string): void {
    const old = n.path;
    n.path = np;
    if (!n.isFolder) moves.push([old, np]);
    for (const c of n.children ?? []) rewrite(c, `${np}/${c.name}`);
  })(fresh, newPath);

  setVaultTree(produce((draft) => {
    const list = childListFor(draft, parentPath);
    if (!list) return;
    insertSorted(list, fresh);
    const parent = findNode(draft, parentPath);
    if (parent) parent.expanded = true;
  }));
  return moves;
}

// Directory that still exists to receive a restore, else root.
export function restoreParentFor(originalPath: string): string {
  const parent = dirOf(originalPath);
  if (parent === "") return "";
  const n = getNode(parent);
  return n && n.isFolder ? parent : "";
}

// Replace the whole tree — bulk load from a real vault (Tauri read_vault).
export function replaceTree(nodes: VaultNode[]): void {
  setVaultTree(reconcile(nodes));
}

// Insert a node whose paths are ALREADY final (no rename) at its parent — used by
// bin restore under Tauri, where the Rust side already placed the files on disk.
export function attachNode(node: VaultNode): void {
  const parentPath = dirOf(node.path);
  setVaultTree(produce((draft) => {
    const list = childListFor(draft, parentPath);
    if (!list) return;
    insertSorted(list, node);
    const parent = findNode(draft, parentPath);
    if (parent) parent.expanded = true;
  }));
}
