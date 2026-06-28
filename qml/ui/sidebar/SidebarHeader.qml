import QtQuick
import QtQuick.Layouts
import HyperLinkNotes
import "../components"
import "../../scripts/window/openNewFolderDialog.js" as OpenFolderDialog
import "../../scripts/drag/handleDropPath.js" as HandleDrop
import ".."

Item {
    id: root
    width: parent.width
    height: 40

    property var vaultFs: null
    signal newNoteRequested()
    signal newFolderRequested()

    // Dropping an item on the header (top of the panel) moves it to the vault root.
    DropArea {
        anchors.fill: parent
        keys: ["node"]
        onDropped: (drop) => {
            if (root.vaultFs && root.vaultFs.vaultPath) {
                HandleDrop.handleDropPath(window, root.vaultFs, root.vaultFs.vaultPath);
                drop.accept();
            }
        }
    }

    RowLayout {
        anchors.fill: parent
        anchors.leftMargin: 12
        anchors.rightMargin: 12
        spacing: 8

        // Vault name (shown in full).
        Text {
            text: vaultFs && vaultFs.vaultPath ? vaultFs.vaultPath.split(/[\\/]/).pop() : "Vault"
            color: Theme.textDim
            font.pixelSize: 11
            font.bold: true
            font.letterSpacing: 0.5
            Layout.maximumWidth: 130
            elide: Text.ElideRight
        }

        // Separate vault switcher — open an existing vault or create a new one.
        Rectangle {
            Layout.preferredWidth: 22
            Layout.preferredHeight: 22
            radius: 5
            color: vaultMouse.containsMouse ? Theme.elevated : "transparent"
            Behavior on color { ColorAnimation { duration: Theme.animFast } }

            Canvas {
                anchors.centerIn: parent
                width: 12
                height: 12
                property color tint: vaultMouse.containsMouse ? Theme.text : Theme.textMuted
                onTintChanged: requestPaint()
                onPaint: {
                    var ctx = getContext("2d");
                    ctx.reset();
                    ctx.strokeStyle = tint;
                    ctx.lineWidth = 1.4;
                    ctx.lineCap = "round";
                    ctx.lineJoin = "round";
                    ctx.beginPath();
                    ctx.moveTo(2.5, 4.5);
                    ctx.lineTo(6, 8);
                    ctx.lineTo(9.5, 4.5);
                    ctx.stroke();
                }
            }

            MouseArea {
                id: vaultMouse
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: window.openVaultPicker()
            }
        }

        Item { Layout.fillWidth: true }

        IconButton {
            iconText: "+"
            tooltipText: "New Note"
            onClicked: root.newNoteRequested()
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
