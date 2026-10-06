// server/access-gates.js — the loopback-only gates in front of local-machine routes.
// Each factory returns a Connect middleware; `isLoopbackAddress` is the one from peer-server.js
// (127.0.0.1 / ::1 only). NOTE: behind a same-machine reverse proxy every forwarded request
// presents 127.0.0.1, so these gates pass for the whole internet; public relay mode exists for that
// deployment and removes every route these gates protect (see server/public-relay.js).
//   createSandboxOriginGate()  `Origin: null` (the builder preview iframe is sandboxed without
//                              allow-same-origin) is honoured only from loopback, except /peer/*;
//                              loopback OPTIONS preflights are answered 204.
//   createIndexJsonGate()      any path ending /index.json (presentations + _media) is loopback only.
//   createAdminGate()          /admin (the wrapper's http_admin pages) is loopback only.
// Mounted by vite.plugins.js in the order documented in its header.
const { isLoopbackAddress, normalizeRemoteAddress } = require('../peer-server.js');

function createSandboxOriginGate() {
  return (req, res, next) => {
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
  };
}

function createIndexJsonGate() {
  return (req, res, next) => {
    let parsedPathname = '';
    try {
      parsedPathname = new URL(req.url || '', 'http://localhost').pathname.toLowerCase();
    } catch (_) { /* malformed URL — let it fall through */ }

    if (parsedPathname.endsWith('/index.json')) {
      const isLocalhost = isLoopbackAddress(req.socket?.remoteAddress);

      if (!isLocalhost) {
        const clientIp = normalizeRemoteAddress(req.socket?.remoteAddress);
        console.log(`Attempted access from ${clientIp} blocked.`);
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('403 Forbidden: index.json access denied (localhost only)');
        return;
      }
    }

    next();
  };
}

function createAdminGate() {
  return (req, res, next) => {
    if (!isLoopbackAddress(req.socket?.remoteAddress)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('403 Forbidden: admin access is localhost only');
      return;
    }
    next();
  };
}

module.exports = { createSandboxOriginGate, createIndexJsonGate, createAdminGate };
