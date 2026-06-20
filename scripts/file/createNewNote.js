.pragma library
.import "../tree/refreshTree.js" as RefreshTree
.import "./openFileByPath.js" as OpenFile

function createNewNote(window, vaultFs) {
    if (!vaultFs) return;
    
    console.log("createNewNote called. Vault path:", vaultFs.vaultPath);
    let targetPath = vaultFs.vaultPath;
    
    if (window.selectedNodes && window.selectedNodes.length > 0) {
        let node = window.selectedNodes[0];
        if (node.isFolder) {
            targetPath = node.path;
        } else {
            // Extract directory from the selected file's path
            let p = node.path;
            let lastSlash = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
            if (lastSlash !== -1) {
                targetPath = p.substring(0, lastSlash);
            }
        }
    }
    console.log("Selected target path for new note:", targetPath);
    
    if (vaultFs.createNote(targetPath, "Untitled")) {
        console.log("createNote success");
        let newPath = vaultFs.getLastCreatedPath();
        console.log("New path:", newPath);
        RefreshTree.refreshTree(window, vaultFs);
        OpenFile.openFileByPath(window, newPath);
    }
}
