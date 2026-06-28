import QtQuick
import QtQuick.Controls
import HyperLinkNotes

// Search box that drives window.treeSearchQuery (the file tree filters on it).
Rectangle {
    id: root
    height: 32
    radius: 6
    color: Theme.surface2
    border.color: searchField.activeFocus ? Theme.accent : Theme.border
    border.width: 1

    Behavior on border.color { ColorAnimation { duration: Theme.animFast } }

    // Minimal monochrome magnifier (lens + handle), themed grey
    Canvas {
        id: icon
        anchors.left: parent.left
        anchors.leftMargin: 9
        anchors.verticalCenter: parent.verticalCenter
        width: 14
        height: 14
        onPaint: {
            var ctx = getContext("2d");
            ctx.reset();
            ctx.strokeStyle = searchField.activeFocus ? Theme.textDim : Theme.textMuted;
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.arc(5.5, 5.5, 4, 0, Math.PI * 2);   // lens
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(8.6, 8.6);                    // handle
            ctx.lineTo(12.5, 12.5);
            ctx.stroke();
        }
        Connections {
            target: searchField
            function onActiveFocusChanged() { icon.requestPaint(); }
        }
    }

    Text {
        id: clearBtn
        anchors.right: parent.right
        anchors.rightMargin: 8
        anchors.verticalCenter: parent.verticalCenter
        text: "×"
        font.pixelSize: 16
        color: clearMouse.containsMouse ? Theme.text : Theme.textMuted
        visible: window.treeSearchQuery !== ""

        MouseArea {
            id: clearMouse
            anchors.fill: parent
            anchors.margins: -5
            hoverEnabled: true
            onClicked: {
                debounce.stop();
                window.treeSearchQuery = "";
                searchField.text = "";
            }
        }
    }

    // Debounce: only filter once typing pauses, so each keystroke stays smooth.
    Timer {
        id: debounce
        interval: 160
        repeat: false
        onTriggered: window.treeSearchQuery = searchField.text
    }

    TextField {
        id: searchField
        anchors.left: icon.right
        anchors.leftMargin: 6
        anchors.right: clearBtn.visible ? clearBtn.left : parent.right
        anchors.rightMargin: 6
        anchors.verticalCenter: parent.verticalCenter

        placeholderText: "Search notes & folders"
        placeholderTextColor: Theme.textFaint
        color: Theme.text
        font.pixelSize: 12
        font.family: "Segoe UI"
        background: null
        leftPadding: 0
        rightPadding: 0
        topPadding: 0
        bottomPadding: 0
        selectionColor: Theme.accent
        selectedTextColor: "#ffffff"

        onTextEdited: debounce.restart()
        Keys.onEscapePressed: {
            debounce.stop();
            window.treeSearchQuery = "";
            text = "";
        }
    }
}
