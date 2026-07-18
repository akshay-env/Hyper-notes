const fs = require('fs');
const content = fs.readFileSync('Reference Code/app.js', 'utf8');
console.log('WebGL:', content.includes('WebGL'));
console.log('PIXI:', content.includes('PIXI'));
console.log('CanvasRenderingContext2D:', content.includes('CanvasRenderingContext2D'));
console.log('getContext("2d"):', content.includes('getContext("2d")'));
console.log('CodeMirror:', content.includes('CodeMirror'));
console.log('ProseMirror:', content.includes('ProseMirror'));
