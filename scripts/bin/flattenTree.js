.pragma library

function flattenTree(nodes, depth, binModel) {
    for (let i = 0; i < nodes.length; i++) {
        let n = nodes[i];
        binModel.append({
            "name":         n.name,
            "path":         n.path,
            "originalPath": n.originalPath || "",
            "isFolder":     n.isFolder,
            "depth":        depth
        });
        if (n.isFolder && n.children && n.children.length > 0) {
            flattenTree(n.children, depth + 1, binModel);
        }
    }
}
