.pragma library

// Flatten the vault tree into a flat list of all note (non-folder) nodes
function flattenNotes(nodes, result) {
    if (!nodes) return;
    for (let i = 0; i < nodes.length; i++) {
        let node = nodes[i];
        if (node.isFolder) {
            flattenNotes(node.children, result);
        } else if (node.name && node.name.toLowerCase().endsWith(".md")) {
            result.push(node);
        }
    }
}
