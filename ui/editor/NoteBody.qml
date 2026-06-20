import QtQuick
import QtQuick.Controls
import HyperLinkNotes
import "../../scripts/editor/createNoteFromSelection.js" as CreateNoteScript
import "../../scripts/editor/wrapSelectionInLink.js" as WrapSelection
import "../../scripts/editor/openLink.js" as OpenLink

ScrollView {
    id: scrollView
    clip: true
    ScrollBar.horizontal.policy: ScrollBar.AlwaysOff
    
    property alias text: noteBody.text
    property var vaultFs: null
    
    signal bodyTextChanged(string text)
    
    property alias textArea: noteBody

    TextArea {
        id: noteBody
        width: scrollView.width
        readOnly: false
        placeholderText: "Start writing..."
        placeholderTextColor: "#444444"
        color: "#e0e0e0"
        font.pixelSize: 16
        font.family: "Segoe UI"
        background: null
        selectByMouse: true
        selectionColor: "#25ffffff"
        selectedTextColor: "#ffffff"
        wrapMode: TextEdit.WrapAtWordBoundaryOrAnywhere
        leftPadding: 0
        topPadding: 0

        onTextChanged: {
            if (activeFocus) {
                scrollView.bodyTextChanged(text);
            }
        }
        
        MarkdownHighlighter {
            document: noteBody.textDocument
            cursorPosition: noteBody.cursorPosition
        }

        MouseArea {
            anchors.fill: parent
            acceptedButtons: Qt.LeftButton | Qt.RightButton
            cursorShape: Qt.IBeamCursor
            
            onPressed: (mouse) => {
                if (mouse.button === Qt.RightButton) {
                    if (noteBody.selectedText.length > 0) {
                        editorContextMenu.popup();
                        mouse.accepted = true;
                    } else {
                        mouse.accepted = false;
                    }
                } else if (mouse.button === Qt.LeftButton && (mouse.modifiers & Qt.ControlModifier)) {
                    let pos = noteBody.positionAt(mouse.x, mouse.y);
                    OpenLink.checkAndOpenLink(window, scrollView.vaultFs, noteBody.text, pos);
                    mouse.accepted = true;
                } else {
                    mouse.accepted = false;
                }
            }
        }
        
        Keys.onPressed: (event) => {
            if (event.key === Qt.Key_BracketLeft && noteBody.selectedText.length > 0) {
                WrapSelection.wrapSelection(noteBody);
                event.accepted = true;
            }
        }
        
        Menu {
            id: editorContextMenu
            MenuItem {
                text: "Create New Note"
                onTriggered: {
                    CreateNoteScript.createNote(window, scrollView.vaultFs, noteBody);
                }
            }
        }
    }
}
