.pragma library

// Extracts all nodes and edges from the entire vault unconditionally
function buildGlobalGraph(allNotes, outLinks, titleToNode) {
    let graphNodes = [];
    let graphEdges = [];

    // 1. Add ALL nodes with a default layer (infinity)
    for (let i = 0; i < allNotes.length; i++) {
        let n = allNotes[i];
        graphNodes.push({
            id: n.path,
            title: n.name.replace(/\.md$/i, ""),
            path: n.path,
            layer: 999 
        });
    }

    // 2. Add ALL valid edges
    for (let i = 0; i < allNotes.length; i++) {
        let nodePath = allNotes[i].path;
        let outgoing = outLinks[nodePath] || [];
        for (let j = 0; j < outgoing.length; j++) {
            let targetNode = titleToNode[outgoing[j]];
            if (targetNode) {
                graphEdges.push({ from: nodePath, to: targetNode.path });
            }
        }
    }

    // 3. Tally each node's degree (inbound + outbound links). Drives the
    //    Obsidian-style size scaling in GraphNode.qml so hub notes look bigger.
    let degree = {};
    for (let i = 0; i < graphEdges.length; i++) {
        degree[graphEdges[i].from] = (degree[graphEdges[i].from] || 0) + 1;
        degree[graphEdges[i].to]   = (degree[graphEdges[i].to]   || 0) + 1;
    }
    for (let i = 0; i < graphNodes.length; i++) {
        graphNodes[i].degree = degree[graphNodes[i].id] || 0;
    }

    return { nodes: graphNodes, edges: graphEdges };
}
