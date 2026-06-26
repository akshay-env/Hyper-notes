.pragma library
.import "../tree/refreshTree.js" as RefreshTree
.import "../file/openFileByPath.js" as OpenFile

function sanitizeName(s) {
    var name = s.replace(/[\\/:*?"<>|#\[\]]/g, " ").replace(/\s+/g, " ").trim();
    if (name.length > 40) name = name.substring(0, 40).trim();
    return name.length > 0 ? name : "Branch";
}

// Branches the current selection into a NEW child note whose `parent` (in YAML
// frontmatter) is the current note. Leaves a [[link]] behind in the parent and
// opens the child. The child's body is seeded with the selection as a quote.
function branchFromSelection(window, vaultFs, textArea) {
    if (!textArea || !vaultFs) return;

    var start = textArea.selectionStart;
    var end = textArea.selectionEnd;
    if (start === end) return;
    if (start > end) { var t = start; start = end; end = t; }

    var selectedText = textArea.selectedText.trim();
    if (selectedText.length === 0) return;

    var parentTitle = (window.activeNote && window.activeNote.name)
                      ? window.activeNote.name.replace(/\.md$/i, "") : "";

    var parentDir = vaultFs.vaultPath;
    if (window.activeNote && window.activeNote.path) {
        var p = window.activeNote.path;
        var ls = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
        if (ls !== -1) parentDir = p.substring(0, ls);
    }

    // Create the child, disambiguating the filename if it already exists.
    var base = sanitizeName(selectedText);
    var childName = base;
    var ok = vaultFs.createNote(parentDir, childName);
    var n = 2;
    while (!ok && n < 50) { childName = base + " " + n; ok = vaultFs.createNote(parentDir, childName); n++; }
    if (!ok) return;

    var childPath = vaultFs.getLastCreatedPath();
    var childContent = "---\nparent: " + parentTitle + "\n---\n\n> " + selectedText + "\n\n";
    vaultFs.saveFile(childPath, childContent);

    // Link the selection in the parent to the child, then save the parent. Its
    // own frontmatter (if any) is part of textArea.text, so it's preserved.
    textArea.remove(start, end);
    var link = "[[" + childName + "]]";
    textArea.insert(start, link);
    textArea.cursorPosition = start + link.length;
    if (window.activeNote && window.activeNote.path)
        vaultFs.saveFile(window.activeNote.path, textArea.text);

    RefreshTree.refreshTree(window, vaultFs);
    OpenFile.openFileByPath(window, childPath);
}
