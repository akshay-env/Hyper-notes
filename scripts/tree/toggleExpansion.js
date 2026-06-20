.pragma library

function toggleExpansion(window, vaultFs, root, childRepeater) {
    let expanding = !root.isExpanded;
    if (expanding) {
        // Pre-populate children BEFORE flipping isExpanded so implicitHeight
        // is already computed when the animation reads it synchronously.
        childRepeater.model = root.nodeData.children;
    }
    root.isExpanded = expanding;
    if (vaultFs) vaultFs.setExpanded(root.nodeData.path, expanding);
    // On collapse: childRepeater.model is cleared by collapseAnim.onStopped
    // so children remain visible while the animation plays.
}
