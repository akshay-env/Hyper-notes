// User-tunable graph appearance + physics, persisted to localStorage. These ARE
// the defaults the canvas renders with — GraphCanvas reads them live every frame,
// so moving a slider re-renders (and re-heats the layout for physics changes)
// with no reload.
//
// The DEFAULTS below are the Qt app's shipped values (GraphNode.qml dot sizing,
// GraphRenderer.cpp edge widths, PhysicsWorker.h force constants), except the
// edge widths, which are thicker here: Qt drew edges as GL_LINES with 4× MSAA,
// while canvas hairlines at 1px read as almost invisible.
import { createSignal } from "solid-js";

export interface GraphSettings {
  // ── Nodes ── radius = clamp(nodeSizeByLinks·√(degree+1), nodeBaseRadius,
  // maxNodeGrowth) — Obsidian's getSize() curve (theirs: 3·√, clamped 8…30).
  nodeBaseRadius: number; // smallest dot radius (a note with no links)
  activeNodeBonus: number; // extra radius on the active note
  nodeSizeByLinks: number; // √-growth coefficient (0 = uniform)
  maxNodeGrowth: number; // largest dot radius
  hoverScale: number; // dot scale while hovered
  // ── Edges ──
  edgeWidth: number;
  edgeOpacity: number;
  highlightEdgeWidth: number;
  // ── Labels ──
  labelSize: number;
  showLabels: boolean;
  // On-screen size of a hovered label, as a multiple of labelSize. This one is
  // locked to the screen: it renders the same size at every zoom level, so you
  // can read a note's title by hovering it without zooming in.
  hoverLabelScale: number;
  // ── Highlight ──
  dimOpacity: number; // opacity of unrelated nodes when something is focused
  // ── Physics ──
  repulsion: number; // how hard nodes push each other apart
  linkDistance: number; // resting length of a link
  linkStrength: number; // how stiff links are
  gravity: number; // pull toward the centre
  collisionRadius: number; // personal space around each node
  damping: number; // 0 = stops instantly, 1 = never settles
}

export const GRAPH_DEFAULTS: GraphSettings = {
  // Obsidian's getSize(): max(8, min(3·√(weight+1), 30)).
  nodeBaseRadius: 8,
  activeNodeBonus: 2,
  nodeSizeByLinks: 3,
  maxNodeGrowth: 30,
  hoverScale: 1.3,

  edgeWidth: 1.6,
  edgeOpacity: 0.7,
  highlightEdgeWidth: 2.6,

  labelSize: 11,
  showLabels: true,
  hoverLabelScale: 1.28,

  dimOpacity: 0.14,

  repulsion: 1000,
  linkDistance: 250,
  linkStrength: 1,
  gravity: 0.1,
  collisionRadius: 60,
  damping: 0.6,
};

// Bounds + step + copy for the Settings sliders. `label` is what the user reads —
// keep it plain-language, not the internal field name.
export interface GraphSettingField {
  key: keyof GraphSettings;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
}

export const GRAPH_NODE_FIELDS: GraphSettingField[] = [
  { key: "nodeBaseRadius", label: "Node size", hint: "Smallest dot — a note with no links", min: 2, max: 20, step: 0.5, unit: "px" },
  { key: "activeNodeBonus", label: "Current note bump", hint: "Extra size on the note you're viewing", min: 0, max: 12, step: 0.5, unit: "px" },
  { key: "nodeSizeByLinks", label: "Grow with links", hint: "How much a well-linked note swells", min: 0, max: 12, step: 0.5 },
  { key: "maxNodeGrowth", label: "Growth limit", hint: "Largest dot — cap so hubs don't become blobs", min: 8, max: 60, step: 1, unit: "px" },
  { key: "hoverScale", label: "Hover pop", hint: "How much a node grows under the cursor", min: 1, max: 2, step: 0.05, unit: "×" },
];

export const GRAPH_EDGE_FIELDS: GraphSettingField[] = [
  { key: "edgeWidth", label: "Line thickness", hint: "Width of the connecting lines", min: 0.5, max: 6, step: 0.1, unit: "px" },
  { key: "edgeOpacity", label: "Line opacity", hint: "How visible unrelated lines are", min: 0.1, max: 1, step: 0.05 },
  { key: "highlightEdgeWidth", label: "Highlighted thickness", hint: "Width of lines touching the current note", min: 0.5, max: 8, step: 0.1, unit: "px" },
];

// Split so the panel can hide the label-only knobs when titles are turned off.
export const GRAPH_LABEL_FIELDS: GraphSettingField[] = [
  { key: "labelSize", label: "Label size", hint: "Note title text size", min: 7, max: 20, step: 0.5, unit: "px" },
  {
    key: "hoverLabelScale",
    label: "Hovered label size",
    hint: "Stays this size on screen at any zoom, so you can read a title without zooming in",
    min: 1,
    max: 4,
    step: 0.05,
    unit: "×",
  },
];
export const GRAPH_FOCUS_FIELDS: GraphSettingField[] = [
  { key: "dimOpacity", label: "Dimming", hint: "How faint unrelated notes go", min: 0, max: 1, step: 0.02 },
];

export const GRAPH_PHYSICS_FIELDS: GraphSettingField[] = [
  { key: "repulsion", label: "Repulsion", hint: "How hard notes push each other apart", min: 100, max: 3000, step: 50 },
  { key: "linkDistance", label: "Link length", hint: "Resting distance between linked notes", min: 50, max: 600, step: 10, unit: "px" },
  { key: "linkStrength", label: "Link stiffness", hint: "How rigidly links hold that distance", min: 0.1, max: 3, step: 0.1, unit: "×" },
  { key: "gravity", label: "Centre pull", hint: "Keeps loose notes from drifting away", min: 0, max: 0.5, step: 0.01 },
  { key: "collisionRadius", label: "Spacing", hint: "Personal space around each node", min: 0, max: 160, step: 5, unit: "px" },
  { key: "damping", label: "Settling", hint: "Lower settles faster, higher keeps drifting", min: 0.1, max: 0.95, step: 0.05 },
];

const STORAGE_KEY = "hln.graph.settings";

function load(): GraphSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...GRAPH_DEFAULTS };
    const saved = JSON.parse(raw) as Partial<GraphSettings>;
    // Merge over defaults so a settings file from an older build (missing keys)
    // still loads, and an unknown key can't poison the store.
    const out = { ...GRAPH_DEFAULTS };
    for (const k of Object.keys(GRAPH_DEFAULTS) as (keyof GraphSettings)[]) {
      const v = saved[k];
      if (typeof v === typeof GRAPH_DEFAULTS[k]) (out as Record<string, unknown>)[k] = v;
    }
    return out;
  } catch {
    return { ...GRAPH_DEFAULTS };
  }
}

const [graphSettings, setGraphSettingsRaw] = createSignal<GraphSettings>(load());
export { graphSettings };

function persist(s: GraphSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* unavailable — session only */
  }
}

export function setGraphSetting<K extends keyof GraphSettings>(key: K, value: GraphSettings[K]): void {
  const next = { ...graphSettings(), [key]: value };
  setGraphSettingsRaw(next);
  persist(next);
}

export function resetGraphSettings(): void {
  setGraphSettingsRaw({ ...GRAPH_DEFAULTS });
  persist(GRAPH_DEFAULTS);
}

// True when nothing has been changed from the shipped defaults (disables Reset).
export const graphSettingsAreDefault = (): boolean => {
  const s = graphSettings();
  return (Object.keys(GRAPH_DEFAULTS) as (keyof GraphSettings)[]).every(
    (k) => s[k] === GRAPH_DEFAULTS[k],
  );
};

// Physics keys — changing one of these must re-heat the running layout, since the
// simulation has already cooled to rest by the time the user drags a slider.
export const PHYSICS_KEYS: (keyof GraphSettings)[] = [
  "repulsion",
  "linkDistance",
  "linkStrength",
  "gravity",
  "collisionRadius",
  "damping",
];
