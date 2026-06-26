import QtQuick
import HyperLinkNotes

Item {
    id: root
    width: 18
    height: 32 // Matches item row height

    property bool isExpanded: false
    signal clicked(var mouseEvent)

    Canvas {
        id: chevronCanvas
        anchors.centerIn: parent
        width: 12
        height: 12
        rotation: root.isExpanded ? 90 : 0
        z: 10

        Behavior on rotation {
            NumberAnimation { duration: 150; easing.type: Easing.OutCubic }
        }

        onPaint: {
            var ctx = getContext("2d");
            ctx.clearRect(0, 0, width, height);
            ctx.strokeStyle = Theme.textMuted;
            ctx.lineWidth = 2.0;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.beginPath();
            ctx.moveTo(4, 2.5);
            ctx.lineTo(8.5, 6);
            ctx.lineTo(4, 9.5);
            ctx.stroke();
        }
    }

    MouseArea {
        anchors.fill: parent
        z: 20
        onClicked: (mouse) => {
            root.clicked(mouse);
        }
    }
}
