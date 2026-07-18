// The tab strip. Tabs are absolutely positioned inside a relative rail and placed
// by translateX, which lets ONE layout function serve two features at once:
//
//  • Fit (50–100 tabs, no scrollbar): the layout shrinks the per-tab slot to fill
//    the rail; past the point where even a minimal tab won't fit, tabs OVERLAP in a
//    left-to-right cascade (later tabs on top) so every tab's left edge — where its
//    LABEL starts — stays exposed, and a hovered/active tab lifts to show in full.
//    Labels are what survive the squeeze at every size: a strip of identical ×'s can
//    be closed but not navigated. The + button is pinned just inside the rail's right
//    edge, so it can never be pushed into the window controls.
//
//  • Drag-to-reorder: the dragged tab follows the pointer on X only (clamped to the
//    rail); the others animate to their new slots via a transform transition (FLIP-
//    like), and the array is committed once on drop (reorderTabs).
import { type Component, For, Show, createSignal, createMemo, onMount, onCleanup } from "solid-js";
import {
  openTabs,
  activeTabIndex,
  selectTab,
  closeTab,
  isBlankTab,
  newTab,
  reorderTabs,
} from "../state/ui";

// Layout constants (px). NAT = a tab's natural/max width; below LABEL_MIN there's no
// room for the label AND the ×, so the × drops to hover/active-only and the label
// keeps the space; MIN_FIT is the tightest a non-overlapping tab gets before the
// layout switches to the overlap cascade; OVERLAP_W is the fixed width each tab
// keeps while overlapping; PLUS_W is the +-button column.
const NAT = 180;
const LABEL_MIN = 46;
const MIN_FIT = 28;
const OVERLAP_W = 44;
const PLUS_W = 34;
const DRAG_THRESH = 4; // px of travel before a press becomes a drag

interface Layout {
  n: number;
  avail: number;
  overlap: boolean;
  compact: boolean; // label hidden, × always shown
  tabW: number;
  unit: number; // horizontal step between adjacent tab slots
  xAt: (pos: number) => number;
  plusX: number;
}

function computeLayout(n: number, w: number): Layout {
  const avail = Math.max(0, w - PLUS_W);
  if (n === 0) return { n, avail, overlap: false, compact: false, tabW: NAT, unit: NAT, xAt: () => 0, plusX: 0 };
  if (n * NAT <= avail) {
    // Roomy: natural width, left-packed (tabs don't stretch to fill).
    return { n, avail, overlap: false, compact: false, tabW: NAT, unit: NAT, xAt: (p) => p * NAT, plusX: n * NAT };
  }
  if (n * MIN_FIT <= avail) {
    // Shrink each tab to fill the rail exactly. Adjacent (no overlap).
    const slot = avail / n;
    return { n, avail, overlap: false, compact: slot < LABEL_MIN, tabW: slot, unit: slot, xAt: (p) => p * slot, plusX: avail };
  }
  // Overlap cascade: fixed-width tabs stepped across the rail.
  const step = n > 1 ? (avail - OVERLAP_W) / (n - 1) : 0;
  return { n, avail, overlap: true, compact: true, tabW: OVERLAP_W, unit: step, xAt: (p) => p * step, plusX: avail };
}

// [0..n) with element `from` moved to index `to`.
function movedOrder(n: number, from: number, to: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  const [m] = a.splice(from, 1);
  a.splice(to, 0, m);
  return a;
}

const TabStrip: Component = () => {
  let rail: HTMLDivElement | undefined;
  const [railW, setRailW] = createSignal(0);
  // Live drag: which array index is held, and its current left offset in px.
  const [drag, setDrag] = createSignal<{ from: number; x: number } | null>(null);

  const layout = createMemo(() => computeLayout(openTabs().length, railW()));

  // Display order while dragging: the held tab is previewed at its target index so
  // the rest slide aside live. At rest it's the identity order.
  const order = createMemo(() => {
    const d = drag();
    const L = layout();
    if (!d) return null;
    const target = Math.max(0, Math.min(L.n - 1, Math.round(d.x / (L.unit || 1))));
    return { arr: movedOrder(L.n, d.from, target), target };
  });

  const posOf = (i: number): number => {
    const o = order();
    return o ? o.arr.indexOf(i) : i;
  };
  const xOf = (i: number): number => {
    const d = drag();
    if (d && i === d.from) return d.x;
    return layout().xAt(posOf(i));
  };
  const zOf = (i: number, active: boolean, hovered: boolean): number => {
    const d = drag();
    if (d && i === d.from) return 10000;
    if (hovered) return 9000;
    if (active) return 8000;
    // Later tabs on top: that leaves each tab's LEFT edge exposed, which is where its
    // label starts, so the cascade reads as a list of names rather than of ×'s.
    return layout().overlap ? i : 1;
  };

  const [hovered, setHovered] = createSignal(-1);

  onMount(() => {
    if (!rail) return;
    const ro = new ResizeObserver(() => setRailW(rail!.clientWidth));
    ro.observe(rail);
    setRailW(rail.clientWidth);
    onCleanup(() => ro.disconnect());
  });

  // ── Drag plumbing ────────────────────────────────────────────────────────────
  let pressFrom = -1;
  let pressStartX = 0;
  let pressBaseX = 0;
  let dragging = false;
  let didDrag = false;

  const onMove = (e: PointerEvent) => {
    if (pressFrom < 0) return;
    const dx = e.clientX - pressStartX;
    if (!dragging && Math.abs(dx) < DRAG_THRESH) return;
    dragging = true;
    didDrag = true;
    const L = layout();
    const x = Math.max(0, Math.min(L.avail - L.tabW, pressBaseX + dx));
    setDrag({ from: pressFrom, x });
  };

  const onUp = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    const d = drag();
    if (d) {
      const L = layout();
      const target = Math.max(0, Math.min(L.n - 1, Math.round(d.x / (L.unit || 1))));
      if (target !== d.from) reorderTabs(d.from, target);
    }
    setDrag(null);
    pressFrom = -1;
    dragging = false;
    // Let the click that follows this pointerup through only if we didn't drag.
    setTimeout(() => (didDrag = false), 0);
  };

  const onTabPointerDown = (e: PointerEvent, i: number) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest(".tab__close")) return; // let × do its thing
    if (openTabs().length <= 1) return; // nothing to reorder
    pressFrom = i;
    pressStartX = e.clientX;
    pressBaseX = layout().xAt(posOf(i));
    dragging = false;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div class="topbar__tabs" classList={{ "is-overlap": layout().overlap }} ref={rail}>
      <For each={openTabs()}>
        {(tab, i) => {
          const active = () => i() === activeTabIndex();
          const isHover = () => hovered() === i();
          const closable = () => !(openTabs().length === 1 && isBlankTab(tab));
          const held = () => drag()?.from === i();
          return (
            <div
              class="tab"
              classList={{
                active: active(),
                "tab--compact": layout().compact,
                "tab--overlap": layout().overlap,
                "tab--held": held(),
              }}
              style={{
                width: `${layout().tabW}px`,
                transform: `translateX(${xOf(i())}px)`,
                "z-index": zOf(i(), active(), isHover()),
                transition: held() ? "none" : undefined,
                // In the cascade a tab is covered by its right-hand neighbour, so only
                // `unit` px of it actually show. Publish that so the label can stop at
                // the seam instead of running underneath the next tab (CSS can't know
                // the step — it's computed from the rail width).
                ...(layout().overlap
                  ? { "--tab-exposed": `${Math.max(0, layout().unit)}px` }
                  : null),
              }}
              title={tab.name || "New tab"}
              onPointerDown={(e) => onTabPointerDown(e, i())}
              onPointerEnter={() => setHovered(i())}
              onPointerLeave={() => setHovered((h) => (h === i() ? -1 : h))}
              onClick={() => {
                if (didDrag) return; // this click is the tail of a drag — ignore
                selectTab(i());
              }}
            >
              <span class="tab__label">{tab.name || "New tab"}</span>
              <Show when={closable()}>
                <button
                  class="tab__close"
                  title="Close tab"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(i());
                  }}
                >
                  ×
                </button>
              </Show>
            </div>
          );
        }}
      </For>
      <button
        class="tab-plus"
        style={{ transform: `translateX(${Math.min(layout().plusX, Math.max(0, railW() - PLUS_W))}px)` }}
        onClick={() => newTab()}
        title="New tab"
      >
        +
      </button>
    </div>
  );
};

export default TabStrip;
