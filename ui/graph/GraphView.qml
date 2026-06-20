import QtQuick
import QtQuick.Controls
import "../../scripts/graph/buildGraphData.js" as GraphBuilder
import "../../scripts/graph/computePositions.js" as ComputePositions
import "../../scripts/graph/getNeighbors.js" as GetNeighbors
import HyperLinkNotes

Item {
    id: root
    // Geometry (width / x slide / top-bottom) is driven by Main.qml.
    // Do NOT anchor-fill here — it would fight Main's width + x animation.
    clip: true  // Prevent any nodes from bleeding outside this area

    signal closeRequested()
    signal noteClicked(string path)

    // Internal state
    property var graphNodes: []
    property var graphEdges: []
    property real panX: 0
    property real panY: 0
    property real zoomFactor: 1.0
    property string hoveredNodePath: ""
    property var hoveredNeighbors: []
    // Non-empty while a node is being dragged: locks the highlight/dim state to
    // that node so a fast shake can't flicker it (the dragged dot lags the
    // cursor, which would otherwise spam hover enter/exit).
    property string draggingNodePath: ""

    // Physics runs on a dedicated C++ worker thread (see PhysicsWorker).
    // It pushes position updates to the main thread via positionsUpdated;
    // no main-thread FrameAnimation is needed.
    ForceSimulation {
        id: forceSimulation
    }

    // Node dimensions
    readonly property int nodeWidth: 140
    readonly property int nodeHeight: 36

    // ── Background ──────────────────────────────────────────────────────────
    Rectangle {
        anchors.fill: parent
        color: "#1e1e1e"
    }

    // Tracks whether a background pan is in progress (read by node hover logic)
    property bool isPanning: panHandler.active

    // ── Pan: drag empty space to move the camera ────────────────────────────
    // Pointer handlers attach to root and use Qt's modern pointer-event
    // delivery, so they reliably receive events even with the edge renderer and
    // node container layered on top. Node MouseAreas (preventStealing) still win
    // their own presses, so dragging a node never pans the canvas.
    DragHandler {
        id: panHandler
        target: null
        acceptedButtons: Qt.LeftButton
        dragThreshold: 0

        property point lastPos: Qt.point(0, 0)

        onActiveChanged: {
            if (active) {
                lastPos = centroid.position;
                // Drop any active hover so the graph never freezes dimmed while panning
                root.hoveredNodePath = "";
                root.hoveredNeighbors = [];
            }
        }
        onCentroidChanged: {
            if (active) {
                let p = centroid.position;
                root.panX += p.x - lastPos.x;
                root.panY += p.y - lastPos.y;
                lastPos = p;
            }
        }
    }

    // ── Zoom: scroll wheel, centered on the cursor ──────────────────────────
    WheelHandler {
        id: zoomHandler
        acceptedDevices: PointerDevice.Mouse | PointerDevice.TouchPad

        onWheel: (event) => {
            let factor = event.angleDelta.y > 0 ? 1.12 : (1.0 / 1.12);
            let newZoom = Math.max(0.15, Math.min(4.0, root.zoomFactor * factor));

            // Keep the graph point under the cursor fixed:
            // screen_pos = graph_pos * zoom + pan
            let mx = event.x;
            let my = event.y;
            root.panX = mx - (mx - root.panX) * (newZoom / root.zoomFactor);
            root.panY = my - (my - root.panY) * (newZoom / root.zoomFactor);
            root.zoomFactor = newZoom;
        }
    }

    // ── Edge Hardware Renderer (Blasts lines directly to GPU) ───────────────
    GraphRenderer {
        id: edgeCanvas
        anchors.fill: parent
        z: 0

        simulation: forceSimulation
        panX: root.panX
        panY: root.panY
        zoomFactor: root.zoomFactor
        // Light up the edges connected to the hovered node (Obsidian-style)
        highlightNodeId: root.hoveredNodePath
    }

    // ── Graph nodes: panned and zoomed via Item transform ────────────────────
    Item {
        id: graphContent
        // Use x/y + scale with TopLeft origin for correct cursor-based zoom
        x: root.panX
        y: root.panY
        width: 1   // Size doesn't matter — children position themselves
        height: 1
        scale: root.zoomFactor
        transformOrigin: Item.TopLeft
        z: 1

        // Node delegates
        Repeater {
            id: nodeRepeater
            model: root.graphNodes

            delegate: GraphNode {
                nodeTitle: modelData.title
                nodePath: modelData.path
                nodeLayer: modelData.layer
                isActiveNote: window.activeNote && window.activeNote.path === modelData.path
                
                // Dynamic bindings that re-evaluate automatically when physics tick increments
                targetX: { let dummy = forceSimulation.tickCount; return forceSimulation.getNodeX(modelData.path); }
                targetY: { let dummy = forceSimulation.tickCount; return forceSimulation.getNodeY(modelData.path); }
                z: 2
                
                isHovered: root.hoveredNodePath === modelData.path
                isNeighbor: root.hoveredNeighbors.indexOf(modelData.path) !== -1
                anyHovered: root.hoveredNodePath !== ""

                onNodeClicked: (path) => root.noteClicked(path)
                // Drag: pin on start, stream the target on move, unpin on finish.
                // No reheat() per move — the worker keeps the sim warm via
                // alphaTarget while pinned, and endDrag handles the settle.
                onNodeDragStarted: (path) => {
                    forceSimulation.setNodePinned(path, true);
                    // Lock the highlight onto the dragged node for the whole drag
                    // so the dim/lit state stays steady no matter how fast it moves.
                    root.draggingNodePath = path;
                    root.hoveredNodePath = path;
                    root.hoveredNeighbors = GetNeighbors.getNeighbors(root.graphEdges, path);
                }
                onNodeDragged: (path, nx, ny) => forceSimulation.setNodePosition(path, nx, ny)
                onNodeDragFinished: (path) => {
                    forceSimulation.setNodePinned(path, false);
                    // Release the lock; the cursor is still over the node, so leave
                    // it highlighted until the pointer actually exits.
                    root.draggingNodePath = "";
                }

                onNodeHoverEntered: (path) => {
                    // Ignore hover changes while panning or dragging (locked state)
                    if (root.isPanning || root.draggingNodePath !== "") return;
                    root.hoveredNodePath = path;
                    root.hoveredNeighbors = GetNeighbors.getNeighbors(root.graphEdges, path);
                }
                onNodeHoverExited: (path) => {
                    if (root.draggingNodePath !== "") return;
                    if (root.hoveredNodePath === path) {
                        root.hoveredNodePath = "";
                        root.hoveredNeighbors = [];
                    }
                }
            }
        }
    }

    // ── Floating Close Button (always on top, inside clip area) ──────────────
    Rectangle {
        anchors.top: parent.top
        anchors.right: parent.right
        anchors.topMargin: 12
        anchors.rightMargin: 12
        width: 30
        height: 30
        radius: 6
        color: closeHover.containsMouse ? Qt.rgba(1,1,1,0.1) : "transparent"
        z: 10

        Text {
            anchors.centerIn: parent
            text: "✕"
            color: "#888"
            font.pixelSize: 14
        }
        MouseArea {
            id: closeHover
            anchors.fill: parent
            hoverEnabled: true
            onClicked: root.closeRequested()
        }
    }

    // ── Load graph when this component becomes visible ──────────────────────
    onVisibleChanged: {
        if (visible) loadGraph();
    }

    Component.onCompleted: {
        if (visible) loadGraph();
    }

    function loadGraph() {
        // Center the start node in the middle of this component
        root.panX = root.width / 2;
        root.panY = root.height / 2;
        root.zoomFactor = 1.0;

        let data = GraphBuilder.buildGraphData(window, window.vaultFsRef);

        root.graphNodes = data.nodes;
        root.graphEdges = data.edges;

        forceSimulation.init(data.nodes, data.edges);
    }
}
