import QtQuick
import QtQuick.Controls
import HyperLinkNotes

Rectangle {
    id: root

    property color defaultColor: "transparent"
    property color hoverColor: Qt.rgba(1, 1, 1, 0.05)
    property color pressedColor: Qt.rgba(1, 1, 1, 0.1)
    property alias containsMouse: mouseArea.containsMouse

    property string iconText: ""
    property string tooltipText: ""
    property int iconSize: 14
    property bool iconBold: false

    color: mouseArea.pressed ? pressedColor : (mouseArea.containsMouse ? hoverColor : defaultColor)
    radius: 6
    implicitWidth: 28
    implicitHeight: 28

    Behavior on color { ColorAnimation { duration: Theme.animFast } }
    
    ToolTip.visible: tooltipText !== "" && mouseArea.containsMouse
    ToolTip.text: tooltipText
    ToolTip.delay: 500
    
    signal clicked()
    
    // Allows nesting visual items directly inside IconButton
    default property alias content: contentItem.data
    
    Item {
        id: contentItem
        anchors.fill: parent
        
        Text {
            anchors.centerIn: parent
            text: root.iconText
            color: Theme.textDim
            font.pixelSize: root.iconSize
            font.bold: root.iconBold
            visible: root.iconText !== ""
        }
    }
    
    MouseArea {
        id: mouseArea
        anchors.fill: parent
        hoverEnabled: true
        onClicked: root.clicked()
    }
}
