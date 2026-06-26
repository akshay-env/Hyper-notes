import QtQuick
import QtQuick.Controls
import HyperLinkNotes

Rectangle {
    id: root
    anchors.centerIn: parent
    width: 320
    height: 150
    color: "#1e1e1e"
    border.color: "#333333"
    border.width: 1
    radius: 8
    visible: false
    z: 100

    property string titleText: "Confirm"
    property color titleColor: "#ffffff"
    property string messageText: "Are you sure?"
    property string confirmButtonText: "Confirm"
    property color confirmButtonColor: Theme.accent
    property color confirmButtonHoverColor: Theme.accentHover
    property color confirmButtonTextColor: Theme.bg

    signal confirmed()
    signal cancelled()

    Column {
        anchors.fill: parent
        anchors.margins: 20
        spacing: 16

        Text {
            text: root.titleText
            color: root.titleColor
            font.pixelSize: 16
            font.bold: true
        }

        Text {
            text: root.messageText
            color: "#aaaaaa"
            font.pixelSize: 13
            wrapMode: Text.WordWrap
            width: parent.width
        }

        Row {
            anchors.right: parent.right
            spacing: 12

            // Cancel Button
            Rectangle {
                width: 80
                height: 28
                color: cancelHover.containsMouse ? "#444444" : "#333333"
                radius: 4

                Text {
                    anchors.centerIn: parent
                    text: "Cancel"
                    color: "#ffffff"
                }

                MouseArea {
                    id: cancelHover
                    anchors.fill: parent
                    hoverEnabled: true
                    onClicked: {
                        root.visible = false;
                        root.cancelled();
                    }
                }
            }

            // Confirm Button
            Rectangle {
                width: Math.max(80, confirmText.implicitWidth + 24)
                height: 28
                color: confirmHover.containsMouse ? root.confirmButtonHoverColor : root.confirmButtonColor
                radius: 4

                Text {
                    id: confirmText
                    anchors.centerIn: parent
                    text: root.confirmButtonText
                    color: root.confirmButtonTextColor
                    font.bold: true
                }

                MouseArea {
                    id: confirmHover
                    anchors.fill: parent
                    hoverEnabled: true
                    onClicked: {
                        root.visible = false;
                        root.confirmed();
                    }
                }
            }
        }
    }
}
