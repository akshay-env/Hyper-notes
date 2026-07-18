// Empty-tab placeholder (NewTabView.qml): shown for a tab with no note. Offers
// "Create note" (converts the tab into a note) and "Close" (closes the tab).
import { type Component, Show } from "solid-js";
import { activeTabIndex, closeTab, createNoteInCurrentTab, openTabs } from "../../state/ui";

const NewTabView: Component = () => (
  <div class="new-tab-view">
    <div class="new-tab-view__inner">
      <div class="new-tab-view__title">Start a new note</div>
      <div class="new-tab-view__actions">
        <button class="new-tab-btn new-tab-btn--primary" onClick={() => createNoteInCurrentTab()}>
          Create note
        </button>
        {/* The sole empty tab can't be closed, so only offer Close with others open. */}
        <Show when={openTabs().length > 1}>
          <button class="new-tab-btn new-tab-btn--ghost" onClick={() => closeTab(activeTabIndex())}>
            Close
          </button>
        </Show>
      </div>
    </div>
  </div>
);

export default NewTabView;
