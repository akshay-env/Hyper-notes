.pragma library
.import "search.js" as Search

function refreshTree(window, vaultFs) {
    if (vaultFs.vaultPath) {
        window.vaultTree = vaultFs.getVaultTree();
        window.treeVersion++;

        if (window.activeNote) {
            let updatedNote = Search.search(window.vaultTree, window.activeNote.path);
            if (updatedNote) {
                window.activeNote = updatedNote;
                window.selectedNodes = [updatedNote];
            } else {
                window.activeNote = null;
                window.selectedNodes = [];
            }
        } else {
            // No open note — re-locate any selected folder nodes in the new tree
            let updatedSel = [];
            if (window.selectedNodes) {
                window.selectedNodes.forEach(function(sel) {
                    let found = Search.search(window.vaultTree, sel.path);
                    if (found) updatedSel.push(found);
                });
            }
            window.selectedNodes = updatedSel;
        }
    }
}
