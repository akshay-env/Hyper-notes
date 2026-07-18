// Panel toggle (SidebarToggleButton.qml): outline icon always shown, the "filled"
// overlay fades in when the panel is open. Used for BOTH side panels — the right
// variant mirrors the same icon horizontally so the highlight sits on the right
// column, keeping an identical design and size on both sides.
import type { Component } from "solid-js";

const SidebarToggleButton: Component<{
  open: boolean;
  onClick: () => void;
  side?: "left" | "right";
  title?: string;
}> = (props) => (
  <button
    class="sidebar-toggle"
    classList={{ "sidebar-toggle--right": props.side === "right" }}
    title={props.title ?? "Toggle sidebar"}
    onClick={props.onClick}
  >
    <span class="sidebar-toggle__icon">
      <img src="/icons/sidebar_toggle_outline.svg" alt="" draggable={false} />
      <img
        class="sidebar-toggle__filled"
        src="/icons/sidebar_toggle_filled.svg"
        alt=""
        draggable={false}
        style={{ opacity: props.open ? 1 : 0 }}
      />
    </span>
  </button>
);

export default SidebarToggleButton;
