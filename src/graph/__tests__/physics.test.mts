// Regression tests for the d3-exact force simulation (graph/physics.ts).
// Run: npm run test:graph  (or  npx tsx src/graph/__tests__/physics.test.mts)
import { ForceSimulation } from "../physics";

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

console.log("\n— physics (d3-exact) —");

// Linked pair: gravity squeezes the pair slightly under the 250 rest length,
// exactly as in d3/Obsidian with these constants.
{
  const sim = new ForceSimulation();
  sim.setup([{ id: "a" }, { id: "b" }], [{ from: "a", to: "b" }]);
  const ticks = settle(sim);
  const a = sim.nodeById("a")!,
    b = sim.nodeById("b")!;
  const d = Math.hypot(a.x - b.x, a.y - b.y);
  ok("pair rest distance near link length", d > 200 && d < 260, `d=${d.toFixed(1)}`);
  ok("cools to rest", !sim.running, `${ticks} ticks`);
}

// Determinism: same input → identical layout (seeded LCG).
{
  const build = () => {
    const sim = new ForceSimulation();
    const ids = Array.from({ length: 40 }, (_, i) => ({ id: `n${i}` }));
    const edges = Array.from({ length: 39 }, (_, i) => ({ from: `n${i + 1}`, to: `n${(i * 7) % (i + 1)}` }));
    sim.setup(ids, edges);
    settle(sim);
    return sim.nodes.map((n) => `${n.x.toFixed(6)},${n.y.toFixed(6)}`).join(";");
  };
  ok("deterministic layout (two identical runs)", build() === build());
}

// Hub + leaves: leaves roughly equidistant, hub stays central (bias keeps it put).
{
  const sim = new ForceSimulation();
  const ids = [{ id: "hub" }, ...Array.from({ length: 8 }, (_, i) => ({ id: `l${i}` }))];
  sim.setup(ids, ids.slice(1).map((n) => ({ from: "hub", to: n.id })));
  settle(sim);
  const hub = sim.nodeById("hub")!;
  const ds = ids.slice(1).map((n) => {
    const l = sim.nodeById(n.id)!;
    return Math.hypot(l.x - hub.x, l.y - hub.y);
  });
  const min = Math.min(...ds),
    max = Math.max(...ds);
  ok("hub leaves equidistant-ish", max / min < 1.25, `min=${min.toFixed(0)} max=${max.toFixed(0)}`);
  ok("no NaN/exploded nodes", sim.nodes.every((n) => isFinite(n.x) && Math.abs(n.x) < 1e5));
}

// Isolated nodes are held near the origin by the centering force.
{
  const sim = new ForceSimulation();
  sim.setup([{ id: "x" }, { id: "y" }, { id: "z" }], []);
  settle(sim);
  ok(
    "isolated nodes bounded by gravity",
    sim.nodes.every((n) => Math.hypot(n.x, n.y) < 400),
    sim.nodes.map((n) => Math.hypot(n.x, n.y).toFixed(0)).join(" "),
  );
}

// Drag: pinned exactly at the target while held warm; release coasts then cools.
{
  const sim = new ForceSimulation();
  sim.setup([{ id: "a" }, { id: "b" }], [{ from: "a", to: "b" }]);
  settle(sim);
  sim.beginDrag("a");
  for (let i = 0; i < 120; i++) {
    sim.setDragTarget("a", 123, -45);
    sim.tick();
  }
  const a = sim.nodeById("a")!;
  ok("dragged node pinned to cursor", a.x === 123 && a.y === -45);
  ok("sim held warm during drag", sim.running);
  sim.endDrag("a", 40, 0);
  ok("release velocity applied", sim.nodeById("a")!.vx === 40);
  const ticks = settle(sim);
  ok("re-cools after release", !sim.running, `${ticks} ticks`);
}

// Cached-layout restore: explicit positions are honoured and a low initial
// alpha settles almost immediately.
{
  const sim = new ForceSimulation();
  sim.setup(
    [
      { id: "a", x: 10, y: 20 },
      { id: "b", x: 260, y: 20 },
    ],
    [{ from: "a", to: "b" }],
    0.3,
  );
  const a0 = sim.nodeById("a")!;
  ok("cached positions honoured at t0", a0.x === 10 && a0.y === 20);
  const ticks = settle(sim);
  ok("low-alpha restore settles fast", ticks < 260, `${ticks} ticks`);
}

// Setup preserves surviving nodes' positions across a re-setup (vault edit).
{
  const sim = new ForceSimulation();
  sim.setup([{ id: "a" }, { id: "b" }], [{ from: "a", to: "b" }]);
  settle(sim);
  const before = { ...sim.nodeById("a")! };
  sim.setup([{ id: "a" }, { id: "b" }, { id: "c" }], [{ from: "a", to: "b" }]);
  const after = sim.nodeById("a")!;
  ok("surviving node keeps position on re-setup", after.x === before.x && after.y === before.y);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) throw new Error(`${fail} physics test(s) failed`);
