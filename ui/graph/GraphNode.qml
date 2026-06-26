import QtQuick
import HyperLinkNotes

Item {
    id: root

    // Data properties
    property string nodeTitle: ""
    property string nodePath: ""
    property int    nodeLayer: 0
    property int    nodeDegree: 0
    property bool   isActiveNote: false

    // Position: dot CENTER in graph space
    property real targetX: 0
    property real targetY: 0

    // Highlight state — set by GraphView.
    // isFocus: this node is open in a tab. isNeighbor: first neighbour of a
    // focused node (tab or hovered). anyActive: any highlighting is in effect
    // (tabs open or hovering) → non-lit nodes dim.
    property bool isHovered:  false
    property bool isFocus:    false
    property bool isNeighbor: false
    property bool anyActive:  false

    signal nodeClicked(string path)
    signal nodeHoverEntered(string path)
    signal nodeHoverExited(string path)
    signal nodeDragStarted(string path)
    signal nodeDragged(string path, real newX, real newY)
    signal nodeDragFinished(string path)

    // Node size scales with connection count (inbound + outbound links), like
    // Obsidian's graph. Growth is logarithmic so it tapers at high degree —
    // hubs read as clearly larger without ballooning and breaking the layout.
    // The active note keeps a small constant bump on top.
    readonly property int dotRadius: {
        var base = isActiveNote ? 8 : 6;
        var boost = Math.min(5.0 * Math.log2(1 + nodeDegree), 22);
        return Math.round(base + boost);
    }

    // Center the item horizontally on targetX; dot top at (targetY - dotRadius)
    x: targetX - width / 2
    y: targetY - dotRadius
    width: Math.max(dotRadius * 2, titleLabel.implicitWidth)
    height: dotRadius * 2 + 5 + titleLabel.implicitHeight
    z: isHovered ? 3 : 2

    // ── Entrance fade ────────────────────────────────────────────────────────
    // Quick, uniform fade-in (no per-layer stagger) so every node appears at once
    // and in sync with the edges — snappy instead of trickling in over a second.
    property real bloomOpacity: 0.0
    opacity: bloomOpacity
    Behavior on bloomOpacity { NumberAnimation { duration: 130; easing.type: Easing.OutCubic } }
    Component.onCompleted: bloomOpacity = 1.0

    // ── Dot circle (top-center of Item) ─────────────────────────────────────
    Rectangle {
        id: dot
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.top: parent.top
        width:  root.dotRadius * 2
        height: root.dotRadius * 2
        radius: root.dotRadius

        color: {
            if (root.isHovered)                    return Theme.nodeHi
            if (root.isActiveNote || root.isFocus) return Theme.nodeActive
            if (root.isNeighbor)                   return Theme.nodeNeighbor
            return Theme.node
        }
        opacity: {
            if (!root.anyActive)   return 1.0
            if (root.isHovered || root.isFocus || root.isActiveNote || root.isNeighbor) return 1.0
            return 0.14
        }
        scale: root.isHovered ? 1.3 : ((root.isFocus || root.isNeighbor) ? 1.1 : 1.0)

        Behavior on opacity { NumberAnimation { duration: 150 } }
        Behavior on scale   { NumberAnimation { duration: 150; easing.type: Easing.OutCubic } }
        Behavior on color   { ColorAnimation  { duration: 150 } }
    }

    // ── Label centered below dot ─────────────────────────────────────────────
    Text {
        id: titleLabel
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.top: dot.bottom
        anchors.topMargin: 5
        text: root.nodeTitle
        color: {
            if (root.isHovered)                    return Theme.nodeHi
            if (root.isActiveNote || root.isFocus) return Theme.accentText
            if (root.isNeighbor)                   return Theme.nodeNeighbor
            return Theme.node
        }
        opacity: {
            if (!root.anyActive)   return 1.0
            if (root.isHovered || root.isFocus || root.isActiveNote || root.isNeighbor) return 1.0
            return 0.14
        }
        font.pixelSize: 11
        font.bold: root.isHovered || root.isActiveNote || root.isFocus
        font.family: "Segoe UI"

        // Pop the label out a little on hover so it stands above its neighbours
        transformOrigin: Item.Top
        scale: root.isHovered ? 1.28 : 1.0

        Behavior on opacity { NumberAnimation { duration: 150 } }
        Behavior on color   { ColorAnimation  { duration: 150 } }
        Behavior on scale   { NumberAnimation { duration: 150; easing.type: Easing.OutCubic } }
    }

    // ── Mouse interaction (hit area around dot only) ─────────────────────────
    MouseArea {
        id: hitArea
        x: dot.x - 8
        y: dot.y - 8
        width:  dot.width  + 16
        height: dot.height + 16
        hoverEnabled: true
        preventStealing: true

        property bool isDragging: false
        property bool wasDragged: false
        property point startPos: Qt.point(0, 0)

        onEntered: root.nodeHoverEntered(root.nodePath)
        onExited:  root.nodeHoverExited(root.nodePath)

        onPressed: (mouse) => {
            startPos = Qt.point(mouse.x, mouse.y);
            isDragging = false;
            wasDragged = false;
        }

        onPositionChanged: (mouse) => {
            if (mouse.buttons & Qt.LeftButton) {
                let dx = mouse.x - startPos.x;
                let dy = mouse.y - startPos.y;
                if (!isDragging && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
                    isDragging = true;
                    wasDragged = true;
                    root.nodeDragStarted(root.nodePath);
                }
                if (isDragging) {
                    let pt = mapToItem(root.parent, mouse.x, mouse.y);
                    root.nodeDragged(root.nodePath, pt.x, pt.y);
                }
            }
        }

        onReleased: (mouse) => {
            if (isDragging) {
                isDragging = false;
                root.nodeDragFinished(root.nodePath);
                // The pointer grab during the drag swallowed the hover-exit event.
                // If the cursor ended up off the dot (common after a fast pull),
                // emit the exit now so the highlight doesn't stay stuck lit.
                if (!containsMouse) root.nodeHoverExited(root.nodePath);
            }
        }

        onClicked: (mouse) => {
            if (!wasDragged) {
                root.nodeClicked(root.nodePath);
            }
        }
    }
}
