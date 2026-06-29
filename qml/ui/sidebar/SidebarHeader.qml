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

        // Graph view toggle (relocated here from the editor toolbar) — packs
        // together with the new-note / new-folder actions on the right.
        IconButton {
            id: graphBtn
            tooltipText: window.graphViewActive ? "Close Graph View" : "Graph View"
            defaultColor: window.graphViewActive ? Theme.accentSoft : "transparent"
            onClicked: window.graphViewActive = !window.graphViewActive

            // Three interconnected hollow nodes (matches the other line icons).
            Canvas {
                anchors.centerIn: parent
                width: 16
                height: 16
                property color tint: window.graphViewActive ? Theme.accentText
                                   : (graphBtn.containsMouse ? Theme.text : Theme.textDim)
                onTintChanged: requestPaint()
                onPaint: {
                    var ctx = getContext("2d");
                    ctx.reset();
                    ctx.lineCap = "round";
                    ctx.lineJoin = "round";
                    ctx.strokeStyle = tint;
                    ctx.lineWidth = 1.3;

                    var n = [[8, 3.3], [3.7, 11.9], [12.3, 11.9]];
                    var r = 2.0;
                    var edges = [[0, 1], [1, 2], [2, 0]];
                    for (var e = 0; e < edges.length; e++) {
                        var a = n[edges[e][0]], b = n[edges[e][1]];
                        var dx = b[0] - a[0], dy = b[1] - a[1];
                        var d = Math.sqrt(dx * dx + dy * dy);
                        var ux = dx / d, uy = dy / d;
                        ctx.beginPath();
                        ctx.moveTo(a[0] + ux * r, a[1] + uy * r);
                        ctx.lineTo(b[0] - ux * r, b[1] - uy * r);
                        ctx.stroke();
                    }
                    for (var i = 0; i < n.length; i++) {
                        ctx.beginPath();
                        ctx.arc(n[i][0], n[i][1], r, 0, Math.PI * 2);
                        ctx.stroke();
                    }
                }
            }
        }

        IconButton {
            iconText: "+"
            iconSize: 20                  // bump up so it matches the graph/folder glyphs
            tooltipText: "New Note"
            onClicked: root.newNoteRequested()
        }

        IconButton {
            id: folderBtn
            tooltipText: "New Folder"
            onClicked: OpenFolderDialog.openNewFolderDialog(window.newFolderDialog)

            // Minimal monochrome folder — balanced margins, rounded joins, and a
            // front-flap lip so it reads cleanly as a folder at this small size.
            Canvas {
                anchors.centerIn: parent
                width: 18
                height: 16
                property color tint: folderBtn.containsMouse ? Theme.text : Theme.textDim
                onTintChanged: requestPaint()
                onPaint: {
                    var ctx = getContext("2d");
                    ctx.reset();
                    ctx.strokeStyle = tint;
                    ctx.lineWidth = 1.4;
                    ctx.lineCap = "round";
                    ctx.lineJoin = "round";

                    // Outline: tab on the upper-left, gentle shoulder into the body.
                    ctx.beginPath();
                    ctx.moveTo(2.6, 13.4);
                    ctx.lineTo(2.6, 5);
                    ctx.lineTo(6.9, 5);
                    ctx.lineTo(8.5, 6.9);
                    ctx.lineTo(15.4, 6.9);
                    ctx.lineTo(15.4, 13.4);
                    ctx.closePath();
                    ctx.stroke();

                    // Front-flap lip.
                    ctx.beginPath();
                    ctx.moveTo(2.6, 9.2);
                    ctx.lineTo(15.4, 9.2);
                    ctx.stroke();
                }
            }
        }
    }
}
