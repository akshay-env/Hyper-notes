const fs = require('fs');
const sim = fs.readFileSync('Reference Code/sim.js', 'utf8');
const match = sim.match(/(['"])(AGFzbQE.*?)\1/);
if (match) {
  const b64 = match[2];
  fs.writeFileSync('src/graph/physics.wasm', Buffer.from(b64, 'base64'));
  console.log('Extracted physics.wasm, length:', Buffer.from(b64, 'base64').length);
} else {
  console.log('Base64 not found');
}
