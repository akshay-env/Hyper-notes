import QtQuick
import QtQuick.Controls
import HyperLinkNotes
import "../components"

Rectangle {
    id: root
    height: 32
    color: "transparent"

    property bool isMaximized: false
    property bool sidebarOpen: true
    property string title: ""

    signal toggleSidebar()
    signal toggleMaximize()
    signal minimize()
    signal closeWindow()
    signal startSystemMove()

    // Sidebar Toggle Button
    SidebarToggleButton {
        id: toggleButton
        anchors.left: parent.left
        anchors.top: parent.top
        anchors.bottom: parent.bottom
        anchors.leftMargin: 6
        anchors.topMargin: 4
        anchors.bottomMargin: 4
        sidebarOpen: root.sidebarOpen
        onClicked: root.toggleSidebar()
        z: 2
    }

    // Drag handler to move frameless window
    MouseArea {
        anchors.left: toggleButton.right
        anchors.leftMargin: 6
        anchors.right: windowControls.left
        anchors.top: parent.top
        anchors.bottom: parent.bottom
        z: 1
        onPressed: root.startSystemMove()
        onDoubleClicked: root.toggleMaximize()
    }

    // App / vault title (sits above the drag area; Text is transparent to mouse
    // events so dragging the window still works through it).
    Text {
        anchors.left: toggleButton.right
        anchors.leftMargin: 10
        anchors.verticalCenter: parent.verticalCenter
        text: root.title
        color: Theme.text
        font.pixelSize: 13
        font.family: "Segoe UI"
        font.bold: true
        elide: Text.ElideRight
        z: 2
    }

    // Window controls
    Row {
        id: windowControls
        anchors.right: parent.right
        anchors.top: parent.top
        anchors.bottom: parent.bottom
        width: 138
        spacing: 0
        z: 2

        WindowControlButton {
            iconType: "minimize"
            onClicked: root.minimize()
        }

        WindowControlButton {
            iconType: root.isMaximized ? "restore" : "maximize"
            onClicked: root.toggleMaximize()
        }

        WindowControlButton {
            iconType: "close"
            onClicked: root.closeWindow()
        }
    }
}
