// Autocomplete for [[wikilinks]]. Typing "[[" pops a list of the vault's note
// titles; picking one inserts it and closes the link with "]]". Also offers to
// create a brand-new note when what you've typed matches nothing yet.
import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";
import { vaultTree } from "../state/vault";
import type { VaultNode } from "../state/vaultTypes";

// All note titles in the vault (basenames, no ".md"), de-duplicated in tree order.
function noteTitles(): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const walk = (ns: VaultNode[]) => {
    for (const n of ns) {
      if (n.isFolder) walk(n.children ?? []);
      else {
        const t = n.name.replace(/\.md$/i, "");
        const key = t.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          out.push(t);
        }
      }
    }
  };
  walk(vaultTree);
  return out;
}

// Replace [from,to] with the chosen title and make sure a single "]]" follows,
// leaving the caret just after it.
function applyTitle(title: string) {
  return (view: EditorView, _c: Completion, from: number, to: number) => {
    const after = view.state.sliceDoc(to, to + 2);
    const closing = after === "]]" ? 2 : 0;
    const insert = closing ? title : `${title}]]`;
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + title.length + 2 },
      userEvent: "input.complete",
    });
  };
}

function wikilinkSource(ctx: CompletionContext): CompletionResult | null {
  // Cursor sits right after "[[" then any text that isn't a "]" or "|" yet.
  const token = ctx.matchBefore(/\[\[([^\]|\n]*)$/);
  if (!token) return null;
  const from = token.from + 2; // start of the query, just past "[["
  const query = token.text.slice(2);
  if (query === "" && !ctx.explicit && token.to !== from) return null;

  const titles = noteTitles();
  const options: Completion[] = titles.map((t) => ({
    label: t,
    type: "text",
    apply: applyTitle(t),
  }));

  // Offer to create a new note when the typed name matches nothing exactly.
  const q = query.trim();
  if (q && !titles.some((t) => t.toLowerCase() === q.toLowerCase())) {
    options.push({ label: q, detail: "New note", type: "class", apply: applyTitle(q), boost: -1 });
  }

  // No validFor: re-run on each keystroke so the "New note" option reflects the
  // latest query (a cached filter would never surface it).
  return { from, options };
}

export const wikilinkAutocomplete = autocompletion({
  override: [wikilinkSource],
  icons: false,
  activateOnTyping: true,
  defaultKeymap: false, // the completion keys are wired in createEditorState
});
