.pragma library

// Extract all [[Link Title]] references from a markdown text string
// Returns an array of link title strings
function extractLinks(text) {
    let links = [];
    let regex = /\[\[([^\]]+)\]\]/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
        links.push(match[1].trim());
    }
    return links;
}
