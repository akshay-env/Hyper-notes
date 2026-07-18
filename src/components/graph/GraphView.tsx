// The whole-vault graph, rendered as the content of a graph tab (see Tab.kind).
// Interactive: pan, cursor-centred zoom, hover-highlight, node drag with momentum.
// Top-left ↻ Replay rebuilds node-by-node. There's no close button — the tab's own
// close does that, the same as for a note.
import { type Component, onMount, onCleanup, createEffect, createSignal } from "solid-js";
import { GraphCanvas, loadGraphCache } from "../../graph/GraphCanvas";
import { buildGraphData } from "../../graph/buildGraphData";
import { vaultTree } from "../../state/vault";
import { readDoc } from "../../state/documents";
import { activeNotePath, openTabs, selectNoteByPath } from "../../state/ui";
import { themeRevision } from "../../state/theme";

const GraphView: Component<{ closing?: () => boolean }> = (props) => {
  let canvas: HTMLCanvasElement | undefined;
  let ctrl: GraphCanvas | undefined;
  const [replaying, setReplaying] = createSignal(false);

  onMount(() => {
    if (!canvas) return;
    ctrl = new GraphCanvas(canvas, {
      interactive: true,
      // Opening a note from the graph moves focus to that note's tab; the graph tab
      // stays open behind it, so you can flip back to it.
      onNodeClick: (path) => selectNoteByPath(path),
    });
    ctrl.onReplayStateChange = setReplaying;

    // Build the whole-vault graph once on open (Qt: loadGraph on visible).
    const full = buildGraphData(vaultTree, readDoc, activeNotePath());
    loadGraphCache().then(() => {
      if (ctrl) ctrl.setData(full.nodes, full.edges);
    });

    // Keep the highlight (active note + open tabs) in sync.
    createEffect(() => {
      ctrl!.setActivePath(activeNotePath());
      ctrl!.setFocusPaths(openTabs().map((t) => t.path).filter((p) => p !== ""));
    });

    // Re-read the palette on any theme change (mode, accent, or background).
    createEffect(() => {
      themeRevision();
      ctrl!.refreshColors();
    });
  });
  onCleanup(() => ctrl?.destroy());

  return (
    <div class="graph-view" classList={{ "is-closing": props.closing?.() }}>
      <canvas class="graph-canvas" ref={canvas} />

      <button
        class="graph-replay"
        title="Rebuild the graph"
        onClick={() => ctrl?.startReplay()}
      >
        <span class="graph-replay__icon">↻</span>
        <span>{replaying() ? "Building…" : "Replay"}</span>
      </button>
    </div>
  );
};

export default GraphView;
