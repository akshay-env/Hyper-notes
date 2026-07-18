// Notebook-aware context for the Ask-AI feature. Assembles, from the in-memory
// vault, a STRICTLY-SCOPED set of labelled sections — deliberately no vault-wide
// data, so an unrelated note elsewhere can never colour the answer:
//   • the current note (what "this note" means to the model),
//   • the optional highlighted passage the question is about,
//   • up to N notes it [[links]] to,
//   • its nearest few `parent:` ancestors (frontmatter chain, oldest→newest).
// Everything reads the reactive document store, so it works identically against
// the browser mock and a real Tauri vault.
import { vaultTree } from "../state/vault";
import { readDoc } from "../state/documents";
import { parseWikilink } from "../state/wikilink";
import type { VaultNode } from "../state/vaultTypes";

const CURRENT_CAP = 12000;
const LINKED_CAP = 2500;
const MAX_LINKED = 8;
const ANCESTOR_CAP = 8000;
const MAX_ANCESTORS = 2; // nearest N parents only — strict scope, no vault-wide bleed
const SELECTION_CAP = 4000;

const titleOf = (path: string) => path.split("/").pop()!.replace(/\.md$/i, "");

function stripFrontmatter(text: string): string {
  const m = /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n?/.exec(text);
  return m ? text.slice(m[0].length) : text;
}

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
    out.unshift({ title: parent, body: stripFrontmatter(readDoc(path)) });
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
  selection?: string,
): NotebookContext {
  const selfTitle = titleOf(currentPath);
  const parts: string[] = [];

  parts.push(`# This note: ${selfTitle}\n\n${clip(stripFrontmatter(currentBody).trim(), CURRENT_CAP)}`);

  // When the ask targets a highlighted passage, surface it prominently so the
  // model answers about that excerpt specifically (see EditorContextMenu → Ask AI).
  const sel = selection?.trim();
  if (sel) {
    parts.push(
      `# Selected passage (the question is specifically about THIS excerpt)\n\n${clip(sel, SELECTION_CAP)}`,
    );
  }

  const links = linkedTitles(currentBody, selfTitle).slice(0, MAX_LINKED);
  const linked = links
    .map((t) => ({ t, path: pathByTitle(t) }))
    .filter((l) => l.path);
  if (linked.length) {
    const blocks = linked.map(
      (l) => `## ${l.t}\n\n${clip(stripFrontmatter(readDoc(l.path)).trim(), LINKED_CAP)}`,
    );
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
  if (sel) hintBits.push(`selection`);
  if (ancestors.length) hintBits.push(`${ancestors.length} ancestor${ancestors.length > 1 ? "s" : ""}`);
  if (linked.length) hintBits.push(`${linked.length} linked note${linked.length > 1 ? "s" : ""}`);

  return { text: parts.join("\n\n---\n\n"), hint: `Context: ${hintBits.join(" + ")}` };
}
