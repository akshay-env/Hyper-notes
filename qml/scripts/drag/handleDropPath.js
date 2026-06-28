.pragma library
.import "../tree/refreshTree.js" as RefreshTree

function handleDropPath(window, vaultFs, targetPath) {
    if (!targetPath || !window.dragSourceNodes || window.dragSourceNodes.length === 0) {
        window.dragSourceNodes = [];
        return;
    }

    let changesMade = false;
    window.dragSourceNodes.forEach(node => {
        if (!node || !node.path) return;
        // Guard: cannot drop into itself or a descendant of itself
        if (targetPath === node.path) return;
        if (targetPath.startsWith(node.path + "/") || targetPath.startsWith(node.path + "\\")) return;

        if (vaultFs.moveItem(node.path, targetPath)) {
            changesMade = true;
        }
    });

    // Always clear drag state
    window.dragSourceNodes = [];

    if (changesMade) {
        vaultFs.setExpanded(targetPath, true);
        RefreshTree.refreshTree(window, vaultFs);
    }
}
