// scripts/init-presentations.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const prefix = 'presentations_';

// The folder suffix is the server access key: it gates /presentations_<key>/,
// /plugins_<key>/ and /thumbs_<key>/, so it must come from a CSPRNG rather than
// Math.random(). See doc/SECURITY.md (F1). Hex keeps the name in the same
// lowercase-alphanumeric class the old base36 keys used.
function generateKey(bytes = 8) {
  return crypto.randomBytes(bytes).toString('hex');
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
  console.log(`baseDirParameter: ${baseDirParameter}`);
  console.log(`folderNameParameter: ${folderNameParameter}`);
  let baseDir = baseDirParameter;
  if(baseDir === false) {
    baseDir = path.resolve(__dirname, '..');
  }
  let folderName = folderNameParameter;
  
  if(!folderName) {
    folderName = getExistingPresentationFolder(baseDir);
  }
  
  if (folderName && fs.existsSync(folderName)) {
    console.log(`📁 Presentations folder exists: ${folderName}`);
  } else {
    const key = generateKey();
    folderName = folderNameParameter ? folderNameParameter : `${prefix}${key}`;
    fs.mkdirSync(path.join(baseDir, folderName));
    console.log(`✅ Created presentations folder: ${folderName}`);
    const mediaFolder = path.join(baseDir, folderName, '_media');
    if (!fs.existsSync(mediaFolder)) {
      fs.mkdirSync(mediaFolder, { recursive: true });
      console.log(`📁 Created _media folder inside ${folderName}`);
    }
  }

  const destReadmePath = path.join(baseDir, folderName);

  copyReadmeTemplate(destReadmePath);

  return folderName;
}

function copyReadmeTemplate(destDir) {
    const templateReadme = path.join(__dirname,'..', 'templates', 'readme');
    const destReadmePath = path.join(destDir, 'readme');
    if (fs.existsSync(templateReadme) && !fs.existsSync(destReadmePath)) {
        copyRecursiveSync(templateReadme, destReadmePath);
        console.log(`📄 Copied template readme → ${destDir}/readme`);
    } else if (!fs.existsSync(templateReadme)) {
        console.warn('⚠️ templates/readme not found. Skipping copy.');
    } else {
        console.log('ℹ️ Readme folder already exists in target. Skipping copy.');
    }
}

if (require.main === module) {
  main();
}

module.exports = { main, copyReadmeTemplate };
