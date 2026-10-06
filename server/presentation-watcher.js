// server/presentation-watcher.js — watches the presentations folder and keeps the library live.
// createPresentationWatcher({ presentationsDir, index, send, debounceMs }) -> { start(), close() }
//   - markdown add/change/unlink: debounced batch -> index.safeGenerate(), then HMR custom events
//     `reload-presentations` {slug, mdFile} per file and one `presentations-index-updated` {changes}
//   - <slug>/ folder removed: same batch, with mdFile null
//   - *.json under _media: index.generateMediaIndex() + `reload-media` {filePath}
// `send(payload)` delivers a Vite HMR payload (server.ws.send in production, a spy in tests).
// Last-seen content hash per markdown file: cloud-sync clients often touch files (mtime/attributes)
// without changing them; those events are dropped so they do not trigger rebuilds or reloads.
// close() stops chokidar and any pending timers. Created by vite.plugins.js (configureServer).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { toPosixPath } = require('./presentation-index');

const DEFAULT_DEBOUNCE_MS = 1200;

function createPresentationWatcher({
  presentationsDir,
  index,
  send,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  chokidar = require('chokidar')
}) {
  let watcher = null;
  let seedHandle = null;
  let mdRebuildDebounceTimer = null;
  const pendingMdReloads = new Map();
  const mdContentHashes = new Map();

  const hashFileContent = (filePath) => {
    try {
      return crypto.createHash('sha1').update(fs.readFileSync(filePath)).digest('hex');
    } catch {
      return null;
    }
  };

  const seedMdContentHashes = (dir, depth = 0) => {
    if (depth > 5) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        seedMdContentHashes(fullPath, depth + 1);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const hash = hashFileContent(fullPath);
        if (hash) mdContentHashes.set(toPosixPath(path.relative(presentationsDir, fullPath)), hash);
      }
    }
  };

  const flushMdRebuild = () => {
    mdRebuildDebounceTimer = null;
    if (!pendingMdReloads.size) return;

    index.safeGenerate('watcher:md-batch');
    const pending = Array.from(pendingMdReloads.values());
    pendingMdReloads.clear();

    for (const item of pending) {
      if (!item.mdFile) continue;
      console.log(`Triggering reload-presentations for slug: ${item.slug}, md: ${item.mdFile}`);
      send({
        type: 'custom',
        event: 'reload-presentations',
        data: { slug: item.slug, mdFile: item.mdFile }
      });
    }

    // One batched notice per rebuild, so the presentation list can soft-refresh
    // once instead of reacting to every file.
    send({
      type: 'custom',
      event: 'presentations-index-updated',
      data: { changes: pending }
    });
  };

  const scheduleMdRebuild = () => {
    if (mdRebuildDebounceTimer) {
      clearTimeout(mdRebuildDebounceTimer);
    }
    mdRebuildDebounceTimer = setTimeout(flushMdRebuild, debounceMs);
    if (typeof mdRebuildDebounceTimer.unref === 'function') {
      mdRebuildDebounceTimer.unref();
    }
  };

  const queueMdReload = (event, filePath) => {
    const relative = toPosixPath(path.relative(presentationsDir, filePath));
    const [slug, ...rest] = relative.split('/');
    if (!slug || !rest.length) return;
    if (event === 'unlink') {
      mdContentHashes.delete(relative);
    } else {
      const hash = hashFileContent(filePath);
      if (hash && mdContentHashes.get(relative) === hash) return;
      if (hash) mdContentHashes.set(relative, hash);
    }
    console.log(`📦 ${event.toUpperCase()}:`, filePath);
    const mdFile = rest.join('/');
    pendingMdReloads.set(relative, { slug, mdFile, event });
    scheduleMdRebuild();
  };

  const triggerReload = (event, filePath) => {
    if (filePath.endsWith('.md') && filePath.includes(presentationsDir)) {
      queueMdReload(event, filePath);
    }

    if (filePath.endsWith('.json') && filePath.includes('_media')) {
      console.log(`🧩 ${event.toUpperCase()}: Media JSON changed →`, filePath);
      index.generateMediaIndex();

      send({
        type: 'custom',
        event: 'reload-media',
        data: { filePath }
      });
    }
  };

  function start() {
    if (watcher) return;
    watcher = chokidar.watch(presentationsDir, {
      ignored: /(^|[/\\])\../, // Ignore dotfiles
      persistent: true,
      ignoreInitial: true,
      depth: 5
    });

    seedHandle = setImmediate(() => seedMdContentHashes(presentationsDir));

    watcher
      .on('add', (filePath) => triggerReload('add', filePath))
      .on('change', (filePath) => triggerReload('change', filePath))
      .on('unlink', (filePath) => triggerReload('unlink', filePath))
      // addDir is not handled: creating the .md file also triggers 'add', and handling both
      // sets up a race on the index rebuild.
      .on('unlinkDir', (dirPath) => {
        if (dirPath.includes(presentationsDir)) {
          console.log('📁 Folder deleted:', dirPath);
          const relative = toPosixPath(path.relative(presentationsDir, dirPath));
          const [slug] = relative.split('/');
          if (!slug || slug === '..') return;
          for (const key of mdContentHashes.keys()) {
            if (key.startsWith(`${relative}/`)) mdContentHashes.delete(key);
          }
          pendingMdReloads.set(`${relative}/`, { slug, mdFile: null, event: 'unlinkDir' });
          scheduleMdRebuild();
        }
      });
  }

  async function close() {
    if (seedHandle) clearImmediate(seedHandle);
    seedHandle = null;
    if (mdRebuildDebounceTimer) clearTimeout(mdRebuildDebounceTimer);
    mdRebuildDebounceTimer = null;
    pendingMdReloads.clear();
    const active = watcher;
    watcher = null;
    if (active) await active.close();
  }

  return { start, close };
}

module.exports = { createPresentationWatcher, DEFAULT_DEBOUNCE_MS };
