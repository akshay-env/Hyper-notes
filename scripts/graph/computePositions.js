.pragma library

// Compute ring-based x/y positions for all nodes in graphData.
// Layer 0 sits at (centerX, centerY), each successive layer sits in a wider ring.
// Modifies graphData.nodes in-place, adding .x and .y to each node.
// Returns the mutated graphData.
function computePositions(graphData, centerX, centerY) {
    let layerMap = {};
    for (let i = 0; i < graphData.nodes.length; i++) {
        let n = graphData.nodes[i];
        if (!(n.layer in layerMap)) layerMap[n.layer] = [];
        layerMap[n.layer].push(i);
    }

    let layerRadii = [0, 180, 340, 480, 600, 720];
    let isolatedRadius = 860;

    for (let layer in layerMap) {
        let indices = layerMap[layer];
        let count = indices.length;
        let radius = parseInt(layer) === 999
            ? isolatedRadius
            : (parseInt(layer) < layerRadii.length ? layerRadii[parseInt(layer)] : 720);

        for (let i = 0; i < count; i++) {
            let angle = count === 1 ? -Math.PI / 2 : (2 * Math.PI * i / count) - Math.PI / 2;
            let jitter = (Math.random() - 0.5) * 28;
            graphData.nodes[indices[i]].x = centerX + (radius + jitter) * Math.cos(angle);
            graphData.nodes[indices[i]].y = centerY + (radius + jitter) * Math.sin(angle);
        }
    }

    return graphData;
}
