import QtQuick
import HyperLinkNotes
import "../../scripts/file/createNoteInRoot.js" as CreateNoteInRoot

// Shown for an empty tab.
Item {
    id: root

    Column {
        anchors.centerIn: parent
        spacing: 18

        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: "Start a new note"
            color: Theme.textDim
            font.pixelSize: 16
            font.family: "Segoe UI"
        }

        Row {
            anchors.horizontalCenter: parent.horizontalCenter
            topPadding: 4
            spacing: 10

            Rectangle {
                width: createText.implicitWidth + 30
                height: 34
                radius: 8
                color: createHover.containsMouse ? Theme.accentHover : Theme.accent
                Behavior on color { ColorAnimation { duration: Theme.animFast } }

                Text {
                    id: createText
                    anchors.centerIn: parent
                    text: "Create note"
                    color: Theme.onAccent
                    font.pixelSize: 13
                    font.bold: true
                    font.family: "Segoe UI"
                }

                MouseArea {
                    id: createHover
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: CreateNoteInRoot.createNoteInRoot(window, window.vaultFsRef)
                }
            }

            Rectangle {
                width: closeText.implicitWidth + 30
                height: 34
                radius: 8
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
                    cursorShape: Qt.PointingHandCursor
                    onClicked: window.closeTab(window.activeTabIndex)
                }
            }
        }
    }
}
