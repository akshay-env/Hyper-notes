.pragma library
.import "frontmatter.js" as FM
.import "../graph/extractLinks.js" as Links

// ── Tunables ────────────────────────────────────────────────────────────────
var FULL_ANCESTORS = 2;      // nearest N ancestors sent in full
var PER_FULL       = 4000;   // char cap per full ancestor body
var PER_SUMMARY    = 260;    // char cap per summarized (distant) ancestor
var ANCESTOR_CAP   = 20000;  // total char cap for the ancestor section
var CURRENT_CAP    = 12000;  // char cap for the current note body
var PER_LINK       = 2500;   // char cap per linked note
var MAX_LINKS      = 8;      // most linked notes to include
var MAX_TITLES     = 200;    // most vault titles to list

// Finds a note node by its title (filename without .md) anywhere in the tree.
function findByTitle(nodes, title) {
    if (!nodes) return null;
    for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        if (n.isFolder) {
            var r = findByTitle(n.children, title);
            if (r) return r;
        } else if (n.name.replace(/\.md$/i, "") === title) {
            return n;
        }
    }
    return null;
}

function _clip(s, max) {
    s = (s || "").trim();
    return s.length > max ? s.substring(0, max) + "\n…(truncated)" : s;
}

// Crude but honest one-liner: the first couple of prose lines (headings, bullet
// markers, quote markers and emphasis stripped), truncated at a sentence/word
// boundary. Used to compress DISTANT ancestors so note A still reaches note Z
// without shipping every full note on every question. A stored `summary:` in
// frontmatter is preferred over this when present.
function summarize(body, maxLen) {
    if (!body || body.trim().length === 0) return "(empty note)";
    var lines = body.split(/\r?\n/);
    var picked = [];
    for (var i = 0; i < lines.length && picked.join(" ").length < maxLen; i++) {
        var l = lines[i].trim();
        if (l.length === 0) continue;
        if (/^#{1,6}\s/.test(l)) continue;                 // heading
        if (/^(---+|\*\*\*+|___+)$/.test(l)) continue;     // horizontal rule
        l = l.replace(/^>\s?/, "")                          // quote marker
             .replace(/^[-*+]\s+/, "")                      // bullet
             .replace(/^\d+[.)]\s+/, "")                    // ordered marker
             .replace(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g, "$1")  // wikilink → its label
             .replace(/[*_`~]/g, "");                       // emphasis marks
        if (l.length === 0) continue;
        picked.push(l);
    }
    var s = picked.join(" ").replace(/\s+/g, " ").trim();
    if (s.length === 0) s = body.replace(/\s+/g, " ").trim();
    if (s.length > maxLen) {
        s = s.substring(0, maxLen);
        var cut = Math.max(s.lastIndexOf(". "), s.lastIndexOf(" "));
        if (cut > maxLen * 0.6) s = s.substring(0, cut);
        s += "…";
    }
    return s;
}

// Walk the full `parent` chain (nearest → oldest, cycle-guarded) and render it
// oldest → newest. The nearest FULL_ANCESTORS are sent whole; every older
// ancestor is compressed to a summary. If the section still overflows
// ANCESTOR_CAP, summaries are dropped from the NEAREST end first — so the
// OLDEST (founding) ancestor always survives, which is the whole point of the
// branch trail. Returns { text, count } (count = ancestors walked).
function buildAncestors(window, vaultFs, startParentTitle) {
    if (!startParentTitle || !window || !vaultFs) return { text: "", count: 0 };

    var chain = [];   // nearest → oldest: { title, body, summary }
    var seen = ({});
    var title = startParentTitle;
    var guard = 0;
    while (title && !seen[title] && guard < 128) {
        seen[title] = true;
        guard++;
        var node = findByTitle(window.vaultTreeJS, title);
        if (!node) break;
        var parsed = FM.parse(vaultFs.readFile(node.path));
        chain.push({ title: title, body: parsed.body.trim(), summary: parsed.summary });
        title = parsed.parent;
    }
    if (chain.length === 0) return { text: "", count: 0 };

    // Build sections nearest → oldest (full for the closest, summary for the rest).
    var sections = [];
    for (var i = 0; i < chain.length; i++) {
        var c = chain[i];
        if (i < FULL_ANCESTORS) {
            sections.push({ title: c.title, text: _clip(c.body, PER_FULL), summary: false });
        } else {
            var sum = (c.summary && c.summary.length > 0) ? c.summary : summarize(c.body, PER_SUMMARY);
            sections.push({ title: c.title, text: sum, summary: true });
        }
    }

    function total() {
        var t = 0;
        for (var k = 0; k < sections.length; k++) t += sections[k].text.length + sections[k].title.length + 20;
        return t;
    }
    // Drop the nearest SUMMARY first (index FULL_ANCESTORS) — never the full ones,
    // never the oldest — until we fit.
    while (total() > ANCESTOR_CAP && sections.length > FULL_ANCESTORS + 1)
        sections.splice(FULL_ANCESTORS, 1);

    sections.reverse();   // oldest → newest
    var parts = [];
    for (var j = 0; j < sections.length; j++) {
        var s = sections[j];
        parts.push("### " + s.title + (s.summary ? " (summary)" : "") + "\n" + s.text);
    }
    return { text: parts.join("\n\n"), count: chain.length };
}

// Backwards-compatible helper (older callers) — the ancestor section only.
function buildFromTitle(window, vaultFs, startParentTitle) {
    return buildAncestors(window, vaultFs, startParentTitle).text;
}

// Every note title in the (plain-JS) vault tree, capped.
function collectTitles(nodes, out, cap) {
    if (!nodes) return;
    for (var i = 0; i < nodes.length && out.length < cap; i++) {
        var n = nodes[i];
        if (n.isFolder) collectTitles(n.children, out, cap);
        else out.push(n.name.replace(/\.md$/i, ""));
    }
}

// The resolvable [[linked]] notes of the current body (deduped, self excluded),
// capped in count. Returns an array of { title, node }.
function resolveLinks(tree, currentBody, currentTitle) {
    var out = [];
    var linked = Links.extractLinks(currentBody || "");
    for (var i = 0; i < linked.length && out.length < MAX_LINKS; i++) {
        var t = linked[i];
        if (t === currentTitle) continue;
        var node = findByTitle(tree, t);
        if (node) out.push({ title: t, node: node });
    }
    return out;
}

// The full Ask-AI context bundle — what makes the assistant KNOW the notebook:
//   1. the current note (always, in full),
//   2. every note it [[links]] to (read from disk, capped),
//   3. the branch-ancestor chain (full near, summarized far — see buildAncestors),
//   4. the title of every note in the vault (so cross-note questions land).
function buildNotebookContext(window, vaultFs, currentTitle, currentBody, parentTitle) {
    if (!window || !vaultFs) return "";
    var tree = window.vaultTreeJS;
    var parts = [];

    var body = _clip(currentBody, CURRENT_CAP);
    parts.push("## Current note: " + currentTitle + "\n" + (body.length ? body : "(this note is empty)"));

    var links = resolveLinks(tree, currentBody, currentTitle);
    for (var i = 0; i < links.length; i++) {
        var b = _clip(FM.parse(vaultFs.readFile(links[i].node.path)).body, PER_LINK);
        if (b.length === 0) continue;
        parts.push("## Linked note: " + links[i].title + "\n" + b);
    }

    var ancestors = buildAncestors(window, vaultFs, parentTitle);
    if (ancestors.text)
        parts.push("## Notes this one was branched from (oldest first)\n" + ancestors.text);

    var titles = [];
    collectTitles(tree, titles, MAX_TITLES);
    if (titles.length > 0)
        parts.push("## All notes in this notebook (titles only)\n" + titles.join(", "));

    return parts.join("\n\n");
}

// A short human-readable description of what buildNotebookContext will send, for
// the Ask-AI bar's indicator. Walks the chain (cheap: only ancestor files) so
// the user can SEE the reach — "this note + 3 ancestors + 2 linked notes".
function describeContext(window, vaultFs, currentTitle, currentBody, parentTitle) {
    if (!window || !vaultFs) return "";
    var tree = window.vaultTreeJS;
    var bits = ["this note"];

    var ancestors = buildAncestors(window, vaultFs, parentTitle);
    if (ancestors.count > 0)
        bits.push(ancestors.count + (ancestors.count === 1 ? " ancestor" : " ancestors"));

    var links = resolveLinks(tree, currentBody, currentTitle);
    if (links.length > 0)
        bits.push(links.length + (links.length === 1 ? " linked note" : " linked notes"));

    return "Context: " + bits.join(" + ");
}
