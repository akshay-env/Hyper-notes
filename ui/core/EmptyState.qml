import QtQuick

Column {
    spacing: 12

    Text {
        text: "No File Open"
        color: "#666666"
        font.pixelSize: 20
        font.bold: true
        anchors.horizontalCenter: parent.horizontalCenter
    }

    Text {
        text: "Select a note from the sidebar or create a new one to begin writing."
        color: "#444444"
        font.pixelSize: 13
        anchors.horizontalCenter: parent.horizontalCenter
    }
}
