// A thin drag strip that sits on a dock's inner edge and resizes it. `side`
// "left" resizes the sidebar (drag right = wider); "side" "right" resizes the
// right panel (drag left = wider). While dragging we flip the global `resizing`
// flag so the docks drop their width transition and track the pointer exactly;
// double-click resets the dock to its default width.
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
    const startW = props.side === "left" ? sidebarWidth() : rightPanelWidth();
    setResizing(true);

    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const w = props.side === "left" ? startW + dx : startW - dx;
      (props.side === "left" ? setSidebarWidth : setRightPanelWidth)(w);
    };
    const up = () => {
      setResizing(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const onDblClick = () =>
    props.side === "left" ? resetSidebarWidth() : resetRightPanelWidth();

  return (
    <Show when={props.visible}>
      <div
        class="resize-handle"
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
