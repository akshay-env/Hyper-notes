import QtQuick
import QtQuick.Controls
import HyperLinkNotes

Rectangle {
    id: root
    anchors.fill: parent
    color: Theme.bg
    z: 1000

    signal openVaultRequested()

    Column {
        anchors.centerIn: parent
        spacing: 20

        Text {
            text: "HyperLink Notes"
            color: Theme.text
            font.pixelSize: 32
            font.bold: true
            anchors.horizontalCenter: parent.horizontalCenter
        }

        Text {
            text: "No vault selected. Create or select a folder to use as your vault."
            color: Theme.textDim
            font.pixelSize: 14
            anchors.horizontalCenter: parent.horizontalCenter
        }

        Rectangle {
            width: 150
            height: 40
            color: openVaultHover.containsMouse ? Theme.accentHover : Theme.accent
            radius: 6
            anchors.horizontalCenter: parent.horizontalCenter

            Behavior on color { ColorAnimation { duration: Theme.animFast } }

            Text {
                anchors.centerIn: parent
                text: "Open Vault"
                color: "#ffffff"
                font.bold: true
                font.pixelSize: 14
            }

            MouseArea {
                id: openVaultHover
                anchors.fill: parent
                hoverEnabled: true
                onClicked: root.openVaultRequested()
            }
        }
    }
}
