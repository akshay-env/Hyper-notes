// Positional anchoring for a selection-scoped ask.
//
// The problem this solves: sending the selected text on its own ("cell") alongside
// the note body is ambiguous the moment those words appear more than once. The
// model has no way to tell which occurrence the question is about, so it averages
// across all of them and answers generically. The fix is positional — the passage
// is delivered IN PLACE, wrapped in markers, so exactly one occurrence in the whole
// context is distinguishable from every other.
//
// Everything here is pure string/offset arithmetic over a note body: no CodeMirror,
// no store, no Solid. That is deliberate. Offsets arrive as CodeMirror document
// positions and have to survive frontmatter stripping, trimming and clipping before
// they index the string the model sees; an off-by-N in that chain doesn't throw, it
// quietly marks the wrong words — which looks exactly like the bug this module is
// meant to remove. Keeping the maths pure makes it unit-testable (see
// __tests__/selectionAnchor.test.mts). src/ai/context.ts composes these.

/// Wrapped around the selected passage. Chosen for being effectively absent from
/// real notes and for colliding with nothing the editor writes — `**` is markdown,
/// `[[ ]]` is a wikilink, `==` is a highlight. Any pair the note DOES contain is
/// neutralised first (see neutraliseMarkers), so the inserted pair is always unique.
export const MARK_OPEN = "⟦";
export const MARK_CLOSE = "⟧";

/// A selection to anchor: the text as captured, plus where it was captured from.
/// The offsets are optional because they aren't always trustworthy (the note may
/// have been edited since) — resolveRange treats them as a hint, not gospel.
export interface Anchor {
  text: string;
  /// Offsets into the RAW note body — i.e. CodeMirror document positions.
  from?: number;
  to?: number;
}

export interface Normalized {
  body: string;
  /// How many characters were removed from the FRONT. Subtract from a raw
  /// CodeMirror offset to get the equivalent index into `body`.
  shift: number;
}

const FRONTMATTER = /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n?/;

/// Strip a leading YAML frontmatter block and surrounding whitespace, reporting how
/// much came off the front. The `shift` is the whole point: the old code stripped
/// frontmatter and then indexed the result with raw editor offsets, which is wrong
/// by exactly the frontmatter length on every note that has one.
export function normalizeBody(raw: string): Normalized {
  const m = FRONTMATTER.exec(raw);
  const afterFm = m ? raw.slice(m[0].length) : raw;
  const lead = afterFm.length - afterFm.trimStart().length;
  return { body: afterFm.trim(), shift: (m ? m[0].length : 0) + lead };
}

/// Replace any marker characters the note itself contains, so the pair we insert is
/// the only one in the context. The substitution is 1:1 in length on purpose, so it
/// can run at any point in the pipeline without invalidating a single offset.
///
/// ⟦ ⟧ are Oxford brackets — real notation (denotational semantics, proof
/// assistants), so a notebook can legitimately contain them. They are replaced with
/// guillemets rather than `|`, which is markdown table-cell syntax and would make a
/// rewritten line read to the model as a malformed table. Callers should only
/// neutralise when a marker pair is actually going to be inserted.
export function neutraliseMarkers(s: string): string {
  return s.replace(/⟦/g, "«").replace(/⟧/g, "»");
}

/// Where the selection actually sits in `body`, or null if it can't be pinned down.
///
/// The supplied range wins whenever it still holds the expected text — that is the
/// normal path and the only one that can disambiguate repeated text. When the note
/// has drifted underneath it (edited while the popup was open, offsets captured
/// against another copy) we fall back to searching for the text, and accept that
/// ONLY when it occurs exactly once: a second occurrence is precisely the ambiguity
/// this module exists to remove, so guessing between them would defeat the purpose.
export function resolveRange(body: string, a: Anchor): { from: number; to: number } | null {
  const want = a.text.trim();
  if (!want) return null;

  if (a.from != null && a.to != null && a.from >= 0 && a.from < a.to && a.to <= body.length) {
    const raw = body.slice(a.from, a.to);
    if (raw.trim() === want) {
      // Tighten to the trimmed content so the markers wrap the passage itself and
      // not whatever whitespace the selection happened to drag along.
      const lead = raw.length - raw.trimStart().length;
      const trail = raw.length - raw.trimEnd().length;
      return { from: a.from + lead, to: a.to - trail };
    }
  }

  const first = body.indexOf(want);
  if (first === -1) return null;
  if (body.indexOf(want, first + 1) !== -1) return null; // ambiguous — refuse to guess
  return { from: first, to: first + want.length };
}

export interface Clipped {
  text: string;
  /// Characters dropped from the front (net of any prefix added). Subtract from a
  /// `body` offset to get the equivalent index into `text`.
  shift: number;
}

const TRUNC = "…(truncated)";

/// A `cap`-sized window of `body`.
///
/// With no focus this is the head of the note, which is the historical behaviour.
/// With one, the window is CENTRED on it — so a passage 30,000 characters into a
/// long note still arrives with its own surroundings instead of being clipped away
/// entirely, which is the other half of why long-note asks used to answer vaguely.
export function clipAround(body: string, cap: number, focus?: number): Clipped {
  if (cap <= 0) return { text: "", shift: 0 };
  if (body.length <= cap) return { text: body, shift: 0 };
  if (focus == null) return { text: body.slice(0, cap) + "\n" + TRUNC, shift: 0 };

  const start = Math.max(0, Math.min(focus - Math.floor(cap / 2), body.length - cap));
  const end = start + cap;
  const head = start > 0 ? TRUNC + "\n" : "";
  const tail = end < body.length ? "\n" + TRUNC : "";
  return { text: head + body.slice(start, end) + tail, shift: start - head.length };
}

/// `body` with the range wrapped in markers. Offsets must index `body`.
export function insertMarkers(body: string, from: number, to: number): string {
  return body.slice(0, from) + MARK_OPEN + body.slice(from, to) + MARK_CLOSE + body.slice(to);
}

/// The marked passage plus `radius` characters of its own surroundings — the
/// sentence or paragraph it came from. This is what actually disambiguates a word
/// that appears many times: only one occurrence arrives both wrapped in markers and
/// carrying the prose that fixes its meaning.
///
/// A very long selection has its middle elided rather than being cut off, so the
/// closing marker always survives — a truncated excerpt that lost its `⟧` would
/// leave the model unable to tell where the passage ends.
export function excerpt(
  body: string,
  from: number,
  to: number,
  radius: number,
  maxSelection = Infinity,
): string {
  const selected = body.slice(from, to);
  const half = Math.floor(maxSelection / 2);
  const shown =
    selected.length > maxSelection && half > 0
      ? selected.slice(0, half) + " … " + selected.slice(selected.length - half)
      : selected;

  const start = Math.max(0, from - radius);
  const end = Math.min(body.length, to + radius);
  return (
    (start > 0 ? "…" : "") +
    body.slice(start, from) +
    MARK_OPEN +
    shown +
    MARK_CLOSE +
    body.slice(to, end) +
    (end < body.length ? "…" : "")
  );
}
