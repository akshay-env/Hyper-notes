// Recycle bin. Delete is soft: a node's subtree + its documents leave the live
// stores and land here, restorable or purgable. Under a real vault (Tauri) each
// action also hits <root>/.bin on disk via the fs commands; in the browser it's
// purely in-memory. The bin also repopulates from the on-disk index on vault open.
import { createStore, produce } from "solid-js/store";
import { type VaultNode } from "./vaultTypes";
import {
  getNode,
  detachNode,
  insertNode,
  attachNode,
  restoreParentFor,
  collectDescendantNotes,
  countItems,
} from "./vault";
import { takeDocs, putDocs } from "./documents";
import { vaultRoot } from "./session";
import {
  moveToBinFs,
  restoreBinFs,
  deleteBinFs,
  emptyBinFs,
  rawToVaultNode,
  type RawBinEntry,
} from "../backend/vaultApi";

export interface BinEntry {
  id: string;
  name: string; // display name at delete time (folder name or note.md)
  originalPath: string; // where it lived, for restore
  isFolder: boolean;
  itemCount: number; // subtree size (for the "N items" hint)
  deletedAt: number;
  node?: VaultNode; // in-session snapshot (browser restore); absent for on-disk entries
  docs?: Record<string, string>; // its documents (browser restore)
}

const [binItems, setBinItems] = createStore<BinEntry[]>([]);
export { binItems };

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Move a vault node (and its subtree + docs) into the bin. Detaches from the live
// stores (UI truth) and, under a real vault, moves the files into .bin on disk.
// Returns the note paths removed so the caller can close their open tabs.
export function moveToBin(path: string): string[] {
  const node = getNode(path);
  if (!node) return [];
  const name = node.name;
  const isFolder = node.isFolder;
  const itemCount = countItems(node);
  const notePaths = collectDescendantNotes(node);
  const docs = takeDocs(notePaths);
  const removed = detachNode(path);
  if (!removed) {
    putDocs(docs); // detach failed — undo the doc capture
    return [];
  }
  const id = newId();
  setBinItems(produce((items) => {
    items.unshift({
      id,
      name,
      originalPath: path,
      isFolder,
      itemCount,
      deletedAt: Date.now(),
      node: removed,
      docs,
    });
  }));

  const root = vaultRoot();
  if (root) moveToBinFs(root, path, id).catch((e) => console.error("move to bin:", e));
  return notePaths;
}

// Restore an entry. Under a real vault the Rust side moves the files back and
// returns the rebuilt subtree; in the browser we re-insert the in-memory snapshot.
export function restoreFromBin(id: string): void {
  const entry = binItems.find((e) => e.id === id);
  if (!entry) return;
  const root = vaultRoot();
  if (root) {
    setBinItems((items) => items.filter((e) => e.id !== id)); // optimistic
    restoreBinFs(root, id)
      .then((res) => {
        attachNode(rawToVaultNode(res.node));
        putDocs(res.docs);
      })
      .catch((e) => console.error("restore:", e));
    return;
  }
  // Browser (in-memory) restore.
  if (entry.node) {
    const parent = restoreParentFor(entry.originalPath);
    const moves = insertNode(parent, entry.node);
    const remapped: Record<string, string> = {};
    for (const [oldPath, newPath] of moves) remapped[newPath] = entry.docs?.[oldPath] ?? "";
    putDocs(remapped);
  }
  setBinItems((items) => items.filter((e) => e.id !== id));
}

// Permanently drop one entry (its docs already left the live store).
export function deleteFromBin(id: string): void {
  setBinItems((items) => items.filter((e) => e.id !== id));
  const root = vaultRoot();
  if (root) deleteBinFs(root, id).catch((e) => console.error("delete from bin:", e));
}

// Permanently empty the bin.
export function emptyBin(): void {
  setBinItems([]);
  const root = vaultRoot();
  if (root) emptyBinFs(root).catch((e) => console.error("empty bin:", e));
}

// Repopulate the bin from the on-disk index when a real vault opens.
export function loadBinEntries(raw: RawBinEntry[]): void {
  setBinItems(
    raw.map((e) => ({
      id: e.id,
      name: e.name,
      originalPath: e.originalPath,
      isFolder: e.isFolder,
      itemCount: 1,
      deletedAt: e.deletedAt,
    })),
  );
}
