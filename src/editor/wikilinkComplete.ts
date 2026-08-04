// Autocomplete for [[wikilinks]]. Typing "[[" pops a list of the vault's note
// titles; picking one REPLACES the whole [[ … ]] with the compound form,
// [[Title]](id:XYZ) — the link resolved to a real note the instant it was
// picked, so its slot fills right then (graph/wikilinkParse's header has the
// grammar; the (id:…) is hidden bookkeeping the user never sees). Also offers
// to create a brand-new note when what you've typed matches nothing yet, and
// that option fills its slot too: it CREATES the note and links it by id (see
// applyNewNote). Both picks therefore run one function, applyPick.
//
// Resolution itself is state/vault's findPathByTitle rather than a local copy,
// so the popup and the graph can never disagree about which note a title names.
//
// This module does import state/wikilink, for resolveOrCreateWikilinkTarget. The
// header used to say it must not, because createEditorState → this module →
// state/wikilink → state/ui → state/editor → createEditorState is a cycle. It is
// — but that cycle is already closed, twice, by this module's own siblings:
// createEditorState also loads editor/livePreview (which imports wikilinkExists
// and resolveNoteByTitle) and editor/wikilinkInteractions (convertWikilinkAndOpen).
// Adding a third edge to a cycle the editor bundle already lives in buys nothing
// in exchange for a hand-rolled second note-creation path, which is exactly the
// "two implementations that drift" failure this codebase keeps designing away
// from. Nothing here touches an imported binding at module-eval time — every use
// is inside a completion `apply`, which runs on a keystroke long after the graph
// has settled — so the cycle is inert.
import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";
import { vaultTree, findPathByTitle } from "../state/vault";
import { ensureNoteId } from "../state/noteId";
import { resolveOrCreateWikilinkTarget } from "../state/wikilink";
import { compoundLink, escapeSegment } from "../graph/wikilinkParse";
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

// Replace the QUERY range [from,to] with the chosen title and make sure a single
// "]]" follows, leaving the caret just after it. The [[ … ]] survives as typed.
function insertWikilink(view: EditorView, from: number, to: number, title: string) {
  const after = view.state.sliceDoc(to, to + 2);
  const closing = after === "]]" ? 2 : 0;
  const insert = closing ? title : `${title}]]`;
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + title.length + 2 },
    userEvent: "input.complete",
  });
}

// The whole [[ … ]] around a completion's query range, or null if that isn't
// what is there. `from` is the start of the query (the source sets it to
// token.from + 2), so the "[[" is two chars behind it; the "]]" is only there if
// the user — or autoClose — already typed it. Both ends are CHECKED rather than
// assumed: CodeMirror maps a completion's range through any edit made while the
// popup was open, and replacing a range that is no longer a link would eat two
// characters of unrelated text.
function constructRange(
  view: EditorView,
  from: number,
  to: number,
): { from: number; to: number } | null {
  if (from < 2 || view.state.sliceDoc(from - 2, from) !== "[[") return null;
  return { from: from - 2, to: view.state.sliceDoc(to, to + 2) === "]]" ? to + 2 : to };
}

// Picking an option: the link has resolved (or, for "New note", just been made
// to resolve), so its slot fills here and now. The entire [[ … ]] is replaced
// with [[Title]](id:XYZ) and the caret lands just past the hidden ")" — which
// is visually just past the "]]", since the parenthetical never renders — so
// from the user's side it reads exactly like the plain insertion (they see the
// title they picked), but nothing in the file depends on the note's filename
// any more: renaming it later rewrites this label in place (title-tracking)
// instead of breaking the link.
//
// `resolve` is the only difference between the two options, and it is a
// parameter rather than a branch so the offset arithmetic below — the part that
// can corrupt a note if it is wrong — exists exactly once. An EXISTING-note pick
// passes findPathByTitle (look it up, never create); a "New note" pick passes
// resolveOrCreateWikilinkTarget (look it up, create it in the current note's
// folder if it isn't there). Both return "" for a name that resolves to nothing
// and cannot be created, and "" degrades to the plain [[title]] insertion.
//
// ensureNoteId is safe to call from an apply: it is synchronous into the docs
// store and its fs write is fire-and-forget with its own .catch, so nothing here
// can throw or await inside CodeMirror's transaction.
//
// It CAN, however, move this document underneath us. Picking the note you are
// currently editing as its own link target is the case: ensureNoteId mints the id
// into the open note and then reloads the buffer from the store (state/noteId's
// header explains why it must — without the reload the id lives only in the store
// and the next flush deletes it, leaving the link we are about to write pointing
// at nothing, permanently and silently). That reload replaces the whole document,
// so `from`/`to` — captured when the popup was still showing the old text — are
// stale by the length of the frontmatter block withNoteId inserted.
//
// withNoteId only ever writes at the very TOP of the note (a fresh `---` block,
// or one more line inside the existing one), so the insertion is a pure prefix and
// every position below it moved by exactly the same delta. That makes the length
// delta a usable shift — but it is a HINT, not gospel: a [[ … ]] typed INSIDE the
// frontmatter would sit in the rewritten region and not shift uniformly at all.
// So the shifted range is re-verified twice before anything is dispatched —
// constructRange checks the "[[" (and the optional "]]") really are at the shifted
// ends, and the query text itself must still read character-for-character as it
// did before the call. Only then is it safe to replace. This mirrors the CLICK
// path's lenBefore/shift/re-derive dance in state/wikilink's
// convertWikilinkAndOpen (where it has to survive one ensureNoteId PER target),
// and confirmAddNote's in the same module — three sites, one reason.
//
// Any failure — the title resolves to nothing (a race: the note vanished between
// the popup opening and the pick), toIdLink refuses a blank display, the [[ … ]]
// is no longer there, or the shift does not verify — degrades to the plain
// [[title]] insertion rather than throwing away the keystroke or, far worse,
// splicing a link in at a wrong offset.
function applyPick(title: string, resolve: (title: string) => string) {
  return (view: EditorView, _c: Completion, from: number, to: number) => {
    const path = resolve(title);
    if (!path) {
      insertWikilink(view, from, to, title);
      return;
    }
    const lenBefore = view.state.doc.length;
    const queryBefore = view.state.sliceDoc(from, to);
    const id = ensureNoteId(path); // may replace this document — see above
    const len = view.state.doc.length;
    const shift = len - lenBefore;
    // Clamped so a delta this code did not predict can never produce an
    // out-of-range change spec (CM6 throws on one); the verification below is
    // what actually decides whether the shifted range is trustworthy.
    const sFrom = Math.max(0, Math.min(from + shift, len));
    const sTo = Math.max(sFrom, Math.min(to + shift, len));
    const link = title.trim() ? compoundLink(escapeSegment(title.trim()), [id]) : null;
    const range = link ? constructRange(view, sFrom, sTo) : null;
    if (!link || !range || view.state.sliceDoc(sFrom, sTo) !== queryBefore) {
      // Verification failed: the shifted range does not hold the query we
      // picked against, so we do not know where this link belongs. The plain
      // [[title]] fallback is only safe when NOTHING moved and the query is
      // still verifiably there — with a real shift in play, sFrom/sTo are the
      // very offsets just proven untrustworthy, and inserting at them splices
      // "Title]]" into unrelated text (the frontmatter case: withNoteId appends
      // INSIDE an existing block, so the query does not move while the length
      // does). Abandoning loses a keystroke; writing loses the note.
      if (shift === 0 && view.state.sliceDoc(from, to) === queryBefore) {
        insertWikilink(view, from, to, title);
      }
      return;
    }
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: link },
      selection: { anchor: range.from + link.length },
      userEvent: "input.complete",
    });
  };
}

// Picking an existing title: resolve only, never create.
const applyTitle = (title: string) => applyPick(title, findPathByTitle);

// The "New note" option, which CREATES the note and links it by id. That is the
// intended behaviour, not a side effect worth apologising for: this option only
// appears once the user has typed a name that matches nothing, and picking it is
// them saying "that one, the new one" — as explicit an act of naming a note as
// picking an existing title is. Creating it is the only way to have an id, and
// an id link is what every link in this app is supposed to become.
//
// It used to insert a bare [[query]] and create nothing, on the reasoning that a
// keystroke in a popup is too small a gesture to spawn a file, with the
// conversion deferred to whenever the link was later clicked. What that actually
// bought was a second live link form in every vault — the one shape of link that
// a rename could still rewrite through other people's prose — kept alive by the
// most-used way of making links in the app. The user's call settled it: every
// link should be an id link, none of them are exceptions.
//
// resolveOrCreateWikilinkTarget is what applyTitle's findPathByTitle cannot be
// here, and it also absorbs the case this function was originally split out for:
// "dir/Foo" is offered as a new note (no such basename in the title list) while
// a path lookup happily resolves it — resolveOrCreate does the lookup FIRST, so
// that pick links the existing note instead of creating a duplicate.
const applyNewNote = (title: string) => applyPick(title, resolveOrCreateWikilinkTarget);

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
    options.push({ label: q, detail: "New note", type: "class", apply: applyNewNote(q), boost: -1 });
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
