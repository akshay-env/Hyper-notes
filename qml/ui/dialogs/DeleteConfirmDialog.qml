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

    property string nodeName: ""
    property int itemCount: 1

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
            text: "Delete"
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
        implicitHeight: 56

        Text {
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            anchors.leftMargin: 16
            anchors.rightMargin: 16
            text: root.itemCount > 1
                  ? ("Move " + root.itemCount + " items to the bin?")
                  : ("Move '" + nodeName + "' to the bin?")
            color: Theme.textDim
            font.pixelSize: 13
            font.family: "Segoe UI"
            wrapMode: Text.WordWrap
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
                color: delHover.containsMouse ? Theme.dangerHover : Theme.danger
                Behavior on color { ColorAnimation { duration: Theme.animFast } }

                Text {
                    anchors.centerIn: parent
                    text: "Delete"
                    color: "#ffffff"
                    font.pixelSize: 13
                    font.bold: true
                    font.family: "Segoe UI"
                }

                MouseArea {
                    id: delHover
                    anchors.fill: parent
                    hoverEnabled: true
                    onClicked: root.accept()
                }
            }
        }
    }
}
