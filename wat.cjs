const fs = require('fs');
const wabt = require('wabt')();

wabt.then(wabtModule => {
  try {
    const wasmBuffer = fs.readFileSync('src/graph/physics.wasm');
    const module = wabtModule.readWasm(wasmBuffer, { readDebugNames: true });
    module.generateNames();
    module.applyNames();
    const wat = module.toText({ foldExprs: false, inlineExport: false });
    fs.writeFileSync('src/graph/physics.wat', wat);
    console.log('Successfully generated physics.wat');
  } catch (e) {
    console.error(e);
  }
});
