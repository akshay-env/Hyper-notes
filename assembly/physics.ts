// D3-exact force pipeline in AssemblyScript — the WASM half of the graph
// physics. This is a straight port of src/graph/physics.ts's force functions
// (forceX/forceY → link → manyBody(Barnes–Hut) → collide, Gauss–Seidel order,
// velocity-Verlet-free d3 integration); the SIMULATION LIFECYCLE (alpha
// cooling, drag pinning, flick velocities) stays in JS — see
// src/graph/physicsWasm.ts, which drives these exports.
//
// Unlike the module Obsidian ships, the collision radius is a real simulate()
// parameter here (theirs bakes 60.0 into the quadtree header), so the app's
// Spacing slider works in WASM mode.
//
// Memory map (linear, all offsets in bytes; JS writes nodes+edges, we own the
// scratch):
//   node i   at 20·i          x f32 | y f32 | vx f32 | vy f32 | degree f32
//   edge j   at 20·N + 12·j   source i32 | target i32 | bias f32 (init fills)
//   scratch  after edges      nextPt | px | py | grid | items | quadtree cells
//
// Call protocol (from JS):
//   requiredBytes(n, e)  → grow the exported memory to at least this size
//   write nodes + edges  → init(n, e)          (topology changes only)
//   write node state     → simulate(…) + complete(…)   (every tick)
//   read node state back

const NODE_B: i32 = 20; // bytes per node record
const EDGE_B: i32 = 12; // bytes per edge record
const CELL_B: i32 = 36; // bytes per quadtree cell record

// d3 forceManyBody defaults (identical to src/graph/physics.ts).
const DIST_MIN2: f32 = 900.0; // distanceMin 30, squared
const MAX_DEPTH: i32 = 28;
const MAX_SPEED: f32 = 500.0;

// ── Region offsets, established by layout() (init) ───────────────────────────
let N: i32 = 0;
let E: i32 = 0;
let EDGES: usize = 0;
let NEXT: usize = 0; // i32 × N   coincident-point chains
let PX: usize = 0; //   f32 × N   predicted x (collide)
let PY: usize = 0; //   f32 × N   predicted y (collide)
let CSTART: usize = 0; // i32 × (gridCap+1)
let CFILL: usize = 0; //  i32 × gridCap
let CITEMS: usize = 0; // i32 × N
let CELLS: usize = 0; // quadtree pool (grown on demand — last region)
let gridCap: i32 = 0;
let cellCap: i32 = 0;
let cellCount: i32 = 0;

function ensureBytes(bytes: usize): void {
  const need = <i32>((bytes + 0xffff) >> 16);
  const have = memory.size();
  if (need > have) memory.grow(need - have);
}

function computeLayout(n: i32, e: i32): usize {
  EDGES = <usize>(NODE_B * n);
  let s = (EDGES + <usize>(EDGE_B * e) + 15) & ~(<usize>15);
  NEXT = s;
  s += <usize>(4 * n);
  PX = s;
  s += <usize>(4 * n);
  PY = s;
  s += <usize>(4 * n);
  gridCap = 4 * n + 4096;
  CSTART = s;
  s += <usize>(4 * (gridCap + 1));
  CFILL = s;
  s += <usize>(4 * gridCap);
  CITEMS = s;
  s += <usize>(4 * n);
  CELLS = s;
  return s;
}

/** Bytes the module needs for n nodes / e edges (JS grows memory to this
    before writing node and edge records). Includes the initial cell pool. */
export function requiredBytes(n: i32, e: i32): i32 {
  const s = computeLayout(n, e); // sets region globals; harmless before init
  const cap = max(256, 2 * n);
  return <i32>(s + <usize>(CELL_B * cap));
}

// ── Node / edge accessors ─────────────────────────────────────────────────────
// @ts-ignore: decorator
@inline function nodeP(i: i32): usize {
  return <usize>(NODE_B * i);
}
// @ts-ignore: decorator
@inline function getX(i: i32): f32 {
  return load<f32>(nodeP(i));
}
// @ts-ignore: decorator
@inline function getY(i: i32): f32 {
  return load<f32>(nodeP(i) + 4);
}
// @ts-ignore: decorator
@inline function getVX(i: i32): f32 {
  return load<f32>(nodeP(i) + 8);
}
// @ts-ignore: decorator
@inline function getVY(i: i32): f32 {
  return load<f32>(nodeP(i) + 12);
}
// @ts-ignore: decorator
@inline function setVX(i: i32, v: f32): void {
  store<f32>(nodeP(i) + 8, v);
}
// @ts-ignore: decorator
@inline function setVY(i: i32, v: f32): void {
  store<f32>(nodeP(i) + 12, v);
}
// @ts-ignore: decorator
@inline function getDeg(i: i32): f32 {
  return load<f32>(nodeP(i) + 16);
}
// @ts-ignore: decorator
@inline function edgeP(j: i32): usize {
  return EDGES + <usize>(EDGE_B * j);
}

// ── Deterministic jiggle (d3's lcg(), same constants as physics.ts) ──────────
let lcgState: u32 = 1;
// @ts-ignore: decorator
@inline function lcgSeed(s: u32): void {
  lcgState = s != 0 ? s : 1;
}
// @ts-ignore: decorator
@inline function random(): f32 {
  lcgState = 1664525 * lcgState + 1013904223;
  return <f32>(<f64>lcgState / 4294967296.0);
}
// @ts-ignore: decorator
@inline function jiggle(): f32 {
  return (random() - 0.5) * 1e-6;
}

// ── init: degrees + link bias (d3 forceLink initialize) ──────────────────────
export function init(n: i32, e: i32): void {
  N = n;
  E = e;
  const scratchEnd = computeLayout(n, e);
  cellCap = max(256, 2 * n);
  ensureBytes(scratchEnd + <usize>(CELL_B * cellCap));

  for (let i = 0; i < n; i++) store<f32>(nodeP(i) + 16, 0);
  for (let j = 0; j < e; j++) {
    const s = load<i32>(edgeP(j));
    const t = load<i32>(edgeP(j) + 4);
    store<f32>(nodeP(s) + 16, getDeg(s) + 1.0);
    store<f32>(nodeP(t) + 16, getDeg(t) + 1.0);
  }
  for (let j = 0; j < e; j++) {
    const s = load<i32>(edgeP(j));
    const t = load<i32>(edgeP(j) + 4);
    const ds = getDeg(s);
    const dt = getDeg(t);
    const sum = ds + dt;
    store<f32>(edgeP(j) + 8, sum > 0 ? ds / sum : <f32>0.5);
  }
  lcgSeed(<u32>n * 2654435761 + 1);
}

// ── forceX + forceY toward the origin (d3, strength = gravity) ───────────────
function forceCenter(gravity: f32, alpha: f32): void {
  const k = gravity * alpha;
  for (let i = 0; i < N; i++) {
    setVX(i, getVX(i) + (0 - getX(i)) * k);
    setVY(i, getVY(i) + (0 - getY(i)) * k);
  }
}

// ── forceLink (1 iteration, predicted positions, bias split) ─────────────────
function forceLink(distance: f32, alphaStrength: f32): void {
  for (let j = 0; j < E; j++) {
    const s = load<i32>(edgeP(j));
    const t = load<i32>(edgeP(j) + 4);
    const bias = load<f32>(edgeP(j) + 8);
    // d3 default strength: 1 / max(1, min(deg(s), deg(t))), user scale applied
    // via alphaStrength (= alpha · linkStrength), exactly like physics.ts.
    const strength = <f32>1.0 / max<f32>(1.0, min<f32>(getDeg(s), getDeg(t)));

    let x = getX(t) + getVX(t) - getX(s) - getVX(s);
    if (x == 0) x = jiggle();
    let y = getY(t) + getVY(t) - getY(s) - getVY(s);
    if (y == 0) y = jiggle();
    let l = Mathf.sqrt(x * x + y * y);
    l = ((l - distance) / l) * alphaStrength * strength;
    x *= l;
    y *= l;
    setVX(t, getVX(t) - x * bias);
    setVY(t, getVY(t) - y * bias);
    setVX(s, getVX(s) + x * (1.0 - bias));
    setVY(s, getVY(s) + y * (1.0 - bias));
  }
}

// ── Barnes–Hut repulsion (d3 forceManyBody, pooled quadtree) ─────────────────
// Cell record: child[4] i32 (+0..15) | point i32 (+16) | comX f32 (+20) |
//              comY f32 (+24) | charge f32 (+28) | internal i32 (+32)
// @ts-ignore: decorator
@inline function cellP(c: i32): usize {
  return CELLS + <usize>(CELL_B * c);
}

function takeCell(): i32 {
  if (cellCount >= cellCap) {
    cellCap *= 2;
    ensureBytes(CELLS + <usize>(CELL_B * cellCap));
  }
  const c = cellCount++;
  const p = cellP(c);
  store<i32>(p, -1);
  store<i32>(p + 4, -1);
  store<i32>(p + 8, -1);
  store<i32>(p + 12, -1);
  store<i32>(p + 16, -1);
  store<f32>(p + 20, 0);
  store<f32>(p + 24, 0);
  store<f32>(p + 28, 0);
  store<i32>(p + 32, 0);
  return c;
}

function insertPoint(ci: i32, x0: f32, y0: f32, cw: f32, pt: i32, depth: i32): void {
  const p = cellP(ci);
  if (load<i32>(p + 32) != 0) {
    // internal
    const half = cw * 0.5;
    let q = 0;
    if (getX(pt) >= x0 + half) q |= 1;
    if (getY(pt) >= y0 + half) q |= 2;
    let ch = load<i32>(p + (<usize>(4 * q)));
    if (ch == -1) {
      ch = takeCell();
      store<i32>(cellP(ci) + (<usize>(4 * q)), ch); // re-derive: pool may have moved
    }
    const nx0 = x0 + ((q & 1) != 0 ? half : 0);
    const ny0 = y0 + ((q & 2) != 0 ? half : 0);
    insertPoint(ch, nx0, ny0, half, pt, depth + 1);
    return;
  }

  const existing = load<i32>(p + 16);
  if (existing == -1) {
    store<i32>(p + 16, pt);
    store<i32>(NEXT + (<usize>(4 * pt)), -1);
    return;
  }

  const coincident =
    Mathf.abs(getX(existing) - getX(pt)) < 1e-4 && Mathf.abs(getY(existing) - getY(pt)) < 1e-4;
  if (coincident || depth >= MAX_DEPTH) {
    store<i32>(NEXT + (<usize>(4 * pt)), existing);
    store<i32>(p + 16, pt);
    return;
  }

  // Split: became internal; reinsert the chain, then the new point.
  store<i32>(p + 32, 1);
  store<i32>(p + 16, -1);
  let e = existing;
  while (e != -1) {
    const nxt = load<i32>(NEXT + (<usize>(4 * e)));
    insertPoint(ci, x0, y0, cw, e, depth);
    e = nxt;
  }
  insertPoint(ci, x0, y0, cw, pt, depth);
}

function computeMass(ci: i32, perCharge: f32): void {
  const p = cellP(ci);
  if (load<i32>(p + 32) == 0) {
    let sx: f32 = 0;
    let sy: f32 = 0;
    let cnt = 0;
    let pt = load<i32>(p + 16);
    while (pt != -1) {
      sx += getX(pt);
      sy += getY(pt);
      cnt++;
      pt = load<i32>(NEXT + (<usize>(4 * pt)));
    }
    if (cnt > 0) {
      store<f32>(p + 20, sx / <f32>cnt);
      store<f32>(p + 24, sy / <f32>cnt);
      store<f32>(p + 28, perCharge * <f32>cnt);
    } else {
      store<f32>(p + 28, 0);
    }
    return;
  }
  let wx: f32 = 0;
  let wy: f32 = 0;
  let q: f32 = 0;
  for (let k = 0; k < 4; k++) {
    const ch = load<i32>(p + (<usize>(4 * k)));
    if (ch == -1) continue;
    computeMass(ch, perCharge);
    const cp = cellP(ch);
    const wabs = Mathf.abs(load<f32>(cp + 28));
    wx += load<f32>(cp + 20) * wabs;
    wy += load<f32>(cp + 24) * wabs;
    q += load<f32>(cp + 28);
  }
  const aw = Mathf.abs(q);
  if (aw > 0) {
    store<f32>(p + 20, wx / aw);
    store<f32>(p + 24, wy / aw);
  }
  store<f32>(p + 28, q);
}

function applyRepulsion(
  self: i32,
  ci: i32,
  x0: f32,
  y0: f32,
  cw: f32,
  perCharge: f32,
  alpha: f32,
  theta2: f32,
): void {
  const p = cellP(ci);
  const charge = load<f32>(p + 28);
  if (charge == 0) return;

  if (load<i32>(p + 32) == 0) {
    // leaf: exact pairwise against the chain
    let pt = load<i32>(p + 16);
    while (pt != -1) {
      if (pt != self) {
        let dx = getX(pt) - getX(self);
        let dy = getY(pt) - getY(self);
        let d2 = dx * dx + dy * dy;
        if (dx == 0) {
          dx = jiggle();
          d2 += dx * dx;
        }
        if (dy == 0) {
          dy = jiggle();
          d2 += dy * dy;
        }
        if (d2 < DIST_MIN2) d2 = Mathf.sqrt(DIST_MIN2 * d2);
        const w = (perCharge * alpha) / d2;
        setVX(self, getVX(self) + dx * w);
        setVY(self, getVY(self) + dy * w);
      }
      pt = load<i32>(NEXT + (<usize>(4 * pt)));
    }
    return;
  }

  let dx = load<f32>(p + 20) - getX(self);
  let dy = load<f32>(p + 24) - getY(self);
  let d2 = dx * dx + dy * dy;

  if (cw * cw < theta2 * d2) {
    if (dx == 0) {
      dx = jiggle();
      d2 += dx * dx;
    }
    if (dy == 0) {
      dy = jiggle();
      d2 += dy * dy;
    }
    if (d2 < DIST_MIN2) d2 = Mathf.sqrt(DIST_MIN2 * d2);
    const w = (charge * alpha) / d2;
    setVX(self, getVX(self) + dx * w);
    setVY(self, getVY(self) + dy * w);
    return;
  }

  const half = cw * 0.5;
  for (let k = 0; k < 4; k++) {
    const ch = load<i32>(p + (<usize>(4 * k)));
    if (ch == -1) continue;
    const nx0 = x0 + ((k & 1) != 0 ? half : 0);
    const ny0 = y0 + ((k & 2) != 0 ? half : 0);
    applyRepulsion(self, ch, nx0, ny0, half, perCharge, alpha, theta2);
  }
}

function forceManyBody(repulsion: f32, alpha: f32, theta: f32): void {
  if (N < 2) return;
  const perCharge = -repulsion;

  let minX = getX(0);
  let maxX = minX;
  let minY = getY(0);
  let maxY = minY;
  for (let i = 1; i < N; i++) {
    const x = getX(i);
    const y = getY(i);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  let w = max<f32>(maxX - minX, maxY - minY);
  if (!(w > 0)) w = 1.0;
  w *= 1.01;

  cellCount = 0;
  takeCell(); // root
  for (let i = 0; i < N; i++) store<i32>(NEXT + (<usize>(4 * i)), -1);
  for (let pt = 0; pt < N; pt++) insertPoint(0, minX, minY, w, pt, 0);
  computeMass(0, perCharge);
  const theta2 = theta * theta;
  for (let i = 0; i < N; i++) applyRepulsion(i, 0, minX, minY, w, perCharge, alpha, theta2);
}

// ── Collision (uniform radius, grid broad-phase — port of physics.ts) ────────
// @ts-ignore: decorator
@inline function resolvePair(i: i32, j: i32, combined: f32, combinedSq: f32, strength: f32): void {
  let dx = load<f32>(PX + (<usize>(4 * i))) - load<f32>(PX + (<usize>(4 * j)));
  let dy = load<f32>(PY + (<usize>(4 * i))) - load<f32>(PY + (<usize>(4 * j)));
  let d2 = dx * dx + dy * dy;
  if (d2 >= combinedSq) return;
  if (dx == 0) {
    dx = jiggle();
    d2 += dx * dx;
  }
  if (dy == 0) {
    dy = jiggle();
    d2 += dy * dy;
  }
  const d = Mathf.sqrt(d2);
  const l = ((combined - d) / d) * strength;
  dx *= l;
  dy *= l;
  setVX(i, getVX(i) + dx * 0.5);
  setVY(i, getVY(i) + dy * 0.5);
  setVX(j, getVX(j) - dx * 0.5);
  setVY(j, getVY(j) - dy * 0.5);
}

function forceCollide(radius: f32, strength: f32): void {
  if (N < 2 || radius <= 0) return;
  const combined = radius * 2.0;
  const combinedSq = combined * combined;
  const cellSize = combined;

  let minX: f32 = f32.MAX_VALUE;
  let maxX: f32 = -f32.MAX_VALUE;
  let minY: f32 = f32.MAX_VALUE;
  let maxY: f32 = -f32.MAX_VALUE;
  for (let i = 0; i < N; i++) {
    const px = getX(i) + getVX(i);
    const py = getY(i) + getVY(i);
    store<f32>(PX + (<usize>(4 * i)), px);
    store<f32>(PY + (<usize>(4 * i)), py);
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }

  const gw = max(1, <i32>Mathf.floor((maxX - minX) / cellSize) + 1);
  const gh = max(1, <i32>Mathf.floor((maxY - minY) / cellSize) + 1);
  const nCells = gw * gh;

  if (nCells > gridCap) {
    // Grid would be bigger than the reserved region — O(n²) fallback,
    // same guard as the JS implementation.
    for (let i = 0; i < N; i++)
      for (let j = i + 1; j < N; j++) resolvePair(i, j, combined, combinedSq, strength);
    return;
  }

  for (let k = 0; k <= nCells; k++) store<i32>(CSTART + (<usize>(4 * k)), 0);
  for (let k = 0; k < nCells; k++) store<i32>(CFILL + (<usize>(4 * k)), 0);

  for (let i = 0; i < N; i++) {
    const c = gridCellOf(i, minX, minY, cellSize, gw, gh);
    const at = CSTART + (<usize>(4 * (c + 1)));
    store<i32>(at, load<i32>(at) + 1);
  }
  for (let k = 0; k < nCells; k++) {
    const at = CSTART + (<usize>(4 * (k + 1)));
    store<i32>(at, load<i32>(at) + load<i32>(CSTART + (<usize>(4 * k))));
  }
  for (let i = 0; i < N; i++) {
    const c = gridCellOf(i, minX, minY, cellSize, gw, gh);
    const fillAt = CFILL + (<usize>(4 * c));
    const fill = load<i32>(fillAt);
    const slot = load<i32>(CSTART + (<usize>(4 * c))) + fill;
    store<i32>(CITEMS + (<usize>(4 * slot)), i);
    store<i32>(fillAt, fill + 1);
  }

  for (let i = 0; i < N; i++) {
    const cx = gridClamp(<i32>Mathf.floor((load<f32>(PX + (<usize>(4 * i))) - minX) / cellSize), gw);
    const cy = gridClamp(<i32>Mathf.floor((load<f32>(PY + (<usize>(4 * i))) - minY) / cellSize), gh);
    const y0 = max(0, cy - 1);
    const y1 = min(gh - 1, cy + 1);
    const x0 = max(0, cx - 1);
    const x1 = min(gw - 1, cx + 1);
    for (let ny = y0; ny <= y1; ny++) {
      for (let nx = x0; nx <= x1; nx++) {
        const c = ny * gw + nx;
        const start = load<i32>(CSTART + (<usize>(4 * c)));
        const end = start + load<i32>(CFILL + (<usize>(4 * c)));
        for (let k = start; k < end; k++) {
          const j = load<i32>(CITEMS + (<usize>(4 * k)));
          if (j > i) resolvePair(i, j, combined, combinedSq, strength);
        }
      }
    }
  }
}

// @ts-ignore: decorator
@inline function gridClamp(v: i32, dim: i32): i32 {
  return min(max(v, 0), dim - 1);
}
// @ts-ignore: decorator
@inline function gridCellOf(i: i32, minX: f32, minY: f32, cellSize: f32, gw: i32, gh: i32): i32 {
  const cx = gridClamp(<i32>Mathf.floor((load<f32>(PX + (<usize>(4 * i))) - minX) / cellSize), gw);
  const cy = gridClamp(<i32>Mathf.floor((load<f32>(PY + (<usize>(4 * i))) - minY) / cellSize), gh);
  return cy * gw + cx;
}

// ── One force pass (d3 registration order, Gauss–Seidel coupling) ────────────
export function simulate(
  n: i32,
  e: i32,
  alpha: f32,
  gravity: f32,
  linkStrength: f32,
  linkDistance: f32,
  repulsion: f32,
  theta: f32,
  collideStrength: f32,
  collideRadius: f32,
): void {
  if (n != N || e != E) return; // protocol violation — init() first
  forceCenter(gravity, alpha);
  forceLink(linkDistance, alpha * linkStrength);
  forceManyBody(repulsion, alpha, theta);
  forceCollide(collideRadius, collideStrength);
}

// ── Integration: x += vx *= decay, with the same ±500 safety cap as JS ────────
export function complete(n: i32, velocityDecay: f32): void {
  for (let i = 0; i < n; i++) {
    let vx = getVX(i);
    let vy = getVY(i);
    if (vx > MAX_SPEED) vx = MAX_SPEED;
    else if (vx < -MAX_SPEED) vx = -MAX_SPEED;
    if (vy > MAX_SPEED) vy = MAX_SPEED;
    else if (vy < -MAX_SPEED) vy = -MAX_SPEED;
    vx *= velocityDecay;
    vy *= velocityDecay;
    store<f32>(nodeP(i), getX(i) + vx);
    store<f32>(nodeP(i) + 4, getY(i) + vy);
    setVX(i, vx);
    setVY(i, vy);
  }
}
