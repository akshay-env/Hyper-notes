// All neighbour node paths for a given node path (both edge directions).
import type { GraphEdge } from "./buildGraphData";

export function getNeighbors(edges: GraphEdge[], path: string): string[] {
  const neighbors: string[] = [];
  if (!edges) return neighbors;
  for (const e of edges) {
    if (e.from === path) neighbors.push(e.to);
    if (e.to === path) neighbors.push(e.from);
  }
  return neighbors;
}
