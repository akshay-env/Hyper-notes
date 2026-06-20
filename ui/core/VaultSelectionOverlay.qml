import QtQuick
import QtQuick.Controls

Rectangle {
    id: root
    anchors.fill: parent
    color: "#121212"
    z: 1000

    signal openVaultRequested()

    Column {
        anchors.centerIn: parent
        spacing: 20

        Text {
            text: "HyperLink Notes"
            color: "#ffffff"
            font.pixelSize: 32
            font.bold: true
            anchors.horizontalCenter: parent.horizontalCenter
        }
        
        Text {
            text: "No vault selected. Create or select a folder to use as your vault."
            color: "#aaaaaa"
            font.pixelSize: 14
            anchors.horizontalCenter: parent.horizontalCenter
        }

        Rectangle {
            width: 150
            height: 40
            color: openVaultHover.containsMouse ? "#0077ee" : "#0066cc"
            radius: 4
            anchors.horizontalCenter: parent.horizontalCenter

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
