// Force simulation with EXACT d3-force semantics — the same simulation
// Obsidian's Graph Worker runs (tmp_obsidian/sim.js is stock d3-force with
// forceX/forceY(0.1), link(distance 250), manyBody(-1000, distanceMin 30,
// theta .9), collide(60, .5), velocityDecay .6).
//
// Two properties matter for matching Obsidian's feel, beyond the constants:
//
//  1. Gauss–Seidel coupling. d3 forces write STRAIGHT INTO vx/vy, in
//     registration order — so link and collide (which read predicted positions
//     x + vx) see the velocity already updated by the forces before them in the
//     SAME tick. The earlier port accumulated into a separate fx/fy buffer and
//     integrated at the end (Jacobi), which lagged the coupling by one tick.
//
//  2. Determinism. The jiggle that separates coincident nodes comes from a
//     seeded LCG (d3's lcg(), the same constants Obsidian ships), re-seeded on
//     every setup — the same vault always settles into the same layout.
//
// The tick rate IS the simulation speed (iteration-based, no dt): a fixed
// 60 Hz, driven by physicsWorker.ts off the main thread for the full graph
// view, or inline by GraphCanvas for the mini graph.
//
// Do not "improve" the constants — the layout balance depends on them exactly.

export interface PhysicsNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  // Fixed position while dragged (d3's fx/fy). NaN = free.
  fx: number;
  fy: number;
}

interface PhysicsEdge {
  sourceIndex: number;
  targetIndex: number;
  // d3 link params, from node degree: strength = 1/min(deg(s),deg(t)) — scaled
  // by the user's linkStrength — and bias = deg(s)/(deg(s)+deg(t)).
  strength: number;
  bias: number;
}

// ── Tuning (identical to Obsidian's sim.js defaults) ─────────────────────────
export interface PhysicsParams {
  repulsion: number;
  linkDistance: number;
  linkStrength: number;
  gravity: number;
  collisionRadius: number;
  damping: number;
}
export const PHYSICS_DEFAULTS: PhysicsParams = {
  repulsion: 1000.0,
  linkDistance: 250.0,
  linkStrength: 1.0,
  gravity: 0.1,
  collisionRadius: 60.0,
  damping: 0.6,
};

const COLLISION_STRENGTH = 0.5;
// d3 has no speed cap; kept as a pure safety net against pathological slider
// combinations (far above anything normal dynamics produce).
const MAX_SPEED = 500.0;

// Exported for WasmForceSimulation (physicsWasm.ts), which reimplements the
// tick around the WASM force pass but must keep the exact same cooling curve.
export const ALPHA_MIN = 0.001;
export const ALPHA_DECAY = 1 - Math.pow(0.001, 1 / 300); // d3 default (≈0.022828)
const DRAG_ALPHA_TARGET = 0.3; // d3: alphaTarget(0.3) while dragging

// Barnes–Hut (d3 forceManyBody defaults).
const THETA2 = 0.81; // theta 0.9, squared
const DIST_MIN2 = 30 * 30; // distanceMin 30, squared

// ── Deterministic randomness (d3's lcg(), as shipped in Obsidian's sim.js) ───
const LCG_M = 4294967296; // 2^32
let lcgState = 1;
function lcgSeed(s: number): void {
  lcgState = s >>> 0 || 1;
}
function random(): number {
  lcgState = (1664525 * lcgState + 1013904223) % LCG_M;
  return lcgState / LCG_M;
}
const jiggle = () => (random() - 0.5) * 1e-6;

// ── Barnes–Hut repulsion (d3 forceManyBody) ───────────────────────────────────
// Pooled quadtree — reused across ticks so a 60 Hz loop doesn't churn the GC.
interface Cell {
  child: [number, number, number, number];
  point: number; // head of coincident-point chain (leaf); -1 = internal/empty
  comX: number;
  comY: number;
  charge: number;
  internal: boolean;
}
const newCell = (): Cell => ({
  child: [-1, -1, -1, -1],
  point: -1,
  comX: 0,
  comY: 0,
  charge: 0,
  internal: false,
});
const cellPool: Cell[] = [];
let cellCount = 0;
let nextPtBuf = new Int32Array(0);
const MAX_DEPTH = 28;

function resetCell(c: Cell): void {
  c.child[0] = c.child[1] = c.child[2] = c.child[3] = -1;
  c.point = -1;
  c.comX = c.comY = c.charge = 0;
  c.internal = false;
}
function takeCell(): number {
  const i = cellCount++;
  if (i < cellPool.length) resetCell(cellPool[i]);
  else cellPool.push(newCell());
  return i;
}

function quadrantOf(x: number, y: number, x0: number, y0: number, half: number): number {
  let q = 0;
  if (x >= x0 + half) q |= 1;
  if (y >= y0 + half) q |= 2;
  return q;
}

function insertPoint(
  cells: Cell[],
  nextPt: Int32Array,
  nodes: PhysicsNode[],
  ci: number,
  x0: number,
  y0: number,
  cw: number,
  p: number,
  depth: number,
): void {
  if (cells[ci].internal) {
    const half = cw * 0.5;
    const q = quadrantOf(nodes[p].x, nodes[p].y, x0, y0, half);
    let ch = cells[ci].child[q];
    if (ch === -1) {
      ch = takeCell();
      cells[ci].child[q] = ch;
    }
    const nx0 = x0 + (q & 1 ? half : 0);
    const ny0 = y0 + (q & 2 ? half : 0);
    insertPoint(cells, nextPt, nodes, ch, nx0, ny0, half, p, depth + 1);
    return;
  }

  if (cells[ci].point === -1) {
    cells[ci].point = p;
    nextPt[p] = -1;
    return;
  }

  const existing = cells[ci].point;
  const coincident =
    Math.abs(nodes[existing].x - nodes[p].x) < 1e-4 &&
    Math.abs(nodes[existing].y - nodes[p].y) < 1e-4;
  if (coincident || depth >= MAX_DEPTH) {
    nextPt[p] = cells[ci].point;
    cells[ci].point = p;
    return;
  }

  const chain = cells[ci].point;
  cells[ci].internal = true;
  cells[ci].point = -1;
  for (let e = chain; e !== -1; ) {
    const nxt = nextPt[e];
    insertPoint(cells, nextPt, nodes, ci, x0, y0, cw, e, depth);
    e = nxt;
  }
  insertPoint(cells, nextPt, nodes, ci, x0, y0, cw, p, depth);
}

function computeMass(
  cells: Cell[],
  nextPt: Int32Array,
  nodes: PhysicsNode[],
  ci: number,
  perCharge: number,
): void {
  const c = cells[ci];
  if (!c.internal) {
    let sx = 0,
      sy = 0,
      cnt = 0;
    for (let p = c.point; p !== -1; p = nextPt[p]) {
      sx += nodes[p].x;
      sy += nodes[p].y;
      cnt++;
    }
    if (cnt > 0) {
      c.comX = sx / cnt;
      c.comY = sy / cnt;
      c.charge = perCharge * cnt;
    } else {
      c.charge = 0;
    }
    return;
  }
  let wx = 0,
    wy = 0,
    q = 0;
  for (let k = 0; k < 4; k++) {
    const ch = c.child[k];
    if (ch === -1) continue;
    computeMass(cells, nextPt, nodes, ch, perCharge);
    const wabs = Math.abs(cells[ch].charge);
    wx += cells[ch].comX * wabs;
    wy += cells[ch].comY * wabs;
    q += cells[ch].charge;
  }
  const aw = Math.abs(q);
  if (aw > 0) {
    c.comX = wx / aw;
    c.comY = wy / aw;
  }
  c.charge = q;
}

// d3 apply(): velocity += dx * cellCharge * alpha / dist². Writes vx directly.
function applyRepulsion(
  cells: Cell[],
  nextPt: Int32Array,
  nodes: PhysicsNode[],
  self: number,
  ci: number,
  x0: number,
  y0: number,
  cw: number,
  perCharge: number,
  alpha: number,
): void {
  const c = cells[ci];
  if (c.charge === 0) return;

  if (!c.internal) {
    for (let p = c.point; p !== -1; p = nextPt[p]) {
      if (p === self) continue;
      let dx = nodes[p].x - nodes[self].x;
      let dy = nodes[p].y - nodes[self].y;
      let d2 = dx * dx + dy * dy;
      if (dx === 0) {
        dx = jiggle();
        d2 += dx * dx;
      }
      if (dy === 0) {
        dy = jiggle();
        d2 += dy * dy;
      }
      if (d2 < DIST_MIN2) d2 = Math.sqrt(DIST_MIN2 * d2);
      const w = (perCharge * alpha) / d2;
      nodes[self].vx += dx * w;
      nodes[self].vy += dy * w;
    }
    return;
  }

  let dx = c.comX - nodes[self].x;
  let dy = c.comY - nodes[self].y;
  let d2 = dx * dx + dy * dy;

  if (cw * cw < THETA2 * d2) {
    if (dx === 0) {
      dx = jiggle();
      d2 += dx * dx;
    }
    if (dy === 0) {
      dy = jiggle();
      d2 += dy * dy;
    }
    if (d2 < DIST_MIN2) d2 = Math.sqrt(DIST_MIN2 * d2);
    const w = (c.charge * alpha) / d2;
    nodes[self].vx += dx * w;
    nodes[self].vy += dy * w;
    return;
  }

  const half = cw * 0.5;
  for (let k = 0; k < 4; k++) {
    const ch = c.child[k];
    if (ch === -1) continue;
    const nx0 = x0 + (k & 1 ? half : 0);
    const ny0 = y0 + (k & 2 ? half : 0);
    applyRepulsion(cells, nextPt, nodes, self, ch, nx0, ny0, half, perCharge, alpha);
  }
}

function forceManyBody(nodes: PhysicsNode[], repulsion: number, alpha: number): void {
  const n = nodes.length;
  if (n < 2) return;
  const perCharge = -repulsion;

  let minX = nodes[0].x,
    maxX = nodes[0].x,
    minY = nodes[0].y,
    maxY = nodes[0].y;
  for (let i = 1; i < n; i++) {
    if (nodes[i].x < minX) minX = nodes[i].x;
    if (nodes[i].x > maxX) maxX = nodes[i].x;
    if (nodes[i].y < minY) minY = nodes[i].y;
    if (nodes[i].y > maxY) maxY = nodes[i].y;
  }
  let w = Math.max(maxX - minX, maxY - minY);
  if (!(w > 0)) w = 1;
  w *= 1.01;

  cellCount = 0;
  takeCell(); // root
  if (nextPtBuf.length < n) nextPtBuf = new Int32Array(n);
  const nextPt = nextPtBuf;
  for (let i = 0; i < n; i++) nextPt[i] = -1;

  for (let p = 0; p < n; p++) insertPoint(cellPool, nextPt, nodes, 0, minX, minY, w, p, 0);
  computeMass(cellPool, nextPt, nodes, 0, perCharge);
  for (let i = 0; i < n; i++)
    applyRepulsion(cellPool, nextPt, nodes, i, 0, minX, minY, w, perCharge, alpha);
}

// ── Link force (d3 forceLink, 1 iteration) ────────────────────────────────────
// Predicted positions, bias split, velocity written directly.
function forceLink(
  nodes: PhysicsNode[],
  edges: PhysicsEdge[],
  distance: number,
  alpha: number,
): void {
  for (const e of edges) {
    const s = nodes[e.sourceIndex];
    const t = nodes[e.targetIndex];
    let x = t.x + t.vx - s.x - s.vx;
    if (x === 0) x = jiggle();
    let y = t.y + t.vy - s.y - s.vy;
    if (y === 0) y = jiggle();
    let l = Math.sqrt(x * x + y * y);
    l = ((l - distance) / l) * alpha * e.strength;
    x *= l;
    y *= l;
    t.vx -= x * e.bias;
    t.vy -= y * e.bias;
    s.vx += x * (1 - e.bias);
    s.vy += y * (1 - e.bias);
  }
}

// ── Centering (d3 forceX + forceY toward the origin) ──────────────────────────
function forceCenter(nodes: PhysicsNode[], gravity: number, alpha: number): void {
  const k = gravity * alpha;
  for (const n of nodes) {
    n.vx += (0 - n.x) * k;
    n.vy += (0 - n.y) * k;
  }
}

// ── Collision (d3 forceCollide, uniform radius, 1 iteration) ──────────────────
// Predicted positions; equal split because every node has the same radius
// (Obsidian passes a constant 60, so d3's r²-ratio is always 0.5). Uniform grid
// broad-phase instead of a quadtree — equivalent for a constant radius.
let pxBuf = new Float64Array(0);
let pyBuf = new Float64Array(0);
let cellStart = new Int32Array(0);
let cellItems = new Int32Array(0);
let cellFill = new Int32Array(0);

function forceCollide(nodes: PhysicsNode[], radius: number, strength: number): void {
  const count = nodes.length;
  if (count < 2 || radius <= 0) return;

  const combined = radius * 2;
  const combinedSq = combined * combined;
  const cellSize = combined;

  if (pxBuf.length < count) {
    pxBuf = new Float64Array(count);
    pyBuf = new Float64Array(count);
    cellItems = new Int32Array(count);
  }
  const px = pxBuf;
  const py = pyBuf;
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (let i = 0; i < count; i++) {
    px[i] = nodes[i].x + nodes[i].vx;
    py[i] = nodes[i].y + nodes[i].vy;
    if (px[i] < minX) minX = px[i];
    if (px[i] > maxX) maxX = px[i];
    if (py[i] < minY) minY = py[i];
    if (py[i] > maxY) maxY = py[i];
  }

  const gw = Math.max(1, Math.floor((maxX - minX) / cellSize) + 1);
  const gh = Math.max(1, Math.floor((maxY - minY) / cellSize) + 1);
  const useGrid = gw * gh <= 4 * count + 4096;

  // d3 collide: l = (r - dist)/dist * strength, split half/half via predicted
  // positions. Writes vx directly.
  const resolve = (i: number, j: number) => {
    let dx = px[i] - px[j];
    let dy = py[i] - py[j];
    let d2 = dx * dx + dy * dy;
    if (d2 >= combinedSq) return;
    if (dx === 0) {
      dx = jiggle();
      d2 += dx * dx;
    }
    if (dy === 0) {
      dy = jiggle();
      d2 += dy * dy;
    }
    let d = Math.sqrt(d2);
    const l = ((combined - d) / d) * strength;
    dx *= l;
    dy *= l;
    nodes[i].vx += dx * 0.5;
    nodes[i].vy += dy * 0.5;
    nodes[j].vx -= dx * 0.5;
    nodes[j].vy -= dy * 0.5;
  };

  if (!useGrid) {
    for (let i = 0; i < count; i++) for (let j = i + 1; j < count; j++) resolve(i, j);
    return;
  }

  const nCells = gw * gh;
  if (cellStart.length < nCells + 1) {
    cellStart = new Int32Array(nCells + 1);
    cellFill = new Int32Array(nCells);
  } else {
    cellStart.fill(0, 0, nCells + 1);
    cellFill.fill(0, 0, nCells);
  }

  const cellOf = (i: number) => {
    const cx = Math.min(Math.max(Math.floor((px[i] - minX) / cellSize), 0), gw - 1);
    const cy = Math.min(Math.max(Math.floor((py[i] - minY) / cellSize), 0), gh - 1);
    return cy * gw + cx;
  };

  for (let i = 0; i < count; i++) cellStart[cellOf(i) + 1]++;
  for (let k = 0; k < nCells; k++) cellStart[k + 1] += cellStart[k];
  for (let i = 0; i < count; i++) {
    const c = cellOf(i);
    cellItems[cellStart[c] + cellFill[c]++] = i;
  }

  for (let i = 0; i < count; i++) {
    const cx = Math.min(Math.max(Math.floor((px[i] - minX) / cellSize), 0), gw - 1);
    const cy = Math.min(Math.max(Math.floor((py[i] - minY) / cellSize), 0), gh - 1);
    const y0 = Math.max(0, cy - 1);
    const y1 = Math.min(gh - 1, cy + 1);
    const x0 = Math.max(0, cx - 1);
    const x1 = Math.min(gw - 1, cx + 1);
    for (let ny = y0; ny <= y1; ny++) {
      for (let nx = x0; nx <= x1; nx++) {
        const c = ny * gw + nx;
        const end = cellStart[c] + cellFill[c];
        for (let k = cellStart[c]; k < end; k++) {
          const j = cellItems[k];
          if (j > i) resolve(i, j);
        }
      }
    }
  }
}

// ── Simulation facade ─────────────────────────────────────────────────────────
export interface NodeInit {
  id: string;
  x?: number;
  y?: number;
}

export class ForceSimulation {
  nodes: PhysicsNode[] = [];
  edges: PhysicsEdge[] = [];
  private idToIndex = new Map<string, number>();

  params: PhysicsParams = { ...PHYSICS_DEFAULTS };

  // Protected (not private): WasmForceSimulation reuses the exact d3 cooling /
  // drag lifecycle around its WASM force pass.
  protected alpha = 1;
  protected alphaTarget = 0;

  // Coalesced drag target, applied at the head of each tick.
  private dragActive = false;
  private dragId = "";
  private dragX = 0;
  private dragY = 0;

  indexForId(id: string): number {
    const i = this.idToIndex.get(id);
    return i === undefined ? -1 : i;
  }
  nodeById(id: string): PhysicsNode | undefined {
    const i = this.idToIndex.get(id);
    return i === undefined ? undefined : this.nodes[i];
  }
  /** True while the layout is still moving (or held warm by a drag). */
  get running(): boolean {
    return this.alpha >= ALPHA_MIN || this.alphaTarget !== 0;
  }

  // Rebuild from scratch. Surviving nodes keep their position and velocity;
  // callers may pass explicit x/y (cached layout). New nodes place on a seeded
  // random disc, so the same vault always produces the same layout.
  // `initialAlpha` lets a cached layout start nearly settled instead of
  // re-running the full 5 s cool-down.
  setup(inits: NodeInit[], rawEdges: { from: string; to: string }[], initialAlpha = 1): void {
    const old = new Map(this.nodes.map((n) => [n.id, n]));
    lcgSeed(inits.length * 2654435761 + 1); // deterministic per graph shape

    this.nodes = [];
    this.edges = [];
    this.idToIndex.clear();

    inits.forEach((init, i) => {
      const o = old.get(init.id);
      let node: PhysicsNode;
      if (init.x !== undefined && init.y !== undefined) {
        node = { id: init.id, x: init.x, y: init.y, vx: 0, vy: 0, fx: NaN, fy: NaN };
      } else if (o) {
        node = { ...o, fx: NaN, fy: NaN };
      } else {
        node = {
          id: init.id,
          x: random() * 400 - 200,
          y: random() * 400 - 200,
          vx: 0,
          vy: 0,
          fx: NaN,
          fy: NaN,
        };
      }
      this.idToIndex.set(init.id, i);
      this.nodes.push(node);
    });

    this.addEdges(rawEdges);
    this.recomputeEdgeParams();

    this.alpha = initialAlpha;
    this.alphaTarget = 0;
  }

  clear(): void {
    this.nodes = [];
    this.edges = [];
    this.idToIndex.clear();
    this.alpha = 0;
    this.alphaTarget = 0;
  }

  // Incremental build for the replay animation.
  addNodes(newNodes: { id: string; x: number; y: number }[], rawEdges: { from: string; to: string }[]): void {
    for (const n of newNodes) {
      if (!n.id || this.idToIndex.has(n.id)) continue;
      this.idToIndex.set(n.id, this.nodes.length);
      this.nodes.push({ id: n.id, x: n.x, y: n.y, vx: 0, vy: 0, fx: NaN, fy: NaN });
    }
    this.addEdges(rawEdges);
    this.recomputeEdgeParams();
    this.alpha = Math.max(this.alpha, 0.6);
    this.alphaTarget = 0;
  }

  private addEdges(rawEdges: { from: string; to: string }[]): void {
    for (const e of rawEdges) {
      const s = this.idToIndex.get(e.from);
      const t = this.idToIndex.get(e.to);
      if (s !== undefined && t !== undefined) {
        this.edges.push({ sourceIndex: s, targetIndex: t, strength: 1, bias: 0.5 });
      }
    }
  }

  // d3 defaults: strength = 1/min(deg) (scaled by the user's linkStrength at
  // tick time), bias = deg(source)/(deg(source)+deg(target)).
  private recomputeEdgeParams(): void {
    const degree = new Int32Array(this.nodes.length);
    for (const e of this.edges) {
      degree[e.sourceIndex]++;
      degree[e.targetIndex]++;
    }
    for (const e of this.edges) {
      const ds = degree[e.sourceIndex];
      const dt = degree[e.targetIndex];
      e.strength = 1 / Math.max(1, Math.min(ds, dt));
      e.bias = ds / Math.max(1, ds + dt);
    }
  }

  // ── Drag (Obsidian: forceNode fx/fy + alphaTarget 0.3) ─────────────────────
  beginDrag(id: string): void {
    const n = this.nodeById(id);
    if (n) {
      this.dragX = n.x;
      this.dragY = n.y;
    }
    this.dragActive = true;
    this.dragId = id;
    this.alpha = Math.max(this.alpha, DRAG_ALPHA_TARGET);
    this.alphaTarget = DRAG_ALPHA_TARGET;
  }

  setDragTarget(id: string, x: number, y: number): void {
    this.dragActive = true;
    this.dragId = id;
    this.dragX = x;
    this.dragY = y;
  }

  // Unpin, seeding the release velocity so a flicked node coasts (our nicety on
  // top of d3 — stock d3-drag just unpins).
  endDrag(id: string, vx: number, vy: number): void {
    const n = this.nodeById(id);
    if (n) {
      n.fx = NaN;
      n.fy = NaN;
      n.vx = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, vx));
      n.vy = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, vy));
    }
    this.dragActive = false;
    this.dragId = "";
    this.alphaTarget = 0;
  }

  reheat(): void {
    this.alpha = 1;
  }
  // Obsidian sends alpha 0.3 when a force slider changes — enough energy for the
  // layout to adapt without the violence of a full restart.
  heat(a: number): void {
    this.alpha = Math.max(this.alpha, a);
  }

  protected applyDragTarget(): void {
    if (!this.dragActive || !this.dragId) return;
    const n = this.nodeById(this.dragId);
    if (!n) return;
    n.fx = this.dragX;
    n.fy = this.dragY;
  }

  // One tick — Obsidian's W(): update alpha, run forces in d3 registration
  // order, integrate with velocityDecay and fx/fy pinning.
  tick(): void {
    this.applyDragTarget();

    this.alpha += (this.alphaTarget - this.alpha) * ALPHA_DECAY;
    if (this.alpha < ALPHA_MIN && this.alphaTarget === 0) {
      this.alpha = 0;
      return; // fully cooled — idle until heated / dragged
    }

    const p = this.params;
    // d3 order: forceX, forceY, link, manyBody, collide — Gauss–Seidel.
    forceCenter(this.nodes, p.gravity, this.alpha);
    forceLink(this.nodes, this.edges, p.linkDistance, this.alpha * p.linkStrength);
    forceManyBody(this.nodes, p.repulsion, this.alpha);
    forceCollide(this.nodes, p.collisionRadius, COLLISION_STRENGTH);

    // Integration: x += vx *= damping; pinned nodes sit exactly at fx/fy.
    for (const n of this.nodes) {
      if (n.fx === n.fx) {
        // fx is a number (not NaN) → pinned
        n.x = n.fx;
        n.y = n.fy;
        n.vx = 0;
        n.vy = 0;
        continue;
      }
      if (n.vx > MAX_SPEED) n.vx = MAX_SPEED;
      else if (n.vx < -MAX_SPEED) n.vx = -MAX_SPEED;
      if (n.vy > MAX_SPEED) n.vy = MAX_SPEED;
      else if (n.vy < -MAX_SPEED) n.vy = -MAX_SPEED;
      n.x += n.vx *= p.damping;
      n.y += n.vy *= p.damping;
    }
  }
}
