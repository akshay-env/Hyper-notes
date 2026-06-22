import QtQuick
import QtQuick.Controls
import "../../scripts/tree/toggleExpansion.js" as ToggleExpansion
import "../../scripts/tree/runExpansionAnimation.js" as RunExpansionAnim
import "../../scripts/drag/handleDropPath.js" as HandleDrop
import "../../scripts/drag/beginDragProxy.js" as BeginDrag
import "../../scripts/drag/updateDragProxy.js" as UpdateDrag
import "../../scripts/drag/endDragProxy.js" as EndDrag
import "../../scripts/tree/flattenVisible.js" as FlattenVisible
import "../../scripts/tree/selectionUtils.js" as SelUtil
import ".."

Item {
    id: root
    width: parent.width
    implicitHeight: itemBackground.height + childrenColumn.height

    // Properties
    property var nodeData: null
    property int depth: 0
    property Component delegateComponent: null
    property bool isSelected: false
    property bool isExpanded: false
    property var vaultFs: window.vaultFsRef
    // True only for the duration of a user-initiated toggle — keeps Behavior OFF
    // for data refreshes so only the clicked item ever animates (no chain reactions).
    property bool animateNextToggle: false

    onNodeDataChanged: {
        if (nodeData && nodeData.isFolder) {
            isExpanded = (nodeData.expanded === true);
            childRepeater.model = isExpanded ? nodeData.children : [];
        } else {
            isExpanded = false;
            childRepeater.model = [];
        }
        isSelected = (nodeData && window.selectedNodes) ? SelUtil.containsPath(window.selectedNodes, nodeData.path) : false;
    }

    Connections {
        target: window
        function onTreeVersionChanged() {
            if (root.nodeData && root.nodeData.isFolder && root.isExpanded) {
                childRepeater.model = root.nodeData.children;
            }
        }
    }

    Connections {
        target: window
        function onSelectedNodesChanged() {
            root.isSelected = (root.nodeData && window.selectedNodes) ? SelUtil.containsPath(window.selectedNodes, root.nodeData.path) : false;
        }
    }

    signal itemClicked(var node)

    // True when this node is being highlighted from the graph view
    property bool isGraphHighlighted: false

    Connections {
        target: window
        function onGraphHighlightPathChanged() {
            root.isGraphHighlighted = (window.graphHighlightPath !== "" && root.nodeData && root.nodeData.path === window.graphHighlightPath);
        }
    }

    Rectangle {
        id: itemBackground
        width: parent.width
        height: 32
        color: root.isSelected ? "#2b4a6b" : (itemMouseArea.containsMouse || dropArea.containsDrag ? Qt.rgba(1, 1, 1, 0.05) : "transparent")
        border.color: root.isGraphHighlighted ? "#ffd700" : (dropArea.containsDrag ? "#007acc" : "transparent")
        border.width: root.isGraphHighlighted ? 2 : (dropArea.containsDrag ? 1 : 0)
        radius: 4

        Repeater {
            model: root.depth > 0 ? root.depth : 0
            Rectangle {
                x: 13 + (index * 14)
                y: 0
                width: 1
                height: parent.height
                color: Qt.rgba(1, 1, 1, 0.05)
                z: 0
            }
        }

        Row {
            anchors.fill: parent
            anchors.leftMargin: 4 + (root.depth * 14)
            spacing: 6

            TreeChevron {
                visible: root.nodeData && root.nodeData.isFolder
                isExpanded: root.isExpanded
                onClicked: (mouse) => {
                    mouse.accepted = true;
                    RunExpansionAnim.run(root);
                    ToggleExpansion.toggleExpansion(window, window.vaultFsRef, root, childRepeater);
                }
            }

            Item {
                width: 18
                height: parent.height
                visible: root.nodeData && !root.nodeData.isFolder
            }

            Text {
                text: root.nodeData ? root.nodeData.name : ""
                color: root.nodeData && root.nodeData.isFolder ? "#dddddd" : "#bbbbbb"
                font.pixelSize: 13
                font.family: "Segoe UI"
                anchors.verticalCenter: parent.verticalCenter
                elide: Text.ElideRight
                width: parent.width - 26  // Row already handles depth indent via anchors.leftMargin
            }
        }

        DropArea {
            id: dropArea
            anchors.fill: parent
            keys: ["node"]
            
            onEntered: (drag) => {
                if (!root.nodeData) {
                    drag.accepted = false;
                    return;
                }
                
                let isInvalid = false;
                window.dragSourceNodes.forEach(node => {
                    if (node.path === root.nodeData.path || root.nodeData.path.startsWith(node.path + "/")) {
                        isInvalid = true;
                    }
                });
                
                if (isInvalid) {
                    drag.accepted = false;
                    return;
                }
                
                drag.accept();
                itemBackground.border.color = "#007acc"
                itemBackground.border.width = 1
            }
            
            onExited: () => {
                itemBackground.border.width = 0
            }
            
            onDropped: (drop) => {
                itemBackground.border.width = 0
                if (root.nodeData) {
                    if (root.nodeData.isFolder) {
                        HandleDrop.handleDropPath(window, vaultFs, root.nodeData.path);
                    } else {
                        let p = root.nodeData.path;
                        let lastSlash = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
                        let parentDir = lastSlash !== -1 ? p.substring(0, lastSlash) : p;
                        HandleDrop.handleDropPath(window, vaultFs, parentDir);
                    }
                    drop.accept();
                }
            }
        }

        TreeContextMenu {
            id: contextMenuPopup
            nodePath: root.nodeData ? root.nodeData.path : ""
            nodeName: root.nodeData ? root.nodeData.name : ""
            vaultFs: window.vaultFsRef
            onDeleteRequested: (path, name) => {
                window.nodeToDelete = root.nodeData;
            }
        }

        MouseArea {
            id: itemMouseArea
            anchors.fill: parent
            hoverEnabled: true
            acceptedButtons: Qt.LeftButton | Qt.RightButton

            property point startPos: Qt.point(0,0)

            onPressed: (mouse) => {
                if (mouse.button === Qt.LeftButton) {
                    startPos = Qt.point(mouse.x, mouse.y);
                }
                window.dragSourceNodes = root.isSelected ? window.selectedNodes : [root.nodeData];
            }

            onPositionChanged: (mouse) => {
                if (pressed && mouse.buttons & Qt.LeftButton) {
                    let globalPos = mapToItem(window.contentItem, mouse.x, mouse.y);
                    if (!window.isDraggingNode) {
                        if (Math.abs(mouse.x - startPos.x) > 5 || Math.abs(mouse.y - startPos.y) > 5) {
                            BeginDrag.beginDragProxy(window, window.dragSourceNodes, globalPos.x, globalPos.y);
                        }
                    } else {
                        UpdateDrag.updateDragProxy(window, globalPos.x, globalPos.y);
                    }
                }
            }

            onReleased: {
                if (window.isDraggingNode) {
                    EndDrag.endDragProxy(window);
                }
            }

            onClicked: (mouse) => {
                if (mouse.button === Qt.RightButton) {
                    contextMenuPopup.popup();
                    return;
                }

                if (mouse.modifiers & Qt.ShiftModifier) {
                    // Range select: from the anchor to the clicked item, inclusive,
                    // in visible top-to-bottom order. Indices are resolved by path
                    // because the anchor was captured from an earlier tree read and
                    // won't share object identity with this fresh flatten.
                    let anchorPath = (window.selectionAnchor && window.selectionAnchor.path)
                                     ? window.selectionAnchor.path : root.nodeData.path;
                    let visible = FlattenVisible.flattenVisible(window.vaultTree);
                    let a = SelUtil.indexOfPath(visible, anchorPath);
                    let b = SelUtil.indexOfPath(visible, root.nodeData.path);
                    if (a === -1 || b === -1) {
                        window.selectedNodes = [root.nodeData];
                        window.selectionAnchor = root.nodeData;
                    } else {
                        let lo = Math.min(a, b);
                        let hi = Math.max(a, b);
                        window.selectedNodes = visible.slice(lo, hi + 1);
                        // Leave the anchor in place so the range can be re-extended.
                    }
                } else if (mouse.modifiers & Qt.ControlModifier) {
                    let sel = [...window.selectedNodes];
                    let idx = SelUtil.indexOfPath(sel, root.nodeData.path);
                    if (idx !== -1) {
                        sel.splice(idx, 1);
                    } else {
                        sel.push(root.nodeData);
                    }
                    window.selectedNodes = sel;
                    window.selectionAnchor = root.nodeData;
                } else {
                    window.selectedNodes = [root.nodeData];
                    window.selectionAnchor = root.nodeData;

                    if (root.nodeData && root.nodeData.isFolder) {
                        RunExpansionAnim.run(root);
                        ToggleExpansion.toggleExpansion(window, window.vaultFsRef, root, childRepeater);
                    } else if (root.nodeData) {
                        root.itemClicked(root.nodeData);
                    }
                }
            }
        }
    }



    Item {
        id: childrenColumn
        y: itemBackground.height
        width: parent.width
        clip: true

        // Reactive binding: always resolves to the correct height.
        // The Behavior below animates changes only when animateNextToggle is true
        // (i.e., a user clicked a folder), so data-refresh height changes are instant.
        height: root.isExpanded ? childrenContent.implicitHeight : 0

        Behavior on height {
            enabled: root.animateNextToggle
            NumberAnimation {
                duration: 120
                easing.type: Easing.OutCubic
                onRunningChanged: {
                    // Disarm the flag the moment the animation finishes so subsequent
                    // layout changes (e.g. child drops) remain instant.
                    if (!running) root.animateNextToggle = false;
                }
            }
        }

        Column {
            id: childrenContent
            width: parent.width

            Repeater {
                id: childRepeater
                model: []

                delegate: Loader {
                    width: childrenColumn.width
                    sourceComponent: root.delegateComponent

                    onLoaded: {
                        if (item) {
                            // Set delegateComponent FIRST so it is available when nodeData
                            // triggers onNodeDataChanged and the item tries to populate its children
                            item.depth = root.depth + 1;
                            item.delegateComponent = root.delegateComponent;
                            item.itemClicked.connect((node) => root.itemClicked(node));
                            item.nodeData = modelData;  // Set LAST — triggers onNodeDataChanged
                        }
                    }
                }
            }
        }
    }

}

