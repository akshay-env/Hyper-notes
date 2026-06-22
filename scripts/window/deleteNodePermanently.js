.pragma library
.import "../tree/refreshTree.js" as RefreshTree

function deleteNodePermanently(window, vaultFs, node) {
    if (node && vaultFs.deleteItem(node.path)) {
        RefreshTree.refreshTree(window, vaultFs);
    }
}

// Deletes every node in the list (used for multi-select deletion), then
// refreshes the tree once. Closes any open tab for a removed note and clears
// the selection.
function deleteNodesPermanently(window, vaultFs, nodes) {
    if (!nodes || nodes.length === 0) return;

    let deleted = false;

    for (let i = 0; i < nodes.length; i++) {
        let node = nodes[i];
        if (node && vaultFs.deleteItem(node.path)) {
            deleted = true;
            window.closeTabByPath(node.path);
        }
    }

    if (deleted) {
        window.selectedNodes = [];
        window.selectionAnchor = null;
        RefreshTree.refreshTree(window, vaultFs);
    }
}
