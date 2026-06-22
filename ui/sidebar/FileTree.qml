import QtQuick
import QtQuick.Controls
import "../../scripts/drag/handleDropPath.js" as HandleDrop
import "../../scripts/navigation/pushHistory.js" as PushHistory
import "../../scripts/tree/filterTree.js" as FilterTree

Flickable {
    id: root
    clip: true
    contentWidth: width
    contentHeight: Math.max(height, treeColumn.height)
    boundsBehavior: Flickable.StopAtBounds
    interactive: true // Enables trackpad and wheel scrolling natively

    property var vaultFs: null

    // Full tree normally; a filtered + auto-expanded copy while searching.
    property var displayModel: {
        var q = (window.treeSearchQuery || "").trim().toLowerCase();
        if (q === "") return window.vaultTree;
        return FilterTree.filterTree(window.vaultTree, q);
    }

    Item {
        width: root.width
        // Ensure this content item covers the full Flickable content space
        height: root.contentHeight

        DropArea {
            anchors.fill: parent
            keys: ["node"]
            onEntered: (drag) => {
                let isInvalid = false;
                window.dragSourceNodes.forEach(node => {
                    // Prevent dropping root-level items into root again (no-op)
                    if (node.path.substring(0, node.path.lastIndexOf("/")) === vaultFs.vaultPath ||
                        node.path.substring(0, node.path.lastIndexOf("\\")) === vaultFs.vaultPath) {
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
                if (vaultFs && vaultFs.vaultPath) {
                    HandleDrop.handleDropPath(window, vaultFs, vaultFs.vaultPath);
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
                model: root.displayModel
                delegate: Loader {
                    width: root.width
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
