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
import "ui/graph"
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
    color: Theme.bg
    flags: Qt.Window | Qt.FramelessWindowHint

    // Custom properties
    property bool sidebarOpen: true
    property int sidebarWidth: 240
    // Right dock (Graph + Outline) — collapsible via the editor toolbar toggle.
    property bool rightPanelOpen: true
    property int rightPanelWidth: 280
    // True only while the sidebar open/close slide is animating. The editor reads
    // this to freeze text re-wrap during the slide (so the animation stays smooth)
    // while still reflowing instantly on a manual resize drag. Cleared just after
    // the 300ms animation finishes.
    property bool sidebarAnimating: false
    onSidebarOpenChanged: { sidebarAnimating = true; sidebarAnimTimer.restart(); }
    // Same idea for the right dock (Graph + Outline): the editor's right edge is
    // anchored to the panel, so its width changes every frame of the 300ms slide.
    // Freezing the editor's text re-wrap for that window keeps the collapse/expand
    // smooth (it reflows once when the slide settles). Cleared just after it ends.
    property bool rightPanelAnimating: false
    onRightPanelOpenChanged: { rightPanelAnimating = true; rightPanelAnimTimer.restart(); }
    property var activeNote: null
    property var historyStack: []
    property int historyIndex: -1
    property bool graphViewActive: false
    property string graphHighlightPath: ""
    property bool binOpen: false
    property bool settingsOpen: false
    property bool noteSearchOpen: false
    onNoteSearchOpenChanged: {
        if (noteSearchOpen) {
            noteSearchFocusTimer.restart();
        } else {
            noteSearchBar.reset();
            if (noteEditor) noteEditor.searchClear();
        }
    }

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
    // Plain-JS mirror of vaultTree, rebuilt only when the tree changes. Filtering
    // the live QVariantList per keystroke is slow (every property read re-wraps
    // a QVariant); converting once and searching pure JS keeps search snappy.
    property var vaultTreeJS: toJsTree(vaultTree)

    // Maximize simulation properties
    property bool isMaximized: false
    property int normalX: 100
    property int normalY: 100
    property int normalWidth: 800
    property int normalHeight: 600
    // A frameless window gets no OS maximize/restore animation. The previous code
    // tweened the native window's x/y/width/height frame-by-frame to fake one, but
    // animating real geometry forces a native resize + a full relayout EVERY frame
    // — that per-frame native resize was the stutter ("laggy / not functioning").
    // Instead the geometry SNAPS straight to the target rect (the way native apps
    // maximize), and the UI plays a brief GPU-only scale "settle" (maximizePop) so
    // the toggle still feels animated with no mid-animation resizing. normalX/Y/W/H
    // remember the pre-maximize geometry to restore back to.
    function toggleMaximizeAnimated() {
        if (window.isMaximized) {
            window.x = window.normalX;         window.y = window.normalY;
            window.width = window.normalWidth; window.height = window.normalHeight;
            window.isMaximized = false;
        } else {
            window.normalX = window.x;         window.normalY = window.y;
            window.normalWidth = window.width; window.normalHeight = window.height;
            window.x = window.screenAvailableX;         window.y = window.screenAvailableY;
            window.width = window.screenAvailableWidth; window.height = window.screenAvailableHeight;
            window.isMaximized = true;
        }
        maximizePop.restart();
    }

    // The "settle": a quick scale-in of the whole UI right after the geometry snap.
    // It's a render transform on `bg` (origin = centre), so it never changes the
    // native window size or re-wraps the editor — just smooth, jank-free motion.
    // `bg` and the window share Theme.bg, so the ~3% inset the scale leaves is
    // invisible.
    NumberAnimation {
        id: maximizePop
        target: bg
        property: "scale"
        from: 0.97
        to: 1.0
        duration: 180
        easing.type: Easing.OutCubic
    }

    // Minimize: a frameless window gets no OS genie animation. The old version slid
    // the native window DOWN 40px (a per-frame native move) while fading — that
    // lurch is what looked ugly/out of place. Instead we play a quick GPU-only
    // shrink-and-fade toward the taskbar: `bg` scales down from its BOTTOM edge
    // while the window fades out — then park it in the taskbar and reset
    // scale/opacity/origin while hidden so it returns clean. Only bg.scale +
    // window.opacity animate (no native move/resize), so it's smooth and matches
    // the maximize "settle".
    SequentialAnimation {
        id: minimizeAnim
        ScriptAction { script: bg.transformOrigin = Item.Bottom }   // collapse toward the taskbar
        ParallelAnimation {
            NumberAnimation { target: bg;     property: "scale";   from: 1.0; to: 0.90; duration: 180; easing.type: Easing.InCubic }
            NumberAnimation { target: window; property: "opacity"; from: 1.0; to: 0.0;  duration: 180; easing.type: Easing.InCubic }
        }
        ScriptAction {
            script: {
                window.showMinimized();
                bg.scale = 1.0;
                bg.transformOrigin = Item.Center;   // reset origin for the maximize settle
                window.opacity = 1;
            }
        }
    }

    function animateMinimize() {
        minimizeAnim.restart();
    }

    property int screenAvailableX: Screen.virtualX !== undefined ? Screen.virtualX : 0
    property int screenAvailableY: Screen.virtualY !== undefined ? Screen.virtualY : 0
    property int screenAvailableWidth: Screen.desktopAvailableWidth !== undefined ? Screen.desktopAvailableWidth : 800
    property int screenAvailableHeight: Screen.desktopAvailableHeight !== undefined ? Screen.desktopAvailableHeight : 600

    // Aliases to avoid refactoring all components that access dragVisualProxy directly
    property alias dragVisualProxy: dragOverlay
    property alias newFolderDialog: newFolderDialog

    // Deep-copies the QVariant tree into plain JS objects once (see vaultTreeJS).
    function toJsTree(nodes) {
        var out = [];
        if (!nodes) return out;
        for (var i = 0; i < nodes.length; i++) {
            var n = nodes[i];
            out.push({
                "name": n.name,
                "path": n.path,
                "isFolder": n.isFolder === true,
                "expanded": n.expanded === true,
                "children": (n.isFolder === true) ? toJsTree(n.children) : []
            });
        }
        return out;
    }

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

    // Always opens the note in a NEW tab (focusing it if it's already open).
    // Used by the multi-link hover card's "Open all in tabs".
    function openNoteInNewTab(node) {
        if (!node) return;
        var p = node.path || "";
        var i = tabIndexOfPath(p);
        if (i !== -1) { activeTabIndex = i; activeNote = node; return; }
        var tabs = openTabs.slice();
        tabs.push({ "path": p, "name": tabLabel(node) });
        openTabs = tabs;
        activeTabIndex = tabs.length - 1;
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
        var node = Search.search(vaultTreeJS, t.path);   // cached JS tree (no re-wrap)
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

    // Reorders a tab (drag-and-drop), keeping the same tab active.
    function moveTab(from, to) {
        if (from === to) return;
        if (from < 0 || from >= openTabs.length || to < 0 || to >= openTabs.length) return;
        var activeTab = (activeTabIndex >= 0 && activeTabIndex < openTabs.length)
                        ? openTabs[activeTabIndex] : null;
        var tabs = openTabs.slice();
        var moved = tabs.splice(from, 1)[0];
        tabs.splice(to, 0, moved);
        openTabs = tabs;
        if (activeTab) {
            var ni = tabs.indexOf(activeTab);   // tab objects are plain JS — identity is stable
            if (ni !== -1) activeTabIndex = ni;
        }
    }

    // Keeps the active tab's label/path in sync after the open note is renamed.
    function updateActiveTabLabel(p, name) {
        if (activeTabIndex < 0 || activeTabIndex >= openTabs.length) return;
        var tabs = openTabs.slice();
        tabs[activeTabIndex] = { "path": p, "name": (name || "Untitled").replace(/\.md$/i, "") };
        openTabs = tabs;
    }

    function openBin() {
        binOpen = true;
    }

    function openSettings() {
        settingsOpen = true;
    }

    function openVaultPicker() {
        vaultFolderDialog.open();
    }

    // Start with a single empty tab so the new-tab view is the default startup view.
    Component.onCompleted: newTab()

    Settings {
        id: appSettings
        property string vaultPath: ""
        property string lastBrowsePath: ""
        property string llmProvider: "anthropic"   // "anthropic" | "gemini" | "openai" | "custom"
        property string llmBaseUrl: ""             // for "custom" (OpenAI-compatible)
        property string theme: "highContrast"      // app colour theme
        // Each provider keeps its OWN key + model so switching never mixes them.
        property string llmKeyAnthropic: ""
        property string llmKeyGemini: ""
        property string llmKeyOpenai: ""
        property string llmKeyCustom: ""
        property string llmModelAnthropic: ""
        property string llmModelGemini: ""
        property string llmModelOpenai: ""
        property string llmModelCustom: ""
    }

    // The active provider's key/model (read by the client + settings panel).
    readonly property string activeLlmKey:
        appSettings.llmProvider === "anthropic" ? appSettings.llmKeyAnthropic
      : appSettings.llmProvider === "gemini"    ? appSettings.llmKeyGemini
      : appSettings.llmProvider === "openai"    ? appSettings.llmKeyOpenai
      : appSettings.llmKeyCustom
    readonly property string activeLlmModel:
        appSettings.llmProvider === "anthropic" ? appSettings.llmModelAnthropic
      : appSettings.llmProvider === "gemini"    ? appSettings.llmModelGemini
      : appSettings.llmProvider === "openai"    ? appSettings.llmModelOpenai
      : appSettings.llmModelCustom

    function setLlmKeyFor(p, k) {
        if (p === "anthropic")   appSettings.llmKeyAnthropic = k;
        else if (p === "gemini") appSettings.llmKeyGemini = k;
        else if (p === "openai") appSettings.llmKeyOpenai = k;
        else                     appSettings.llmKeyCustom = k;
    }
    function setLlmModelFor(p, m) {
        if (p === "anthropic")   appSettings.llmModelAnthropic = m;
        else if (p === "gemini") appSettings.llmModelGemini = m;
        else if (p === "openai") appSettings.llmModelOpenai = m;
        else                     appSettings.llmModelCustom = m;
    }

    // Drive the global theme from settings.
    Binding { target: Theme; property: "mode"; value: appSettings.theme }

    // Shared LLM client, configured from settings.
    LlmService {
        id: llm
        apiKey: window.activeLlmKey
        provider: appSettings.llmProvider
        baseUrl: appSettings.llmBaseUrl
        model: window.activeLlmModel
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
        color: Theme.bg
        // Scale origin for the maximize/restore "settle" (maximizePop).
        transformOrigin: Item.Center
        border.color: Theme.border
        border.width: window.isMaximized ? 0 : 1

        TitleBar {
            id: titleBar
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.top: parent.top
            isMaximized: window.isMaximized
            sidebarOpen: window.sidebarOpen
            title: vaultFs.vaultPath ? vaultFs.vaultPath.split(/[\\/]/).pop() : "HyperLinkNotes"

            onToggleSidebar: window.sidebarOpen = !window.sidebarOpen
            onToggleMaximize: window.toggleMaximizeAnimated()
            onMinimize: window.animateMinimize()
            onCloseWindow: window.close()
            onStartSystemMove: window.startSystemMove()
        }

        // Full-width divider under the title bar — separates it from the tabs row
        // and the sidebar header (which now align on the same level).
        Rectangle {
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.top: titleBar.bottom
            height: 1
            color: Theme.border
            z: 10
        }

        Sidebar {
            id: sidebar
            anchors.left: parent.left
            anchors.top: titleBar.bottom
            anchors.bottom: statusBar.top
        }

        // Right dock: live mini-graph + clickable outline (collapsible).
        RightPanel {
            id: rightPanel
            anchors.right: parent.right
            anchors.top: titleBar.bottom
            anchors.bottom: statusBar.top
            editorRef: noteEditor
        }

        Rectangle {
            id: mainContent
            anchors.left: sidebar.right
            anchors.right: rightPanel.left
            anchors.top: titleBar.bottom
            anchors.bottom: statusBar.top
            color: Theme.bg

            // Tab bar — always present (shows just "+" when no tabs are open)
            TabStrip {
                id: tabStrip
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.top: parent.top
                height: 36
            }

            // Full-width divider under the toolbar (matches the tab-strip divider).
            Rectangle {
                id: toolbarDivider
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.top: editorHeader.bottom
                height: 1
                color: Theme.border
                z: 3
            }

            // Persistent toolbar: breadcrumb, back/forward, find, side-panel toggle.
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
                id: noteEditor
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.top: editorHeader.bottom
                anchors.bottom: parent.bottom
                anchors.margins: 16
                // Pull the bottom in so the Ask-AI bar lines up with the sidebar's
                // Bin/Settings row, which sits 12px above the status bar.
                anchors.bottomMargin: 12
                visible: window.activeNote !== null && !window.graphViewActive
                llmService: llm
            }

            // Click anywhere in the editor (outside the find bar) to close search.
            // No onWheel, so scrolling still passes through to the editor.
            MouseArea {
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.top: searchSlot.bottom
                anchors.bottom: parent.bottom
                visible: window.noteSearchOpen && window.activeNote !== null && !window.graphViewActive
                z: 4
                onClicked: window.noteSearchOpen = false
            }

            // In-note find bar — slides down from the toolbar line (the purple line)
            // and back up. The bar fills the slot and is revealed top-first as the
            // slot's height animates open.
            Item {
                id: searchSlot
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.top: editorHeader.bottom
                clip: true
                z: 5
                height: (window.noteSearchOpen && window.activeNote !== null && !window.graphViewActive)
                        ? noteSearchBar.height : 0
                Behavior on height { NumberAnimation { duration: Theme.animMed; easing.type: Easing.OutCubic } }

                NoteSearchBar {
                    id: noteSearchBar
                    anchors.left: parent.left
                    anchors.right: parent.right
                    anchors.top: parent.top
                    editor: noteEditor
                    onCloseRequested: window.noteSearchOpen = false
                }
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
                
                transformOrigin: Item.Center

                // Soft fade + subtle zoom (no horizontal slide) so the graph
                // materializes in place, matching the app's gentle motion.
                state: window.graphViewActive ? "visible" : "hidden"
                states: [
                    State {
                        name: "visible"
                        PropertyChanges { target: graphView; opacity: 1; scale: 1; visible: true }
                    },
                    State {
                        name: "hidden"
                        PropertyChanges { target: graphView; opacity: 0; scale: 0.97; visible: false }
                    }
                ]
                transitions: [
                    Transition {
                        from: "hidden"; to: "visible"
                        SequentialAnimation {
                            PropertyAction { target: graphView; property: "visible"; value: true }
                            ParallelAnimation {
                                NumberAnimation { target: graphView; property: "opacity"; duration: Theme.animMed; easing.type: Easing.OutCubic }
                                NumberAnimation { target: graphView; property: "scale"; duration: Theme.animMed; easing.type: Easing.OutCubic }
                            }
                        }
                    },
                    Transition {
                        from: "visible"; to: "hidden"
                        SequentialAnimation {
                            ParallelAnimation {
                                NumberAnimation { target: graphView; property: "opacity"; duration: Theme.animFast; easing.type: Easing.InCubic }
                                NumberAnimation { target: graphView; property: "scale"; duration: Theme.animFast; easing.type: Easing.InCubic }
                            }
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

        // Bottom status bar: save state, word count, and the open note's path.
        StatusBar {
            id: statusBar
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.bottom: parent.bottom
            editorRef: noteEditor
        }

        // Window outline — drawn ON TOP of every panel, since bg's own border is
        // covered by the sidebar / right-panel / status-bar edges. Transparent fill
        // (no MouseArea), so it never intercepts clicks.
        Rectangle {
            anchors.fill: parent
            color: "transparent"
            border.color: Theme.border
            border.width: window.isMaximized ? 0 : 1
            z: 1000
        }
    }

    // Timer to clear the sidebar highlight after 1 second
    Timer {
        id: sidebarHighlightTimer
        interval: 1000
        repeat: false
        onTriggered: window.graphHighlightPath = ""
    }

    // Clears sidebarAnimating just after the 300ms open/close slide settles.
    Timer { id: sidebarAnimTimer; interval: 320; onTriggered: window.sidebarAnimating = false }

    // Clears rightPanelAnimating just after the 300ms dock open/close slide settles.
    Timer { id: rightPanelAnimTimer; interval: 320; onTriggered: window.rightPanelAnimating = false }

    // Focus the find field once the slide-down bar is in place.
    Timer { id: noteSearchFocusTimer; interval: 60; onTriggered: noteSearchBar.focusField() }

    VaultSelectionOverlay {
        visible: vaultFs.vaultPath === ""
        onOpenVaultRequested: vaultFolderDialog.open()
    }

    // In-app recycle bin (opened from the sidebar Bin tile)
    BinPanel {
        id: binPanel
        vaultFs: vaultFs
    }

    // In-app settings (opened from the sidebar gear)
    SettingsPanel {
        id: settingsPanel
        llmService: llm
        apiKey: window.activeLlmKey
        onApiKeyEdited: (key) => window.setLlmKeyFor(appSettings.llmProvider, key)
        provider: appSettings.llmProvider
        onProviderEdited: (p) => appSettings.llmProvider = p
        baseUrl: appSettings.llmBaseUrl
        onBaseUrlEdited: (u) => appSettings.llmBaseUrl = u
        model: window.activeLlmModel
        onModelEdited: (m) => window.setLlmModelFor(appSettings.llmProvider, m)
        theme: appSettings.theme
        onThemeEdited: (t) => appSettings.theme = t
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
