// Regression tests for the WASM-accelerated simulation (graph/physicsWasm.ts).
// Run: npm run test:graph  (or  npx tsx src/graph/__tests__/physicsWasm.test.mts)
//
// The WASM binary is Obsidian's compiled d3-force pipeline; WasmForceSimulation
// wraps it in ForceSimulation's exact lifecycle. These tests assert (a) the
// engine actually engages, (b) it reproduces the JS sim's macroscopic behavior,
// (c) drag/flick/pinning semantics survive the JS↔WASM state handoff, and
// (d) the Spacing-slider fallback path stays seamless.
import { ForceSimulation } from "../physics";
import { WasmForceSimulation } from "../physicsWasm";

let pass = 0,
  fail = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) {
    pass++;
    console.log(`  ok  ${name}${detail ? `  (${detail})` : ""}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${detail ? `  (${detail})` : ""}`);
  }
};

const settle = (sim: ForceSimulation, max = 2000) => {
  let n = 0;
  while (sim.running && n < max) {
    sim.tick();
    n++;
  }
  return n;
};

console.log("\n— physics (WASM engine) —");

// The engine must actually load under Node (same WebAssembly API as browsers).
{
  const sim = new WasmForceSimulation();
  ok("wasm engine compiled and selected", sim.engine === "wasm");
}

// Linked pair: same macroscopic rest state as the JS sim's reference test.
{
  const sim = new WasmForceSimulation();
  sim.setup([{ id: "a" }, { id: "b" }], [{ from: "a", to: "b" }]);
  const ticks = settle(sim);
  const a = sim.nodeById("a")!,
    b = sim.nodeById("b")!;
  const d = Math.hypot(a.x - b.x, a.y - b.y);
  ok("pair rest distance near link length", d > 200 && d < 260, `d=${d.toFixed(1)}`);
  ok("cools to rest (alpha lifecycle intact)", !sim.running, `${ticks} ticks`);
  ok("no NaN after wasm ticks", sim.nodes.every((n) => isFinite(n.x) && isFinite(n.y)));
}

// Parity with the JS reference: identical topology settles to a similar shape
// (float32 vs float64 and different coincidence-jiggle forbid exactness; the
// macro layout — mean edge length — must agree closely).
{
  const ids = Array.from({ length: 30 }, (_, i) => ({ id: `n${i}` }));
  const edges = Array.from({ length: 29 }, (_, i) => ({
    from: `n${i + 1}`,
    to: `n${(i * 7) % (i + 1)}`,
  }));
  const meanEdge = (sim: ForceSimulation) => {
    let sum = 0;
    for (const e of edges) {
      const s = sim.nodeById(e.from)!,
        t = sim.nodeById(e.to)!;
      sum += Math.hypot(s.x - t.x, s.y - t.y);
    }
    return sum / edges.length;
  };
  const js = new ForceSimulation();
  js.setup(ids, edges);
  settle(js);
  const wasm = new WasmForceSimulation();
  wasm.setup(ids, edges);
  settle(wasm);
  const a = meanEdge(js),
    b = meanEdge(wasm);
  const ratio = Math.max(a, b) / Math.min(a, b);
  ok("macro parity with JS sim", ratio < 1.2, `js=${a.toFixed(0)} wasm=${b.toFixed(0)}`);
  ok(
    "wasm layout bounded",
    wasm.nodes.every((n) => Math.hypot(n.x, n.y) < 1e4),
  );
}

// Drag: pin follows the cursor through the wasm pass; sim held warm; flick
// velocity survives the JS→WASM state write-in; re-cools after release.
{
  const sim = new WasmForceSimulation();
  sim.setup([{ id: "a" }, { id: "b" }], [{ from: "a", to: "b" }]);
  settle(sim);
  sim.beginDrag("a");
  sim.setDragTarget("a", 500, -300);
  for (let i = 0; i < 30; i++) sim.tick();
  const a = sim.nodeById("a")!;
  ok("dragged node pinned to cursor", a.x === 500 && a.y === -300, `at ${a.x},${a.y}`);
  ok("sim held warm during drag", sim.running);
  sim.endDrag("a", 40, 0);
  sim.tick();
  ok("release velocity applied", sim.nodeById("a")!.x > 500, `x=${a.x.toFixed(1)}`);
  const ticks = settle(sim, 3000);
  ok("re-cools after release", !sim.running, `${ticks} ticks`);
}

// Collision radius is a REAL parameter of our AssemblyScript module (Obsidian's
// bakes 60.0 in) — a larger Spacing must push a settled pair further apart.
{
  const settledDist = (radius: number) => {
    const sim = new WasmForceSimulation();
    sim.params = { ...sim.params, collisionRadius: radius };
    sim.setup([{ id: "a" }, { id: "b" }], [{ from: "a", to: "b" }]);
    settle(sim);
    const a = sim.nodeById("a")!,
      b = sim.nodeById("b")!;
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const d60 = settledDist(60);
  const d150 = settledDist(150);
  ok(
    "collideRadius (Spacing) reaches the wasm pass",
    d150 > d60 + 30,
    `d(60)=${d60.toFixed(0)} d(150)=${d150.toFixed(0)}`,
  );
}

// Incremental build (replay animation): addNodes re-inits wasm topology.
{
  const sim = new WasmForceSimulation();
  sim.setup([{ id: "a" }], []);
  for (let i = 0; i < 30; i++) sim.tick();
  sim.addNodes(
    [
      { id: "b", x: 100, y: 100 },
      { id: "c", x: -100, y: 50 },
    ],
    [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
    ],
  );
  const ticks = settle(sim, 3000);
  ok(
    "addNodes keeps state finite and settles",
    !sim.running && sim.nodes.every((n) => isFinite(n.x)),
    `${ticks} ticks, ${sim.nodes.length} nodes`,
  );
}

// Physics-slider mapping: a much shorter link distance must actually shrink
// the settled pair distance (guards the param plumbing into simulate()).
{
  const sim = new WasmForceSimulation();
  sim.params = { ...sim.params, linkDistance: 80 };
  sim.setup([{ id: "a" }, { id: "b" }], [{ from: "a", to: "b" }]);
  settle(sim);
  const a = sim.nodeById("a")!,
    b = sim.nodeById("b")!;
  const d = Math.hypot(a.x - b.x, a.y - b.y);
  ok("linkDistance slider reaches the wasm pass", d < 150, `d=${d.toFixed(1)}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) throw new Error(`${fail} wasm physics test(s) failed`);
