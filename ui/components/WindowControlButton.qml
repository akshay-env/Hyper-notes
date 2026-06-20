import QtQuick
import QtQuick.Controls

Rectangle {
    id: root
    width: 46
    height: 32
    color: controlArea.containsMouse ? (iconType === "close" ? "#e81123" : Qt.rgba(1, 1, 1, 0.08)) : "transparent"

    property string iconType: "minimize" // "minimize", "maximize", "restore", "close"
    signal clicked()

    // Minimize Line
    Rectangle {
        anchors.centerIn: parent
        width: 10
        height: 1
        color: controlArea.containsMouse ? "#ffffff" : "#999999"
        visible: root.iconType === "minimize"
    }

    // Maximize Square
    Rectangle {
        anchors.centerIn: parent
        width: 10
        height: 10
        color: "transparent"
        border.color: controlArea.containsMouse ? "#ffffff" : "#999999"
        border.width: 1
        visible: root.iconType === "maximize"
    }

    // Restore Windows
    Item {
        anchors.centerIn: parent
        width: 10
        height: 10
        visible: root.iconType === "restore"
        
        Rectangle {
            x: 2; y: 0; width: 8; height: 8
            color: "transparent"
            border.color: controlArea.containsMouse ? "#ffffff" : "#999999"
            border.width: 1
        }
        Rectangle {
            x: 0; y: 2; width: 8; height: 8
            color: root.color === "transparent" ? "#121212" : root.color
            border.color: controlArea.containsMouse ? "#ffffff" : "#999999"
            border.width: 1
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
            color: controlArea.containsMouse ? "#ffffff" : "#999999"
        }
        Rectangle {
            anchors.centerIn: parent
            width: 12
            height: 1
            rotation: -45
            color: controlArea.containsMouse ? "#ffffff" : "#999999"
        }
    }

    MouseArea {
        id: controlArea
        anchors.fill: parent
        hoverEnabled: true
        onClicked: root.clicked()
    }
}
