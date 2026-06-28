import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import HyperLinkNotes
import "../../scripts/graph/flattenNotes.js" as FlattenNotes

// Searchable multi-select note picker. Opened from the editor to attach one or
// more notes to a highlighted label without typing the [[label|A|B]] syntax.
// Emits picked(targets) with the chosen note titles.
Popup {
    id: picker
    parent: Overlay.overlay
    anchors.centerIn: Overlay.overlay
    width: 380
    modal: true
    padding: 0
    closePolicy: Popup.CloseOnEscape | Popup.CloseOnPressOutside

    property string headerText: "Link to notes"
    property string excludePath: ""     // active note — never link a note to itself
    property var selected: []           // chosen titles
    property var _allNotes: []          // [{title, path}]
    signal picked(var targets)

    Overlay.modal: Rectangle { color: Qt.rgba(0, 0, 0, 0.5) }

    background: Rectangle {
        color: Theme.surface
        border.color: Theme.border
        border.width: 1
        radius: 10
    }

    function openPicker() {
        selected = [];
        searchField.text = "";
        var notes = [];
        FlattenNotes.flattenNotes(window.vaultTree, notes);
        var arr = [];
        for (var i = 0; i < notes.length; i++) {
            if (notes[i].path === excludePath) continue;
            arr.push({ title: notes[i].name.replace(/\.md$/i, ""), path: notes[i].path });
        }
        arr.sort(function(a, b) { return a.title.localeCompare(b.title); });
        _allNotes = arr;
        open();
        Qt.callLater(function() { searchField.forceActiveFocus(); });
    }

    function filtered() {
        var q = searchField.text.toLowerCase();
        var out = [];
        for (var i = 0; i < _allNotes.length; i++) {
            if (q === "" || _allNotes[i].title.toLowerCase().indexOf(q) !== -1)
                out.push(_allNotes[i]);
        }
        return out;
    }

    function toggle(title) {
        var s = selected.slice();
        var idx = s.indexOf(title);
        if (idx === -1) s.push(title); else s.splice(idx, 1);
        selected = s;
    }
    function isSelected(title) { return selected.indexOf(title) !== -1; }

    contentItem: ColumnLayout {
        spacing: 0

        // Header
        Item {
            Layout.fillWidth: true
            implicitHeight: 46
            Text {
                anchors.left: parent.left
                anchors.leftMargin: 16
                anchors.verticalCenter: parent.verticalCenter
                text: picker.headerText
                color: Theme.text
                font.pixelSize: 15
                font.bold: true
                font.family: "Segoe UI"
            }
            Rectangle {
                anchors.bottom: parent.bottom
                anchors.left: parent.left
                anchors.right: parent.right
                height: 1
                color: Theme.divider
            }
        }

        // Selected chips
        Flow {
            Layout.fillWidth: true
            Layout.leftMargin: 12
            Layout.rightMargin: 12
            Layout.topMargin: 10
            spacing: 6
            visible: picker.selected.length > 0

            Repeater {
                model: picker.selected
                delegate: Rectangle {
                    height: 24
                    radius: 5
                    width: chipContent.width + 16
                    color: Theme.accentSoft

                    Row {
                        id: chipContent
                        anchors.centerIn: parent
                        spacing: 6

                        Text {
                            text: modelData
                            color: Theme.accentText
                            font.pixelSize: 11
                            font.family: "Segoe UI"
                            anchors.verticalCenter: parent.verticalCenter
                        }
                        Text {
                            text: "✕"
                            color: Theme.accentText
                            font.pixelSize: 11
                            anchors.verticalCenter: parent.verticalCenter
                            MouseArea {
                                anchors.fill: parent
                                anchors.margins: -5
                                cursorShape: Qt.PointingHandCursor
                                onClicked: picker.toggle(modelData)
                            }
                        }
                    }
                }
            }
        }

        // Search
        TextField {
            id: searchField
            Layout.fillWidth: true
            Layout.leftMargin: 12
            Layout.rightMargin: 12
            Layout.topMargin: 10
            placeholderText: "Search notes…"
            placeholderTextColor: Theme.textFaint
            color: Theme.text
            font.pixelSize: 13
            font.family: "Segoe UI"
            selectionColor: Theme.accent
            selectedTextColor: Theme.onAccent
            background: Rectangle {
                color: Theme.surface2
                radius: 6
                border.color: searchField.activeFocus ? Theme.accent : Theme.border
                border.width: 1
                Behavior on border.color { ColorAnimation { duration: Theme.animFast } }
            }
        }

        // Note list
        ScrollView {
            Layout.fillWidth: true
            Layout.leftMargin: 8
            Layout.rightMargin: 8
            Layout.topMargin: 8
            Layout.preferredHeight: 220
            clip: true
            ScrollBar.horizontal.policy: ScrollBar.AlwaysOff

            ListView {
                id: noteList
                model: picker.filtered()
                spacing: 2

                delegate: Rectangle {
                    width: noteList.width
                    height: 32
                    radius: 5
                    color: rowMouse.containsMouse ? Theme.surface2 : "transparent"
                    Behavior on color { ColorAnimation { duration: Theme.animFast } }

                    Row {
                        anchors.fill: parent
                        anchors.leftMargin: 10
                        anchors.rightMargin: 10
                        spacing: 8

                        Text {
                            width: 13
                            anchors.verticalCenter: parent.verticalCenter
                            text: picker.isSelected(modelData.title) ? "✓" : ""
                            color: Theme.accent
                            font.pixelSize: 13
                            font.bold: true
                        }
                        Text {
                            width: parent.width - 26
                            anchors.verticalCenter: parent.verticalCenter
                            text: modelData.title
                            color: picker.isSelected(modelData.title) ? Theme.text : Theme.textDim
                            font.pixelSize: 13
                            font.family: "Segoe UI"
                            elide: Text.ElideRight
                        }
                    }

                    MouseArea {
                        id: rowMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        onClicked: picker.toggle(modelData.title)
                    }
                }
            }
        }

        // Empty hint
        Text {
            Layout.fillWidth: true
            Layout.topMargin: 6
            Layout.bottomMargin: 6
            horizontalAlignment: Text.AlignHCenter
            visible: noteList.count === 0
            text: "No matching notes"
            color: Theme.textMuted
            font.pixelSize: 12
            font.family: "Segoe UI"
        }

        // Footer
        Item {
            Layout.fillWidth: true
            implicitHeight: 56
            Rectangle {
                anchors.top: parent.top
                anchors.left: parent.left
                anchors.right: parent.right
                height: 1
                color: Theme.divider
            }
            Row {
                anchors.right: parent.right
                anchors.rightMargin: 16
                anchors.verticalCenter: parent.verticalCenter
                spacing: 10

                Rectangle {
                    width: 86
                    height: 32
                    radius: 6
                    color: cancelHover.containsMouse ? Theme.elevated : "transparent"
                    border.color: Theme.border
                    border.width: 1
                    Behavior on color { ColorAnimation { duration: Theme.animFast } }
                    Text {
                        anchors.centerIn: parent
                        text: "Cancel"
                        color: Theme.textDim
                        font.pixelSize: 13
                        font.family: "Segoe UI"
                    }
                    MouseArea {
                        id: cancelHover
                        anchors.fill: parent
                        hoverEnabled: true
                        onClicked: picker.close()
                    }
                }

                Rectangle {
                    width: 110
                    height: 32
                    radius: 6
                    opacity: picker.selected.length > 0 ? 1 : 0.4
                    color: addHover.containsMouse ? Theme.accentHover : Theme.accent
                    Behavior on color { ColorAnimation { duration: Theme.animFast } }
                    Text {
                        anchors.centerIn: parent
                        text: picker.selected.length > 1 ? ("Add " + picker.selected.length + " notes") : "Add note"
                        color: Theme.onAccent
                        font.pixelSize: 13
                        font.bold: true
                        font.family: "Segoe UI"
                    }
                    MouseArea {
                        id: addHover
                        anchors.fill: parent
                        hoverEnabled: true
                        onClicked: {
                            if (picker.selected.length > 0) {
                                picker.picked(picker.selected.slice());
                                picker.close();
                            }
                        }
                    }
                }
            }
        }
    }
}
