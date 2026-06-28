.pragma library
.import "../file/openFileByPath.js" as OpenFile
.import "../tree/refreshTree.js" as RefreshTree
.import "../tree/search.js" as Search

// ── Link syntax ─────────────────────────────────────────────────────────────
// Single target : [[Note_266]]
// Multi target  : [[label|Note_266|Note_724|Note_582]]
//   - the text before the first "|" is the visible label
//   - the rest are the notes this label links to
// parseInner() splits the inner text (between [[ and ]]) into { label, targets }.
function parseInner(inner) {
    let pipe = inner.indexOf("|");
    if (pipe === -1)
        return { label: inner, targets: [inner] };
    let label = inner.substring(0, pipe);
    let targets = inner.substring(pipe + 1).split("|").map(s => s.trim()).filter(s => s.length > 0);
    if (targets.length === 0) targets = [label];
    return { label: label, targets: targets };
}

// Resolves a note title to a path, creating the note (in the active note's
// folder, or the vault root) when it doesn't exist yet. Returns "" on failure.
function resolveOrCreate(window, vaultFs, linkTitle) {
    if (!linkTitle || !vaultFs) return "";

    function findFile(nodes) {
        for (let i = 0; i < nodes.length; i++) {
            let node = nodes[i];
            if (node.isFolder) {
                let res = findFile(node.children);
                if (res) return res;
            } else if (node.name.replace(/\.md$/i, "") === linkTitle) {
                return node.path;
            }
        }
        return "";
    }

    let targetPath = window.vaultTree ? findFile(window.vaultTree) : "";
    if (targetPath !== "") return targetPath;

    // Doesn't exist — create it next to the current note (or in the vault root).
    let parentPath = vaultFs.vaultPath;
    if (window.activeNote && window.activeNote.path) {
        let p = window.activeNote.path;
        let lastSlash = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
        if (lastSlash !== -1) parentPath = p.substring(0, lastSlash);
    }
    if (vaultFs.createNote(parentPath, linkTitle)) {
        RefreshTree.refreshTree(window, vaultFs);
        return vaultFs.getLastCreatedPath();
    }
    return "";
}

// Opens a single note by title in the current tab (replacing an empty tab or
// focusing an already-open one).
function openLink(window, vaultFs, linkTitle) {
    let path = resolveOrCreate(window, vaultFs, linkTitle);
    if (path !== "") OpenFile.openFileByPath(window, path);
}

// Opens a note by title in a brand-new tab (used by "Open all in tabs").
function openLinkInNewTab(window, vaultFs, linkTitle) {
    let path = resolveOrCreate(window, vaultFs, linkTitle);
    if (path === "") return;
    let node = Search.search(window.vaultTree, path);
    if (!node) return;
    if (window.openNoteInNewTab) window.openNoteInNewTab(node);
    else window.openNoteInTab(node);
}

function openAllInTabs(window, vaultFs, titles) {
    for (let i = 0; i < titles.length; i++)
        openLinkInNewTab(window, vaultFs, titles[i]);
}

// True only when (mouseX, mouseY) sits over the rendered glyphs spanning the
// text range [rangeStart, rangeEnd). positionAt() snaps to the nearest char, so
// this geometry check rejects clicks in the empty margin past the line's end.
function clickIsOnRange(textArea, mouseX, mouseY, rangeStart, rangeEnd) {
    if (rangeEnd <= rangeStart) return false;
    let rStart = textArea.positionToRectangle(rangeStart);
    let rEnd = textArea.positionToRectangle(rangeEnd);

    let top = Math.min(rStart.y, rEnd.y);
    let bottom = Math.max(rStart.y + rStart.height, rEnd.y + rEnd.height);
    if (mouseY < top || mouseY > bottom) return false;

    let sameLine = Math.abs(rStart.y - rEnd.y) < 1;
    if (sameLine) {
        let left = Math.min(rStart.x, rEnd.x) - 2;
        let right = Math.max(rStart.x, rEnd.x) + 2;
        return mouseX >= left && mouseX <= right;
    }
    return true; // rare: label wrapped across visual lines
}

// Handles a left-click. If the click landed on a link's visible label, opens
// the (first) target and returns true so the caller can swallow the click.
// For a multi-target link the hover card surfaces the rest.
function checkAndOpenLink(window, vaultFs, textArea, mouseX, mouseY) {
    let text = textArea.text;
    let cursorPosition = textArea.positionAt(mouseX, mouseY);
    if (cursorPosition < 0 || cursorPosition >= text.length) return false;

    let regex = /\[\[(.*?)\]\]/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
        let start = match.index;
        let end = start + match[0].length;
        if (cursorPosition >= start && cursorPosition <= end) {
            let parsed = parseInner(match[1]);
            let visStart = start + 2;                       // after "[["
            let visEnd = visStart + parsed.label.length;    // end of visible label
            if (!clickIsOnRange(textArea, mouseX, mouseY, visStart, visEnd))
                return false;
            openLink(window, vaultFs, parsed.targets[0]);
            return true;
        }
    }
    return false;
}

// Hover hit-test: if (mouseX, mouseY) is over the label of ANY link (single or
// multi), returns { label, targets, x, y, width, height } (geometry in textArea
// content coordinates, for anchoring the hover card). Returns null otherwise.
function hoverLinkAt(textArea, mouseX, mouseY) {
    let text = textArea.text;
    let pos = textArea.positionAt(mouseX, mouseY);
    if (pos < 0 || pos >= text.length) return null;

    let regex = /\[\[(.*?)\]\]/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
        let start = match.index;
        let end = start + match[0].length;
        if (pos < start || pos > end) continue;

        let parsed = parseInner(match[1]);

        let visStart = start + 2;
        let visEnd = visStart + parsed.label.length;
        if (!clickIsOnRange(textArea, mouseX, mouseY, visStart, visEnd)) return null;

        let rStart = textArea.positionToRectangle(visStart);
        let rEnd = textArea.positionToRectangle(visEnd);
        let top = Math.min(rStart.y, rEnd.y);
        let bottom = Math.max(rStart.y + rStart.height, rEnd.y + rEnd.height);
        return {
            label: parsed.label,
            targets: parsed.targets,
            x: Math.min(rStart.x, rEnd.x),
            y: top,
            width: Math.abs(rEnd.x - rStart.x),
            height: bottom - top
        };
    }
    return null;
}

// Like multiLinkAt but matches ANY link (single or multi) whose visible label
// is under the cursor. Returns { start, end, inner } in document indices so the
// caller can rewrite the link in place (used to extend a link with more notes).
function linkRangeAt(textArea, mouseX, mouseY) {
    let text = textArea.text;
    let pos = textArea.positionAt(mouseX, mouseY);
    if (pos < 0 || pos >= text.length) return null;

    let regex = /\[\[(.*?)\]\]/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
        let start = match.index;
        let end = start + match[0].length;
        if (pos < start || pos > end) continue;

        let parsed = parseInner(match[1]);
        let visStart = start + 2;
        let visEnd = visStart + parsed.label.length;
        if (!clickIsOnRange(textArea, mouseX, mouseY, visStart, visEnd)) return null;
        return { start: start, end: end, inner: match[1] };
    }
    return null;
}
