// "Graph" section of the Settings panel: labelled sliders for node size, edge
// thickness, labels, and the force-simulation constants, plus a Reset that puts
// every value back to the shipped defaults. Changes apply live — the graph reads
// this store each frame, so dragging a slider re-renders (and re-heats the
// layout for physics changes) while you watch.
import { type Component, For, Show } from "solid-js";
import {
  graphSettings,
  setGraphSetting,
  resetGraphSettings,
  graphSettingsAreDefault,
  GRAPH_DEFAULTS,
  GRAPH_NODE_FIELDS,
  GRAPH_EDGE_FIELDS,
  GRAPH_LABEL_FIELDS,
  GRAPH_FOCUS_FIELDS,
  GRAPH_PHYSICS_FIELDS,
  type GraphSettingField,
  type GraphSettings,
} from "../../state/graphSettings";

// One slider row: name + live value on top, track below, hint underneath.
// Double-clicking the row's value resets just that field.
const SliderRow: Component<{ field: GraphSettingField }> = (props) => {
  const f = () => props.field;
  const value = () => graphSettings()[f().key] as number;
  const isDefault = () => value() === GRAPH_DEFAULTS[f().key];
  // Trailing zeros look wrong on integer-ish settings; show what the step implies.
  const decimals = () => (String(f().step).split(".")[1]?.length ?? 0);
  const shown = () => value().toFixed(decimals());

  return (
    <div class="gslider">
      <div class="gslider__head">
        <span class="gslider__label">{f().label}</span>
        <button
          class="gslider__value"
          classList={{ "is-modified": !isDefault() }}
          title={isDefault() ? "Default" : "Double-click to reset this one"}
          onDblClick={() => setGraphSetting(f().key, GRAPH_DEFAULTS[f().key])}
        >
          {shown()}
          {f().unit ?? ""}
        </button>
      </div>
      <input
        class="gslider__track"
        type="range"
        min={f().min}
        max={f().max}
        step={f().step}
        value={value()}
        onInput={(e) => setGraphSetting(f().key, Number(e.currentTarget.value) as never)}
      />
      <span class="gslider__hint">{f().hint}</span>
    </div>
  );
};

const Group: Component<{ title: string; fields: GraphSettingField[] }> = (props) => (
  <div class="gslider-group">
    <div class="gslider-group__title">{props.title}</div>
    <For each={props.fields}>{(f) => <SliderRow field={f} />}</For>
  </div>
);

const GraphSettingsSection: Component = () => {
  const toggleLabels = () =>
    setGraphSetting("showLabels", !graphSettings().showLabels as GraphSettings["showLabels"]);

  return (
    <>
      <div class="settings-section-row">
        <div class="settings-section-label">Graph</div>
        <button
          class="settings-reset"
          disabled={graphSettingsAreDefault()}
          onClick={resetGraphSettings}
          title="Restore every graph setting to its default"
        >
          ↺ Reset to defaults
        </button>
      </div>

      <Group title="Nodes" fields={GRAPH_NODE_FIELDS} />

      <Group title="Connections" fields={GRAPH_EDGE_FIELDS} />

      <div class="gslider-group">
        <div class="gslider-group__title">Labels &amp; focus</div>
        <div class="gslider">
          <div class="gslider__head">
            <span class="gslider__label">Show note titles</span>
            <button
              class="gtoggle"
              classList={{ "is-on": graphSettings().showLabels }}
              role="switch"
              aria-checked={graphSettings().showLabels}
              onClick={toggleLabels}
            >
              <span class="gtoggle__knob" />
            </button>
          </div>
          <span class="gslider__hint">Draw each note's name under its dot</span>
        </div>
        <Show when={graphSettings().showLabels}>
          <For each={GRAPH_LABEL_FIELDS}>{(f) => <SliderRow field={f} />}</For>
        </Show>
        <For each={GRAPH_FOCUS_FIELDS}>{(f) => <SliderRow field={f} />}</For>
      </div>

      <Group title="Physics" fields={GRAPH_PHYSICS_FIELDS} />
    </>
  );
};

export default GraphSettingsSection;
