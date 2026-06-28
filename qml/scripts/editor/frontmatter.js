.pragma library

// Minimal YAML frontmatter handling. A branched note starts with:
//   ---
//   parent: Some Note
//   ---
//   <body…>
// parse() returns { parent, body }; with no frontmatter, parent is "" and body
// is the whole text. Only the `parent` key is read.
function parse(text) {
    if (!text) return { parent: "", body: text || "" };

    var m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/.exec(text);
    if (!m) return { parent: "", body: text };

    var yaml = m[1];
    var body = text.substring(m[0].length);
    var parent = "";
    var lines = yaml.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
        var mm = /^\s*parent\s*:\s*(.*?)\s*$/.exec(lines[i]);
        if (mm) {
            parent = mm[1].replace(/^["']|["']$/g, "").trim();   // strip optional quotes
            break;
        }
    }
    return { parent: parent, body: body };
}

// Returns full note text with a `parent` frontmatter block in front of `body`.
function withParent(parentTitle, body) {
    if (!parentTitle) return (body || "");
    return "---\nparent: " + parentTitle + "\n---\n\n" + (body || "");
}
