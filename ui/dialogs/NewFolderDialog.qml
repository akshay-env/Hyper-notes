import QtQuick
import QtQuick.Controls

Dialog {
    id: root
    x: Math.round((parent.width - width) / 2)
    y: Math.round((parent.height - height) / 2)
    width: 300
    modal: true
    title: "Create New Folder"
    
    // Allow external focus management
    property alias input: folderInput

    background: Rectangle {
        color: "#1e1e1e"
        border.color: "#333333"
        border.width: 1
        radius: 8
    }

    contentItem: Column {
        spacing: 16
        
        TextField {
            id: folderInput
            width: parent.width
            placeholderText: "Folder Name"
            color: "#ffffff"
            placeholderTextColor: "#888888"
            background: Rectangle {
                color: "#2d2d2d"
                radius: 4
                border.color: folderInput.activeFocus ? "#007acc" : "transparent"
            }
            onAccepted: root.accept()
        }
    }

    standardButtons: Dialog.Ok | Dialog.Cancel

    onOpened: {
        folderInput.forceActiveFocus();
    }
}
