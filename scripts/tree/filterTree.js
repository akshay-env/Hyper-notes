.pragma library

// Returns a pruned copy of the tree containing only nodes that match the query
// (case-insensitive, substring), plus any folders on the path to a match.
// Folders kept because they (or a descendant) match are forced expanded so the
// results are visible. `queryLower` must already be lower-cased.
function filterTree(nodes, queryLower) {
    let result = [];
    if (!nodes) return result;

    for (let i = 0; i < nodes.length; i++) {
        let n = nodes[i];
        let nameLower = (n.name || "").toLowerCase();
        let selfMatch = nameLower.indexOf(queryLower) !== -1;

        if (n.isFolder) {
            if (selfMatch) {
                // Folder name matches → show it with its full contents.
                result.push({
                    "name": n.name,
                    "path": n.path,
                    "isFolder": true,
                    "expanded": true,
                    "children": n.children || []
                });
            } else {
                let kids = filterTree(n.children || [], queryLower);
                if (kids.length > 0) {
                    result.push({
                        "name": n.name,
                        "path": n.path,
                        "isFolder": true,
                        "expanded": true,
                        "children": kids
                    });
                }
            }
        } else if (selfMatch) {
            result.push({
                "name": n.name,
                "path": n.path,
                "isFolder": false,
                "expanded": false,
                "children": []
            });
        }
    }
    return result;
}
