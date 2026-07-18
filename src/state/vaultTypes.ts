// Core vault shapes, shared by the stores, the sidebar tree, the graph, and the
// Tauri backend adapter. A vault always starts EMPTY — content comes from the
// folder the user opens (read_vault), never from bundled sample notes.

// One entry in the vault tree: a folder (with children) or a note (.md).
export interface VaultNode {
  name: string;
  path: string;
  isFolder: boolean;
  expanded?: boolean;
  children?: VaultNode[];
}

// An open editor tab. `path` is "" for a blank "New tab" with no note yet.
// `kind` is "graph" for the whole-vault graph, which occupies a tab like any note —
// so switching tabs shows that tab's content and closing the tab closes the graph.
// Absent means "note" (the overwhelming majority, and it keeps persisted tabs from
// older builds readable).
export interface Tab {
  name: string;
  path: string;
  kind?: "note" | "graph";
}

// Shown in the title bar / sidebar until a real vault folder is opened.
export const NO_VAULT_NAME = "No vault";
