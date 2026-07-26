// Hanging indent for list lines. EditorView.lineWrapping is on, so without this
// the second visual row of a long list item wraps back to the far-left margin —
// sitting under the bullet instead of under the item's own text. The cure is the
// classic hanging-indent pair (padding-left: H / text-indent: -H, both set in
// editorTheme.ts), where H is the width of everything that precedes the item's
// text: leading indent + marker + the gap after it. This plugin's only job is to
// hand the CSS an accurate H per line, as --hang.
//
// H is measured, never assumed. The editor font is proportional and the user can
// swap it, so "-", "1.", "10." and a nested "    -" all come out different widths;
// the canvas measureText pattern is the same one indentGuides.ts uses.
//
// What has to be measured is what is RENDERED, not what is in the document. In
// live/reading mode livePreview.ts replaces the raw "-" with a "•" widget, drops
// the entire "- " in front of a task and swaps "[x]" for a real <input>, and hides
// a blockquote's "> " (which leaves .cm-blockquote's own border+padding hanging off
// that row instead). Measuring the raw text there would push every wrapped row off
// by the difference. Source mode runs none of that — livePreview simply isn't in
// the configuration — so the raw text IS the rendered text. The plugin asks the
// view which of the two it is (view.plugin(livePreview)) rather than taking the
// mode as a parameter, so a mode switch, which reconfigures the compartment in
// place, is picked up by the very next update with nothing to wire.
//
// Each branch below names the livePreview code it mirrors: those substitutions
// and this measurement have to stay in step.
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";
import type { EditorState, Range, Text } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { livePreview } from "./livePreview";

// Leading indent, an optional "> " quote prefix (exactly one level — that is all
// livePreview's /^\s*>\s?/ hides), the indent inside the quote, the marker, and
// the run of spaces separating it from the text.
const LIST_RE = /^([ \t]*)(>[ \t]?)?([ \t]*)([-*+]|\d{1,9}[.)])([ \t]+)/;
// A SPACED thematic break — "- - -", "* * *", "_ _ _" — is not a list item, but it
// does match LIST_RE (marker "-", gap " "). Only the unspaced "---" form is safe by
// LIST_RE's own shape. livePreview swaps the whole line for an HRWidget whose rule is
// `width: 100%` of the content box, so a hang would shrink that box and paint the rule
// visibly short. Tested before LIST_RE and skipped outright.
const THEMATIC_BREAK_RE = /^[ \t]{0,3}([-*_])[ \t]*(?:\1[ \t]*){2,}$/;
// livePreview's own task test (renderMarker), plus the gap after the "]" that it
// leaves as ordinary text. Note the \s* start: a quoted "> - [ ]" deliberately
// does NOT match, there as here, so its brackets stay raw.
const TASK_RE = /^(\s*)([-*+])(\s+)\[(.)\]([ \t]*)/;
// scanInline's extended-state test ("- [/] ", "- [-] ") — anything that is not a
// GFM checkbox gets an AltTaskWidget instead of an <input>.
const ALT_RE = /^(\s*[-*+]\s+)\[([^\]xX ])\]\s/;

const BULLET = "•"; // BulletWidget.toDOM's textContent
const altGlyph = (ch: string) => (ch === "/" ? "◐" : ch === "-" ? "⊘" : ch); // AltTaskWidget.toDOM

// Widths of the pieces a rendered list prefix can be made of, in px, for the
// editor's *current* font. `key` folds every input into one string so a stale set
// can be spotted with a comparison instead of a field-by-field diff.
interface Metrics {
  key: string;
  width: (s: string) => number;
  bullet: number;
  check: number;
  alt: (ch: string) => number;
  quote: number;
}

function measure(view: EditorView): Metrics {
  const cs = getComputedStyle(view.contentDOM);
  // The `font` shorthand can come back empty (a non-normal longhand, or a DOM the
  // stylesheet has not reached yet), so rebuild it from the parts in that case —
  // an empty string would silently leave the canvas on its 10px sans default and
  // make every measurement below nonsense.
  const font = cs.font || `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const c = document.createElement("canvas").getContext("2d")!;
  c.font = font;
  // Canvas gives a tab zero advance. Leading indentation nearly always starts on
  // a tab stop, so expanding to tabSize spaces is right in the common case and
  // close everywhere else — the same approximation indentGuides.ts makes.
  const tab = " ".repeat(view.state.tabSize);
  const width = (s: string) => c.measureText(s.replace(/\t/g, tab)).width;
  // The widget geometry that is NOT type — checkbox box + gap, the alt marker's
  // gap and type scale, the blockquote rule + its padding — is declared once in
  // editorTheme.ts as custom properties and read back here, so the CSS and this
  // measurement can never drift apart.
  const px = (name: string) => parseFloat(cs.getPropertyValue(name)) || 0;
  const altScale = parseFloat(cs.getPropertyValue("--cm-task-alt-scale")) || 1;
  const altGap = px("--cm-task-alt-gap");
  const check = px("--cm-task-box") + px("--cm-task-gap");
  const quote = px("--cm-bq-border") + px("--cm-bq-pad");
  return {
    key: `${font}|${check}|${quote}|${altGap}|${altScale}|${view.state.tabSize}`,
    width,
    bullet: width(BULLET),
    check,
    // Glyph advance scales linearly with font-size, so the 1.05em alt marker is
    // its 1em width times the scale rather than a second font string to parse.
    alt: (ch) => width(altGlyph(ch)) * altScale + altGap,
    quote,
  };
}

// A "- item" inside a fenced or indented code block is code, not a list, and must
// not be re-indented. The tree is the cheap cached one; past the parse budget it
// resolves to the document node and the line is treated as prose, which is the
// same guess the regex alone would have made.
function inCode(state: EditorState, pos: number): boolean {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1);
  for (; node; node = node.parent) {
    if (node.name === "FencedCode" || node.name === "CodeBlock" || node.name === "CodeText") return true;
  }
  return false;
}

// Walk to the top of the quote block: a callout's body carries .cm-callout-body
// (no inline padding — the tinted line decoration indents every row equally, so
// it is not part of the hang), a plain quote carries .cm-blockquote (border +
// padding on the first row only, so it very much is).
function isCallout(doc: Text, n: number): boolean {
  while (n > 1 && /^[ \t]*>/.test(doc.line(n - 1).text)) n--;
  return /^[ \t]*>\s*\[![A-Za-z]+\]/.test(doc.line(n).text);
}

function buildHangs(view: EditorView, m: Metrics): DecorationSet {
  const state = view.state;
  const doc = state.doc;
  const rendered = view.plugin(livePreview) != null;
  // livePreview's own reveal rule: raw markdown comes back only while the editor
  // is focused and a selection range touches the token. Reading mode is readOnly
  // and so never reveals — its prefixes are always the rendered ones.
  const focused = view.hasFocus && !state.readOnly;
  const sel = state.selection;
  const touches = (from: number, to: number) =>
    focused && sel.ranges.some((r) => r.from <= to && r.to >= from);

  const decos: Range<Decoration>[] = [];
  for (const { from, to } of view.visibleRanges) {
    const endLine = doc.lineAt(to).number;
    // Which kind of quote block we are inside, resolved once per block: the
    // backward walk only runs on the first quoted line of a run.
    let quoteKind: boolean | null = null;
    for (let n = doc.lineAt(from).number; n <= endLine; n++) {
      const line = doc.line(n);
      const text = line.text;
      if (!/^[ \t]*>/.test(text)) quoteKind = null;
      if (THEMATIC_BREAK_RE.test(text)) continue;
      const mm = LIST_RE.exec(text);
      if (!mm || inCode(state, line.from)) continue;
      const [, indent, quoteMark, inner, marker, gap] = mm;
      const quote = quoteMark ?? ""; // the group is optional — absent, not empty
      if (quote && quoteKind === null) quoteKind = isCallout(doc, n);

      // The quote prefix. Hidden (live mode, caret elsewhere) it costs whatever
      // the mark that replaced it hangs off this row; shown it costs its text.
      // livePreview hides indent + "> " together, so both go when it goes.
      const quoteShown = !rendered || !quote || touches(line.from, line.to);
      let w = quoteShown ? m.width(indent + quote) : quoteKind ? 0 : m.quote;
      w += m.width(inner);

      const task = TASK_RE.exec(text);
      if (task) {
        // renderMarker hides "- " and puts a widget over "[x]", and reveals the
        // whole "- [x]" together, so the two are judged as one unit here too —
        // including the extended states, whose widget scanInline reveals on a
        // slightly narrower range than the dash. One character of slack, and only
        // while the caret is parked on the marker itself.
        const markFrom = line.from + task[1].length;
        const boxTo = markFrom + task[2].length + task[3].length + 3;
        const alt = ALT_RE.exec(text);
        if (!rendered || touches(markFrom, boxTo)) w += m.width(text.slice(task[1].length, task[0].length));
        else w += (alt ? m.alt(alt[2]) : m.check) + m.width(task[5]);
      } else {
        // Only -, * and + become bullets; "1." and "1)" stay as they are written,
        // which is why an ordered marker's width has to grow with the number.
        const markFrom = line.from + indent.length + quote.length + inner.length;
        const bullet =
          rendered && /^[-*+]$/.test(marker) && !touches(markFrom, markFrom + marker.length);
        w += (bullet ? m.bullet : m.width(marker)) + m.width(gap);
      }

      if (w > 0) {
        decos.push(
          Decoration.line({
            class: "cm-hang",
            // Written as a custom property, not a padding: indentGuides.ts also
            // decorates these lines and CM merges the two style attributes, so
            // the two decorations must contribute different properties, never a
            // second padding-left that would fight the first.
            attributes: { style: `--hang:${w.toFixed(2)}px` },
          }).range(line.from),
        );
      }
    }
  }
  return Decoration.set(decos, true);
}

export const listIndent = ViewPlugin.fromClass(
  class {
    metrics: Metrics;
    decorations: DecorationSet;
    dead = false;
    constructor(view: EditorView) {
      this.metrics = measure(view);
      this.decorations = buildHangs(view, this.metrics);
      // CM mounts the theme's stylesheet only AFTER it has constructed the view
      // plugins, so on a brand-new view the measurement above read a contentDOM
      // that had neither the editor font nor the --cm-* metrics on it yet. Re-take
      // it once the constructor has unwound — still the same task, so still before
      // paint — and redraw if anything moved. On a setState (Editor.tsx swaps the
      // whole state per note) the styles are already up and this finds no change.
      queueMicrotask(() => {
        const m = this.dead ? null : measure(view);
        if (!m || m.key === this.metrics.key) return;
        this.metrics = m;
        this.decorations = buildHangs(view, m);
        view.dispatch({}); // changes nothing; exists to get the new set drawn
      });
    }
    destroy() {
      this.dead = true;
    }
    update(u: ViewUpdate) {
      // A font swap changes the editor's geometry and nothing else about the
      // state, so a geometry change is the one moment worth re-measuring; the
      // read is a single getComputedStyle, next to nothing beside the syntax-tree
      // work the same update already does.
      let refont = false;
      if (u.geometryChanged) {
        const m = measure(u.view);
        if (m.key !== this.metrics.key) {
          this.metrics = m;
          refont = true;
        }
      }
      // selectionSet/focusChanged matter because the rendered prefix changes the
      // moment livePreview reveals a marker's raw source under the caret, and a
      // fresh parse can turn a "- x" line into code (or back) — the same trigger
      // set livePreview itself rebuilds on. A mode switch arrives as a bare
      // reconfiguring transaction, hence the last clause: nothing else flags it.
      if (
        refont ||
        u.docChanged ||
        u.viewportChanged ||
        u.selectionSet ||
        u.focusChanged ||
        syntaxTree(u.startState) !== syntaxTree(u.state) ||
        u.transactions.some((tr) => tr.reconfigured)
      ) {
        this.decorations = buildHangs(u.view, this.metrics);
      }
    }
  },
  { decorations: (v) => v.decorations },
);
