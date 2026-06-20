import QtQuick
import QtQuick.Controls
import "../components"

Rectangle {
    id: root
    height: 32
    color: "transparent"

    property bool isMaximized: false
    property bool sidebarOpen: true

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
