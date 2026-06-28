.pragma library
.import "../tree/search.js" as Search
.import "../navigation/pushHistory.js" as PushHistory

function openFileByPath(window, path) {
    // Cached JS tree — reading window.vaultTree re-wraps the whole QVariant tree.
    let node = Search.search(window.vaultTreeJS, path);
    if (node) {
        PushHistory.push(window, node);
        window.openNoteInTab(node);
    }
}
