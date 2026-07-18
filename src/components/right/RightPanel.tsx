// Right dock: a live mini-graph of the open note's neighbourhood, a clickable
// outline of its headings, and a pinned footer with the Settings + Bin actions.
//
// The footer mirrors the sidebar's: a SIBLING of the padded content so its top
// divider is full-bleed, and the same --footer-h so both docks end on one baseline.
// Tools sit bottom-right, opposite the sidebar's full-width vault tile, so the two
// outer corners frame the window.
import type { Component } from "solid-js";
import MiniGraph from "../graph/MiniGraph";
import Outline from "./Outline";
import { TrashIcon, GearIcon } from "../icons/Icons";
import { openSettings, openBin } from "../../state/ui";

const RightPanel: Component = () => {
  return (
    <aside class="right-panel">
      <div class="right-panel__content">
        <div class="right-panel__label">Graph</div>
        <div class="mini-graph">
          <MiniGraph />
        </div>

        <div class="right-panel__label right-panel__label--outline">Outline</div>
        <div class="right-panel__outline">
          <Outline />
        </div>
      </div>

      <div class="dock-footer dock-footer--tools">
        <button class="sb-tile" title="Settings" onClick={() => openSettings()}>
          <GearIcon />
        </button>
        <button class="sb-tile" title="Bin" onClick={() => openBin()}>
          <TrashIcon />
        </button>
      </div>
    </aside>
  );
};

export default RightPanel;
