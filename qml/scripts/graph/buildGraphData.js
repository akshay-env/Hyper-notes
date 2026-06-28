.pragma library
.import "./flattenNotes.js" as FlattenNotes
.import "./extractLinks.js" as ExtractLinks
.import "./buildGlobalGraph.js" as GlobalGraph
.import "./calculateLayers.js" as CalculateLayers

// Level 1 Orchestrator: Combines atomic blocks to build global graph data
function buildGraphData(window, vaultFs) {
    // 1. Flatten
    let allNotes = [];
    FlattenNotes.flattenNotes(window.vaultTree, allNotes);

    let titleToNode = {};
    for (let i = 0; i < allNotes.length; i++) {
        titleToNode[allNotes[i].name.replace(/\.md$/i, "")] = allNotes[i];
    }

    // 2. Extract outLinks
    let outLinks = {};
    for (let i = 0; i < allNotes.length; i++) {
        outLinks[allNotes[i].path] = ExtractLinks.extractLinks(vaultFs.readFile(allNotes[i].path));
    }

    // 3. Extract the Global Graph (every node and every link)
    let graphData = GlobalGraph.buildGlobalGraph(allNotes, outLinks, titleToNode);

    // 4. Run BFS purely to calculate visual layers relative to the active note
    let startPath = (window.activeNote && window.activeNote.path) ? window.activeNote.path : "";
    CalculateLayers.calculateLayers(startPath, graphData.nodes, graphData.edges);

    return { nodes: graphData.nodes, edges: graphData.edges };
}
