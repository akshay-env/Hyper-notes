// Frontmatter → structured Properties panel (Obsidian's Properties view). The
// leading YAML block is replaced by a block widget of typed key/value rows —
// text, number, checkbox, date, list — that write back to the document on
// commit (blur/Enter/toggle). Source mode shows the raw YAML instead (this
// extension only runs in live/reading modes).
import { StateField, type EditorState } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, WidgetType } from "@codemirror/view";

interface Frontmatter {
  from: number; // start of the opening ---
  to: number; // end of the closing --- line
  yaml: string; // text between the delimiters (no --- lines)
}

export interface PropEntry {
  key: string;
  value: string; // canonical string form
  type: "text" | "number" | "checkbox" | "date" | "list";
  items: string[]; // for list type
}

function findFrontmatter(state: EditorState): Frontmatter | null {
  const doc = state.doc;
  if (doc.lines < 2 || doc.line(1).text.trim() !== "---") return null;
  for (let n = 2; n <= doc.lines; n++) {
    if (doc.line(n).text.trim() === "---") {
      return {
        from: doc.line(1).from,
        to: doc.line(n).to,
        yaml: doc.sliceString(doc.line(1).to + 1, doc.line(n).from > doc.line(1).to ? doc.line(n).from - 1 : doc.line(1).to),
      };
    }
  }
  return null;
}

// ── Tiny YAML subset parser (flat keys; inline + dash lists) ─────────────────
export function parseYaml(yaml: string): PropEntry[] {
  const entries: PropEntry[] = [];
  const lines = yaml.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = /^([A-Za-z0-9_ .\/-]+):\s*(.*)$/.exec(lines[i]);
    if (!m) continue;
    const key = m[1].trim();
    let value = m[2].trim();

    // Block list:  key:\n  - a\n  - b
    if (value === "" && i + 1 < lines.length && /^\s+-\s+/.test(lines[i + 1])) {
      const items: string[] = [];
      while (i + 1 < lines.length && /^\s+-\s+/.test(lines[i + 1])) {
        items.push(lines[++i].replace(/^\s+-\s+/, "").trim());
      }
      entries.push({ key, value: items.join(", "), type: "list", items });
      continue;
    }
    // Inline list: [a, b]
    if (/^\[.*\]$/.test(value)) {
      const items = value
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
      entries.push({ key, value: items.join(", "), type: "list", items });
      continue;
    }
    value = value.replace(/^["']|["']$/g, "");
    let type: PropEntry["type"] = "text";
    if (/^(true|false)$/i.test(value)) type = "checkbox";
    else if (/^\d{4}-\d{2}-\d{2}$/.test(value)) type = "date";
    else if (value !== "" && !isNaN(Number(value))) type = "number";
    entries.push({ key, value, type, items: [] });
  }
  return entries;
}

export function serializeYaml(entries: PropEntry[]): string {
  return entries
    .map((e) => {
      if (e.type === "list") {
        const items = e.value
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        return `${e.key}: [${items.join(", ")}]`;
      }
      return `${e.key}: ${e.value}`;
    })
    .join("\n");
}

// ── Widget ────────────────────────────────────────────────────────────────────
class PropertiesWidget extends WidgetType {
  constructor(readonly yaml: string) {
    super();
  }
  eq(o: PropertiesWidget) {
    return o.yaml === this.yaml;
  }
  toDOM(view: EditorView) {
    const entries = parseYaml(this.yaml);
    const readOnly = view.state.readOnly;
    const root = document.createElement("div");
    root.className = "cm-properties";

    const head = document.createElement("div");
    head.className = "cm-properties__head";
    head.textContent = "Properties";
    root.appendChild(head);

    const commit = (next: PropEntry[]) => {
      const fm = findFrontmatter(view.state);
      if (!fm) return;
      const yaml = serializeYaml(next);
      view.dispatch({
        changes: { from: fm.from, to: fm.to, insert: `---\n${yaml}\n---` },
      });
    };

    const rows = document.createElement("div");
    rows.className = "cm-properties__rows";
    entries.forEach((entry, idx) => {
      const row = document.createElement("div");
      row.className = "cm-properties__row";

      const key = document.createElement("input");
      key.className = "cm-properties__key";
      key.value = entry.key;
      key.disabled = readOnly;
      key.addEventListener("change", () => {
        const next = entries.map((e, i) => (i === idx ? { ...e, key: key.value.trim() || e.key } : e));
        commit(next);
      });
      row.appendChild(key);

      let control: HTMLInputElement;
      if (entry.type === "checkbox") {
        control = document.createElement("input");
        control.type = "checkbox";
        control.checked = /^true$/i.test(entry.value);
        control.addEventListener("change", () => {
          commit(entries.map((e, i) => (i === idx ? { ...e, value: control.checked ? "true" : "false" } : e)));
        });
      } else {
        control = document.createElement("input");
        control.type = entry.type === "number" ? "number" : entry.type === "date" ? "date" : "text";
        control.value = entry.value;
        control.addEventListener("change", () => {
          commit(entries.map((e, i) => (i === idx ? { ...e, value: control.value } : e)));
        });
        control.addEventListener("keydown", (e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        });
      }
      control.classList.add("cm-properties__value");
      control.disabled = readOnly;
      if (entry.type === "list") control.placeholder = "comma, separated, values";
      row.appendChild(control);

      if (!readOnly) {
        const del = document.createElement("button");
        del.className = "cm-properties__del";
        del.textContent = "×";
        del.title = "Remove property";
        del.addEventListener("click", () => commit(entries.filter((_, i) => i !== idx)));
        row.appendChild(del);
      }
      rows.appendChild(row);
    });
    root.appendChild(rows);

    if (!readOnly) {
      const add = document.createElement("button");
      add.className = "cm-properties__add";
      add.textContent = "+ Add property";
      add.addEventListener("click", () => {
        let n = 1;
        const used = new Set(entries.map((e) => e.key));
        while (used.has(`property-${n}`)) n++;
        commit([...entries, { key: `property-${n}`, value: "", type: "text", items: [] }]);
      });
      root.appendChild(add);
    }
    return root;
  }
  // Default ignoreEvent (true): the editor leaves the panel's inputs alone.
}

function buildProperties(state: EditorState): DecorationSet {
  const fm = findFrontmatter(state);
  if (!fm) return Decoration.none;
  return Decoration.set([
    Decoration.replace({ widget: new PropertiesWidget(fm.yaml), block: true }).range(fm.from, fm.to),
  ]);
}

const propertiesField = StateField.define<DecorationSet>({
  create: buildProperties,
  update(deco, tr) {
    if (tr.docChanged) return buildProperties(tr.state);
    return deco.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

export const propertiesPanel = [propertiesField];
