.pragma library

// Extracts all neighbor node paths for a given node path
// Returns an array of paths
function getNeighbors(edges, path) {
    let neighbors = [];
    if (!edges) return neighbors;
    
    for (let i = 0; i < edges.length; i++) {
        if (edges[i].from === path) neighbors.push(edges[i].to);
        if (edges[i].to === path) neighbors.push(edges[i].from);
    }
    return neighbors;
}
