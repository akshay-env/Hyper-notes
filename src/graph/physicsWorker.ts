// Graph physics Web Worker — the same architecture as Obsidian's sim.js
// ("Graph Worker"): the simulation lives HERE, ticks on a 1000/60 ms timer, and
// posts a positions buffer to the main thread after every tick. The render
// thread never runs physics; a 1000-note settle can't stall the UI.
//
// Protocol (main → worker):
//   { type: "setup",     nodes: NodeInit[], edges: {from,to}[], alpha: number }
//   { type: "addNodes",  nodes: {id,x,y}[], edges: {from,to}[] }
//   { type: "clear" }
//   { type: "params",    params: PhysicsParams, heat?: number }
//   { type: "beginDrag", id: string }
//   { type: "dragTarget", id: string, x: number, y: number }   (coalesced)
//   { type: "endDrag",   id: string, vx: number, vy: number }
//   { type: "heat",      alpha: number }
//
// Protocol (worker → main):
//   { type: "ids",  epoch, ids: string[] }              — node order changed
//   { type: "tick", epoch, positions: Float32Array }    — buffer transferred,
//     [x0,y0,x1,y1,…] in the order of the last "ids" message
import { type NodeInit, type PhysicsParams } from "./physics";
import { WasmForceSimulation } from "./physicsWasm";

// The project compiles against the DOM lib, whose window.postMessage signature
// (targetOrigin) shadows the worker one — route through the worker-scoped shape.
// Bound to self: an extracted method loses its receiver in strict module code.
const post = (self.postMessage as (message: unknown, transfer?: Transferable[]) => void).bind(
  self,
);

// WASM force pass (Obsidian's compiled d3 pipeline) with the JS simulation as
// its lifecycle + fallback — one object, one protocol, engine chosen per tick.
const sim = new WasmForceSimulation();
console.log(`graph physics: ${sim.engine === "wasm" ? "WASM engine" : "JS engine"}`);

const TICK_MS = 1000 / 60;
let timer: ReturnType<typeof setTimeout> | null = null;
// Epoch stamps each ids/tick pair so a stale positions buffer from before a
// topology change can never be applied to the new node order.
let epoch = 0;

// SharedArrayBuffer positions channel (needs the COOP/COEP headers the dev
// server sets; falls back to transferable buffers anywhere it's unavailable).
let sharedBuffer: SharedArrayBuffer | null = null;
let useSAB = false;
if (typeof SharedArrayBuffer !== "undefined") {
  try {
    void new SharedArrayBuffer(1);
    useSAB = true;
  } catch {
    useSAB = false;
  }
}

function postIds(): void {
  epoch++;
  post({ type: "ids", epoch, ids: sim.nodes.map((n) => n.id) });
}

function postPositions(): void {
  const n = sim.nodes.length;
  
  if (useSAB) {
    // SAB: [version u32, x0, y0, x1, y1, ...] — the render thread reads the
    // positions in place (zero-copy); the tiny tickShared message is only the
    // wake-up signal for its sleeping render loop.
    const reqBytes = 4 + n * 2 * 4; // version uint32 + positions
    if (!sharedBuffer || sharedBuffer.byteLength !== reqBytes) {
      sharedBuffer = new SharedArrayBuffer(reqBytes);
      post({ type: "sharedBuffer", epoch, buffer: sharedBuffer });
    }
    const f32 = new Float32Array(sharedBuffer, 4);
    for (let i = 0; i < n; i++) {
      f32[2 * i] = sim.nodes[i].x;
      f32[2 * i + 1] = sim.nodes[i].y;
    }
    // Atomics.add AFTER the position writes: the version bump is the release
    // fence the reader pairs with (Atomics.load) before touching positions.
    const u32 = new Uint32Array(sharedBuffer, 0, 1);
    const version = Atomics.add(u32, 0, 1) + 1;
    post({ type: "tickShared", epoch, version });
  } else {
    // Transferable fallback
    const buf = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      buf[2 * i] = sim.nodes[i].x;
      buf[2 * i + 1] = sim.nodes[i].y;
    }
    // Transferred, not copied — the worker gives the buffer away each tick.
    post({ type: "tick", epoch, positions: buf }, [buf.buffer]);
  }
}

// Obsidian's W()/P() pair: tick, post, reschedule while there's energy left.
function loop(): void {
  timer = null;
  if (!sim.running) {
    postPositions(); // one final frame so the settled state is exact
    return;
  }
  sim.tick();
  postPositions();
  schedule();
}

function schedule(): void {
  if (timer === null) timer = setTimeout(loop, TICK_MS);
}

interface SetupMsg {
  type: "setup";
  nodes: NodeInit[];
  edges: { from: string; to: string }[];
  alpha: number;
}
interface AddNodesMsg {
  type: "addNodes";
  nodes: { id: string; x: number; y: number }[];
  edges: { from: string; to: string }[];
}
interface ClearMsg {
  type: "clear";
}
interface ParamsMsg {
  type: "params";
  params: PhysicsParams;
  heat?: number;
}
interface BeginDragMsg {
  type: "beginDrag";
  id: string;
}
interface DragTargetMsg {
  type: "dragTarget";
  id: string;
  x: number;
  y: number;
}
interface EndDragMsg {
  type: "endDrag";
  id: string;
  vx: number;
  vy: number;
}
interface HeatMsg {
  type: "heat";
  alpha: number;
}
type InMsg =
  | SetupMsg
  | AddNodesMsg
  | ClearMsg
  | ParamsMsg
  | BeginDragMsg
  | DragTargetMsg
  | EndDragMsg
  | HeatMsg;

self.onmessage = (e: MessageEvent<InMsg>) => {
  const m = e.data;
  switch (m.type) {
    case "setup":
      sim.setup(m.nodes, m.edges, m.alpha);
      postIds();
      postPositions();
      schedule();
      break;
    case "addNodes":
      sim.addNodes(m.nodes, m.edges);
      postIds();
      postPositions();
      schedule();
      break;
    case "clear":
      sim.clear();
      postIds();
      postPositions();
      break;
    case "params":
      sim.params = m.params;
      if (m.heat !== undefined) sim.heat(m.heat);
      schedule();
      break;
    case "beginDrag":
      sim.beginDrag(m.id);
      schedule();
      break;
    case "dragTarget":
      sim.setDragTarget(m.id, m.x, m.y);
      schedule();
      break;
    case "endDrag":
      sim.endDrag(m.id, m.vx, m.vy);
      schedule();
      break;
    case "heat":
      sim.heat(m.alpha);
      schedule();
      break;
  }
};
