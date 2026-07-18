// Shared 28x28 icon button (IconButton.qml): transparent → hover wash, optional
// active (accent-soft) state for toggles like the graph view.
import type { Component, JSX } from "solid-js";

const IconButton: Component<{
  children: JSX.Element;
  title?: string;
  active?: boolean;
  onClick?: () => void;
}> = (props) => (
  <button
    class={`icon-btn ${props.active ? "active" : ""}`}
    title={props.title}
    onClick={props.onClick}
  >
    {props.children}
  </button>
);

export default IconButton;
