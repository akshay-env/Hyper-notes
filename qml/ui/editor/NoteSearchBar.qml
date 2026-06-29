import QtQuick
import QtQuick.Controls
import HyperLinkNotes
import "../components"

// In-note "find" bar. Lives inside a clipping container (in Main) that animates its
// height to slide this down from the toolbar line and back up. Drives the editor's
// search API (runSearch / nextMatch / prevMatch / clearSearch) via `editor`.
Rectangle {
    id: bar
    height: 44
    color: Theme.surface2
    border.color: field.activeFocus ? Theme.accent : Theme.border
    border.width: 1

    property var editor: null         // NoteEditor instance
    property bool searched: false     // a search has been run for the current text
    signal closeRequested()

    function focusField() { field.forceActiveFocus(); field.selectAll(); }
    function reset() { field.text = ""; bar.searched = false; }

    function doSearch() {
        if (!bar.editor)
            return;
        if (field.text.trim() === "") {
            bar.editor.searchClear();
            bar.searched = false;
            return;
        }
        if (bar.searched)
            bar.editor.searchNext();        // Enter again → next result
        else {
            bar.editor.searchRun(field.text);
            bar.searched = true;
        }
    }

    Row {
        id: navRow
        anchors.right: parent.right
        anchors.rightMargin: 8
        anchors.verticalCenter: parent.verticalCenter
        spacing: 2
        visible: bar.searched && bar.editor && bar.editor.searchCount > 0

        // ▲ previous result
        Rectangle {
            width: 28; height: 28; radius: 6
            color: prevMouse.containsMouse ? Theme.elevated : "transparent"
            Behavior on color { ColorAnimation { duration: Theme.animFast } }
            Canvas {
                anchors.centerIn: parent; width: 12; height: 12
                property color tint: prevMouse.containsMouse ? Theme.text : Theme.textDim
                onTintChanged: requestPaint()
                onPaint: {
                    var c = getContext("2d"); c.reset();
                    c.strokeStyle = tint; c.lineWidth = 1.5; c.lineCap = "round"; c.lineJoin = "round";
                    c.beginPath(); c.moveTo(2.5, 8); c.lineTo(6, 4.5); c.lineTo(9.5, 8); c.stroke();
                }
            }
            MouseArea {
                id: prevMouse; anchors.fill: parent; hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: if (bar.editor) bar.editor.searchPrev()
            }
        }
        // ▼ next result
        Rectangle {
            width: 28; height: 28; radius: 6
            color: nextMouse.containsMouse ? Theme.elevated : "transparent"
            Behavior on color { ColorAnimation { duration: Theme.animFast } }
            Canvas {
                anchors.centerIn: parent; width: 12; height: 12
                property color tint: nextMouse.containsMouse ? Theme.text : Theme.textDim
                onTintChanged: requestPaint()
                onPaint: {
                    var c = getContext("2d"); c.reset();
                    c.strokeStyle = tint; c.lineWidth = 1.5; c.lineCap = "round"; c.lineJoin = "round";
                    c.beginPath(); c.moveTo(2.5, 4.5); c.lineTo(6, 8); c.lineTo(9.5, 4.5); c.stroke();
                }
            }
            MouseArea {
                id: nextMouse; anchors.fill: parent; hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: if (bar.editor) bar.editor.searchNext()
            }
        }
    }

    // Result counter (e.g. 3/12), shown once a search has run.
    Text {
        id: counter
        anchors.right: navRow.visible ? navRow.left : parent.right
        anchors.rightMargin: 10
        anchors.verticalCenter: parent.verticalCenter
        visible: bar.searched
        color: Theme.textMuted
        font.pixelSize: 12
        font.family: "Segoe UI"
        text: {
            if (!bar.editor || bar.editor.searchCount === 0)
                return "No results";
            return (bar.editor.searchCurrent + 1) + " / " + bar.editor.searchCount;
        }
    }

    TextField {
        id: field
        anchors.left: parent.left
        anchors.leftMargin: 14
        anchors.right: counter.left
        anchors.rightMargin: 10
        anchors.verticalCenter: parent.verticalCenter
        placeholderText: "Find in note…"
        placeholderTextColor: Theme.textFaint
        color: Theme.text
        font.pixelSize: 14
        font.family: "Segoe UI"
        selectionColor: Theme.accentSoftHi
        selectedTextColor: "#ffffff"
        background: null
        leftPadding: 0

        onAccepted: bar.doSearch()
        // Editing the query invalidates the previous run; results hide until Enter.
        onTextEdited: {
            if (bar.searched) {
                bar.searched = false;
                if (bar.editor) bar.editor.searchClear();
            }
        }
        Keys.onEscapePressed: bar.closeRequested()
    }
}
