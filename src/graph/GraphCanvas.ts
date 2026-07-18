import * as PIXI from "pixi.js";
import "@pixi/canvas-renderer"; // registers the Canvas2D fallback for autoDetectRenderer
import { createRoot, createEffect } from "solid-js";
import type { GraphNode, GraphEdge } from "./buildGraphData";
import { ForceSimulation, type NodeInit, type PhysicsParams } from "./physics";
import { readGraphColors, type GraphColors } from "./graphColors";
import { graphSettings, type GraphSettings } from "../state/graphSettings";
import { vaultRoot } from "../state/session";
import { readFileFs, writeNoteFs } from "../backend/vaultApi";
import { isTauri } from "../state/platform";

const layoutCache = new Map<string, { x: number; y: number }>();
let layoutSig = "";

export async function loadGraphCache(): Promise<void> {
  if (!isTauri()) return;
  const root = vaultRoot();
  if (!root) return;
  try {
    const raw = await readFileFs(root, ".hyperlink/graph.json");
    const parsed = JSON.parse(raw);
    if (parsed.sig) layoutSig = parsed.sig;
    if (parsed.cache) {
      layoutCache.clear();
      for (const [k, v] of Object.entries(parsed.cache)) {
        layoutCache.set(k, v as { x: number; y: number });
      }
    }
  } catch (e) {
    // Expected on first run or if file missing
  }
}

export async function saveGraphCache(): Promise<void> {
  if (!isTauri()) return;
  const root = vaultRoot();
  if (!root) return;
  const obj = Object.fromEntries(layoutCache.entries());
  const data = JSON.stringify({ sig: layoutSig, cache: obj });
  try {
    await writeNoteFs(root, ".hyperlink/graph.json", data);
  } catch (e) {
    console.error("Failed to save graph cache", e);
  }
}

function topologySig(nodes: GraphNode[], edges: GraphEdge[]): string {
  let h = 0x811c9dc5;
  const mixStr = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
  };
  for (const n of nodes) mixStr(n.path);
  for (const e of edges) {
    mixStr(e.from);
    mixStr(e.to);
  }
  return `${nodes.length}|${edges.length}|${h >>> 0}`;
}

// Per-frame easing of the highlight so hover fades in/out instead of snapping.
// 0.18 ≈ the 150ms ColorAnimation/NumberAnimation the Qt GraphNode used.
const GLOW_EASE = 0.18;

// Theme colours are parsed to numeric [r,g,b] ONCE (refreshColors), and the
// blending below works on those triples. An earlier version cached by colour
// *string* and chained mix() calls — each chained call fed it a freshly-built
// "rgb(…)" string, so every node every frame was a cache miss that built a new
// <canvas> to parse it and grew the cache without bound. That was the stutter.
export type Rgb = [number, number, number];

let parseCtx: CanvasRenderingContext2D | null = null;
function parseColor(color: string): Rgb {
  if (!parseCtx) parseCtx = document.createElement("canvas").getContext("2d");
  const c = parseCtx!;
  c.fillStyle = "#000";
  c.fillStyle = color;
  const norm = c.fillStyle as string; // normalised to "#rrggbb" or "rgba(…)"
  if (norm.startsWith("#")) {
    return [
      parseInt(norm.slice(1, 3), 16),
      parseInt(norm.slice(3, 5), 16),
      parseInt(norm.slice(5, 7), 16),
    ];
  }
  const m = norm.match(/[\d.]+/g);
  return m ? [Number(m[0]), Number(m[1]), Number(m[2])] : [176, 176, 176];
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// Blend into a reused triple — no allocation per node per frame.
const mixBuf: Rgb = [0, 0, 0];
function mixInto(out: Rgb, a: Rgb, b: Rgb, t: number): Rgb {
  if (t <= 0.001) {
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
  } else if (t >= 0.999) {
    out[0] = b[0];
    out[1] = b[1];
    out[2] = b[2];
  } else {
    out[0] = lerp(a[0], b[0], t);
    out[1] = lerp(a[1], b[1], t);
    out[2] = lerp(a[2], b[2], t);
  }
  return out;
}
// Pixi wants packed 0xRRGGBB numbers (for tints, line styles, background).
const rgbNum = (c: Rgb) =>
  (Math.round(c[0]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[2]);

// The one white circle every node sprite is a tinted/scaled copy of, and the
// rasterized font size every label texture is generated at (then scaled).
const CIRCLE_TEX_R = 64;
const LABEL_TEX_PX = 48;
const LABEL_FONT = '"Segoe UI", system-ui, sans-serif';

export interface GraphConfig {
  interactive: boolean; // full graph: pan/zoom/hover/drag. mini: click-to-expand only
  onExpand?: () => void; // mini: click anywhere opens the full graph
  onNodeClick?: (path: string) => void; // full: click a node opens the note
  fitPad?: number;
  fitEase?: number;
  maxFitZoom?: number;
}

// Obsidian's renderer: scale clamped to [1/128, 8], wheel multiplies the TARGET
// scale by 1.5^(-deltaY/120) and the actual scale eases toward it at 15%/frame
// (updateZoom's mQ(scale, target, .85)) — zoom glides instead of stepping.
const MIN_ZOOM = 1 / 128;
const MAX_ZOOM = 8;
const ZOOM_EASE_KEEP = 0.85; // fraction of current scale kept per frame
// PhysicsWorker: fixed 60 Hz tick (16 ms). The sim is iteration-based, so this
// must not follow the display refresh rate (144 Hz ran velDecay 2.4× too often).
const TICK_MS = 16;
// Cap catch-up ticks per frame. 5 was too many: on a big graph each tick costs
// milliseconds, so a late frame would run 5 of them and fall further behind —
// the death spiral that made a 1000-note vault look frozen on open. Better to
// let the layout run slightly slow than to stall the frame.
const MAX_TICKS_PER_FRAME = 2;

interface Meta {
  title: string;
  path: string;
  layer: number;
  degree: number;
  disp: number; // eased display scale (hover/focus pop)
  // Eased highlight channels, each 0→1, so hover fades rather than snaps.
  hoverT: number;
  focusT: number;
  neighborT: number;
  dimT: number;
}
const newMeta = (n: GraphNode): Meta => ({
  title: n.title,
  path: n.path,
  layer: n.layer,
  degree: n.degree,
  disp: 1,
  hoverT: 0,
  focusT: 0,
  neighborT: 0,
  dimT: 0,
});

export class GraphCanvas {
  private canvas: HTMLCanvasElement;
  // PixiJS scene (WebGL; Canvas2D fallback where WebGL is unavailable). The
  // world container carries pan/zoom; edges are ONE Graphics rebuilt per
  // frame; nodes and labels are pooled sprites keyed by path — created and
  // removed in rebuildIndex, only restyled per frame, so the whole node layer
  // batches into a handful of GPU draw calls at any zoom level.
  private renderer!: PIXI.IRenderer;
  private stage = new PIXI.Container();
  private world = new PIXI.Container();
  // Edges are two layers: the dim "base" (every edge) is heavy to tessellate, so
  // it's rebuilt ONLY when the layout, camera, or bloom actually changed — a
  // static hover no longer re-tessellates thousands of segments each frame. The
  // "hi" layer holds just the lit edges (neighbours of the focus/hover set) and
  // is cheap enough to rebuild every frame.
  private edgeBaseG = new PIXI.Graphics();
  private edgeHiG = new PIXI.Graphics();
  private nodeLayer = new PIXI.Container();
  private labelLayer = new PIXI.Container();
  private nodeSprites = new Map<string, PIXI.Sprite>();
  private labelSprites = new Map<string, PIXI.Text>();
  private circleTex!: PIXI.Texture;
  private cfg: Required<Omit<GraphConfig, "onExpand" | "onNodeClick">> &
    Pick<GraphConfig, "onExpand" | "onNodeClick">;
  private colors: GraphColors;
  // The same palette pre-parsed to numeric triples, for allocation-free blending.
  private rgb!: Record<
    | "node"
    | "nodeNeighbor"
    | "nodeActive"
    | "nodeHi"
    | "nodeLabel"
    | "accent"
    | "accentText"
    | "border",
    Rgb
  >;

  // Physics engine: worker for the interactive graph, inline for the mini.
  private worker: Worker | null = null;
  private sim: ForceSimulation | null = null;
  // Worker liveness. A worker that constructs but then dies at runtime (bundling
  // issue, failed import) leaves the full graph blank — no positions ever arrive,
  // so every node stays invisible — while the mini graph (inline sim) still works.
  // onerror catches hard failures; the watchdog catches a silent one. Either way
  // we fall back to the inline sim so the notes still render.
  private workerAlive = false;
  private workerWatchdog: ReturnType<typeof setTimeout> | null = null;
  private curNodes: GraphNode[] = []; // last data, for re-seeding the fallback sim
  // Render-side positions, updated from worker messages (or inline ticks).
  // Entries are shared with layoutCache for interactive canvases, so the cache
  // tracks the layout with zero extra work per frame.
  private pos = new Map<string, { x: number; y: number }>();
  private posOrder: string[] = [];
  private posEpoch = 0;

  private meta = new Map<string, Meta>(); // path → render metadata
  private metaList: Meta[] = []; // same values, flat — iterated every frame
  private adj = new Map<string, string[]>(); // path → neighbour paths
  private edges: GraphEdge[] = []; // for neighbour queries (path pairs)

  // Camera (screen = graph * zoom + pan), in CSS pixels.
  private panX = 0;
  private panY = 0;
  private zoom = 1;
  // Eased zoom (Obsidian updateZoom): wheel moves targetZoom, zoom chases it.
  // zoomCenter = anchor point; (0,0) means "viewport centre" (zooming out).
  private targetZoom = 1;
  private zoomCenterX = 0;
  private zoomCenterY = 0;
  private autoFit = true;

  // Base-edge cache invalidation. `layoutDirty` is set whenever node positions,
  // topology, colours, or physics params change; draw() also rebuilds the base
  // layer when the camera moved or the entrance bloom is still animating.
  private layoutDirty = true;
  private lastEdgePanX = NaN;
  private lastEdgePanY = NaN;
  private lastEdgeZoom = NaN;

  // Highlight state (GraphView.qml).
  private activePath = "";
  private focusPaths: string[] = [];
  private hoveredPath = "";
  // Non-empty while dragging: locks the highlight to that node so a fast shake
  // can't flicker it (the dragged dot lags the cursor → hover enter/exit spam).
  private draggingPath = "";

  // Entrance fade (GraphNode.qml bloomOpacity: 130ms OutCubic).
  private bloom = 0;

  // Interaction bookkeeping.
  private isPanning = false;
  private isDraggingNode = false;
  private movedDuringPress = false;
  private lastPointer = { x: 0, y: 0 };
  private dragVel = { x: 0, y: 0 };
  private dragLast = { x: 0, y: 0, t: 0 };
  // Last cursor position in CSS px, or null when the pointer is off the canvas.
  // The hover test is re-run against this every frame, not only on pointermove:
  // after a flick the released node coasts out from under a stationary cursor,
  // and without this it would stay lit forever (no further move event arrives).
  private pointerPos: { x: number; y: number } | null = null;

  private raf = 0;
  private lastFrame = 0;
  private tickAccum = 0;
  private paramSig = ""; // last-applied physics params, to detect slider changes
  private ro: ResizeObserver;
  private pendingResize = false; // set by the RO, consumed at the top of frame()
  private dpr = 1;
  private w = 0;
  private h = 0;

  // Render-on-demand (Obsidian's queueRender/idleFrames): when nothing is
  // animating — sim settled, easings done, no interaction — the RAF loop stops
  // entirely. Anything that could change the picture calls wake().
  private idleFrames = 0;
  private sleeping = false;
  private engineUpdated = false; // a positions buffer arrived since last draw
  private disposeSettingsWatch: (() => void) | null = null;
  private static readonly IDLE_AFTER = 4; // settle frames drawn before sleeping

  // Replay.
  private replaying = false;
  private replayQueue: GraphNode[] = [];
  private replayEdgesByPath: Record<string, GraphEdge[]> = {};
  private replayAdded: Record<string, boolean> = {};
  private replayDone = new Set<string>();
  private replayIndex = 0;
  private replayAccum = 0;
  private replayStart = 0;
  onReplayStateChange?: (replaying: boolean) => void;

  constructor(canvas: HTMLCanvasElement, config: GraphConfig) {
    this.canvas = canvas;
    this.renderer = PIXI.autoDetectRenderer({
      view: canvas,
      width: Math.max(1, canvas.clientWidth),
      height: Math.max(1, canvas.clientHeight),
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      antialias: true,
      backgroundAlpha: 1,
    });
    this.stage.addChild(this.world);
    this.world.addChild(this.edgeBaseG, this.edgeHiG, this.nodeLayer, this.labelLayer);
    // One white circle texture; every node is a tinted, scaled sprite of it.
    const g = new PIXI.Graphics();
    g.beginFill(0xffffff);
    g.drawCircle(0, 0, CIRCLE_TEX_R);
    g.endFill();
    this.circleTex = this.renderer.generateTexture(g);
    g.destroy();

    this.colors = readGraphColors();
    this.refreshColors(); // also parses the palette into numeric triples
    this.cfg = {
      interactive: config.interactive,
      fitPad: config.fitPad ?? (config.interactive ? 90 : 60),
      fitEase: config.fitEase ?? (config.interactive ? 0.14 : 0.2),
      maxFitZoom: config.maxFitZoom ?? (config.interactive ? 1.1 : 1.0),
      onExpand: config.onExpand,
      onNodeClick: config.onNodeClick,
    };

    // Interactive graph → physics in a Web Worker (Obsidian's "Graph Worker").
    // Mini graph / no-Worker environments → the same sim, inline.
    if (this.cfg.interactive && typeof Worker !== "undefined") {
      try {
        this.worker = new Worker(new URL("./physicsWorker.ts", import.meta.url), {
          type: "module",
        });
        this.worker.onmessage = this.onWorkerMessage;
        this.worker.onerror = () => this.fallbackToInline();
      } catch {
        this.worker = null;
      }
    }
    if (!this.worker) this.sim = new ForceSimulation();

    this.ro = new ResizeObserver(() => {
      // Just FLAG it — the resize itself happens at the top of the next frame(), which
      // then draws before the browser paints. That keeps the two rules that matter:
      //   • resize and redraw always land in the SAME frame, so the cleared WebGL
      //     buffer is never composited empty (that blank frame was the flicker), and
      //   • the buffer is reallocated at most ONCE per frame and drawn once.
      // Doing the resize + a synchronous draw here instead meant a realloc plus two
      // draws per frame while a dock animated its width — ~58ms frames, which is what
      // made collapsing a panel over the graph feel dragged.
      this.pendingResize = true;
      this.wake();
    });
    this.ro.observe(canvas.parentElement ?? canvas);
    this.resize();
    this.attachEvents();

    // Slider changes must restart a sleeping loop (params are pushed inside
    // frame(), which isn't running while asleep).
    this.disposeSettingsWatch = createRoot((dispose) => {
      createEffect(() => {
        graphSettings();
        this.layoutDirty = true; // edge width/opacity live here → rebuild base
        this.wake();
      });
      return dispose;
    });

    this.lastFrame = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  // Restart the render loop after sleep (or just reset the idle countdown).
  private wake(): void {
    this.idleFrames = 0;
    if (this.sleeping) {
      this.sleeping = false;
      this.lastFrame = performance.now();
      this.raf = requestAnimationFrame(this.frame);
    }
  }

  // ── Engine plumbing (worker or inline — same protocol) ─────────────────────
  private sharedPositions: Float32Array | null = null;
  private sharedVersion: Uint32Array | null = null;
  private sabVersion = 0;

  private onWorkerMessage = (e: MessageEvent) => {
    // First frame from the worker → it's alive; cancel the fallback watchdog.
    if (!this.workerAlive) {
      this.workerAlive = true;
      if (this.workerWatchdog) {
        clearTimeout(this.workerWatchdog);
        this.workerWatchdog = null;
      }
    }
    this.engineUpdated = true;
    this.layoutDirty = true; // positions (may) have moved → base edges are stale
    this.wake();
    const m = e.data;
    if (m.type === "ids") {
      this.posEpoch = m.epoch;
      this.posOrder = m.ids;
      const keep = new Set<string>(m.ids);
      for (const k of this.pos.keys()) if (!keep.has(k)) this.pos.delete(k);
    } else if (m.type === "sharedBuffer") {
      if (m.epoch !== this.posEpoch) return;
      this.sharedPositions = new Float32Array(m.buffer, 4);
      this.sharedVersion = new Uint32Array(m.buffer, 0, 1);
    } else if (m.type === "tickShared") {
      if (m.epoch !== this.posEpoch || !this.sharedPositions || !this.sharedVersion) return;
      // Acquire-load pairs with the worker's post-write Atomics.add — after
      // this read, the position writes that preceded the bump are visible.
      const version = Atomics.load(this.sharedVersion, 0);
      if (version === this.sabVersion) return;
      this.sabVersion = version;
      const buf = this.sharedPositions;
      const order = this.posOrder;
      for (let i = 0; i < order.length; i++) {
        const id = order[i];
        if (this.isDraggingNode && id === this.draggingPath) continue;
        let p = this.pos.get(id);
        if (!p) {
          p = { x: buf[2 * i], y: buf[2 * i + 1] };
          this.pos.set(id, p);
          if (this.cfg.interactive) layoutCache.set(id, p);
        } else {
          p.x = buf[2 * i];
          p.y = buf[2 * i + 1];
        }
      }
    } else if (m.type === "tick") {
      if (m.epoch !== this.posEpoch) return; // stale buffer from before a topology change
      const buf: Float32Array = m.positions;
      const order = this.posOrder;
      for (let i = 0; i < order.length; i++) {
        const id = order[i];
        // While dragging, the local echo owns the dragged node's position — the
        // worker's (one tick older) value would make the dot lag the cursor.
        if (this.isDraggingNode && id === this.draggingPath) continue;
        let p = this.pos.get(id);
        if (!p) {
          p = { x: buf[2 * i], y: buf[2 * i + 1] };
          this.pos.set(id, p);
          if (this.cfg.interactive) layoutCache.set(id, p); // shared object
        } else {
          p.x = buf[2 * i];
          p.y = buf[2 * i + 1];
        }
      }
    }
  };

  // Copy inline-sim positions into the render map after each tick.
  private syncInline(): void {
    const sim = this.sim;
    if (!sim) return;
    this.layoutDirty = true;
    for (const n of sim.nodes) {
      let p = this.pos.get(n.id);
      if (!p) {
        p = { x: n.x, y: n.y };
        this.pos.set(n.id, p);
        if (this.cfg.interactive) layoutCache.set(n.id, p);
      } else {
        p.x = n.x;
        p.y = n.y;
      }
    }
  }

  private engineSetup(inits: NodeInit[], edges: GraphEdge[], alpha: number): void {
    if (this.worker) {
      this.worker.postMessage({ type: "setup", nodes: inits, edges, alpha });
    } else {
      this.pos.clear();
      this.sim!.setup(inits, edges, alpha);
      this.syncInline();
    }
  }
  private engineAddNodes(nodes: { id: string; x: number; y: number }[], edges: GraphEdge[]): void {
    if (this.worker) this.worker.postMessage({ type: "addNodes", nodes, edges });
    else {
      this.sim!.addNodes(nodes, edges);
      this.syncInline();
    }
  }
  private engineClear(): void {
    this.pos.clear();
    if (this.worker) this.worker.postMessage({ type: "clear" });
    else this.sim!.clear();
  }
  private engineParams(params: PhysicsParams, heat?: number): void {
    if (this.worker) this.worker.postMessage({ type: "params", params, heat });
    else {
      this.sim!.params = params;
      if (heat !== undefined) this.sim!.heat(heat);
    }
  }
  private engineBeginDrag(id: string): void {
    if (this.worker) this.worker.postMessage({ type: "beginDrag", id });
    else this.sim!.beginDrag(id);
  }
  private engineDragTarget(id: string, x: number, y: number): void {
    if (this.worker) this.worker.postMessage({ type: "dragTarget", id, x, y });
    else this.sim!.setDragTarget(id, x, y);
  }
  private engineEndDrag(id: string, vx: number, vy: number): void {
    if (this.worker) this.worker.postMessage({ type: "endDrag", id, vx, vy });
    else this.sim!.endDrag(id, vx, vy);
  }

  // ── Public API ────────────────────────────────────────────────────────────
  refreshColors(): void {
    this.wake();
    this.layoutDirty = true; // edge colour changed → rebuild the base layer
    this.colors = readGraphColors();
    this.rgb = {
      node: parseColor(this.colors.node),
      nodeNeighbor: parseColor(this.colors.nodeNeighbor),
      nodeActive: parseColor(this.colors.nodeActive),
      nodeHi: parseColor(this.colors.nodeHi),
      nodeLabel: parseColor(this.colors.nodeLabel),
      accent: parseColor(this.colors.accent),
      accentText: parseColor(this.colors.accentText),
      border: parseColor(this.colors.border),
    };
  }

  setData(nodes: GraphNode[], edges: GraphEdge[]): void {
    this.wake();
    this.replaying = false;
    this.onReplayStateChange?.(false);
    this.edges = edges;
    this.curNodes = nodes;
    this.meta.clear();
    for (const n of nodes) this.meta.set(n.path, newMeta(n));

    // Reopening the graph restores the cached layout. Unchanged graph → alpha 0
    // (motionless, instant — like Obsidian's persistent worker). Changed vault
    // with mostly-known notes → 0.3, enough to absorb the difference. Fresh or
    // heavily-changed graph → the full settle from 1.
    let cached = 0;
    const inits: NodeInit[] = nodes.map((n) => {
      const c = this.cfg.interactive ? layoutCache.get(n.path) : undefined;
      // A non-finite cache entry (from a corrupt graph.json) would place the node
      // at NaN — invisible, and it drags the auto-fit to nothing. Treat it as a
      // cache miss and drop it so the node re-seeds from a real position.
      if (c && Number.isFinite(c.x) && Number.isFinite(c.y)) {
        cached++;
        return { id: n.id, x: c.x, y: c.y };
      }
      if (c) layoutCache.delete(n.path);
      return { id: n.id };
    });
    let alpha = 1;
    if (this.cfg.interactive && nodes.length > 0) {
      const sig = topologySig(nodes, edges);
      if (cached === nodes.length && sig === layoutSig) alpha = 0;
      else if (cached >= nodes.length * 0.8) alpha = 0.3;
      layoutSig = sig;
    }

    this.engineSetup(inits, edges, alpha);
    this.rebuildIndex();
    this.resetCamera();
    this.bloom = 0;
    this.armWorkerWatchdog();
  }

  // If the worker hasn't produced a single frame shortly after being handed data,
  // assume it's dead and switch to the inline sim so the graph still renders.
  private armWorkerWatchdog(): void {
    if (!this.worker || this.workerAlive || this.curNodes.length === 0) return;
    if (this.workerWatchdog) clearTimeout(this.workerWatchdog);
    this.workerWatchdog = setTimeout(() => {
      this.workerWatchdog = null;
      if (!this.workerAlive) this.fallbackToInline();
    }, 2000);
  }

  // Tear down the (dead) worker and re-seed an inline ForceSimulation with the
  // current data, so a blank full graph fills in. Idempotent — a no-op once
  // we're already on the inline engine.
  private fallbackToInline(): void {
    if (!this.worker) return;
    console.warn("graph physics worker unavailable — falling back to the inline simulation");
    try {
      this.worker.terminate();
    } catch {
      /* already gone */
    }
    this.worker = null;
    if (this.workerWatchdog) {
      clearTimeout(this.workerWatchdog);
      this.workerWatchdog = null;
    }
    this.sim = new ForceSimulation();
    const inits: NodeInit[] = this.curNodes.map((n) => {
      const c = layoutCache.get(n.path);
      return c && Number.isFinite(c.x) && Number.isFinite(c.y)
        ? { id: n.id, x: c.x, y: c.y }
        : { id: n.id };
    });
    this.engineSetup(inits, this.edges, 1); // worker is null now → routes inline
    this.wake();
  }

  // Adjacency + a flat node list, rebuilt whenever the graph changes. The draw
  // loop must never scan the edge list to answer "who are my neighbours?" —
  // at 1000 notes that was an O(edges) scan per focused node, twice a frame.
  private rebuildIndex(): void {
    this.adj.clear();
    for (const e of this.edges) {
      (this.adj.get(e.from) ?? this.adj.set(e.from, []).get(e.from)!).push(e.to);
      (this.adj.get(e.to) ?? this.adj.set(e.to, []).get(e.to)!).push(e.from);
    }
    this.metaList = [...this.meta.values()];
    this.layoutDirty = true; // edge set changed → rebuild the base layer
    this.syncSprites();
  }

  // Node/label sprite pools follow the meta set — created here (topology
  // changes only), restyled per frame in draw(). Labels get their own style
  // object each: hover toggles fontWeight per label.
  private syncSprites(): void {
    for (const m of this.metaList) {
      if (this.nodeSprites.has(m.path)) continue;
      const sp = new PIXI.Sprite(this.circleTex);
      sp.anchor.set(0.5);
      sp.visible = false;
      this.nodeSprites.set(m.path, sp);
      this.nodeLayer.addChild(sp);

      const label = new PIXI.Text(m.title, {
        fontFamily: LABEL_FONT,
        fontSize: LABEL_TEX_PX,
        fill: 0xffffff,
        align: "center",
      });
      label.anchor.set(0.5, 0);
      label.resolution = 2;
      label.visible = false;
      this.labelSprites.set(m.path, label);
      this.labelLayer.addChild(label);
    }
    if (this.nodeSprites.size !== this.metaList.length) {
      for (const [path, sp] of this.nodeSprites) {
        if (this.meta.has(path)) continue;
        this.nodeLayer.removeChild(sp);
        sp.destroy();
        this.nodeSprites.delete(path);
        const label = this.labelSprites.get(path);
        if (label) {
          this.labelLayer.removeChild(label);
          label.destroy();
          this.labelSprites.delete(path);
        }
      }
    }
  }

  private neighborsOf(path: string): string[] {
    return this.adj.get(path) ?? [];
  }

  setActivePath(path: string): void {
    this.activePath = path;
    this.wake();
  }
  setFocusPaths(paths: string[]): void {
    this.focusPaths = paths.slice();
    this.wake();
  }

  startReplay(): void {
    this.wake();
    if (this.replaying) return; // ignore clicks while a rebuild is running
    const nodes: GraphNode[] = [...this.meta.values()].map((m) => ({
      id: m.path,
      title: m.title,
      path: m.path,
      layer: m.layer,
      degree: m.degree,
    }));
    if (!nodes.length) return;
    const edges = this.edges.slice();

    // Fisher–Yates shuffle so the physics is visible as dots drop in.
    for (let i = nodes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [nodes[i], nodes[j]] = [nodes[j], nodes[i]];
    }
    const byPath: Record<string, GraphEdge[]> = {};
    for (const e of edges) {
      (byPath[e.from] ||= []).push(e);
      (byPath[e.to] ||= []).push(e);
    }

    this.replayQueue = nodes;
    this.replayEdgesByPath = byPath;
    this.replayAdded = {};
    this.replayDone.clear();
    this.replayIndex = 0;
    this.replayAccum = 0;
    this.replayStart = performance.now();

    this.meta.clear();
    this.edges = [];
    this.engineClear();
    this.rebuildIndex();
    this.resetCamera();
    this.bloom = 1;
    this.replaying = true;
    this.onReplayStateChange?.(true);
  }

  isReplaying(): boolean {
    return this.replaying;
  }

  destroy(): void {
    this.disposeSettingsWatch?.();
    this.disposeSettingsWatch = null;
    if (this.workerWatchdog) {
      clearTimeout(this.workerWatchdog);
      this.workerWatchdog = null;
    }
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.detachEvents();
    this.worker?.terminate();
    this.worker = null;
    this.nodeSprites.clear();
    this.labelSprites.clear();
    this.stage.destroy({ children: true });
    this.circleTex.destroy(true);
    this.renderer.destroy(false); // keep the <canvas> — the component owns it
  }

  // ── Sizing ─────────────────────────────────────────────────────────────────
  // Returns true only when the pixel size actually changed (so the caller knows
  // the buffer was cleared and needs an immediate redraw). A ResizeObserver fires
  // for plenty of things that don't move our edge; resizing on those would clear
  // the buffer for nothing.
  private resize(): boolean {
    const host = this.canvas.parentElement ?? this.canvas;
    const rect = host.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    const dpr = window.devicePixelRatio || 1;
    if (rect.width === this.w && rect.height === this.h && dpr === this.dpr) return false;
    // Keep the old view centre pinned to the viewport centre so a resize doesn't
    // appear to shove the graph sideways when the user has panned away from centre.
    const dxHalf = (rect.width - this.w) / 2;
    const dyHalf = (rect.height - this.h) / 2;
    // Only assign resolution when it actually changed — the setter makes PIXI
    // reconfigure its render textures, which is pure waste on a plain width change.
    if (dpr !== this.dpr) this.renderer.resolution = dpr;
    this.dpr = dpr;
    this.w = rect.width;
    this.h = rect.height;
    this.renderer.resize(rect.width, rect.height); // autoDensity keeps CSS size in step
    if (this.autoFit) {
      this.panX = this.w / 2;
      this.panY = this.h / 2;
    } else {
      this.panX += dxHalf;
      this.panY += dyHalf;
    }
    return true;
  }

  private resetCamera(): void {
    this.panX = this.w / 2;
    this.panY = this.h / 2;
    this.zoom = 1;
    this.targetZoom = 1;
    this.zoomCenterX = 0;
    this.zoomCenterY = 0;
    this.autoFit = true;
  }

  // Live user settings; GRAPH_DEFAULTS mirror the Qt values.
  private get s(): GraphSettings {
    return graphSettings();
  }

  // Obsidian's getSize(): clamp(k · √(degree+1), min, max) — a √ growth curve
  // (theirs is max(8, min(3·√(w+1), 30))), with our sliders mapped onto the
  // three constants.
  private dotRadius(m: Meta): number {
    const s = this.s;
    const r = Math.max(
      s.nodeBaseRadius,
      Math.min(s.nodeSizeByLinks * Math.sqrt(m.degree + 1), s.maxNodeGrowth),
    );
    return r + (m.path === this.activePath ? s.activeNodeBonus : 0);
  }

  // Obsidian's setScale(): nodeScale = √(1/scale). Dots and line widths are
  // multiplied by this in graph units, so their on-screen size grows only with
  // √zoom — they neither balloon zoomed-in nor vanish zoomed-out.
  private nodeScale(): number {
    return Math.sqrt(1 / this.zoom);
  }

  // ── Highlight sets (GraphView.qml) ─────────────────────────────────────────
  // focusSet = open tabs ∪ active note ∪ hovered. litNeighbors = first neighbours
  // of everything in focusSet. anyActive = focusSet non-empty → non-lit nodes dim
  // to 0.14. Edges are lit when either endpoint is in focusSet.
  // Recomputed once per frame into these reused sets (frame() calls this, draw()
  // reads the result) — it used to run twice a frame, each time rescanning edges.
  private hlFocus = new Set<string>();
  private hlLit = new Set<string>();
  private hlAnyActive = false;

  private computeHighlight(): void {
    const focus = this.hlFocus;
    const lit = this.hlLit;
    focus.clear();
    lit.clear();
    for (const p of this.focusPaths) focus.add(p);
    if (this.activePath) focus.add(this.activePath);
    if (this.hoveredPath) focus.add(this.hoveredPath);
    for (const p of focus) for (const nb of this.neighborsOf(p)) lit.add(nb);
    this.hlAnyActive = focus.size > 0;
  }

  // ── Render loop ──────────────────────────────────────────────────────────
  private frame = (now: number) => {
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;

    // Consume a pending resize here, so the realloc and the redraw that refills it
    // happen in one frame, before paint.
    if (this.pendingResize) {
      this.pendingResize = false;
      this.resize();
    }

    if (this.replaying) this.replayStep(now, dt);

    // Push the user's live physics constants into the sim. On an actual change,
    // nudge alpha to 0.3 — exactly what Obsidian sends with a force-slider
    // change: enough energy to adapt, without a full 5 s restart.
    const s = this.s;
    const params = {
      repulsion: s.repulsion,
      linkDistance: s.linkDistance,
      linkStrength: s.linkStrength,
      gravity: s.gravity,
      collisionRadius: s.collisionRadius,
      damping: s.damping,
    };
    const sig = JSON.stringify(params);
    if (sig !== this.paramSig) {
      const isChange = this.paramSig !== "";
      this.engineParams(params, isChange ? 0.3 : undefined);
      if (isChange) this.autoFit = true; // re-frame as the layout re-settles
      this.paramSig = sig;
    }

    // Re-test hover against the last known cursor position every frame — nodes
    // move under a stationary cursor (momentum, layout settling), and only a
    // pointermove would otherwise update the highlight.
    if (this.cfg.interactive && !this.isDraggingNode && !this.isPanning && this.pointerPos) {
      const { x, y } = this.pointerPos;
      const gx = (x - this.panX) / this.zoom;
      const gy = (y - this.panY) / this.zoom;
      const hit = this.hitTest(gx, gy);
      this.hoveredPath = hit ? hit.path : "";
    }

    // Inline mode only (mini graph / worker fallback): fixed-rate 60 Hz stepping,
    // because the sim is iteration-based and the tick rate IS the simulation
    // speed. In worker mode the worker owns the clock; nothing to do here.
    if (this.sim) {
      this.tickAccum += dt * 1000;
      if (this.tickAccum > TICK_MS * MAX_TICKS_PER_FRAME)
        this.tickAccum = TICK_MS * MAX_TICKS_PER_FRAME;
      let ticked = false;
      while (this.tickAccum >= TICK_MS) {
        this.tickAccum -= TICK_MS;
        if (this.sim.running || this.isDraggingNode) {
          this.sim.tick();
          ticked = true;
        }
      }
      if (ticked) this.syncInline();
      else if (!this.sim.running) this.tickAccum = 0;
    }

    let cameraMoving = false;
    if (this.autoFit) cameraMoving = this.fitToView();
    else {
      const before = this.zoom;
      this.updateZoom();
      cameraMoving = this.zoom !== before;
    }
    if (this.bloom < 1) this.bloom = Math.min(1, this.bloom + dt * 7);

    // Ease every highlight channel toward its target so hover fades in and out
    // instead of snapping (GraphNode.qml animated opacity/colour/scale).
    // `easeResidual` tracks how far any channel still is from its target — while
    // it's non-trivial the picture is still animating and the loop must run.
    this.computeHighlight();
    const focus = this.hlFocus;
    const lit = this.hlLit;
    const anyActive = this.hlAnyActive;
    let easeResidual = 0;
    for (const m of this.metaList) {
      const isHover = this.hoveredPath === m.path;
      const isFocus = focus.has(m.path);
      const isNeighbor = !isFocus && lit.has(m.path);
      const scaleTarget = isHover ? s.hoverScale : isFocus || isNeighbor ? 1.1 : 1.0;
      const dimTarget = anyActive && !(isHover || isFocus || isNeighbor) ? 1 : 0;

      m.disp += (scaleTarget - m.disp) * 0.28;
      m.hoverT += ((isHover ? 1 : 0) - m.hoverT) * GLOW_EASE;
      m.focusT += ((isFocus ? 1 : 0) - m.focusT) * GLOW_EASE;
      m.neighborT += ((isNeighbor ? 1 : 0) - m.neighborT) * GLOW_EASE;
      m.dimT += (dimTarget - m.dimT) * GLOW_EASE;

      const r = Math.max(
        Math.abs(scaleTarget - m.disp),
        Math.abs((isHover ? 1 : 0) - m.hoverT),
        Math.abs((isFocus ? 1 : 0) - m.focusT),
        Math.abs((isNeighbor ? 1 : 0) - m.neighborT),
        Math.abs(dimTarget - m.dimT),
      );
      if (r > easeResidual) easeResidual = r;
    }

    this.draw();

    // Render-on-demand: after a few quiet frames, stop the loop entirely
    // (Obsidian's idleFrames). wake() restarts it.
    const animating =
      this.replaying ||
      this.engineUpdated ||
      (this.sim !== null && (this.sim.running || this.isDraggingNode)) ||
      this.isPanning ||
      this.isDraggingNode ||
      this.bloom < 1 ||
      cameraMoving ||
      easeResidual > 0.004;
    this.engineUpdated = false;
    if (animating) this.idleFrames = 0;
    else this.idleFrames++;
    if (this.idleFrames >= GraphCanvas.IDLE_AFTER) {
      if (this.cfg.interactive) saveGraphCache();
      this.sleeping = true;
      return; // no reschedule — wake() resumes
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  // Eased "how lit is this edge" in [0,1] — the max of its endpoints' focus/hover
  // channels, so an edge brightens on exactly the same curve as its nodes.
  private edgeGlow(e: GraphEdge): number {
    const a = this.meta.get(e.from);
    const b = this.meta.get(e.to);
    const g = (m?: Meta) => (m ? Math.max(m.focusT, m.hoverT) : 0);
    return Math.max(g(a), g(b));
  }

  // A node is "plain" when none of its highlight channels are engaged. At rest
  // that's nearly the whole graph, so plain nodes/edges are batched into a single
  // path and filled once — 1000 individual arc+fill pairs was the frame killer.
  private static readonly PLAIN_EPS = 0.004;
  private isPlain(m: Meta): boolean {
    const e = GraphCanvas.PLAIN_EPS;
    return m.hoverT < e && m.focusT < e && m.neighborT < e && m.dimT < e;
  }

  private draw(): void {
    const s = this.s;
    this.renderer.background.color = rgbNum(parseColor(this.colors.graphBg));

    // Camera: the world container carries pan/zoom — the GPU transforms the
    // scene, so zooming in costs nothing (this was the Canvas2D zoom-in
    // slowdown: giant rasterized arcs and glyphs every frame).
    this.world.position.set(this.panX, this.panY);
    this.world.scale.set(this.zoom);

    // Viewport in graph coordinates, padded so nodes straddling the edge (and
    // their labels) still draw. Everything outside is culled entirely.
    const pad = 80 / this.zoom;
    const vx0 = -this.panX / this.zoom - pad;
    const vy0 = -this.panY / this.zoom - pad;
    const vx1 = (this.w - this.panX) / this.zoom + pad;
    const vy1 = (this.h - this.panY) / this.zoom + pad;
    const nodeVisible = (x: number, y: number) => x >= vx0 && x <= vx1 && y >= vy0 && y <= vy1;
    // A segment is skipped only when both ends are off the same side of the view.
    const edgeVisible = (ax: number, ay: number, bx: number, by: number) =>
      !((ax < vx0 && bx < vx0) || (ax > vx1 && bx > vx1) || (ay < vy0 && by < vy0) || (ay > vy1 && by > vy1));

    // Obsidian counter-scale: dot radii and line widths are in graph units ×
    // nodeScale (√(1/zoom)) so their screen size tracks √zoom.
    const ns = this.nodeScale();

    // ── Edges ──────────────────────────────────────────────────────────────
    // Base layer: EVERY visible edge, dim, butt-capped (round caps are invisible
    // on a hairline but tessellate a fan at each end). Rebuilt only when the
    // layout/camera/bloom changed — a static hover reuses last frame's geometry,
    // which is what turned a 6000-edge hover from ~90 ms/frame into a few ms.
    const camMoved =
      this.panX !== this.lastEdgePanX ||
      this.panY !== this.lastEdgePanY ||
      this.zoom !== this.lastEdgeZoom;
    if (this.layoutDirty || camMoved || this.bloom < 1) {
      const bg = this.edgeBaseG;
      bg.clear();
      bg.lineStyle({
        width: s.edgeWidth * ns,
        color: rgbNum(this.rgb.border),
        alpha: this.bloom * s.edgeOpacity,
      });
      for (const e of this.edges) {
        const a = this.pos.get(e.from);
        const b = this.pos.get(e.to);
        if (!a || !b || !edgeVisible(a.x, a.y, b.x, b.y)) continue;
        bg.moveTo(a.x, a.y);
        bg.lineTo(b.x, b.y);
      }
      this.layoutDirty = false;
      this.lastEdgePanX = this.panX;
      this.lastEdgePanY = this.panY;
      this.lastEdgeZoom = this.zoom;
    }

    // Hi layer: just the lit edges (neighbours of the focus/hover set), redrawn
    // over the dim base each frame so the glow eases smoothly. This set is tiny,
    // so scanning for it every frame is cheap next to tessellating the base.
    const hg = this.edgeHiG;
    hg.clear();
    for (const e of this.edges) {
      const glow = this.edgeGlow(e);
      if (glow <= GraphCanvas.PLAIN_EPS) continue;
      const a = this.pos.get(e.from);
      const b = this.pos.get(e.to);
      if (!a || !b || !edgeVisible(a.x, a.y, b.x, b.y)) continue;
      hg.lineStyle({
        width: lerp(s.edgeWidth, s.highlightEdgeWidth, glow) * ns,
        color: rgbNum(mixInto(mixBuf, this.rgb.border, this.rgb.accent, glow)),
        alpha: this.bloom * lerp(s.edgeOpacity, 0.94, glow),
        cap: PIXI.LINE_CAP.ROUND,
      });
      hg.moveTo(a.x, a.y);
      hg.lineTo(b.x, b.y);
    }

    // ── Nodes: restyle the pooled sprites (they all batch on one texture) ──
    const fancy: Meta[] = [];
    for (const m of this.metaList) {
      const sprite = this.nodeSprites.get(m.path);
      if (!sprite) continue;
      const n = this.pos.get(m.path);
      if (!this.isPlain(m)) fancy.push(m);
      if (!n || !nodeVisible(n.x, n.y)) {
        sprite.visible = false;
        continue;
      }
      sprite.visible = true;
      sprite.position.set(n.x, n.y);
      const r = this.dotRadius(m) * m.disp * ns;
      sprite.scale.set(r / CIRCLE_TEX_R);
      if (this.isPlain(m)) {
        sprite.tint = rgbNum(this.rgb.node);
        sprite.alpha = this.bloom;
      } else {
        // Base → neighbour → focus → hover, each blended by its eased channel.
        const c = mixInto(mixBuf, this.rgb.node, this.rgb.nodeNeighbor, m.neighborT);
        mixInto(c, c, this.rgb.nodeActive, m.focusT);
        mixInto(c, c, this.rgb.nodeHi, m.hoverT);
        sprite.tint = rgbNum(c);
        sprite.alpha = this.bloom * lerp(1, s.dimOpacity, m.dimT);
      }
    }

    // Always call: even with titles switched off, a hovered node still shows its
    // own label — that's how you read a title in a dense graph.
    this.drawLabels(s, nodeVisible, fancy);
    this.renderer.render(this.stage);
  }

  // Labels are pooled PIXI.Text sprites: the glyphs rasterize ONCE (at
  // LABEL_TEX_PX) and every frame only moves/scales/tints them on the GPU —
  // the Canvas2D version re-rasterized every visible string every frame,
  // which is where a zoomed-in graph burned its frame budget.
  private drawLabels(
    s: GraphSettings,
    nodeVisible: (x: number, y: number) => boolean,
    fancy: Meta[],
  ): void {
    // Obsidian's setScale(): textAlpha = clamp(log2(scale) + 1, 0, 1) — labels
    // dissolve on a log-zoom curve (fully gone at 0.5×, fully on at 1×).
    const fade = Math.max(0, Math.min(1, Math.log2(this.zoom) + 1));
    const drawPlain = s.showLabels && fade > 0.02;
    // Labels track the counter-scaled dots: same √(1/zoom) factor.
    const ns = this.nodeScale();

    for (const m of this.metaList) {
      const label = this.labelSprites.get(m.path);
      if (!label) continue;
      const plain = this.isPlain(m);
      const n = this.pos.get(m.path);
      // The hovered node ALWAYS shows its own label (that's how you read a title
      // in a dense graph, even zoomed out). Every other node — plain, neighbour,
      // or focus — only shows a label when titles are on and we're zoomed in
      // enough (drawPlain). Previously neighbours of a hovered node lit up their
      // labels too, so hovering one dot in a hub flooded the view with text.
      const shown = !!n && nodeVisible(n!.x, n!.y) && (m.hoverT > GraphCanvas.PLAIN_EPS || drawPlain);
      label.visible = shown;
      if (!shown || !n) continue;

      if (plain) {
        if (label.style.fontWeight !== "normal") label.style.fontWeight = "normal";
        label.scale.set((s.labelSize * ns) / LABEL_TEX_PX);
        // nodeLabel, not node: a title is TEXT, so it needs the body-text contrast
        // floor. Tinting it with the dot colour (2.5:1) made titles bleed away.
        label.tint = rgbNum(this.rgb.nodeLabel);
        label.alpha = this.bloom * fade;
        label.position.set(n.x, n.y + (this.dotRadius(m) * m.disp + 5) * ns);
        continue;
      }

      // The world is scaled by `zoom`, so a size in graph units renders at
      // `size * zoom` on screen. For the HOVERED label we want a fixed
      // on-screen size instead: divide by zoom so it cancels out. hoverT
      // blends between the two behaviours, so the label eases from "scales
      // with the graph" to "locked to screen size" as the hover fades in.
      // Base the label blend on nodeLabel (readable at rest); the highlight states
      // only ever move it toward higher-contrast colours.
      const c = mixInto(mixBuf, this.rgb.nodeLabel, this.rgb.nodeNeighbor, m.neighborT);
      mixInto(c, c, this.rgb.accentText, m.focusT);
      mixInto(c, c, this.rgb.nodeHi, m.hoverT);
      const graphSize = s.labelSize * ns; // tracks the counter-scaled dots
      const screenLockedSize = (s.labelSize * s.hoverLabelScale) / this.zoom;
      const size = lerp(graphSize, screenLockedSize, m.hoverT);
      const gap = lerp(5 * ns, 5 / this.zoom, m.hoverT);
      // fontWeight change re-rasterizes that ONE label — only on crossing 0.5.
      const weight = Math.max(m.hoverT, m.focusT) > 0.5 ? "bold" : "normal";
      if (label.style.fontWeight !== weight) label.style.fontWeight = weight;

      label.scale.set(size / LABEL_TEX_PX);
      label.tint = rgbNum(c);
      label.alpha = this.bloom * lerp(1, s.dimOpacity, m.dimT);
      label.position.set(n.x, n.y + this.dotRadius(m) * m.disp * ns + gap);
    }
  }

  // ── Auto-fit (GraphView.qml fitToView) ───────────────────────────────────
  // Returns true while the camera is still easing toward the framed target.
  private fitToView(): boolean {
    if (this.pos.size === 0 || this.w <= 0 || this.h <= 0) return false;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity,
      count = 0;
    for (const n of this.pos.values()) {
      if (!isFinite(n.x) || !isFinite(n.y)) continue;
      minX = Math.min(minX, n.x);
      maxX = Math.max(maxX, n.x);
      minY = Math.min(minY, n.y);
      maxY = Math.max(maxY, n.y);
      count++;
    }
    if (count === 0) return false;

    const pad = this.cfg.fitPad;
    const contentW = Math.max(1, maxX - minX + pad * 2);
    const contentH = Math.max(1, maxY - minY + pad * 2);
    let z = Math.min(this.w / contentW, this.h / contentH);
    z = Math.max(MIN_ZOOM, Math.min(z, this.cfg.maxFitZoom));

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const targetPanX = this.w / 2 - cx * z;
    const targetPanY = this.h / 2 - cy * z;

    const e = this.cfg.fitEase;
    this.zoom += (z - this.zoom) * e;
    this.panX += (targetPanX - this.panX) * e;
    this.panY += (targetPanY - this.panY) * e;
    if (Math.abs(z - this.zoom) < 0.0005) this.zoom = z;
    if (Math.abs(targetPanX - this.panX) < 0.5) this.panX = targetPanX;
    if (Math.abs(targetPanY - this.panY) < 0.5) this.panY = targetPanY;
    // Keep the wheel-zoom target in step so leaving auto-fit doesn't jump.
    this.targetZoom = this.zoom;
    this.zoomCenterX = 0;
    this.zoomCenterY = 0;
    return this.zoom !== z || this.panX !== targetPanX || this.panY !== targetPanY;
  }

  // ── Replay stepping (GraphView.qml replayStep) ────────────────────────────
  private replayStep(now: number, dt: number): void {
    const total = this.replayQueue.length;
    if (total === 0) {
      this.replaying = false;
      this.onReplayStateChange?.(false);
      return;
    }
    const rampMs = 7000;
    const startRate = 1.0;
    const cruiseRate = 26;
    const rp = Math.min(1, (now - this.replayStart) / rampMs);
    const rate = startRate + (cruiseRate - startRate) * (rp * rp);

    this.replayAccum += rate * dt;
    let n = Math.floor(this.replayAccum);
    this.replayAccum -= n;
    if (n > total - this.replayIndex) n = total - this.replayIndex;
    if (n <= 0) {
      if (this.replayIndex >= total) {
        this.replaying = false;
        this.onReplayStateChange?.(false);
      }
      return;
    }

    const addedNow: GraphNode[] = [];
    const batchNodes: { id: string; x: number; y: number }[] = [];
    for (let k = 0; k < n; k++) {
      const gn = this.replayQueue[this.replayIndex + k];
      // Qt drops each node at a random point within ±650.
      batchNodes.push({ id: gn.path, x: (Math.random() * 2 - 1) * 650, y: (Math.random() * 2 - 1) * 650 });
      this.meta.set(gn.path, newMeta(gn));
      this.replayAdded[gn.path] = true;
      addedNow.push(gn);
    }
    this.replayIndex += n;

    // Edges whose endpoints are now both present.
    const batchEdges: GraphEdge[] = [];
    for (const gn of addedNow) {
      for (const e of this.replayEdgesByPath[gn.path] || []) {
        const key = `${e.from} ${e.to}`;
        if (!this.replayDone.has(key) && this.replayAdded[e.from] && this.replayAdded[e.to]) {
          this.replayDone.add(key);
          this.edges.push(e);
          batchEdges.push(e);
        }
      }
    }

    this.engineAddNodes(batchNodes, batchEdges);
    this.rebuildIndex(); // meta + edges grew; refresh the flat list and adjacency

    if (this.replayIndex >= total) {
      this.replaying = false;
      this.onReplayStateChange?.(false);
    }
  }

  // ── Interaction ────────────────────────────────────────────────────────────
  private toGraph(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    return { gx: (mx - this.panX) / this.zoom, gy: (my - this.panY) / this.zoom, mx, my };
  }

  // Hit area = the drawn (counter-scaled) dot plus an 8px screen margin.
  private hitTest(gx: number, gy: number): Meta | null {
    let best: Meta | null = null;
    let bestD = Infinity;
    const ns = this.nodeScale();
    for (const m of this.metaList) {
      const n = this.pos.get(m.path);
      if (!n) continue;
      const d = Math.hypot(n.x - gx, n.y - gy);
      const hitR = this.dotRadius(m) * ns + 8 / this.zoom;
      if (d <= hitR && d < bestD) {
        bestD = d;
        best = m;
      }
    }
    return best;
  }

  private setHover(path: string): void {
    this.hoveredPath = path;
  }

  private onPointerDown = (e: PointerEvent) => {
    this.wake();
    if (e.button !== 0) return;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already gone (released between dispatch and capture) */
    }
    this.movedDuringPress = false;
    const { gx, gy, mx, my } = this.toGraph(e.clientX, e.clientY);
    this.lastPointer = { x: mx, y: my };
    this.pointerPos = { x: mx, y: my };

    if (!this.cfg.interactive) return; // mini: press does nothing until click

    const hit = this.hitTest(gx, gy);
    if (hit) {
      this.isDraggingNode = true;
      this.draggingPath = hit.path;
      this.setHover(hit.path); // lock the highlight onto the dragged node
      this.autoFit = false;
      this.engineBeginDrag(hit.path);
      this.engineDragTarget(hit.path, gx, gy);
      this.dragVel = { x: 0, y: 0 };
      this.dragLast = { x: gx, y: gy, t: performance.now() };
    } else {
      this.isPanning = true;
      this.autoFit = false;
      this.setHover(""); // never freeze dimmed while panning
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    this.wake();
    const { gx, gy, mx, my } = this.toGraph(e.clientX, e.clientY);
    this.pointerPos = { x: mx, y: my };
    const dxScreen = mx - this.lastPointer.x;
    const dyScreen = my - this.lastPointer.y;
    if (Math.abs(dxScreen) > 2 || Math.abs(dyScreen) > 2) this.movedDuringPress = true;

    if (this.isDraggingNode) {
      this.engineDragTarget(this.draggingPath, gx, gy);
      // Local echo: move the dot under the cursor THIS frame. The worker's
      // confirmation is a tick behind, which would read as drag latency.
      const p = this.pos.get(this.draggingPath);
      if (p) {
        p.x = gx;
        p.y = gy;
        this.layoutDirty = true; // dragged node moved → base edges follow it
      }
      // EMA velocity trail (GraphNode.qml): recent motion is weighted, so a flick
      // keeps momentum while jitter — or a pause before release — decays to zero.
      const now = performance.now();
      const dt = now - this.dragLast.t;
      if (dt > 0 && dt < 120) {
        this.dragVel.x = 0.35 * ((gx - this.dragLast.x) / dt) + 0.65 * this.dragVel.x;
        this.dragVel.y = 0.35 * ((gy - this.dragLast.y) / dt) + 0.65 * this.dragVel.y;
      }
      this.dragLast = { x: gx, y: gy, t: now };
      this.lastPointer = { x: mx, y: my };
      return;
    }

    if (this.isPanning) {
      this.panX += dxScreen;
      this.panY += dyScreen;
      this.lastPointer = { x: mx, y: my };
      return;
    }

    // Hover is recomputed from pointerPos every frame; nothing to do here.
  };

  private onPointerUp = (e: PointerEvent) => {
    this.wake();
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }

    if (this.isDraggingNode) {
      const path = this.draggingPath;
      // Convert the smoothed velocity (units/ms) into the sim's units/tick.
      // A stale trail (paused before release) means "placed", not "flung".
      const stale = performance.now() - this.dragLast.t > 50;
      const perTick = 16;
      const cap = 90; // taste cap (the sim hard-caps at 500)
      const vx = stale ? 0 : Math.max(-cap, Math.min(cap, this.dragVel.x * perTick));
      const vy = stale ? 0 : Math.max(-cap, Math.min(cap, this.dragVel.y * perTick));
      this.engineEndDrag(path, vx, vy);

      this.isDraggingNode = false;
      this.draggingPath = "";
      // Don't re-test hover here: after a flick the node coasts away from the
      // cursor over the next frames. The per-frame hover test in frame() picks
      // that up and un-lights it as it leaves — which a one-shot test would miss.
      const { mx, my } = this.toGraph(e.clientX, e.clientY);
      this.pointerPos = { x: mx, y: my };
      if (!this.movedDuringPress && this.cfg.onNodeClick) this.cfg.onNodeClick(path);
      return;
    }

    if (this.isPanning) {
      this.isPanning = false;
      return;
    }

    if (!this.movedDuringPress) {
      if (!this.cfg.interactive && this.cfg.onExpand) {
        this.cfg.onExpand();
      } else if (this.cfg.interactive && this.cfg.onNodeClick) {
        const { gx, gy } = this.toGraph(e.clientX, e.clientY);
        const hit = this.hitTest(gx, gy);
        if (hit) this.cfg.onNodeClick(hit.path);
      }
    }
  };

  // Obsidian's onWheel: multiply the TARGET scale by 1.5^(-deltaY/120). Zooming
  // in anchors on the cursor; zooming out anchors on the viewport centre
  // (zoomCenter 0,0). The actual zoom chases the target in updateZoom().
  private onWheel = (e: WheelEvent) => {
    if (!this.cfg.interactive) return;
    e.preventDefault();
    this.wake();
    this.autoFit = false;
    const next = Math.max(
      MIN_ZOOM,
      Math.min(MAX_ZOOM, this.targetZoom * Math.pow(1.5, -e.deltaY / 120)),
    );
    if (next < this.zoom) {
      this.zoomCenterX = 0;
      this.zoomCenterY = 0;
    } else {
      const rect = this.canvas.getBoundingClientRect();
      this.zoomCenterX = e.clientX - rect.left;
      this.zoomCenterY = e.clientY - rect.top;
    }
    this.targetZoom = next;
  };

  // Per-frame zoom glide (Obsidian updateZoom): ease scale toward targetScale,
  // repositioning pan so the anchor point stays fixed on screen.
  private updateZoom(): void {
    const t = this.zoom;
    const n = this.targetZoom;
    if ((t > n ? t / n : n / t) - 1 < 0.01) return;
    let ox = this.zoomCenterX;
    let oy = this.zoomCenterY;
    if (ox === 0 && oy === 0) {
      ox = this.w / 2;
      oy = this.h / 2;
    }
    const lx = (ox - this.panX) / t;
    const ly = (oy - this.panY) / t;
    const nz = t * ZOOM_EASE_KEEP + n * (1 - ZOOM_EASE_KEEP);
    this.zoom = nz;
    this.panX = ox - lx * nz;
    this.panY = oy - ly * nz;
  }

  private onPointerLeave = () => {
    this.wake();
    if (!this.isPanning && !this.isDraggingNode) {
      this.pointerPos = null;
      this.setHover("");
    }
  };

  private attachEvents(): void {
    const c = this.canvas;
    c.addEventListener("pointerdown", this.onPointerDown);
    c.addEventListener("pointermove", this.onPointerMove);
    c.addEventListener("pointerup", this.onPointerUp);
    c.addEventListener("pointerleave", this.onPointerLeave);
    c.addEventListener("wheel", this.onWheel, { passive: false });
    c.style.cursor = "default"; // arrow everywhere, like the rest of the app
  }
  private detachEvents(): void {
    const c = this.canvas;
    c.removeEventListener("pointerdown", this.onPointerDown);
    c.removeEventListener("pointermove", this.onPointerMove);
    c.removeEventListener("pointerup", this.onPointerUp);
    c.removeEventListener("pointerleave", this.onPointerLeave);
    c.removeEventListener("wheel", this.onWheel);
  }
}
