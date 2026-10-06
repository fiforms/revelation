// scripts/fetch-oldcss.js
// Downloads the legacy theme CSS snapshots (assets/oldcss/<version>/, served at /oldcss/<version>/;
// see CSS_VERSION_SNAPSHOTS in js/compiler/compiler-utils.js) from the remote CDN using a manifest.
// The folder is git-ignored, so a fresh checkout needs this. Files already present are skipped;
// downloads go to a .part file first so an interrupted run can't leave a truncated file behind.
//
// Callers: this package's `postinstall` (`--soft`), `npm run fetch-oldcss`, and from the wrapper
// repo scripts/postinstall.js, scripts/fetch-blobs.js and the `build` script.
// Modes: run directly it exits non-zero on failure (right for packaging builds). With `--soft`
// (postinstall) it only warns, so being offline never fails `npm install`, and it honours
// SKIP_BLOBS=true|1. Importing it never runs anything: use `main()`.
const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE = 'https://www.pastordaniel.net/bigmedia/revelation/oldcss';
const MANIFEST_URL = `${BASE}/manifest.json`;
const OUTDIR = path.join(__dirname, '..', 'assets', 'oldcss');
// Snapshots the compiler needs; if all are present and non-empty the manifest fetch is skipped.
const REQUIRED_SNAPSHOTS = ['1.0.6'];

function snapshotsPresent() {
  return REQUIRED_SNAPSHOTS.every(version => {
    const dir = path.join(OUTDIR, version);
    return fs.existsSync(dir) && fs.readdirSync(dir).length > 0;
  });
}

async function main() {
  if (snapshotsPresent()) {
    console.log('✓ oldcss already present, skipping fetch.');
    return true;
  }

  console.log('📋 Fetching oldcss manifest…');
  let manifest;
  try {
    manifest = JSON.parse(await fetchText(MANIFEST_URL));
  } catch (e) {
    console.error(`✗ Could not fetch manifest: ${e.message}`);
    return false;
  }

  if (!Array.isArray(manifest) || manifest.length === 0) {
    console.warn('⚠️ Manifest is empty or invalid, skipping.');
    return false;
  }

  fs.mkdirSync(OUTDIR, { recursive: true });

  let fetched = 0;
  let skipped = 0;
  let failed = 0;

  for (const relPath of manifest) {
    const dest = path.join(OUTDIR, relPath);
    if (fs.existsSync(dest)) {
      skipped++;
      continue;
    }

    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const url = `${BASE}/${relPath}`;
    console.log(`📥 ${relPath}`);
    try {
      await downloadFile(url, dest);
      fetched++;
    } catch (e) {
      failed++;
      console.warn(`⚠️ Failed ${relPath}: ${e.message}`);
    }
  }

  console.log(`✓ oldcss: ${fetched} downloaded, ${skipped} already present${failed ? `, ${failed} FAILED` : ''}.`);
  return failed === 0;
}

function fetchText(url, redirectDepth = 0) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectDepth < 3) {
        fetchText(res.headers.location, redirectDepth + 1).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error('HTTP ' + res.statusCode));
        return;
      }
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
  });
}

// Downloads to <dest>.part and renames on success.
function downloadFile(url, dest) {
  const part = `${dest}.part`;
  return downloadTo(url, part).then(
    () => fs.promises.rename(part, dest),
    err => { fs.rmSync(part, { force: true }); throw err; }
  );
}

function downloadTo(url, dest, redirectDepth = 0) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const req = https.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectDepth < 3) {
        file.close(() => fs.unlink(dest, () => {
          downloadTo(res.headers.location, dest, redirectDepth + 1).then(resolve).catch(reject);
        }));
        return;
      }
      if (res.statusCode !== 200) {
        file.close(() => fs.unlink(dest, () => reject(new Error('HTTP ' + res.statusCode))));
        return;
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    });
    req.on('error', err => {
      file.close(() => fs.unlink(dest, () => reject(err)));
    });
  });
}

module.exports = { main };

if (require.main === module) {
  const soft = process.argv.includes('--soft');
  if (soft && (process.env.SKIP_BLOBS === 'true' || process.env.SKIP_BLOBS === '1')) {
    console.log('⏭️  SKIP_BLOBS is set, skipping oldcss download (run: npm run fetch-oldcss).');
  } else {
    main().then(ok => {
      if (!ok && !soft) process.exitCode = 1;
      if (!ok && soft) console.warn('⚠️ oldcss not fully downloaded; run `npm run fetch-oldcss` when online. Decks without a version need it.');
    }).catch(err => {
      console.warn(`⚠️ oldcss fetch failed: ${err.message}`);
      if (!soft) process.exitCode = 1;
    });
  }
}
