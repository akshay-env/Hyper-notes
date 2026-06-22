.pragma library

function goBack(window) {
    if (!window) return;
    
    if (window.historyIndex > 0) {
        window.historyIndex--;
        let node = window.historyStack[window.historyIndex];
        // Route through tabs (does not push history), so back/forward focuses or
        // reopens the note's tab.
        window.openNoteInTab(node);
    }
}
