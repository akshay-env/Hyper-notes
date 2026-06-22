.pragma library

// Returns the currently-visible tree nodes in top-to-bottom display order.
// Pre-order DFS that descends into a folder's children only when it is expanded,
// so the result matches exactly what the user sees in the sidebar. Used by
// Shift+click range selection to resolve "everything between A and B".
function flattenVisible(nodes, out) {
    if (!out) out = [];
    if (!nodes) return out;
    for (let i = 0; i < nodes.length; i++) {
        let n = nodes[i];
        out.push(n);
        if (n.isFolder && n.expanded === true && n.children && n.children.length > 0) {
            flattenVisible(n.children, out);
        }
    }
    return out;
}
