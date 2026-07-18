// Wikilink interaction state + helpers. Powers the editor hover-preview card and
// click-to-open, including multi-target links [[label|A|B|C]] (openLink.js
// parseInner in the Qt app). The CM6 dom handlers (editor/wikilinkInteractions)
// feed this; WikilinkHoverCard renders from it.
import { createSignal } from "solid-js";
import { type VaultNode } from "./vaultTypes";
import { vaultTree } from "./vault";
import { readDoc } from "./documents";
import { selectNoteByPath, createNoteIn, activeNoteFolder } from "./ui";
import { editorView } from "./editor";
import { parseWikilinkInner, titleKey, normalizeTarget } from "../graph/wikilinkParse";

export interface WikilinkHover {
  label: string;
  targets: string[];
  rect: DOMRect;
}
export const [wikilinkHover, setWikilinkHover] = createSignal<WikilinkHover | null>(null);

// Re-exported so callers keep importing it from here; the implementation is
// shared with the graph builder (see graph/wikilinkParse).
export const parseWikilink = parseWikilinkInner;

// Resolve a link target to a note path, the same way the graph draws its edges.
// The target is normalized (anchor/".md"/whitespace stripped) and matched
// case-insensitively against each note's basename OR its full vault-relative
// path, so [[Note]], [[folder/Note]], [[Note#Heading]] and [[Note.md]] all
// resolve. An exact path match wins over a basename match.
function findPathByTitle(nodes: VaultNode[], rawTitle: string): string {
  const want = titleKey(normalizeTarget(rawTitle));
  if (!want) return "";
  const wantBase = want.includes("/") ? want.slice(want.lastIndexOf("/") + 1) : want;
  let pathHit = "";
  let nameHit = "";
  const walk = (ns: VaultNode[]) => {
    for (const n of ns) {
      if (n.isFolder) {
        walk(n.children ?? []);
        continue;
      }
      const noExt = n.path.replace(/\.md$/i, "").replace(/^\//, "");
      const pathKey = titleKey(noExt);
      const nameKey = titleKey(noExt.split("/").pop() || noExt);
      if (!pathHit && pathKey === want) pathHit = n.path;
      if (!nameHit && nameKey === wantBase) nameHit = n.path;
    }
  };
  walk(nodes);
  return pathHit || nameHit;
}

// True when a wikilink target already resolves to a note in the vault.
export function wikilinkExists(title: string): boolean {
  return findPathByTitle(vaultTree, title) !== "";
}

// Resolve a note title to its path + current text (embed transclusion reads
// through this so ![[Note]] renders the same doc the editor would open).
export function resolveNoteByTitle(title: string): { path: string; text: string } | null {
  const path = findPathByTitle(vaultTree, title);
  if (!path) return null;
  return { path, text: readDoc(path) };
}

// Open a note by title. If no note resolves yet, CREATE it (in the folder of the
// note that holds the link) and open it — clicking an unresolved [[link]] is how
// you make the note. The new note is named after the target's plain basename (no
// anchor, no folder prefix, no ".md") so it matches the link and resolves on
// every later click instead of spawning a duplicate each time.
export function openWikilinkTarget(title: string) {
  const path = findPathByTitle(vaultTree, title);
  if (path) {
    selectNoteByPath(path);
    return;
  }
  const name = normalizeTarget(title).split("/").pop()?.trim() ?? "";
  if (name) createNoteIn(activeNoteFolder(), name);
}
export function openAllWikilinkTargets(titles: string[]) {
  for (const t of titles) openWikilinkTarget(t);
}

function stripFrontmatter(text: string): string {
  const m = /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n?/.exec(text);
  return m ? text.slice(m[0].length) : text;
}

// A short preview of a note for the single-target hover card.
export interface NotePreview {
  title: string;
  exists: boolean;
  lines: string[];
}
export function notePreview(title: string): NotePreview {
  const path = findPathByTitle(vaultTree, title);
  if (!path) return { title, exists: false, lines: [] };
  const noteTitle = path.split("/").pop()!.replace(/\.md$/i, "");
  const body = stripFrontmatter(readDoc(path));
  const out: string[] = [];
  for (const raw of body.split("\n")) {
    const l = raw.trim();
    if (!l) continue;
    const clean = l
      .replace(/^#{1,6}\s+/, "") // heading marks
      .replace(/^>\s?/, "") // blockquote
      .replace(/^[-*+]\s+/, "• ") // bullets
      .replace(/\[\[([^\]]+)\]\]/g, (_, i) => i.split("|")[0]) // [[label|…]] → label
      .replace(/[`*_~]/g, ""); // inline emphasis/code marks
    if (out.length === 0 && clean === noteTitle) continue; // skip a leading H1 = title
    out.push(clean);
    if (out.length >= 4) break;
  }
  return { title: noteTitle, exists: true, lines: out };
}

// ── Hover show/hide with a small close delay (so the pointer can travel from the
//    link into the card without it vanishing). ─────────────────────────────────
let hideTimer: number | undefined;
export function showWikilink(h: WikilinkHover) {
  clearTimeout(hideTimer);
  setWikilinkHover(h);
}
export function scheduleHideWikilink() {
  clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => setWikilinkHover(null), 160);
}
export function cancelHideWikilink() {
  clearTimeout(hideTimer);
}
export function hideWikilinkNow() {
  clearTimeout(hideTimer);
  setWikilinkHover(null);
}

// ── "Add note" to a link ──────────────────────────────────────────────────────
// From the link's right-click menu: name a note, and it's appended as another
// target of the link ([[A]] → [[A | B]]) and created (in the current note's
// folder) if it doesn't exist yet. `addNoteLink` holds the document range of the
// [[ … ]] being extended while the name dialog is open.
export const [addNoteLink, setAddNoteLink] = createSignal<{ from: number; to: number } | null>(null);

export function openAddNoteForLink(from: number, to: number) {
  setAddNoteLink({ from, to });
}
export function cancelAddNote() {
  setAddNoteLink(null);
}

// Append `name` as a target of the link at the stored range and ensure the note
// exists. Skips the insert if it's already a target (no duplicate targets); only
// creates a file when nothing resolves to that name yet.
export function confirmAddNote(rawName: string) {
  const target = addNoteLink();
  setAddNoteLink(null);
  // Drop characters that would break the [[…|…]] syntax (| [ ] # ^) or aren't
  // valid in a filename (/ \ : * ? " < >).
  const name = rawName.replace(/[\\/:*?"<>|[\]#^]/g, "").trim();
  const view = editorView();
  if (!target || !name || !view) return;

  const inner = view.state.sliceDoc(target.from + 2, target.to - 2);
  const want = titleKey(normalizeTarget(name));
  const already = parseWikilinkInner(inner).targets.some(
    (t) => titleKey(normalizeTarget(t)) === want,
  );
  if (!already) {
    view.dispatch({
      changes: { from: target.to - 2, insert: ` | ${name}` },
      userEvent: "input.wikilink",
    });
  }
  if (!findPathByTitle(vaultTree, name)) {
    const base = normalizeTarget(name).split("/").pop()?.trim() ?? "";
    if (base) createNoteIn(activeNoteFolder(), base, false); // create, don't leave the note
  }
}
