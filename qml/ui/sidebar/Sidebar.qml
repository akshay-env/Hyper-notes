import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import HyperLinkNotes
import "../../scripts/tree/refreshTree.js" as RefreshTree
import "../../scripts/file/openFileByPath.js" as OpenFile
import "../../scripts/window/openNewFolderDialog.js" as OpenFolderDialog
import "../../scripts/file/createNewNote.js" as CreateNote

Rectangle {
    id: root
    width: window.sidebarOpen ? window.sidebarWidth : 0
    color: Theme.surface
    clip: true

    // Smooth sliding transition for the OPEN/CLOSE toggle only. While the user is
    // dragging the resize handle, disable it so the panel edge (and the editor
    // border) track the mouse exactly instead of lagging behind by the animation.
    Behavior on width {
        enabled: !resizer.pressed
        NumberAnimation { duration: 300; easing.type: Easing.OutCubic }
    }

    // Right border line for the sidebar
    Rectangle {
        anchors.right: parent.right
        anchors.top: parent.top
        anchors.bottom: parent.bottom
        width: 1
        color: Theme.divider
    }

    // Resizer handle on the right edge
    MouseArea {
        id: resizer
        anchors.right: parent.right
        anchors.top: parent.top
        anchors.bottom: parent.bottom
        width: 6
        cursorShape: Qt.SplitHCursor
        z: 100

        property int startMouseX: 0
        property int startWidth: 0

        onPressed: (mouse) => {
            let globalPos = mapToItem(null, mouse.x, mouse.y);
            startMouseX = globalPos.x;
            startWidth = window.sidebarWidth;
        }

        onPositionChanged: (mouse) => {
            if (pressed) {
                let globalPos = mapToItem(null, mouse.x, mouse.y);
                let newWidth = startWidth + (globalPos.x - startMouseX);
                if (newWidth < 240) newWidth = 240;   // locked minimum (the default width)
                if (newWidth > 600) newWidth = 600;
                window.sidebarWidth = newWidth;
            }
        }
    }

    // Background MouseArea to clear selection
    MouseArea {
        anchors.fill: parent
        z: -1
        onClicked: {
            window.selectedNodes = []
        }
    }

    // Sidebar Layout
    ColumnLayout {
        anchors.left: parent.left
        anchors.top: parent.top
        anchors.bottom: parent.bottom
        anchors.margins: 12
        // Fixed content width: while the panel slides open/closed, the root
        // (clip: true) just clips this content instead of re-laying-out the whole
        // file tree on every animation frame — that reflow was the slide jank.
        width: window.sidebarWidth - 24
        spacing: 12

        SidebarHeader {
            vaultFs: window.vaultFsRef
            onNewNoteRequested: CreateNote.createNewNote(window, vaultFs)
            onNewFolderRequested: OpenFolderDialog.openNewFolderDialog(window.newFolderDialog)
        }

        SidebarSearch {
            Layout.fillWidth: true
        }

        FileTree {
            Layout.fillWidth: true
            Layout.fillHeight: true
            vaultFs: window.vaultFsRef
        }

        // Bottom bar — Bin tile + Settings gear, pinned to the bottom
        RowLayout {
            Layout.fillWidth: true
            spacing: 8

        Rectangle {
            id: binTile
            Layout.fillWidth: true
            Layout.preferredHeight: 40
            radius: 6
            color: binMouse.containsMouse ? Theme.elevated : Theme.surface2
            border.color: Theme.border
            border.width: 1

            Behavior on color { ColorAnimation { duration: Theme.animFast } }

            Row {
                anchors.left: parent.left
                anchors.leftMargin: 12
                anchors.verticalCenter: parent.verticalCenter
                spacing: 8

                // Minimal trash glyph
                Canvas {
                    width: 14
                    height: 14
                    anchors.verticalCenter: parent.verticalCenter
                    property color tint: binMouse.containsMouse ? Theme.text : Theme.textDim
                    onTintChanged: requestPaint()
                    onPaint: {
                        var ctx = getContext("2d");
                        ctx.reset();
                        ctx.strokeStyle = tint;
                        ctx.lineWidth = 1.3;
                        ctx.lineJoin = "round";
                        // lid
                        ctx.beginPath();
                        ctx.moveTo(2, 3.5); ctx.lineTo(12, 3.5);
                        ctx.moveTo(5.5, 3.5); ctx.lineTo(5.5, 2); ctx.lineTo(8.5, 2); ctx.lineTo(8.5, 3.5);
                        ctx.stroke();
                        // can
                        ctx.beginPath();
                        ctx.moveTo(3, 3.5); ctx.lineTo(3.8, 12.5); ctx.lineTo(10.2, 12.5); ctx.lineTo(11, 3.5);
                        ctx.stroke();
                    }
                }
                Text {
                    text: "Bin"
                    color: Theme.textDim
                    font.pixelSize: 12
                    font.family: "Segoe UI"
                    anchors.verticalCenter: parent.verticalCenter
                }
            }

            MouseArea {
                id: binMouse
                anchors.fill: parent
                hoverEnabled: true
                onClicked: window.openBin()
            }
        }

        // Settings gear
        Rectangle {
            id: settingsTile
            Layout.preferredWidth: 44
            Layout.preferredHeight: 40
            radius: 6
            color: settingsMouse.containsMouse ? Theme.elevated : Theme.surface2
            border.color: Theme.border
            border.width: 1

            Behavior on color { ColorAnimation { duration: Theme.animFast } }

            Canvas {
                anchors.centerIn: parent
                width: 16
                height: 16
                property color tint: settingsMouse.containsMouse ? Theme.text : Theme.textDim
                onTintChanged: requestPaint()
                onPaint: {
                    var ctx = getContext("2d");
                    ctx.reset();
                    ctx.strokeStyle = tint;
                    ctx.lineWidth = 1.3;
                    ctx.lineJoin = "round";
                    var cx = width / 2, cy = height / 2;
                    var rBody = 4.1, rTeeth = 6.4;
                    ctx.beginPath(); ctx.arc(cx, cy, rBody, 0, 2 * Math.PI); ctx.stroke();
                    ctx.beginPath(); ctx.arc(cx, cy, 1.7, 0, 2 * Math.PI); ctx.stroke();
                    for (var i = 0; i < 8; i++) {
                        var a = i * Math.PI / 4;
                        ctx.beginPath();
                        ctx.moveTo(cx + Math.cos(a) * rBody, cy + Math.sin(a) * rBody);
                        ctx.lineTo(cx + Math.cos(a) * rTeeth, cy + Math.sin(a) * rTeeth);
                        ctx.stroke();
                    }
                }
            }

            MouseArea {
                id: settingsMouse
                anchors.fill: parent
                hoverEnabled: true
                onClicked: window.openSettings()
            }
        }
        }
    }
}
