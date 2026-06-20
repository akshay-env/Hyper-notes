.pragma library

// Arm the animation flag on the root item so the Behavior fires on
// the next isExpanded change. Called BEFORE toggleExpansion changes isExpanded.
function run(root) {
    root.animateNextToggle = true;
}
