// Stable note identity, powering rename-proof [display](id:XYZ) links. The id
// lives INSIDE the note (frontmatter `id: XYZ`), so a file rename or move
// carries it along for free — resolution is a content lookup, never a filename
// one. Text-level parsing (noteIdOf/withNoteId/mintNoteId) is shared with the
// graph in graph/wikilinkParse; this module owns the vault-wide stateful side.
import { vaultTree } from "./vault";
import { readDoc, writeDoc, docExists } from "./documents";
import { vaultRoot } from "./session";
import { writeNoteFs } from "../backend/vaultApi";
import { noteIdOf, withNoteId, mintNoteId, normalizeNoteLinks } from "../graph/wikilinkParse";
import type { VaultNode } from "./vaultTypes";

// id → path, verified on every hit: a rename moves the path under the cache,
// and a bin/restore can resurrect an id at a new path. One readDoc re-check per
// lookup keeps hits O(1) while a stale entry falls through to a full walk.
const cache = new Map<string, string>();

export function findPathById(id: string): string {
  if (!id) return "";
  const hit = cache.get(id);
  if (hit && noteIdOf(readDoc(hit)) === id) return hit;
  cache.delete(id);
  // Miss → ONE full walk that indexes EVERY id it passes (first writer wins),
  // not an early-exit hunt for this one. A dead id (deleted/binned target) is a
  // designed steady state, and the live preview asks about it on every
  // decoration rebuild — an early-exit walk would re-scan the whole vault per
  // ask, forever. After a complete walk, absence is a definitive answer for
  // THIS ask; per-hit validation above keeps later answers honest.
  const walk = (ns: VaultNode[]) => {
    for (const n of ns) {
      if (n.isFolder) walk(n.children ?? []);
      else {
        const nid = noteIdOf(readDoc(n.path));
        if (nid && !cache.has(nid)) cache.set(nid, n.path);
      }
    }
  };
  walk(vaultTree);
  return cache.get(id) ?? "";
}

export function noteIdExists(id: string): boolean {
  return findPathById(id) !== "";
}

// ── Live-buffer bridge (injected, deliberately not imported) ──────────────────
// ensureNoteId reads and writes the DOCS STORE. But when `path` is the note the
// editor currently holds, the store is NOT the authoritative copy of that note —
// CodeMirror's live buffer is, and the two drift apart the moment the user types.
// Both halves of that drift are silent data loss:
//
//   • Stale read. With unflushed edits in the buffer, readDoc(path) is behind.
//     An `id:` the user just typed into the frontmatter by hand is invisible
//     here, so a SECOND id gets minted — and worse, withNoteId() derives the new
//     text from that stale copy, so the reload below would push it back into the
//     buffer and throw away every unsaved edit in the note.
//   • Lost write. The buffer never learns about the minted id, so the next
//     flushEditor() writes the buffer straight over the store and DESTROYS it.
//     Every [display](id:XYZ) written against that id is then permanently dead,
//     and clicking a dead id link is a deliberate no-op (openNoteById in
//     state/wikilink) — no error, no recovery, no way for the user to even tell.
//
// Fixed here, once, in the function that causes it: EVERY caller has the hazard
// (link click, completion pick, rename) and historically only one of them —
// editor/wikilinkInteractions — handled it.
//
// The hooks are INJECTED rather than imported because importing state/editor
// would close a real cycle:
//     state/noteId → state/editor → editor/createEditorState
//                  → editor/livePreview → state/noteId
// (livePreview needs findPathById to resolve [display](id:XYZ) decorations.)
// Injection is this codebase's established answer to exactly this shape — see
// editor/noteTitle's header, where the rename handler is injected "to keep this
// module free of a state/ui import cycle". Both slots are optional-chained at
// every use, so with nothing registered — the plain browser preview before the
// editor mounts, and the unit tests, neither of which has a live buffer at all —
// this module behaves exactly as it did before.
//
// Callers that already do the dance by hand keep working unchanged, because both
// hooks are idempotent: flushEditor() just re-writes text the store already has,
// and reloadEditorDoc() early-returns once buffer and store agree.
let liveFlush: (() => void) | null = null;
let liveReload: (() => void) | null = null;

// Registered once, at module scope, by state/editor (see the call site there).
export function setLiveDocHooks(flush: () => void, reload: () => void): void {
  liveFlush = flush;
  liveReload = reload;
}

// The note's id, minting one into its frontmatter if it has none yet. The write
// goes through the docs store AND to disk — the id must survive a restart, it
// IS the link target. Callers that only want to read use noteIdOf(readDoc(p)).
export function ensureNoteId(path: string): string {
  // BEFORE the read — and deliberately before the early return as well, not just
  // before the mint. `existing` is itself computed from readDoc(path), so the
  // decision "this note already has an id, nothing to do" is only trustworthy if
  // the store is current; a stale read there is what mints the duplicate id and
  // sets up the stale-text rewrite described above. The cost is one store write
  // of characters the user already typed, at a moment that is user-initiated
  // anyway (clicking a link, picking a completion, renaming a note), which is
  // precisely when the click and rename paths already flush by hand. The early
  // return itself stays write-free, so nothing is pulled back into the buffer.
  liveFlush?.();
  const text = readDoc(path);
  const existing = noteIdOf(text);
  if (existing) {
    cache.set(existing, path);
    return existing;
  }
  const id = mintNoteId();
  const next = withNoteId(text, id);
  writeDoc(path, next);
  const root = vaultRoot();
  if (root) writeNoteFs(root, path, next).catch((e) => console.error("write note id:", e));
  cache.set(id, path);
  // AFTER the write, and after cache.set: the reload dispatches a real CM6
  // transaction, and everything that transaction synchronously rebuilds — the
  // live-preview decorations, which resolve ids through findPathById — must see
  // the new id already indexed or it renders the link the user just made as dead.
  //
  // A no-op unless `path` IS the open note (reloadEditorDoc early-returns when the
  // store text already equals the buffer). When it is, this is the half that stops
  // the next flush from deleting the id: buffer and store agree again, so there is
  // nothing left for a later flush to overwrite. NOTE for callers that hold
  // document offsets across this call: this can replace the whole document, and
  // withNoteId's insertion is a pure prefix, so every body position shifts by the
  // length delta (editor/wikilinkComplete and editor/wikilinkInteractions both
  // recompute against it).
  liveReload?.();
  return id;
}

// ── Open-time normalization ───────────────────────────────────────────────────
// Bring one note's links up to the canonical grammar: migrate legacy
// [display](id:X) markdown links to the compound [[display]](id:X) form, and
// heal a compound whose slot count drifted from its segment count. Run by the
// Editor every time it loads a note (components/editor/Editor.load), BEFORE
// the text reaches CodeMirror — so the editor only ever renders canonical
// links, one note at a time, exactly when that note is touched. Un-opened
// notes keep their legacy links until their day comes; the graph and the
// rendered previews read the legacy form directly, so nothing is ever broken
// in the meantime, it just hasn't converged yet.
//
// This lives HERE (not in state/documents) because the migration needs id →
// title resolution (findPathById) and state/documents is BELOW this module in
// the import graph — importing back up from there would close a cycle.
//
// Returns true when the note's text changed (store + disk both updated).
export function normalizeDocLinks(path: string): boolean {
  if (!path || !docExists(path)) return false;
  const text = readDoc(path);
  const next = normalizeNoteLinks(text, (id) => {
    const p = findPathById(id);
    return p ? (p.split("/").pop() ?? p).replace(/\.md$/i, "") : null;
  });
  if (next === null) return false;
  writeDoc(path, next);
  const root = vaultRoot();
  if (root) writeNoteFs(root, path, next).catch((e) => console.error("normalize links:", e));
  return true;
}
