.pragma library

function search(nodeArray, path) {
    for (let i = 0; i < nodeArray.length; i++) {
        if (nodeArray[i].path === path) return nodeArray[i];
        if (nodeArray[i].children && nodeArray[i].children.length > 0) {
            let found = search(nodeArray[i].children, path);
            if (found) return found;
        }
    }
    return null;
}
