// server/media-share.js: token registry, parent-port message handling and the streaming middleware.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { createMediaShare, MEDIA_TOKEN_RE } = require('../../server/media-share.js');
const { tmpDir, remove } = require('../helpers/tmp.cjs');

const T1 = 'a1'.repeat(24);
const DATA = Buffer.from('0123456789');

async function withServer(fn) {
  const dir = tmpDir();
  const file = path.join(dir, 'm.bin');
  fs.writeFileSync(file, DATA);
  const share = createMediaShare();
  const server = http.createServer((req, res) => share.middleware(req, res, () => { res.writeHead(418); res.end('next'); }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn({ share, base, file, dir }); }
  finally { server.closeAllConnections?.(); await new Promise((r) => server.close(r)); remove(dir); }
}

test('token format: exactly 48 lowercase hex characters', () => {
  assert.ok(MEDIA_TOKEN_RE.test(T1));
  for (const bad of ['', 'a'.repeat(47), 'a'.repeat(49), 'A'.repeat(48), 'g'.repeat(48), ` ${T1}`, `${T1}\n`]) {
    assert.ok(!MEDIA_TOKEN_RE.test(bad), JSON.stringify(bad));
  }
});

test('register validates the token and path; mime type defaults to octet-stream', async () => {
  await withServer(async ({ share, base, file }) => {
    assert.strictEqual(share.register({ token: 'nope', absolutePath: file }), false);
    assert.strictEqual(share.register({ token: T1, absolutePath: 5 }), false);
    assert.strictEqual(share.register(), false);
    assert.strictEqual((await fetch(`${base}/media-share/${T1}`)).status, 404);
    assert.strictEqual(share.register({ token: T1, absolutePath: file }), true);
    assert.strictEqual((await fetch(`${base}/media-share/${T1}`)).headers.get('content-type'), 'application/octet-stream');
    share.register({ token: T1, absolutePath: file, mimeType: 'audio/mpeg' });
    assert.strictEqual((await fetch(`${base}/media-share/${T1}`)).headers.get('content-type'), 'audio/mpeg', 're-registering replaces');
    share.register({ token: T1, absolutePath: file, mimeType: 42 });
    assert.strictEqual((await fetch(`${base}/media-share/${T1}`)).headers.get('content-type'), 'application/octet-stream');
  });
});

test('handleParentMessage consumes only the two media message types', async () => {
  await withServer(async ({ share, base, file }) => {
    assert.strictEqual(share.handleParentMessage({ type: 'register-media-token', token: T1, absolutePath: file }), true);
    assert.strictEqual((await fetch(`${base}/media-share/${T1}`)).status, 200);
    assert.strictEqual(share.handleParentMessage({ type: 'register-media-token', token: 'bad' }), true, 'handled even when invalid');
    assert.strictEqual(share.handleParentMessage({ type: 'revoke-media-token', token: T1 }), true);
    assert.strictEqual((await fetch(`${base}/media-share/${T1}`)).status, 404);
    for (const other of [{ type: 'peer-command' }, { type: 'other' }, {}, null, undefined, 'x']) {
      assert.strictEqual(share.handleParentMessage(other), false, JSON.stringify(other));
    }
    share.revoke(42); // ignored
  });
});

test('middleware: other paths fall through; bad/unknown tokens and vanished files are 404', async () => {
  await withServer(async ({ share, base, file, dir }) => {
    assert.strictEqual((await fetch(`${base}/other`)).status, 418);
    assert.strictEqual((await fetch(`${base}/media-share`)).status, 418, 'prefix needs the trailing slash');
    for (const t of ['', 'short', 'z'.repeat(48), `${T1}/x`, `${T1}%2F..`]) {
      assert.strictEqual((await fetch(`${base}/media-share/${t}`)).status, 404, t);
    }
    assert.strictEqual((await fetch(`${base}/media-share/${T1}`)).status, 404, 'unknown');
    const gone = path.join(dir, 'gone');
    fs.writeFileSync(gone, 'x');
    share.register({ token: T1, absolutePath: gone });
    fs.rmSync(gone);
    assert.strictEqual((await fetch(`${base}/media-share/${T1}`)).status, 404, 'file vanished');
  });
});

test('middleware: full body, ignoring a query string, with length and Accept-Ranges', async () => {
  await withServer(async ({ share, base, file }) => {
    share.register({ token: T1, absolutePath: file, mimeType: 'video/mp4' });
    const res = await fetch(`${base}/media-share/${T1}?cachebust=1`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('content-length'), '10');
    assert.strictEqual(res.headers.get('accept-ranges'), 'bytes');
    assert.ok(Buffer.from(await res.arrayBuffer()).equals(DATA));
  });
});

test('middleware: byte ranges (closed, open-ended, suffix-less start) and every invalid shape', async () => {
  await withServer(async ({ share, base, file }) => {
    share.register({ token: T1, absolutePath: file });
    const get = (range) => fetch(`${base}/media-share/${T1}`, { headers: { range } });
    const cases = [
      ['bytes=0-0', 206, '0', 'bytes 0-0/10'],
      ['bytes=2-4', 206, '234', 'bytes 2-4/10'],
      ['bytes=7-', 206, '789', 'bytes 7-9/10'],
      ['bytes=-', 206, '0123456789', 'bytes 0-9/10'],
      ['bytes=9-9', 206, '9', 'bytes 9-9/10']
    ];
    for (const [range, status, body, contentRange] of cases) {
      const res = await get(range);
      assert.strictEqual(res.status, status, range);
      assert.strictEqual(await res.text(), body, range);
      assert.strictEqual(res.headers.get('content-range'), contentRange, range);
    }
    for (const bad of ['bytes=5-2', 'bytes=0-10', 'bytes=10-', 'bytes=50-60', 'nonsense']) {
      const res = await get(bad);
      assert.strictEqual(res.status, 416, bad);
      assert.strictEqual(res.headers.get('content-range'), 'bytes */10', bad);
    }
  });
});

test('registries are per instance: a token registered on one share is unknown to another', async () => {
  await withServer(async ({ share, base, file }) => {
    const other = createMediaShare();
    const server = http.createServer((req, res) => other.middleware(req, res, () => { res.writeHead(418); res.end(); }));
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    try {
      share.register({ token: T1, absolutePath: file });
      assert.strictEqual((await fetch(`${base}/media-share/${T1}`)).status, 200);
      assert.strictEqual((await fetch(`http://127.0.0.1:${server.address().port}/media-share/${T1}`)).status, 404);
    } finally {
      server.closeAllConnections?.();
      await new Promise((r) => server.close(r));
    }
  });
});
