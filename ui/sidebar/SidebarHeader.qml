import QtQuick
import QtQuick.Layouts
import HyperLinkNotes
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
            color: Theme.textDim
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
            id: folderBtn
            tooltipText: "New Folder"
            onClicked: OpenFolderDialog.openNewFolderDialog(window.newFolderDialog)

            // Minimal monochrome folder outline, themed grey
            Canvas {
                anchors.centerIn: parent
                width: 18
                height: 15
                property color tint: folderBtn.containsMouse ? Theme.text : Theme.textDim
                onTintChanged: requestPaint()
                onPaint: {
                    var ctx = getContext("2d");
                    ctx.reset();
                    ctx.strokeStyle = tint;
                    ctx.lineWidth = 1.3;
                    ctx.lineJoin = "round";
                    ctx.beginPath();
                    ctx.moveTo(1.5, 4.5);
                    ctx.lineTo(6, 4.5);
                    ctx.lineTo(7.6, 6.3);
                    ctx.lineTo(16.5, 6.3);
                    ctx.lineTo(16.5, 13.5);
                    ctx.lineTo(1.5, 13.5);
                    ctx.closePath();
                    ctx.stroke();
                }
            }
        }
    }
}
