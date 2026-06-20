import QtQuick

Rectangle {
    id: root
    width: 28
    height: 24
    color: toggleArea.containsMouse ? Qt.rgba(1, 1, 1, 0.1) : "transparent"
    radius: 4

    property bool sidebarOpen: true
    signal clicked()

    Item {
        id: toggleIcon
        anchors.centerIn: parent
        width: 16
        height: 16

        Image {
            anchors.fill: parent
            sourceSize: Qt.size(16, 16)
            source: "qrc:/qt/qml/HyperLinkNotes/sidebar_toggle_outline.svg"
        }

        Image {
            anchors.fill: parent
            sourceSize: Qt.size(16, 16)
            source: "qrc:/qt/qml/HyperLinkNotes/sidebar_toggle_filled.svg"
            opacity: root.sidebarOpen ? 1.0 : 0.0
            
            Behavior on opacity { 
                NumberAnimation { duration: 200; easing.type: Easing.InOutQuad } 
            }
        }
    }

    MouseArea {
        id: toggleArea
        anchors.fill: parent
        hoverEnabled: true
        onClicked: root.clicked()
    }
}
