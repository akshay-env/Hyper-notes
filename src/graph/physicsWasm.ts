// WASM-accelerated force simulation. The force pass (forceX/Y → link →
// Barnes–Hut manyBody → collide) runs in a WebAssembly module compiled from
// assembly/physics.ts (AssemblyScript — rebuild with `npm run asbuild`);
// everything AROUND the force pass — alpha cooling, drag pinning, flick
// velocities, topology bookkeeping — stays in ForceSimulation, which this
// class extends. Same split as Obsidian's Graph Worker (Reference
// Code/sim.js): the worker owns the lifecycle in JS and hands the WASM only
// (nodes, edges, alpha, params).
//
// ABI (assembly/physics.ts):
//   memory layout   nodes at 0: 5 f32 per node [x, y, vx, vy, degree]
//                   edges at byte 20·numNodes: 3 i32 per edge [src, tgt, bias]
//                   (degree + bias are filled by init; scratch/quadtree after)
//   requiredBytes(n, e)      bytes the module needs — JS grows memory to this
//   init(n, e)               recompute degrees + link bias — topology changes
//   simulate(n, e, alpha, gravity, linkStrength, linkDistance, repulsion,
//            theta=0.9, collideStrength=0.5, collideRadius)   one force pass
//   complete(n, velocityDecay)                                x += vx *= decay
//
// Unlike the module Obsidian ships (collision radius baked at 60.0), the
// radius is a real parameter — the Spacing slider works in WASM mode.
import { ForceSimulation, ALPHA_MIN, ALPHA_DECAY, type NodeInit } from "./physics";
import { wasmBase64 } from "./physicsWasmBinary";

interface WasmExports {
  memory: WebAssembly.Memory;
  requiredBytes: (n: number, e: number) => number;
  init: (n: number, e: number) => void;
  simulate: (
    n: number,
    e: number,
    alpha: number,
    gravity: number,
    linkStrength: number,
    linkDistance: number,
    repulsion: number,
    theta: number,
    collideStrength: number,
    collideRadius: number,
  ) => void;
  complete: (n: number, velocityDecay: number) => void;
}

const NODE_STRIDE = 5; // f32 per node: x, y, vx, vy, degree
const EDGE_STRIDE = 3; // i32 per edge: source, target, bias(f32, init-computed)
// d3 pipeline constants (identical in physics.ts and Obsidian's sim.js).
const THETA = 0.9;
const COLLIDE_STRENGTH = 0.5;

function compile(): WasmExports | null {
  try {
    if (typeof WebAssembly !== "object") return null;
    const bin = atob(wasmBase64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    // Synchronous compile, like sim.js: the module is ~5 KB.
    const module = new WebAssembly.Module(bytes.buffer);
    const instance = new WebAssembly.Instance(module, {
      env: { abort: () => {} },
    });
    return instance.exports as unknown as WasmExports;
  } catch (e) {
    console.warn("WASM physics unavailable — using the JS simulation", e);
    return null;
  }
}

export class WasmForceSimulation extends ForceSimulation {
  private wasm: WasmExports | null;
  private needsInit = true;

  constructor() {
    super();
    this.wasm = compile();
  }

  /** Which force pass runs — for logging and tests. */
  get engine(): "wasm" | "js" {
    return this.wasm ? "wasm" : "js";
  }

  // Topology changes invalidate the WASM-side degrees + link bias.
  setup(inits: NodeInit[], rawEdges: { from: string; to: string }[], initialAlpha = 1): void {
    super.setup(inits, rawEdges, initialAlpha);
    this.needsInit = true;
  }
  addNodes(
    newNodes: { id: string; x: number; y: number }[],
    rawEdges: { from: string; to: string }[],
  ): void {
    super.addNodes(newNodes, rawEdges);
    this.needsInit = true;
  }
  clear(): void {
    super.clear();
    this.needsInit = true;
  }

  tick(): void {
    if (!this.wasm) {
      super.tick(); // no WebAssembly in this environment — reference JS path
      return;
    }

    // d3 lifecycle, identical to ForceSimulation.tick(): pin the dragged node,
    // cool alpha, idle out when settled.
    this.applyDragTarget();
    this.alpha += (this.alphaTarget - this.alpha) * ALPHA_DECAY;
    if (this.alpha < ALPHA_MIN && this.alphaTarget === 0) {
      this.alpha = 0;
      return;
    }

    const nodes = this.nodes;
    const n = nodes.length;
    const e = this.edges.length;
    if (n === 0) return;

    const memory = this.ensureMemory(n, e);
    const f32 = new Float32Array(memory.buffer);

    // Write the full JS state in every tick: O(n) float writes — trivial next
    // to the force pass — and it keeps the WASM coherent with every JS-side
    // mutation (drag echoes, flick velocities, ticks that ran on the JS path).
    for (let i = 0; i < n; i++) {
      const nd = nodes[i];
      const b = NODE_STRIDE * i;
      f32[b] = nd.x;
      f32[b + 1] = nd.y;
      f32[b + 2] = nd.vx;
      f32[b + 3] = nd.vy;
    }

    if (this.needsInit) {
      // Edges live right after the node block (byte offset 20·n).
      const i32 = new Int32Array(memory.buffer, NODE_STRIDE * 4 * n);
      for (let i = 0; i < e; i++) {
        const edge = this.edges[i];
        i32[EDGE_STRIDE * i] = edge.sourceIndex;
        i32[EDGE_STRIDE * i + 1] = edge.targetIndex;
      }
      this.wasm.init(n, e); // recomputes degrees + per-edge bias
      this.needsInit = false;
    }

    const p = this.params;
    this.wasm.simulate(
      n,
      e,
      this.alpha,
      p.gravity,
      p.linkStrength,
      p.linkDistance,
      p.repulsion,
      THETA,
      COLLIDE_STRENGTH,
      p.collisionRadius,
    );
    this.wasm.complete(n, p.damping);

    // Pinning, exactly as sim.js does it: after the integration, overwrite the
    // dragged node's slot with fx/fy and zero its velocity, so the next tick's
    // forces see it at the pin. fx is NaN when free (ForceSimulation's
    // convention) — `fx === fx` is the NaN-safe "is pinned" test.
    for (let i = 0; i < n; i++) {
      const nd = nodes[i];
      if (nd.fx === nd.fx) {
        const b = NODE_STRIDE * i;
        f32[b] = nd.fx;
        f32[b + 1] = nd.fy;
        f32[b + 2] = 0;
        f32[b + 3] = 0;
      }
    }

    // Read the tick's result back into the JS nodes (the render/protocol truth).
    for (let i = 0; i < n; i++) {
      const nd = nodes[i];
      const b = NODE_STRIDE * i;
      nd.x = f32[b];
      nd.y = f32[b + 1];
      nd.vx = f32[b + 2];
      nd.vy = f32[b + 3];
    }
  }

  // Ask the module how much memory this topology needs (the layout knowledge
  // lives in ONE place: assembly/physics.ts) and grow to match.
  private ensureMemory(n: number, e: number): WebAssembly.Memory {
    const memory = this.wasm!.memory;
    const required = this.wasm!.requiredBytes(n, e);
    if (memory.buffer.byteLength < required) {
      memory.grow(Math.ceil((required - memory.buffer.byteLength) / 65536));
    }
    return memory;
  }
}
