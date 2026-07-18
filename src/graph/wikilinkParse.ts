// The single source of truth for how [[wikilink]] text is parsed and resolved.
// Both the graph builder (which draws the edges) and the editor's click/hover
// handler (which opens the notes) go through here — they used to have separate
// copies of this logic and disagreed about aliases, which meant the graph drew
// an edge the click would never follow.
//
// Link grammar:
//   [[A]]        → one target A, shown as "A"
//   [[A|B]]      → a multi-target link to A and B, shown as "A"
//   [[A|B|C|…]]  → a multi-target link to every part, shown as "A"
// The FIRST part is always the displayed label; EVERY part is a link target. A
// left-click opens the first (shown) target; the right-click menu opens any of
// them, opens all in tabs, or adds another target.

export interface ParsedWikilink {
  label: string; // text shown in the editor (always the first part)
  targets: string[]; // every note the link points at
}

export function parseWikilinkInner(inner: string): ParsedWikilink {
  const parts = inner
    .split("|")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length === 0) return { label: "", targets: [] };
  return { label: parts[0], targets: parts.slice() };
}

// Normalize a link target for note resolution: drop a "#heading" / "^block"
// anchor, a trailing ".md", and surrounding whitespace.
//   "Note.md"        → "Note"
//   "Note#Section"   → "Note"
//   "folder/Note"    → "folder/Note"   (path kept — resolved case-insensitively)
export function normalizeTarget(target: string): string {
  let t = target.trim();
  const anchor = t.search(/[#^]/);
  if (anchor >= 0) t = t.slice(0, anchor);
  return t.replace(/\.md$/i, "").trim();
}

// Which slice of a wikilink's inner text is DISPLAYED in the editor (the rest of
// the [[ … ]] is hidden). Always the FIRST segment: [[A]] → "A", [[A|B|…]] → "A".
// A #heading / ^block anchor on it is dropped from the display. Returns offsets
// INTO `inner` (add node.from + 2 for document positions).
export function wikilinkDisplaySpan(inner: string): { start: number; end: number } {
  const pipe = inner.indexOf("|");
  let seg = pipe >= 0 ? inner.slice(0, pipe) : inner;
  const anchor = seg.search(/[#^]/);
  if (anchor >= 0) seg = seg.slice(0, anchor); // hide the anchor in the display
  const lead = seg.length - seg.trimStart().length;
  const shown = seg.trim();
  if (!shown) return { start: 0, end: inner.length }; // nothing to show → raw
  return { start: lead, end: lead + shown.length };
}

// Markdown regions where a [[…]] is text, not a link: YAML frontmatter, fenced
// code blocks, and inline code spans. Blanked (not deleted) so nothing merges
// across the removed region and forms a spurious link.
const blank = (s: string) => s.replace(/[^\n]/g, " ");

export function stripNonLinkRegions(text: string): string {
  // Leading YAML frontmatter.
  let out = text.replace(/^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/, blank);

  // Fenced code blocks, scanned line by line: a regex here either stops at the
  // first line end or runs to EOF, and both get the "``` … ``` then [[Link]]"
  // case wrong. A fence opens on ``` / ~~~ and closes on the same marker.
  const lines = out.split("\n");
  let fence: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(lines[i])?.[1];
    if (fence === null) {
      if (marker) {
        fence = marker[0]; // ` or ~
        lines[i] = blank(lines[i]);
      }
    } else {
      const closes = marker !== undefined && marker[0] === fence;
      lines[i] = blank(lines[i]);
      if (closes) fence = null;
    }
  }
  out = lines.join("\n");

  // Inline code spans (a run of backticks closed by an equal-length run).
  out = out.replace(/(`+)(?:[^`]|(?!\1)`)*?\1/g, blank);
  return out;
}

// Every link destination in a note, in document order, deduplicated. Titles that
// don't resolve to a note are ignored downstream (they draw no edge).
export function extractLinks(text: string): string[] {
  const source = stripNonLinkRegions(text);
  const links: string[] = [];
  const seen = new Set<string>();
  const regex = /\[\[([^\]\n]+)\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(source)) !== null) {
    for (const t of parseWikilinkInner(match[1]).targets) {
      if (!seen.has(t)) {
        seen.add(t);
        links.push(t);
      }
    }
  }
  return links;
}

// Link resolution is case-insensitive on the note title ([[alpha]] finds
// "Alpha.md"), the way Obsidian resolves them.
export const titleKey = (title: string) => title.trim().toLowerCase();
