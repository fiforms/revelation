// server/presentation-index.js — the presentation library index (index.json) and the media index.
// createPresentationIndex(config) returns { buildEntries, generate, safeGenerate, generateMediaIndex }:
//   buildEntries()      walks <presentations>/<slug>/**.md and returns the index entries (no writes;
//                       null if the folder cannot be listed). Skips dotfiles, _current_open, lock/temp
//                       entries and `alternatives: hidden`. Malformed YAML gives a "{malformed YAML}"
//                       placeholder entry instead of dropping the file.
//   generate()          outside GUI mode first refreshes the README deck, then writes index.json
//                       (config.outputFile: the userData cache in GUI mode, else the presentations dir)
//   safeGenerate(ctx)   generate() that logs instead of throwing
//   generateMediaIndex() rebuilds <presentations>/_media/index.json from the *.json sidecar files
// createIndexRoute(config) is the GUI-mode middleware that serves the cached index at
// <presentationsWebPath>/index.json (`[]` while the cache is transiently missing).
// Consumers: js/presentationlist.js (library list), js/media-core.js (media index).
// Front-matter rule matches extractFrontMatter() in js/compiler/markdown-compiler.js.
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// Throws on malformed YAML.
function readFrontMatterData(md) {
  const match = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return {};
  // loadAll() yields [] for an empty/comment-only block, where load() throws in js-yaml 5.
  const [data] = yaml.loadAll(match[1]);
  return data && typeof data === 'object' ? data : {};
}

function toPosixPath(value) {
  return String(value || '').replace(/\\/g, '/');
}

function normalizeCreatedField(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return '';
}

function toTimestamp(value) {
  const parsed = Date.parse(String(value || ''));
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function deriveThumbnailName(mdFile) {
  const basename = path.basename(mdFile, path.extname(mdFile));
  return `${basename}.thumb.jpg`;
}

function isTransientFsError(err) {
  const code = String(err?.code || '');
  return code === 'ENOENT' || code === 'ENOTDIR' || code === 'ESTALE';
}

function isLegacyLockOrTempEntry(name) {
  if (typeof name !== 'string') return false;
  const lower = name.toLowerCase();
  return (
    lower.endsWith('.lock') ||
    lower.includes('.lock.~') ||
    lower.startsWith('lock_')
  );
}

function isHiddenAlternativeMetadata(data) {
  if (!data) return false;
  if (String(data.alternatives || '').trim().toLowerCase() === 'hidden') return true;
  if (data.alternatives && typeof data.alternatives === 'object' && !Array.isArray(data.alternatives)) {
    return String(data.alternatives.self || '').trim().toLowerCase() === 'hidden';
  }
  return false;
}

function collectMarkdownFilesRecursive(rootDir) {
  const files = [];
  const walk = (dirPath, relDir = '') => {
    let entries = [];
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch (err) {
      if (!isTransientFsError(err)) {
        console.warn(`⚠ Failed to list markdown directory ${dirPath}: ${err.message}`);
      }
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const absPath = path.join(dirPath, entry.name);
      const relPath = relDir ? path.posix.join(relDir, entry.name) : entry.name;
      if (entry.isDirectory()) {
        walk(absPath, relPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!entry.name.toLowerCase().endsWith('.md')) continue;
      if (entry.name === '__builder_temp.md') continue;
      files.push(relPath);
    }
  };
  walk(rootDir);
  files.sort((a, b) => a.localeCompare(b));
  return files;
}

// Helper: copy a template folder, only overwriting the named files.
function copyTemplateRecursiveSync(src, dest, overwriteNames = new Set()) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });

  for (const item of fs.readdirSync(src)) {
    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);

    if (fs.lstatSync(srcPath).isDirectory()) {
      copyTemplateRecursiveSync(srcPath, destPath, overwriteNames);
    } else if (overwriteNames.has(item) || !fs.existsSync(destPath)) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function createPresentationIndex(config) {
  const { presentationsDir, outputFile, isGuiMode, rootDir } = config;

  // README deck: outside GUI mode the server regenerates <presentations>/readme/presentation.md
  // from header.yaml + README.md + doc/REFERENCE.md whenever README.md is newer (GUI mode: the
  // wrapper builds its own docs deck instead).
  const readmePresDir = path.join(presentationsDir, 'readme');
  const readmePresentationPath = path.join(readmePresDir, 'presentation.md');
  const readmeYamlPath = path.join(readmePresDir, 'header.yaml');
  const readmeTemplatePath = path.resolve(rootDir, 'templates/readme');
  const projectReadmePath = path.resolve(rootDir, 'README.md');
  const referencePath = path.resolve(rootDir, 'doc/REFERENCE.md');

  function ensureReadmeTemplate() {
    if (!fs.existsSync(readmeTemplatePath)) {
      console.warn(`⚠️ README template folder missing: ${readmeTemplatePath}`);
      return;
    }
    copyTemplateRecursiveSync(readmeTemplatePath, readmePresDir, new Set(['header.yaml']));
  }

  function refreshReadmeDeck() {
    ensureReadmeTemplate();

    if (fs.existsSync(readmeYamlPath) && fs.existsSync(projectReadmePath)) {
      const shouldGenerate =
        !fs.existsSync(readmePresentationPath) ||
        fs.statSync(readmePresentationPath).mtime < fs.statSync(projectReadmePath).mtime;

      if (shouldGenerate) {
        const header = fs.readFileSync(readmeYamlPath, 'utf-8');
        const body = fs.readFileSync(projectReadmePath, 'utf-8');

        let combined = `${header}\n\n${body}`;
        if (fs.existsSync(referencePath)) {
          const reference = fs.readFileSync(referencePath, 'utf-8');
          combined += `\n\n***\n\n${reference}`;
        }

        fs.writeFileSync(readmePresentationPath, combined, 'utf-8');
        console.log(`📝 Regenerated ${readmePresentationPath}`);
      }
    }
  }

  function buildEntries() {
    let topLevelEntries = [];
    try {
      topLevelEntries = fs.readdirSync(presentationsDir);
    } catch (err) {
      console.warn(`⚠ Failed to list presentations dir ${presentationsDir}: ${err.message}`);
      return null;
    }
    const dirs = topLevelEntries.filter((dir) => {
      if (!dir || dir.startsWith('.')) return false;
      // Transient read-only copy of a .revel file opened from the OS; never listed in the library.
      if (dir === '_current_open') return false;
      if (isLegacyLockOrTempEntry(dir)) return false;
      try {
        return fs.lstatSync(path.join(presentationsDir, dir)).isDirectory();
      } catch (err) {
        if (!isTransientFsError(err)) {
          console.warn(`⚠ Failed to inspect presentation entry ${dir}: ${err.message}`);
        }
        return false;
      }
    });

    const indexData = [];

    dirs.forEach((dir) => {
      const folderPath = path.join(presentationsDir, dir);
      const files = collectMarkdownFilesRecursive(folderPath);

      files.forEach((mdFile) => {
        const mdPath = path.join(folderPath, mdFile);
        let fileContent = '';
        let stats = null;
        try {
          fileContent = fs.readFileSync(mdPath, 'utf-8');
          stats = fs.statSync(mdPath);
        } catch (err) {
          if (!isTransientFsError(err)) {
            console.warn(`⚠ Failed to read ${mdPath}: ${err.message}`);
          }
          return;
        }

        let data;
        try {
          // Attempt to read YAML front matter
          data = readFrontMatterData(fileContent);
        } catch (err) {
          console.error(`⚠ Malformed YAML in ${dir}/${mdFile}: ${err.message}`);

          // Fallback metadata when YAML is broken
          data = {
            title: "{malformed YAML}",
            description: err.message,
            thumbnail: deriveThumbnailName(mdFile),
            _malformed: true
          };
        }

        // Skip hidden alternatives
        if (isHiddenAlternativeMetadata(data)) {
          return;
        }

        const created = normalizeCreatedField(data.created);

        indexData.push({
          slug: dir,
          md: toPosixPath(mdFile),
          title: data.title || `${dir}/${mdFile}`,
          description: data.description || "",
          thumbnail: data.thumbnail || deriveThumbnailName(mdFile),
          created,
          createdTimestamp: toTimestamp(created),
          modified: stats.mtime.toISOString(),
          modifiedTimestamp: Number.isFinite(stats.mtimeMs) ? Math.round(stats.mtimeMs) : null,
          theme: data.theme || "",
          _malformed: data._malformed || false
        });
      });
    });

    return indexData;
  }

  function generate() {
    if (!isGuiMode) refreshReadmeDeck();
    const entries = buildEntries();
    if (!entries) return;
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, JSON.stringify(entries, null, 2), 'utf-8');
    console.log(`📄 presentations/index.json regenerated (${outputFile})`);
  }

  function safeGenerate(context = '') {
    try {
      generate();
    } catch (err) {
      console.error(`⚠ generatePresentationIndex failed${context ? ` (${context})` : ''}: ${err.message}`);
    }
  }

  function generateMediaIndex() {
    const mediaDir = path.join(presentationsDir, '_media');
    if (!fs.existsSync(mediaDir)) return;

    const files = fs.readdirSync(mediaDir).filter(f =>
      f.endsWith('.json') && f !== 'index.json'
    );

    const index = {};
    for (const file of files) {
      const fullPath = path.join(mediaDir, file);
      try {
        const data = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
        if (data?.large_variant?.filename) {
          const variantPath = path.join(mediaDir, data.large_variant.filename);
          data.large_variant_local = fs.existsSync(variantPath);
        }
        const key = path.basename(file, '.json');
        index[key] = data;
      } catch (e) {
        console.warn(`⚠️ Failed to parse ${file}: ${e.message}`);
      }
    }

    fs.writeFileSync(path.join(mediaDir, 'index.json'), JSON.stringify(index, null, 2));
    console.log(`📁 _media/index.json updated with ${Object.keys(index).length} entries`);
  }

  return { buildEntries, generate, safeGenerate, generateMediaIndex };
}

// GUI mode only: serve the userData index cache where the presentations index would be.
function createIndexRoute({ presentationsWebPath, outputFile }) {
  const indexRoutePath = `${presentationsWebPath}/index.json`;
  return (req, res, next) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(req.url || '', 'http://localhost');
    } catch (_err) {
      return next();
    }
    if (parsedUrl.pathname !== indexRoutePath) return next();
    try {
      const data = fs.readFileSync(outputFile, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(data);
    } catch (err) {
      if (isTransientFsError(err)) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end('[]');
        return;
      }
      next(err);
    }
  };
}

module.exports = {
  createPresentationIndex,
  createIndexRoute,
  readFrontMatterData,
  collectMarkdownFilesRecursive,
  isHiddenAlternativeMetadata,
  isLegacyLockOrTempEntry,
  isTransientFsError,
  normalizeCreatedField,
  toPosixPath
};
