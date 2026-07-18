// In-editor toolbar (top of the editor pane): breadcrumb on the left, the note
// tools on the right (find-in-note, back/forward, right-panel toggle) — no
// dividing line, so it floats over the document. Moved here from the tab row.
import { type Component, Show } from "solid-js";
import { FindIcon } from "../icons/Icons";
import SidebarToggleButton from "../SidebarToggleButton";
import { editorMode, cycleEditorMode } from "../../state/editor";
import {
  rightPanelOpen,
  setRightPanelOpen,
  noteSearchOpen,
  setNoteSearchOpen,
  activeNoteCrumb,
  canGoBack,
  canGoForward,
  goBack,
  goForward,
} from "../../state/ui";

// Obsidian's three editing modes, cycled by one button (its icon = current mode).
const MODE_TITLES = {
  live: "Live Preview — click for Source mode",
  source: "Source mode — click for Reading view",
  reading: "Reading view — click for Live Preview",
} as const;

const ModeIcon: Component = () => (
  <Show
    when={editorMode() === "live"}
    fallback={
      <Show
        when={editorMode() === "source"}
        fallback={
          // reading: book
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
          </svg>
        }
      >
        {/* source: code brackets */}
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      </Show>
    }
  >
    {/* live preview: pencil */}
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </svg>
  </Show>
);

const EditorToolbar: Component = () => {
  return (
    <div class="editor-toolbar">
      <span class="editor-toolbar__crumb">{activeNoteCrumb()}</span>

      <div class="editor-toolbar__tools">
        <button class="etool" title={MODE_TITLES[editorMode()]} onClick={cycleEditorMode}>
          <ModeIcon />
        </button>
        <button
          class={`etool ${noteSearchOpen() ? "active" : ""}`}
          title="Find in note"
          onClick={() => setNoteSearchOpen(!noteSearchOpen())}
        >
          <FindIcon size={15} />
        </button>
        <button class="etool" title="Back" disabled={!canGoBack()} onClick={goBack}>
          <span class="etool__arrow">←</span>
        </button>
        <button class="etool" title="Forward" disabled={!canGoForward()} onClick={goForward}>
          <span class="etool__arrow">→</span>
        </button>
        <SidebarToggleButton
          side="right"
          open={rightPanelOpen()}
          title={rightPanelOpen() ? "Hide side panel" : "Show side panel"}
          onClick={() => setRightPanelOpen(!rightPanelOpen())}
        />
      </div>
    </div>
  );
};

export default EditorToolbar;
