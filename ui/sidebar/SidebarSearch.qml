import QtQuick
import QtQuick.Controls

// Search box that drives window.treeSearchQuery (the file tree filters on it).
Rectangle {
    id: root
    height: 32
    radius: 6
    color: "#1b1b1b"
    border.color: searchField.activeFocus ? "#3a3a55" : "#242424"
    border.width: 1

    Text {
        id: icon
        anchors.left: parent.left
        anchors.leftMargin: 8
        anchors.verticalCenter: parent.verticalCenter
        text: "🔍"
        font.pixelSize: 11
        color: "#777777"
    }

    Text {
        id: clearBtn
        anchors.right: parent.right
        anchors.rightMargin: 8
        anchors.verticalCenter: parent.verticalCenter
        text: "×"
        font.pixelSize: 16
        color: clearMouse.containsMouse ? "#cccccc" : "#777777"
        visible: window.treeSearchQuery !== ""

        MouseArea {
            id: clearMouse
            anchors.fill: parent
            anchors.margins: -5
            hoverEnabled: true
            onClicked: {
                window.treeSearchQuery = "";
                searchField.text = "";
            }
        }
    }

    TextField {
        id: searchField
        anchors.left: icon.right
        anchors.leftMargin: 6
        anchors.right: clearBtn.visible ? clearBtn.left : parent.right
        anchors.rightMargin: 6
        anchors.verticalCenter: parent.verticalCenter

        placeholderText: "Search notes & folders"
        placeholderTextColor: "#555555"
        color: "#dddddd"
        font.pixelSize: 12
        font.family: "Segoe UI"
        background: null
        leftPadding: 0
        rightPadding: 0
        topPadding: 0
        bottomPadding: 0
        selectionColor: "#25ffffff"
        selectedTextColor: "#ffffff"

        onTextEdited: window.treeSearchQuery = text
        Keys.onEscapePressed: {
            window.treeSearchQuery = "";
            text = "";
        }
    }
}
