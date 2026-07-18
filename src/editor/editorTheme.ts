// CM6 theme for the note editor — body text in --font, display serif for the
// title + headings, gold caret & selection, and the live-preview decoration
// classes.
//
// appHighlightStyle replaces CM6's defaultHighlightStyle, which is written for
// docs pages: it UNDERLINES headings and paints links/syntax in hardcoded web
// colours that ignore the theme. Every colour here goes through the app's
// tokens instead, so source mode re-themes with the palette like everything
// else — and headings stop looking like hyperlinks.
import { EditorView } from "@codemirror/view";
import { HighlightStyle } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

export const appHighlightStyle = HighlightStyle.define([
  { tag: t.heading, fontWeight: "700" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through", opacity: "0.65" },
  { tag: t.link, color: "var(--accent-text)" },
  { tag: t.url, color: "var(--accent-text)" },
  { tag: t.monospace, fontFamily: "var(--font-mono)", fontSize: "0.9em" },
  // No t.quote rule: callouts ARE quotes under the hood, and a colour here
  // would override the callout title/body tokens. .cm-blockquote (the class
  // the live preview puts on real quotes) already carries the quote look.
  { tag: t.meta, color: "var(--text-faint)" },
  { tag: t.processingInstruction, color: "var(--text-faint)" },
  { tag: t.labelName, color: "var(--accent-text)" },
  { tag: t.contentSeparator, color: "var(--text-faint)" },
  // Code-block syntax (fenced blocks get real language highlighting): a small,
  // low-saturation set that leans on the theme's own tiers.
  { tag: [t.keyword, t.operatorKeyword, t.modifier], color: "var(--accent-text)" },
  { tag: [t.string, t.special(t.string)], color: "var(--text-dim)" },
  { tag: [t.number, t.bool, t.atom], color: "var(--text)" },
  { tag: t.comment, color: "var(--text-muted)", fontStyle: "italic" },
  { tag: [t.function(t.variableName), t.definition(t.variableName)], color: "var(--text)" },
  { tag: [t.typeName, t.className, t.propertyName], color: "var(--text-dim)" },
]);

export const editorTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "transparent",
      color: "var(--text)",
      height: "100%",
      fontFamily: "var(--font)",
      fontSize: "16px",
    },
    ".cm-scroller": {
      // Vertical scroll only. Line wrapping is on, so the editor never needs to
      // pan horizontally; wide tables / math scroll inside their own container.
      overflowX: "hidden",
      overflowY: "auto",
      lineHeight: "1.7",
      fontFamily: "var(--font)",
    },
    ".cm-content": {
      // The app sets body { cursor: default }, which the contenteditable would
      // otherwise inherit — force the I-beam back over the writing surface.
      cursor: "text",
      maxWidth: "920px",
      // Always centre the readable column. Because the column position is driven
      // purely by the pane width, it tracks the sidebar's width animation frame by
      // frame — collapsing/expanding glides instead of snapping (a margin:0↔auto
      // flip would jump instantly). Wider column = more writing area on the right.
      margin: "0 auto",
      padding: "14px 52px 40vh 52px",
      // accent-text, not accent: the caret is drawn ON the page, so it needs the
      // contrast-floored variant. A pale accent as a raw caret is invisible.
      caretColor: "var(--accent-text)",
      overflowWrap: "anywhere", // break long unbroken tokens instead of clipping
    },
    "&.cm-focused": { outline: "none" },
    ".cm-cursor, .cm-dropCursor": {
      // accent-text, not accent: the caret is a hairline drawn ON the page, so it
      // needs the contrast-floored variant. A pale accent as a raw caret is invisible
      // (this rule was overriding the correct caretColor set on .cm-content above).
      borderLeftColor: "var(--accent-text)",
      borderLeftWidth: "2px",
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, .cm-content ::selection":
      { backgroundColor: "var(--accent-soft) !important" },
    ".cm-activeLine": { backgroundColor: "rgba(255,255,255,0.02)" },
    ".cm-gutters": { display: "none" },

    // Inline note title (filename), rendered as a block widget above line 0. It sits
    // inside .cm-content, so it inherits the same centred 920px column + 52px side
    // padding as the body — the title's left edge lines up exactly with the text
    // below it, and it scrolls away with the document. Editable in place (renames).
    // Display face: the note's name is the one hero-scale moment on the page,
    // so it takes --font-display (the editorial serif by default; the Font
    // picker overwrites it together with --font).
    ".cm-note-title": {
      display: "block",
      width: "100%",
      boxSizing: "border-box",
      border: "none",
      background: "transparent",
      fontFamily: "var(--font-display)",
      fontSize: "2.1em",
      fontWeight: "600",
      lineHeight: "var(--lh-display)",
      letterSpacing: "var(--track-display)",
      color: "var(--text)",
      margin: "0 0 2px",
      padding: "2px 0 8px",
      outline: "none",
      cursor: "text",
      caretColor: "var(--accent-text)",
    },
    ".cm-note-title::placeholder": {
      color: "var(--text-faint)",
      opacity: "1",
    },

    // Freshly typed AI answer text fades + rises in as the typewriter reveals it.
    ".cm-ai-fresh": {
      animation: "hln-ai-type 260ms var(--ease-out, ease-out) both",
    },

    // Headings. H1–H3 carry the editorial display face (they're the note's own
    // structure at display scale); H4–H6 stay in the body face — at those sizes
    // a serif reads as a typo, not a hierarchy. Never underlined.
    ".cm-heading": { fontWeight: "700", color: "var(--text)" },
    ".cm-h1": {
      fontFamily: "var(--font-display)",
      fontWeight: "600",
      fontSize: "1.75em",
      lineHeight: "1.3",
      letterSpacing: "var(--track-display)",
    },
    ".cm-h2": {
      fontFamily: "var(--font-display)",
      fontWeight: "600",
      fontSize: "1.45em",
      lineHeight: "1.35",
      letterSpacing: "var(--track-tight)",
    },
    ".cm-h3": {
      fontFamily: "var(--font-display)",
      fontWeight: "600",
      fontSize: "1.25em",
      lineHeight: "1.4",
      letterSpacing: "var(--track-tight)",
    },
    ".cm-h4": { fontSize: "1.1em" },
    ".cm-h5": { fontSize: "1.02em" },
    ".cm-h6": { fontSize: "1em", color: "var(--text-muted)" },

    // Inline
    ".cm-strong": { fontWeight: "700" },
    ".cm-em": { fontStyle: "italic" },
    ".cm-strike": { textDecoration: "line-through", opacity: "0.65" },
    ".cm-inline-code": {
      backgroundColor: "var(--surface2)",
      borderRadius: "3px",
      padding: "2px 5px",
      fontFamily: "var(--font-mono)",
      fontSize: "0.9em",
      // accent-text (contrast-floored), not accent: this text sits on --surface2, and
      // a pale accent fill on a pale surface is unreadable.
      color: "var(--accent-text)",
    },
    // A markdown [label](url) link. accent-text so it clears 4.5:1 on the page — the
    // raw --accent fill was 1.2:1 on the light background (invisible). The underline
    // stays a soft accent tint so the link still reads as accent-coloured.
    ".cm-link": {
      color: "var(--accent-text)",
      textDecoration: "none",
      borderBottom: "1px solid var(--accent-soft-hi)",
      cursor: "pointer",
    },
    ".cm-wikilink": {
      color: "var(--accent-text)",
      borderBottom: "1px solid var(--accent-soft-hi)",
      cursor: "pointer",
    },
    ".cm-highlight": {
      backgroundColor: "var(--accent-soft)",
      borderRadius: "2px",
      padding: "0.05em 0.15em",
    },
    ".cm-blockquote": {
      borderLeft: "3px solid var(--border)",
      paddingLeft: "14px",
      color: "var(--text-muted)",
      fontStyle: "italic",
    },
    ".cm-code-block": {
      fontFamily: "var(--font-mono)",
      fontSize: "0.9em",
      backgroundColor: "var(--surface)",
    },
    ".cm-code-fence": { color: "var(--text-faint)" },

    // Callouts (> [!type]) — Obsidian-style: per-type tinted block background
    // (--callout-rgb is set per line by the live preview), colored bold title
    // with the type's icon, normal-color body.
    ".cm-callout-line": {
      backgroundColor: "rgba(var(--callout-rgb), 0.09)",
      padding: "1px 12px",
    },
    ".cm-callout-first": {
      borderTopLeftRadius: "6px",
      borderTopRightRadius: "6px",
      paddingTop: "8px",
    },
    ".cm-callout-last": {
      borderBottomLeftRadius: "6px",
      borderBottomRightRadius: "6px",
      paddingBottom: "8px",
    },
    ".cm-callout-title": { fontWeight: "700", color: "rgb(var(--callout-rgb))" },
    ".cm-callout-body": { color: "var(--text)" },
    ".cm-callout-icon": { color: "rgb(var(--callout-rgb))" },
    ".cm-callout-icon svg": {
      width: "17px",
      height: "17px",
      verticalAlign: "-3.5px",
      marginRight: "7px",
    },
    ".cm-callout-icon .cm-callout-title": { marginLeft: "0" },

    // Tags, footnotes, embeds
    // A tag is a pill on a soft tint of the accent. Deliberately NOT uppercased or
    // letter-spaced the way the UI's status badges are: this renders the user's own
    // `#tag` inside their prose, and transforming it would show `#MyProject` back to
    // them as `#MYPROJECT`. Chrome may restyle itself; user content may not.
    ".cm-tag": {
      color: "var(--accent-text)",
      backgroundColor: "var(--accent-soft)",
      borderRadius: "var(--r-pill)",
      padding: "0.5px 8px",
      fontSize: "0.85em",
    },
    ".cm-footnote-ref": {
      color: "var(--accent-text)",
      fontSize: "0.75em",
      verticalAlign: "super",
    },
    ".cm-footnote-def": { color: "var(--text-muted)", fontSize: "0.92em" },
    ".cm-embed": {
      color: "var(--accent-text)",
      backgroundColor: "var(--surface2)",
      borderRadius: "4px",
      padding: "1px 7px",
      fontSize: "0.9em",
      cursor: "pointer",
    },
    ".cm-task-alt": { color: "var(--accent-text)", marginRight: "6px", fontSize: "1.05em" },

    // Fold handle (heading/list/callout collapse chevron). The widget's SVG has
    // only a viewBox, so without an explicit size it balloons to fill the line —
    // constrain it. Down when expanded, right when folded; dim until the line is
    // hovered (a folded section keeps its handle visible so it can be reopened).
    ".cm-fold-handle": {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: "16px",
      height: "1em",
      marginLeft: "-20px",
      marginRight: "4px",
      verticalAlign: "-2px",
      color: "var(--text-faint)",
      cursor: "pointer",
      opacity: "0",
      transition: "opacity 120ms ease, color 120ms ease",
    },
    ".cm-fold-handle svg": {
      width: "13px",
      height: "13px",
      transform: "rotate(90deg)", // expanded → chevron points down
      transition: "transform 120ms ease",
    },
    ".cm-fold-handle--folded svg": { transform: "rotate(0deg)" }, // folded → right
    ".cm-fold-handle:hover": { color: "var(--text)" },
    ".cm-line:hover .cm-fold-handle, .cm-fold-handle--folded": { opacity: "0.7" },

    // Images
    ".cm-md-image": {
      maxWidth: "100%",
      borderRadius: "6px",
      display: "inline-block",
      verticalAlign: "middle",
    },

    // Math (KaTeX)
    ".cm-math-block": {
      display: "block",
      textAlign: "center",
      margin: "12px 0",
      maxWidth: "100%",
      overflowX: "auto",
      overflowY: "hidden",
    },

    // Tables
    ".cm-table-wrap": { maxWidth: "100%", overflowX: "auto", margin: "10px 0" },
    ".cm-table": { borderCollapse: "collapse", fontSize: "0.95em" },
    ".cm-table th, .cm-table td": {
      border: "1px solid var(--border)",
      padding: "6px 13px",
    },
    ".cm-table th": { backgroundColor: "var(--surface2)", fontWeight: "700" },
    // Widgets
    ".cm-hr": {
      display: "inline-block",
      width: "100%",
      borderTop: "1px solid var(--border)",
      verticalAlign: "middle",
    },
    ".cm-bullet": { color: "var(--accent-text)" },
    ".cm-task": {
      accentColor: "var(--accent)",
      width: "15px",
      height: "15px",
      verticalAlign: "middle",
      cursor: "pointer",
      margin: "0 2px 0 0",
    },

    // In-note find (NoteSearchBar) — highlight all matches, accent the current one.
    ".cm-searchMatch": {
      backgroundColor: "var(--accent-soft)",
      borderRadius: "2px",
    },
    ".cm-searchMatch-selected": {
      backgroundColor: "var(--accent-soft-hi)",
      outline: "1px solid var(--accent-text)",
    },
  },
  { dark: true },
);
