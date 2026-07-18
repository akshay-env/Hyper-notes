// Compact, non-interactive preview of the active note's neighbourhood (active
// note + direct neighbours + the edges among them). Clicking anywhere opens the
// full GraphView. Mirrors MiniGraph.qml.
import { type Component, onMount, onCleanup, createEffect } from "solid-js";
import { GraphCanvas } from "../../graph/GraphCanvas";
import { buildGraphData } from "../../graph/buildGraphData";
import { getNeighbors } from "../../graph/getNeighbors";
import { vaultTree } from "../../state/vault";
import { readDoc } from "../../state/documents";
import { activeNotePath, openGraphTab } from "../../state/ui";
import { themeRevision } from "../../state/theme";

const MiniGraph: Component = () => {
  let canvas: HTMLCanvasElement | undefined;
  let ctrl: GraphCanvas | undefined;

  onMount(() => {
    if (!canvas) return;
    ctrl = new GraphCanvas(canvas, {
      interactive: false,
      onExpand: () => openGraphTab(),
    });

    // Rebuild the subgraph whenever the active note changes.
    createEffect(() => {
      const active = activeNotePath();
      ctrl!.setActivePath(active);
      ctrl!.setFocusPaths([active]);

      const full = buildGraphData(vaultTree, readDoc, active);
      const keep = new Set<string>([active, ...getNeighbors(full.edges, active)]);
      const nodes = full.nodes.filter((n) => keep.has(n.path));
      const edges = full.edges.filter((e) => keep.has(e.from) && keep.has(e.to));
      ctrl!.setData(nodes, edges);
    });

    // Re-read the palette on any theme change (mode, accent, or background).
    createEffect(() => {
      themeRevision();
      ctrl!.refreshColors();
    });
  });
  onCleanup(() => ctrl?.destroy());

  return <canvas class="graph-canvas" ref={canvas} />;
};

export default MiniGraph;
