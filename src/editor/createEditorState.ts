// Composes the CM6 EditorState: markdown language + history + live preview.
//
// Editing modes (Obsidian's three): "live" (hybrid live preview), "source"
// (raw markdown, syntax-colored), "reading" (fully rendered, not editable).
// The mode-dependent extensions live in Compartments so switching modes
// reconfigures the SAME state — undo history and scroll position survive.
import { EditorState, Compartment, type Extension } from "@codemirror/state";
import { EditorView, keymap, highlightSpecialChars, drawSelection } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { completionKeymap } from "@codemirror/autocomplete";
import { markdown, markdownLanguage, markdownKeymap } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { syntaxHighlighting } from "@codemirror/language";
import { editorTheme, appHighlightStyle, scrollbarPadPlugin } from "./editorTheme";
import { livePreview, blockPreview, calloutFolding } from "./livePreview";
import { noteSearchExtension } from "./noteSearch";
import { propertiesPanel } from "./properties";
import { wikilinkInteractions } from "./wikilinkInteractions";
import { externalLinkInteractions } from "./externalLinkInteractions";
import { askPopupMarks } from "./askPopupMarks";
import { wikilinkAutocomplete } from "./wikilinkComplete";
import { taskInteractions } from "./taskInteractions";
import { linkShortcutKeymap } from "./linkShortcuts";
import { autoClose, autoCloseKeymap } from "./autoClose";
import { foldingExtension } from "./folding";
import { indentGuides } from "./indentGuides";
import { listIndent } from "./listIndent";
import { ObsidianMarkdownExtension } from "./obsidianMarkdown";
import { noteTitle, titleNavKeymap } from "./noteTitle";
import { aiFreshField } from "../ai/typewriter";

export type EditorMode = "live" | "source" | "reading";

const previewCompartment = new Compartment();
const editableCompartment = new Compartment();

// Everything that turns raw markdown into the rendered hybrid view. Source mode
// runs none of it (raw text + syntax colors, like Obsidian's source mode).
function previewExtensions(mode: EditorMode): Extension {
  if (mode === "source") return [];
  return [propertiesPanel, blockPreview, livePreview, calloutFolding, foldingExtension, indentGuides];
}

function editableExtensions(mode: EditorMode): Extension {
  return mode === "reading"
    ? [EditorView.editable.of(false), EditorState.readOnly.of(true)]
    : [];
}

// Swap an existing editor to another mode in place (history/scroll preserved).
export function applyEditorMode(view: EditorView, mode: EditorMode): void {
  view.dispatch({
    effects: [
      previewCompartment.reconfigure(previewExtensions(mode)),
      editableCompartment.reconfigure(editableExtensions(mode)),
    ],
  });
}

export function createEditorState(
  doc: string,
  extra: Extension[] = [],
  mode: EditorMode = "live",
  title = "",
  onRename: (name: string) => boolean = () => false,
): EditorState {
  return EditorState.create({
    doc,
    extensions: [
      ...extra,
      // Inline filename title above line 0 (empty title → no widget).
      noteTitle(title, onRename),
      // Fade-in decoration for freshly typed AI answer text.
      aiFreshField,
      highlightSpecialChars(),
      history(),
      drawSelection(),
      EditorView.lineWrapping,
      // Hanging indent on list lines, so a wrapped item lines up under its own text
      // instead of under its bullet. TOP-LEVEL, not in previewCompartment: source
      // mode needs it too, and it detects live preview itself (view.plugin) to know
      // whether to measure the rendered bullet or the raw "- ".
      listIndent,
      // completionKeymap FIRST so Enter/Tab/↑↓/Esc drive an open [[link]]
      // autocomplete (its handlers no-op when the popup is closed, falling
      // through to the editing keys below).
      // linkShortcutKeymap: "[" / "]" wrap a selection in [[…]] instead of
      // replacing it. With no selection they fall through to normal typing.
      // markdownKeymap = Enter continues lists/quotes/tasks, Backspace deletes
      // list markup as a unit; indentWithTab = Tab nests a list item.
      // titleNavKeymap: Backspace/ArrowUp against the top of the note step INTO the
      // inline title (the reverse of Enter, which hands focus down to the body).
      // autoCloseKeymap: only Backspace (deleteBracketPair) — closeBrackets itself is
      // an inputHandler, not a keymap, which is exactly why it cannot fight
      // linkShortcutKeymap's "[" over a selection. Both must precede defaultKeymap,
      // whose Backspace handles the event unconditionally and would starve them.
      keymap.of([
        ...completionKeymap,
        ...titleNavKeymap,
        ...linkShortcutKeymap,
        ...markdownKeymap,
        ...autoCloseKeymap,
        ...defaultKeymap,
        ...historyKeymap,
        indentWithTab,
      ]),
      // base: markdownLanguage already layers @lezer/markdown's GFM bundle
      // (Table, TaskList, Strikethrough, Autolink) under the hood — bare
      // "https://…"/"www…" text already parses as a URL node with no config
      // change here. ObsidianMarkdownExtension adds only this app's own
      // syntax (wikilinks, callouts, tags) on top; livePreview.ts is what
      // turns a URL node into a clickable .cm-link span.
      markdown({ base: markdownLanguage, codeLanguages: languages, extensions: [ObsidianMarkdownExtension] }),
      // Auto-close brackets/quotes. Sits next to markdown() because it configures
      // markdown's language data (a prose pair set — no apostrophe, since in a notes
      // app that is overwhelmingly "don't"); a fenced code block still resolves to its
      // own language's config and gets the code defaults.
      autoClose,
      // The app's own highlight style, NOT defaultHighlightStyle — the default
      // underlines headings and hardcodes web-blue links that ignore the theme.
      syntaxHighlighting(appHighlightStyle, { fallback: true }),
      // In-note find highlighting, driven by our own NoteSearchBar (no CM6 panel
      // or Ctrl+F keymap — see noteSearch.ts for why we own the highlight).
      noteSearchExtension,
      wikilinkInteractions,
      externalLinkInteractions,
      // Dashed marks over ranges already asked about — hover re-opens the popup.
      askPopupMarks,
      wikilinkAutocomplete,
      taskInteractions,
      editorTheme,
      // Measures the scrollbar gutter into --cm-sbw for the theme's centring calc.
      scrollbarPadPlugin,
      previewCompartment.of(previewExtensions(mode)),
      editableCompartment.of(editableExtensions(mode)),
    ],
  });
}
