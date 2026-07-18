// Document outline: the markdown headings of the open note, indented by level.
// Clicking a heading scrolls the editor to that line. Mirrors Outline.qml —
// headings are re-parsed from the live editor doc (falling back to the note's
// source before the editor mounts).
import { type Component, createMemo, For, Show } from "solid-js";
import { editorDoc, scrollEditorToLine } from "../../state/editor";
import { readDoc } from "../../state/documents";
import { activeNotePath } from "../../state/ui";

interface OutlineItem {
  level: number;
  text: string;
  line: number;
}

const Outline: Component = () => {
  const items = createMemo<OutlineItem[]>(() => {
    // Prefer the live editor text; fall back to the stored note before mount.
    const txt = editorDoc() || readDoc(activeNotePath());
    if (!txt) return [];
    const out: OutlineItem[] = [];
    const lines = txt.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^(#{1,6})\s+(.*)$/);
      if (m) {
        const label = m[2].replace(/\s+#*\s*$/, "").trim(); // strip trailing #'s
        if (label.length > 0) out.push({ level: m[1].length, text: label, line: i });
      }
    }
    return out;
  });

  return (
    <div class="outline">
      <Show when={items().length === 0}>
        <div class="outline__empty">No headings</div>
      </Show>
      <For each={items()}>
        {(it) => (
          <div
            class={`outline-row ${it.level <= 1 ? "outline-row--top" : ""}`}
            onClick={() => scrollEditorToLine(it.line)}
          >
            <Show when={it.level <= 1}>
              <span class="outline-tick" />
            </Show>
            <span
              class="outline-row__label"
              style={{ "padding-left": `${10 + (it.level - 1) * 12}px` }}
            >
              {it.text}
            </span>
          </div>
        )}
      </For>
    </div>
  );
};

export default Outline;
