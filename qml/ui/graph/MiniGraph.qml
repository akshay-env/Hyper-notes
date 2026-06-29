import QtQuick
import "../../scripts/graph/buildGraphData.js" as GraphBuilder
import "../../scripts/graph/getNeighbors.js" as GetNeighbors
import HyperLinkNotes

// Compact, non-interactive preview of the graph scoped to the active note and
// its first neighbours. Clicking anywhere opens the full GraphView.
//
// The expensive full-graph build (reads every note) is cached and only re-run
// when the vault tree changes (window.treeVersion); switching tabs just
// re-filters the cached graph down to the active node's neighbourhood.
Item {
    id: root
    clip: true

    signal expandRequested()

    // Camera (auto-fit only — no user pan/zoom in the mini view)
    property real panX: width / 2
    property real panY: height / 2
    property real zoomFactor: 1.0
    readonly property real minZoom: 0.05
    property bool autoFit: true

    readonly property string activePath:
        (window.activeNote && window.activeNote.path) ? window.activeNote.path : ""

    // ── Cached full graph (rebuilt only when the tree version changes) ────────
    property var _fullNodes: []
    property var _fullEdges: []
    property int _cacheVersion: -1

    function ensureFullGraph() {
        if (root._cacheVersion === window.treeVersion && root._fullNodes.length > 0) return;
        var data = GraphBuilder.buildGraphData(window, window.vaultFsRef);
        root._fullNodes = data.nodes;
        root._fullEdges = data.edges;
        root._cacheVersion = window.treeVersion;
    }

    ForceSimulation { id: sim }
    ListModel { id: nodeModel }

    // ── Background ───────────────────────────────────────────────────────────
    Rectangle {
        anchors.fill: parent
        color: Theme.graphBg
    }

    // ── Edges (GPU renderer reads geometry straight from the simulation) ─────
    GraphRenderer {
        id: edgeCanvas
        anchors.fill: parent
        z: 0
        layer.enabled: true
        layer.samples: 4
        layer.smooth: true

        simulation: sim
        panX: root.panX
        panY: root.panY
        zoomFactor: root.zoomFactor
        highlightNodeIds: root.activePath !== "" ? [root.activePath] : []
        edgeColor: Qt.rgba(Theme.border.r, Theme.border.g, Theme.border.b, 0.7)
        accentColor: Theme.accent
    }

    // ── Nodes ────────────────────────────────────────────────────────────────
    Item {
        id: graphContent
        x: root.panX
        y: root.panY
        width: 1
        height: 1
        scale: root.zoomFactor
        transformOrigin: Item.TopLeft
        z: 1

        Repeater {
            id: nodeRepeater
            model: nodeModel

            delegate: GraphNode {
                nodeTitle: model.title
                nodePath: model.path
                nodeLayer: model.layer
                nodeDegree: model.degree
                isActiveNote: model.path === root.activePath

                // Light the active node (gold) and its neighbours; nothing dims.
                isFocus: model.path === root.activePath
                isNeighbor: model.path !== root.activePath
                anyActive: true

                targetX: { let d = sim.tickCount; return sim.getNodeXAt(index); }
                targetY: { let d = sim.tickCount; return sim.getNodeYAt(index); }
                z: 2
            }
        }
    }

    // ── Empty hint ───────────────────────────────────────────────────────────
    Text {
        anchors.centerIn: parent
        visible: nodeModel.count === 0
        text: window.activeNote ? "Not linked yet" : "No note open"
        color: Theme.textFaint
        font.pixelSize: 11
        font.family: "Segoe UI"
        font.italic: true
    }

    // ── Click-to-expand: the whole preview is one button to the full graph ───
    MouseArea {
        anchors.fill: parent
        z: 10
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        onClicked: root.expandRequested()
    }

    // Keep the whole neighbourhood framed while the layout settles.
    Connections {
        target: sim
        function onPositionsUpdated() { if (root.autoFit) root.fitToView(); }
    }

    Connections {
        target: window
        function onActiveNoteChanged() { if (root.visible) root.loadSubgraph(); }
    }

    onVisibleChanged: { if (visible) loadSubgraph(); }

    Component.onCompleted: {
        sim.setTickIntervalMs(16);
        if (visible) loadSubgraph();
    }

    // Build the subgraph = active note + direct neighbours + the edges among them.
    function loadSubgraph() {
        nodeModel.clear();
        sim.clear();
        root.panX = root.width / 2;
        root.panY = root.height / 2;
        root.zoomFactor = 1.0;
        root.autoFit = true;

        if (root.activePath === "") return;
        ensureFullGraph();

        // Paths to keep: the active note plus everything it links to / from.
        var nbr = GetNeighbors.getNeighbors(root._fullEdges, root.activePath);
        var keep = ({});
        keep[root.activePath] = true;
        for (var i = 0; i < nbr.length; i++) keep[nbr[i]] = true;

        // Subgraph nodes (same order will be fed to the simulation → index aligns).
        var subNodes = [];
        var haveActive = false;
        for (var j = 0; j < root._fullNodes.length; j++) {
            var nd = root._fullNodes[j];
            if (keep[nd.path]) {
                subNodes.push(nd);
                if (nd.path === root.activePath) haveActive = true;
            }
        }
        // A brand-new note may not be in the cached graph yet — show its own dot.
        if (!haveActive) {
            subNodes.unshift({
                "path": root.activePath,
                "title": (window.activeNote.name || "").replace(/\.md$/i, ""),
                "layer": 0, "degree": 0
            });
        }

        // Subgraph edges: both endpoints kept.
        var subEdges = [];
        for (var k = 0; k < root._fullEdges.length; k++) {
            var e = root._fullEdges[k];
            if (keep[e.from] && keep[e.to]) subEdges.push(e);
        }

        for (var n = 0; n < subNodes.length; n++) {
            nodeModel.append({ "title": subNodes[n].title, "path": subNodes[n].path,
                               "layer": subNodes[n].layer, "degree": subNodes[n].degree || 0 });
        }
        sim.init(subNodes, subEdges);
    }

    // Eased framing identical in spirit to GraphView.fitToView, with a tighter
    // pad for the small box.
    readonly property real fitEase: 0.2
    function fitToView() {
        if (nodeModel.count === 0) return;
        if (root.width <= 0 || root.height <= 0) return;

        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, count = 0;
        for (var i = 0; i < nodeModel.count; i++) {
            var x = sim.getNodeXAt(i), y = sim.getNodeYAt(i);
            if (!isFinite(x) || !isFinite(y)) continue;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            count++;
        }
        if (count === 0) return;

        var pad = 60;
        var contentW = Math.max(1, (maxX - minX) + pad * 2);
        var contentH = Math.max(1, (maxY - minY) + pad * 2);
        var z = Math.min(root.width / contentW, root.height / contentH);
        z = Math.max(root.minZoom, Math.min(z, 1.0));

        var cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
        var targetPanX = root.width / 2 - cx * z;
        var targetPanY = root.height / 2 - cy * z;

        var e = root.fitEase;
        root.zoomFactor += (z - root.zoomFactor) * e;
        root.panX += (targetPanX - root.panX) * e;
        root.panY += (targetPanY - root.panY) * e;
        if (Math.abs(z - root.zoomFactor) < 0.0005) root.zoomFactor = z;
        if (Math.abs(targetPanX - root.panX) < 0.5) root.panX = targetPanX;
        if (Math.abs(targetPanY - root.panY) < 0.5) root.panY = targetPanY;
    }
}
