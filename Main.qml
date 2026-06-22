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
import "scripts/tree/selectionUtils.js" as SelUtil
import "scripts/tree/search.js" as Search

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

    // ── Tabs ────────────────────────────────────────────────────────────────
    // Each tab is { path, name }. An empty tab has path === "" and shows the
    // new-tab view. activeNote always mirrors the active tab's note (or null).
    property var openTabs: []
    property int activeTabIndex: -1
    property var selectedNodes: []
    // Anchor for Shift+click range selection — the last item picked without Shift.
    property var selectionAnchor: null
    property var dragSourceNodes: []
    property bool isDraggingNode: false
    property var nodeToDelete: null

    // Nodes the confirm dialog will remove: the whole selection when the
    // right-clicked node is part of a multi-selection, otherwise just that node.
    readonly property var pendingDeleteNodes: {
        if (!nodeToDelete) return [];
        if (selectedNodes.length > 1 && SelUtil.containsPath(selectedNodes, nodeToDelete.path))
            return selectedNodes;
        return [nodeToDelete];
    }
    property int treeVersion: 0
    property var vaultTree: []
    // Sidebar search query; filters the file tree when non-empty.
    property string treeSearchQuery: ""

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

    // ── Tab operations ──────────────────────────────────────────────────────
    function tabLabel(node) {
        return (node && node.name ? node.name : "Untitled").replace(/\.md$/i, "");
    }

    function tabIndexOfPath(p) {
        for (var i = 0; i < openTabs.length; i++)
            if (openTabs[i].path === p) return i;
        return -1;
    }

    // Opens a note: focuses its tab if already open, fills the current empty tab,
    // or appends a new tab. Does NOT touch navigation history.
    function openNoteInTab(node) {
        if (!node) return;
        var p = node.path || "";
        var i = tabIndexOfPath(p);
        if (i !== -1) {
            activeTabIndex = i;
        } else {
            var tabs = openTabs.slice();
            if (activeTabIndex >= 0 && activeTabIndex < tabs.length
                    && (!tabs[activeTabIndex].path || tabs[activeTabIndex].path === "")) {
                tabs[activeTabIndex] = { "path": p, "name": tabLabel(node) };
                openTabs = tabs;
            } else {
                tabs.push({ "path": p, "name": tabLabel(node) });
                openTabs = tabs;
                activeTabIndex = tabs.length - 1;
            }
        }
        activeNote = node;
    }

    function selectTab(i) {
        if (i < 0 || i >= openTabs.length) return;
        activeTabIndex = i;
        var t = openTabs[i];
        if (!t.path || t.path === "") {
            activeNote = null;            // empty tab → new-tab view
            return;
        }
        var node = Search.search(vaultTree, t.path);
        activeNote = node ? node : { "path": t.path, "name": t.name };
    }

    function newTab() {
        var tabs = openTabs.slice();
        tabs.push({ "path": "", "name": "New tab" });
        openTabs = tabs;
        activeTabIndex = tabs.length - 1;
        activeNote = null;
    }

    function closeTab(i) {
        if (i < 0 || i >= openTabs.length) return;
        var wasActive = (i === activeTabIndex);
        var tabs = openTabs.slice();
        tabs.splice(i, 1);
        openTabs = tabs;
        if (tabs.length === 0) {
            activeTabIndex = -1;
            activeNote = null;
            return;
        }
        var target;
        if (wasActive) target = Math.min(i, tabs.length - 1);
        else           target = (i < activeTabIndex) ? activeTabIndex - 1 : activeTabIndex;
        activeTabIndex = -1;              // force selectTab to re-apply
        selectTab(target);
    }

    function closeTabByPath(p) {
        var i = tabIndexOfPath(p);
        if (i !== -1) closeTab(i);
    }

    // Keeps the active tab's label/path in sync after the open note is renamed.
    function updateActiveTabLabel(p, name) {
        if (activeTabIndex < 0 || activeTabIndex >= openTabs.length) return;
        var tabs = openTabs.slice();
        tabs[activeTabIndex] = { "path": p, "name": (name || "Untitled").replace(/\.md$/i, "") };
        openTabs = tabs;
    }

    function openBin() {
        binWindow.show();
    }

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

            // Tab bar — always present (shows just "+" when no tabs are open)
            TabStrip {
                id: tabStrip
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.top: parent.top
                height: 36
            }

            // Persistent toolbar: back/forward, breadcrumb, graph-view toggle.
            // Always visible, independent of whether a note is open.
            EditorHeader {
                id: editorHeader
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.top: tabStrip.bottom
                anchors.leftMargin: 8
                anchors.rightMargin: 8
            }

            NoteEditor {
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.top: editorHeader.bottom
                anchors.bottom: parent.bottom
                anchors.margins: 16
                visible: window.activeNote !== null && !window.graphViewActive
            }

            // Empty-tab placeholder
            NewTabView {
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.top: editorHeader.bottom
                anchors.bottom: parent.bottom
                visible: !window.graphViewActive
                         && window.activeTabIndex >= 0
                         && window.activeTabIndex < window.openTabs.length
                         && (!window.openTabs[window.activeTabIndex].path
                             || window.openTabs[window.activeTabIndex].path === "")
            }

            // Startup / no-tabs state
            EmptyState {
                anchors.centerIn: parent
                visible: window.activeNote === null && !window.graphViewActive
                         && window.openTabs.length === 0
            }

            // Graph View overlay — covers the content area below the toolbar
            GraphView {
                id: graphView
                anchors.top: editorHeader.bottom
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
                        window.openNoteInTab(node);
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

    // Recycle bin window (opened from the sidebar Bin tile)
    BinWindow {
        id: binWindow
        vaultFs: vaultFs
        visible: false
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
        itemCount: window.pendingDeleteNodes.length

        onAccepted: {
            DeleteNode.deleteNodesPermanently(window, vaultFs, window.pendingDeleteNodes);
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
