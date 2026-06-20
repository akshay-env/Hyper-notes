.pragma library

// Recursively search the vault tree for a node matching the given path.
// Returns the node object, or null if not found.
function findNodeByPath(nodes, path) {
    if (!nodes) return null;
    for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].path === path) return nodes[i];
        if (nodes[i].isFolder && nodes[i].children) {
            let result = findNodeByPath(nodes[i].children, path);
            if (result) return result;
        }
    }
    return null;
}
