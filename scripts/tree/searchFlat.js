.pragma library

// Flat, case-insensitive substring search over the cached plain-JS tree.
// Returns a flat array of {name, path, isFolder}. A flat result list lets the
// sidebar render matches in a virtualized ListView (only visible rows are
// instantiated), so searching stays fast even with thousands of notes.
function searchFlat(nodes, qLower, out) {
    if (!out) out = [];
    if (!nodes) return out;
    for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        if ((n.name || "").toLowerCase().indexOf(qLower) !== -1) {
            out.push({ "name": n.name, "path": n.path, "isFolder": n.isFolder });
        }
        if (n.isFolder && n.children && n.children.length > 0) {
            searchFlat(n.children, qLower, out);
        }
    }
    return out;
}
