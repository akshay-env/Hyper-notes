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

    // Internal state — nodes live in a ListModel so the replay animation can
    // append them one at a time without rebuilding every delegate.
    property var graphEdges: []
    property real panX: 0
    property real panY: 0
    property real zoomFactor: 1.0
    // Zoom range: 5% (far out) up to 500% (close in).
    readonly property real minZoom: 0.05
    readonly property real maxZoom: 5.0
    // While true, the camera keeps the whole graph framed as the layout settles.
    // Turns off the moment the user pans, zooms, or drags a node.
    property bool autoFit: true
    property string hoveredNodePath: ""
    property var hoveredNeighbors: []
    // Non-empty while a node is being dragged: locks the highlight/dim state to
    // that node so a fast shake can't flicker it (the dragged dot lags the
    // cursor, which would otherwise spam hover enter/exit).
    property string draggingNodePath: ""

    // ── Tab-focus highlight ──────────────────────────────────────────────────
    // When notes are open in tabs, those nodes + their first neighbours + the
    // connecting edges stay lit while everything else dims. With no tabs open the
    // whole graph is lit (anyActive === false → current behaviour). Hovering a
    // node adds it to the focus on top of the open tabs.
    property var tabFocus: {
        var out = [];
        if (!window.openTabs) return out;
        for (var i = 0; i < window.openTabs.length; i++) {
            var p = window.openTabs[i].path;
            if (p && p !== "") out.push(p);
        }
        return out;
    }
    property var focusSet: {
        var f = tabFocus.slice();
        if (hoveredNodePath !== "" && f.indexOf(hoveredNodePath) === -1)
            f.push(hoveredNodePath);
        return f;
    }
    property var litNeighbors: {
        var dummy = graphEdges;   // re-evaluate when edges change (e.g. during replay)
        var nb = [];
        var seen = ({});
        for (var i = 0; i < focusSet.length; i++) {
            var ns = GetNeighbors.getNeighbors(graphEdges, focusSet[i]);
            for (var j = 0; j < ns.length; j++) {
                if (!seen[ns[j]]) { seen[ns[j]] = true; nb.push(ns[j]); }
            }
        }
        return nb;
    }
    property bool anyActive: focusSet.length > 0

    // Physics runs on a dedicated C++ worker thread (see PhysicsWorker).
    // It pushes position updates to the main thread via positionsUpdated;
    // no main-thread FrameAnimation is needed.
    ForceSimulation {
        id: forceSimulation
    }

    // Node delegates read from this; replay appends rows incrementally.
    ListModel { id: nodeModel }

    // ── Replay (rebuild the graph node-by-node) ──────────────────────────────
    property bool replaying: false
    property var  _replayNodes: []         // shuffled full node list
    property var  _replayEdgesByPath: ({}) // path → incident edges
    property var  _replayAdded: ({})       // path → true once dropped in
    property int  _replayCount: 0
    property real _replayStart: 0
    property real _replayLastTick: 0
    property real _replayAccum: 0          // fractional nodes carried between ticks
    // Drops start slow, ramp up to a steady cruising pace, then hold it until the
    // whole graph is rebuilt (no fixed time cap).
    readonly property real replayRampMs: 7000
    readonly property real replayStartRate: 1.0    // nodes/sec at the very start
    readonly property real replayCruiseRate: 26    // nodes/sec steady pace

    Timer {
        id: replayTimer
        interval: 16
        repeat: true
        running: false
        onTriggered: root.replayStep()
    }

    // While the layout is settling (and the user hasn't grabbed the camera yet),
    // refit on every physics tick so the whole graph stays framed.
    Connections {
        target: forceSimulation
        function onPositionsUpdated() {
            if (root.autoFit) root.fitToView();
        }
    }

    // Node dimensions
    readonly property int nodeWidth: 140
    readonly property int nodeHeight: 36

    // ── Background ──────────────────────────────────────────────────────────
    Rectangle {
        anchors.fill: parent
        color: Theme.graphBg
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
                root.autoFit = false;   // user took control of the camera
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
            root.autoFit = false;   // user took control of the camera
            let factor = event.angleDelta.y > 0 ? 1.12 : (1.0 / 1.12);
            let newZoom = Math.max(root.minZoom, Math.min(root.maxZoom, root.zoomFactor * factor));

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

        // MSAA scoped to just the graph. The edge lines are GL_LINES geometry with
        // no per-vertex AA, so they need multisampling to look smooth on diagonals.
        // This replaces the old global 4x default surface (which slowed the whole
        // window's compositing) — a multisampled layer keeps the edges crisp
        // while only paying the cost while the graph is on screen.
        layer.enabled: true
        layer.samples: 4
        layer.smooth: true

        simulation: forceSimulation
        panX: root.panX
        panY: root.panY
        zoomFactor: root.zoomFactor
        // Light up the edges connected to any focused node (open tabs ∪ hovered).
        highlightNodeIds: root.focusSet
        // Theme-driven edge colours (translucent dim line + accent for lit edges).
        edgeColor: Qt.rgba(Theme.border.r, Theme.border.g, Theme.border.b, 0.7)
        accentColor: Theme.accent
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
            model: nodeModel

            delegate: GraphNode {
                nodeTitle: model.title
                nodePath: model.path
                nodeLayer: model.layer
                nodeDegree: model.degree
                isActiveNote: window.activeNote && window.activeNote.path === model.path

                // Dynamic bindings that re-evaluate when the physics tick increments.
                // Index-based reads avoid a per-node string hash every tick.
                targetX: { let dummy = forceSimulation.tickCount; return forceSimulation.getNodeXAt(index); }
                targetY: { let dummy = forceSimulation.tickCount; return forceSimulation.getNodeYAt(index); }
                z: 2

                isHovered: root.hoveredNodePath === model.path
                isFocus: root.tabFocus.indexOf(model.path) !== -1
                isNeighbor: root.litNeighbors.indexOf(model.path) !== -1
                anyActive: root.anyActive

                onNodeClicked: (path) => root.noteClicked(path)
                // Drag: pin on start, stream the target on move, unpin on finish.
                // No reheat() per move — the worker keeps the sim warm via
                // alphaTarget while pinned, and endDrag handles the settle.
                onNodeDragStarted: (path) => {
                    root.autoFit = false;   // user took control of the camera
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
            color: closeHover.containsMouse ? Theme.text : Theme.textDim
            font.pixelSize: 14
        }
        MouseArea {
            id: closeHover
            anchors.fill: parent
            hoverEnabled: true
            onClicked: root.closeRequested()
        }
    }

    // ── Replay button: rebuild the graph node-by-node ────────────────────────
    Rectangle {
        anchors.top: parent.top
        anchors.left: parent.left
        anchors.topMargin: 12
        anchors.leftMargin: 12
        width: replayRow.width + 20
        height: 30
        radius: 6
        color: replayHover.containsMouse ? Theme.elevated : Theme.surface2
        border.color: Theme.border
        border.width: 1
        z: 10

        Behavior on color { ColorAnimation { duration: Theme.animFast } }

        Row {
            id: replayRow
            anchors.centerIn: parent
            spacing: 6

            Text {
                anchors.verticalCenter: parent.verticalCenter
                text: "↻"
                color: Theme.accentText
                font.pixelSize: 15
            }
            Text {
                anchors.verticalCenter: parent.verticalCenter
                text: root.replaying ? "Building…" : "Replay"
                color: Theme.textDim
                font.pixelSize: 12
                font.family: "Segoe UI"
            }
        }

        MouseArea {
            id: replayHover
            anchors.fill: parent
            hoverEnabled: true
            onClicked: if (!root.replaying) root.startReplay()
        }
    }

    // ── Load graph when this component becomes visible ──────────────────────
    onVisibleChanged: {
        if (visible) loadGraph();
    }

    Component.onCompleted: {
        // The physics is iteration-based (one d3 step per tick, no dt), so the
        // tick rate IS the simulation speed. Obsidian runs a fixed 60 Hz; match
        // it — tying this to a 144 Hz display ran velocityDecay 2.4× too often
        // and made dragging feel stiff/over-damped.
        forceSimulation.setTickIntervalMs(16);
        if (visible) loadGraph();
    }

    function loadGraph() {
        replayTimer.stop();
        root.replaying = false;

        // Center the start node in the middle of this component
        root.panX = root.width / 2;
        root.panY = root.height / 2;
        root.zoomFactor = 1.0;
        // Frame the whole graph by default; auto-fit tracks the layout as it
        // settles until the user pans/zooms/drags.
        root.autoFit = true;

        let data = GraphBuilder.buildGraphData(window, window.vaultFsRef);

        nodeModel.clear();
        for (let i = 0; i < data.nodes.length; i++) {
            let n = data.nodes[i];
            nodeModel.append({ "title": n.title, "path": n.path,
                               "layer": n.layer, "degree": n.degree || 0 });
        }
        root.graphEdges = data.edges;

        forceSimulation.init(data.nodes, data.edges);
    }

    // ── Replay: rebuild the graph one random node at a time ──────────────────
    // Starts slow (one by one), accelerates, and always finishes by 35s. Nodes
    // are dropped at random positions in a random order so the physics is visible.
    function startReplay() {
        let data = GraphBuilder.buildGraphData(window, window.vaultFsRef);

        // Shuffle node order (Fisher–Yates)
        let nodes = data.nodes.slice();
        for (let i = nodes.length - 1; i > 0; i--) {
            let j = Math.floor(Math.random() * (i + 1));
            let t = nodes[i]; nodes[i] = nodes[j]; nodes[j] = t;
        }

        // Map each node path to the edges incident on it
        let byPath = ({});
        for (let e of data.edges) {
            (byPath[e.from] = byPath[e.from] || []).push(e);
            (byPath[e.to]   = byPath[e.to]   || []).push(e);
        }

        root._replayNodes = nodes;
        root._replayEdgesByPath = byPath;
        root._replayAdded = ({});
        root._replayCount = 0;
        root._replayAccum = 0;

        // Reset the canvas
        nodeModel.clear();
        root.graphEdges = [];
        forceSimulation.clear();
        root.autoFit = true;
        root.panX = root.width / 2;
        root.panY = root.height / 2;
        root.zoomFactor = 1.0;

        root.replaying = true;
        root._replayStart = Date.now();
        root._replayLastTick = root._replayStart;
        replayTimer.start();
    }

    function replayStep() {
        let total = root._replayNodes.length;
        if (total === 0) { replayTimer.stop(); root.replaying = false; return; }

        let now = Date.now();
        let dt = Math.min(0.1, (now - root._replayLastTick) / 1000);   // clamp big gaps
        root._replayLastTick = now;

        // Ramp the drop rate from slow → cruise over replayRampMs, then hold it.
        let rp = Math.min(1, (now - root._replayStart) / root.replayRampMs);
        let rate = root.replayStartRate + (root.replayCruiseRate - root.replayStartRate) * (rp * rp);

        root._replayAccum += rate * dt;
        let n = Math.floor(root._replayAccum);
        root._replayAccum -= n;
        if (n > total - root._replayCount) n = total - root._replayCount;
        if (n <= 0) {
            if (root._replayCount >= total) { replayTimer.stop(); root.replaying = false; }
            return;
        }

        // Pick this frame's nodes
        let appendList = [];
        let batchNodes = [];
        for (let k = 0; k < n; k++) {
            let node = root._replayNodes[root._replayCount + k];
            let rx = (Math.random() * 2 - 1) * 650;
            let ry = (Math.random() * 2 - 1) * 650;
            root._replayAdded[node.path] = true;
            batchNodes.push({ "id": node.path, "x": rx, "y": ry });
            appendList.push(node);
        }
        root._replayCount += n;

        // Edges that are now complete (both ends present), de-duplicated via _rAdded
        let batchEdges = [];
        for (let node of appendList) {
            let incident = root._replayEdgesByPath[node.path] || [];
            for (let e of incident) {
                if (!e._rAdded && root._replayAdded[e.from] && root._replayAdded[e.to]) {
                    e._rAdded = true;
                    batchEdges.push(e);
                }
            }
        }
        if (batchEdges.length > 0) {
            let g = root.graphEdges.slice();
            for (let e of batchEdges) g.push(e);
            root.graphEdges = g;
        }

        // 1) Update the simulation FIRST so positions exist, then 2) create the
        // delegates in the same order — otherwise a new dot binds getNodeXAt()
        // before its position exists and flashes at the origin (the glitch).
        forceSimulation.addNodes(batchNodes, batchEdges);
        for (let node of appendList) {
            nodeModel.append({ "title": node.title, "path": node.path,
                               "layer": node.layer, "degree": node.degree || 0 });
        }

        if (root._replayCount >= total) {
            replayTimer.stop();
            root.replaying = false;
        }
    }

    // Frames every node within the view, centered, with a margin. Instead of
    // snapping the camera (which makes the whole graph teleport as the layout
    // expands), it eases the camera toward the target framing each tick, so the
    // view glides smoothly. Zoom is clamped so a tiny/clustered graph can't blow
    // up at the start.
    readonly property real fitEase: 0.14   // 0 = frozen, 1 = instant snap
    function fitToView() {
        if (nodeModel.count === 0) return;
        if (root.width <= 0 || root.height <= 0) return;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let count = 0;
        for (let i = 0; i < nodeModel.count; i++) {
            let x = forceSimulation.getNodeXAt(i);
            let y = forceSimulation.getNodeYAt(i);
            if (!isFinite(x) || !isFinite(y)) continue;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            count++;
        }
        if (count === 0) return;

        let pad = 90;
        let contentW = Math.max(1, (maxX - minX) + pad * 2);
        let contentH = Math.max(1, (maxY - minY) + pad * 2);

        let z = Math.min(root.width / contentW, root.height / contentH);
        z = Math.max(root.minZoom, Math.min(z, 1.1));   // never over-zoom a small graph

        let cx = (minX + maxX) / 2;
        let cy = (minY + maxY) / 2;
        let targetZoom = z;
        let targetPanX = root.width / 2 - cx * z;
        let targetPanY = root.height / 2 - cy * z;

        // Ease the live camera toward the target. Snap the last sliver so it
        // settles exactly instead of crawling forever.
        let e = root.fitEase;
        root.zoomFactor += (targetZoom - root.zoomFactor) * e;
        root.panX += (targetPanX - root.panX) * e;
        root.panY += (targetPanY - root.panY) * e;
        if (Math.abs(targetZoom - root.zoomFactor) < 0.0005) root.zoomFactor = targetZoom;
        if (Math.abs(targetPanX - root.panX) < 0.5) root.panX = targetPanX;
        if (Math.abs(targetPanY - root.panY) < 0.5) root.panY = targetPanY;
    }
}
