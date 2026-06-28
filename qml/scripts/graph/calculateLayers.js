.pragma library

// Rapid BFS over the global edge list to compute visual distances (layers) from the active note
function calculateLayers(startPath, graphNodes, graphEdges) {
    if (startPath === "") return;

    // 1. Build an adjacency list (bidirectional for visual blooming)
    let adjList = {};
    for (let i = 0; i < graphEdges.length; i++) {
        let u = graphEdges[i].from;
        let v = graphEdges[i].to;
        if (!adjList[u]) adjList[u] = [];
        if (!adjList[v]) adjList[v] = [];
        adjList[u].push(v);
        adjList[v].push(u); 
    }

    // 2. BFS
    let visited = {};
    let queue = [{ path: startPath, layer: 0 }];
    visited[startPath] = 0;

    let head = 0;
    while (head < queue.length) {
        let item = queue[head++];
        let currPath = item.path;
        let layer = item.layer;

        let neighbors = adjList[currPath] || [];
        for (let i = 0; i < neighbors.length; i++) {
            let nPath = neighbors[i];
            if (!(nPath in visited)) {
                visited[nPath] = layer + 1;
                queue.push({ path: nPath, layer: layer + 1 });
            }
        }
    }

    // 3. Apply layers to nodes
    for (let i = 0; i < graphNodes.length; i++) {
        if (graphNodes[i].path in visited) {
            graphNodes[i].layer = visited[graphNodes[i].path];
        }
    }
}
