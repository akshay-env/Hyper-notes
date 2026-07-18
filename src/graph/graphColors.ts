// Reads the live theme's graph palette off the CSS custom properties so the
// canvas renderer stays theme-driven (matches Theme.qml's node/graph colours).
export interface GraphColors {
  graphBg: string;
  node: string;
  nodeNeighbor: string;
  nodeActive: string;
  nodeHi: string;
  nodeLabel: string;
  accent: string;
  accentText: string;
  border: string;
  text: string;
  textDim: string;
  textMuted: string;
  textFaint: string;
}

export function readGraphColors(): GraphColors {
  const s = getComputedStyle(document.documentElement);
  const g = (n: string) => s.getPropertyValue(n).trim();
  return {
    graphBg: g("--graph-bg") || "#000000",
    node: g("--node") || "#b0b0b0",
    nodeNeighbor: g("--node-neighbor") || "#ffffff",
    nodeActive: g("--node-active") || "#ffe000",
    nodeHi: g("--node-hi") || "#ffffff",
    nodeLabel: g("--node-label") || g("--text-dim") || "#c8c8c8",
    accent: g("--accent") || "#ffe000",
    accentText: g("--accent-text") || "#ffe000",
    border: g("--border") || "#3a3a3a",
    text: g("--text") || "#ffffff",
    textDim: g("--text-dim") || "#c8c8c8",
    textMuted: g("--text-muted") || "#909090",
    textFaint: g("--text-faint") || "#5a5a5a",
  };
}
