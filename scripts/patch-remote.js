// scripts/patch-remote.js
const fs = require('fs');
const path = require('path');

const remotePath = path.resolve(__dirname, '../node_modules/reveal.js-remote/plugin/remote.js');

if (!fs.existsSync(remotePath)) {
  console.error('❌ remote.js not found. Has reveal.js-remote been installed?');
  process.exit(1);
}

let content = fs.readFileSync(remotePath, 'utf8');
const original = `import {io} from "../../socket.io/socket.io.esm.min.js";`;
const replacement = `import { io } from "socket.io-client";`;

if (content.includes(original)) {
  content = content.replace(original, replacement);
  fs.writeFileSync(remotePath, content, 'utf8');
  console.log('✅ Patched remote.js to use socket.io-client from NPM.');
} else if (content.includes(replacement)) {
  console.log('ℹ️ remote.js already patched.');
} else {
  console.warn('⚠️ Unrecognized import line in remote.js. Manual review recommended.');
}

// Patch server/index.js
const serverPath = path.resolve(__dirname, '../node_modules/reveal.js-remote/server/index.js');

if (fs.existsSync(serverPath)) {
  let content = fs.readFileSync(serverPath, 'utf8');

  const patchMarker = '// Patched_RevealJSPResentation1.0';
  if (content.includes(patchMarker)) {
    console.log('ℹ️ server/index.js already patched.');
  } else {
    // Add patch marker at the top
    content = patchMarker + '\n' + content;

    // Replace static path to use correct server-ui location
    content = content.replace(
      /app\.use\(prefix \+ "_remote\/", express\.static\(__dirname \+ "\/static"\)\);/,
      `app.use(prefix + "_remote/ui/", express.static(path.resolve(__dirname, "../server-ui")));`
    );

    // 🔧 Fix invalid CORS handling in Socket.IO setup
    content = content.replace(
      "origin: (args.origin === '*') ? true : args.origin.split(/\\s*,\\s/)",
      "origin: (args.origin === '*') ? '*' : args.origin.split(/\\s*,\\s/)"
    );


    // Replace single app.get(prefix...) with full folder-routing logic
    content = content.replace(
      /app\.get\(prefix, \(_req, res\) => index\(res, args\.presentationpath\)\);/,
      `// Automatically serve subdirectories as presentations
app.get(prefix + '*', (req, res, next) => {
  const fullPath = path.join(args.presentationpath, req.path);
  fs.stat(fullPath, (err, stats) => {
    if (!err && stats.isDirectory()) {
      const indexFile = path.join(fullPath, 'index.html');
      fs.access(indexFile, fs.constants.F_OK, (err) => {
        if (!err) {
          res.sendFile(indexFile);
        } else {
          next();
        }
      });
    } else {
      next();
    }
  });
});`
    );

    fs.writeFileSync(serverPath, content, 'utf8');
    console.log('✅ Patched server/index.js for reveal.js-remote UI and folder routing.');
  }
} else {
  console.warn('⚠️ server/index.js not found.');
}
