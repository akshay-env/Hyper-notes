import QtQuick
import HyperLinkNotes
import "../../scripts/file/createNoteInRoot.js" as CreateNoteInRoot

// Shown for an empty tab. "Create new note" adds a note in the vault root and
// opens it in this tab. "Go to file" is intentionally omitted.
Item {
    id: root

    Column {
        anchors.centerIn: parent
        spacing: 16

        // Create new note (primary action) — adds to the vault root
        Rectangle {
            anchors.horizontalCenter: parent.horizontalCenter
            width: createText.implicitWidth + 30
            height: 34
            radius: 6
            color: createHover.containsMouse ? Theme.accentHover : Theme.accent
            border.width: 0

            Behavior on color { ColorAnimation { duration: Theme.animFast } }

            Text {
                id: createText
                anchors.centerIn: parent
                text: "Create new note"
                color: "#ffffff"
                font.pixelSize: 13
                font.bold: true
                font.family: "Segoe UI"
            }

            MouseArea {
                id: createHover
                anchors.fill: parent
                hoverEnabled: true
                onClicked: CreateNoteInRoot.createNoteInRoot(window, window.vaultFsRef)
            }
        }

        Rectangle {
            anchors.horizontalCenter: parent.horizontalCenter
            width: closeText.implicitWidth + 30
            height: 34
            radius: 6
            color: closeHover.containsMouse ? Theme.elevated : "transparent"
            border.color: Theme.border
            border.width: 1

            Behavior on color { ColorAnimation { duration: Theme.animFast } }

            Text {
                id: closeText
                anchors.centerIn: parent
                text: "Close"
                color: Theme.textDim
                font.pixelSize: 13
                font.family: "Segoe UI"
            }

            MouseArea {
                id: closeHover
                anchors.fill: parent
                hoverEnabled: true
                onClicked: window.closeTab(window.activeTabIndex)
            }
        }
    }
}
