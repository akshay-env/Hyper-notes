.pragma library
.import "../tree/refreshTree.js" as RefreshTree
.import "./openFileByPath.js" as OpenFile

// Creates a new "Untitled" note in the vault root (auto-incrementing on name
// collision) and opens it. Routed through openFileByPath so it fills the
// current empty tab.
function createNoteInRoot(window, vaultFs) {
    if (!vaultFs || !vaultFs.vaultPath) return;

    if (vaultFs.createNote(vaultFs.vaultPath, "Untitled")) {
        let newPath = vaultFs.getLastCreatedPath();
        RefreshTree.refreshTree(window, vaultFs);
        if (newPath !== "") {
            OpenFile.openFileByPath(window, newPath);
        }
    }
}
