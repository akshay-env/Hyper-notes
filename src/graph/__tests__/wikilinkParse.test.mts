// Pure link-grammar tests for the canonical compound form [[A|B]](id:X,Y):
// segment escaping, slot lists (with the "_" unresolved sentinel), the
// noteLinkParts/compoundLink round trip, extraction (compound + bare + legacy
// read-compat), note identity (frontmatter id), the rename rewrite
// (title-tracking segments follow, prose labels never touched, bare links
// convert), open-time normalization (legacy migration + slot healing) and
// linkifySelection (the Ask-AI passage wrap).
// Same homegrown pass/fail format as graphData.test.mts.
import {
  escapeSegment,
  unescapeSegment,
  splitRawSegments,
  parseWikilinkInner,
  wikilinkDisplaySpan,
  parseIdSlots,
  parseIdTargets,
  parseIdTarget,
  slotsDestination,
  idTarget,
  compoundLink,
  noteLinkParts,
  extractLinks,
  noteIdOf,
  withNoteId,
  mintNoteId,
  hasWikilinkTo,
  rewriteLinksInText,
  normalizeNoteLinks,
  linkifySelection,
} from "../wikilinkParse";

let pass = 0,
  fail = 0;
const eq = (n: string, g: unknown, w: unknown) => {
  const a = JSON.stringify(g),
    b = JSON.stringify(w);
  if (a === b) {
    pass++;
    console.log(`  ok  ${n}`);
  } else {
    fail++;
    console.log(`  FAIL ${n}\n       got  ${a}\n       want ${b}`);
  }
};

console.log("\n— segment escaping —");
eq("escape pipe", escapeSegment("a|b"), "a\\|b");
eq("escape brackets", escapeSegment("a [x] b"), "a \\[x\\] b");
eq("round trip", unescapeSegment(escapeSegment("we [saw] a|b")), "we [saw] a|b");
eq("plain text untouched", escapeSegment("plain"), "plain");
// The backslash MUST be escaped: without it "a\|b" escapes to "a\\|b", which
// reads back as an escaped backslash plus a LIVE separator (one link becomes
// two), and a label ending in "\" eats the link's own closing bracket.
eq("backslash escaped", escapeSegment("C:\\dir"), "C:\\\\dir");
eq("round trip through a backslash", unescapeSegment(escapeSegment("C:\\dir")), "C:\\dir");
eq("round trip: literal \\| in prose", unescapeSegment(escapeSegment("a\\|b")), "a\\|b");
eq("literal \\| stays ONE segment", parseWikilinkInner(escapeSegment("a\\|b")).targets.length, 1);
eq("trailing backslash still closes the link", noteLinkParts(`[[${escapeSegment("C:\\Users\\")}]](id:x1)`)?.slots, ["x1"]);
// The READER is more forgiving than the writer: a lone backslash (hand-typed,
// never written by escapeSegment) is a literal and cannot swallow a bracket.
eq("lone backslash is literal", unescapeSegment("C:\\dir"), "C:\\dir");
eq("hand-typed lone backslash still parses", noteLinkParts("[[C:\\dir]]")?.inner, "C:\\dir");

console.log("\n— splitRawSegments —");
eq("no pipe", splitRawSegments("A").map((s) => s.raw), ["A"]);
eq("two", splitRawSegments("A|B").map((s) => s.raw), ["A", "B"]);
eq("escaped pipe does not split", splitRawSegments("a\\|b|C").map((s) => s.raw), ["a\\|b", "C"]);
eq("offsets", splitRawSegments("A|B").map((s) => s.from), [0, 2]);
eq("empty segments kept", splitRawSegments("A||B").map((s) => s.raw), ["A", "", "B"]);

console.log("\n— parseWikilinkInner —");
eq("single", parseWikilinkInner("A"), { label: "A", targets: ["A"] });
eq("multi: every part is a target", parseWikilinkInner("A|B|C"), { label: "A", targets: ["A", "B", "C"] });
eq("trim + unescape", parseWikilinkInner(" a\\|b | C "), { label: "a|b", targets: ["a|b", "C"] });
eq("empty", parseWikilinkInner(""), { label: "", targets: [] });

console.log("\n— wikilinkDisplaySpan —");
eq("plain", wikilinkDisplaySpan("A"), { start: 0, end: 1 });
eq("first of multi", wikilinkDisplaySpan("Alpha|B"), { start: 0, end: 5 });
eq("anchor hidden for a title-resolved segment", wikilinkDisplaySpan("Alpha#Sec"), { start: 0, end: 5 });
eq("leading space skipped", wikilinkDisplaySpan(" A |B"), { start: 1, end: 2 });
eq("escaped pipe stays in display", wikilinkDisplaySpan("a\\|b|C"), { start: 0, end: 4 });
// A PINNED segment's text is a label, not a target: prose containing #/^ must
// show whole ("x^2 + y^2 dominates" used to display as just "x").
eq("prose label keeps ^", wikilinkDisplaySpan("x^2 + y^2 dominates", false), { start: 0, end: 19 });
eq("prose label keeps #", wikilinkDisplaySpan("issue #42 rationale", false), { start: 0, end: 19 });
eq("dropAnchor=false still takes only the first segment", wikilinkDisplaySpan("a#b|C", false), { start: 0, end: 3 });

console.log("\n— slot lists —");
eq("one real id", parseIdSlots("id:abc123"), ["abc123"]);
eq("two ids", parseIdSlots("id:AAA,BBB"), ["AAA", "BBB"]);
eq("sentinel is null", parseIdSlots("id:AAA,_"), ["AAA", null]);
eq("leading sentinel", parseIdSlots("id:_,BBB"), [null, "BBB"]);
eq("all sentinels", parseIdSlots("id:_,_"), [null, null]);
eq("whitespace tolerated", parseIdSlots("  id:AAA  "), ["AAA"]);
eq("not a slot destination", parseIdSlots("https://x.com"), []);
eq("trailing comma rejects whole list", parseIdSlots("id:AAA,"), []);
eq("empty segment rejects whole list", parseIdSlots("id:,BBB"), []);
eq("bad charset rejects whole list", parseIdSlots("id:AA-BB"), []);
eq("targets drop sentinels", parseIdTargets("id:AAA,_,CCC"), ["AAA", "CCC"]);
eq("first real id", parseIdTarget("id:_,BBB"), "BBB");
eq("no real id → null", parseIdTarget("id:_"), null);
eq("slotsDestination round-trips", parseIdSlots(slotsDestination(["A1", null, "C3"])), ["A1", null, "C3"]);
eq("all-null destination is empty", slotsDestination([null, null]), "");
eq("empty list is empty", slotsDestination([]), "");
eq("idTarget round-trips", parseIdTarget(idTarget("deadbeef1234")), "deadbeef1234");

console.log("\n— noteLinkParts / compoundLink —");
eq("bare single", noteLinkParts("[[A]]"), { inner: "A", innerFrom: 2, innerTo: 3, destFrom: -1, slots: null });
eq("compound single", noteLinkParts("[[A]](id:x1)"), { inner: "A", innerFrom: 2, innerTo: 3, destFrom: 5, slots: ["x1"] });
eq("compound multi + sentinel", noteLinkParts("[[A|B]](id:x1,_)")?.slots, ["x1", null]);
eq("escaped ]] does not close", noteLinkParts("[[a\\]b]](id:x1)")?.inner, "a\\]b");
eq("trailing junk is not a link", noteLinkParts("[[A]]x"), null);
eq("bad tail is not a link", noteLinkParts("[[A]](id:AAA,)"), null);
eq("empty [[]] is not a link", noteLinkParts("[[]]"), null);
eq("not a link at all", noteLinkParts("[A](id:x1)"), null);
eq("writer: all-null slots → bare", compoundLink("A|B", [null, null]), "[[A|B]]");
eq("writer: mixed slots", compoundLink("A|B", ["x1", null]), "[[A|B]](id:x1,_)");
eq("writer round-trips", noteLinkParts(compoundLink("A|B|C", ["a", null, "c"]))?.slots, ["a", null, "c"]);

console.log("\n— extractLinks: compound + bare —");
eq("bare single", extractLinks("see [[Alpha]]"), ["Alpha"]);
eq("bare multi", extractLinks("[[A|B]]"), ["A", "B"]);
eq("compound: real slot → id token", extractLinks("[[A]](id:x1)"), ["id:x1"]);
eq("compound multi: one token per slot", extractLinks("[[A|B|C]](id:x1,y2,z3)"), ["id:x1", "id:y2", "id:z3"]);
eq("sentinel slot falls back to title", extractLinks("[[A|B]](id:x1,_)"), ["id:x1", "B"]);
eq("compound tail not double-counted", extractLinks("[[A]](id:x1) end"), ["id:x1"]);
eq("escaped label extracts unescaped title", extractLinks("[[a\\|b]]"), ["a|b"]);
eq("dedup across forms", extractLinks("[[A]](id:x1) [[B]](id:x1)"), ["id:x1"]);
eq("compound in inline code ignored", extractLinks("`[[A]](id:x1)`"), []);
eq("compound in fence ignored", extractLinks("```\n[[A]](id:x1)\n```"), []);
eq("compound in frontmatter ignored", extractLinks("---\nx: [[A]](id:x1)\n---\nbody"), []);
eq("mixed doc order", extractLinks("[[A]] then [[B]](id:y2)"), ["A", "id:y2"]);

console.log("\n— extractLinks: legacy read-compat —");
eq("legacy id link", extractLinks("see [text](id:abc123)"), ["id:abc123"]);
eq("legacy multi", extractLinks("[t](id:AAA,BBB)"), ["id:AAA", "id:BBB"]);
eq("legacy + compound dedup", extractLinks("[t](id:x1) [[A]](id:x1)"), ["id:x1"]);
eq("legacy in code ignored", extractLinks("`[a](id:x1)`"), []);
eq("url link is not a note target", extractLinks("[a](https://x.com)"), []);
eq("legacy malformed list draws no edge", extractLinks("[a](id:AAA,)"), []);
eq("'!'-prefixed legacy link is not a note target", extractLinks("![alt](id:x1)"), []);

console.log("\n— extractLinks: graph must agree with the editor —");
// A malformed tail makes noteLinkParts return null, so the editor renders the
// text raw and no click can follow it. Falling back to the segment TITLE here
// would draw an edge nothing on screen can reach.
eq("malformed tail → not a link, no edge at all", extractLinks("[[A]](id:X1,)"), []);
eq("sentinel-only tail is still a link (resolves by title)", extractLinks("[[A]](id:_)"), ["A"]);
// The parser stops a link at a line break, so the text grammar must too —
// otherwise the editor shows a link the graph and renames are blind to.
eq("newline inside is rejected", extractLinks("[[A\nB]]"), []);

console.log("\n— stripNonLinkRegions: code spans don't cross blank lines —");
eq(
  "stray backticks in separate paragraphs don't blank the link between",
  extractLinks("don`t stop\n\n[[Alpha]] is key\n\nhere`s why"),
  ["Alpha"],
);
eq("a real one-line code span still hides its link", extractLinks("`[[A]]`"), []);
eq(
  "a code span wrapping ONE line break still hides its link",
  extractLinks("`x\n[[A]]`"),
  [],
);

console.log("\n— note identity —");
eq("no frontmatter → no id", noteIdOf("hello"), null);
eq("id read", noteIdOf("---\nid: abc123\n---\nbody"), "abc123");
eq("id among other keys", noteIdOf("---\ntags: x\nid: q8\nauthor: me\n---\n"), "q8");
eq("id is not matched mid-doc", noteIdOf("body\n---\nid: nope\n---\n"), null);
eq("inject into bare note", withNoteId("body", "x1"), "---\nid: x1\n---\n\nbody");
eq(
  "inject into existing frontmatter",
  withNoteId("---\ntags: a\n---\nbody", "x1"),
  "---\ntags: a\nid: x1\n---\nbody",
);
eq("inject then read", noteIdOf(withNoteId("body", "zz12")), "zz12");
{
  const id = mintNoteId();
  eq("minted id parses as a slot", parseIdSlots(idTarget(id)), [id]);
  eq("minted id length", id.length, 12);
  eq("minted id can never be the sentinel", id === "_", false);
}

console.log("\n— hasWikilinkTo —");
eq("bare", hasWikilinkTo("x [[Foo]] y", "Foo"), true);
eq("case-insensitive", hasWikilinkTo("[[foo]]", "Foo"), true);
eq("multi segment", hasWikilinkTo("[[A|Foo]]", "Foo"), true);
eq("compound segment counts too", hasWikilinkTo("[[Foo|B]](id:_,b1)", "Foo"), true);
eq("anchor/md/prefix", hasWikilinkTo("[[dir/Foo.md#Sec]]", "Foo"), true);
eq("no link", hasWikilinkTo("Foo plain text", "Foo"), false);
eq("code ignored", hasWikilinkTo("`[[Foo]]`", "Foo"), false);
eq("other title", hasWikilinkTo("[[Bar]]", "Foo"), false);

console.log("\n— rewriteLinksInText: title-tracking segments follow the rename —");
eq(
  "pinned segment reading the old title is swapped",
  rewriteLinksInText("a [[Foo]](id:x1) b", "Foo", "Bar", "x1"),
  "a [[Bar]](id:x1) b",
);
eq(
  "PROSE label on the same id is never touched",
  rewriteLinksInText("[[my whole sentence]](id:x1)", "Foo", "Bar", "x1"),
  null,
);
eq(
  "a DIFFERENT note's segment is never touched",
  rewriteLinksInText("[[Foo]](id:OTHER)", "Foo", "Bar", "x1"),
  null,
);
eq(
  "multi: only the pinned+matching segment moves",
  rewriteLinksInText("[[Foo|Keep]](id:x1,k9)", "Foo", "Bar", "x1"),
  "[[Bar|Keep]](id:x1,k9)",
);
eq(
  "case-insensitive match, case of the NEW title written",
  rewriteLinksInText("[[foo]](id:x1)", "Foo", "Bar", "x1"),
  "[[Bar]](id:x1)",
);
// A PINNED segment tracks only on an EXACT title match. "Foo#S" is not "Foo",
// so it is a label the writer chose (or a passage), and a rename must not edit
// it — the anchor-stripping comparison that resolution uses would have said yes
// and rewritten prose like "Chapter 3 # summary" into "Intro # summary".
eq(
  "pinned segment with an anchor is a label — untouched",
  rewriteLinksInText("[[Foo#S|Other]](id:x1,_)", "Foo", "Bar", "x1"),
  null,
);
eq(
  "pinned prose label merely STARTING with the title is untouched",
  rewriteLinksInText("[[Chapter 3 # summary]](id:x1)", "Chapter 3", "Intro", "x1"),
  null,
);
eq(
  "title-RESOLVED segment keeps anchor-aware matching (that IS how it resolves)",
  rewriteLinksInText("[[Foo#S]]", "Foo", "Bar", "x1"),
  "[[Bar#S]](id:x1)",
);

console.log("\n— rewriteLinksInText: title-resolved segments convert —");
eq(
  "bare single gains the id",
  rewriteLinksInText("a [[Foo]] b", "Foo", "Bar", "x1"),
  "a [[Bar]](id:x1) b",
);
eq(
  "bare single, no id known → plain swap",
  rewriteLinksInText("[[Foo]]", "Foo", "Bar", ""),
  "[[Bar]]",
);
eq(
  "bare multi: segment swapped AND slot filled",
  rewriteLinksInText("[[Other|Foo]]", "Foo", "Bar", "x1"),
  "[[Other|Bar]](id:_,x1)",
);
eq(
  "sentinel slot filled",
  rewriteLinksInText("[[Foo|B]](id:_,b1)", "Foo", "Bar", "x1"),
  "[[Bar|B]](id:x1,b1)",
);
eq(
  "rewriteBare=false leaves title-resolved links alone",
  rewriteLinksInText("[[Foo]]", "Foo", "Bar", "x1", false),
  null,
);
eq(
  "rewriteBare=false still tracks pinned segments",
  rewriteLinksInText("[[Foo]](id:x1)", "Foo", "Bar", "x1", false),
  "[[Bar]](id:x1)",
);
eq(
  "spacing preserved",
  rewriteLinksInText("[[ Foo | Other ]]", "Foo", "Bar", "x1"),
  "[[ Bar | Other ]](id:x1,_)",
);
eq("unrelated link untouched", rewriteLinksInText("[[Baz]]", "Foo", "Bar", "x1"), null);
eq("code region untouched", rewriteLinksInText("`[[Foo]]`", "Foo", "Bar", "x1"), null);
eq(
  "two links both handled",
  rewriteLinksInText("[[Foo]] mid [[Foo]](id:x1)", "Foo", "Bar", "x1"),
  "[[Bar]](id:x1) mid [[Bar]](id:x1)",
);
eq(
  "legacy id link untouched (already rename-proof)",
  rewriteLinksInText("[Foo](id:x1)", "Foo", "Bar", "x1"),
  null,
);

console.log("\n— normalizeNoteLinks: legacy migration —");
const noTitles = () => null;
eq(
  "single legacy → compound, display byte-faithful",
  normalizeNoteLinks("see [my sentence](id:x1) end", noTitles),
  "see [[my sentence]](id:x1) end",
);
eq(
  "legacy display's \\[ escape survives as the segment's \\[",
  normalizeNoteLinks("[a \\[ b](id:x1)", noTitles),
  "[[a \\[ b]](id:x1)",
);
eq(
  "legacy display pipe gets escaped for the segment grammar",
  normalizeNoteLinks("[a | b](id:x1)", noTitles),
  "[[a \\| b]](id:x1)",
);
eq(
  "legacy multi: extra ids get live-title segments",
  normalizeNoteLinks("[label](id:x1,y2)", (id) => (id === "y2" ? "Second" : null)),
  "[[label|Second]](id:x1,y2)",
);
eq(
  "dead extra id keeps its slot under a Missing label",
  normalizeNoteLinks("[label](id:x1,dead)", noTitles),
  "[[label|Missing note]](id:x1,dead)",
);
eq("legacy in code untouched", normalizeNoteLinks("`[a](id:x1)`", noTitles), null);
eq("url link untouched", normalizeNoteLinks("[a](https://x.com)", noTitles), null);
eq("canonical text is a no-op", normalizeNoteLinks("[[A]](id:x1) and [[B]]", noTitles), null);
// "![d](id:X)" must NOT migrate: "![[d]](id:X)" parses as an EMBED, and embeds
// refuse the id tail — the "(id:X)" would become permanently visible prose.
eq("'!'-prefixed legacy link is left alone", normalizeNoteLinks("![My note](id:x1)", noTitles), null);
eq("a compound link cannot be engulfed by a legacy match", normalizeNoteLinks("[see [[B]] here](id:y1)", noTitles), null);

console.log("\n— normalizeNoteLinks: slot healing —");
eq(
  "short list padded",
  normalizeNoteLinks("[[A|B]](id:x1)", noTitles),
  "[[A|B]](id:x1,_)",
);
eq(
  "long list truncated",
  normalizeNoteLinks("[[A]](id:x1,y2)", noTitles),
  "[[A]](id:x1)",
);
eq(
  "truncated to all-null → bare",
  normalizeNoteLinks("[[A]](id:_,_)", noTitles),
  "[[A]]",
);
eq("aligned list untouched", normalizeNoteLinks("[[A|B]](id:x1,_)", noTitles), null);

console.log("\n— linkifySelection —");
eq("single line", linkifySelection("plain sentence", "x1"), "[[plain sentence]](id:x1)");
eq(
  "single line keeps leading block chars inside (whole selection is the label)",
  linkifySelection("# not a heading here", "x1"),
  "[[# not a heading here]](id:x1)",
);
eq(
  "multi-line paragraph",
  linkifySelection("line one\nline two", "x1"),
  "[[line one]](id:x1)\n[[line two]](id:x1)",
);
eq(
  "blank separator verbatim",
  linkifySelection("para one\n\npara two", "x1"),
  "[[para one]](id:x1)\n\n[[para two]](id:x1)",
);
eq(
  "heading prefix stays outside",
  linkifySelection("# Head\nbody", "x1"),
  "# [[Head]](id:x1)\n[[body]](id:x1)",
);
eq(
  "bullet prefix stays outside",
  linkifySelection("- item\n- item2", "x1"),
  "- [[item]](id:x1)\n- [[item2]](id:x1)",
);
eq(
  "task prefix stays outside",
  linkifySelection("- [x] done\nrest", "x1"),
  "- [x] [[done]](id:x1)\n[[rest]](id:x1)",
);
eq(
  "quote prefix stays outside",
  linkifySelection("> quoted\nplain", "x1"),
  "> [[quoted]](id:x1)\n[[plain]](id:x1)",
);
eq(
  "table row left unwrapped",
  linkifySelection("above\n| a | b |", "x1"),
  "[[above]](id:x1)\n| a | b |",
);
eq(
  "fence and its interior left verbatim",
  linkifySelection("text\n```\ncode [x]\n```\nafter", "x1"),
  "[[text]](id:x1)\n```\ncode [x]\n```\n[[after]](id:x1)",
);
eq(
  "brackets escaped, line still wrapped",
  linkifySelection("see [ref 1]", "x1"),
  "[[see \\[ref 1\\]]](id:x1)",
);
eq(
  "pipe escaped, line still wrapped",
  linkifySelection("either|or", "x1"),
  "[[either\\|or]](id:x1)",
);
// A trailing backslash used to eat the closing bracket, leaving text that was
// not a link at all — with its "(id:…)" visible as prose.
eq(
  "trailing backslash escaped, still a valid link",
  noteLinkParts(linkifySelection("C:\\Users\\", "x1"))?.slots,
  ["x1"],
);
eq(
  "backslash round-trips to the exact prose",
  parseWikilinkInner(noteLinkParts(linkifySelection("C:\\Users\\", "x1"))!.inner).label,
  "C:\\Users\\",
);
eq(
  "a literal \\| in prose stays ONE target",
  extractLinks(linkifySelection("write a\\|b here", "x1")),
  ["id:x1"],
);
// A GFM table written WITHOUT leading pipes is still a table: wrapping its
// delimiter row destroys the block, so the whole table is left verbatim.
eq(
  "pipe-less GFM table left verbatim",
  linkifySelection("Name | Age\n--- | ---\nBob | 42", "x1"),
  "Name | Age\n--- | ---\nBob | 42",
);
eq(
  "prose around a pipe-less table still wraps",
  linkifySelection("intro\nName | Age\n--- | ---\nBob | 42\nafter", "x1"),
  "[[intro]](id:x1)\nName | Age\n--- | ---\nBob | 42\n[[after]](id:x1)",
);
eq(
  "ordinary prose containing a pipe still wraps (not a table)",
  linkifySelection("either|or\nsecond line", "x1"),
  "[[either\\|or]](id:x1)\n[[second line]](id:x1)",
);
eq(
  "round-trip: wrapped text extracts the id",
  extractLinks(linkifySelection("The OTC Skills Assessment requires training.", "ab12")),
  ["id:ab12"],
);
eq(
  "round-trip: escaped label parses back to the exact text",
  parseWikilinkInner(noteLinkParts(linkifySelection("a [b] c|d", "x1"))!.inner).label,
  "a [b] c|d",
);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) throw new Error(`${fail} wikilinkParse test(s) failed`);
