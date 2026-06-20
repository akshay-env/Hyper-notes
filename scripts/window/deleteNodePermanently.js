.pragma library
.import "../tree/refreshTree.js" as RefreshTree

function deleteNodePermanently(window, vaultFs, node) {
    if (node && vaultFs.deleteItem(node.path)) {
        RefreshTree.refreshTree(window, vaultFs);
    }
}
