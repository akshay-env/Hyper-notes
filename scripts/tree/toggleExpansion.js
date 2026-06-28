.pragma library

function toggleExpansion(window, vaultFs, root, childRepeater) {
    let expanding = !root.isExpanded;
    if (expanding) {
        let kids = root.nodeData.children;
        // Big folders load their delegates asynchronously, so an animated height
        // would just stutter as they stream in — skip the animation for those.
        if (kids && kids.length > 40) root.animateNextToggle = false;
        // Pre-populate children BEFORE flipping isExpanded so implicitHeight
        // is already computed when the animation reads it synchronously.
        childRepeater.model = kids;
    }
    root.isExpanded = expanding;
    if (vaultFs) vaultFs.setExpanded(root.nodeData.path, expanding);
    // On collapse: childRepeater.model is cleared by collapseAnim.onStopped
    // so children remain visible while the animation plays.
}
