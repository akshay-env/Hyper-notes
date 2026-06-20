import QtQuick
import QtQuick.Layouts
import "../components"
import "../../scripts/window/openNewFolderDialog.js" as OpenFolderDialog
import ".."

Item {
    id: root
    width: parent.width
    height: 40

    property var vaultFs: null
    signal newNoteRequested()
    signal newFolderRequested()

    RowLayout {
        anchors.fill: parent
        anchors.leftMargin: 12
        anchors.rightMargin: 12
        spacing: 8

        Text {
            text: vaultFs && vaultFs.vaultPath ? vaultFs.vaultPath.split('/').pop() : "Vault"
            color: "#999999"
            font.pixelSize: 11
            font.bold: true
            font.letterSpacing: 0.5
            Layout.fillWidth: true
            elide: Text.ElideRight
        }

        IconButton {
            iconText: "+"
            tooltipText: "New Note"
            onClicked: {
                console.log("New Note button clicked in SidebarHeader!");
                root.newNoteRequested();
            }
        }

        IconButton {
            iconText: "📁"
            tooltipText: "New Folder"
            onClicked: OpenFolderDialog.openNewFolderDialog(window.newFolderDialog)
        }
    }
}
