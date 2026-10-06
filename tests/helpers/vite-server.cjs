// Starts a REAL Vite dev server with the REVELation plugin on an ephemeral port, against throwaway
// directories, in this process. The plugin is built with createRevelationPlugin(options) (see
// vite.plugins.js and server/config.js), so nothing here touches process.env or process.parentPort:
// any number of servers, in any mode, can run in one test process.
//
//   const srv = await startServer({ files: { 'demo/presentation.md': '# hi' } });
//   await fetch(`${srv.base}/presentations_${srv.key}/index.json`);
//   srv.send({ type: 'register-media-token', token, absolutePath, mimeType });   // as Electron would
//
// Options: files / pluginFiles / adminFiles (relative path -> content, written to the temp dirs),
// relay (public relay mode), gui (default true), key, standalone (serve the temp dir as a standalone
// presentations_<key> folder instead of a custom path), debounceMs (index rebuild debounce),
// ffmpegBin (path), quiet (default true: mute the plugin's console output while the server runs).
// Returns { base, port, key, dirs: { presentations, userData, admin, plugins }, posted, send,
// parentPort, setFfmpegBin, lanUrl, close }.
//   posted        messages the server sent to the "main process" (parentPort.postMessage)
//   send          deliver a message as the Electron main process would (parentPort 'message')
//   lanUrl        http://<non-loopback IPv4>:<port>, or null on a machine without one. Requests made
//                 through it arrive from a non-loopback address, so the loopback-only gates apply.
//                 (tests/unit/access-gates.test.cjs checks the gates without needing a LAN interface.)
// Nothing here launches Electron. close() releases everything the plugin started.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');

const REVELATION_ROOT = path.resolve(__dirname, '..', '..');
const KEY = 'testkey1';

function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const iface of list || []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return null;
}

function writeTree(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const target = path.join(root, ...rel.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
}

// vite.config.js minus its plugin: the real server settings (cors, aliases, warmup) apply, and the
// harness supplies a plugin instance configured from options instead of from the environment.
async function loadViteConfig(vite) {
  const configFile = path.join(REVELATION_ROOT, 'vite.config.js');
  const loaded = await vite.loadConfigFromFile({ command: 'serve', mode: 'development' }, configFile, REVELATION_ROOT);
  return { ...loaded.config, plugins: [], configFile: false };
}

async function startServer({
  files = {},
  adminFiles = null,
  pluginFiles = {},
  relay = false,
  gui = true,
  standalone = false,
  key = KEY,
  debounceMs = 100,
  ffmpegBin = null,
  quiet = true
} = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'revelation-server-test-'));
  const dirs = {
    presentations: path.join(tmp, 'presentations'),
    userData: path.join(tmp, 'userData'),
    admin: path.join(tmp, 'admin'),
    plugins: path.join(tmp, 'plugins')
  };
  // Standalone mode finds its folder by the presentations_ prefix inside baseDir.
  const baseDir = path.join(tmp, 'base');
  if (standalone) dirs.presentations = path.join(baseDir, `presentations_${key}`);
  for (const dir of Object.values(dirs)) fs.mkdirSync(dir, { recursive: true });
  writeTree(dirs.presentations, files);
  writeTree(dirs.plugins, pluginFiles);
  if (adminFiles) writeTree(dirs.admin, adminFiles);

  // Stand-in for Electron's utility-process channel.
  const posted = [];
  const parentPort = Object.assign(new EventEmitter(), { postMessage: (message) => posted.push(message) });
  const send = (data) => parentPort.emit('message', { data });

  let currentFfmpeg = ffmpegBin;
  const options = {
    env: {}, // hermetic: nothing is read from process.env
    argv: [],
    parentPort,
    indexRebuildDebounceMs: debounceMs,
    ffmpegBin: () => currentFfmpeg,
    ...(relay
      ? { publicRelay: true }
      : standalone
        ? { baseDir, gui, userDataDir: dirs.userData, ...(adminFiles ? { adminDir: dirs.admin } : {}) }
        : {
            presentationsDir: dirs.presentations, key, pluginsDir: dirs.plugins, gui, userDataDir: dirs.userData,
            ...(adminFiles ? { adminDir: dirs.admin } : {})
          })
  };

  const realLog = console.log;
  const realWarn = console.warn;
  if (quiet) { console.log = () => {}; console.warn = () => {}; }

  const vite = await import('vite');
  const { createRevelationPlugin } = require('../../vite.plugins.js');
  const config = await loadViteConfig(vite);
  const server = await vite.createServer({
    ...config,
    root: REVELATION_ROOT,
    plugins: [createRevelationPlugin(options)],
    logLevel: 'silent',
    server: { ...config.server, port: 0, host: '0.0.0.0', strictPort: false },
    optimizeDeps: { noDiscovery: true, include: [] }
  });
  await server.listen();
  const port = server.httpServer.address().port;
  const lan = lanAddress();

  return {
    base: `http://127.0.0.1:${port}`,
    port,
    key,
    dirs,
    posted,
    send,
    parentPort,
    setFfmpegBin(bin) { currentFfmpeg = bin; },
    lanUrl: lan ? `http://${lan}:${port}` : null,
    async close() {
      await server.close();
      if (quiet) { console.log = realLog; console.warn = realWarn; }
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  };
}

module.exports = { startServer, REVELATION_ROOT, KEY };
