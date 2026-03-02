const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const matter = require('gray-matter');
const ip = require('ip');
const serveStatic = require('serve-static');
const { Server } = require('socket.io');

const localIp = ip.address(); // Gets the LAN IP

const baseDir = __dirname;
const prefix = 'presentations_';
const PEER_SOCKET_PATH = '/peer-commands';
const PRESENTER_PLUGINS_SOCKET_PATH = '/presenter-plugins-socket';
let peerCommandIo = null;
let presenterPluginsIo = null;
const PIN_FAILURE_LIMIT = 3;
const PIN_BLOCK_MS = 60_000;
const peerPinFailures = new Map();
const PEER_EVENT_LIMIT = 200;
let peerEventSeq = 0;
const peerEventLog = [];
const peerActiveFollowers = new Map();
const peerSeenFollowers = new Map();

let presentationsWebPath = '';
let presentationsDir = '';
let key = '';
let customPath = false;
let pluginsDir = '';
let pluginsWebPath = '';

if(process.env.PRESENTATIONS_DIR_OVERRIDE && process.env.PRESENTATIONS_KEY_OVERRIDE) {
    presentationsDir = process.env.PRESENTATIONS_DIR_OVERRIDE;
    key = process.env.PRESENTATIONS_KEY_OVERRIDE;
    presentationsWebPath = `/${prefix}${key}`;
    customPath = true;
    pluginsDir = process.env.PLUGINS_DIR_OVERRIDE;
    pluginsWebPath = `/plugins_${key}`
}
else {
    const folderName = fs.readdirSync(baseDir).find(name =>
        fs.statSync(path.join(baseDir, name)).isDirectory() && name.startsWith(prefix)
    );
    if (!folderName) throw new Error('No presentations folder found');

    presentationsDir = path.join(baseDir, folderName); // full path
    key = folderName.replace(prefix, '');
    presentationsWebPath = `/${folderName}`;
}

const outputFile = path.join(presentationsDir, 'index.json');
const INDEX_LOCK_PREFIX = 'lock_';
const INDEX_LOCK_SUFFIX = '.lock';
const INDEX_LOCK_REFRESH_MS = 30 * 60 * 1000;
const INDEX_LOCK_STALE_MS = 2 * INDEX_LOCK_REFRESH_MS + (5 * 60 * 1000);
const indexLockId = buildIndexLockId();
const indexLockFileName = `${INDEX_LOCK_PREFIX}${indexLockId}${INDEX_LOCK_SUFFIX}`;
const indexLockPath = path.join(presentationsDir, indexLockFileName);
let indexLockRefreshTimer = null;
let indexLockShutdownHooksInstalled = false;

const readmePresDir = path.join(presentationsDir, 'readme');
const readmePresentationPath = path.join(readmePresDir, 'presentation.md');
const readmeYamlPath = path.join(readmePresDir, 'header.yaml');
const readmeTemplatePath = path.resolve(__dirname, 'templates/readme');
const projectReadmePath = path.resolve(__dirname, 'README.md');
const referencePath = path.resolve(__dirname, 'doc/REFERENCE.md');

function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
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

function toPosixPath(value) {
  return String(value || '').replace(/\\/g, '/');
}

function isTransientFsError(err) {
  const code = String(err?.code || '');
  return code === 'ENOENT' || code === 'ENOTDIR' || code === 'ESTALE';
}

function buildIndexLockId() {
  const hostname = String(os.hostname() || 'host')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
  const pid = String(process.pid || '0');
  const random = crypto.randomUUID().replace(/-/g, '');
  return `${hostname}_${pid}_${random}`;
}

function isIndexLockFileName(name) {
  return (
    typeof name === 'string' &&
    name.startsWith(INDEX_LOCK_PREFIX) &&
    name.endsWith(INDEX_LOCK_SUFFIX)
  );
}

function extractIndexLockId(name) {
  if (!isIndexLockFileName(name)) return null;
  return name.slice(INDEX_LOCK_PREFIX.length, -INDEX_LOCK_SUFFIX.length);
}

function writeOwnIndexLock() {
  try {
    const payload = {
      instanceId: indexLockId,
      host: os.hostname(),
      pid: process.pid,
      updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(indexLockPath, JSON.stringify(payload, null, 2), 'utf-8');
  } catch (err) {
    console.warn(`⚠ Failed to refresh index lock ${indexLockFileName}: ${err.message}`);
  }
}

function removeOwnIndexLock() {
  try {
    if (fs.existsSync(indexLockPath)) {
      fs.unlinkSync(indexLockPath);
    }
  } catch (_err) {
    // Best-effort cleanup on exit.
  }
}

function cleanupStaleIndexLocks() {
  const now = Date.now();
  let entries = [];
  try {
    entries = fs.readdirSync(presentationsDir);
  } catch (err) {
    console.warn(`⚠ Failed to list presentation locks: ${err.message}`);
    return;
  }

  for (const name of entries) {
    if (!isIndexLockFileName(name)) continue;
    const fullPath = path.join(presentationsDir, name);
    try {
      const stats = fs.statSync(fullPath);
      if (!stats.isFile()) continue;
      if (now - stats.mtimeMs > INDEX_LOCK_STALE_MS) {
        fs.unlinkSync(fullPath);
        console.log(`🧹 Removed stale index lock: ${name}`);
      }
    } catch (_err) {
      // Ignore race conditions from concurrent cleanup.
    }
  }
}

function getActiveIndexLockOwners() {
  cleanupStaleIndexLocks();
  writeOwnIndexLock();
  let entries = [];
  try {
    entries = fs.readdirSync(presentationsDir);
  } catch (err) {
    console.warn(`⚠ Failed to read index locks: ${err.message}`);
    return [indexLockId];
  }

  const owners = [];
  for (const name of entries) {
    const lockId = extractIndexLockId(name);
    if (!lockId) continue;
    const fullPath = path.join(presentationsDir, name);
    try {
      if (fs.statSync(fullPath).isFile()) {
        owners.push(lockId);
      }
    } catch (_err) {
      // Ignore files that disappear mid-scan.
    }
  }
  if (!owners.includes(indexLockId)) {
    owners.push(indexLockId);
  }
  owners.sort();
  return owners;
}

function canCurrentInstanceWritePresentationIndex() {
  const owners = getActiveIndexLockOwners();
  return owners.length === 1 && owners[0] === indexLockId;
}

function startIndexLockRefresh() {
  if (indexLockRefreshTimer) return;
  writeOwnIndexLock();
  cleanupStaleIndexLocks();
  indexLockRefreshTimer = setInterval(() => {
    writeOwnIndexLock();
    cleanupStaleIndexLocks();
  }, INDEX_LOCK_REFRESH_MS);
  if (typeof indexLockRefreshTimer.unref === 'function') {
    indexLockRefreshTimer.unref();
  }
}

function installIndexLockShutdownHooks() {
  if (indexLockShutdownHooksInstalled) return;
  indexLockShutdownHooksInstalled = true;
  const cleanup = () => {
    if (indexLockRefreshTimer) {
      clearInterval(indexLockRefreshTimer);
      indexLockRefreshTimer = null;
    }
    removeOwnIndexLock();
  };
  process.once('beforeExit', cleanup);
  process.once('exit', cleanup);
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

function generatePresentationIndex() {
  startIndexLockRefresh();
  installIndexLockShutdownHooks();
  if (!canCurrentInstanceWritePresentationIndex()) {
    console.log(`🔒 Skipping presentations/index.json regeneration (lock owner is another instance).`);
    return;
  }

  // In GUI mode the wrapper owns docs/readme deck generation.
  const isGui = /^(1|true)$/i.test(process.env.REVELATION_GUI || '');
  if (!isGui) {
    // Refresh README presentation first, if needed:
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

    // Generate presentation manifest
    let topLevelEntries = [];
    try {
      topLevelEntries = fs.readdirSync(presentationsDir);
    } catch (err) {
      console.warn(`⚠ Failed to list presentations dir ${presentationsDir}: ${err.message}`);
      return;
    }
    const dirs = topLevelEntries.filter((dir) => {
      if (!dir || dir.startsWith('.')) return false;
      if (isIndexLockFileName(dir)) return false;
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
          data = matter(fileContent).data || {};
        } catch (err) {
          console.error(`⚠ Malformed YAML in ${dir}/${mdFile}: ${err.message}`);

          // Fallback metadata when YAML is broken
          data = {
            title: "{malformed YAML}",
            description: err.message,
            thumbnail: "preview.jpg",
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
          thumbnail: data.thumbnail || "preview.jpg",
          created,
          createdTimestamp: toTimestamp(created),
          modified: stats.mtime.toISOString(),
          modifiedTimestamp: Number.isFinite(stats.mtimeMs) ? Math.round(stats.mtimeMs) : null,
          theme: data.theme || "",
          _malformed: data._malformed || false
        });
      });

    });

    fs.writeFileSync(outputFile, JSON.stringify(indexData, null, 2), 'utf-8');
    console.log(`📄 presentations/index.json regenerated`);
}

function safeGeneratePresentationIndex(context = '') {
  try {
    generatePresentationIndex();
  } catch (err) {
    console.error(`⚠ generatePresentationIndex failed${context ? ` (${context})` : ''}: ${err.message}`);
  }
}

function ensureReadmeTemplate() {
  if (!fs.existsSync(readmeTemplatePath)) {
    console.warn(`⚠️ README template folder missing: ${readmeTemplatePath}`);
    return;
  }
  copyTemplateRecursiveSync(readmeTemplatePath, readmePresDir, new Set(['header.yaml']));
}

function presentationIndexPlugin() {
  return {
    name: 'generate-presentation-index',
    buildStart() {
      safeGeneratePresentationIndex('buildStart');
      generateMediaIndex();
    },
    configureServer(server) {
      const isGui = /^(1|true)$/i.test(process.env.REVELATION_GUI || '');
      const cssServeDir = isGui ? path.resolve(__dirname, 'dist/css') : path.resolve(__dirname, 'css');
      const revealDistDir = path.resolve(__dirname, 'node_modules/reveal.js/dist');
      const userDataDir = process.env.USER_DATA_DIR;
      const configPath = userDataDir ? path.join(userDataDir, 'config.json') : null;

      if(!isGui) {
        copyFonts();
      }
      safeGeneratePresentationIndex('configureServer');
      generateMediaIndex();

      // Support sandboxed builder preview iframes (Origin: null) loading module assets.
      server.middlewares.use((req, res, next) => {
        const origin = String(req.headers.origin || '').trim().toLowerCase();
        const isLoopback = isLoopbackAddress(req.socket?.remoteAddress);
        if (origin === 'null' && !isLoopback && !String(req.url || '').startsWith('/peer/')) {
          res.writeHead(403, { 'Content-Type': 'text/plain' });
          res.end('403 Forbidden: sandbox-origin access allowed only from localhost');
          return;
        }
        if (req.method === 'OPTIONS' && origin === 'null' && isLoopback) {
          res.statusCode = 204;
          res.end();
          return;
        }
        next();
      });

      if (fs.existsSync(revealDistDir)) {
        server.middlewares.use('/css/reveal.js/dist', serveStatic(revealDistDir, { fallthrough: true }));
      }
      let publishDir = null;
      if (userDataDir) {
        publishDir = path.join(userDataDir, 'publish');
        fs.mkdirSync(publishDir, { recursive: true });
        server.middlewares.use('/publish', serveStatic(publishDir, {
          fallthrough: true,
          setHeaders: (res) => {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            res.setHeader('Surrogate-Control', 'no-store');
          }
        }));
      }

     // 👇 Find out if Vite was started with --host (network mode)
    const isNetwork = process.argv.includes('--host');
    const host = isNetwork ? getLocalIp() : 'localhost';

    // 👇 Dynamically get port from server.httpServer
    server.httpServer?.once('listening', () => {
      const actualPort = server.httpServer.address().port;
      const url = `http://${host}:${actualPort}/presentations.html?key=${key}`;
      console.log(`\n🌐 Open your presentations at:\n   \x1b[36m${url}\x1b[0m\n`);
    });

    const chokidar = require('chokidar');

      const watcher = chokidar.watch(presentationsDir, {
      ignored: /(^|[/\\])\../, // Ignore dotfiles
      persistent: true,
      ignoreInitial: true,  
      depth: 5
    });

    const triggerReload = (event, filePath) => {
      if (filePath.endsWith('.md') && filePath.includes(presentationsDir)) {
        console.log(`📦 ${event.toUpperCase()}:`, filePath);
        safeGeneratePresentationIndex(`watcher:${event}`);
        const relative = toPosixPath(path.relative(presentationsDir, filePath));
        const [slug, ...rest] = relative.split('/');
        if (!slug || !rest.length) return;
        const mdFile = rest.join('/');

        console.log(`Triggering reload-presentations for slug: ${slug}, md: ${mdFile}`);
        server.ws.send({
          type: 'custom',
          event: 'reload-presentations',
          data: { slug, mdFile }
        });
      }

      if (filePath.endsWith('.json') && filePath.includes('_media')) {
        console.log(`🧩 ${event.toUpperCase()}: Media JSON changed →`, filePath);
        generateMediaIndex();

        server.ws.send({
          type: 'custom',
          event: 'reload-media',
          data: { filePath }
        });
      }
    };

      watcher
      .on('add',    filePath => triggerReload('add', filePath))
      .on('change', filePath => triggerReload('change', filePath))
      .on('unlink', filePath => triggerReload('unlink', filePath))
      .on('addDir', dirPath => {
        // This code not needed as the creation of the .md file also triggers
        // and sets up a race condition
        /*
	        console.log('📁 Folder added:', dirPath);
          generatePresentationIndex();
          console.log('Triggering full-reload');
          server.ws.send({ type: 'full-reload' });
        */
        })
      .on('unlinkDir', dirPath => {
        if (dirPath.includes(presentationsDir)) {
          console.log('📁 Folder deleted:', dirPath);
          safeGeneratePresentationIndex('watcher:unlinkDir');
          console.log('Triggering full-reload');
          server.ws.send({ type: 'full-reload' });
        }
      });

    // Prefer dist/css output if available; fall back to css/.
    console.log(`Serving /css from ${cssServeDir}`);
    server.middlewares.use(
      '/css',
      serveStatic(cssServeDir, {
        index: false,
        fallthrough: true,
      })
    );

    // Rewrite `/presentations/foo/index.html` to `/presentation.html?slug=foo`
    server.middlewares.use((req, res, next) => {
      const escaped = presentationsWebPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // escape for regex

      const match = req.url.match(new RegExp(`^${escaped}/([^/]+)/(?:index\\.html)?(?:\\?.*)?$`));
      if (match) {
        const slug = match[1];
        req.url = `/presentation.html?slug=${slug}&key=${key}`;
      }

      const hmatch = req.url.match(new RegExp(`^${escaped}/([^/]+)/handout(?:\\.html)?(?:\\?.*)?$`));
      if (hmatch) {
        const slug = hmatch[1];
        req.url = `/handout.html?slug=${slug}&key=${key}`;
      }

        next();
      });

      // Peer pairing + peer command endpoints (served from the same Vite server)
      ensurePeerCommandServer(server, configPath);
      ensurePresenterPluginsServer(server);
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/peer/')) return next();

        const config = loadPeerConfig(configPath);
        if (!config) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Peer config unavailable' }));
          return;
        }
        if (config.mdnsPublish !== true) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Peer endpoints disabled (mDNS publishing off)' }));
          return;
        }

        const parsedUrl = new URL(req.url, 'http://localhost');
        const remoteAddress = normalizeRemoteAddress(req.socket?.remoteAddress);

        if (req.method === 'GET' && parsedUrl.pathname === '/peer/status') {
          if (!isLoopbackAddress(req.socket?.remoteAddress)) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Forbidden' }));
            return;
          }
          const status = getPeerStatus(parsedUrl.searchParams.get('since'));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(status));
          return;
        }

        if (req.method === 'GET' && req.url === '/peer/public-key') {
          const publicKey = config.rsaPublicKey;
          const payload = {
            instanceId: config.mdnsInstanceId,
            instanceName: config.mdnsInstanceName,
            hostname: os.hostname(),
            publicKey,
            publicKeyFingerprint: fingerprintPublicKey(publicKey || '')
          };
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(payload));
          return;
        }

        if (req.method === 'GET' && parsedUrl.pathname === '/peer/socket-info') {
          if (!config.rsaPrivateKey) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Peer private key unavailable' }));
            return;
          }
          const state = getPinFailureState(remoteAddress);
          if (state.blockedUntil && state.blockedUntil > Date.now()) {
            const block = pinBlockedResponse(state);
            res.writeHead(429, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Too many invalid pairing PIN attempts', retryAfterSec: block.retryAfterSec }));
            return;
          }
          const expectedPin = config.mdnsPairingPin;
          const providedPin = parsedUrl.searchParams.get('pin');
          if (expectedPin && providedPin !== expectedPin) {
            const next = registerPinFailure(remoteAddress);
            if (next.blockedUntil && next.blockedUntil > Date.now()) {
              const block = pinBlockedResponse(next);
              recordPeerEvent('pin-lockout', {
                remoteAddress,
                retryAfterSec: block.retryAfterSec
              });
              res.writeHead(429, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Too many invalid pairing PIN attempts', retryAfterSec: block.retryAfterSec }));
            } else {
              const remainingAttempts = Math.max(0, PIN_FAILURE_LIMIT - next.failures);
              res.writeHead(403, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid pairing PIN', remainingAttempts }));
            }
            return;
          }
          clearPinFailures(remoteAddress);
          const token = crypto.randomBytes(16).toString('hex');
          const expiresAt = Date.now() + 60_000;
          const socketPath = PEER_SOCKET_PATH;
          const payload = buildSocketPayload(token, expiresAt, socketPath);
          const signature = signChallenge(config.rsaPrivateKey, payload);
          const protocol = req.socket?.encrypted ? 'https' : 'http';
          const socketUrl = `${protocol}://${req.headers.host}`;

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ socketUrl, socketPath, token, expiresAt, signature }));
          return;
        }

        if (req.method === 'POST' && parsedUrl.pathname === '/peer/command') {
          if (!peerCommandIo) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Peer command server unavailable' }));
            return;
          }
          if (!isLoopbackAddress(req.socket?.remoteAddress)) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Forbidden' }));
            return;
          }

          let body = '';
          req.on('data', (chunk) => {
            body += chunk.toString();
          });
          req.on('end', () => {
            let data;
            try {
              data = JSON.parse(body || '{}');
            } catch {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid JSON' }));
              return;
            }
            const command = data.command;
            if (!command?.type) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Missing command type' }));
              return;
            }

            peerCommandIo.emit('peer-command', command);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
          });
          return;
        }

        if (req.method === 'POST' && req.url === '/peer/challenge') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk.toString();
          });
          req.on('end', () => {
            let data;
            try {
              data = JSON.parse(body || '{}');
            } catch {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid JSON' }));
              return;
            }
            const challenge = data.challenge;
            const state = getPinFailureState(remoteAddress);
            if (state.blockedUntil && state.blockedUntil > Date.now()) {
              const block = pinBlockedResponse(state);
              res.writeHead(429, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Too many invalid pairing PIN attempts', retryAfterSec: block.retryAfterSec }));
              return;
            }
            const expectedPin = config.mdnsPairingPin;
            const providedPin = data.pin;
            if (expectedPin && providedPin !== expectedPin) {
              const next = registerPinFailure(remoteAddress);
              if (next.blockedUntil && next.blockedUntil > Date.now()) {
                const block = pinBlockedResponse(next);
                recordPeerEvent('pin-lockout', {
                  remoteAddress,
                  retryAfterSec: block.retryAfterSec
                });
                res.writeHead(429, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Too many invalid pairing PIN attempts', retryAfterSec: block.retryAfterSec }));
              } else {
                const remainingAttempts = Math.max(0, PIN_FAILURE_LIMIT - next.failures);
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid pairing PIN', remainingAttempts }));
              }
              return;
            }
            clearPinFailures(remoteAddress);
            if (!challenge || !config.rsaPrivateKey) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Missing challenge or private key' }));
              return;
            }
            try {
              const signature = signChallenge(config.rsaPrivateKey, challenge);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ signature }));
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      });

      // Restrict access to presentation/media indexes to localhost only
      server.middlewares.use((req, res, next) => {

            const lowerUrl = req.url?.toLowerCase() || '';
            if (lowerUrl.includes('index.json')) {
            const rawIp = req.socket.remoteAddress;

            // Normalize to raw IPv4 if in IPv6-mapped format
            const clientIp = rawIp.startsWith('::ffff:') ? rawIp.replace('::ffff:', '') : rawIp;

            // Normalize IPv6 localhost
            const normalizedClientIp = clientIp === '::1' ? '127.0.0.1' : clientIp;

            const isLocalhost = normalizedClientIp === '127.0.0.1';

            if (!isLocalhost) {
              console.log(`Attempted access from ${normalizedClientIp} blocked.`);
              res.writeHead(403, { 'Content-Type': 'text/plain' });
              res.end('403 Forbidden: index.json access denied (localhost only)');
              return;
            }
          }

          next();
       });

       // Serve presentations from a custom path

       if(customPath && fs.existsSync(presentationsDir)) {
          console.log(`Serving ${presentationsWebPath} from custom presentations directory ${presentationsDir}`);
          server.middlewares.use(presentationsWebPath, 
            serveStatic(
              presentationsDir,
              {
                  index: false,
                  fallthrough: true,
              }
            )
          );
          if(fs.existsSync(pluginsDir)) {
            console.log(`Serving ${pluginsWebPath} from plugins directory ${pluginsDir}`);
            server.middlewares.use(pluginsWebPath, 
              serveStatic(pluginsDir,{})
            );
          }
        }

        // Middleware to serve files from revelation_electron-wrapper/http_admin
        // This allows serving static files from the external folder

        const adminDir = process.env.ADMIN_DIR_OVERRIDE;
        if (adminDir && fs.existsSync(adminDir)) {
          server.middlewares.use(
            '/admin',
            serveStatic(adminDir, {
              index: false,
              fallthrough: true,
            })
          );
        } else {
          console.warn('⚠️  External http_admin folder not found — skipping mount.');
        }
	    
    }
  };
};

function copyFonts() {
  // No longer used — fonts are now included directly in the css/fonts folder
  /*
      const src = path.resolve(__dirname, 'node_modules/reveal.js/dist/theme/fonts');
      const dest = path.resolve(__dirname, 'css/fonts');

      // Skip if already copied
      if (fs.existsSync(dest)) return;

      // Recursively copy
      copyRecursiveSync(src, dest);
      console.log('📁 Copied Reveal.js fonts to css/fonts');
  */
}

function loadPeerConfig(configPath) {
  if (!configPath || !fs.existsSync(configPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch {
    return null;
  }
}

function normalizeRemoteAddress(address) {
  if (!address) return 'unknown';
  return address.startsWith('::ffff:') ? address.replace('::ffff:', '') : address;
}

function normalizePeerInstanceId(value) {
  const id = String(value || '').trim();
  return id || 'unknown';
}

function normalizePeerLabel(value) {
  const label = String(value || '').trim();
  return label || '';
}

function recordPeerEvent(type, payload = {}) {
  peerEventSeq += 1;
  peerEventLog.push({
    id: peerEventSeq,
    type,
    at: new Date().toISOString(),
    ...payload
  });
  if (peerEventLog.length > PEER_EVENT_LIMIT) {
    peerEventLog.splice(0, peerEventLog.length - PEER_EVENT_LIMIT);
  }
  return peerEventSeq;
}

function upsertSeenFollower(instanceId, remoteAddress) {
  const key = instanceId !== 'unknown' ? `instance:${instanceId}` : `ip:${remoteAddress}`;
  const now = new Date().toISOString();
  const existing = peerSeenFollowers.get(key);
  if (existing) {
    existing.lastSeen = now;
    existing.remoteAddress = remoteAddress;
    existing.connectionCount += 1;
    return existing;
  }
  const created = {
    key,
    instanceId,
    remoteAddress,
    firstSeen: now,
    lastSeen: now,
    connectionCount: 1
  };
  peerSeenFollowers.set(key, created);
  return created;
}

function getPeerStatus(sinceId = 0) {
  const parsedSince = Number.parseInt(sinceId, 10);
  const safeSince = Number.isFinite(parsedSince) && parsedSince > 0 ? parsedSince : 0;
  const events = safeSince
    ? peerEventLog.filter((entry) => entry.id > safeSince)
    : [];
  const activeFollowers = Array.from(peerActiveFollowers.values())
    .sort((a, b) => String(a.connectedAt).localeCompare(String(b.connectedAt)));
  const seenFollowers = Array.from(peerSeenFollowers.values())
    .sort((a, b) => String(b.lastSeen).localeCompare(String(a.lastSeen)));
  return {
    activeFollowers,
    seenFollowers,
    events,
    lastEventId: peerEventSeq
  };
}

function getPinFailureState(remoteAddress) {
  const now = Date.now();
  const current = peerPinFailures.get(remoteAddress);
  if (!current) {
    return { failures: 0, blockedUntil: 0 };
  }
  if (current.blockedUntil && current.blockedUntil <= now) {
    peerPinFailures.delete(remoteAddress);
    return { failures: 0, blockedUntil: 0 };
  }
  return current;
}

function registerPinFailure(remoteAddress) {
  const current = getPinFailureState(remoteAddress);
  const failures = (current.failures || 0) + 1;
  if (failures >= PIN_FAILURE_LIMIT) {
    const blockedUntil = Date.now() + PIN_BLOCK_MS;
    const next = { failures: 0, blockedUntil };
    peerPinFailures.set(remoteAddress, next);
    return next;
  }
  const next = { failures, blockedUntil: 0 };
  peerPinFailures.set(remoteAddress, next);
  return next;
}

function clearPinFailures(remoteAddress) {
  if (!remoteAddress) return;
  peerPinFailures.delete(remoteAddress);
}

function pinBlockedResponse(state) {
  const retryAfterSec = Math.max(1, Math.ceil((state.blockedUntil - Date.now()) / 1000));
  return { retryAfterSec };
}

function isLoopbackAddress(address) {
  if (!address) return false;
  const normalized = normalizeRemoteAddress(address);
  return normalized === '127.0.0.1' || normalized === '::1';
}

function ensurePeerCommandServer(server, configPath) {
  if (peerCommandIo || !server.httpServer) return;

  peerCommandIo = new Server(server.httpServer, {
    path: PEER_SOCKET_PATH,
    cors: { origin: '*', methods: ['GET', 'POST'] }
  });

  peerCommandIo.use((socket, next) => {
    const auth = socket.handshake.auth || {};
    const { token, expiresAt, signature } = auth;
    const config = loadPeerConfig(configPath);

    if (!token || !expiresAt || !signature || !config?.rsaPublicKey) {
      return next(new Error('Missing peer auth'));
    }
    if (Number(expiresAt) < Date.now()) {
      return next(new Error('Peer auth expired'));
    }
    const payload = buildSocketPayload(token, expiresAt, PEER_SOCKET_PATH);
    if (!verifySignature(config.rsaPublicKey, payload, signature)) {
      return next(new Error('Invalid peer signature'));
    }
    return next();
  });

  peerCommandIo.on('connection', (socket) => {
    const auth = socket.handshake.auth || {};
    const instanceId = normalizePeerInstanceId(auth.instanceId);
    const instanceName = normalizePeerLabel(auth.instanceName);
    const hostname = normalizePeerLabel(auth.hostname);
    const remoteAddress = normalizeRemoteAddress(socket.handshake.address || socket.request?.socket?.remoteAddress);
    const connectedAt = new Date().toISOString();
    peerActiveFollowers.set(socket.id, {
      socketId: socket.id,
      instanceId,
      instanceName,
      hostname,
      remoteAddress,
      connectedAt
    });
    upsertSeenFollower(instanceId, remoteAddress);
    recordPeerEvent('follower-connected', { instanceId, instanceName, hostname, remoteAddress });

    socket.on('disconnect', () => {
      peerActiveFollowers.delete(socket.id);
    });
  });
}

function sanitizePluginName(value) {
  const plugin = String(value || '').trim().toLowerCase();
  if (!plugin) return '';
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(plugin)) return '';
  return plugin;
}

function sanitizeRoomId(value) {
  const roomId = String(value || '').trim();
  if (!roomId) return '';
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(roomId)) return '';
  return roomId;
}

function ensurePresenterPluginsServer(server) {
  if (presenterPluginsIo || !server.httpServer) return;

  presenterPluginsIo = new Server(server.httpServer, {
    path: PRESENTER_PLUGINS_SOCKET_PATH,
    cors: { origin: '*', methods: ['GET', 'POST'] },
    // Markerboard full-state snapshots can be large (import/restore). Increase
    // payload budget so those sync events are not dropped by Socket.IO defaults.
    maxHttpBufferSize: 25 * 1024 * 1024
  });

  presenterPluginsIo.on('connection', (socket) => {
    let activeRoom = '';
    let activePlugin = '';

    socket.on('presenter-plugin:join', (data = {}, ack) => {
      const plugin = sanitizePluginName(data.plugin);
      const roomId = sanitizeRoomId(data.roomId);
      if (!plugin || !roomId) {
        if (typeof ack === 'function') ack({ ok: false, error: 'Invalid plugin or room' });
        return;
      }

      const room = `${plugin}:${roomId}`;
      if (activeRoom && activeRoom !== room) {
        socket.leave(activeRoom);
      }
      socket.join(room);
      activeRoom = room;
      activePlugin = plugin;
      if (typeof ack === 'function') ack({ ok: true, room });
    });

    socket.on('presenter-plugin:event', (message = {}) => {
      if (!activeRoom || !activePlugin) return;
      const type = String(message.type || '').trim();
      if (!type) return;
      const event = {
        plugin: activePlugin,
        roomId: activeRoom.split(':').slice(1).join(':'),
        type,
        payload: message.payload && typeof message.payload === 'object' ? message.payload : {},
        ts: Date.now()
      };
      socket.to(activeRoom).emit('presenter-plugin:event', event);
    });
  });
}

function signChallenge(privateKeyPem, challenge) {
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(challenge);
  signer.end();
  return signer.sign(privateKeyPem).toString('base64');
}

function verifySignature(publicKeyPem, payload, signatureBase64) {
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(payload);
  verifier.end();
  return verifier.verify(publicKeyPem, Buffer.from(signatureBase64, 'base64'));
}

function buildSocketPayload(token, expiresAt, socketPath) {
  return `${token}:${expiresAt}:${socketPath}`;
}

function fingerprintPublicKey(publicKeyPem) {
  return crypto.createHash('sha256').update(publicKeyPem).digest('hex');
}

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

module.exports = presentationIndexPlugin;
