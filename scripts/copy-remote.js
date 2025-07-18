// scripts/copy-remote.js
const fs = require('fs');
const path = require('path');

const src = path.resolve(__dirname, '../reveal-remote.js.default');
const dest = path.resolve(__dirname, '../reveal-remote.js');

try {
  fs.copyFileSync(src, dest);
  console.log(`✅ Copied ${path.basename(src)} → ${path.basename(dest)}`);
} catch (err) {
  console.error(`❌ Failed to copy: ${err.message}`);
  process.exit(1);
}
