.pragma library

function saveTitleNow(noteTitle) {
    if (noteTitle.editingPath === "") return;
    
    let newName = noteTitle.text.trim();
    if (newName === noteTitle.editingOriginalName || newName === "") {
        return;
    }

    if (noteTitle.vaultFs && !noteTitle.vaultFs.isFileNameAvailable(noteTitle.editingPath, newName)) {
        return;
    }

    noteTitle.renameRequested(noteTitle.editingPath, newName);
}
