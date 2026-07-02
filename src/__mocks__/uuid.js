// CJS shim for uuid v13 (pure ESM) — used only during Jest test runs
let _counter = 0;

function v4() {
  _counter++;
  // Return a deterministic but unique UUID-shaped string
  const hex = (_counter + Date.now()).toString(16).padStart(32, '0');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    '4' + hex.slice(13, 16),
    (parseInt(hex[16], 16) & 0x3 | 0x8).toString(16) + hex.slice(17, 20),
    hex.slice(20, 32),
  ].join('-');
}

module.exports = { v4 };
module.exports.v4 = v4;
