import QtQuick
import HyperLinkNotes

Item {
    id: root
    visible: window.isDraggingNode
    width: 150
    height: 32
    z: 99999

    Drag.active: window.isDraggingNode
    Drag.hotSpot.x: width / 2
    Drag.hotSpot.y: height / 2
    Drag.keys: ["node"]

    function doDrop() {
        Drag.drop();
    }

    Rectangle {
        anchors.fill: parent
        color: Theme.accent
        radius: 4
        opacity: 0.92
        Text {
            anchors.centerIn: parent
            text: window.dragSourceNodes.length > 0 ? window.dragSourceNodes[0].name : ""
            color: Theme.onAccent
            font.pixelSize: 13
            elide: Text.ElideRight
            width: parent.width - 16
            horizontalAlignment: Text.AlignHCenter
        }
    }
}
