import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import "../../scripts/tree/refreshTree.js" as RefreshTree
import "../../scripts/file/openFileByPath.js" as OpenFile
import "../../scripts/window/openNewFolderDialog.js" as OpenFolderDialog
import "../../scripts/file/createNewNote.js" as CreateNote

Rectangle {
    id: root
    width: window.sidebarOpen ? window.sidebarWidth : 0
    color: "#141414"
    clip: true

    // Smooth sliding transition
    Behavior on width {
        NumberAnimation { duration: 300; easing.type: Easing.OutCubic }
    }

    // Right border line for the sidebar
    Rectangle {
        anchors.right: parent.right
        anchors.top: parent.top
        anchors.bottom: parent.bottom
        width: 1
        color: "#1e1e1e"
    }

    // Resizer handle on the right edge
    MouseArea {
        anchors.right: parent.right
        anchors.top: parent.top
        anchors.bottom: parent.bottom
        width: 6
        cursorShape: Qt.SplitHCursor
        z: 100

        property int startMouseX: 0
        property int startWidth: 0

        onPressed: (mouse) => {
            let globalPos = mapToItem(null, mouse.x, mouse.y);
            startMouseX = globalPos.x;
            startWidth = window.sidebarWidth;
        }

        onPositionChanged: (mouse) => {
            if (pressed) {
                let globalPos = mapToItem(null, mouse.x, mouse.y);
                let newWidth = startWidth + (globalPos.x - startMouseX);
                if (newWidth < 180) newWidth = 180;
                if (newWidth > 600) newWidth = 600;
                window.sidebarWidth = newWidth;
            }
        }
    }

    // Background MouseArea to clear selection
    MouseArea {
        anchors.fill: parent
        z: -1
        onClicked: {
            window.selectedNodes = []
        }
    }

    // Sidebar Layout
    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 12
        spacing: 12

        SidebarHeader {
            vaultFs: window.vaultFsRef
            onNewNoteRequested: {
                console.log("Sidebar caught newNoteRequested signal!");
                CreateNote.createNewNote(window, vaultFs);
            }
            onNewFolderRequested: OpenFolderDialog.openNewFolderDialog(window.newFolderDialog)
        }

        FileTree {
            Layout.fillWidth: true
            Layout.fillHeight: true
            vaultFs: window.vaultFsRef
        }
    }
}
