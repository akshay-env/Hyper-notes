.pragma library

function goForward(window) {
    if (!window) return;
    
    if (window.historyIndex < window.historyStack.length - 1) {
        window.historyIndex++;
        let node = window.historyStack[window.historyIndex];
        // We set activeNote directly here to avoid triggering another push
        window.activeNote = node;
    }
}
