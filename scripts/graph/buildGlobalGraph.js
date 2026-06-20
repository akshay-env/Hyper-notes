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

    return { nodes: graphNodes, edges: graphEdges };
}
