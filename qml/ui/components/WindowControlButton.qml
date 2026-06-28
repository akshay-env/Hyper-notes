import QtQuick
import QtQuick.Controls
import HyperLinkNotes

Rectangle {
    id: root
    width: 46
    height: 32
    color: controlArea.containsMouse ? (iconType === "close" ? Theme.danger : Qt.rgba(1, 1, 1, 0.08)) : "transparent"

    Behavior on color { ColorAnimation { duration: Theme.animFast } }

    property string iconType: "minimize" // "minimize", "maximize", "restore", "close"
    signal clicked()

    // Minimize Line
    Rectangle {
        anchors.centerIn: parent
        width: 10
        height: 1
        color: controlArea.containsMouse ? Theme.text : Theme.textDim
        visible: root.iconType === "minimize"
    }

    // Maximize Square
    Rectangle {
        anchors.centerIn: parent
        width: 10
        height: 10
        color: "transparent"
        border.color: controlArea.containsMouse ? Theme.text : Theme.textDim
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
            border.color: controlArea.containsMouse ? Theme.text : Theme.textDim
            border.width: 1
        }
        Rectangle {
            x: 0; y: 2; width: 8; height: 8
            color: root.color === "transparent" ? Theme.bg : root.color
            border.color: controlArea.containsMouse ? Theme.text : Theme.textDim
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
            color: controlArea.containsMouse ? Theme.text : Theme.textDim
        }
        Rectangle {
            anchors.centerIn: parent
            width: 12
            height: 1
            rotation: -45
            color: controlArea.containsMouse ? Theme.text : Theme.textDim
        }
    }

    MouseArea {
        id: controlArea
        anchors.fill: parent
        hoverEnabled: true
        onClicked: root.clicked()
    }
}
