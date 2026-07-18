// Tree search box (SidebarSearch.qml, height 32): magnifier + input + clear.
import { type Component, Show } from "solid-js";
import { SearchIcon } from "../icons/Icons";
import { treeSearchQuery, setTreeSearchQuery } from "../../state/ui";

const SidebarSearch: Component = () => {
  return (
    <div class="sidebar-search">
      <span class="sidebar-search__icon">
        <SearchIcon />
      </span>
      <input
        type="text"
        placeholder="Search notes & folders"
        value={treeSearchQuery()}
        onInput={(e) => setTreeSearchQuery(e.currentTarget.value)}
      />
      <Show when={treeSearchQuery() !== ""}>
        <span class="sidebar-search__clear" onClick={() => setTreeSearchQuery("")}>
          ×
        </span>
      </Show>
    </div>
  );
};

export default SidebarSearch;
