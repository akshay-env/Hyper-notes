.pragma library
.import "../tree/search.js" as Search
.import "../navigation/pushHistory.js" as PushHistory

function openFileByPath(window, path) {
    let node = Search.search(window.vaultTree, path);
    if (node) {
        PushHistory.push(window, node);
        window.openNoteInTab(node);
    }
}
