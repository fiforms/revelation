// Starts a REAL Vite dev server with the REVELation plugin (vite.plugins.js) in this process, on an
// ephemeral port, against throwaway directories. This is how the server's middleware stack, trust
// gates and sockets are tested without refactoring: the plugin reads its mode from the environment
// when it is first required, so call startServer() ONCE per test process (node:test runs every
// test file in its own process) and pick the mode through `env`/`relay`.
//
//   const srv = await startServer({ files: { 'demo/presentation.md': '# hi' }, parentPort: true });
//   await fetch(`${srv.base}/presentations_${srv.key}/index.json`);
//   srv.send({ type: 'register-media-token', token, absolutePath, mimeType });   // as Electron would
//
// Returns { base, port, key, dirs: { presentations, userData, admin, plugins }, posted, send, lanUrl, close }.
//   posted  messages the server sent to the "main process" (process.parentPort.postMessage)
//   send    deliver a message as the Electron main process would (process.parentPort 'message')
//   lanUrl  http://<non-loopback IPv4>:<port>, or null on a machine without one. Requests made
//           through it arrive from a non-loopback address, so the loopback-only gates apply.
// Nothing here launches Electron. The plugin's chokidar watcher and sockets are never closed by the
// plugin itself, so run these tests with `node --test --test-force-exit` (tests/run-tests.cjs does).
const fs = require('fs');
const os = require('os');
const path = require('path');

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

async function startServer({
  files = {},
  adminFiles = null,
  pluginFiles = {},
  relay = false,
  gui = true,
  parentPort = false,
  env = {},
  quiet = true
} = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'revelation-server-test-'));
  const dirs = {
    presentations: path.join(tmp, 'presentations'),
    userData: path.join(tmp, 'userData'),
    admin: path.join(tmp, 'admin'),
    plugins: path.join(tmp, 'plugins')
  };
  for (const dir of Object.values(dirs)) fs.mkdirSync(dir, { recursive: true });
  writeTree(dirs.presentations, files);
  writeTree(dirs.plugins, pluginFiles);
  if (adminFiles) writeTree(dirs.admin, adminFiles);

  const settings = relay
    ? { REVELATION_PUBLIC_SERVER: '1' }
    : {
        PRESENTATIONS_DIR_OVERRIDE: dirs.presentations,
        PRESENTATIONS_KEY_OVERRIDE: KEY,
        PLUGINS_DIR_OVERRIDE: dirs.plugins,
        USER_DATA_DIR: dirs.userData,
        ...(gui ? { REVELATION_GUI: '1' } : {}),
        ...(adminFiles ? { ADMIN_DIR_OVERRIDE: dirs.admin } : {})
      };
  Object.assign(process.env, settings, env);

  // Stand-in for Electron's utility-process channel; the plugin reads process.parentPort at load time.
  const posted = [];
  const listeners = [];
  if (parentPort) {
    process.parentPort = {
      on: (event, fn) => { if (event === 'message') listeners.push(fn); },
      postMessage: (message) => posted.push(message)
    };
  }
  const send = (data) => listeners.forEach((fn) => fn({ data }));

  const realLog = console.log;
  const realWarn = console.warn;
  if (quiet) { console.log = () => {}; console.warn = () => {}; }

  const { createServer } = await import('vite');
  const server = await createServer({
    root: REVELATION_ROOT,
    configFile: path.join(REVELATION_ROOT, 'vite.config.js'),
    logLevel: 'silent',
    server: { port: 0, host: '0.0.0.0', strictPort: false },
    optimizeDeps: { noDiscovery: true, include: [] }
  });
  await server.listen();
  const port = server.httpServer.address().port;

  return {
    base: `http://127.0.0.1:${port}`,
    port,
    key: KEY,
    dirs,
    posted,
    send,
    lanUrl: lanAddress() ? `http://${lanAddress()}:${port}` : null,
    async close() {
      await server.close();
      console.log = realLog;
      console.warn = realWarn;
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  };
}

module.exports = { startServer, REVELATION_ROOT, KEY };
