.pragma library

// Minimal YAML frontmatter handling. A branched note starts with:
//   ---
//   parent: Some Note
//   summary: optional one-line gist (used to compress distant ancestors)
//   ---
//   <body…>
// parse() returns { parent, summary, body }; with no frontmatter, parent/summary
// are "" and body is the whole text. Only the `parent` and `summary` keys are read.
function parse(text) {
    if (!text) return { parent: "", summary: "", body: text || "" };

    var m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/.exec(text);
    if (!m) return { parent: "", summary: "", body: text };

    var yaml = m[1];
    var body = text.substring(m[0].length);
    var parent = "", summary = "";
    var lines = yaml.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
        var mp = /^\s*parent\s*:\s*(.*?)\s*$/.exec(lines[i]);
        if (mp) { parent = mp[1].replace(/^["']|["']$/g, "").trim(); continue; }
        var ms = /^\s*summary\s*:\s*(.*?)\s*$/.exec(lines[i]);
        if (ms) { summary = ms[1].replace(/^["']|["']$/g, "").trim(); continue; }
    }
    return { parent: parent, summary: summary, body: body };
}

// Returns full note text with a `parent` frontmatter block in front of `body`.
function withParent(parentTitle, body) {
    if (!parentTitle) return (body || "");
    return "---\nparent: " + parentTitle + "\n---\n\n" + (body || "");
}
