import QtQuick
import HyperLinkNotes

Column {
    spacing: 12

    Text {
        text: "No note open"
        color: Theme.textMuted
        font.pixelSize: 20
        font.bold: true
        anchors.horizontalCenter: parent.horizontalCenter
    }

    Text {
        text: "Select a note from the sidebar or create a new one to begin writing."
        color: Theme.textFaint
        font.pixelSize: 13
        anchors.horizontalCenter: parent.horizontalCenter
    }
}
