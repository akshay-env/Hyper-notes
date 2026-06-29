import QtQuick
import QtQuick.Controls
import HyperLinkNotes

// Document outline: lists the markdown headings of the open note, indented by
// level. Clicking a heading scrolls the editor to that line.
Item {
    id: root

    // The editor instance (NoteEditor) — exposes `editorText` + `scrollToLine`.
    property var editorRef: null

    // Re-parsed whenever the live text changes. A heading is 1–6 '#' then space.
    readonly property var items: {
        var out = [];
        var txt = (root.editorRef && root.editorRef.editorText) ? root.editorRef.editorText : "";
        if (txt.length === 0) return out;
        var lines = txt.split("\n");
        for (var i = 0; i < lines.length; i++) {
            var m = lines[i].match(/^(#{1,6})\s+(.*)$/);
            if (m) {
                var label = m[2].replace(/\s+#*\s*$/, "").trim();   // strip trailing #'s
                if (label.length > 0)
                    out.push({ "level": m[1].length, "text": label, "line": i });
            }
        }
        return out;
    }

    // Empty hint
    Text {
        anchors.left: parent.left
        anchors.top: parent.top
        anchors.topMargin: 2
        visible: root.items.length === 0
        text: window.activeNote ? "No headings" : "No note open"
        color: Theme.textFaint
        font.pixelSize: 11
        font.family: "Segoe UI"
        font.italic: true
    }

    ListView {
        id: list
        anchors.fill: parent
        clip: true
        visible: root.items.length > 0
        model: root.items
        boundsBehavior: Flickable.StopAtBounds

        delegate: Item {
            width: list.width
            height: 26

            required property var modelData

            Rectangle {
                anchors.fill: parent
                anchors.rightMargin: 2
                radius: 4
                color: rowMouse.containsMouse ? Theme.overlayHover : "transparent"
            }

            // First-level heading gets an accent tick to anchor the eye.
            Rectangle {
                anchors.left: parent.left
                anchors.verticalCenter: parent.verticalCenter
                width: 2
                height: 12
                radius: 1
                color: Theme.accent
                visible: modelData.level <= 1
            }

            Text {
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                anchors.leftMargin: 10 + (modelData.level - 1) * 12
                anchors.rightMargin: 6
                text: modelData.text
                color: rowMouse.containsMouse ? Theme.text
                     : (modelData.level <= 1 ? Theme.textDim : Theme.textMuted)
                font.pixelSize: modelData.level <= 1 ? 12 : 11
                font.bold: modelData.level <= 1
                font.family: "Segoe UI"
                elide: Text.ElideRight

                Behavior on color { ColorAnimation { duration: Theme.animFast } }
            }

            MouseArea {
                id: rowMouse
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: {
                    if (root.editorRef) root.editorRef.scrollToLine(modelData.line);
                }
            }
        }
    }

    // Themed scrollbar overlay for the outline.
    ThemedScrollBar { flick: list }
}
