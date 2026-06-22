import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import "../dialogs"
import "../../scripts/tree/refreshTree.js" as RefreshTree

ColumnLayout {
    id: root
    spacing: 16
    visible: window.activeNote !== null

    property string currentLoadedPath: ""

    // Sync editor text fields when activeNote changes
    Connections {
        target: window
        function onActiveNoteChanged() {
            if (window.activeNote) {
                if (window.activeNote.path !== currentLoadedPath) {
                    noteTitle.text = window.activeNote.name.replace(/\.md$/i, "");
                    noteBody.text = window.activeNote.path ? vaultFs.readFile(window.activeNote.path) : (window.activeNote.content || "");
                    currentLoadedPath = window.activeNote.path;
                    noteTitle.editingPath = window.activeNote.path;
                    noteTitle.editingOriginalName = window.activeNote.name.replace(/\.md$/i, "");
                }
            } else {
                noteTitle.text = "";
                noteBody.text = "";
                currentLoadedPath = "";
                noteTitle.editingPath = "";
                noteTitle.editingOriginalName = "";
            }
        }
    }

    NoteTitle {
        id: noteTitle
        Layout.fillWidth: true
        vaultFs: window.vaultFsRef

        onRenameRequested: (oldPath, newName) => {
            let newPath = vaultFs.renameFile(oldPath, newName);
            if (newPath !== "") {
                if (window.activeNote && window.activeNote.path === oldPath) {
                    window.activeNote.path = newPath;
                    window.activeNote.name = newName + (newName.endsWith(".md") || newName.endsWith(".txt") ? "" : ".md");
                    root.currentLoadedPath = newPath; // Prevent file reload on refresh
                    noteTitle.editingPath = newPath;
                    noteTitle.editingOriginalName = newName;
                    // Keep the open tab pointing at the renamed file
                    window.updateActiveTabLabel(newPath, newName);
                }
                RefreshTree.refreshTree(window, window.vaultFsRef);
            } else {
                noteTitle.text = noteTitle.editingOriginalName;
            }
        }

        onTitleAccepted: {
            noteBody.textArea.forceActiveFocus();
        }
    }

    NoteBody {
        id: noteBody
        Layout.fillWidth: true
        Layout.fillHeight: true
        vaultFs: window.vaultFsRef
        
        onBodyTextChanged: (text) => {
            if (window.activeNote && window.activeNote.path) {
                vaultFs.saveFile(window.activeNote.path, text);
            }
        }
    }
}
