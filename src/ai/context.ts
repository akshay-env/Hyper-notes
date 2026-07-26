// Notebook-aware context for the Ask-AI feature. Assembles, from the in-memory
// vault, a STRICTLY-SCOPED set of labelled sections — deliberately no vault-wide
// data, so an unrelated note elsewhere can never colour the answer:
//   • the current note (what "this note" means to the model),
//   • the optional highlighted passage the question is about,
//   • up to N notes it [[links]] to,
//   • its nearest few `parent:` ancestors (frontmatter chain, oldest→newest).
// Everything reads the reactive document store, so it works identically against
// the browser mock and a real Tauri vault.
//
// A selection-scoped ask is anchored POSITIONALLY, not by text: the passage is
// marked in place (see ai/selectionAnchor.ts) so a word that appears several times
// in the note is still unambiguous. Sending the bare selected text — which is what
// this did before — left the model to guess which occurrence was meant.
import { vaultTree } from "../state/vault";
import { readDoc } from "../state/documents";
import { parseWikilink } from "../state/wikilink";
import type { VaultNode } from "../state/vaultTypes";
import {
  MARK_CLOSE,
  MARK_OPEN,
  clipAround,
  excerpt,
  insertMarkers,
  neutraliseMarkers,
  normalizeBody,
  resolveRange,
  type Anchor,
} from "./selectionAnchor";

const CURRENT_CAP = 12000;
const LINKED_CAP = 2500;
const MAX_LINKED = 8;
const ANCESTOR_CAP = 8000;
const MAX_ANCESTORS = 2; // nearest N parents only — strict scope, no vault-wide bleed
const SELECTION_CAP = 4000;
/// Characters of the note kept either side of a marked passage. Roughly a couple of
/// sentences — enough to fix what an ambiguous word means without re-sending the
/// note (which is already present, marked, in the "This note" section).
const SELECTION_RADIUS = 400;

const titleOf = (path: string) => path.split("/").pop()!.replace(/\.md$/i, "");

// The `parent:` field of a leading YAML frontmatter block, if any.
function frontmatterParent(text: string): string | null {
  const fm = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!fm) return null;
  const p = /^\s*parent\s*:\s*(.+?)\s*$/m.exec(fm[1]);
  return p ? p[1].replace(/^["']|["']$/g, "") : null;
}

// Flatten the vault tree to note paths (files only).
function allNotePaths(nodes: VaultNode[] = vaultTree, out: string[] = []): string[] {
  for (const n of nodes) {
    if (n.isFolder) allNotePaths(n.children ?? [], out);
    else out.push(n.path);
  }
  return out;
}

function pathByTitle(title: string): string {
  const want = title.replace(/[#^].*$/, "").trim().toLowerCase();
  for (const p of allNotePaths()) if (titleOf(p).toLowerCase() === want) return p;
  return "";
}

const clip = (s: string, cap: number) => (s.length > cap ? s.slice(0, cap) + "\n…(truncated)" : s);
// Other notes carry no offsets, so they only ever need the stripped body.
const bodyOf = (text: string) => normalizeBody(text).body;

// Titles this note links to via [[wikilinks]] (deduped, excluding itself).
function linkedTitles(body: string, selfTitle: string): string[] {
  const seen = new Set<string>();
  const re = /\[\[([^[\]]+)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    for (const t of parseWikilink(m[1]).targets) {
      const key = t.replace(/[#^].*$/, "").trim();
      if (key && key.toLowerCase() !== selfTitle.toLowerCase()) seen.add(key);
    }
  }
  return [...seen];
}

// The frontmatter `parent:` chain, oldest ancestor first (cycle-guarded).
function ancestorChain(startTitle: string): { title: string; body: string }[] {
  const out: { title: string; body: string }[] = [];
  const visited = new Set<string>([startTitle.toLowerCase()]);
  let parent = frontmatterParent(readDoc(pathByTitle(startTitle)));
  while (parent && !visited.has(parent.toLowerCase()) && out.length < 32) {
    visited.add(parent.toLowerCase());
    const path = pathByTitle(parent);
    if (!path) break;
    out.unshift({ title: parent, body: bodyOf(readDoc(path)) });
    parent = frontmatterParent(readDoc(path));
  }
  return out;
}

export interface NotebookContext {
  text: string; // the assembled context sent to the model
  hint: string; // a short human description for the Ask bar
}

export function buildNotebookContext(
  currentPath: string,
  currentBody: string,
  selection?: Anchor,
): NotebookContext {
  const selfTitle = titleOf(currentPath);
  const parts: string[] = [];

  // Offsets arrive as CodeMirror document positions — indices into the RAW note,
  // frontmatter and all. Every string below is the NORMALISED body, so rebase them
  // exactly once, here. Skipping this doesn't throw; it silently marks the wrong
  // span on every note that has frontmatter.
  const { body: stripped, shift } = normalizeBody(currentBody);
  // Neutralise the note's own markers ONLY when a pair is actually going to be
  // inserted (1:1 in length, so offsets survive). ⟦ ⟧ are Oxford brackets and a
  // notebook may legitimately use them, so rewriting them on the no-selection Ask
  // bar path — which never marks anything — would corrupt the note for no reason
  // and break that path's byte-for-byte equivalence with the old behaviour.
  //
  // `wanted` gets the SAME treatment: comparing a raw selection against a
  // neutralised body would fail both the range check and the indexOf fallback, so a
  // passage containing ⟦ or ⟧ could never anchor, and the fallback branch below
  // would then print real markers into the one section the model is told to trust.
  const wanted = neutraliseMarkers(selection?.text.trim() ?? "");
  const body = wanted ? neutraliseMarkers(stripped) : stripped;

  const anchor = wanted
    ? resolveRange(body, {
        text: wanted,
        from: selection?.from == null ? undefined : selection.from - shift,
        to: selection?.to == null ? undefined : selection.to - shift,
      })
    : null;

  // The current note — clipped AROUND the selection when there is one, so a passage
  // deep inside a long note keeps its surroundings instead of falling outside the
  // cap entirely, and marked in place so its position is unambiguous.
  const clipped = clipAround(body, CURRENT_CAP, anchor ? anchor.from : undefined);
  let noteText = clipped.text;
  let markedInNote = false;
  if (anchor) {
    const from = anchor.from - clipped.shift;
    const to = anchor.to - clipped.shift;
    // Only mark in place if the range survived the clip whole; a half-clipped span
    // would put a marker somewhere meaningless. A selection longer than the window
    // (select-all on a long note) is the case that lands here.
    if (from >= 0 && from < to && to <= noteText.length) {
      noteText = insertMarkers(noteText, from, to);
      markedInNote = true;
    }
  }
  parts.push(`# This note: ${selfTitle}\n\n${noteText}`);

  // When the ask targets a highlighted passage, surface it with the prose around it
  // so the model can settle what an ambiguous word means HERE (see EditorContextMenu
  // → Ask AI). The markers tie this excerpt to one specific occurrence in the note
  // above — which is the whole reason a repeated word no longer averages out.
  if (anchor) {
    // The marker characters are backticked so they read as NAMED literals; bare in
    // prose they look like an empty marked span. The second clause only claims the
    // inline mark when one was actually inserted — a selection longer than the clip
    // window has no counterpart in "This note" to point at.
    parts.push(
      `# Selected passage (the question is about the text between \`${MARK_OPEN}\` and \`${MARK_CLOSE}\`, ` +
        (markedInNote
          ? `the same occurrence marked in "This note" above, shown here with its surrounding text)`
          : `shown here with its surrounding text)`) +
        `\n\n${excerpt(body, anchor.from, anchor.to, SELECTION_RADIUS, SELECTION_CAP)}`,
    );
  } else if (wanted) {
    // The passage couldn't be located — the note changed underneath the ask, or the
    // text occurs in several places with nothing to say which. Fall back to the bare
    // excerpt (the old behaviour) rather than dropping the user's selection.
    parts.push(
      `# Selected passage (the question is specifically about THIS excerpt)\n\n${clip(wanted, SELECTION_CAP)}`,
    );
  }

  const links = linkedTitles(currentBody, selfTitle).slice(0, MAX_LINKED);
  const linked = links
    .map((t) => ({ t, path: pathByTitle(t) }))
    .filter((l) => l.path);
  if (linked.length) {
    const blocks = linked.map((l) => `## ${l.t}\n\n${clip(bodyOf(readDoc(l.path)), LINKED_CAP)}`);
    parts.push(`# Linked notes\n\n${blocks.join("\n\n")}`);
  }

  // Only the nearest MAX_ANCESTORS parents — deliberately NOT the whole vault, so
  // an unrelated note elsewhere in the tree can never colour the answer.
  const ancestors = ancestorChain(selfTitle).slice(-MAX_ANCESTORS);
  if (ancestors.length) {
    let budget = ANCESTOR_CAP;
    const blocks: string[] = [];
    for (const a of ancestors) {
      const body = clip(a.body.trim(), Math.max(400, budget));
      budget -= body.length;
      blocks.push(`## ${a.title}\n\n${body}`);
      if (budget <= 0) break;
    }
    parts.push(`# Ancestor notes (parent chain)\n\n${blocks.join("\n\n")}`);
  }

  const hintBits = [`this note`];
  if (wanted) hintBits.push(`selection`);
  if (ancestors.length) hintBits.push(`${ancestors.length} ancestor${ancestors.length > 1 ? "s" : ""}`);
  if (linked.length) hintBits.push(`${linked.length} linked note${linked.length > 1 ? "s" : ""}`);

  return { text: parts.join("\n\n---\n\n"), hint: `Context: ${hintBits.join(" + ")}` };
}
