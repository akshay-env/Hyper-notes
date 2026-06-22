.pragma library
.import "../file/openFileByPath.js" as OpenFile
.import "../tree/refreshTree.js" as RefreshTree

// Opens a link in the format [[Title]]
function openLink(window, vaultFs, linkTitle) {
    console.log("[OpenLink] Triggered for link title:", linkTitle);
    if (!linkTitle || !vaultFs) return;
    
    let targetPath = "";
    
    function findFile(nodes) {
        for (let i = 0; i < nodes.length; i++) {
            let node = nodes[i];
            if (node.isFolder) {
                let res = findFile(node.children);
                if (res) return res;
            } else {
                let nodeTitle = node.name.replace(/\.md$/i, "");
                if (nodeTitle === linkTitle) {
                    return node.path;
                }
            }
        }
        return "";
    }
    
    if (window.vaultTree) {
        console.log("[OpenLink] Searching vault tree for file matching title");
        targetPath = findFile(window.vaultTree);
    }
    
    if (targetPath !== "") {
        console.log("[OpenLink] File found at:", targetPath, "- Opening now");
        OpenFile.openFileByPath(window, targetPath);
    } else {
        console.log("[OpenLink] Target file does not exist. Creating new file for:", linkTitle);
        // Link target doesn't exist, create it in the same directory as the current file
        let parentPath = vaultFs.vaultPath;
        if (window.activeNote && window.activeNote.path) {
            let p = window.activeNote.path;
            let lastSlash = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
            if (lastSlash !== -1) {
                parentPath = p.substring(0, lastSlash);
            }
        }
        
        let success = vaultFs.createNote(parentPath, linkTitle);
        if (success) {
            console.log("[OpenLink] File created successfully");
            RefreshTree.refreshTree(window, vaultFs);
            let actualPath = vaultFs.getLastCreatedPath();
            console.log("[OpenLink] Opening newly created file at:", actualPath);
            if (actualPath !== "") {
                OpenFile.openFileByPath(window, actualPath);
            }
        } else {
            console.log("[OpenLink] Failed to create new note for link");
        }
    }
}

// Checks if the cursor position is inside a [[ ]] block, and if so, opens it.
// Returns true when a link was found and opened (so the caller can swallow the
// click), false when the position isn't on a link (caller lets the click place
// the text cursor as normal).
function checkAndOpenLink(window, vaultFs, text, cursorPosition) {
    console.log("[OpenLink] Checking click at position:", cursorPosition);
    if (cursorPosition < 0 || cursorPosition >= text.length) return false;

    // Find all [[ ]] blocks in the text
    let regex = /\[\[(.*?)\]\]/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
        let start = match.index;
        let end = start + match[0].length;

        if (cursorPosition >= start && cursorPosition <= end) {
            let linkTitle = match[1];
            console.log("[OpenLink] Found link at cursor position:", linkTitle);
            openLink(window, vaultFs, linkTitle);
            return true; // Found and handled
        }
    }
    console.log("[OpenLink] No link found at cursor position");
    return false;
}
