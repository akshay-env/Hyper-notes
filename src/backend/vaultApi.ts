// Typed wrappers over the Rust vault commands (see src-tauri/src/commands). All
// paths are vault-relative ("/Projects/Note.md"); the Rust side joins them onto
// the absolute vault root. Callers must guard invocation on isTauri()/vaultRoot()
// — these throw in a plain browser.
import { invoke } from "@tauri-apps/api/core";
import { type VaultNode } from "../state/vaultTypes";

export interface RawNode {
  name: string;
  path: string;
  isFolder: boolean;
  children: RawNode[];
}
export interface VaultData {
  tree: RawNode[];
  docs: Record<string, string>;
}
export interface RawBinEntry {
  id: string;
  name: string;
  originalPath: string;
  isFolder: boolean;
  deletedAt: number;
}
export interface RestoreResult {
  originalPath: string;
  node: RawNode;
  docs: Record<string, string>;
}

export const readVaultFs = (root: string) => invoke<VaultData>("read_vault", { root });
export const readFileFs = (root: string, rel: string) => invoke<string>("read_file", { root, rel });
export const writeNoteFs = (root: string, rel: string, content: string) =>
  invoke<void>("write_note", { root, rel, content });
export const createFolderFs = (root: string, rel: string) =>
  invoke<void>("create_folder", { root, rel });
export const createNoteFs = (root: string, rel: string, content: string) =>
  invoke<void>("create_note", { root, rel, content });
export const renamePathFs = (root: string, oldRel: string, newRel: string) =>
  invoke<void>("rename_path", { root, oldRel, newRel });
export const moveToBinFs = (root: string, rel: string, id: string) =>
  invoke<RawBinEntry>("move_to_bin", { root, rel, id });
export const listBinFs = (root: string) => invoke<RawBinEntry[]>("list_bin", { root });
export const restoreBinFs = (root: string, id: string) =>
  invoke<RestoreResult>("restore_bin", { root, id });
export const deleteBinFs = (root: string, id: string) =>
  invoke<void>("delete_bin", { root, id });
export const emptyBinFs = (root: string) => invoke<void>("empty_bin", { root });

// Rust Node → the frontend VaultNode (same shape; normalize files' children).
export function rawToVaultNode(n: RawNode): VaultNode {
  return {
    name: n.name,
    path: n.path,
    isFolder: n.isFolder,
    expanded: false,
    children: n.isFolder ? n.children.map(rawToVaultNode) : undefined,
  };
}
