// =============================================================================
// vite.plugins.js — the REVELation server, implemented as one Vite plugin
// (`generate-presentation-index`, loaded from vite.config.js). Despite the name
// it is the whole back end: Vite is the HTTP server, this plugin adds everything
// that is not a static page. CommonJS; loaded by Vite's config loader.
//
// This file only COMPOSES the pieces in ./server/ (each has its own header and can be
// required and tested on its own):
//   server/config.js ................ resolveServerConfig(): mode, directories, keys from options/env
//   server/presentation-index.js .... index.json + _media/index.json generation, GUI index route
//   server/presentation-watcher.js .. chokidar watcher: debounced reindex + HMR reload events
//   server/media-share.js ........... /media-share/<token> (tokens registered by Electron)
//   server/thumbnails.js ............ /thumbs_<key>/ (ffmpeg) and the legacy .webp fallback
//   server/access-gates.js .......... the loopback-only gates (sandbox origin, index.json, /admin)
//   server/presenter-plugins-broker.js  /presenter-plugins-socket
//   server/reveal-remote-broker.js ...  /socket.io (Reveal Remote)
//   server/public-relay.js .......... public relay mode
//   server/peer-server.js ........... peer pairing endpoints + /peer-commands socket
//   server/peer-protocol.js ......... the peer signature constructions (shared with the wrapper)
//   server/network.js ............... isLoopbackAddress / normalizeRemoteAddress
//
// USE
//   vite.config.js:  plugins: [require('./vite.plugins.js')()]      // configured from the environment
//   tests/code:      require('./vite.plugins.js').createRevelationPlugin({ presentationsDir, key, ... })
//   Options and the environment variables they fall back to are listed in server/config.js
//   (PRESENTATIONS_DIR_OVERRIDE + PRESENTATIONS_KEY_OVERRIDE, PLUGINS_DIR_OVERRIDE, ADMIN_DIR_OVERRIDE,
//   FFMPEG_BIN, USER_DATA_DIR, REVELATION_GUI, REVELATION_PUBLIC_SERVER). Further options:
//   parentPort (default process.parentPort; anything with on/off/postMessage), indexRebuildDebounceMs.
//   Nothing is read or started until Vite calls a hook, so creating a plugin is free of side effects;
//   each plugin instance owns its own state (tokens, sockets, watcher) and releases it when the
//   server closes, so several can live in one process.
//   Process arguments --host and --https are read only to print the startup URL.
//
// PARENT-PORT MESSAGES (Electron utility process only): `register-media-token` /
// `revoke-media-token` go to server/media-share.js; every other message is passed to
// peerServer.handleParentMessage().
//
// TRUST TIERS (T0..T4) used in the banners below are defined in doc/SECURITY.md.
// =============================================================================
'use strict';
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const serveStatic = require('serve-static');
const { createPeerServer } = require('./server/peer-server.js');
const { resolveServerConfig } = require('./server/config.js');
const { createPresentationIndex, createIndexRoute } = require('./server/presentation-index.js');
const { createPresentationWatcher, DEFAULT_DEBOUNCE_MS } = require('./server/presentation-watcher.js');
const { createMediaShare } = require('./server/media-share.js');
const { createThumbsMiddleware, createLegacyThumbnailFallback } = require('./server/thumbnails.js');
const { createSandboxOriginGate, createIndexJsonGate, createAdminGate } = require('./server/access-gates.js');
const { createPresenterPluginsBroker } = require('./server/presenter-plugins-broker.js');
const { createRevealRemoteBroker } = require('./server/reveal-remote-broker.js');
const { configurePublicRelayServer } = require('./server/public-relay.js');

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

// Reveal's speaker view is an about:blank popup whose page is one big inline
// <script> written in by plugin/notes. It inherits presentation.html's CSP, so
// that script must be allowed by hash. Computing it from the installed plugin
// keeps the hash correct across reveal.js upgrades.
const NOTES_HASH_PLACEHOLDER = "'sha256-NOTES_VIEW_SCRIPT_HASH'";

function computeNotesViewScriptHash() {
  try {
    const src = fs.readFileSync(path.resolve(__dirname, 'node_modules/reveal.js/dist/plugin/notes.mjs'), 'utf8');
    const start = src.indexOf('write("');
    if (start < 0) throw new Error('speaker view markup not found');
    let end = start + 7;
    while (end < src.length && !(src[end] === '"' && src[end - 1] !== '\\')) end++;
    // The markup is a plain double-quoted JS string literal; let the JS parser unescape it.
    const html = require('vm').runInNewContext(src.slice(start + 6, end + 1));
    const script = html.match(/<script>([\s\S]*?)<\/script>/);
    if (!script) throw new Error('inline script not found');
    return `'sha256-${crypto.createHash('sha256').update(script[1]).digest('base64')}'`;
  } catch (err) {
    console.warn(`⚠️  Could not compute speaker-view CSP hash (${err.message}); the speaker view will be blocked.`);
    return '';
  }
}


// --- The Vite plugin ----------------------------------------------------------
// transformIndexHtml: substitutes the speaker-view script hash into presentation.html's CSP.
// buildStart:        regenerates presentations/index.json and _media/index.json.
// configureServer:   builds the middleware stack. Order matters; registration order is:
//
//   #  route / purpose                                         trust gate
//   1  sandbox-origin gate: `Origin: null` from non-loopback   403 unless loopback or /peer/*
//      -> 403; loopback OPTIONS -> 204 (builder preview iframe)
//   2  /media-share/<48-hex token>  Range-capable file stream   T2: 192-bit token from the
//      (tokens registered by Electron via parentPort)           registry (random path secret)
//   3  /css/reveal.js/dist  (reveal.css for offline/export)    none (static)
//   4  /publish/<publishKey>.html|.rev  URL-publish screens     T2: 64-bit key in filename,
//      (only when USER_DATA_DIR set; no-store headers)          LAN-reachable by design
//   -  chokidar watcher on the presentations dir (not a route): debounced index rebuild +
//      HMR custom events `reload-presentations`, `presentations-index-updated`, `reload-media`
//   5  /css  (dist/css in GUI mode, else css/)                  none (static)
//   6  URL rewrite: /presentations_<key>/<slug>/[index.html]    (rewrite only)
//        -> /presentation.html?slug=&key= ; .../handout[.html] -> /handout.html?slug=&key=
//   -  sockets attached to the HTTP server (not middleware):
//        /peer-commands            T4  RSA bearer token (server/peer-server.js)
//        /presenter-plugins-socket T2c room id only, open by design (server/presenter-plugins-broker.js)
//        /socket.io                T3  Reveal Remote, per-channel UUID (section 7)
//   7  /_remote/ui  static remote-control web UI                none (static)
//   8  peerServer.middleware: /peer/status (loopback), /peer/public-key, /peer/auth-nonce,
//      /peer/pair (PIN), /peer/challenge + /peer/socket-info (follower signature)
//                                                              all 403 unless mdnsPublish
//   9  any path ending /index.json (presentations + _media)     T0: loopback only
//  10  GUI mode only: <presentationsWebPath>/index.json served  (behind gate 9)
//      from the userData cache (`[]` if transiently missing)
//  11  <presentationsWebPath>/_media/*.thumbnail.jpg -> legacy  T1: key in path
//      .webp fallback when the jpg is absent
//  12  custom-path mode only:
//        <presentationsWebPath>/  static presentations tree     T1: key in path, no index
//        <pluginsWebPath>/        static plugins tree           T1 (serves plugin source, F7)
//        /thumbs_<key>/<slug>/<file>  ffmpeg 320px JPEG         T1 (spawns ffmpeg, F6)
//  13  /admin  wrapper http_admin/ (needs ADMIN_DIR_OVERRIDE)   T0: loopback gate + static
//   Anything else falls through to Vite itself: in standalone (non-custom) mode that is the
//   project root, so revelation/presentations_<key>/ is served by Vite's static handler.
//   Public relay mode replaces all of this with configurePublicRelayServer() (server/public-relay.js).
// Everything one plugin instance owns. Built lazily (first Vite hook) so that creating the plugin
// reads nothing and a vite.config.js that is merely loaded has no side effects.
function createRuntime(options) {
  const config = resolveServerConfig(options);
  const parentPort = options.parentPort !== undefined ? options.parentPort : process.parentPort;

  const index = createPresentationIndex(config);
  const mediaShare = createMediaShare();
  const presenterPlugins = createPresenterPluginsBroker();
  const revealRemote = createRevealRemoteBroker();
  // Master side of the peer protocol. See server/peer-server.js.
  const peerServer = createPeerServer({
    configPath: config.userDataDir ? path.join(config.userDataDir, 'config.json') : null,
    followersPath: config.userDataDir ? path.join(config.userDataDir, 'peer-followers.json') : null,
    postToParent(message) {
      parentPort?.postMessage(message);
    }
  });

  let watcher = null;
  let parentListener = null;

  // Electron main process -> this process.
  function attachParentPort() {
    if (!parentPort || parentListener) return;
    parentListener = ({ data }) => {
      if (!data || typeof data !== 'object') return;
      if (!mediaShare.handleParentMessage(data)) peerServer.handleParentMessage(data);
    };
    parentPort.on('message', parentListener);
  }

  async function close() {
    if (parentListener) {
      (parentPort.off || parentPort.removeListener)?.call(parentPort, 'message', parentListener);
      parentListener = null;
    }
    const activeWatcher = watcher;
    watcher = null;
    presenterPlugins.close();
    revealRemote.close();
    if (activeWatcher) await activeWatcher.close();
  }

  return {
    config, index, mediaShare, presenterPlugins, revealRemote, peerServer,
    attachParentPort, close,
    setWatcher(next) { watcher = next; }
  };
}

function createRevelationPlugin(options = {}) {
  let notesViewScriptHash;
  let runtime = null;
  const getRuntime = () => (runtime ??= createRuntime(options));

  return {
    name: 'generate-presentation-index',
    transformIndexHtml(html) {
      if (!html.includes(NOTES_HASH_PLACEHOLDER)) return html;
      notesViewScriptHash ??= computeNotesViewScriptHash();
      return html.replace(NOTES_HASH_PLACEHOLDER, notesViewScriptHash);
    },
    buildStart() {
      const { config, index } = getRuntime();
      if (config.isPublicServerMode) return;
      index.safeGenerate('buildStart');
      index.generateMediaIndex();
    },
    // Called when the dev server closes (and at the end of `vite build`): releases the file watcher,
    // the socket brokers and the parent-port listener.
    async closeBundle() {
      await runtime?.close();
    },
    configureServer(server) {
      const rt = getRuntime();
      const { config, index, mediaShare, presenterPlugins, revealRemote, peerServer } = rt;
      rt.attachParentPort();
      // Release the watcher, sockets and parent-port listener when the server closes. closeBundle()
      // below does the same through Vite's plugin container; either path is enough and close() is
      // idempotent (middleware-mode servers have no httpServer, so they rely on closeBundle).
      server.httpServer?.once('close', () => { rt.close(); });

      if (config.isPublicServerMode) {
        configurePublicRelayServer(server, { rootDir: config.rootDir, presenterPlugins, revealRemote });
        return;
      }

      const { rootDir, presentationsDir, presentationsWebPath, key, userDataDir } = config;
      const cssServeDir = config.isGuiMode ? path.resolve(rootDir, 'dist/css') : path.resolve(rootDir, 'css');
      const revealDistDir = path.resolve(rootDir, 'node_modules/reveal.js/dist');

      index.safeGenerate('configureServer');
      index.generateMediaIndex();

      // Support sandboxed builder preview iframes (Origin: null) loading module assets.
      server.middlewares.use(createSandboxOriginGate());

      // Serve dynamically registered media files via opaque tokens (see server/media-share.js).
      server.middlewares.use(mediaShare.middleware);

      if (fs.existsSync(revealDistDir)) {
        server.middlewares.use('/css/reveal.js/dist', serveStatic(revealDistDir, { fallthrough: true }));
      }
      // /publish — URL Publish screen endpoint
      // Serves lightweight HTML wrappers + .rev revision files for LAN browser / smart-TV
      // "virtual screens". When a user adds a "URL Publish" screen in Settings, the Electron
      // app writes {publishKey}.html and {publishKey}.rev here; remote browsers poll .rev
      // and reload the iframe automatically when the presentation changes.
      //
      // Security: intentionally LAN-accessible (that is its purpose). Access to a specific
      // file requires knowing the random publishKey embedded in the filename (~64-bit
      // entropy), generated in configManager.js. serve-static does not serve directory
      // listings, so the file list is not enumerable.
      if (userDataDir) {
        const publishDir = path.join(userDataDir, 'publish');
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
      const isNetwork = config.argv.includes('--host');
      const host = isNetwork ? getLocalIp() : 'localhost';
      const protocol = config.argv.includes('--https') ? 'https' : 'http';

      // 👇 Dynamically get port from server.httpServer
      server.httpServer?.once('listening', () => {
        const actualPort = server.httpServer.address().port;
        const url = `${protocol}://${host}:${actualPort}/presentations.html?key=${key}`;
        console.log(`\n🌐 Open your presentations at:\n   \x1b[36m${url}\x1b[0m\n`);
      });

      const watcher = createPresentationWatcher({
        presentationsDir,
        index,
        send: (payload) => server.ws.send(payload),
        debounceMs: options.indexRebuildDebounceMs ?? DEFAULT_DEBOUNCE_MS
      });
      watcher.start();
      rt.setWatcher(watcher);

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
      peerServer.attachSocketServer(server.httpServer);
      presenterPlugins.attach(server.httpServer);
      revealRemote.attach(server.httpServer);
      server.middlewares.use('/_remote/ui', serveStatic(path.resolve(rootDir, 'node_modules/reveal.js-remote/server-ui'), { fallthrough: true }));
      server.middlewares.use(peerServer.middleware);

      // Restrict access to presentation/media indexes to localhost only
      server.middlewares.use(createIndexJsonGate());

      // In Electron GUI mode, serve presentations index from local userData cache.
      if (config.outputFile !== config.sharedIndexFile) {
        server.middlewares.use(createIndexRoute({ presentationsWebPath, outputFile: config.outputFile }));
      }

      // Legacy media thumbnails (.webp where the .jpg is missing).
      server.middlewares.use(createLegacyThumbnailFallback({ presentationsDir, presentationsWebPath }));

      // Serve presentations from a custom path
      if (config.customPath && fs.existsSync(presentationsDir)) {
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
        if (fs.existsSync(config.pluginsDir)) {
          console.log(`Serving ${config.pluginsWebPath} from plugins directory ${config.pluginsDir}`);
          server.middlewares.use(config.pluginsWebPath,
            serveStatic(config.pluginsDir, {})
          );
        }

        // Thumbnail service: /thumbs_<key>/<slug>/<file> → cached 320-wide JPEG
        server.middlewares.use(createThumbsMiddleware({ presentationsDir, key, ffmpegBin: config.ffmpegBin }));
      }

      // Middleware to serve files from revelation_electron-wrapper/http_admin
      // This allows serving static files from the external folder
      if (config.adminDir && fs.existsSync(config.adminDir)) {
        // Admin UI is public-domain static HTML/JS (same as the GitHub repo), but
        // restrict to localhost — no reason to expose it on the LAN.
        server.middlewares.use('/admin', createAdminGate());
        server.middlewares.use(
          '/admin',
          serveStatic(config.adminDir, {
            index: false,
            fallthrough: true,
          })
        );
      } else {
        console.warn('⚠️  External http_admin folder not found — skipping mount.');
      }
    }
  };
}

// vite.config.js calls the export with no arguments (configured from the environment).
module.exports = createRevelationPlugin;
module.exports.createRevelationPlugin = createRevelationPlugin;
