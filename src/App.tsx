// Shell orchestrator (Main.qml): title bar + divider, then sidebar | main |
// right-panel, then the full-width status bar. Main = tab strip + editor toolbar
// + CM6 editor, with NewTabView / EmptyState / GraphView overlaying the editor.
// App-level: modal dialogs (+ scrim) and the vault-selection overlay.
import { type Component, Show } from "solid-js";
import "./components/chrome.css";
import "./theme/motion.css";
import { Presence } from "./components/core/Presence";
import TitleBar from "./components/TitleBar";
import Sidebar from "./components/sidebar/Sidebar";
import EditorToolbar from "./components/editor/EditorToolbar";
import Editor from "./components/editor/Editor";
import StatusBar from "./components/StatusBar";
import RightPanel from "./components/right/RightPanel";
import GraphView from "./components/graph/GraphView";
import EmptyState from "./components/core/EmptyState";
import NewTabView from "./components/core/NewTabView";
import SettingsPanel from "./components/core/SettingsPanel";
import BinPanel from "./components/core/BinPanel";
import ResizeHandle from "./components/core/ResizeHandle";
import NewFolderDialog from "./components/dialogs/NewFolderDialog";
import DeleteConfirmDialog from "./components/dialogs/DeleteConfirmDialog";
import RenameDialog from "./components/dialogs/RenameDialog";
import AddNoteDialog from "./components/dialogs/AddNoteDialog";
import NoteSearchBar from "./components/editor/NoteSearchBar";
import AskBar from "./components/editor/AskBar";
import WikilinkHoverCard from "./components/editor/WikilinkHoverCard";
import EditorContextMenu from "./components/editor/EditorContextMenu";
import {
  sidebarOpen,
  rightPanelOpen,
  sidebarWidth,
  rightPanelWidth,
  resizing,
  graphViewActive,
  openTabs,
  activeTabIndex,
  noteSearchOpen,
  settingsOpen,
  binOpen,
} from "./state/ui";

const App: Component = () => {
  const noTabs = () => openTabs().length === 0;
  const emptyTab = () => (openTabs()[activeTabIndex()]?.path ?? "") === "";

  return (
    <div class="app" classList={{ "is-resizing": resizing() }}>
      <TitleBar />
      <div class="body">
        {/* Docks stay mounted so open/close is a smooth width transition (not an
            instant mount/unmount); their width is drag-resizable + persisted. */}
        <div
          class="sidebar-dock"
          classList={{ "is-collapsed": !sidebarOpen() }}
          style={{ width: sidebarOpen() ? `${sidebarWidth()}px` : "0px" }}
        >
          <div class="sidebar-dock__inner" style={{ width: `${sidebarWidth()}px` }}>
            <Sidebar />
          </div>
        </div>
        <ResizeHandle side="left" visible={sidebarOpen()} />

        <main class="main" classList={{ "content-centered": !sidebarOpen() }}>
          <EditorToolbar />
          <div class="editor-area">
            <Editor />
            <div
              class={`note-search-slot ${noteSearchOpen() && !graphViewActive() && !noTabs() ? "open" : ""}`}
            >
              <NoteSearchBar />
            </div>
            <Show when={!graphViewActive() && !noTabs() && emptyTab()}>
              <NewTabView />
            </Show>
            <Show when={!graphViewActive() && noTabs()}>
              <EmptyState />
            </Show>
            {/* The graph is a tab's content, so it mounts and unmounts with tab
                selection — flipping to another tab shows that tab, not the graph. */}
            <Presence when={graphViewActive()}>
              {(closing) => <GraphView closing={closing} />}
            </Presence>
            <Show when={!graphViewActive() && !noTabs() && !emptyTab()}>
              <AskBar />
            </Show>
          </div>
        </main>

        <ResizeHandle side="right" visible={rightPanelOpen()} />
        <div
          class="right-panel-dock"
          classList={{ "is-collapsed": !rightPanelOpen() }}
          style={{ width: rightPanelOpen() ? `${rightPanelWidth()}px` : "0px" }}
        >
          <div class="right-panel-dock__inner" style={{ width: `${rightPanelWidth()}px` }}>
            <RightPanel />
          </div>
        </div>
      </div>
      <StatusBar />

      {/* Each dialog reads its own open-signal and owns its own scrim, focus trap
          and enter/exit presence (see DialogShell) — hence no <Presence> wrapper
          and no shared scrim element here. They stay mounted; their BODIES mount
          only while open. */}
      <NewFolderDialog />
      <DeleteConfirmDialog />
      <RenameDialog />
      <AddNoteDialog />

      <Presence when={settingsOpen()}>
        {(closing) => <SettingsPanel closing={closing} />}
      </Presence>
      <Presence when={binOpen()}>
        {(closing) => <BinPanel closing={closing} />}
      </Presence>

      <WikilinkHoverCard />
      {/* Suppresses the native context menu app-wide; opens our own over the editor. */}
      <EditorContextMenu />
    </div>
  );
};

export default App;
