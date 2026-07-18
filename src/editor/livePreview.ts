// Obsidian-style live preview. Two layers:
//  • livePreview (ViewPlugin) — INLINE + single-line decorations: hide markers,
//    style content, inline widgets (bullets, checkboxes, images, inline math…).
//  • blockPreview (StateField) — BLOCK widgets that span lines (tables, $$math$$),
//    which CM6 only permits from a state field, not a plugin.
// A line under the cursor (when focused) stays raw; block widgets reveal their
// source when the selection is on one of their lines (click or arrow into them).
import { syntaxTree, ensureSyntaxTree } from "@codemirror/language";
import { RangeSetBuilder, StateEffect, StateField, type EditorState, type Text } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import katex from "katex";
import { CalloutIconWidget, defaultCalloutTitle, resolveCallout } from "./callouts";
import { renderInline, renderMarkdownBlocks } from "./markdownRender";
import { resolveNoteByTitle, wikilinkExists } from "../state/wikilink";
import { parseWikilinkInner, wikilinkDisplaySpan } from "../graph/wikilinkParse";
import { selectNoteByPath } from "../state/ui";

// ── Widgets ───────────────────────────────────────────────────────────────────
class HRWidget extends WidgetType {
  toDOM() {
    const el = document.createElement("span");
    el.className = "cm-hr";
    return el;
  }
}
class BulletWidget extends WidgetType {
  toDOM() {
    const el = document.createElement("span");
    el.className = "cm-bullet";
    el.textContent = "•";
    return el;
  }
}
class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }
  eq(o: CheckboxWidget) {
    return o.checked === this.checked;
  }
  toDOM() {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.className = "cm-task";
    box.checked = this.checked;
    return box;
  }
  ignoreEvent() {
    return false;
  }
}
class AltTaskWidget extends WidgetType {
  constructor(readonly ch: string) {
    super();
  }
  eq(o: AltTaskWidget) {
    return o.ch === this.ch;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = "cm-task-alt";
    el.textContent = this.ch === "/" ? "◐" : this.ch === "-" ? "⊘" : this.ch;
    return el;
  }
  // Let editor DOM events through so the taskInteractions handler can toggle it
  // (same as CheckboxWidget — the default `true` would swallow the click).
  ignoreEvent() {
    return false;
  }
}
class ImageWidget extends WidgetType {
  constructor(
    readonly url: string,
    readonly alt: string,
  ) {
    super();
  }
  eq(o: ImageWidget) {
    return o.url === this.url && o.alt === this.alt;
  }
  toDOM() {
    const img = document.createElement("img");
    img.className = "cm-md-image";
    img.src = this.url;
    img.alt = this.alt;
    return img;
  }
}
// ![[target]] transclusion (Obsidian embeds): a resolvable note renders its
// actual content inline as an embed card; anything else (images we can't read,
// missing notes) falls back to the chip. `version` participates in eq() so an
// edit to the embedded note rebuilds the card on the next decoration pass.
class EmbedWidget extends WidgetType {
  constructor(
    readonly target: string,
    readonly version: string,
  ) {
    super();
  }
  eq(o: EmbedWidget) {
    return o.target === this.target && o.version === this.version;
  }
  toDOM() {
    const resolved = resolveNoteByTitle(this.target);
    if (!resolved) {
      const el = document.createElement("span");
      el.className = "cm-embed";
      el.textContent = `⧉ ${this.target}`;
      return el;
    }
    const card = document.createElement("div");
    card.className = "cm-embed-card";
    const head = document.createElement("div");
    head.className = "cm-embed-card__title";
    head.textContent = this.target;
    head.title = "Open note";
    head.addEventListener("mousedown", (e) => {
      e.preventDefault();
      selectNoteByPath(resolved.path);
    });
    card.appendChild(head);
    card.appendChild(renderMarkdownBlocks(resolved.text));
    return card;
  }
}
class MathWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly block: boolean,
  ) {
    super();
  }
  eq(o: MathWidget) {
    return o.src === this.src && o.block === this.block;
  }
  toDOM() {
    const el = document.createElement(this.block ? "div" : "span");
    el.className = this.block ? "cm-math cm-math-block" : "cm-math";
    try {
      katex.render(this.src, el, { displayMode: this.block, throwOnError: false });
    } catch {
      el.textContent = this.src;
    }
    return el;
  }
  ignoreEvent() {
    return false;
  }
}
// Split a table row into cells, each carrying the absolute document position of
// its content — so a click on a rendered cell can drop the caret into the exact
// spot in the source. Mirrors the strip-outer-pipes / split-on-"|" the renderer
// uses so cell indices line up with the alignment row.
function splitCells(rawLine: string, base = 0): { text: string; pos: number }[] {
  const segs: { seg: string; start: number }[] = [];
  let acc = 0;
  for (const p of rawLine.split("|")) {
    segs.push({ seg: p, start: acc });
    acc += p.length + 1;
  }
  let arr = segs;
  if (/^\s*\|/.test(rawLine)) arr = arr.slice(1);
  if (/\|\s*$/.test(rawLine)) arr = arr.slice(0, -1);
  return arr.map(({ seg, start }) => ({
    text: seg.trim(),
    pos: base + start + (/^\s*/.exec(seg)?.[0].length ?? 0),
  }));
}

class TableWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly from: number,
  ) {
    super();
  }
  // Position is part of identity: when text above shifts the table, a fresh
  // widget (and fresh click handlers with the right offsets) must be built.
  eq(o: TableWidget) {
    return o.src === this.src && o.from === this.from;
  }
  toDOM(view: EditorView) {
    const wrap = document.createElement("div");
    wrap.className = "cm-table-wrap";
    const rawLines = this.src.split("\n");
    const lineStart: number[] = [];
    let off = 0;
    for (const rl of rawLines) {
      lineStart.push(this.from + off);
      off += rl.length + 1;
    }
    const rowIdx = rawLines
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => r.trim().length)
      .map(({ i }) => i);
    if (rowIdx.length < 2) {
      wrap.textContent = this.src;
      return wrap;
    }
    const aligns = splitCells(rawLines[rowIdx[1]]).map(({ text: d }) =>
      /^:-+:$/.test(d) ? "center" : /^-+:$/.test(d) ? "right" : /^:-+$/.test(d) ? "left" : "",
    );
    const table = document.createElement("table");
    table.className = "cm-table";
    const cell = (tag: "th" | "td", c: { text: string; pos: number }, alignIdx: number) => {
      const el = document.createElement(tag);
      el.innerHTML = renderInline(c.text);
      if (aligns[alignIdx]) el.style.textAlign = aligns[alignIdx];
      // Block widgets ignore editor events, so a plain click can't reach the
      // source — put the caret there ourselves (which re-reveals the raw table).
      el.addEventListener("mousedown", (e) => {
        if ((e.target as HTMLElement).closest(".cm-wikilink")) return; // let it open
        e.preventDefault();
        view.dispatch({ selection: { anchor: Math.min(c.pos, view.state.doc.length) } });
        view.focus();
      });
      return el;
    };
    const thead = document.createElement("thead");
    const htr = document.createElement("tr");
    splitCells(rawLines[rowIdx[0]], lineStart[rowIdx[0]]).forEach((c, i) =>
      htr.appendChild(cell("th", c, i)),
    );
    thead.appendChild(htr);
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    for (let k = 2; k < rowIdx.length; k++) {
      const li = rowIdx[k];
      const tr = document.createElement("tr");
      splitCells(rawLines[li], lineStart[li]).forEach((c, j) => tr.appendChild(cell("td", c, j)));
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }
}

// ── Block detection (tables + $$ math), shared by the field + the inline plugin ─
interface Block {
  from: number;
  to: number;
  startLine: number;
  endLine: number;
  kind: "table" | "math";
  content: string;
}

function findBlocks(state: EditorState): Block[] {
  const doc = state.doc;
  const tree = ensureSyntaxTree(state, doc.length, 100) ?? syntaxTree(state);
  const out: Block[] = [];
  tree.iterate({
    from: 0,
    to: doc.length,
    enter: (node) => {
      if (node.name === "Table") {
        out.push({
          from: node.from,
          to: node.to,
          startLine: doc.lineAt(node.from).number,
          endLine: doc.lineAt(node.to).number,
          kind: "table",
          content: doc.sliceString(node.from, node.to),
        });
        return false;
      }
      return undefined;
    },
  });
  let n = 1;
  while (n <= doc.lines) {
    // Single-line $$…$$ — Obsidian renders this as display math too. Without
    // this case the inline $…$ rule half-matches it and leaves stray dollars.
    const line = doc.line(n);
    const single = /^\s*\$\$(.+?)\$\$\s*$/.exec(line.text);
    if (single && single[1].trim()) {
      out.push({
        from: line.from,
        to: line.to,
        startLine: n,
        endLine: n,
        kind: "math",
        content: single[1],
      });
      n++;
      continue;
    }
    if (doc.line(n).text.trim() === "$$") {
      let end = n + 1;
      while (end <= doc.lines && doc.line(end).text.trim() !== "$$") end++;
      if (end <= doc.lines) {
        const body: string[] = [];
        for (let i = n + 1; i < end; i++) body.push(doc.line(i).text);
        if (body.length) {
          out.push({
            from: doc.line(n).from,
            to: doc.line(end).to,
            startLine: n,
            endLine: end,
            kind: "math",
            content: body.join("\n"),
          });
        }
        n = end + 1;
        continue;
      }
    }
    n++;
  }
  return out;
}

// ── Block StateField (tables + $$math$$) ──────────────────────────────────────
function buildBlocks(state: EditorState): DecorationSet {
  const doc = state.doc;
  // In reading mode blocks never reveal their source (no editing possible).
  const selLine = state.readOnly ? -1 : doc.lineAt(state.selection.main.head).number;
  const specs = findBlocks(state)
    .filter((b) => !(selLine >= b.startLine && selLine <= b.endLine)) // editing → raw
    .map((b) => ({
      from: b.from,
      to: b.to,
      deco: Decoration.replace({
        widget: b.kind === "table" ? new TableWidget(b.content, b.from) : new MathWidget(b.content, true),
        block: true,
      }),
    }));
  specs.sort((a, b) => a.from - b.from || a.to - b.to);
  const builder = new RangeSetBuilder<Decoration>();
  for (const s of specs) builder.add(s.from, s.to, s.deco);
  return builder.finish();
}

export const blockPreview = StateField.define<DecorationSet>({
  create: (state) => buildBlocks(state),
  update(deco, tr) {
    if (tr.docChanged || tr.selection) return buildBlocks(tr.state);
    return deco.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

// ── Callout folding ───────────────────────────────────────────────────────────
// `> [!type]-` starts collapsed, `+`/bare starts open; clicking the chevron
// toggles. Explicit toggles live in a StateField keyed by the callout's first-
// line position (mapped through edits); absent an override the suffix decides.
export const toggleCalloutFold = StateEffect.define<{ pos: number; folded: boolean }>({
  map: (v, m) => ({ pos: m.mapPos(v.pos), folded: v.folded }),
});

export const calloutFoldState = StateField.define<readonly { pos: number; folded: boolean }[]>({
  create: () => [],
  update(value, tr) {
    let v = tr.docChanged
      ? value.map((e) => ({ pos: tr.changes.mapPos(e.pos), folded: e.folded }))
      : value;
    for (const ef of tr.effects) {
      if (ef.is(toggleCalloutFold)) {
        v = v.filter((e) => e.pos !== ef.value.pos).concat(ef.value);
      }
    }
    return v;
  },
});

export const calloutFoldClicks = EditorView.domEventHandlers({
  mousedown(e, view) {
    const t = (e.target as HTMLElement | null)?.closest?.(".cm-callout-chevron");
    if (!t) return false;
    e.preventDefault();
    const pos = view.posAtDOM(t);
    const line = view.state.doc.lineAt(pos);
    const m = /^\s*>\s*\[![A-Za-z]+\]([-+])?/.exec(line.text);
    const dflt = m?.[1] === "-";
    const o = (view.state.field(calloutFoldState, false) ?? []).find((v) => v.pos === line.from);
    view.dispatch({ effects: toggleCalloutFold.of({ pos: line.from, folded: !(o ? o.folded : dflt) }) });
    return true;
  },
});

export const calloutFolding = [calloutFoldState, calloutFoldClicks];

// ── Inline decorations (ViewPlugin) ───────────────────────────────────────────
interface Spec {
  from: number;
  to: number;
  deco: Decoration;
}
type Hide = (f: number, t: number) => unknown;
type Mark = (f: number, t: number, c: string, a?: Record<string, string>) => unknown;
type Widget = (f: number, t: number, w: WidgetType) => unknown;
type LineDeco = (pos: number, cls: string, rgb: string) => unknown;

// True when the cursor/selection actually touches [from, to] (inclusive at both
// edges). This is the whole point of "live" preview: a token reveals its raw
// markdown only when the caret is *on* it — e.g. `[[note]]|` with the caret right
// after `]]` — not merely somewhere on the same line.
type Active = (from: number, to: number) => boolean;

function buildInline(view: EditorView): { deco: DecorationSet; atomic: DecorationSet } {
  const specs: Spec[] = [];
  // ONLY replace decorations (hidden syntax + widgets) may be atomic. Styling
  // marks (cm-heading, cm-strong…) and line decorations must never be: an
  // atomic mark pushes the caret out of the styled text and makes one
  // backspace swallow the whole range (the "can't edit a heading" bug).
  const atomicSpecs: Spec[] = [];
  const lineSpecs: Spec[] = [];
  const state = view.state;
  const doc = state.doc;
  // Reading mode (readOnly) never reveals raw markdown — it's a rendered view.
  const focused = view.hasFocus && !state.readOnly;
  const foldOverrides = state.field(calloutFoldState, false) ?? [];
  const sel = state.selection;
  const active: Active = (from, to) =>
    focused && sel.ranges.some((r) => r.from <= to && r.to >= from);

  const push = (spec: Spec, atomic: boolean) => {
    specs.push(spec);
    if (atomic) atomicSpecs.push(spec);
  };
  const hide: Hide = (from, to) =>
    from < to && push({ from, to, deco: Decoration.replace({}) }, true);
  const mark: Mark = (from, to, cls, attrs) =>
    from < to &&
    push(
      {
        from,
        to,
        deco: Decoration.mark(attrs ? { class: cls, attributes: attrs } : { class: cls }),
      },
      false,
    );
  const widget: Widget = (from, to, w) =>
    push({ from, to, deco: Decoration.replace({ widget: w }) }, true);
  const lineDeco: LineDeco = (pos, cls, rgb) =>
    lineSpecs.push({
      from: pos,
      to: pos,
      deco: Decoration.line({ class: cls, attributes: { style: `--callout-rgb:${rgb}` } }),
    });

  // Lines occupied by block widgets (tables/$$math) — skip inline styling there.
  const blockLines = new Set<number>();
  for (const b of findBlocks(state)) for (let i = b.startLine; i <= b.endLine; i++) blockLines.add(i);

  // Per-token reveal applies ONLY to these inline spans: the caret touching one
  // leaves just that token raw. Every other node (Paragraph, ListItem, Document…)
  // must be descended so its inline children are each judged on their own —
  // otherwise a caret anywhere in a paragraph would blank the whole line.
  const inlineNode = /^(StrongEmphasis|Emphasis|Strikethrough|InlineCode|Image|Link|Autolink|Wikilink|Embed|Tag)$/;

  const tree = ensureSyntaxTree(state, doc.length, 100) ?? syntaxTree(state);
  tree.iterate({
    from: 0,
    to: doc.length,
    enter: (node) => {
      const name = node.name;
      if (name === "Table") return false; // handled by the block field
      if (blockLines.has(doc.lineAt(node.from).number)) return undefined;

      // List bullets + task checkboxes: reveal the whole "- [ ]" marker together
      // (and hide the leading "- " so a checkbox isn't preceded by a stray dash).
      if (name === "ListMark" || name === "TaskMarker") {
        renderMarker(name, node.from, node.to, doc, active, hide, widget);
        return undefined;
      }

      // Per-token reveal: caret touching this inline token → leave it raw.
      if (inlineNode.test(name) && active(node.from, node.to)) return false;

      if (/^ATXHeading[1-6]$/.test(name)) {
        const level = +name.slice(-1);
        const markTo = Math.min(node.from + level + 1, node.to);
        const line = doc.lineAt(node.from);
        // Obsidian behavior: the "## " prefix reveals when the caret is
        // ANYWHERE on the heading line (not just touching the marker), so the
        // level is always reachable for editing. Styling stays on while raw.
        if (!active(line.from, line.to)) hide(node.from, markTo);
        mark(markTo, node.to, `cm-heading cm-h${level}`);
      } else if (name === "StrongEmphasis") {
        hide(node.from, node.from + 2);
        mark(node.from + 2, node.to - 2, "cm-strong");
        hide(node.to - 2, node.to);
      } else if (name === "Emphasis") {
        hide(node.from, node.from + 1);
        mark(node.from + 1, node.to - 1, "cm-em");
        hide(node.to - 1, node.to);
      } else if (name === "Strikethrough") {
        hide(node.from, node.from + 2);
        mark(node.from + 2, node.to - 2, "cm-strike");
        hide(node.to - 2, node.to);
      } else if (name === "InlineCode") {
        hide(node.from, node.from + 1);
        mark(node.from + 1, node.to - 1, "cm-inline-code");
        hide(node.to - 1, node.to);
      } else if (name === "Image") {
        const m = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(doc.sliceString(node.from, node.to));
        if (m) widget(node.from, node.to, new ImageWidget(m[2], m[1]));
      } else if (name === "Link") {
        const text = doc.sliceString(node.from, node.to);
        const close = text.indexOf("](");
        if (close > 0) {
          hide(node.from, node.from + 1);
          mark(node.from + 1, node.from + close, "cm-link");
          hide(node.from + close, node.to);
        }
      } else if (name === "Wikilink") {
        if (active(node.from, node.to)) return;
        const inner = doc.sliceString(node.from + 2, node.to - 2);
        // Show the alias for [[target|alias]] (the 2nd part), the first part
        // otherwise; everything else in the [[ … ]] is hidden.
        const { start, end } = wikilinkDisplaySpan(inner);
        const dispFrom = node.from + 2 + start;
        const dispTo = node.from + 2 + end;
        // Dim links whose (first / shown) target has no note yet — clicking one
        // creates it. Matches Obsidian's distinct "unresolved link" colour.
        const first = parseWikilinkInner(inner).targets[0];
        const cls = first && wikilinkExists(first) ? "cm-wikilink" : "cm-wikilink cm-wikilink--new";
        hide(node.from, dispFrom);
        mark(dispFrom, dispTo, cls, { "data-wikilink": inner });
        hide(dispTo, node.to);
      } else if (name === "Embed") {
        if (active(node.from, node.to)) return;
        const inner = doc.sliceString(node.from + 3, node.to - 2);
        const target = inner.split("|")[0];
        const version = resolveNoteByTitle(target)?.text ?? "∅";
        widget(node.from, node.to, new EmbedWidget(target, version));
      } else if (name === "Tag") {
        if (!active(node.from, node.to)) mark(node.from, node.to, "cm-tag");
      } else if (name === "Autolink") {
        hide(node.from, node.from + 1);
        mark(node.from + 1, node.to - 1, "cm-link");
        hide(node.to - 1, node.to);
      } else if (name === "FencedCode") {
        mark(node.from, node.to, "cm-code-block");
        const first = doc.lineAt(node.from);
        const last = doc.lineAt(node.to);
        mark(first.from, first.to, "cm-code-fence");
        if (last.number !== first.number) mark(last.from, last.to, "cm-code-fence");
      } else if (name === "Blockquote") {
        renderBlockquote(node.from, node.to, doc, hide, mark, active, widget, lineDeco, foldOverrides);
      } else if (name === "HorizontalRule") {
        if (!active(node.from, node.to)) widget(node.from, node.to, new HRWidget());
      }
      return undefined;
    },
  });

  for (let n = 1; n <= doc.lines; n++) {
    if (blockLines.has(n)) continue;
    scanInline(doc.line(n), hide, mark, widget, active);
  }

  // Decoration.set(…, true) sorts by position AND side, which a hand-rolled
  // from/to sort can't do once zero-length line decorations are in the mix.
  const atomic = Decoration.set(
    atomicSpecs.map((s) => s.deco.range(s.from, s.to)),
    true,
  );
  const deco = Decoration.set(
    [...specs, ...lineSpecs].map((s) => s.deco.range(s.from, s.to)),
    true,
  );
  return { deco, atomic };
}

// List bullet / task checkbox for one "- " marker. The dash and the "[ ]" are two
// separate syntax nodes but one visual unit, so they reveal together: the caret
// anywhere on "- [ ]" shows the raw source; otherwise the dash is hidden and the
// box becomes a bullet or checkbox.
function renderMarker(
  name: string,
  from: number,
  to: number,
  doc: Text,
  active: Active,
  hide: Hide,
  widget: Widget,
) {
  const line = doc.lineAt(from);
  const task = /^(\s*)([-*+])(\s+)\[(.)\]/.exec(line.text);
  if (task) {
    const dashFrom = line.from + task[1].length;
    const bracketFrom = dashFrom + task[2].length + task[3].length;
    if (active(dashFrom, bracketFrom + 3)) return; // caret on the marker → raw
    if (name === "ListMark") hide(dashFrom, bracketFrom); // drop the "- " before the box
    else widget(from, to, new CheckboxWidget(/x/i.test(task[4])));
    return;
  }
  if (name === "ListMark") {
    if (active(from, to)) return;
    if (/[-*+]/.test(doc.sliceString(from, to))) widget(from, to, new BulletWidget());
  }
}

// Blockquote / callout (> [!type] title): hide the "> " prefix per line and, for a
// callout, replace the "[!type]" token with the type's colored icon. Each callout
// line gets a tinted line decoration (Obsidian-style block background) whose color
// comes from the type via --callout-rgb. Reveal a line's raw prefix when the caret
// is editing that line — the background stays put so the block doesn't flicker.
function renderBlockquote(
  from: number,
  to: number,
  doc: Text,
  hide: Hide,
  mark: Mark,
  active: Active,
  widget: Widget,
  lineDeco: LineDeco,
  foldOverrides: readonly { pos: number; folded: boolean }[],
) {
  const first = doc.lineAt(from);
  const callout = /^\s*>\s*\[!([A-Za-z]+)\]([-+])?/.exec(first.text);
  const meta = callout ? resolveCallout(callout[1]) : null;
  const startLine = first.number;
  const endLine = doc.lineAt(to).number;
  // Folded? Explicit toggle wins; otherwise the `-` suffix means "start closed".
  const foldable = !!callout && (callout[2] === "-" || callout[2] === "+");
  const override = callout ? foldOverrides.find((o) => o.pos === first.from) : undefined;
  const folded = callout ? (override ? override.folded : callout[2] === "-") : false;
  for (let n = startLine; n <= endLine; n++) {
    const line = doc.line(n);
    if (meta) {
      const cls =
        "cm-callout-line" +
        (n === startLine ? " cm-callout-first" : "") +
        (n === endLine || (folded && n === startLine) ? " cm-callout-last" : "") +
        (folded && n > startLine ? " cm-callout-collapsed" : "");
      lineDeco(line.from, cls, meta.rgb);
    }
    if (folded && n > startLine) continue; // body hidden by the collapsed class
    if (active(line.from, line.to)) continue; // editing this quote line → raw
    const pfx = line.text.match(/^\s*>\s?/);
    const contentStart = line.from + (pfx ? pfx[0].length : 0);
    hide(line.from, contentStart);
    if (callout && n === startLine) {
      const cm = /\[![A-Za-z]+\][-+]?\s?/.exec(line.text.slice(pfx ? pfx[0].length : 0));
      const tokEnd = contentStart + (cm ? cm.index + cm[0].length : 0);
      if (tokEnd > contentStart) {
        const hasTitle = doc.sliceString(tokEnd, line.to).trim().length > 0;
        widget(
          contentStart,
          tokEnd,
          new CalloutIconWidget(
            callout[1],
            hasTitle ? "" : defaultCalloutTitle(callout[1]),
            foldable,
            folded,
          ),
        );
      }
      mark(tokEnd, line.to, "cm-callout-title");
    } else {
      mark(contentStart, line.to, callout ? "cm-callout-body" : "cm-blockquote");
    }
  }
}

// Per-line regex features, priority-ordered with a "consumed" tracker so hides
// never overlap: comments, inline math, embeds, wikilinks, highlights, tags,
// footnote refs (+ the footnote-definition line and extended task boxes). Each
// token reveals its raw markdown when the caret is touching it.
function scanInline(
  line: { from: number; to: number; text: string; number: number },
  hide: Hide,
  mark: Mark,
  widget: Widget,
  active: Active,
) {
  const base = line.from;
  const text = line.text;
  const consumed: Array<[number, number]> = [];
  const free = (s: number, e: number) => !consumed.some(([a, b]) => s < b && e > a);
  const run = (re: RegExp, fn: (m: RegExpExecArray, s: number, e: number) => void) => {
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(text))) {
      const s = m.index;
      const e = s + m[0].length;
      if (free(s, e)) {
        consumed.push([s, e]);
        fn(m, s, e);
      }
    }
  };

  const fnDef = /^\[\^([^\]]+)\]:/.exec(text);
  if (fnDef) {
    if (!active(base, base + fnDef[0].length)) mark(base, base + fnDef[0].length, "cm-footnote-def");
    consumed.push([0, fnDef[0].length]);
  }
  const task = /^(\s*[-*+]\s+)\[([^\]xX ])\]\s/.exec(text);
  if (task) {
    const s = task[1].length;
    if (!active(base + s, base + s + 3)) widget(base + s, base + s + 3, new AltTaskWidget(task[2]));
    consumed.push([s, s + 3]);
  }

  run(/%%[^%]*%%/g, (_m, s, e) => active(base + s, base + e) || hide(base + s, base + e));
  // $$…$$ inside a line renders as display math (Obsidian). Must run before the
  // single-$ rule, which would otherwise half-match it and leave stray dollars.
  run(/\$\$([^$]+?)\$\$/g, (m, s, e) => {
    if (!active(base + s, base + e)) widget(base + s, base + e, new MathWidget(m[1], true));
  });
  run(/\$(?!\$)([^\n$]+?)\$/g, (m, s, e) => {
    if (!active(base + s, base + e)) widget(base + s, base + e, new MathWidget(m[1], false));
  });
  run(/==([^=]+)==/g, (_m, s, e) => {
    if (active(base + s, base + e)) return;
    hide(base + s, base + s + 2);
    mark(base + s + 2, base + e - 2, "cm-highlight");
    hide(base + e - 2, base + e);
  });
  run(/\[\^([^\]]+)\]/g, (_m, s, e) => {
    if (!active(base + s, base + e)) mark(base + s, base + e, "cm-footnote-ref");
  });
}

export const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    atomic: DecorationSet;
    constructor(view: EditorView) {
      const b = buildInline(view);
      this.decorations = b.deco;
      this.atomic = b.atomic;
    }
    update(u: ViewUpdate) {
      if (
        u.docChanged ||
        u.viewportChanged ||
        u.selectionSet ||
        u.focusChanged ||
        syntaxTree(u.startState) !== syntaxTree(u.state) ||
        u.startState.field(calloutFoldState, false) !== u.state.field(calloutFoldState, false)
      ) {
        const b = buildInline(u.view);
        this.decorations = b.deco;
        this.atomic = b.atomic;
      }
    }
  },
  {
    decorations: (v) => v.decorations,
    provide: (plugin) =>
      EditorView.atomicRanges.of((view) => view.plugin(plugin)?.atomic || Decoration.none),
  },
);
