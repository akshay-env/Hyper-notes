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
    property int itemCount: 1

    background: Rectangle {
        color: "#1e1e1e"
        border.color: "#333333"
        border.width: 1
        radius: 8
    }

    contentItem: Text {
        text: root.itemCount > 1
              ? ("Are you sure you want to delete " + root.itemCount + " items?")
              : ("Are you sure you want to delete '" + nodeName + "'?")
        color: "#ffffff"
        wrapMode: Text.WordWrap
    }

    standardButtons: Dialog.Yes | Dialog.No
}
