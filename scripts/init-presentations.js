// scripts/init-presentations.js
const fs = require('fs');
const path = require('path');

const baseDir = path.resolve(__dirname, '..');
const prefix = 'presentations_';
const templateReadme = path.join(baseDir, 'templates', 'readme');

function generateKey(length = 10) {
  return [...Array(length)].map(() => Math.random().toString(36)[2]).join('');
}

function getExistingPresentationFolder() {
  const match = fs.readdirSync(baseDir).find(name =>
    fs.statSync(path.join(baseDir, name)).isDirectory() && name.startsWith(prefix)
  );
  return match || null;
}

function copyRecursiveSync(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const item of fs.readdirSync(src)) {
    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);
    if (fs.statSync(srcPath).isDirectory()) {
      copyRecursiveSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function main() {
  let folderName = getExistingPresentationFolder();

  if (folderName) {
    console.log(`📁 Presentations folder exists: ${folderName}`);
  } else {
    const key = generateKey();
    folderName = `${prefix}${key}`;
    fs.mkdirSync(path.join(baseDir, folderName));
    console.log(`✅ Created presentations folder: ${folderName}`);
  }

  const destReadmePath = path.join(baseDir, folderName, 'readme');

  if (fs.existsSync(templateReadme) && !fs.existsSync(destReadmePath)) {
    copyRecursiveSync(templateReadme, destReadmePath);
    console.log(`📄 Copied template readme → ${folderName}/readme`);
  } else if (!fs.existsSync(templateReadme)) {
    console.warn('⚠️ templates/readme not found. Skipping copy.');
  } else {
    console.log('ℹ️ Readme folder already exists in target. Skipping copy.');
  }
}

main();

