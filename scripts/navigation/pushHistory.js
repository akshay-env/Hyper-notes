.pragma library

function push(window, node) {
    if (!window || !node) return;
    
    // If we are pushing the same node we are currently looking at, ignore
    if (window.historyIndex >= 0 && window.historyIndex < window.historyStack.length) {
        if (window.historyStack[window.historyIndex].path === node.path) {
            return;
        }
    }
    
    let stack = window.historyStack;
    let index = window.historyIndex;
    
    // If we navigated back and are now pushing a new path, discard the future
    if (index < stack.length - 1) {
        stack = stack.slice(0, index + 1);
    }
    
    stack.push(node);
    window.historyStack = stack;
    window.historyIndex = stack.length - 1;
}
