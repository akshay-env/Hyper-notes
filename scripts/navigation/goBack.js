.pragma library

function goBack(window) {
    if (!window) return;
    
    if (window.historyIndex > 0) {
        window.historyIndex--;
        let node = window.historyStack[window.historyIndex];
        // We set activeNote directly here to avoid triggering another push
        window.activeNote = node;
    }
}
