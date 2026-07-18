// Graph data pipeline, ported 1:1 from the Qt app's scripts/graph/*.js
// (flattenNotes → extractLinks → buildGlobalGraph → calculateLayers). Given the
// vault tree + a file reader, produces the nodes/edges the force layout draws.
import type { VaultNode } from "../state/vaultTypes";
import { extractLinks as parseLinks, titleKey, normalizeTarget } from "./wikilinkParse";

export interface GraphNode {
  id: string;
  title: string;
  path: string;
  layer: number;
  degree: number;
}
export interface GraphEdge {
  from: string;
  to: string;
}
export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// Flatten the vault tree into a flat list of all note (.md) nodes.
function flattenNotes(nodes: VaultNode[] | undefined, out: VaultNode[]): void {
  if (!nodes) return;
  for (const node of nodes) {
    if (node.isFolder) flattenNotes(node.children, out);
    else if (node.name && node.name.toLowerCase().endsWith(".md")) out.push(node);
  }
}

// Link parsing lives in wikilinkParse so the graph and the editor's click
// handler can never disagree about what a link points at.
export { extractLinks } from "./wikilinkParse";

// BFS from the active note over the (bidirectional) edge list → visual layer.
function calculateLayers(startPath: string, nodes: GraphNode[], edges: GraphEdge[]): void {
  if (startPath === "") return;

  const adj: Record<string, string[]> = {};
  for (const e of edges) {
    (adj[e.from] ||= []).push(e.to);
    (adj[e.to] ||= []).push(e.from);
  }

  const visited: Record<string, number> = { [startPath]: 0 };
  const queue: { path: string; layer: number }[] = [{ path: startPath, layer: 0 }];
  let head = 0;
  while (head < queue.length) {
    const { path, layer } = queue[head++];
    for (const n of adj[path] || []) {
      if (!(n in visited)) {
        visited[n] = layer + 1;
        queue.push({ path: n, layer: layer + 1 });
      }
    }
  }

  for (const node of nodes) {
    if (node.path in visited) node.layer = visited[node.path];
  }
}

// Orchestrator: build the whole-vault graph, then tag layers relative to the
// active note. `readFile` returns a note's markdown (empty string if unknown).
export function buildGraphData(
  tree: VaultNode[],
  readFile: (path: string) => string,
  activePath: string,
): GraphData {
  const allNotes: VaultNode[] = [];
  flattenNotes(tree, allNotes);

  // Target → note, keyed case-insensitively by BOTH the basename ([[Note]]) and
  // the full vault-relative path ([[folder/Note]]) so either link form resolves,
  // exactly like the editor's click handler. First writer wins per key, so a
  // duplicate title in another folder can't steal links that already resolved.
  const titleToNode = new Map<string, VaultNode>();
  for (const n of allNotes) {
    const noExt = n.path.replace(/\.md$/i, "").replace(/^\//, "");
    const nameKey = titleKey(noExt.split("/").pop() || noExt);
    const pathKey = titleKey(noExt);
    if (!titleToNode.has(nameKey)) titleToNode.set(nameKey, n);
    if (!titleToNode.has(pathKey)) titleToNode.set(pathKey, n);
  }

  // Outbound links per note path.
  const outLinks: Record<string, string[]> = {};
  for (const n of allNotes) outLinks[n.path] = parseLinks(readFile(n.path));

  // Nodes.
  const nodes: GraphNode[] = allNotes.map((n) => ({
    id: n.path,
    title: n.name.replace(/\.md$/i, ""),
    path: n.path,
    layer: 999,
    degree: 0,
  }));

  // Edges (only where the destination title resolves to a real note). Deduped on
  // the RESOLVED target, not the link text: [[Beta]] and [[BETA]] name the same
  // note, and drawing that edge twice would double the node's degree (and its
  // dot size) for what the reader sees as one connection.
  const edges: GraphEdge[] = [];
  for (const n of allNotes) {
    const linked = new Set<string>();
    for (const dest of outLinks[n.path] || []) {
      const target = titleToNode.get(titleKey(normalizeTarget(dest)));
      if (!target || linked.has(target.path)) continue;
      linked.add(target.path);
      edges.push({ from: n.path, to: target.path });
    }
  }

  // Degree = inbound + outbound (drives node size).
  const degree: Record<string, number> = {};
  for (const e of edges) {
    degree[e.from] = (degree[e.from] || 0) + 1;
    degree[e.to] = (degree[e.to] || 0) + 1;
  }
  for (const node of nodes) node.degree = degree[node.id] || 0;

  calculateLayers(activePath, nodes, edges);
  return { nodes, edges };
}
