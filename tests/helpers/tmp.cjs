// Temp-directory helpers for the unit tests.
const fs = require('fs');
const os = require('os');
const path = require('path');

function tmpDir(prefix = 'revelation-unit-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeTree(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const target = path.join(root, ...rel.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  return root;
}

const remove = (dir) => fs.rmSync(dir, { recursive: true, force: true });

module.exports = { tmpDir, writeTree, remove };
