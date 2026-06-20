import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import "../../scripts/file/saveTitleNow.js" as SaveTitle

TextField {
    id: noteTitle
    readOnly: false
    placeholderText: "Untitled"
    placeholderTextColor: "#444444"
    color: nameAvailable ? "#ffffff" : "#ff4444"
    font.pixelSize: 28
    font.bold: true
    font.family: "Segoe UI"
    background: null
    leftPadding: 0
    rightPadding: 0
    topPadding: 0
    bottomPadding: 0
    selectionColor: "#25ffffff"
    selectedTextColor: "#ffffff"
    focus: true

    property bool nameAvailable: true
    property string editingPath: ""
    property string editingOriginalName: ""
    property var vaultFs: null
    
    signal renameRequested(string oldPath, string newName)
    signal titleAccepted()

    onActiveFocusChanged: {
        if (!activeFocus) {
            SaveTitle.saveTitleNow(noteTitle);
            if (!nameAvailable) {
                noteTitle.text = editingOriginalName;
                nameAvailable = true;
            }
        }
    }

    onTextEdited: {
        if (editingPath !== "" && vaultFs) {
            nameAvailable = vaultFs.isFileNameAvailable(editingPath, text);
            SaveTitle.saveTitleNow(noteTitle);
        }
    }

    onAccepted: {
        noteTitle.titleAccepted();
    }
}
