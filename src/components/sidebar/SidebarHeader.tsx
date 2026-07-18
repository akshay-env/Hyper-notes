// Sidebar header: creation actions. A prominent "New note" button with a compact
// "New folder" beside it (layout C). The vault switcher and Graph toggle now live
// in the pinned bottom row (see Sidebar.tsx).
import type { Component } from "solid-js";
import { FolderIcon } from "../icons/Icons";
import { openNewFolder, createNoteIn, newItemParent } from "../../state/ui";

const SidebarHeader: Component = () => {
  // New items land inside the selected folder (or the selected note's folder),
  // falling back to the vault root when nothing in the tree is selected.
  return (
    <div class="sidebar-header">
      <button class="new-note-btn" title="New Note" onClick={() => createNoteIn(newItemParent())}>
        <span class="icon-btn__plus">+</span>
        <span>New note</span>
      </button>
      <button class="new-folder-btn" title="New Folder" onClick={() => openNewFolder(newItemParent())}>
        <FolderIcon />
      </button>
    </div>
  );
};

export default SidebarHeader;
