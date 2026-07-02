import QtQuick
import QtQuick.Controls
import HyperLinkNotes

// One Windows-style caption button (minimize / maximize / restore / close).
// Fluent-inspired motion: a quick, even hover wash, a firmer pressed wash, and
// glyphs that brighten in sync. Close turns red (white glyph) on hover/press.
Rectangle {
    id: root
    width: 46
    height: 32

    property string iconType: "minimize" // "minimize", "maximize", "restore", "close"
    signal clicked()

    readonly property bool isClose: iconType === "close"
    readonly property bool hovered: controlArea.containsMouse
    readonly property bool down: controlArea.containsPress

    // Hover/press wash. Transparent at rest; a themed step up on hover; a firmer
    // step when pressed (close uses the danger colour). Themed tokens — not a
    // hardcoded white overlay — so the highlight reads correctly on light themes
    // too. One short fade (animFast), matching the app's other hover affordances.
    color: isClose ? (down ? Theme.dangerHover : hovered ? Theme.danger : "transparent")
                   : (down ? Theme.elevated   : hovered ? Theme.surface2 : "transparent")
    Behavior on color { ColorAnimation { duration: Theme.animFast } }

    // The colour painted directly behind the glyph (snaps, not animated). The
    // restore glyph's FRONT window is filled with this so it cleanly occludes the
    // window behind it — in every theme and hover/press state. (The old code
    // compared a `color` to the string "transparent", which never matched, so the
    // front window filled with the translucent hover colour and the back window
    // bled through.)
    readonly property color backdrop: down ? Theme.elevated : hovered ? Theme.surface2 : Theme.bg

    // Single animated glyph colour so every icon part brightens together. White on
    // the close hover (over red); otherwise dim → full text colour.
    property color iconColor: (isClose && (hovered || down)) ? "#ffffff"
                            : (hovered || down)               ? Theme.text
                                                              : Theme.textDim
    Behavior on iconColor { ColorAnimation { duration: Theme.animFast } }

    // Minimize Line
    Rectangle {
        anchors.centerIn: parent
        width: 10
        height: 1
        antialiasing: true
        color: root.iconColor
        visible: root.iconType === "minimize"
    }

    // Maximize Square
    Rectangle {
        anchors.centerIn: parent
        width: 10
        height: 10
        color: "transparent"
        border.color: root.iconColor
        border.width: 1
        antialiasing: true
        visible: root.iconType === "maximize"
    }

    // Restore — two overlapping windows. The front one is filled with `backdrop`
    // so it occludes the window drawn behind it.
    Item {
        anchors.centerIn: parent
        width: 10
        height: 10
        visible: root.iconType === "restore"

        // Window behind (peeks out at the top-right).
        Rectangle {
            x: 2; y: 0; width: 8; height: 8
            color: "transparent"
            border.color: root.iconColor
            border.width: 1
            antialiasing: true
        }
        // Window in front — opaque backdrop fill hides the overlap.
        Rectangle {
            x: 0; y: 2; width: 8; height: 8
            color: root.backdrop
            border.color: root.iconColor
            border.width: 1
            antialiasing: true
        }
    }

    // Close X
    Item {
        anchors.centerIn: parent
        width: 10
        height: 10
        visible: root.iconType === "close"

        Rectangle {
            anchors.centerIn: parent
            width: 12
            height: 1
            rotation: 45
            antialiasing: true
            color: root.iconColor
        }
        Rectangle {
            anchors.centerIn: parent
            width: 12
            height: 1
            rotation: -45
            antialiasing: true
            color: root.iconColor
        }
    }

    MouseArea {
        id: controlArea
        anchors.fill: parent
        hoverEnabled: true
        onClicked: root.clicked()
    }
}
