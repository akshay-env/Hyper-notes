// The single source of truth for how note-link text is parsed and resolved.
// Both the graph builder (which draws the edges) and the editor's click/hover
// handler (which opens the notes) go through here — they used to have separate
// copies of this logic and disagreed about aliases, which meant the graph drew
// an edge the click would never follow.
//
// Link grammar — ONE canonical form:
//   [[A]](id:X)            → one target, shown as "A", resolved by note id X
//   [[A|B|C]](id:X,Y,Z)    → multi-target: segment i is labelled by its text
//                            and resolved by slot i of the id list
//   [[A]]  /  [[A|B|C]]    → the TYPED form: what a user writes by hand. It
//                            resolves by title until it is clicked, at which
//                            point the clicked target is created (if needed),
//                            its id minted, and the id list appended/filled.
//
// The (id:…) parenthetical is MACHINE BOOKKEEPING and is never shown: the live
// preview hides it even when the caret is on the link (the one token exempt
// from per-token reveal), the caret can never enter it (atomic range), and the
// user only ever sees and edits the [[…]] half.
//
// SLOTS. The id list is positional: slot i belongs to segment i. A slot is
// either a real id ([A-Za-z0-9]+) or the sentinel "_" meaning "this segment
// has not resolved yet — fall back to its title". So [[A|B]](id:X,_) opens A
// by id and B by title, and clicking B fills the slot. This is what lets a
// click create ONLY the target the user aimed at (the user's rule: "nothing
// is created while typing; the note is created when you click it") while the
// already-resolved segments keep their rename-proof ids.
//
// The separator is a COMMA, not the `|` the segment list uses, and that is not
// a taste call: a `|` inside the parenthetical would shear any GFM table the
// link sat in. A comma can never collide with an id's charset.
//
// ESCAPES. A segment may contain `\|`, `\[` and `\]` — the three characters
// that would otherwise break the grammar ("|" splits segments, "]]" ends the
// link). The live preview hides the backslashes, so the visible text is the
// user's exact prose. linkifySelection (the Ask-AI passage wrap) writes them;
// hand-typed titles never need them.
//
// LABELS. A segment's text is displayed AS STORED — it belongs to the writer.
// Rename tracking is an EVENT, not a display substitution: when a note is
// renamed, every segment that (a) carries that note's id in its slot and
// (b) still reads as the OLD title is rewritten to the new one — instantly,
// vault-wide, which is safe precisely because the id pins the note. A segment
// whose text is NOT the old title is prose (an Ask-AI passage label, or a
// label the user edited on purpose) and is never touched by any rename, ever.
// The reverse direction — editing a segment's text in the referring note —
// renames the TARGET note (editor/linkEditCommit), so label and title stay in
// step from either side unless the writer deliberately breaks them apart.
//
// LEGACY. Older vaults hold [display](id:X) markdown links (the previous
// canonical form). They are still READ everywhere (graph edges, rendered
// previews, clicks) but no longer written; normalizeNoteLinks converts them to
// the compound form the first time their note is opened in the editor.

export interface ParsedWikilink {
  label: string; // text shown in the editor (always the first segment)
  targets: string[]; // every note the link points at (title-level, unescaped)
}

// ── Segment escaping ──────────────────────────────────────────────────────────
// The four characters a segment may carry only in escaped form: the three
// grammar characters (`|` splits segments, `[`/`]` open and close the link) and
// the backslash itself.
//
// Escaping the backslash is not optional, however much it would be nicer to
// leave Windows paths alone. Without it, two authored strings collide: prose
// containing a literal "\|" escapes to "\\|", which reads back as an escaped
// BACKSLASH followed by a live separator — one link silently becomes two. And a
// label ending in "\" ("C:\Users\") escapes to a trailing "\]" that eats the
// link's own closing bracket, so linkifySelection emits text that is not a link
// at all and leaves its "(id:…)" visible as prose.
//
// The reader below is deliberately more forgiving than the writer: a backslash
// is an escape ONLY when the next character is one of the four. A lone "\" in
// hand-typed text ("C:\Users") therefore stays a literal backslash and cannot
// swallow a bracket — so text this module never wrote still parses sensibly.
const ESCAPABLE = "\\|[]";
const isEscape = (text: string, i: number) =>
  text[i] === "\\" && i + 1 < text.length && ESCAPABLE.includes(text[i + 1]);

export function escapeSegment(text: string): string {
  return text.replace(/[\\|[\]]/g, (c) => "\\" + c);
}

export function unescapeSegment(raw: string): string {
  return raw.replace(/\\([\\|[\]])/g, "$1");
}

// Split a wikilink's inner text on UNESCAPED pipes, keeping each raw segment
// and its offset into `inner` (the editor needs offsets; parsers need text).
export function splitRawSegments(inner: string): { raw: string; from: number }[] {
  const out: { raw: string; from: number }[] = [];
  let start = 0;
  for (let i = 0; i < inner.length; i++) {
    if (isEscape(inner, i)) {
      i++; // skip the escaped char
    } else if (inner[i] === "|") {
      out.push({ raw: inner.slice(start, i), from: start });
      start = i + 1;
    }
  }
  out.push({ raw: inner.slice(start), from: start });
  return out;
}

export function parseWikilinkInner(inner: string): ParsedWikilink {
  const parts = splitRawSegments(inner)
    .map((s) => unescapeSegment(s.raw).trim())
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
// Returns offsets INTO `inner` (add node.from + 2 for document positions).
// Escape-aware: an escaped \| does not end the first segment.
//
// `dropAnchor` decides whether a "#heading" / "^block" suffix is hidden, and the
// caller answers it with one question: does this segment resolve by its TEXT?
//   • A title-resolved segment (bare link, or a "_" slot) does — normalizeTarget
//     strips the anchor before looking the note up, so the anchor is syntax and
//     showing it would be showing plumbing. Hide it.
//   • A segment whose slot pins a real id does NOT. Its text is a LABEL, and a
//     label may be arbitrary prose — "x^2 + y^2 dominates", "issue #42
//     rationale" — which the Ask-AI wrap stores byte-faithfully. Truncating at
//     the first #/^ would silently swallow most of the user's sentence, and the
//     grammar gives prose no way to escape those characters. Show it whole.
export function wikilinkDisplaySpan(
  inner: string,
  dropAnchor = true,
): { start: number; end: number } {
  const first = splitRawSegments(inner)[0];
  let seg = first.raw;
  if (dropAnchor) {
    const anchor = seg.search(/[#^]/);
    if (anchor >= 0) seg = seg.slice(0, anchor);
  }
  const lead = seg.length - seg.trimStart().length;
  const shown = seg.trim();
  if (!shown) return { start: 0, end: inner.length }; // nothing to show → raw
  return { start: first.from + lead, end: first.from + lead + shown.length };
}

// ── Slot lists ────────────────────────────────────────────────────────────────
// The id-destination grammar, written once: "id:" then one or more slots
// separated by commas. A slot is a real id or the "_" sentinel (unresolved).
// Every reader of a destination — this file, the live preview, the renderer —
// goes through the helpers below rather than re-deriving it, because a second
// copy that drifts produces a link the reader sees as a note link but the click
// handler doesn't.
const SLOT_LIST_RE = /^id:((?:[A-Za-z0-9]+|_)(?:,(?:[A-Za-z0-9]+|_))*)$/;

// Every slot in a destination, in order — a real id as a string, an unresolved
// "_" as null. Not a slot destination at all → []. A malformed list
// ("id:AAA,", "id:,BBB", "id:AA-BB") yields [] rather than the slots that could
// be salvaged: half-parsing would silently drop a target, and a link that
// quietly points at fewer notes than it says is worse than one that visibly
// stops being a note link.
export function parseIdSlots(dest: string): (string | null)[] {
  const m = SLOT_LIST_RE.exec(dest.trim());
  return m ? m[1].split(",").map((s) => (s === "_" ? null : s)) : [];
}

// The REAL ids only (sentinels dropped) — what the graph and the legacy-form
// readers ask. "Which notes does this destination actually pin?"
export function parseIdTargets(dest: string): string[] {
  return parseIdSlots(dest).filter((s): s is string => s !== null);
}

// The FIRST real id, or null. "Is this a note link, and which note does a
// plain left-click open" — mirroring the wikilink rule that the first target
// is the shown one.
export const parseIdTarget = (dest: string): string | null => parseIdTargets(dest)[0] ?? null;

// slots → the destination string, the inverse of parseIdSlots. An all-null (or
// empty) list gives "" deliberately: a parenthetical with no real id pins
// nothing, so callers must write the bare [[…]] form instead.
export function slotsDestination(slots: (string | null)[]): string {
  if (!slots.length || slots.every((s) => s === null)) return "";
  return `id:${slots.map((s) => s ?? "_").join(",")}`;
}

// The full destination string for one real id: "id:XYZ". Kept as a prefixed
// token so extractLinks' output can hold both title targets and id targets
// without ambiguity — a note literally titled "id:XYZ" would still be written
// [[id:XYZ]] and resolve by title, not through this namespace.
export const idTarget = (id: string) => `id:${id}`;

// ── The compound form, in one place ───────────────────────────────────────────
// Build the canonical text for a link: `[[inner]]` when no slot is real,
// `[[inner]](id:…)` otherwise. `inner` is RAW segment text (escapes included)
// and is preserved byte-for-byte — the visible label must never move when a
// slot fills in.
export function compoundLink(inner: string, slots: (string | null)[]): string {
  const dest = slotsDestination(slots);
  return dest ? `[[${inner}]](${dest})` : `[[${inner}]]`;
}

// Take apart the full text of one link node: the inner segment text, where the
// hidden parenthetical starts (offset into `text`, -1 when absent), and the
// slot list (null when absent). Returns null when `text` is not a note link.
export interface NoteLinkParts {
  inner: string;
  innerFrom: number; // always 2
  innerTo: number; // offset of the closing "]]"
  destFrom: number; // offset of "(", or -1 for the bare form
  slots: (string | null)[] | null; // null for the bare form
}

export function noteLinkParts(text: string): NoteLinkParts | null {
  if (!text.startsWith("[[")) return null;
  // Find the closing "]]", escape-aware (see isEscape: a lone backslash is a
  // literal, so it can never swallow the link's own closing bracket).
  let close = -1;
  for (let i = 2; i < text.length; i++) {
    if (isEscape(text, i)) i++;
    else if (text[i] === "]" && text[i + 1] === "]") {
      close = i;
      break;
    }
  }
  if (close <= 2) return null; // unclosed or empty [[]]
  const inner = text.slice(2, close);
  const tail = text.slice(close + 2);
  if (tail === "") return { inner, innerFrom: 2, innerTo: close, destFrom: -1, slots: null };
  const m = /^\((id:[A-Za-z0-9_,]+)\)$/.exec(tail);
  if (!m) return null; // trailing junk — not one link node's text
  const slots = parseIdSlots(m[1]);
  if (!slots.length) return null; // malformed slot list — not a note link
  return { inner, innerFrom: 2, innerTo: close, destFrom: close + 2, slots };
}

// Per-segment slot lookup that tolerates a healing-pending count mismatch:
// segment i resolves by slots[i] when that slot exists and is real, by title
// otherwise. (normalizeNoteLinks pads/truncates the stored list on open.)
export function slotFor(slots: (string | null)[] | null, i: number): string | null {
  return slots?.[i] ?? null;
}

// ── Non-link regions ──────────────────────────────────────────────────────────
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
  //
  // The body may cross a single line break but NEVER a blank line — a code span
  // cannot span paragraphs in CommonMark, and neither the editor's own parser
  // nor any renderer treats it as one. Without that bound, two unrelated stray
  // backticks ("don`t" in one paragraph, "here`s" three paragraphs later) pair
  // up and blank every link between them: the editor shows those links working
  // while the graph draws no edge and renames skip them, so renaming their
  // target leaves them silently broken.
  out = out.replace(/(`+)(?:[^`\n]|\n(?![ \t]*\n)|(?!\1)`)*?\1/g, blank);
  return out;
}

// ── Link scanning (shared by extractLinks / rewrites / normalization) ─────────
// One regex for a whole [[…]] link with its optional (id:…) tail, escape-aware.
// Fresh instance per use — a shared g-flag regex would carry lastIndex.
const linkScan = () => /\[\[((?:\\.|[^\\\]\n])+)\]\](?:\((id:[A-Za-z0-9_,]+)\))?/g;

// Legacy [display](id:LIST) — the previous canonical form, read-only now. The
// display can't contain "]" (that would end the link text), and the compound
// form can never match this (its "]](" never fits "[…](…)" here).
//
// The (?<!!) guard is load-bearing for the MIGRATION, not just tidiness: a
// "![My note](id:X)" (someone prefixing a legacy link with "!") would otherwise
// migrate to "![[My note]](id:X)", which the CM parser reads as an EMBED — and
// embeds deliberately refuse to consume an id tail, so the "(id:X)" would
// become permanently visible prose. Excluding the "!" leaves such text alone
// instead, which is the safe answer for a shape that was never a note link.
const legacyScan = () => /(?<!!)\[([^\]\n]+)\]\(\s*(id:[A-Za-z0-9,]+)\s*\)/g;

// Every link destination in a note, in document order, deduplicated. Titles
// that don't resolve to a note are ignored downstream (they draw no edge).
// Compound links contribute one token PER SEGMENT: the slot's id ("id:XYZ")
// when it is real, the segment's title otherwise — so [[A|B]](id:X,_) draws an
// edge to X's note and an edge to whatever "B" resolves to. Legacy links
// contribute one id token per destination id.
export function extractLinks(text: string): string[] {
  const source = stripNonLinkRegions(text);
  const links: string[] = [];
  const seen = new Set<string>();
  const add = (t: string) => {
    if (t && !seen.has(t)) {
      seen.add(t);
      links.push(t);
    }
  };

  // Compound + bare wikilinks in one pass; blank the matched spans so the
  // legacy pass below can't re-match a compound's "]](id:…)" tail.
  let blanked = source;
  const re = linkScan();
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    // A tail the regex found but the slot grammar rejects ("[[A]](id:X1,)" —
    // a hand-mangled list) is NOT a note link: noteLinkParts returns null for
    // it, so the editor leaves it raw and no click will ever follow it. The
    // graph must agree and draw nothing. Falling back to the segment titles
    // here would put an edge on screen that is unreachable by any click — the
    // precise graph/click disagreement this module exists to prevent.
    const slots = m[2] ? parseIdSlots(m[2]) : null;
    if (m[2] && !slots!.length) {
      blanked =
        blanked.slice(0, m.index) + blank(m[0]) + blanked.slice(m.index + m[0].length);
      continue;
    }
    const segs = splitRawSegments(m[1]);
    for (let i = 0; i < segs.length; i++) {
      const id = slotFor(slots, i);
      if (id) add(idTarget(id));
      else {
        const title = unescapeSegment(segs[i].raw).trim();
        if (title) add(title);
      }
    }
    blanked =
      blanked.slice(0, m.index) + blank(m[0]) + blanked.slice(m.index + m[0].length);
  }

  const legacy = legacyScan();
  while ((m = legacy.exec(blanked)) !== null) {
    for (const id of parseIdTargets(m[2])) add(idTarget(id));
  }
  return links;
}

// ── Markdown link destinations (legacy readers) ───────────────────────────────
// The destination of a `[text](dest)` node, given that node's full source text:
// `close` is the offset of the "](" that ends the link TEXT (callers hide from
// there to the end of the node), `dest` is the target with an optional <…>
// wrapper stripped and any trailing "title" dropped. Returns null when there is
// no link text at all ("[](x)").
export function linkDestination(text: string): { close: number; dest: string } | null {
  const close = text.indexOf("](");
  if (close <= 0) return null;
  let dest = text.slice(close + 2, -1).trim();
  if (dest.startsWith("<") && dest.endsWith(">")) dest = dest.slice(1, -1);
  dest = dest.split(/\s+/)[0] ?? "";
  return { close, dest };
}

// The FIRST note id a legacy markdown link points at, or null for an ordinary
// URL link.
export function idLinkTarget(text: string): string | null {
  const d = linkDestination(text);
  return d ? parseIdTarget(d.dest) : null;
}

// EVERY note id a legacy markdown link points at, in document order; [] for an
// ordinary URL link.
export function idLinkTargets(text: string): string[] {
  const d = linkDestination(text);
  return d ? parseIdTargets(d.dest) : [];
}

// ── Note identity (frontmatter `id:`) ─────────────────────────────────────────
// Pure text-level helpers; the stateful side (vault-wide id → path resolution,
// minting an id INTO a note) lives in state/noteId.ts.

const FRONTMATTER_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/;
const ID_KEY_RE = /^id[ \t]*:[ \t]*([A-Za-z0-9]+)[ \t]*$/m;

// The note's stable id, if its frontmatter declares one.
export function noteIdOf(text: string): string | null {
  const fm = FRONTMATTER_RE.exec(text);
  if (!fm) return null;
  const m = ID_KEY_RE.exec(fm[1]);
  return m ? m[1] : null;
}

// Inject `id` into a note's frontmatter (creating the block when absent),
// returning the new text. Never overwrites an existing id — noteIdOf first.
export function withNoteId(text: string, id: string): string {
  const fm = FRONTMATTER_RE.exec(text);
  if (!fm) return `---\nid: ${id}\n---\n\n${text}`;
  return `---\n${fm[1]}\nid: ${id}\n---\n${text.slice(fm[0].length)}`;
}

// 12 hex chars (48 random bits) — collision-safe at vault scale, filename-free
// (the id never appears in a filename), and matching the slot charset. "_" can
// never be minted, so the sentinel can't collide with a real id.
export function mintNoteId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

// ── Rename → link rewriting (pure text level) ─────────────────────────────────
// Split one segment of a wikilink's inner text into its spacing, an optional
// folder prefix, the note name itself, and an optional "#/^" anchor. Operates
// on RAW text; the base is compared unescaped.
function splitSegment(seg: string) {
  const lead = seg.match(/^\s*/)![0];
  const trail = seg.match(/\s*$/)![0];
  const core = seg.slice(lead.length, seg.length - trail.length);
  const anchorIdx = core.search(/[#^]/);
  const namePart = anchorIdx >= 0 ? core.slice(0, anchorIdx) : core;
  const anchor = anchorIdx >= 0 ? core.slice(anchorIdx) : "";
  const noMd = namePart.replace(/\.md$/i, "");
  const slash = noMd.lastIndexOf("/");
  return {
    lead,
    trail,
    anchor,
    prefix: slash >= 0 ? noMd.slice(0, slash + 1) : "",
    base: slash >= 0 ? noMd.slice(slash + 1) : noMd,
  };
}

// Whether a segment's note name (ignoring prefix/anchor/".md"/spaces/escapes)
// is wantKey (a titleKey()-normalized title). This is the TITLE-RESOLUTION
// test: it mirrors normalizeTarget/findPathByTitle, so it answers "would this
// segment's text resolve to that note".
function segmentMatches(seg: string, wantKey: string): boolean {
  return titleKey(unescapeSegment(splitSegment(seg).base)) === wantKey;
}

// Whether a segment's text IS the title, character for character (modulo case
// and surrounding space). Deliberately stricter than segmentMatches, and used
// only for segments whose slot already pins the note: there the text is a
// LABEL, and the contract is that a rename touches it only when it is exactly
// the old title. A prose label that merely STARTS with the title — "Chapter 3 #
// summary" on a link pinned to "Chapter 3" — is not the title, and rewriting it
// (to "Intro # summary") would be a rename editing someone's prose, the exact
// thing this design forbids. segmentMatches would say yes, because it strips
// from the "#" on; that stripping is right for resolution and wrong for
// identity.
function segmentIsTitle(seg: string, wantKey: string): boolean {
  return titleKey(unescapeSegment(seg)) === wantKey;
}

// Rewrite one segment: swap a matching name for `newTitle` (escaped), keeping
// the prefix, anchor and spacing intact.
function rewriteSegment(seg: string, wantKey: string, newTitle: string): string {
  const s = splitSegment(seg);
  if (titleKey(unescapeSegment(s.base)) !== wantKey) return seg;
  return s.lead + s.prefix + escapeSegment(newTitle) + s.anchor + s.trail;
}

// Whether `text` holds any [[…]] link with a segment naming `title` (code and
// frontmatter regions excluded). Used to gate id-minting on rename: only a
// note some link actually points at (by title) needs an id right then.
export function hasWikilinkTo(text: string, title: string): boolean {
  const wantKey = titleKey(title);
  const blanked = stripNonLinkRegions(text);
  const re = linkScan();
  let m: RegExpExecArray | null;
  while ((m = re.exec(blanked)) !== null) {
    if (splitRawSegments(m[1]).some((s) => segmentMatches(s.raw, wantKey))) return true;
  }
  return false;
}

// Rewrite every link in `text` affected by renaming `oldTitle` → `newTitle`
// (`id` = the renamed note's id, "" when it has none). Links inside code and
// frontmatter are skipped. Returns the new text, or null if nothing changed.
//
// What tracks the rename, and why (the "labels are the writer's" contract):
//   • A segment whose SLOT is the renamed note's id AND whose text still reads
//     as the old title → text swapped to the new title. The id pins the note,
//     so this is unambiguous, needs no gate, and is what makes link text follow
//     the title Notion-style — instantly, vault-wide.
//   • A segment whose slot is empty ("_" or a bare link) and whose text is the
//     old title resolves BY that text, so it must be rewritten or it breaks.
//     Gated by `rewriteBare` (the caller's "no other note answers to the old
//     name" ambiguity check). When `id` is known the slot is FILLED at the same
//     time — the rename proved which note the title meant, so the link comes
//     out rename-proof: [[Foo]] → [[Bar]](id:X).
//   • A segment whose slot is the renamed note's id but whose text is NOT the
//     old title is PROSE (an Ask-AI passage label, or a label the user chose).
//     It is never touched — renames must not edit prose.
//   • Legacy [display](id:X) links match nothing here: their display is prose
//     by construction and their resolution rides the id already.
export function rewriteLinksInText(
  text: string,
  oldTitle: string,
  newTitle: string,
  id: string,
  rewriteBare = true,
): string | null {
  const wantKey = titleKey(oldTitle);
  const blanked = stripNonLinkRegions(text);
  const re = linkScan();
  let m: RegExpExecArray | null;
  let out = "";
  let last = 0;
  let changed = false;
  while ((m = re.exec(blanked)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    // Offsets from the blanked scan are valid in `text` (blanking preserves
    // length), but the segment TEXT must come from the real document.
    const real = text.slice(start, end);
    const parts = noteLinkParts(real);
    if (!parts) continue;
    const segs = splitRawSegments(parts.inner);
    const slots: (string | null)[] =
      parts.slots ?? new Array<string | null>(segs.length).fill(null);
    let segChanged = false;
    let slotChanged = false;
    const newSegs = segs.map((s, i) => {
      const slot = slotFor(slots, i);
      if (slot === id && id !== "" && segmentIsTitle(s.raw, wantKey)) {
        // Exact-title label on a pinned segment → tracks the rename. The
        // rewrite keeps only the surrounding whitespace, because an exact match
        // means there is no prefix or anchor to preserve.
        segChanged = true;
        const lead = s.raw.match(/^\s*/)![0];
        const trail = s.raw.match(/\s*$/)![0];
        return lead + escapeSegment(newTitle) + trail;
      }
      if (slot === null && rewriteBare && segmentMatches(s.raw, wantKey)) {
        segChanged = true;
        if (id) {
          slots[i] = id;
          slotChanged = true;
        }
        return rewriteSegment(s.raw, wantKey, newTitle);
      }
      return s.raw;
    });
    if (!segChanged && !slotChanged) continue;
    // Pad the slot list to the segment count so a fill can't misalign it.
    while (slots.length < newSegs.length) slots.push(null);
    out += text.slice(last, start) + compoundLink(newSegs.join("|"), slots.slice(0, newSegs.length));
    last = end;
    changed = true;
  }
  return changed ? out + text.slice(last) : null;
}

// ── Open-time normalization ───────────────────────────────────────────────────
// Run when a note is loaded into the editor (state/noteId.normalizeDocLinks):
//   1. LEGACY MIGRATION — [display](id:A,B) becomes [[display|TitleOfB]](id:A,B):
//      the stored display text survives byte-faithfully as the first segment
//      (unescaping the old form's "\[" and re-escaping for the new grammar), and
//      each FURTHER id gets a segment from its live title (`titleOfId`), since
//      the old form stored no label for them. A dead extra id keeps its slot
//      under a "Missing note" label — dropping it would silently renumber the
//      link's targets.
//   2. SLOT HEALING — a hand-mangled compound whose slot count drifted from its
//      segment count is padded with "_" / truncated so slot i is segment i's
//      again.
// Labels are NOT refreshed against live titles here — rename tracking happens
// at rename time (rewriteLinksInText above), and a label that differs from its
// note's title is the writer's prose, not staleness.
// Returns the new text, or null if nothing changed.
export function normalizeNoteLinks(
  text: string,
  titleOfId: (id: string) => string | null,
): string | null {
  const blanked = stripNonLinkRegions(text);
  type Patch = { from: number; to: number; insert: string };
  const patches: Patch[] = [];

  // 2. Slot healing on compound links (scan first; legacy can't overlap these).
  // Compound spans are blanked with "]" rather than spaces: the legacy regex's
  // display class is [^\]\n]+, so a "]" wall makes it impossible for a legacy
  // match to reach ACROSS a compound link (e.g. hand-written
  // "[a [[B]](id:x) c](id:y)" must not swallow the working compound into a
  // migrated label — overlapping patches would corrupt the output).
  const wall = (s: string) => s.replace(/[^\n]/g, "]");
  const re = linkScan();
  let m: RegExpExecArray | null;
  let scanBlanked = blanked;
  while ((m = re.exec(blanked)) !== null) {
    const real = text.slice(m.index, m.index + m[0].length);
    const parts = noteLinkParts(real);
    scanBlanked =
      scanBlanked.slice(0, m.index) + wall(m[0]) + scanBlanked.slice(m.index + m[0].length);
    if (!parts || !parts.slots) continue;
    const segCount = splitRawSegments(parts.inner).length;
    if (parts.slots.length === segCount) continue;
    const healed = parts.slots.slice(0, segCount);
    while (healed.length < segCount) healed.push(null);
    patches.push({
      from: m.index,
      to: m.index + m[0].length,
      insert: compoundLink(parts.inner, healed),
    });
  }

  // 1. Legacy migration (on the remainder — compound spans blanked above).
  const legacy = legacyScan();
  while ((m = legacy.exec(scanBlanked)) !== null) {
    const display = text.slice(m.index + 1, m.index + 1 + m[1].length);
    const ids = parseIdTargets(m[2]);
    if (!ids.length) continue; // malformed — leave it alone
    // The old form escaped "[" in its display; unescape that, then re-escape
    // for the segment grammar (which also needs "|" and "]" covered).
    const first = escapeSegment(display.replace(/\\\[/g, "["));
    const segs = [first];
    for (let k = 1; k < ids.length; k++) {
      segs.push(escapeSegment(titleOfId(ids[k]) ?? "Missing note"));
    }
    patches.push({
      from: m.index,
      to: m.index + m[0].length,
      insert: compoundLink(segs.join("|"), ids),
    });
  }

  if (!patches.length) return null;
  patches.sort((a, b) => a.from - b.from);
  let out = "";
  let last = 0;
  for (const p of patches) {
    out += text.slice(last, p.from) + p.insert;
    last = p.to;
  }
  return out + text.slice(last);
}

// ── Ask-AI passage wrap ───────────────────────────────────────────────────────
// Wrap a passage in [[passage]](id:XYZ) links, preserving EVERY character of
// the original text as the label — this replaces a selection in its note, so it
// must be byte-faithful to what the user wrote (escapes are invisible: the live
// preview hides the backslashes).
//
// One link would be ideal, but a link cannot cross a line break and a
// line-leading block marker (#, >, -, 1., |) means something at line start —
// wrapping "# Heading" whole would demote it to a paragraph. So: link per line,
// each line's block prefix left OUTSIDE the link ("# [[Heading]](id:x)" keeps
// the heading; "- [[item]](id:x)" keeps the bullet). Blank lines pass through
// verbatim. Table rows and code-fence lines are left unwrapped entirely —
// bracketing either corrupts its block — the neighbouring lines still carry
// the link.
// Line indices belonging to a GFM table. A leading "|" is the easy case (and
// the only one the guard used to catch); a table may equally be written without
// one — "Name | Age" over "--- | ---" — and there the delimiter row is what
// identifies it. Wrapping any of those lines destroys the table: the delimiter
// row in particular stops parsing as one the moment it gains brackets, which
// silently demotes the whole block to paragraphs.
//
// So: find delimiter rows (all of -, :, | and space, with at least one "-" and
// one "|"), then claim the header line above and the body lines below for as
// long as they carry a "|".
function tableLines(lines: string[]): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t || !/^[-:| ]+$/.test(t) || !t.includes("-") || !t.includes("|")) continue;
    if (i === 0 || !lines[i - 1].trim() || !lines[i - 1].includes("|")) continue;
    out.add(i - 1);
    out.add(i);
    for (let j = i + 1; j < lines.length && lines[j].trim() && lines[j].includes("|"); j++) {
      out.add(j);
    }
  }
  return out;
}

export function linkifySelection(text: string, id: string): string {
  const lines = text.split("\n");
  const single = lines.length === 1;
  const inTable = tableLines(lines);
  let inFence = false;
  return lines
    .map((line, idx) => {
      // Fence markers AND everything between them pass verbatim: code is
      // literal text, so a wrap would show up as raw link syntax inside it.
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      if (!line.trim()) return line; // blank separator — verbatim
      if (/^\s*\|/.test(line) || inTable.has(idx)) return line; // table row
      // Block prefix stays outside the link so the line keeps its meaning. It
      // is peeled off BEFORE escaping — a task marker's own "- [x] " contains
      // brackets, and only the body becomes the label.
      const m = /^(\s*(?:#{1,6}\s+|>\s*|[-*+]\s+(?:\[.\]\s+)?|\d+[.)]\s+)?)([\s\S]*)$/.exec(line)!;
      const prefix = single ? "" : m[1];
      const body = single ? line : m[2];
      if (!body) return line;
      return `${prefix}[[${escapeSegment(body)}]](id:${id})`;
    })
    .join("\n");
}

// Link resolution is case-insensitive on the note title ([[alpha]] finds
// "Alpha.md"), the way Obsidian resolves them.
export const titleKey = (title: string) => title.trim().toLowerCase();
