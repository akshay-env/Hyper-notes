// Left dock (Sidebar.qml, width 240): creation header, search, file tree, and a
// pinned footer holding the vault switcher.
//
// The footer is a SIBLING of the padded content, not a child — that's what lets its
// top divider span the full dock width instead of stopping short at the padding.
// Its height is --footer-h, shared with the right dock's footer, so both docks end
// on the same baseline.
import type { Component } from "solid-js";
import SidebarHeader from "./SidebarHeader";
import SidebarSearch from "./SidebarSearch";
import FileTree from "./FileTree";
import { VaultChevron } from "../icons/Icons";
import { vaultName } from "../../state/session";
import { openVaultDialog } from "../../state/ui";

const Sidebar: Component = () => {
  return (
    <div class="sidebar">
      <div class="sidebar__content">
        <SidebarHeader />
        <SidebarSearch />
        <FileTree />
      </div>
      {/* Bin + Settings live in the right dock's footer; the graph button is gone —
          clicking the mini-graph opens the graph tab. */}
      <div class="dock-footer">
        <button class="vault-tile" title="Switch vault" onClick={() => openVaultDialog()}>
          <span class="vault-tile__name">{vaultName()}</span>
          <VaultChevron class="vault-tile__chev" />
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
