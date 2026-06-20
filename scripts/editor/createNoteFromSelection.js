.pragma library
.import "../tree/refreshTree.js" as RefreshTree

// Extracts the current selection into a new note and leaves a link behind
function createNote(window, vaultFs, textArea) {
    console.log("[CreateNote] Triggered 'Create New Note' from selection");
    if (!textArea || !vaultFs) return;
    
    let start = textArea.selectionStart;
    let end = textArea.selectionEnd;
    
    if (start === end) return;
    
    if (start > end) {
        let temp = start;
        start = end;
        end = temp;
    }
    
    let selectedText = textArea.selectedText.trim();
    if (selectedText.length === 0) {
        console.log("[CreateNote] Selection is empty after trim, aborting");
        return;
    }
    
    console.log("[CreateNote] Extracting text:", selectedText);
    
    // The parent directory of the current active note
    let parentPath = vaultFs.vaultPath; // Default to vault root
    if (window.activeNote && window.activeNote.path) {
        let p = window.activeNote.path;
        let lastSlash = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
        if (lastSlash !== -1) {
            parentPath = p.substring(0, lastSlash);
        }
    }
    
    console.log("[CreateNote] Creating note in folder:", parentPath);
    
    // Create the note
    let success = vaultFs.createNote(parentPath, selectedText);
    if (success) {
        console.log("[CreateNote] Note created successfully. Replacing text with link...");
        // Replace selection with a link
        textArea.remove(start, end);
        let linkText = "[[" + selectedText + "]]";
        textArea.insert(start, linkText);
        textArea.cursorPosition = start + linkText.length;
        
        // Refresh the tree to show the new note
        RefreshTree.refreshTree(window, vaultFs);
        console.log("[CreateNote] Process complete");
    } else {
        console.log("[CreateNote] Failed to create note (might already exist)");
    }
}
