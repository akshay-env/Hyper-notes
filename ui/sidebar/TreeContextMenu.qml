import QtQuick
import QtQuick.Controls

Menu {
    id: contextMenu
    
    property string nodePath: ""
    property string nodeName: ""
    property var vaultFs: null
    signal deleteRequested(string path, string name)

    MenuItem {
        text: "Delete"
        onTriggered: {
            contextMenu.deleteRequested(nodePath, nodeName);
        }
    }
}
