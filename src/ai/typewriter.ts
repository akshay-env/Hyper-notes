// Reveals streamed AI text into the editor as smooth typing instead of dropping
// each network chunk in whole. Incoming text is buffered and drained on rAF at a
// user-set characters-per-second rate; when the network runs far ahead of the
// typing, the drain rate eases upward so the answer never lags minutes behind, then
// settles back. Freshly typed characters carry a short fade-in decoration.
//
// Scrolling is "sticky", the way a chat transcript behaves: the view follows the
// answer only while the reader is still parked at the tail, and the moment they
// scroll up to re-read something we leave their scroll position alone until they
// come back down. See atTail() for why that is measured rather than listened for.
//
// The pacing helper (charsThisFrame) is shared with the Settings live preview so the
// preview types at exactly the rate the real answer will.
import { EditorView, Decoration, type DecorationSet } from "@codemirror/view";
import { StateField, StateEffect } from "@codemirror/state";

const FADE_MS = 260; // how long a just-typed span keeps its fade-in decoration

/// How long the scroller must sit still before we ask whether the reader has come
/// back to the tail. This is the whole reason scrolling away works: see watchReader.
const REARM_SETTLE_MS = 180;

// Keys that scroll the note. Pressed in the body, they mean the reader is driving —
// the same signal as a wheel notch (see Typewriter.watchReader).
const NAV_KEYS = new Set(["PageUp", "PageDown", "ArrowUp", "ArrowDown", "Home", "End"]);

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
  // Whether the answer still drags the view along. A LATCH, not a per-frame
  // measurement: see watchReader() for why measuring geometry each frame cannot work.
  private following = true;
  private unwatch: (() => void) | null = null;
  // Pending re-arm check, scheduled once the scroller goes quiet. 0 = none.
  private rearmTimer = 0;

  constructor(
    private view: EditorView,
    insertAt: number,
    private speed: () => number,
  ) {
    this.insertAt = insertAt;
    this.watchReader();
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
    this.dispose();
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.fresh = [];
    // Clearing the fade deliberately carries no scrollIntoView: Stop should leave the
    // reader looking at whatever they were looking at, not jump them to the cut-off
    // point. Guarded because a rebuilt view may no longer carry the field — but the
    // waiter in finish() has to be released either way, so it happens outside.
    if (this.view.state.field(aiFreshField, false))
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
      const follow = this.following;
      const from = this.insertAt;
      const to = from + chunk.length;
      this.insertAt = to;
      this.fresh.push({ from, to, born: now, id: this.uid++ });
      this.view.dispatch({
        changes: { from, insert: chunk },
        // The caret trails the typing only while we're following. Once the reader has
        // scrolled off, dragging their caret along would fight a click they made to
        // put it somewhere, and syncing an off-screen DOM selection is exactly the
        // kind of thing a browser may decide to scroll to. It snaps back to the tail
        // on the first frame after they return.
        selection: follow ? { anchor: to } : undefined,
        effects: setFreshDeco.of(this.buildDeco()),
        scrollIntoView: follow,
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

  // Following is driven by the reader's INPUT, not by geometry sampled each frame.
  //
  // Measuring "is the tail still on screen?" before every insert sounds equivalent and
  // is not, for two reasons that both leave the editor feeling locked:
  //   • A wheel notch is not one jump. Chromium (so WebView2 too) animates it over
  //     several frames at ~12-25px each, and a trackpad delivers finer steps still.
  //     Any tolerance generous enough to survive the caret drifting between frames is
  //     also generous enough that a partly-delivered notch still measures "at the
  //     tail" — so the next insert scrolls straight back and the notch nets to zero.
  //   • Geometry can only be sampled AFTER the fact, so one long frame (GC, a big
  //     live-preview rebuild) that inserts a burst of text pushes the tail off screen
  //     by itself and reads as "the reader left", with no way back.
  //
  // wheel/touchmove/keydown are never synthesised by a programmatic scroll, so they
  // identify the reader unambiguously — no is-this-ours flag to get out of sync.
  // Re-arming is the mirror trick: while we are NOT following we never scroll the view
  // ourselves, so in that state every "scroll" event is by definition the reader's, and
  // it is safe to consult geometry there to notice they have come back to the tail.
  //
  // But "the reader's" is not the same as "the reader has finished". Re-arming
  // straight off the scroll event is what used to make it impossible to scroll away
  // from an answer at all, and it fails for the SAME reason the release path can't be
  // driven by geometry: a wheel notch is not one jump. Chromium animates it over
  // several frames at ~12-25px each, so the first few frames of a ~100px notch have
  // moved less than `slack` and still measure as "at the tail" — we re-arm, the next
  // insert scrolls straight back, and the notch nets to zero. The reader hauls on the
  // wheel and the view refuses to move.
  //
  // So the re-arm check is DEBOUNCED rather than sampled: every scroll event pushes it
  // back, and it only runs once the scroller has been still for REARM_SETTLE_MS. That
  // measures the position the reader actually chose instead of a frame somewhere in
  // the middle of their gesture.
  private watchReader(): void {
    const { scrollDOM, contentDOM } = this.view;
    // Any deliberate scroll gesture hands control over. Direction is not tested: a
    // downward gesture re-arms below once it settles at the tail, so treating every
    // gesture the same costs nothing and keeps this branch-free. Cancelling the
    // pending check matters — a settle armed by the tail end of the PREVIOUS gesture
    // must not fire in the middle of this one.
    const release = () => {
      this.following = false;
      this.cancelRearm();
    };
    const settle = () => {
      // While following, the scrolling is ours and there is nothing to re-arm;
      // scheduling here would churn a timer on every frame of the answer.
      if (this.following) return;
      this.cancelRearm();
      this.rearmTimer = window.setTimeout(() => {
        this.rearmTimer = 0;
        if (!this.following && this.atTail()) this.following = true;
      }, REARM_SETTLE_MS);
    };
    const onKey = (e: KeyboardEvent) => {
      if (NAV_KEYS.has(e.key)) release();
    };

    scrollDOM.addEventListener("wheel", release, { passive: true });
    scrollDOM.addEventListener("touchmove", release, { passive: true });
    scrollDOM.addEventListener("scroll", settle, { passive: true });
    contentDOM.addEventListener("keydown", onKey);
    this.unwatch = () => {
      this.cancelRearm();
      scrollDOM.removeEventListener("wheel", release);
      scrollDOM.removeEventListener("touchmove", release);
      scrollDOM.removeEventListener("scroll", settle);
      contentDOM.removeEventListener("keydown", onKey);
    };
  }

  private cancelRearm(): void {
    if (this.rearmTimer) clearTimeout(this.rearmTimer);
    this.rearmTimer = 0;
  }

  // Detach the reader listeners. Idempotent, and called on BOTH exits — stop() and the
  // natural end of the stream — because a Typewriter is created per ask and would
  // otherwise leave four listeners on the view for the life of the session.
  dispose(): void {
    this.unwatch?.();
    this.unwatch = null;
  }

  // Is the tail of the answer back on screen? Only ever asked while not following, to
  // decide whether the reader has scrolled back down to it. The slack comes from the
  // view's measured line height — the editor font is user-configurable, so no pixel
  // figure would hold. (Distance-to-bottom of the scroller would be the obvious test
  // and is wrong here: .cm-content carries a 40vh scroll-past-end pad, so the last
  // line sits well above the scroller's own bottom even when fully scrolled.)
  private atTail(): boolean {
    // insertAt is not mapped through edits the user makes mid-stream, so it can outrun
    // a shortened doc; coordsAtPos would throw rather than return null.
    const pos = Math.min(this.insertAt, this.view.state.doc.length);
    const caret = this.view.coordsAtPos(pos);
    if (!caret) return false; // outside CM's rendered viewport — still far away
    const box = this.view.scrollDOM.getBoundingClientRect();
    const slack = this.view.defaultLineHeight * 2;
    return caret.bottom >= box.top && caret.top <= box.bottom + slack;
  }

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
