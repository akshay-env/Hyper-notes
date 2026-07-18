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
import { editorTheme, appHighlightStyle } from "./editorTheme";
import { livePreview, blockPreview, calloutFolding } from "./livePreview";
import { noteSearchExtension } from "./noteSearch";
import { propertiesPanel } from "./properties";
import { wikilinkInteractions } from "./wikilinkInteractions";
import { wikilinkAutocomplete } from "./wikilinkComplete";
import { taskInteractions } from "./taskInteractions";
import { linkShortcutKeymap } from "./linkShortcuts";
import { foldingExtension } from "./folding";
import { indentGuides } from "./indentGuides";
import { ObsidianMarkdownExtension } from "./obsidianMarkdown";
import { noteTitle } from "./noteTitle";
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
      // completionKeymap FIRST so Enter/Tab/↑↓/Esc drive an open [[link]]
      // autocomplete (its handlers no-op when the popup is closed, falling
      // through to the editing keys below).
      // linkShortcutKeymap: "[" / "]" wrap a selection in [[…]] instead of
      // replacing it. With no selection they fall through to normal typing.
      // markdownKeymap = Enter continues lists/quotes/tasks, Backspace deletes
      // list markup as a unit; indentWithTab = Tab nests a list item.
      keymap.of([
        ...completionKeymap,
        ...linkShortcutKeymap,
        ...markdownKeymap,
        ...defaultKeymap,
        ...historyKeymap,
        indentWithTab,
      ]),
      markdown({ base: markdownLanguage, codeLanguages: languages, extensions: [ObsidianMarkdownExtension] }),
      // The app's own highlight style, NOT defaultHighlightStyle — the default
      // underlines headings and hardcodes web-blue links that ignore the theme.
      syntaxHighlighting(appHighlightStyle, { fallback: true }),
      // In-note find highlighting, driven by our own NoteSearchBar (no CM6 panel
      // or Ctrl+F keymap — see noteSearch.ts for why we own the highlight).
      noteSearchExtension,
      wikilinkInteractions,
      wikilinkAutocomplete,
      taskInteractions,
      editorTheme,
      previewCompartment.of(previewExtensions(mode)),
      editableCompartment.of(editableExtensions(mode)),
    ],
  });
}
