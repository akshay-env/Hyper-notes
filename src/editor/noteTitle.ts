// Obsidian-style inline note title: a block widget pinned above the first line that
// shows the note's FILENAME (never stored in the .md body — so it can't duplicate an
// H1, go stale on rename, or leak into the Outline / word count). It's editable in
// place; committing renames the file. It lives inside .cm-content, so it shares the
// body's readable column exactly and scrolls away with the document (it is not a
// sticky header). The rename handler is injected (not imported) to keep this module
// free of a state/ui import cycle.
//
// The title and the body are two SEPARATE focus targets (a real <input> vs CM's
// contenteditable), so the browser hands us nothing for free in either direction:
// blurring the input drops focus on <body> and the caret simply disappears, and no
// key in the body can reach an <input> that CM refuses to own. Both crossings are
// therefore driven explicitly — Enter/Escape downward from inside the widget,
// titleNavKeymap upward from inside the document.
import {
  EditorView,
  WidgetType,
  Decoration,
  BlockType,
  type DecorationSet,
  type Command,
  type KeyBinding,
} from "@codemirror/view";
import { StateField, StateEffect, EditorSelection, type Extension } from "@codemirror/state";

// Update the title without rebuilding the whole state (the editor normally rebuilds
// per note, but a same-note rename can push the new name through this).
export const setNoteTitle = StateEffect.define<string>();

// The first offset the user can actually type at.
//
// NOT always 0. A note with YAML frontmatter has that whole block REPLACED by the
// properties panel — a block widget starting at offset 0 (properties.ts) — and it is
// live in both "live" and "reading" modes. Parking the caret at 0 would put it inside
// that widget, where the first character typed lands in front of the opening "---"
// and silently destroys the frontmatter. Step over a leading widget block to the
// first real line instead.
function bodyStart(view: EditorView): number {
  const doc = view.state.doc;
  const block = view.lineBlockAt(0);
  // BlockInfo.type is a BlockType *or* an array of the blocks making up the line when
  // several decorations share it — and here it always is the array: this module's own
  // title widget sits at offset 0 too. Reading it as a plain BlockType silently finds
  // no widget and hands back 0, which is the very bug this function exists to avoid.
  const parts = Array.isArray(block.type) ? block.type : [block];
  // Only a REPLACING widget swallows document text; a zero-length one (the title
  // itself) is drawn beside the line and leaves position 0 perfectly typable.
  let end = -1;
  for (const p of parts) {
    if (p.type === BlockType.WidgetRange && p.length > 0) end = Math.max(end, p.to);
  }
  if (end < 0) return 0;
  return doc.lineAt(Math.min(end + 1, doc.length)).from;
}

// Hand focus from the title down into the body. The dispatch has to happen BEFORE
// the focus call: view.focus() is what writes state.selection back into the DOM, so
// focusing first would land the caret wherever the DOM selection last was.
function focusBody(view: EditorView): void {
  view.dispatch({ selection: EditorSelection.cursor(bodyStart(view)), scrollIntoView: true });
  view.focus();
}

// Hand focus from the body up into the title, caret parked after the last character
// so the user can carry on typing the name rather than overwriting it. Returns false
// when there is no widget to focus — an untitled tab (build() renders nothing for
// title === "") or a first line scrolled out of the rendered viewport — which is
// what lets the key fall through to its normal editing command.
function focusTitle(view: EditorView): boolean {
  const el = view.contentDOM.querySelector<HTMLInputElement>(".cm-note-title");
  if (!el) return false;
  el.focus();
  const end = el.value.length;
  el.setSelectionRange(end, end);
  return true;
}

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
  // CM6 passes the EditorView into toDOM; taking it here is how the widget reaches
  // the editor to move focus/caret without importing app state.
  toDOM(view: EditorView) {
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
    // Arm the next commit every time the field is entered. Without this the latch
    // set by a first Enter/Escape would survive for the lifetime of the widget, and
    // coming BACK to the title (Backspace from the body) would silently edit a name
    // that can never be saved.
    el.addEventListener("focus", () => {
      done = false;
    });
    el.addEventListener("keydown", (e) => {
      // Keep title keystrokes out of the editor's keymap and the app's global keys.
      e.stopPropagation();
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
        // Not el.blur(): blur alone only un-focuses the input, leaving focus on
        // <body> with no caret anywhere. Move it into the document instead.
        focusBody(view);
        // Re-arm AFTER the handover, not via the focus listener alone. In reading
        // mode contentDOM is contenteditable="false" and CM never gives it a
        // tabIndex, so focus() is a no-op: focus never leaves the input, no blur
        // and no second focus ever fire, and the latch would stay set — making
        // every later Enter in this field silently drop the rename. Safe to do
        // here because HTMLElement.focus() dispatches blur synchronously, so the
        // blur→commit above has already run (and no-opped) by this line.
        done = false;
      } else if (e.key === "Escape") {
        e.preventDefault();
        el.value = this.title;
        done = true;
        focusBody(view);
        done = false;
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

// Backspace on the first typable character of the note: step back INTO the title
// rather than doing nothing. Deliberately narrow — one caret, no selection, exactly
// at bodyStart — because every other Backspace in the note must still delete.
// bodyStart, not 0: on a note with frontmatter the caret can never BE at 0 (the
// properties widget owns that offset), so testing 0 would make this dead code on
// exactly the notes the app generates with properties.
const titleFromDocStart: Command = (view) => {
  const sel = view.state.selection;
  if (sel.ranges.length !== 1 || !sel.main.empty) return false;
  if (sel.main.head !== bodyStart(view)) return false;
  return focusTitle(view);
};

// ArrowUp with nowhere left to go upwards. Line wrapping means "on line 1" is not
// the same as "on the top row", so the caret's own top is compared against the top
// of the line's first character — measured through the layout, never assumed, since
// row height follows the user's chosen font. The tolerance is half the caret's own
// height, so sub-pixel rounding can't read as a second row.
const titleFromFirstLine: Command = (view) => {
  const sel = view.state.selection;
  if (sel.ranges.length !== 1 || !sel.main.empty) return false;
  const line = view.state.doc.lineAt(sel.main.head);
  // The first TYPABLE line, which is not line 1 when a properties panel replaces the
  // frontmatter — same reason as titleFromDocStart.
  if (line.from !== bodyStart(view)) return false;
  const here = view.coordsAtPos(sel.main.head);
  const top = view.coordsAtPos(line.from);
  if (!here || !top || here.top > top.top + (here.bottom - here.top) / 2) return false;
  return focusTitle(view);
};

// Registered inside createEditorState's single keymap.of([…]), before defaultKeymap.
//
// Precisely what that ordering does and does not buy, because the obvious reading is
// wrong: array position only decides among bindings at the SAME precedence, and two
// of the neighbours here are not. autocompletion() installs completionKeymap at
// Prec.highest and markdown() installs its own markdownKeymap at Prec.high, so both
// outrank this list wherever they are written. An open [[link]] popup therefore keeps
// ArrowUp regardless — and markdownKeymap's Backspace (deleteMarkupBackward) gets
// first refusal, which is harmless only because it declines at the top of the
// document. What array order genuinely settles is beating defaultKeymap, whose
// Backspace (deleteCharBackward) and ArrowUp (cursorLineUp) both handle the event
// unconditionally and would otherwise starve these. Both commands return false unless
// the caret is against the first typable position, so they cost nothing elsewhere.
export const titleNavKeymap: KeyBinding[] = [
  { key: "Backspace", run: titleFromDocStart },
  { key: "ArrowUp", run: titleFromFirstLine },
];

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
