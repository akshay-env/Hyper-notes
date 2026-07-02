.pragma library
.import "../tree/refreshTree.js" as RefreshTree
.import "../file/openFileByPath.js" as OpenFile

function sanitizeName(s) {
    // Collapse the selection's first meaningful line into a safe filename.
    var first = (s || "").split(/\r?\n/).find(function (l) { return l.trim().length > 0; }) || s;
    var name = first.replace(/[\\/:*?"<>|#\[\]]/g, " ").replace(/\s+/g, " ").trim();
    if (name.length > 40) name = name.substring(0, 40).trim();
    return name.length > 0 ? name : "Branch";
}

// Branches the current editor selection into a NEW child note whose `parent`
// (YAML frontmatter) is the current note. Leaves a [[link]] behind in the
// parent and opens the child, seeded with the selection as a blockquote.
//
// `editor` is the LivePreviewEditor: it exposes selectedText() (char selection
// in the active line OR the whole-line block selection) and replaceSelection().
// This is the new-editor equivalent of the old single-TextArea version — the
// per-line editor has no note-spanning TextArea, so selection lives on the
// editor, not on a raw text field.
function branchFromSelection(window, vaultFs, editor) {
    if (!editor || !vaultFs) return false;

    var selectedText = (editor.selectedText() || "").trim();
    if (selectedText.length === 0) return false;

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
    if (!ok) return false;

    var childPath = vaultFs.getLastCreatedPath();
    // Quote every selected line so a multi-line selection stays one blockquote.
    var quoted = selectedText.split(/\r?\n/).map(function (l) { return "> " + l; }).join("\n");
    var childContent = "---\nparent: " + parentTitle + "\n---\n\n" + quoted + "\n\n";
    vaultFs.saveFile(childPath, childContent);

    // Replace the selection in the parent with a link to the child, then save
    // the parent (its frontmatter, if any, is preserved — it's part of the text).
    editor.replaceSelection("[[" + childName + "]]");
    if (window.activeNote && window.activeNote.path)
        vaultFs.saveFile(window.activeNote.path, editor.text);

    RefreshTree.refreshTree(window, vaultFs);
    OpenFile.openFileByPath(window, childPath);
    return true;
}
