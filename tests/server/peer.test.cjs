// The master side of the peer protocol (server/peer-server.js) over real HTTP and Socket.IO, with a
// follower implemented here from the documented wire format (doc/dev/PEERING.md in the wrapper
// repo): enrollment with the PIN, per-request signed nonces, socket tokens, lockout, forgetting.
// createPeerServer() is a factory, so this mounts its middleware on a plain http server.
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { io } = require('socket.io-client');
const peer = require('../../server/peer-server.js');

const PIN = '123456';
const MASTER_ID = 'master-instance-1';

function keypair() {
  return crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
}
const sha256 = (v) => crypto.createHash('sha256').update(String(v), 'utf8').digest('hex');
const sign = (priv, message) => crypto.sign('RSA-SHA256', Buffer.from(message), priv).toString('base64');
const verify = (pub, message, sig) => crypto.verify('RSA-SHA256', Buffer.from(message), pub, Buffer.from(sig, 'base64'));

const master = keypair();
const follower = keypair();
const FOLLOWER_ID = 'follower-1';
const sockets = [];
let dir, server, base, posted, peerServer, configPath, followersPath;

function writeConfig(overrides = {}) {
  fs.writeFileSync(configPath, JSON.stringify({
    mdnsPublish: true, mdnsPairingPin: PIN, mdnsInstanceId: MASTER_ID, mdnsInstanceName: 'Master',
    peerRsaPublicKey: master.publicKey, peerRsaPrivateKey: master.privateKey, ...overrides
  }));
}

async function api(method, p, body, headers = {}) {
  const res = await fetch(`${base}${p}`, {
    method, headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body))
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text };
}

const authNonce = async () => (await api('GET', '/peer/auth-nonce')).json.nonce;

async function signedBody(purpose, extra = '', overrides = {}) {
  const nonce = await authNonce();
  const message = peer.peerFollowerAuthMessage({ purpose, masterId: MASTER_ID, followerId: FOLLOWER_ID, nonce, extra });
  return { followerInstanceId: FOLLOWER_ID, nonce, signature: sign(follower.privateKey, message), ...overrides };
}

const pair = (overrides = {}) => api('POST', '/peer/pair', {
  pin: PIN, followerInstanceId: FOLLOWER_ID, followerName: 'Laptop', followerPublicKey: follower.publicKey,
  challenge: 'hello-master', ...overrides
});

test.before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'revelation-peer-test-'));
  configPath = path.join(dir, 'config.json');
  followersPath = path.join(dir, 'peer-followers.json');
  writeConfig();
  posted = [];
  peerServer = peer.createPeerServer({ configPath, followersPath, postToParent: (m) => posted.push(m) });
  server = http.createServer((req, res) => peerServer.middleware(req, res, () => { res.writeHead(404); res.end('next'); }));
  peerServer.attachSocketServer(server);
  await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  sockets.forEach((s) => s.close());
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(dir, { recursive: true, force: true });
});

// --- Routing and gates ---------------------------------------------------------------------------

test('non-/peer/ requests fall through to the next middleware', async () => {
  assert.strictEqual((await api('GET', '/something')).text, 'next');
});

test('endpoints are disabled unless mDNS publishing is on, and fail clearly without a config', async () => {
  writeConfig({ mdnsPublish: false });
  const off = await api('GET', '/peer/public-key');
  assert.strictEqual(off.status, 403);
  assert.strictEqual(off.json.code, 'master-disabled');
  writeConfig({ mdnsPublish: 'true' });
  assert.strictEqual((await api('GET', '/peer/public-key')).status, 403, 'only boolean true enables it');
  fs.writeFileSync(configPath, '{broken');
  assert.strictEqual((await api('GET', '/peer/public-key')).status, 500);
  writeConfig();
  assert.strictEqual((await api('GET', '/peer/public-key')).status, 200);
});

test('public-key serves the peer identity, never the private key', async () => {
  const { json, text } = await api('GET', '/peer/public-key');
  assert.strictEqual(json.instanceId, MASTER_ID);
  assert.strictEqual(json.peerProtocol, peer.PEER_PROTOCOL_VERSION);
  assert.strictEqual(json.publicKey, master.publicKey);
  assert.strictEqual(json.publicKeyFingerprint, sha256(master.publicKey));
  assert.ok(!text.includes('PRIVATE KEY'));
});

test('unknown /peer/ paths are 404 JSON', async () => {
  const res = await api('GET', '/peer/nope');
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.json.error, 'Not found');
});

test('an unconfigured private key is reported, not used', async () => {
  writeConfig({ peerRsaPrivateKey: '' });
  assert.strictEqual((await pair()).status, 500);
  writeConfig();
});

// --- Pairing ------------------------------------------------------------------------------------

test('pairing fails closed when no PIN is configured, whatever the request says', async () => {
  for (const pin of [undefined, '', '   ', null, {}, []]) {
    writeConfig({ mdnsPairingPin: pin });
    for (const provided of [undefined, '', PIN, null]) {
      const res = await pair({ pin: provided });
      assert.strictEqual(res.status, 503, `configured=${JSON.stringify(pin)} provided=${JSON.stringify(provided)}`);
      assert.strictEqual(res.json.code, 'pairing-unavailable');
    }
  }
  writeConfig();
  assert.ok(!fs.existsSync(followersPath), 'nobody was enrolled');
});

test('input validation: id, challenge, key, body size and JSON', async () => {
  assert.strictEqual((await pair({ followerInstanceId: '../x' })).status, 400);
  assert.strictEqual((await pair({ followerInstanceId: '' })).status, 400);
  assert.strictEqual((await pair({ challenge: '' })).status, 400);
  assert.strictEqual((await pair({ challenge: 'c'.repeat(1025) })).status, 400);
  assert.strictEqual((await pair({ followerPublicKey: 'not a key' })).status, 400);
  const weak = crypto.generateKeyPairSync('rsa', { modulusLength: 1024, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
  assert.strictEqual((await pair({ followerPublicKey: weak.publicKey })).status, 400, 'RSA < 2048 bits is refused');
  const ec = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256', publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
  assert.strictEqual((await pair({ followerPublicKey: ec.publicKey })).status, 400, 'non-RSA is refused');
  assert.strictEqual((await api('POST', '/peer/pair', '{not json')).status, 400);
  assert.strictEqual((await api('POST', '/peer/pair', '[1,2]')).status, 400);
  assert.ok(!fs.existsSync(followersPath), 'nothing above enrolled anyone');
});

test('oversized request bodies are rejected with 413 (and the server survives)', async () => {
  // The server destroys the connection after answering, so use a dedicated one: a pooled
  // keep-alive socket reused by the next fetch() would see ECONNRESET.
  const outcome = await new Promise((resolve) => {
    const req = http.request(`${base}/peer/pair`, { method: 'POST', agent: false, headers: { 'content-type': 'application/json' } }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('error', () => resolve('closed'));
    req.end(JSON.stringify({ pin: PIN, filler: 'x'.repeat(70 * 1024) }));
  });
  assert.ok(outcome === 413 || outcome === 'closed', `got ${outcome}`);
  assert.strictEqual((await api('GET', '/peer/public-key')).status, 200, 'still serving');
});

// --- Enrollment and follower authentication --------------------------------------------------------

test('pairing with the right PIN enrolls the follower and proves the master holds its key', async () => {
  const res = await pair();
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.json.instanceId, MASTER_ID);
  assert.strictEqual(res.json.peerProtocol, peer.PEER_PROTOCOL_VERSION);
  assert.ok(verify(master.publicKey, `revelation-peer-challenge:v1:${sha256('hello-master')}`, res.json.signature),
    'the follower can verify the master signed its challenge under the peer-challenge domain');
  assert.ok(!verify(master.publicKey, 'hello-master', res.json.signature), 'the raw challenge is never what gets signed');

  const store = JSON.parse(fs.readFileSync(followersPath, 'utf8'));
  assert.strictEqual(store.followers.length, 1);
  assert.strictEqual(store.followers[0].instanceId, FOLLOWER_ID);
  assert.strictEqual(store.followers[0].name, 'Laptop');
  assert.strictEqual(store.followers[0].publicKey, follower.publicKey);
  assert.ok(posted.some((m) => m.type === 'peer-followers-changed'), 'main process is told');
});

test('re-pairing the same follower replaces its record instead of duplicating it', async () => {
  const res = await pair({ followerName: 'Laptop renamed' });
  assert.strictEqual(res.status, 200);
  const { followers } = JSON.parse(fs.readFileSync(followersPath, 'utf8'));
  assert.strictEqual(followers.length, 1);
  assert.strictEqual(followers[0].name, 'Laptop renamed');
});

test('auth nonces are stateless to issue and unique', async () => {
  const [a, b] = [await authNonce(), await authNonce()];
  assert.notStrictEqual(a, b);
  assert.match(a, /^\d+\.[0-9a-f]{32}\.[0-9a-f]{64}$/);
});

test('challenge: a correctly signed request is answered with a domain-separated signature', async () => {
  const body = await signedBody('challenge', 'prove-it');
  const res = await api('POST', '/peer/challenge', { ...body, challenge: 'prove-it' });
  assert.strictEqual(res.status, 200);
  assert.ok(verify(master.publicKey, `revelation-peer-challenge:v1:${sha256('prove-it')}`, res.json.signature));
});

test('a nonce works once: replaying a valid signed request is refused', async () => {
  const body = { ...(await signedBody('challenge', 'once')), challenge: 'once' };
  assert.strictEqual((await api('POST', '/peer/challenge', body)).status, 200);
  const replay = await api('POST', '/peer/challenge', body);
  assert.strictEqual(replay.status, 401);
  assert.strictEqual(replay.json.code, 'invalid-nonce');
});

test('forged, tampered and mis-scoped follower signatures are refused', async () => {
  const intruder = keypair();
  const fresh = async (purpose, extra) => {
    const nonce = await authNonce();
    return { nonce, message: peer.peerFollowerAuthMessage({ purpose, masterId: MASTER_ID, followerId: FOLLOWER_ID, nonce, extra }) };
  };

  let { nonce, message } = await fresh('challenge', 'x');
  let res = await api('POST', '/peer/challenge', { followerInstanceId: FOLLOWER_ID, nonce, challenge: 'x', signature: sign(intruder.privateKey, message) });
  assert.strictEqual(res.json.code, 'invalid-signature', 'signed with someone else\'s key');

  ({ nonce, message } = await fresh('challenge', 'x'));
  res = await api('POST', '/peer/challenge', { followerInstanceId: FOLLOWER_ID, nonce, challenge: 'DIFFERENT', signature: sign(follower.privateKey, message) });
  assert.strictEqual(res.json.code, 'invalid-signature', 'challenge changed after signing');

  ({ nonce, message } = await fresh('socket-info', ''));
  res = await api('POST', '/peer/challenge', { followerInstanceId: FOLLOWER_ID, nonce, challenge: '', signature: sign(follower.privateKey, message) });
  assert.notStrictEqual(res.status, 200, 'a signature for one purpose is not valid for another');

  ({ nonce, message } = await fresh('challenge', 'x'));
  res = await api('POST', '/peer/challenge', { followerInstanceId: 'unknown-follower', nonce, challenge: 'x', signature: sign(follower.privateKey, message) });
  assert.strictEqual(res.json.code, 'not-paired');

  res = await api('POST', '/peer/challenge', { followerInstanceId: FOLLOWER_ID, nonce: 'made.up.nonce', challenge: 'x', signature: 'AAAA' });
  assert.strictEqual(res.json.code, 'invalid-nonce');
  const forgedMac = (await authNonce()).replace(/[0-9a-f]$/, (c) => (c === '0' ? '1' : '0'));
  res = await api('POST', '/peer/challenge', { followerInstanceId: FOLLOWER_ID, nonce: forgedMac, challenge: 'x', signature: 'AAAA' });
  assert.strictEqual(res.json.code, 'invalid-nonce', 'a nonce with a tampered MAC');

  res = await api('POST', '/peer/challenge', { followerInstanceId: '../etc', nonce, challenge: 'x', signature: 'AAAA' });
  assert.strictEqual(res.status, 400);
});

test('status is a cursor-based event feed, and loopback-only', async (t) => {
  const first = (await api('GET', '/peer/status')).json;
  assert.deepStrictEqual(first.events, [], 'no cursor, no history');
  assert.ok(first.lastEventId >= 1);
  assert.strictEqual((await pair({ followerName: 'Again' })).status, 200);
  const next = (await api('GET', `/peer/status?since=${first.lastEventId}`)).json;
  assert.deepStrictEqual(next.events.map((e) => e.type), ['follower-paired']);
  assert.ok(next.lastEventId > first.lastEventId);

  const lan = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal);
  if (!lan) return t.skip('no non-loopback IPv4 interface on this machine');
  const res = await fetch(`http://${lan.address}:${server.address().port}/peer/status`);
  assert.strictEqual(res.status, 403);
});

// --- Command socket ----------------------------------------------------------------------------------

async function socketInfo() {
  const res = await api('POST', '/peer/socket-info', await signedBody('socket-info'));
  assert.strictEqual(res.status, 200, res.text);
  return res.json;
}

function connectSocket(auth) {
  const socket = io(base, { path: peer.PEER_SOCKET_PATH, transports: ['websocket'], forceNew: true, auth, reconnection: false });
  sockets.push(socket);
  return new Promise((resolve) => {
    socket.on('connect', () => resolve({ socket }));
    socket.on('connect_error', (err) => resolve({ error: err }));
  });
}

test('socket-info issues a short-lived signed token that opens the command socket', async () => {
  const info = await socketInfo();
  assert.strictEqual(info.socketPath, peer.PEER_SOCKET_PATH);
  assert.match(info.token, /^[0-9a-f]{32}$/);
  assert.ok(info.expiresAt > Date.now() && info.expiresAt <= Date.now() + 61_000);
  assert.ok(
    verify(master.publicKey, `revelation-peer-socket:v1:${sha256(`${info.token}:${info.expiresAt}:${peer.PEER_SOCKET_PATH}`)}`, info.signature),
    'the master signs the socket grant so the follower can authenticate the master'
  );

  const { socket, error } = await connectSocket({ token: info.token, expiresAt: info.expiresAt, signature: info.signature });
  assert.ok(socket, error?.message);
  socket.close();
});

test('socket auth refuses missing, unknown, mismatched and tampered grants', async () => {
  const info = await socketInfo();
  const cases = {
    'no auth': {},
    'unknown token': { token: 'f'.repeat(32), expiresAt: info.expiresAt, signature: info.signature },
    'wrong expiry': { token: info.token, expiresAt: info.expiresAt + 1, signature: info.signature },
    'bad signature': { token: info.token, expiresAt: info.expiresAt, signature: Buffer.alloc(256, 1).toString('base64') }
  };
  for (const [name, auth] of Object.entries(cases)) {
    const { socket, error } = await connectSocket(auth);
    assert.ok(!socket, `${name} must not connect`);
    assert.ok(error?.data?.code, `${name} gets a coded error`);
  }
});

test('commands from the main process reach connected followers; unknown parent messages are ignored', async () => {
  const info = await socketInfo();
  const { socket } = await connectSocket({ token: info.token, expiresAt: info.expiresAt, signature: info.signature });
  assert.ok(socket);
  const events = [];
  socket.onAny((name, ...args) => events.push([name, ...args]));
  assert.strictEqual(peerServer.handleParentMessage({ type: 'peer-command', requestId: 'r1', command: { type: 'open', slug: 'demo' } }), true);
  await new Promise((r) => setTimeout(r, 200));
  assert.ok(events.length >= 1, 'follower received the command');
  assert.ok(posted.some((m) => m.type === 'peer-command-result' && m.requestId === 'r1' && !m.error));
  assert.strictEqual(peerServer.handleParentMessage({ type: 'something-else' }), false);
  assert.strictEqual(peerServer.handleParentMessage(null), false);
});

test('forgetting a follower revokes it: sockets drop and signed requests stop working', async () => {
  const info = await socketInfo();
  const { socket } = await connectSocket({ token: info.token, expiresAt: info.expiresAt, signature: info.signature });
  const closed = new Promise((resolve) => socket.on('disconnect', resolve));
  peerServer.handleParentMessage({ type: 'peer-forget-follower', instanceId: FOLLOWER_ID, requestId: 'f1' });
  await closed;
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(followersPath, 'utf8')).followers, []);
  assert.ok(posted.some((m) => m.type === 'peer-followers-changed' && m.requestId === 'f1'));
  const after = await api('POST', '/peer/socket-info', await signedBody('socket-info'));
  assert.strictEqual(after.json.code, 'not-paired');
  // Invalid ids are acknowledged without touching the store.
  assert.strictEqual(peerServer.handleParentMessage({ type: 'peer-forget-follower', instanceId: '../x' }), true);
});

test('forget-all clears every follower', async () => {
  assert.strictEqual((await pair()).status, 200);
  assert.strictEqual((await pair({ followerInstanceId: 'follower-2' })).status, 200);
  assert.strictEqual(JSON.parse(fs.readFileSync(followersPath, 'utf8')).followers.length, 2);
  peerServer.handleParentMessage({ type: 'peer-forget-all-followers', requestId: 'all' });
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(followersPath, 'utf8')).followers, []);
});

// --- Lockout: LAST, because it blocks this machine's address for 60 seconds. ------------------------------

test('a wrong PIN is counted, the third failure locks that address out, even for the right PIN', async () => {
  const first = await pair({ pin: '000000' });
  assert.strictEqual(first.status, 403);
  assert.strictEqual(first.json.code, 'invalid-pin');
  assert.strictEqual(first.json.remainingAttempts, 2);
  assert.strictEqual((await pair({ pin: '000001' })).json.remainingAttempts, 1);
  const third = await pair({ pin: '000002' });
  assert.strictEqual(third.status, 429);
  assert.strictEqual(third.json.code, 'pin-lockout');
  assert.ok(third.json.retryAfterSec >= 1 && third.json.retryAfterSec <= 60);
  const locked = await pair();
  assert.strictEqual(locked.status, 429, 'the correct PIN is also refused while locked out');
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(followersPath, 'utf8')).followers, [], 'nobody was enrolled while locked out');
});
