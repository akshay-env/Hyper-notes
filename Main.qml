import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Window
import QtCore
import QtQuick.Dialogs
import HyperLinkNotes

import "ui/core"
import "ui/dialogs"
import "ui/sidebar"
import "ui/editor"
import "ui/windows"
import "ui/graph"
import "scripts/window/toggleMaximize.js" as ToggleMaximize
import "scripts/window/deleteNodePermanently.js" as DeleteNode
import "scripts/window/openNewFolderDialog.js" as OpenFolderDialog
import "scripts/tree/refreshTree.js" as RefreshTree
import "scripts/file/openFileByPath.js" as OpenFile
import "scripts/drag/handleDropPath.js" as HandleDrop
import "scripts/drag/beginDragProxy.js" as BeginDrag
import "scripts/drag/updateDragProxy.js" as UpdateDrag
import "scripts/drag/endDragProxy.js" as EndDrag
import "scripts/graph/findNodeByPath.js" as FindNode

ApplicationWindow {
    id: window
    width: screenAvailableWidth * 0.75
    height: screenAvailableHeight * 0.75
    x: screenAvailableX + (screenAvailableWidth - width) / 2
    y: screenAvailableY + (screenAvailableHeight - height) / 2
    visible: true
    color: "#121212"
    flags: Qt.Window | Qt.FramelessWindowHint

    // Custom properties
    property bool sidebarOpen: true
    property int sidebarWidth: 180
    property var activeNote: null
    property var historyStack: []
    property int historyIndex: -1
    property bool graphViewActive: false
    property string graphHighlightPath: ""
    property var selectedNodes: []
    property var dragSourceNodes: []
    property bool isDraggingNode: false
    property var nodeToDelete: null
    property int treeVersion: 0
    property var vaultTree: []

    // Maximize simulation properties
    property bool isMaximized: false
    property int normalX: 100
    property int normalY: 100
    property int normalWidth: 800
    property int normalHeight: 600

    property int screenAvailableX: Screen.virtualX !== undefined ? Screen.virtualX : 0
    property int screenAvailableY: Screen.virtualY !== undefined ? Screen.virtualY : 0
    property int screenAvailableWidth: Screen.desktopAvailableWidth !== undefined ? Screen.desktopAvailableWidth : 800
    property int screenAvailableHeight: Screen.desktopAvailableHeight !== undefined ? Screen.desktopAvailableHeight : 600

    // Aliases to avoid refactoring all components that access dragVisualProxy directly
    property alias dragVisualProxy: dragOverlay
    property alias newFolderDialog: newFolderDialog


    Settings {
        id: appSettings
        property string vaultPath: ""
        property string lastBrowsePath: ""
    }

    VaultViewModel {
        id: vaultFs
        vaultPath: appSettings.vaultPath
        onVaultPathChanged: {
            appSettings.vaultPath = vaultPath;
            RefreshTree.refreshTree(window, vaultFs);
        }
    }

    property alias vaultFsRef: vaultFs


    DragOverlay {
        id: dragOverlay
    }

    FolderDialog {
        id: vaultFolderDialog
        title: "Select Vault Directory"
        currentFolder: appSettings.lastBrowsePath !== "" ? appSettings.lastBrowsePath : StandardPaths.standardLocations(StandardPaths.DocumentsLocation)[0]
        onAccepted: {
            appSettings.lastBrowsePath = selectedFolder;
            vaultFs.vaultPath = selectedFolder;
        }
    }

    Rectangle {
        id: bg
        anchors.fill: parent
        color: "#121212"
        border.color: "#2c2c2c"
        border.width: window.isMaximized ? 0 : 1

        TitleBar {
            id: titleBar
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.top: parent.top
            isMaximized: window.isMaximized
            sidebarOpen: window.sidebarOpen

            onToggleSidebar: window.sidebarOpen = !window.sidebarOpen
            onToggleMaximize: ToggleMaximize.toggleMaximize(window)
            onMinimize: window.showMinimized()
            onCloseWindow: window.close()
            onStartSystemMove: window.startSystemMove()
        }

        Sidebar {
            id: sidebar
            anchors.left: parent.left
            anchors.top: titleBar.bottom
            anchors.bottom: parent.bottom
        }

        Rectangle {
            id: mainContent
            anchors.left: sidebar.right
            anchors.right: parent.right
            anchors.top: titleBar.bottom
            anchors.bottom: parent.bottom
            anchors.rightMargin: 1
            anchors.bottomMargin: 1
            color: "#121212"

            NoteEditor {
                anchors.fill: parent
                anchors.margins: 16
                visible: !window.graphViewActive
            }

            EmptyState {
                anchors.centerIn: parent
                visible: window.activeNote === null && !window.graphViewActive
            }

            // Graph View overlay — covers entire mainContent area
            GraphView {
                id: graphView
                anchors.top: parent.top
                anchors.bottom: parent.bottom
                width: parent.width
                
                // State-based slide animation ensures visibility and position are perfectly synced
                state: window.graphViewActive ? "visible" : "hidden"
                states: [
                    State {
                        name: "visible"
                        PropertyChanges { target: graphView; x: 0; visible: true }
                    },
                    State {
                        name: "hidden"
                        PropertyChanges { target: graphView; x: graphView.parent.width; visible: false }
                    }
                ]
                transitions: [
                    Transition {
                        from: "hidden"; to: "visible"
                        SequentialAnimation {
                            PropertyAction { target: graphView; property: "visible"; value: true }
                            NumberAnimation { target: graphView; property: "x"; duration: 250; easing.type: Easing.OutCubic }
                        }
                    },
                    Transition {
                        from: "visible"; to: "hidden"
                        SequentialAnimation {
                            NumberAnimation { target: graphView; property: "x"; duration: 250; easing.type: Easing.OutCubic }
                            PropertyAction { target: graphView; property: "visible"; value: false }
                        }
                    }
                ]

                onCloseRequested: {
                    window.graphViewActive = false;
                }
                onNoteClicked: (path) => {
                    // Single click: open note and close graph
                    window.graphViewActive = false;
                    let node = FindNode.findNodeByPath(window.vaultTree, path);
                    if (node) {
                        window.activeNote = node;
                    }
                }
            }
        }
    }

    // Timer to clear the sidebar highlight after 1 second
    Timer {
        id: sidebarHighlightTimer
        interval: 1000
        repeat: false
        onTriggered: window.graphHighlightPath = ""
    }

    VaultSelectionOverlay {
        visible: vaultFs.vaultPath === ""
        onOpenVaultRequested: vaultFolderDialog.open()
    }

    // Modal background overlay
    Rectangle {
        anchors.fill: parent
        color: "#000000"
        opacity: 0.5
        visible: window.nodeToDelete !== null || newFolderDialog.visible
        z: 99
        
        MouseArea {
            anchors.fill: parent
            onClicked: {
                window.nodeToDelete = null;
                newFolderDialog.close();
            }
        }
    }

    DeleteConfirmDialog {
        id: confirmDialog
        visible: window.nodeToDelete !== null
        nodeName: window.nodeToDelete ? window.nodeToDelete.name : ""

        onAccepted: {
            DeleteNode.deleteNodePermanently(window, vaultFs, window.nodeToDelete);
            window.nodeToDelete = null;
        }
        
        onRejected: window.nodeToDelete = null
    }

    NewFolderDialog {
        id: newFolderDialog
        visible: false
        z: 100
        onAccepted: {
            if (input.text.trim() !== "") {
                let targetPath = vaultFs.vaultPath;
                if (window.selectedNodes.length > 0 && window.selectedNodes[0].isFolder) {
                    targetPath = window.selectedNodes[0].path;
                }
                
                if (vaultFs.createFolder(targetPath, input.text.trim())) {
                    vaultFs.setExpanded(targetPath, true);
                    RefreshTree.refreshTree(window, vaultFs);
                }
            }
            close();
        }
    }
}
