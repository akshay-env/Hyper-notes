.pragma library
.import "frontmatter.js" as FM

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

// Walks the parent chain starting at `startParentTitle` (an ANCESTOR's title)
// and returns their bodies assembled oldest → newest as Markdown sections,
// capped at maxChars. Nearest ancestors are kept; the most distant are dropped
// first (so a deep tree can't overflow the context window). Cycle-guarded.
function buildFromTitle(window, vaultFs, startParentTitle, maxChars) {
    if (!startParentTitle || !window || !vaultFs) return "";

    var chain = [];        // nearest → oldest
    var seen = ({});
    var title = startParentTitle;
    var guard = 0;
    while (title && !seen[title] && guard < 64) {
        seen[title] = true;
        guard++;
        var node = findByTitle(window.vaultTree, title);
        if (!node) break;
        var parsed = FM.parse(vaultFs.readFile(node.path));
        chain.push({ title: title, body: parsed.body.trim() });
        title = parsed.parent;
    }
    if (chain.length === 0) return "";

    // Keep nearest first until the cap, then emit oldest → newest.
    var kept = [];
    var total = 0;
    for (var i = 0; i < chain.length; i++) {
        var section = "## " + chain[i].title + "\n" + chain[i].body;
        if (total + section.length > maxChars && kept.length > 0) break;
        kept.push(section);
        total += section.length;
    }
    kept.reverse();
    return kept.join("\n\n");
}
