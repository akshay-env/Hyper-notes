import QtQuick
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
            color: createHover.containsMouse ? "#2a2350" : "#1d1830"
            border.color: "#3a3370"
            border.width: 1

            Text {
                id: createText
                anchors.centerIn: parent
                text: "Create new note"
                color: "#c9baff"
                font.pixelSize: 13
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
            color: closeHover.containsMouse ? "#1d1d1d" : "transparent"
            border.color: "#2a2a2a"
            border.width: 1

            Text {
                id: closeText
                anchors.centerIn: parent
                text: "Close"
                color: "#9aa0ff"
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
