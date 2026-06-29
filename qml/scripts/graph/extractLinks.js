.pragma library

// Extract every link destination from [[…]] references in a markdown string.
//   [[Note]]            → "Note"
//   [[label|A|B|C]]     → "label", "A", "B", "C"  (the label is ALSO a
//                         destination; every pipe-separated part is a target)
// Deduplicated. Returns an array of note-title strings (the graph matches these
// to notes; titles with no matching note are simply ignored).
function extractLinks(text) {
    let links = [];
    let seen = {};
    function add(t) {
        t = t.trim();
        if (t.length > 0 && !seen[t]) { seen[t] = true; links.push(t); }
    }
    let regex = /\[\[([^\]]+)\]\]/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
        let parts = match[1].split("|");
        for (let i = 0; i < parts.length; i++) add(parts[i]);
    }
    return links;
}
