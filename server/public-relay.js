// server/public-relay.js — public relay mode (REVELATION_PUBLIC_SERVER=1 / --public-server).
// Runs the server as a bare Socket.IO relay for Reveal Remote and the presenter-plugins channel — the
// role revealremote.fiforms.org fills — with every local-machine feature switched off.
//
// This is the one deployment where the reverse-proxy weakness in the loopback gates actually bites:
// behind a same-machine proxy every forwarded request presents 127.0.0.1, so `isLoopbackAddress()`
// passes for the whole internet. Rather than teaching those gates about proxies, this mode removes
// everything they were guarding: no presentations, no plugins, no thumbnails, no media, no admin UI,
// no peer endpoints, no file watching, and no Vite static root. What remains is the two socket
// namespaces and the static remote-control UI, none of which touch this machine's files or config.
//
// configurePublicRelayServer(server, { rootDir, presenterPlugins, revealRemote })
//   `server` is the Vite dev server; the two brokers come from the other server/*-broker.js files.
//   Called by vite.plugins.js (configureServer) instead of building the normal middleware stack.
const fs = require('fs');
const path = require('path');
const serveStatic = require('serve-static');
const { PRESENTER_PLUGINS_SOCKET_PATH } = require('./presenter-plugins-broker');
const { REVEAL_REMOTE_SOCKET_PATH } = require('./reveal-remote-broker');

// Everything a public relay is allowed to answer. Socket.IO handles its own two paths on the HTTP
// server before Connect middlewares ever run, so they do not need entries here — they are listed
// for documentation and to keep the landing page honest.
const PUBLIC_RELAY_SOCKET_PATHS = [REVEAL_REMOTE_SOCKET_PATH, PRESENTER_PLUGINS_SOCKET_PATH];
// The only HTTP surface: the static remote-control UI. Self-contained —
// server-ui/index.html references nothing outside its own directory.
const PUBLIC_RELAY_UI_PREFIX = '/_remote/ui';

function configurePublicRelayServer(server, { rootDir, presenterPlugins, revealRemote }) {
  const remoteUiDir = path.resolve(rootDir, 'node_modules/reveal.js-remote/server-ui');

  // FIRST middleware, so it runs ahead of Vite's own static handling. Without
  // it Vite would serve the project root and /@fs/ to the internet.
  //
  // Deny by default: anything not explicitly allowed gets a flat 404, with no
  // hint as to whether the path exists.
  server.middlewares.use((req, res, next) => {
    let pathname = '';
    try {
      pathname = new URL(req.url || '', 'http://localhost').pathname;
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('400 Bad Request');
      return;
    }

    if (pathname === '/' || pathname === '/index.html') {
      // Deliberately contentless: says the service is alive, nothing about the
      // host, its version, or what else might be running on it.
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('REVELation relay: socket relay only.\n');
      return;
    }

    if (pathname === PUBLIC_RELAY_UI_PREFIX || pathname.startsWith(`${PUBLIC_RELAY_UI_PREFIX}/`)) {
      return next();
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
  });

  if (fs.existsSync(remoteUiDir)) {
    server.middlewares.use(PUBLIC_RELAY_UI_PREFIX, serveStatic(remoteUiDir, { fallthrough: false }));
  } else {
    console.warn(`⚠ Remote UI directory missing: ${remoteUiDir}`);
  }

  // The two relay socket paths. Peer pairing is deliberately NOT mounted
  // (neither peerServer.middleware for /peer/* nor peerServer.attachSocketServer()
  // for /peer-commands): it authenticates against this machine's config.json,
  // which a relay neither has nor should have.
  presenterPlugins.attach(server.httpServer);
  revealRemote.attach(server.httpServer);

  console.log('🔒 PUBLIC RELAY MODE');
  console.log(`   serving: ${PUBLIC_RELAY_SOCKET_PATHS.join(', ')}, ${PUBLIC_RELAY_UI_PREFIX}/`);
  console.log('   disabled: presentations, plugins, thumbnails, media, admin, peer endpoints, file watching, Vite static root');
}

module.exports = { configurePublicRelayServer, PUBLIC_RELAY_SOCKET_PATHS, PUBLIC_RELAY_UI_PREFIX };
