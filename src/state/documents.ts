// Reactive per-note markdown store — the live "vault content": the editor
// loads/saves through it as tabs switch, and the graph/outline read from it.
// Starts EMPTY and is filled by replaceDocs() when a vault folder is opened.
import { createStore, produce, reconcile } from "solid-js/store";
import { stripNonLinkRegions } from "../graph/wikilinkParse";
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

// Delete a note's content.
export function deleteDoc(path: string): void {
  setDocs(produce((d) => void delete d[path]));
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
// Rewrite one segment of a wikilink's inner text: if its note name (ignoring a
// folder prefix, "#/^" anchor, ".md" and surrounding spaces) is `wantKey`,
// swap that name for `newTitle`, keeping the prefix, anchor and spacing intact.
function rewriteSegment(seg: string, wantKey: string, newTitle: string): string {
  const lead = seg.match(/^\s*/)![0];
  const trail = seg.match(/\s*$/)![0];
  const core = seg.slice(lead.length, seg.length - trail.length);
  const anchorIdx = core.search(/[#^]/);
  const namePart = anchorIdx >= 0 ? core.slice(0, anchorIdx) : core;
  const anchor = anchorIdx >= 0 ? core.slice(anchorIdx) : "";
  const noMd = namePart.replace(/\.md$/i, "");
  const slash = noMd.lastIndexOf("/");
  const base = slash >= 0 ? noMd.slice(slash + 1) : noMd;
  if (base.trim().toLowerCase() !== wantKey) return seg;
  const prefix = slash >= 0 ? noMd.slice(0, slash + 1) : "";
  return lead + prefix + newTitle + anchor + trail;
}

// Rewrite every real [[…]] link in `text` whose target is `wantKey` → `newTitle`.
// Links inside code/frontmatter are skipped (stripNonLinkRegions blanks them but
// keeps offsets). Returns the new text, or null if nothing changed.
function rewriteLinksInText(text: string, wantKey: string, newTitle: string): string | null {
  const blanked = stripNonLinkRegions(text);
  const re = /\[\[[^\]\n]+\]\]/g;
  let m: RegExpExecArray | null;
  let out = "";
  let last = 0;
  let changed = false;
  while ((m = re.exec(blanked)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    const inner = text.slice(start + 2, end - 2);
    const newInner = inner
      .split("|")
      .map((s) => rewriteSegment(s, wantKey, newTitle))
      .join("|");
    if (newInner !== inner) {
      out += text.slice(last, start) + "[[" + newInner + "]]";
      last = end;
      changed = true;
    }
  }
  return changed ? out + text.slice(last) : null;
}

// Point every [[oldTitle]] link across the vault at [[newTitle]] (after a note
// rename). Returns the paths whose content changed (also mirrored to disk).
export function rewriteLinksForRename(oldTitle: string, newTitle: string): string[] {
  const wantKey = oldTitle.trim().toLowerCase();
  const changed: string[] = [];
  setDocs(
    produce((d) => {
      for (const p in d) {
        const next = rewriteLinksInText(d[p], wantKey, newTitle);
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
