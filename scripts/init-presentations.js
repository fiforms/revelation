// scripts/init-presentations.js
const fs = require('fs');
const path = require('path');

const prefix = 'presentations_';

function generateKey(length = 10) {
  return [...Array(length)].map(() => Math.random().toString(36)[2]).join('');
}

function getExistingPresentationFolder(baseDir) {
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

function main(baseDirParameter = false, folderNameParameter = false) {
  let baseDir = baseDirParameter;
  if(baseDir === false) {
    baseDir = path.resolve(__dirname, '..');
  }
  const templateReadme = path.join(__dirname,'..', 'templates', 'readme');
  let folderName = folderNameParameter;
  
  if(!folderName) {
    folderName = getExistingPresentationFolder(baseDir);
  }
  
  if (folderName) {
    console.log(`📁 Presentations folder exists: ${folderName}`);
  } else {
    const key = generateKey();
    folderName = `${prefix}${key}`;
    fs.mkdirSync(path.join(baseDir, folderName));
    console.log(`✅ Created presentations folder: ${folderName}`);
    const mediaFolder = path.join(baseDir, folderName, '_media');
    if (!fs.existsSync(mediaFolder)) {
      fs.mkdirSync(mediaFolder, { recursive: true });
      console.log(`📁 Created _media folder inside ${folderName}`);
    }
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
  return folderName;
}

if (require.main === module) {
  main();
}

module.exports = { main };
