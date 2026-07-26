// Offset maths for selection-scoped asks. Every failure mode here is SILENT in
// production — a wrong offset marks the wrong words and the answer just reads
// vague — so the cases below pin the composition rather than the parts.
import {
  MARK_CLOSE,
  MARK_OPEN,
  clipAround,
  excerpt,
  insertMarkers,
  neutraliseMarkers,
  normalizeBody,
  resolveRange,
} from "../selectionAnchor";

let pass = 0, fail = 0;
const eq = (n: string, g: unknown, w: unknown) => {
  const a = JSON.stringify(g), b = JSON.stringify(w);
  if (a === b) { pass++; console.log(`  ok  ${n}`); }
  else { fail++; console.log(`  FAIL ${n}\n       got  ${a}\n       want ${b}`); }
};
const ok = (n: string, cond: boolean) => eq(n, cond, true);

console.log("\n— normalizeBody —");
eq("no frontmatter → shift 0", normalizeBody("hello"), { body: "hello", shift: 0 });
{
  const raw = "---\ntitle: X\n---\nbody text";
  const n = normalizeBody(raw);
  eq("frontmatter stripped", n.body, "body text");
  eq("shift = frontmatter length", n.shift, raw.indexOf("body text"));
  ok("shift rebases an offset onto the body", raw.slice(n.shift) === n.body);
}
{
  // The trailing newline after the closing --- is part of the block.
  const raw = "---\na: 1\n---\n\n  padded\n";
  const n = normalizeBody(raw);
  eq("leading blank lines also counted", n.body, "padded");
  eq("offset of 'padded' rebases exactly", raw.indexOf("padded") - n.shift, 0);
}
{
  const raw = "---\r\ntitle: X\r\n---\r\nCRLF body";
  const n = normalizeBody(raw);
  eq("CRLF frontmatter", n.body, "CRLF body");
  eq("CRLF shift rebases", raw.indexOf("CRLF body") - n.shift, 0);
}
eq("--- mid-doc is not frontmatter", normalizeBody("text\n---\nmore").body, "text\n---\nmore");

console.log("\n— neutraliseMarkers —");
eq("length preserved (offsets survive)", neutraliseMarkers("a⟦b⟧c").length, "a⟦b⟧c".length);
eq("markers replaced", neutraliseMarkers("a⟦b⟧c"), "a«b»c");
eq("untouched when absent", neutraliseMarkers("plain"), "plain");
// `|` would read as markdown table syntax to the model — a note using Oxford
// brackets (denotational semantics) must not come out looking like a broken table.
ok("does not substitute a table pipe", !neutraliseMarkers("⟦e⟧ρ = ρ(x)").includes("|"));
eq("open and close stay distinguishable", neutraliseMarkers("⟦e⟧"), "«e»");

console.log("\n— resolveRange —");
{
  const body = "The prison cell was cold. A plant cell has a nucleus.";
  const second = body.lastIndexOf("cell");
  eq("range wins over first match", resolveRange(body, { text: "cell", from: second, to: second + 4 }), { from: second, to: second + 4 });
  eq("first occurrence resolvable by range", resolveRange(body, { text: "cell", from: 11, to: 15 }), { from: 11, to: 15 });
  // THE case this module exists for: no range, repeated text → refuse to guess.
  eq("repeated text without a range → null", resolveRange(body, { text: "cell" }), null);
  eq("unique text without a range → located", resolveRange(body, { text: "nucleus" }), { from: body.indexOf("nucleus"), to: body.indexOf("nucleus") + 7 });
}
{
  const body = "alpha beta gamma";
  eq("stale range falls back to unique search", resolveRange(body, { text: "gamma", from: 0, to: 5 }), { from: 11, to: 16 });
  eq("text absent → null", resolveRange(body, { text: "delta", from: 0, to: 5 }), null);
  eq("empty text → null", resolveRange(body, { text: "   ", from: 0, to: 3 }), null);
  eq("range past end falls back", resolveRange(body, { text: "beta", from: 900, to: 904 }), { from: 6, to: 10 });
  eq("inverted range falls back", resolveRange(body, { text: "beta", from: 10, to: 6 }), { from: 6, to: 10 });
  eq("negative from falls back", resolveRange(body, { text: "beta", from: -4, to: 0 }), { from: 6, to: 10 });
}
{
  // A selection dragged past its own edges: the text is trimmed but the range is
  // not, so the range must tighten onto the content or the markers wrap whitespace.
  const body = "one  spaced  two";
  eq("range tightened to trimmed content", resolveRange(body, { text: "spaced", from: 3, to: 13 }), { from: 5, to: 11 });
}

console.log("\n— clipAround —");
eq("under cap → untouched", clipAround("short", 100), { text: "short", shift: 0 });
{
  const body = "x".repeat(500);
  const c = clipAround(body, 100);
  ok("no focus → head of the note", c.text.startsWith("x".repeat(100)));
  eq("no focus → shift 0", c.shift, 0);
}
{
  // The long-note case: a passage far past the cap must survive, with its own
  // surroundings, and its offset must still map into the clipped string.
  const body = "A".repeat(30000) + "NEEDLE" + "B".repeat(30000);
  const at = 30000;
  const c = clipAround(body, 12000, at);
  ok("focus is inside the window", c.text.includes("NEEDLE"));
  eq("focus offset maps into the clip", c.text.slice(at - c.shift, at - c.shift + 6), "NEEDLE");
  ok("both ends marked truncated", c.text.startsWith("…(truncated)") && c.text.endsWith("…(truncated)"));
}
{
  // Focus near the start must not produce a negative window.
  const body = "HEAD" + "z".repeat(20000);
  const c = clipAround(body, 1000, 2);
  eq("focus at start maps correctly", c.text.slice(2 - c.shift, 2 - c.shift + 2), "AD");
  eq("no leading truncation marker", c.shift, 0);
}
{
  // Focus near the end must clamp to the tail rather than run off it.
  const body = "z".repeat(20000) + "TAIL";
  const at = 20000;
  const c = clipAround(body, 1000, at);
  eq("focus at end maps correctly", c.text.slice(at - c.shift, at - c.shift + 4), "TAIL");
  ok("tail window reaches the end", c.text.endsWith("TAIL"));
}

console.log("\n— insertMarkers —");
eq("wraps the range", insertMarkers("abcdef", 2, 4), `ab${MARK_OPEN}cd${MARK_CLOSE}ef`);
eq("at the very start", insertMarkers("abc", 0, 1), `${MARK_OPEN}a${MARK_CLOSE}bc`);
eq("at the very end", insertMarkers("abc", 2, 3), `ab${MARK_OPEN}c${MARK_CLOSE}`);

console.log("\n— excerpt —");
{
  const body = "The prison cell was cold. A plant cell has a nucleus and mitochondria.";
  const at = body.lastIndexOf("cell");
  const ex = excerpt(body, at, at + 4, 30);
  ok("marks the chosen occurrence", ex.includes(`${MARK_OPEN}cell${MARK_CLOSE}`));
  ok("carries the disambiguating words", ex.includes("plant") && ex.includes("nucleus"));
  eq("exactly one marked span", (ex.match(/⟦/g) ?? []).length, 1);
}
{
  const body = "x".repeat(1000) + "SEL" + "y".repeat(1000);
  const ex = excerpt(body, 1000, 1003, 50);
  eq("radius bounds the window", ex.length, 50 + 3 + 50 + 2 /* markers */ + 2 /* ellipses */);
  ok("ellipsis on both sides", ex.startsWith("…") && ex.endsWith("…"));
}
{
  // A huge selection elides its MIDDLE — a truncation that dropped the closing
  // marker would leave the model unable to see where the passage ends.
  const body = "pre " + "S".repeat(9000) + " post";
  const ex = excerpt(body, 4, 9004, 10, 100);
  ok("closing marker survives", ex.includes(MARK_CLOSE));
  ok("middle elided", ex.includes(" … "));
  ok("much shorter than the raw selection", ex.length < 400);
}

console.log("\n— composition: raw CM offsets → marked context —");
{
  // The end-to-end path that used to be wrong: offsets captured in the editor
  // (raw, frontmatter included) marking a span in the normalised body.
  const raw = "---\ntags: bio\n---\nThe prison cell was cold. A plant cell has a nucleus.";
  const target = raw.lastIndexOf("cell"); // the BIOLOGY one
  const { body, shift } = normalizeBody(raw);
  const r = resolveRange(neutraliseMarkers(body), { text: "cell", from: target - shift, to: target - shift + 4 });
  ok("resolved", r !== null);
  const marked = insertMarkers(body, r!.from, r!.to);
  ok("the biology occurrence is the marked one", marked.includes(`plant ${MARK_OPEN}cell${MARK_CLOSE}`));
  ok("the prison occurrence is left alone", marked.includes("prison cell was"));
  eq("exactly one marked span", (marked.match(/⟦/g) ?? []).length, 1);
}
{
  // Same note, the OTHER occurrence — proves the marker follows the selection
  // rather than always landing on the first match.
  const raw = "---\na: 1\n---\nThe prison cell was cold. A plant cell has a nucleus.";
  const target = raw.indexOf("cell"); // the PRISON one
  const { body, shift } = normalizeBody(raw);
  const r = resolveRange(body, { text: "cell", from: target - shift, to: target - shift + 4 });
  const marked = insertMarkers(body, r!.from, r!.to);
  ok("the prison occurrence is the marked one", marked.includes(`prison ${MARK_OPEN}cell${MARK_CLOSE}`));
  ok("the biology occurrence is left alone", marked.includes("plant cell has"));
}
{
  // Regression guard for the bug itself: WITHOUT rebasing, the same offsets mark
  // the wrong span. If this ever stops holding, the rebase has become a no-op and
  // the test above would pass for the wrong reason.
  const raw = "---\ntags: bio\n---\nThe prison cell was cold. A plant cell has a nucleus.";
  const target = raw.lastIndexOf("cell");
  const { body } = normalizeBody(raw);
  const naive = body.slice(target, target + 4);
  ok("un-rebased offsets do NOT land on the word", naive !== "cell");
}
{
  // A note that already contains the markers can't be allowed to create a second
  // marked span.
  const body = neutraliseMarkers("a ⟦trap⟧ and the word here");
  const r = resolveRange(body, { text: "word", from: body.indexOf("word"), to: body.indexOf("word") + 4 });
  const marked = insertMarkers(body, r!.from, r!.to);
  eq("only our marker remains", (marked.match(/⟦/g) ?? []).length, 1);
  ok("marks the intended word", marked.includes(`${MARK_OPEN}word${MARK_CLOSE}`));
}
{
  // The SELECTION itself contains a marker character. The anchor text has to be
  // neutralised exactly like the body, or the equality check and the indexOf
  // fallback both miss and the passage silently loses its positional anchoring —
  // which is the original bug, reappearing only for notes that use these brackets.
  const raw = "The denotation ⟦e⟧ρ is defined pointwise. Later, ⟦e⟧ρ appears again.";
  const { body: stripped } = normalizeBody(raw);
  const body = neutraliseMarkers(stripped);
  const at = raw.indexOf("⟦e⟧ρ");
  const wanted = neutraliseMarkers("⟦e⟧ρ"); // what context.ts now does
  const r = resolveRange(body, { text: wanted, from: at, to: at + 4 });
  ok("a selection containing ⟦ still anchors", r !== null);
  const marked = insertMarkers(body, r!.from, r!.to);
  ok("marks the FIRST occurrence, as selected", marked.startsWith(`The denotation ${MARK_OPEN}«e»ρ${MARK_CLOSE}`));
  eq("exactly one marked span", (marked.match(/⟦/g) ?? []).length, 1);
  // Without neutralising the anchor text, nothing resolves at all.
  eq("un-neutralised anchor text fails to resolve", resolveRange(body, { text: "⟦e⟧ρ", from: at, to: at + 4 }), null);
}

console.log(`\n${pass} passed, ${fail} failed`);
// Throw rather than process.exit(1): an uncaught error still exits non-zero (so a
// regression actually fails `npm run test`) without pulling @types/node into a
// tsconfig that only carries vite/client.
if (fail) throw new Error(`${fail} assertion(s) failed`);
