import QtQuick
import HyperLinkNotes

// Bottom status bar: save state + word count on the left, the open note's
// vault-relative path on the right. Reads the live editor through `editorRef`.
Rectangle {
    id: root
    height: 26
    color: Theme.surface
    clip: true

    // The editor instance (NoteEditor) — exposes `saved` and `wordCount`.
    property var editorRef: null

    readonly property bool hasNote: window.activeNote !== null && window.activeNote.path

    // Top divider — separates the status bar from the content above it.
    Rectangle {
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: parent.top
        height: 1
        color: Theme.border
    }

    // ── Left cluster: saved state + word count ───────────────────────────────
    Row {
        anchors.left: parent.left
        anchors.leftMargin: 12
        anchors.verticalCenter: parent.verticalCenter
        spacing: 14
        visible: root.hasNote

        // Word count
        Row {
            anchors.verticalCenter: parent.verticalCenter
            spacing: 6

            Canvas {
                width: 11
                height: 13
                anchors.verticalCenter: parent.verticalCenter
                onPaint: {
                    var ctx = getContext("2d");
                    ctx.reset();
                    ctx.strokeStyle = Theme.textMuted;
                    ctx.lineWidth = 1.2;
                    ctx.lineCap = "round";
                    ctx.lineJoin = "round";
                    // document outline
                    ctx.beginPath();
                    ctx.moveTo(1.5, 1.5); ctx.lineTo(7, 1.5); ctx.lineTo(9.5, 4);
                    ctx.lineTo(9.5, 11.5); ctx.lineTo(1.5, 11.5); ctx.closePath();
                    ctx.stroke();
                    // text lines
                    ctx.beginPath();
                    ctx.moveTo(3.3, 6); ctx.lineTo(7.7, 6);
                    ctx.moveTo(3.3, 8.3); ctx.lineTo(7.7, 8.3);
                    ctx.stroke();
                }
            }

            Text {
                anchors.verticalCenter: parent.verticalCenter
                text: {
                    var n = root.editorRef ? root.editorRef.wordCount : 0;
                    return n.toLocaleString(Qt.locale(), "f", 0) + (n === 1 ? " word" : " words");
                }
                color: Theme.textMuted
                font.pixelSize: 11
                font.family: "Segoe UI"
            }
        }
    }

    // ── Right: vault-relative path of the open note ──────────────────────────
    Text {
        anchors.right: parent.right
        anchors.rightMargin: 12
        anchors.left: parent.horizontalCenter
        anchors.verticalCenter: parent.verticalCenter
        horizontalAlignment: Text.AlignRight
        visible: root.hasNote
        elide: Text.ElideLeft
        color: Theme.textMuted
        font.pixelSize: 11
        font.family: "Segoe UI"
        text: {
            if (!window.activeNote || !window.activeNote.path || !window.vaultFsRef.vaultPath)
                return "";
            var fullPath = window.activeNote.path;
            var vaultRoot = window.vaultFsRef.vaultPath;
            if (fullPath.startsWith(vaultRoot)) {
                var rel = fullPath.substring(vaultRoot.length + 1);
                return rel.replace(/[\\/]/g, " / ");
            }
            return fullPath;
        }
    }
}
