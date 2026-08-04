// A thin drag strip that sits on a dock's inner edge and resizes it. `side`
// "left" resizes the sidebar (drag right = wider); "side" "right" resizes the
// right panel (drag left = wider). While dragging we flip the global `resizing`
// flag so the docks drop their width transition and track the pointer exactly;
// double-click resets the dock to its default width. The width is PERSISTED once,
// when the drag ends — never per pointermove (see setSidebarWidth in state/ui.ts).
import { type Component, Show } from "solid-js";
import {
  sidebarWidth,
  setSidebarWidth,
  rightPanelWidth,
  setRightPanelWidth,
  resetSidebarWidth,
  resetRightPanelWidth,
  setResizing,
} from "../../state/ui";

const ResizeHandle: Component<{ side: "left" | "right"; visible: boolean }> = (props) => {
  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    // Bound once, not re-read per event: `up` runs after the pointer is gone and
    // must still know which dock this drag belonged to.
    const left = props.side === "left";
    const setWidth = left ? setSidebarWidth : setRightPanelWidth;
    const width = left ? sidebarWidth : rightPanelWidth;
    const startW = width();
    setResizing(true);

    const move = (ev: PointerEvent) => {
      // A drag can lose its release: alt-tabbing away mid-drag (or an OS window
      // stealing the button-up) leaves no pointerup to hear, and the next move
      // arrives with nothing held. Ending the drag here is what stops it silently
      // resuming under an unpressed pointer — and, since the write now happens
      // only on teardown, what stops the chosen width from being dropped.
      if (ev.buttons === 0) {
        up();
        return;
      }
      const dx = ev.clientX - startX;
      // persist:false — see setSidebarWidth in state/ui.ts. The signal still moves
      // every frame; only the synchronous localStorage write is deferred to `up`.
      setWidth(left ? startW + dx : startW - dx, false);
    };
    const up = () => {
      setResizing(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      // The drag's one and only write. Feeding the SIGNAL back through the setter
      // (rather than recomputing from the last dx) persists what the dock actually
      // ended up at: the clamped value, never a pointer position that ran past the
      // min/max and would come back as a different width next session.
      setWidth(width());
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    // pointerup is not guaranteed — a cancelled pointer (touch turned into a
    // browser gesture, pen leaving range) sends pointercancel and nothing else.
    window.addEventListener("pointercancel", up);
  };

  const onDblClick = () =>
    props.side === "left" ? resetSidebarWidth() : resetRightPanelWidth();

  return (
    <Show when={props.visible}>
      {/* The side modifier is not cosmetic: the handle box straddles the seam, but the
          divider it highlights lives on ONE side of it (the sidebar's border-right, the
          right panel's border-left), so CSS has to know which way to inset the bar to
          land on it. See .resize-handle--left/--right in chrome.css. */}
      <div
        class={`resize-handle resize-handle--${props.side}`}
        role="separator"
        aria-orientation="vertical"
        title="Drag to resize · double-click to reset"
        onPointerDown={onPointerDown}
        onDblClick={onDblClick}
      >
        <span class="resize-handle__bar" />
      </div>
    </Show>
  );
};

export default ResizeHandle;
