import QtQuick
import HyperLinkNotes

// Custom themed vertical scrollbar. The native Windows Qt Quick Controls style
// refuses to restyle a Controls ScrollBar (it logs "does not support
// customization"), so this is a plain overlay instead: a rounded pill that
// tracks the target Flickable/ListView, fades in while scrolling or hovered,
// and can be dragged. Place it as a SIBLING of the target and set `flick`:
//   ThemedScrollBar { flick: theListView }
Item {
    id: root

    property Flickable flick: null

    anchors.right: flick ? flick.right : undefined
    anchors.top: flick ? flick.top : undefined
    anchors.bottom: flick ? flick.bottom : undefined
    width: 12
    z: 100
    visible: flick && flick.contentHeight > flick.height + 1

    readonly property real scrollable: flick ? Math.max(1, flick.contentHeight - flick.height) : 1
    readonly property real handleH: flick ? Math.max(30, (flick.height / flick.contentHeight) * height) : height
    readonly property real trackH: Math.max(1, height - handleH)

    // Lit while scrolling (then fades) or while hovered/dragging.
    property bool lit: false
    property bool dragging: false
    Timer { id: fade; interval: 900; onTriggered: root.lit = false }
    Connections {
        target: root.flick
        function onContentYChanged() { root.lit = true; fade.restart(); }
    }

    Rectangle {
        id: handle
        width: 6
        radius: 3
        anchors.right: parent.right
        anchors.rightMargin: 3
        height: root.handleH
        // Always bound to contentY — dragging moves contentY (below), never y
        // directly, so the binding is never broken.
        y: root.flick ? (root.flick.contentY / root.scrollable) * root.trackH : 0

        color: ma.pressed ? Theme.textMuted
             : (ma.containsMouse ? Theme.textFaint
             : Qt.rgba(Theme.textFaint.r, Theme.textFaint.g, Theme.textFaint.b, 0.55))
        opacity: (root.lit || ma.containsMouse || root.dragging) ? 1 : 0
        Behavior on opacity { NumberAnimation { duration: 250; easing.type: Easing.OutCubic } }
        Behavior on color { ColorAnimation { duration: Theme.animFast } }

        MouseArea {
            id: ma
            anchors.fill: parent
            anchors.margins: -4              // a touch easier to grab
            hoverEnabled: true
            cursorShape: Qt.ArrowCursor
            property real grabOffset: 0      // grab point relative to handle top (track frame)

            onPressed: (m) => {
                root.dragging = true;
                var p = mapToItem(root, m.x, m.y);
                grabOffset = p.y - handle.y;
            }
            onReleased: { root.dragging = false; root.lit = true; fade.restart(); }
            onPositionChanged: (m) => {
                if (!root.dragging || !root.flick) return;
                var p = mapToItem(root, m.x, m.y);
                var top = Math.max(0, Math.min(root.trackH, p.y - grabOffset));
                root.flick.contentY = (top / root.trackH) * root.scrollable;
            }
        }
    }
}
