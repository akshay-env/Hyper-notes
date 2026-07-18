// Obsidian-style inline note title: a block widget pinned above the first line that
// shows the note's FILENAME (never stored in the .md body — so it can't duplicate an
// H1, go stale on rename, or leak into the Outline / word count). It's editable in
// place; committing renames the file. It lives inside .cm-content, so it shares the
// body's readable column exactly and scrolls away with the document (it is not a
// sticky header). The rename handler is injected (not imported) to keep this module
// free of a state/ui import cycle.
import { EditorView, WidgetType, Decoration, type DecorationSet } from "@codemirror/view";
import { StateField, StateEffect, type Extension } from "@codemirror/state";

// Update the title without rebuilding the whole state (the editor normally rebuilds
// per note, but a same-note rename can push the new name through this).
export const setNoteTitle = StateEffect.define<string>();

class TitleWidget extends WidgetType {
  constructor(
    readonly title: string,
    readonly onRename: (name: string) => boolean,
  ) {
    super();
  }
  eq(o: TitleWidget) {
    return o.title === this.title && o.onRename === this.onRename;
  }
  toDOM() {
    // A real <input> — not a contenteditable — because CM6 owns the .cm-content
    // editing host and its focus/selection management swallows a nested editable's
    // blur/commit. An <input> is an independent focus target with reliable
    // keydown/blur semantics, and CM's contenteditable="false" on the widget root is
    // simply ignored by a form control.
    const el = document.createElement("input");
    el.className = "cm-note-title";
    el.type = "text";
    el.spellcheck = false;
    el.setAttribute("aria-label", "Note title");
    el.placeholder = "Untitled";
    el.value = this.title;
    let done = false; // Enter and the ensuing blur must commit only once
    const commit = () => {
      if (done) return;
      done = true;
      const next = el.value.replace(/\s+/g, " ").trim();
      if (next && next !== this.title) {
        if (!this.onRename(next)) el.value = this.title; // rejected → restore
      } else {
        el.value = this.title; // normalise stray whitespace / empty
      }
    };
    el.addEventListener("keydown", (e) => {
      // Keep title keystrokes out of the editor's keymap and the app's global keys.
      e.stopPropagation();
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
        el.blur();
      } else if (e.key === "Escape") {
        e.preventDefault();
        el.value = this.title;
        done = true;
        el.blur();
      }
    });
    // Focus the input on click instead of letting CM place a doc selection there.
    el.addEventListener("mousedown", (e) => e.stopPropagation());
    el.addEventListener("blur", commit);
    return el;
  }
  // The widget owns its own editing surface — CM must not treat clicks/keys in it as
  // document interaction.
  ignoreEvent() {
    return true;
  }
}

function build(title: string, onRename: (name: string) => boolean): DecorationSet {
  if (title === "") return Decoration.none; // blank / graph tab → no title
  return Decoration.set([
    Decoration.widget({ widget: new TitleWidget(title, onRename), side: -1, block: true }).range(0),
  ]);
}

// Extension factory: the initial title + rename handler are captured in a closure so
// the widget can act without importing app state.
export function noteTitle(title: string, onRename: (name: string) => boolean): Extension {
  return StateField.define<DecorationSet>({
    create() {
      return build(title, onRename);
    },
    update(deco, tr) {
      for (const e of tr.effects) if (e.is(setNoteTitle)) return build(e.value, onRename);
      return deco.map(tr.changes);
    },
    provide: (f) => EditorView.decorations.from(f),
  });
}
