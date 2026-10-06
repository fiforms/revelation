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

  // A file deleted between statSync and open emits 'error'; without a handler that is uncaught.
  function pipeFile(res, stream) {
    stream.on('error', () => { if (!res.headersSent) res.writeHead(404); res.end(); });
    stream.pipe(res);
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
      const m = range.match(/^bytes=(\d*)-(\d*)$/);
      if (!m || (!m[1] && !m[2]) || total === 0) {
        res.writeHead(416, { 'Content-Range': `bytes */${total}` });
        return res.end();
      }
      let start, end;
      if (!m[1]) {
        // Suffix range: the last N bytes.
        start = Math.max(0, total - parseInt(m[2], 10));
        end = total - 1;
      } else {
        start = parseInt(m[1], 10);
        end = m[2] ? Math.min(parseInt(m[2], 10), total - 1) : total - 1;
      }
      if (start > end || start >= total) {
        res.writeHead(416, { 'Content-Range': `bytes */${total}` });
        return res.end();
      }
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Content-Type': entry.mimeType
      });
      pipeFile(res, fs.createReadStream(entry.absolutePath, { start, end }));
    } else {
      res.writeHead(200, {
        'Content-Length': total,
        'Content-Type': entry.mimeType,
        'Accept-Ranges': 'bytes'
      });
      pipeFile(res, fs.createReadStream(entry.absolutePath));
    }
  }

  return { register, revoke, handleParentMessage, middleware };
}

module.exports = { createMediaShare, MEDIA_TOKEN_RE };
