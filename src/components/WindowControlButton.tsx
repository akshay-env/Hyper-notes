// Windows caption button (minimize / maximize / restore / close). Glyphs are
// inline SVG matching the Qt WindowControlButton shapes; hover washes match
// (surface2/elevated; close → danger with white glyph).
import { type Component, Switch, Match } from "solid-js";

type WinType = "minimize" | "maximize" | "restore" | "close";

const Glyph: Component<{ type: WinType }> = (props) => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.1">
    <Switch>
      <Match when={props.type === "minimize"}>
        <line x1="0" y1="5" x2="10" y2="5" />
      </Match>
      <Match when={props.type === "maximize"}>
        <rect x="0.5" y="0.5" width="9" height="9" />
      </Match>
      <Match when={props.type === "restore"}>
        <rect x="2.5" y="0.5" width="7" height="7" />
        <rect x="0.5" y="2.5" width="7" height="7" style={{ fill: "var(--bg)" }} />
      </Match>
      <Match when={props.type === "close"}>
        <line x1="0.7" y1="0.7" x2="9.3" y2="9.3" />
        <line x1="9.3" y1="0.7" x2="0.7" y2="9.3" />
      </Match>
    </Switch>
  </svg>
);

const WindowControlButton: Component<{ type: WinType; onClick?: () => void }> = (props) => (
  <button
    class={`win-btn ${props.type === "close" ? "win-btn--close" : ""}`}
    onClick={props.onClick}
  >
    <Glyph type={props.type} />
  </button>
);

export default WindowControlButton;
