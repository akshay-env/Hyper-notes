import QtQuick
import QtQuick.Controls
import HyperLinkNotes
import "../../scripts/drag/handleDropPath.js" as HandleDrop
import "../../scripts/navigation/pushHistory.js" as PushHistory
import "../../scripts/tree/searchFlat.js" as SearchFlat
import "../../scripts/file/openFileByPath.js" as OpenFile
import "../../scripts/tree/search.js" as Search

Item {
    id: fileTreeRoot

    property var vaultFs: null
    property bool searching: (window.treeSearchQuery || "").trim() !== ""

    // Flat list of matches (files + folders) — runs over the cached plain-JS
    // mirror so it stays fast, and is rendered by a virtualized ListView below.
    property var searchResults: searching
        ? SearchFlat.searchFlat(window.vaultTreeJS, window.treeSearchQuery.trim().toLowerCase())
        : []

    function openResult(node) {
        if (!node) return;
        if (node.isFolder) {
            var real = Search.search(window.vaultTree, node.path);
            if (real) window.selectedNodes = [real];
        } else {
            window.graphViewActive = false;
            OpenFile.openFileByPath(window, node.path);
        }
    }

    // ── Normal tree view ────────────────────────────────────────────────────
    Flickable {
        id: treeFlick
        anchors.fill: parent
        visible: !fileTreeRoot.searching
        clip: true
        contentWidth: width
        contentHeight: Math.max(height, treeColumn.height)
        boundsBehavior: Flickable.StopAtBounds
        interactive: true

        Item {
            width: treeFlick.width
            height: treeFlick.contentHeight

            DropArea {
                anchors.fill: parent
                keys: ["node"]
                onEntered: (drag) => {
                    let isInvalid = false;
                    window.dragSourceNodes.forEach(node => {
                        if (node.path.substring(0, node.path.lastIndexOf("/")) === fileTreeRoot.vaultFs.vaultPath ||
                            node.path.substring(0, node.path.lastIndexOf("\\")) === fileTreeRoot.vaultFs.vaultPath) {
                            isInvalid = true;
                        }
                    });

                    if (isInvalid) {
                        drag.accepted = false;
                    } else {
                        drag.accept();
                    }
                }
                onDropped: (drop) => {
                    if (fileTreeRoot.vaultFs && fileTreeRoot.vaultFs.vaultPath) {
                        HandleDrop.handleDropPath(window, fileTreeRoot.vaultFs, fileTreeRoot.vaultFs.vaultPath);
                        drop.accept();
                    }
                }
            }

            Column {
                id: treeColumn
                width: parent.width
                spacing: 2

                Component {
                    id: folderDelegate
                    FolderTreeItem {
                        delegateComponent: folderDelegate
                        onItemClicked: (node) => {
                            // Opening a note from the sidebar leaves the graph view
                            // and shows the note (in its tab).
                            window.graphViewActive = false;
                            PushHistory.push(window, node);
                            window.openNoteInTab(node);
                        }
                    }
                }

                Repeater {
                    model: window.vaultTree
                    delegate: Loader {
                        width: treeFlick.width
                        sourceComponent: folderDelegate
                        onLoaded: {
                            if (item) {
                                item.depth = 0;
                                item.nodeData = modelData;  // Set LAST — triggers onNodeDataChanged
                            }
                        }
                    }
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

        // Empty-results hint
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
