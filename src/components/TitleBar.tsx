// Top bar (row 1): the frameless window's drag region now also hosts the tab
// strip. Left cell holds the bare sidebar toggle and tracks the sidebar width so
// the tabs begin at the editor's edge; window controls sit at the far right. A
// stub of the right-panel divider reaches up here, parked before the controls.
import { type Component } from "solid-js";
import SidebarToggleButton from "./SidebarToggleButton";
import WindowControlButton from "./WindowControlButton";
import TabStrip from "./TabStrip";
import {
  sidebarOpen,
  setSidebarOpen,
  sidebarWidth,
  rightPanelOpen,
  rightPanelWidth,
} from "../state/ui";
import { flushEditor } from "../state/editor";
import { minimizeWindow, toggleMaximizeWindow, closeWindow } from "../backend/window";

// Left cell width when the sidebar is collapsed (keeps the toggle reachable).
const COLLAPSED_LEFT = 46;
// Total width of the three window controls (3 × 46) — where the collapsed stub parks.
const WINCTRLS_W = 138;

const TitleBar: Component = () => {
  return (
    <div class="topbar" data-tauri-drag-region>
      <div
        class="topbar__left"
        style={{ width: `${sidebarOpen() ? sidebarWidth() : COLLAPSED_LEFT}px` }}
      >
        <SidebarToggleButton open={sidebarOpen()} onClick={() => setSidebarOpen(!sidebarOpen())} />
      </div>

      <TabStrip />

      {/* Right zone sits above the right panel; its left border is the divider
          that bounds the tabs. It shrinks to just the window controls when the
          right panel is collapsed, handing that width back to the tabs. */}
      <div
        class="topbar__right"
        style={{ width: `${rightPanelOpen() ? rightPanelWidth() : WINCTRLS_W}px` }}
        data-tauri-drag-region
      >
        <div class="topbar__drag" data-tauri-drag-region />
        <div class="winctrls">
          <WindowControlButton type="minimize" onClick={() => minimizeWindow()} />
          <WindowControlButton type="maximize" onClick={() => toggleMaximizeWindow()} />
          <WindowControlButton
            type="close"
            onClick={() => {
              flushEditor();
              closeWindow();
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default TitleBar;
