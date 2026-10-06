// LEGACY / unused: no npm script or code references this. It copies reveal-remote.js.default
// over the git-ignored reveal-remote.js. In the Electron app reveal-remote.js is generated at
// startup by the wrapper's lib/serverManager.js; in a bare `npm run dev` checkout nothing
// generates it, so presentation.html's <script src="/reveal-remote.js"> 404s (remote disabled)
// unless you run this by hand.
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
