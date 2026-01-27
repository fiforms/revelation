    const path = require('path');
    const fs = require('fs');

    const src = path.resolve(__dirname, '../css/fonts');
    const dest = path.resolve(__dirname, '../dist/css/fonts');

    // Skip if already copied
    if (fs.existsSync(dest)) return;

    // Recursively copy
    copyRecursiveSync(src, dest);
    console.log('📁 Copied Reveal.js fonts to dist/css/fonts');

    // Helper: Recursive copy
    function copyRecursiveSync(src, dest) {
      if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    
      for (const item of fs.readdirSync(src)) {
        const srcPath = path.join(src, item);
        const destPath = path.join(dest, item);
    
        if (fs.lstatSync(srcPath).isDirectory()) {
          copyRecursiveSync(srcPath, destPath);
        } else {
          fs.copyFileSync(srcPath, destPath);
        }
      }
    }