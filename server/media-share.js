// server/media-share.js — /media-share/<token>: files shared by the Electron app under opaque tokens.
// createMediaShare() -> { register, revoke, handleParentMessage, middleware }
//   The wrapper (plugins/mediashare) sends `register-media-token` {token, absolutePath, mimeType} and
//   `revoke-media-token` {token} over the utility-process parent port; handleParentMessage() consumes
//   those two message types (returns true when it handled one, false for anything else).
//   The real file path is never exposed: clients only see the 48-hex-char token (192 bits, a random
//   path secret, trust tier T2 in doc/SECURITY.md). Range requests are supported so video scrubbing works.
// Created by vite.plugins.js; mounted as the second middleware of the stack.
const fs = require('fs');

const MEDIA_TOKEN_RE = /^[a-f0-9]{48}$/;
const ROUTE_PREFIX = '/media-share/';

function createMediaShare() {
  const files = new Map(); // token → { absolutePath, mimeType }

  function register({ token, absolutePath, mimeType } = {}) {
    if (MEDIA_TOKEN_RE.test(token) && typeof absolutePath === 'string') {
      files.set(token, {
        absolutePath,
        mimeType: typeof mimeType === 'string' ? mimeType : 'application/octet-stream'
      });
      return true;
    }
    return false;
  }

  function revoke(token) {
    if (typeof token === 'string') files.delete(token);
  }

  function handleParentMessage(data) {
    if (data?.type === 'register-media-token') {
      register(data);
      return true;
    }
    if (data?.type === 'revoke-media-token') {
      revoke(data.token);
      return true;
    }
    return false;
  }

  function middleware(req, res, next) {
    if (!req.url.startsWith(ROUTE_PREFIX)) return next();
    const rawToken = req.url.slice(ROUTE_PREFIX.length).split('?')[0];
    if (!MEDIA_TOKEN_RE.test(rawToken)) { res.writeHead(404); return res.end(); }
    const entry = files.get(rawToken);
    if (!entry) { res.writeHead(404); return res.end(); }
    let stat;
    try { stat = fs.statSync(entry.absolutePath); }
    catch { res.writeHead(404); return res.end(); }
    const total = stat.size;
    const range = req.headers['range'];
    if (range) {
      const m = range.match(/bytes=(\d*)-(\d*)/);
      if (!m) {
        res.writeHead(416, { 'Content-Range': `bytes */${total}` });
        return res.end();
      }
      const start = m[1] ? parseInt(m[1], 10) : 0;
      const end   = m[2] ? parseInt(m[2], 10) : total - 1;
      if (start > end || end >= total) {
        res.writeHead(416, { 'Content-Range': `bytes */${total}` });
        return res.end();
      }
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Content-Type': entry.mimeType
      });
      fs.createReadStream(entry.absolutePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': total,
        'Content-Type': entry.mimeType,
        'Accept-Ranges': 'bytes'
      });
      fs.createReadStream(entry.absolutePath).pipe(res);
    }
  }

  return { register, revoke, handleParentMessage, middleware };
}

module.exports = { createMediaShare, MEDIA_TOKEN_RE };
