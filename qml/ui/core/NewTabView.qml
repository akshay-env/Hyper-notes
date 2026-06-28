import QtQuick
import HyperLinkNotes
import "../../scripts/file/createNoteInRoot.js" as CreateNoteInRoot

// Shown for an empty tab.
Item {
    id: root

    Column {
        anchors.centerIn: parent
        spacing: 18

        // App-identity glyph — a small knowledge graph.
        Canvas {
            anchors.horizontalCenter: parent.horizontalCenter
            width: 48
            height: 48
            property color tint: Theme.textMuted
            onTintChanged: requestPaint()
            onPaint: {
                var ctx = getContext("2d");
                ctx.reset();
                ctx.lineCap = "round";
                var hub = [24, 24];
                var sats = [[24, 7], [9, 35], [39, 35]];

                ctx.strokeStyle = tint;
                ctx.globalAlpha = 0.5;
                ctx.lineWidth = 1.6;
                for (var i = 0; i < sats.length; i++) {
                    ctx.beginPath();
                    ctx.moveTo(hub[0], hub[1]);
                    ctx.lineTo(sats[i][0], sats[i][1]);
                    ctx.stroke();
                }

                ctx.globalAlpha = 1.0;
                ctx.fillStyle = tint;
                ctx.beginPath(); ctx.arc(hub[0], hub[1], 4.2, 0, Math.PI * 2); ctx.fill();
                for (var j = 0; j < sats.length; j++) {
                    ctx.beginPath();
                    ctx.arc(sats[j][0], sats[j][1], 3.0, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }

        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: "Start a new note"
            color: Theme.textDim
            font.pixelSize: 16
            font.family: "Segoe UI"
        }

        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: "Write, link notes with [[ ]], and branch with AI."
            color: Theme.textMuted
            font.pixelSize: 12
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
