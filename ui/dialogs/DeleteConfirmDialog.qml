import QtQuick
import QtQuick.Controls

Dialog {
    id: root
    x: Math.round((parent.width - width) / 2)
    y: Math.round((parent.height - height) / 2)
    width: 300
    modal: true
    title: "Delete Node"
    
    property string nodeName: ""

    background: Rectangle {
        color: "#1e1e1e"
        border.color: "#333333"
        border.width: 1
        radius: 8
    }

    contentItem: Text {
        text: "Are you sure you want to delete '" + nodeName + "'?"
        color: "#ffffff"
        wrapMode: Text.WordWrap
    }

    standardButtons: Dialog.Yes | Dialog.No
}
