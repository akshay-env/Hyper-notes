import QtQuick
import QtQuick.Controls
import HyperLinkNotes

// Right-click context menu for a file-tree item. Implemented as a fully
// theme-controlled Popup (instead of a styled Menu) so its size is exact and
// the native Controls style can't inflate it. Open with popupAt(x, y).
Popup {
    id: contextMenu
    padding: 5
    modal: false
    dim: false
    closePolicy: Popup.CloseOnEscape | Popup.CloseOnPressOutside

    property string nodePath: ""
    property string nodeName: ""
    property var vaultFs: null
    signal deleteRequested(string path, string name)

    // Opens the menu with its top-left at (x, y) in the parent's coordinates.
    function popupAt(px, py) {
        x = px;
        y = py;
        open();
    }

    background: Rectangle {
        color: Theme.surface2
        border.color: Theme.border
        border.width: 1
        radius: 8
    }

    contentItem: Rectangle {
        id: deleteRow
        implicitWidth: 140
        implicitHeight: 30
        radius: 5
        color: delMouse.containsMouse ? Theme.dangerSoft : "transparent"

        Row {
            anchors.left: parent.left
            anchors.leftMargin: 10
            anchors.verticalCenter: parent.verticalCenter
            spacing: 8

            Canvas {
                width: 13
                height: 13
                anchors.verticalCenter: parent.verticalCenter
                property color tint: delMouse.containsMouse ? Theme.dangerHover : Theme.danger
                onTintChanged: requestPaint()
                onPaint: {
                    var ctx = getContext("2d");
                    ctx.reset();
                    ctx.strokeStyle = tint;
                    ctx.lineWidth = 1.3;
                    ctx.lineJoin = "round";
                    ctx.beginPath();
                    ctx.moveTo(2, 3.2); ctx.lineTo(11, 3.2);
                    ctx.moveTo(4.8, 3.2); ctx.lineTo(4.8, 1.8); ctx.lineTo(8.2, 1.8); ctx.lineTo(8.2, 3.2);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(2.8, 3.2); ctx.lineTo(3.5, 11.4); ctx.lineTo(9.5, 11.4); ctx.lineTo(10.2, 3.2);
                    ctx.stroke();
                }
            }

            Text {
                text: "Delete"
                color: delMouse.containsMouse ? Theme.dangerHover : Theme.danger
                font.pixelSize: 13
                font.family: "Segoe UI"
                anchors.verticalCenter: parent.verticalCenter
            }
        }

        MouseArea {
            id: delMouse
            anchors.fill: parent
            hoverEnabled: true
            onClicked: {
                contextMenu.deleteRequested(contextMenu.nodePath, contextMenu.nodeName);
                contextMenu.close();
            }
        }
    }
}
