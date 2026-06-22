.pragma library

// Selection is compared by PATH, not by object identity. window.vaultTree holds
// a C++ QVariantList, and QML re-wraps it into brand-new JS objects on every
// read — so the same logical node has a different object identity each time it
// is fetched. Reference comparison (indexOf) only happens to work while every
// node comes from a single read (the Repeater's). Anything that reads the tree
// again (range select, post-refresh re-selection) gets non-matching wrappers.
// Paths are stable strings, so we key off them everywhere.

function indexOfPath(list, path) {
    if (!list) return -1;
    for (let i = 0; i < list.length; i++) {
        if (list[i] && list[i].path === path) return i;
    }
    return -1;
}

function containsPath(list, path) {
    return indexOfPath(list, path) !== -1;
}
