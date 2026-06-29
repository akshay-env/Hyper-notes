import QtQuick
import QtQuick.Layouts
import HyperLinkNotes
import "../graph"

// Right dock: a live mini-graph of the open note's neighbourhood + a clickable
// outline of its headings. Collapsible — width animates to 0 when closed.
Rectangle {
    id: root
    width: window.rightPanelOpen ? window.rightPanelWidth : 0
    color: Theme.surface
    clip: true

    // The editor instance (NoteEditor), forwarded to the Outline.
    property var editorRef: null

    // Smooth slide for the open/close toggle (matches the sidebar).
    Behavior on width {
        NumberAnimation { duration: 300; easing.type: Easing.OutCubic }
    }

    // Left border — the seam between the editor and this panel.
    Rectangle {
        anchors.left: parent.left
        anchors.top: parent.top
        anchors.bottom: parent.bottom
        width: 1
        color: Theme.border
    }

    ColumnLayout {
        // Anchor left/top/bottom (NOT fill/right) + a fixed width — same pattern as
        // Sidebar. Setting anchors.fill AND width conflicts and mis-sizes the column.
        anchors.left: parent.left
        anchors.top: parent.top
        anchors.bottom: parent.bottom
        anchors.leftMargin: 13          // +1 to clear the left border line
        anchors.topMargin: 36           // drop content to align "Graph" with the editor toolbar
        anchors.bottomMargin: 12
        // Fixed content width so the slide just clips instead of reflowing.
        width: window.rightPanelWidth - 25
        spacing: 8

        // ── Graph ────────────────────────────────────────────────────────────
        Text {
            text: "Graph"
            color: Theme.textDim
            font.pixelSize: 12
            font.family: "Segoe UI"
            font.letterSpacing: 0.3
        }

        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 172
            radius: 8
            color: Theme.graphBg
            border.color: Theme.border
            border.width: 1
            clip: true

            MiniGraph {
                anchors.fill: parent
                anchors.margins: 1          // keep nodes inside the rounded border
                onExpandRequested: window.graphViewActive = true
            }
        }

        // ── Outline ──────────────────────────────────────────────────────────
        Text {
            text: "Outline"
            color: Theme.textDim
            font.pixelSize: 12
            font.family: "Segoe UI"
            font.letterSpacing: 0.3
            Layout.topMargin: 6
        }

        Outline {
            Layout.fillWidth: true
            Layout.fillHeight: true
            editorRef: root.editorRef
        }
    }
}
