import QtQuick
import QtQuick.Controls
import HyperLinkNotes
import "../../scripts/drag/handleDropPath.js" as HandleDrop
import "../../scripts/drag/beginDragProxy.js" as BeginDrag
import "../../scripts/drag/updateDragProxy.js" as UpdateDrag
import "../../scripts/drag/endDragProxy.js" as EndDrag
import "../../scripts/navigation/pushHistory.js" as PushHistory
import "../../scripts/tree/searchFlat.js" as SearchFlat
import "../../scripts/tree/selectionUtils.js" as SelUtil
import "../../scripts/file/openFileByPath.js" as OpenFile
import "../../scripts/tree/search.js" as Search

// Virtualized file tree. Instead of instantiating every node (which froze on a
// 1000-note folder), the visible tree is flattened to a list and rendered by a
// ListView, so only the rows on screen exist. Expansion state lives here (in
// `expandedPaths`) so toggling is instant without re-reading the C++ tree.
Item {
    id: fileTreeRoot

    property var vaultFs: null
    property bool searching: (window.treeSearchQuery || "").trim() !== ""

    property var searchResults: searching
        ? SearchFlat.searchFlat(window.vaultTreeJS, window.treeSearchQuery.trim().toLowerCase())
        : []

    // ── Expansion + flattening ───────────────────────────────────────────────
    property var expandedPaths: ({})     // path → true for expanded folders
    property int flatVersion: 0          // bump to re-flatten

    // Re-seed expansion from the tree's persisted `expanded` whenever the tree is
    // rebuilt (create/rename/move/delete). vaultTreeJS is a fresh object each time.
    Component.onCompleted: seedExpanded()
    Connections {
        target: window
        function onVaultTreeJSChanged() { fileTreeRoot.seedExpanded(); }
    }

    function seedExpanded() {
        var e = ({});
        var walk = function (nodes) {
            if (!nodes) return;
            for (var i = 0; i < nodes.length; i++) {
                var n = nodes[i];
                if (n.isFolder && n.expanded === true) e[n.path] = true;
                if (n.children) walk(n.children);
            }
        };
        walk(window.vaultTreeJS);
        expandedPaths = e;
        flatVersion++;
    }

    function buildFlat() {
        var out = [];
        var walk = function (nodes, depth) {
            if (!nodes) return;
            for (var i = 0; i < nodes.length; i++) {
                var n = nodes[i];
                var open = n.isFolder && fileTreeRoot.expandedPaths[n.path] === true;
                out.push({ path: n.path, name: n.name, isFolder: n.isFolder,
                           depth: depth, expanded: open,
                           hasChildren: n.isFolder && n.children && n.children.length > 0 });
                if (open && n.children) walk(n.children, depth + 1);
            }
        };
        walk(window.vaultTreeJS, 0);
        return out;
    }

    // The flat list of currently-visible rows.
    property var flatRows: { var v = flatVersion; var t = window.vaultTreeJS; return buildFlat(); }

    function toggleExpand(path) {
        var e = expandedPaths;
        if (e[path]) delete e[path]; else e[path] = true;
        if (vaultFs) vaultFs.setExpanded(path, e[path] === true);
        flatVersion++;   // re-flatten
    }

    function nodeOf(m) { return { path: m.path, name: m.name, isFolder: m.isFolder }; }

    function openRow(m) {
        if (m.isFolder) {
            window.selectedNodes = [nodeOf(m)];
            window.selectionAnchor = nodeOf(m);
            toggleExpand(m.path);
        } else {
            window.selectedNodes = [nodeOf(m)];
            window.selectionAnchor = nodeOf(m);
            window.graphViewActive = false;
            // Search the CACHED JS tree, not window.vaultTree — the latter re-wraps
            // the entire QVariant tree to fresh JS on every read, which made opening
            // a note crawl on a big vault.
            var node = Search.search(window.vaultTreeJS, m.path) || nodeOf(m);
            PushHistory.push(window, node);
            window.openNoteInTab(node);
        }
    }

    function openResult(node) {
        if (!node) return;
        if (node.isFolder) {
            var real = Search.search(window.vaultTreeJS, node.path);
            if (real) window.selectedNodes = [real];
        } else {
            window.graphViewActive = false;
            OpenFile.openFileByPath(window, node.path);
        }
    }

    // ── Normal tree (virtualized) ────────────────────────────────────────────
    ListView {
        id: treeList
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: parent.top
        height: Math.min(contentHeight, fileTreeRoot.height)
        visible: !fileTreeRoot.searching
        clip: true
        model: fileTreeRoot.flatRows
        cacheBuffer: 600
        boundsBehavior: Flickable.StopAtBounds

        delegate: Rectangle {
            id: row
            width: treeList.width
            height: 32
            radius: 4

            property var m: modelData
            property bool isSelected: SelUtil.containsPath(window.selectedNodes, m.path)
            property bool isGraphHighlighted: window.graphHighlightPath !== "" && window.graphHighlightPath === m.path

            color: isSelected ? Theme.accentSoft
                 : (rowMouse.containsMouse || dropArea.containsDrag ? Theme.overlayHover : "transparent")
            border.color: isGraphHighlighted ? Theme.highlight : (dropArea.containsDrag ? Theme.accent : "transparent")
            border.width: isGraphHighlighted ? 2 : (dropArea.containsDrag ? 1 : 0)
            Behavior on color { ColorAnimation { duration: Theme.animFast } }

            // Depth guide lines
            Repeater {
                model: row.m.depth
                Rectangle {
                    x: 13 + (index * 14)
                    width: 1
                    height: row.height
                    color: Theme.overlayHover
                }
            }

            Row {
                anchors.fill: parent
                anchors.leftMargin: 4 + (row.m.depth * 14)
                spacing: 6

                TreeChevron {
                    visible: row.m.isFolder
                    isExpanded: row.m.expanded
                    onClicked: (mouse) => {
                        mouse.accepted = true;
                        fileTreeRoot.toggleExpand(row.m.path);
                    }
                }

                Item {
                    width: 18
                    height: parent.height
                    visible: !row.m.isFolder
                }

                Text {
                    anchors.verticalCenter: parent.verticalCenter
                    width: parent.width - 26
                    text: row.m.name
                    color: row.isSelected ? Theme.text : (row.m.isFolder ? Theme.text : Theme.textDim)
                    font.pixelSize: 13
                    font.family: "Segoe UI"
                    elide: Text.ElideRight
                }
            }

            DropArea {
                id: dropArea
                anchors.fill: parent
                keys: ["node"]
                onDropped: (drop) => {
                    var target = row.m.path;
                    if (!row.m.isFolder) {
                        var ls = Math.max(target.lastIndexOf("/"), target.lastIndexOf("\\"));
                        target = ls !== -1 ? target.substring(0, ls) : target;
                    }
                    HandleDrop.handleDropPath(window, fileTreeRoot.vaultFs, target);
                    drop.accept();
                }
            }

            TreeContextMenu {
                id: rowMenu
                nodePath: row.m.path
                nodeName: row.m.name
                vaultFs: window.vaultFsRef
                onDeleteRequested: (path, name) => { window.nodeToDelete = fileTreeRoot.nodeOf(row.m); }
            }

            MouseArea {
                id: rowMouse
                anchors.fill: parent
                hoverEnabled: true
                acceptedButtons: Qt.LeftButton | Qt.RightButton

                property point startPos: Qt.point(0, 0)

                onPressed: (mouse) => {
                    if (mouse.button === Qt.LeftButton) startPos = Qt.point(mouse.x, mouse.y);
                    window.dragSourceNodes = row.isSelected ? window.selectedNodes : [fileTreeRoot.nodeOf(row.m)];
                }

                onPositionChanged: (mouse) => {
                    if (pressed && (mouse.buttons & Qt.LeftButton)) {
                        var gp = mapToItem(window.contentItem, mouse.x, mouse.y);
                        if (!window.isDraggingNode) {
                            if (Math.abs(mouse.x - startPos.x) > 5 || Math.abs(mouse.y - startPos.y) > 5)
                                BeginDrag.beginDragProxy(window, window.dragSourceNodes, gp.x, gp.y);
                        } else {
                            UpdateDrag.updateDragProxy(window, gp.x, gp.y);
                        }
                    }
                }

                onReleased: { if (window.isDraggingNode) EndDrag.endDragProxy(window); }

                onClicked: (mouse) => {
                    if (mouse.button === Qt.RightButton) { rowMenu.popupAt(mouse.x, mouse.y); return; }

                    if (mouse.modifiers & Qt.ShiftModifier) {
                        var anchorPath = (window.selectionAnchor && window.selectionAnchor.path)
                                         ? window.selectionAnchor.path : row.m.path;
                        var visible = fileTreeRoot.flatRows;
                        var a = SelUtil.indexOfPath(visible, anchorPath);
                        var b = SelUtil.indexOfPath(visible, row.m.path);
                        if (a === -1 || b === -1) {
                            window.selectedNodes = [fileTreeRoot.nodeOf(row.m)];
                            window.selectionAnchor = fileTreeRoot.nodeOf(row.m);
                        } else {
                            var lo = Math.min(a, b), hi = Math.max(a, b);
                            var sel = [];
                            for (var i = lo; i <= hi; i++) sel.push(fileTreeRoot.nodeOf(visible[i]));
                            window.selectedNodes = sel;
                        }
                    } else if (mouse.modifiers & Qt.ControlModifier) {
                        var s = window.selectedNodes.slice();
                        var idx = SelUtil.indexOfPath(s, row.m.path);
                        if (idx !== -1) s.splice(idx, 1); else s.push(fileTreeRoot.nodeOf(row.m));
                        window.selectedNodes = s;
                        window.selectionAnchor = fileTreeRoot.nodeOf(row.m);
                    } else {
                        fileTreeRoot.openRow(row.m);
                    }
                }
            }
        }
    }

    // Empty area below the tree — click clears selection, drop moves to the root.
    MouseArea {
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: treeList.bottom
        anchors.bottom: parent.bottom
        visible: !fileTreeRoot.searching
        onClicked: window.selectedNodes = []

        DropArea {
            anchors.fill: parent
            keys: ["node"]
            onDropped: (drop) => {
                if (fileTreeRoot.vaultFs && fileTreeRoot.vaultFs.vaultPath) {
                    HandleDrop.handleDropPath(window, fileTreeRoot.vaultFs, fileTreeRoot.vaultFs.vaultPath);
                    drop.accept();
                }
            }
        }
    }

    // ── Search results (virtualized) ────────────────────────────────────────
    ListView {
        id: searchList
        anchors.fill: parent
        visible: fileTreeRoot.searching
        clip: true
        model: fileTreeRoot.searchResults
        boundsBehavior: Flickable.StopAtBounds
        cacheBuffer: 200

        delegate: Rectangle {
            width: searchList.width
            height: 30
            radius: 4
            color: resMouse.containsMouse ? Theme.overlayHover : "transparent"
            Behavior on color { ColorAnimation { duration: Theme.animFast } }

            Row {
                anchors.fill: parent
                anchors.leftMargin: 8
                spacing: 6

                Text {
                    anchors.verticalCenter: parent.verticalCenter
                    width: 12
                    text: modelData.isFolder ? "▸" : ""
                    color: Theme.textMuted
                    font.pixelSize: 10
                }
                Text {
                    anchors.verticalCenter: parent.verticalCenter
                    width: searchList.width - 34
                    text: (modelData.name || "").replace(/\.md$/i, "")
                    color: modelData.isFolder ? Theme.text : Theme.textDim
                    font.pixelSize: 13
                    font.family: "Segoe UI"
                    elide: Text.ElideRight
                }
            }

            MouseArea {
                id: resMouse
                anchors.fill: parent
                hoverEnabled: true
                onClicked: fileTreeRoot.openResult(modelData)
            }
        }

        Text {
            anchors.centerIn: parent
            visible: fileTreeRoot.searching && searchList.count === 0
            text: "No matches"
            color: Theme.textMuted
            font.pixelSize: 12
            font.family: "Segoe UI"
        }
    }
}
