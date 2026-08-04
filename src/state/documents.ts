// Reactive per-note markdown store — the live "vault content": the editor
// loads/saves through it as tabs switch, and the graph/outline read from it.
// Starts EMPTY and is filled by replaceDocs() when a vault folder is opened.
import { createStore, produce, reconcile } from "solid-js/store";
import { hasWikilinkTo, rewriteLinksInText } from "../graph/wikilinkParse";
import { vaultRoot } from "./session";
import { writeNoteFs } from "../backend/vaultApi";

// Solid store keyed by vault path → markdown text.
const [docs, setDocs] = createStore<Record<string, string>>({});

// Read a note's text (reactive: tracks the path key inside a memo/effect).
export function readDoc(path: string): string {
  return docs[path] ?? "";
}

// Whether a note's content is present in the store (distinct from an empty note).
export function docExists(path: string): boolean {
  return docs[path] !== undefined;
}

// Overwrite a note's text (editor autosave / save-on-swap).
export function writeDoc(path: string, text: string): void {
  setDocs(path, text);
}

// Save only if the note still exists. Used by the editor's save-on-swap so a note
// that was just renamed or deleted (its key already moved/removed) is NOT brought
// back to life at its old path.
export function saveDoc(path: string, text: string): void {
  if (docs[path] !== undefined) setDocs(path, text);
}

// Create a note with initial content (no-op if it already exists — keeps content).
export function createDoc(path: string, initial = ""): void {
  if (docs[path] === undefined) setDocs(path, initial);
}

// Remove several notes' content at once and return what was removed, keyed by
// path (used by the bin to hold a deleted subtree's documents).
export function takeDocs(paths: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  setDocs(
    produce((d) => {
      for (const p of paths) {
        if (d[p] !== undefined) {
          out[p] = d[p];
          delete d[p];
        }
      }
    }),
  );
  return out;
}

// Replace ALL documents — bulk load from a real vault (Tauri read_vault).
export function replaceDocs(map: Record<string, string>): void {
  setDocs(reconcile(map));
}

// Restore a batch of notes' content (bin restore).
export function putDocs(map: Record<string, string>): void {
  setDocs(
    produce((d) => {
      for (const k in map) d[k] = map[k];
    }),
  );
}

// Move a note's content from one path to another (rename / move).
export function renameDoc(oldPath: string, newPath: string): void {
  if (oldPath === newPath) return;
  setDocs(
    produce((d) => {
      d[newPath] = d[oldPath] ?? "";
      delete d[oldPath];
    }),
  );
}

// ── Rename → link propagation ─────────────────────────────────────────────────
// The text-level rewrite semantics (title-tracking segments follow the rename,
// prose labels are never touched, title-resolved segments get their slot
// filled — graph/wikilinkParse's rewriteLinksInText has the full contract)
// live with the rest of the link grammar; this side owns the store sweep and
// the disk mirror.

// Whether ANY note in the vault holds a [[…]] link with a segment naming
// `title`. Cheap pre-check for renamePath: an id is only ever minted into the
// renamed note when a referrer actually exists — no link, no frontmatter
// surprise.
export function hasLinkTo(title: string): boolean {
  for (const p in docs) if (hasWikilinkTo(docs[p], title)) return true;
  return false;
}

// After a note rename: sweep every note. Segments whose SLOT pins the renamed
// note (its id) and whose text still reads as the old title are rewritten to
// the new one — unconditionally, the id makes it unambiguous. Segments that
// resolve BY the old title (bare links, "_" slots) are rewritten — and their
// slot filled with `id` — only when `rewriteBare` says the old name was
// unambiguous (no other note still answers to it). `id` is "" when the renamed
// note has no id and no referrer justified minting one. Returns the changed
// paths (also mirrored to disk).
export function rewriteLinksForRename(
  oldTitle: string,
  newTitle: string,
  id: string,
  rewriteBare: boolean,
): string[] {
  const changed: string[] = [];
  setDocs(
    produce((d) => {
      for (const p in d) {
        const next = rewriteLinksInText(d[p], oldTitle, newTitle, id, rewriteBare);
        if (next !== null) {
          d[p] = next;
          changed.push(p);
        }
      }
    }),
  );
  const root = vaultRoot();
  if (root) {
    for (const p of changed) {
      writeNoteFs(root, p, docs[p]).catch((e) => console.error("rewrite link:", e));
    }
  }
  return changed;
}
