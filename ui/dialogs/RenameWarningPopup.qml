import QtQuick
import QtQuick.Controls

Popup {
    id: root
    width: 250
    height: 40
    padding: 8
    
    background: Rectangle {
        color: "#1e1e1e"
        border.color: "#ff4444"
        border.width: 1
        radius: 6
    }
    
    contentItem: Text {
        text: "File already exists. Please choose a different name."
        color: "#ffffff"
        font.pixelSize: 12
        verticalAlignment: Text.AlignVCenter
        horizontalAlignment: Text.AlignHCenter
    }
}
