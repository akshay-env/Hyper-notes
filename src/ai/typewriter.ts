// Reveals streamed AI text into the editor as smooth typing instead of dropping
// each network chunk in whole. Incoming text is buffered and drained on rAF at a
// user-set characters-per-second rate; when the network runs far ahead of the
// typing, the drain rate eases upward so the answer never lags minutes behind, then
// settles back. Freshly typed characters carry a short fade-in decoration.
//
// The pacing helper (charsThisFrame) is shared with the Settings live preview so the
// preview types at exactly the rate the real answer will.
import { EditorView, Decoration, type DecorationSet } from "@codemirror/view";
import { StateField, StateEffect } from "@codemirror/state";

const FADE_MS = 260; // how long a just-typed span keeps its fade-in decoration

// Newly typed spans are published as a decoration set through this effect; the field
// holds it and maps it across edits. Kept tiny — the set only ever covers the last
// ~FADE_MS of typing.
const setFreshDeco = StateEffect.define<DecorationSet>();
export const aiFreshField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) if (e.is(setFreshDeco)) deco = e.value;
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// Characters to reveal this frame given the base speed, elapsed time, a fractional
// carry from previous frames, and how much text is still buffered. The catch-up term
// scales the rate up to ~4× as the backlog grows, so a fast network doesn't leave the
// answer crawling — but at steady state (small backlog) it types at exactly `cps`.
export function charsThisFrame(cps: number, dtSeconds: number, carry: number, backlog: number) {
  const catchUp = 1 + Math.min(backlog / 120, 3);
  const produced = carry + Math.max(1, cps) * catchUp * dtSeconds;
  const n = Math.floor(produced);
  return { n, carry: produced - n };
}

interface FreshRange {
  from: number;
  to: number;
  born: number;
  id: number;
}

export class Typewriter {
  private buf = "";
  private insertAt: number;
  private raf = 0;
  private last = 0;
  private carry = 0;
  private fresh: FreshRange[] = [];
  private uid = 0;
  private streamDone = false;
  private stopped = false;
  private onIdle: (() => void) | null = null;

  constructor(
    private view: EditorView,
    insertAt: number,
    private speed: () => number,
  ) {
    this.insertAt = insertAt;
  }

  // Current insertion offset (grows as text is typed) — the caller reads this to
  // place a trailing newline once typing is done.
  get pos(): number {
    return this.insertAt;
  }

  // Queue more streamed text.
  push(text: string): void {
    if (this.stopped || !text) return;
    this.buf += text;
    this.ensureRunning();
  }

  // No more chunks are coming; resolves once the buffer has fully typed out (or
  // immediately if already drained).
  finish(): Promise<void> {
    this.streamDone = true;
    if (this.stopped || (this.buf.length === 0 && this.fresh.length === 0)) return Promise.resolve();
    return new Promise((resolve) => {
      this.onIdle = resolve;
      this.ensureRunning();
    });
  }

  // Abandon the rest (note switched away, or the user hit Stop): drop the buffer and
  // clear any lingering fade decorations.
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.fresh = [];
    if (!this.view.state.field(aiFreshField, false)) return;
    this.view.dispatch({ effects: setFreshDeco.of(Decoration.none) });
    this.onIdle?.();
    this.onIdle = null;
  }

  private ensureRunning(): void {
    if (this.raf || this.stopped) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number): void => {
    this.raf = 0;
    if (this.stopped) return;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;

    // How many characters to reveal this frame.
    let chunk = "";
    if (this.buf.length) {
      const { n, carry } = charsThisFrame(this.speed(), dt, this.carry, this.buf.length);
      this.carry = carry;
      if (n > 0) {
        const take = Math.min(n, this.buf.length);
        chunk = this.buf.slice(0, take);
        this.buf = this.buf.slice(take);
      }
    } else {
      this.carry = 0; // idle — don't bank a burst for when text next arrives
    }

    // Drop fade spans older than FADE_MS; the text stays, only the decoration goes.
    const prevFresh = this.fresh.length;
    this.fresh = this.fresh.filter((r) => now - r.born < FADE_MS);

    if (chunk) {
      const from = this.insertAt;
      const to = from + chunk.length;
      this.insertAt = to;
      this.fresh.push({ from, to, born: now, id: this.uid++ });
      this.view.dispatch({
        changes: { from, insert: chunk },
        selection: { anchor: to },
        effects: setFreshDeco.of(this.buildDeco()),
        scrollIntoView: true,
      });
    } else if (this.fresh.length !== prevFresh) {
      this.view.dispatch({ effects: setFreshDeco.of(this.buildDeco()) });
    }

    if (this.buf.length || this.fresh.length) {
      this.ensureRunning();
    } else if (this.streamDone) {
      this.onIdle?.();
      this.onIdle = null;
    }
  };

  // One mark per fresh range, each with a STABLE id attribute so CM keeps its span
  // (the CSS fade plays once) and adjacent ranges don't merge into one.
  private buildDeco(): DecorationSet {
    if (!this.fresh.length) return Decoration.none;
    return Decoration.set(
      this.fresh.map((r) =>
        Decoration.mark({ class: "cm-ai-fresh", attributes: { "data-ai-fresh": String(r.id) } }).range(r.from, r.to),
      ),
    );
  }
}
