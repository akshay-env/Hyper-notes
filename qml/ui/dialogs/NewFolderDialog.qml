import QtQuick
import QtQuick.Controls
import HyperLinkNotes

Dialog {
    id: root
    x: Math.round((parent.width - width) / 2)
    y: Math.round((parent.height - height) / 2)
    width: 320
    modal: true
    padding: 0

    // Allow external focus management
    property alias input: folderInput

    background: Rectangle {
        color: Theme.surface
        border.color: Theme.border
        border.width: 1
        radius: 10
    }

    header: Rectangle {
        color: "transparent"
        implicitHeight: 48

        Text {
            anchors.left: parent.left
            anchors.leftMargin: 16
            anchors.verticalCenter: parent.verticalCenter
            text: "Create New Folder"
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

    contentItem: Item {
        implicitHeight: 58

        TextField {
            id: folderInput
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            anchors.leftMargin: 16
            anchors.rightMargin: 16
            placeholderText: "Folder Name"
            placeholderTextColor: Theme.textFaint
            color: Theme.text
            font.pixelSize: 13
            font.family: "Segoe UI"
            selectionColor: Theme.accent
            selectedTextColor: "#ffffff"
            background: Rectangle {
                color: Theme.surface2
                radius: 6
                border.color: folderInput.activeFocus ? Theme.accent : Theme.border
                border.width: 1
                Behavior on border.color { ColorAnimation { duration: Theme.animFast } }
            }
            onAccepted: root.accept()
        }
    }

    footer: Rectangle {
        color: "transparent"
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
                    onClicked: root.reject()
                }
            }

            Rectangle {
                width: 86
                height: 32
                radius: 6
                color: okHover.containsMouse ? Theme.accentHover : Theme.accent
                Behavior on color { ColorAnimation { duration: Theme.animFast } }

                Text {
                    anchors.centerIn: parent
                    text: "Create"
                    color: "#ffffff"
                    font.pixelSize: 13
                    font.bold: true
                    font.family: "Segoe UI"
                }

                MouseArea {
                    id: okHover
                    anchors.fill: parent
                    hoverEnabled: true
                    onClicked: root.accept()
                }
            }
        }
    }

    onOpened: {
        folderInput.forceActiveFocus();
    }
}
