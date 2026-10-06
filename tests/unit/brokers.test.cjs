// The two Socket.IO brokers (server/presenter-plugins-broker.js, server/reveal-remote-broker.js) on a
// plain http.Server: input sanitizers, isolation between broker instances, and shutdown semantics.
// (tests/server/sockets.test.cjs covers the same protocols through a full Vite server.)
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { io } = require('socket.io-client');
const plugins = require('../../server/presenter-plugins-broker.js');
const remote = require('../../server/reveal-remote-broker.js');

// The brokers log a line when they attach. In a test child process stdout also carries the test
// runner's own serialized events, and a stray line can corrupt that stream ("Unable to deserialize
// cloned data"), so keep the code under test quiet.
console.log = () => {};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const once = (socket, event, ms = 2000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), ms);
  socket.once(event, (d) => { clearTimeout(timer); resolve(d); });
});

async function listen() {
  const server = http.createServer((req, res) => { res.writeHead(404); res.end(); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}
const connect = (url, path) => new Promise((resolve, reject) => {
  const socket = io(url, { path, transports: ['websocket'], forceNew: true, reconnection: false });
  socket.on('connect', () => resolve(socket));
  socket.on('connect_error', reject);
});

test('sanitizePluginName: lower-cases and accepts [a-z0-9_-], 1-64 chars, starting alphanumeric', () => {
  const { sanitizePluginName: s } = plugins;
  assert.strictEqual(s('MarkerBoard'), 'markerboard');
  assert.strictEqual(s('  bibletext-live '), 'bibletext-live');
  assert.strictEqual(s('a'), 'a');
  assert.strictEqual(s('a'.repeat(64)), 'a'.repeat(64));
  for (const bad of ['', '   ', null, undefined, '-x', '_x', 'a b', 'a/b', '../x', 'a.b', 'a'.repeat(65), 'é', 'a:b']) assert.strictEqual(s(bad), '', JSON.stringify(bad));
});

test('sanitizeRoomId: [A-Za-z0-9_-], 8-128 chars, case preserved', () => {
  const { sanitizeRoomId: s } = plugins;
  assert.strictEqual(s('Room-1234'), 'Room-1234');
  assert.strictEqual(s(' abcdefgh '), 'abcdefgh');
  assert.strictEqual(s('a'.repeat(128)), 'a'.repeat(128));
  for (const bad of ['', 'abcdefg', 'a'.repeat(129), 'room 1234', 'room:1234', 'room/1234', null, undefined]) assert.strictEqual(s(bad), '', JSON.stringify(bad));
});

test('sanitizeRevealRemoteButtons: caps, truncation, typing, and non-object input', () => {
  const { sanitizeRevealRemoteButtons: s, REVEAL_REMOTE_MAX_BUTTONS } = remote;
  assert.strictEqual(REVEAL_REMOTE_MAX_BUTTONS, 12);
  assert.deepStrictEqual(s(undefined), []);
  assert.deepStrictEqual(s('x'), []);
  assert.deepStrictEqual(s({ buttons: 'nope' }), []);
  assert.deepStrictEqual(s({ buttons: [null, 'a', 5, {}, { id: '' }, { id: 1 }] }), []);
  assert.deepStrictEqual(s({ buttons: [{ id: 'go' }] }), [{ id: 'go', label: 'go', title: '', disabled: false }]);
  assert.deepStrictEqual(s({ buttons: [{ id: 'g', label: 0, title: 7, disabled: 'yes' }] }), [{ id: 'g', label: '0', title: '', disabled: true }]);
  const long = s({ buttons: [{ id: 'i'.repeat(100), label: 'l'.repeat(100), title: 't'.repeat(500) }] })[0];
  assert.deepStrictEqual([long.id.length, long.label.length, long.title.length], [64, 40, 120]);
  assert.strictEqual(s({ buttons: Array.from({ length: 30 }, (_, i) => ({ id: `b${i}` })) }).length, 12);
});

test('attach is idempotent and needs an HTTP server', async () => {
  const b = plugins.createPresenterPluginsBroker();
  assert.strictEqual(b.attach(null), null);
  const { server } = await listen();
  const first = b.attach(server);
  assert.ok(first);
  assert.strictEqual(b.attach(server), first, 'second attach returns the same Socket.IO server');
  b.close();
  b.close(); // safe to repeat
  await new Promise((r) => server.close(r));
});

test('two plugin brokers are fully independent (own rooms, own server)', async () => {
  const a = await listen();
  const b = await listen();
  const brokerA = plugins.createPresenterPluginsBroker();
  const brokerB = plugins.createPresenterPluginsBroker();
  brokerA.attach(a.server);
  brokerB.attach(b.server);
  const join = (s, room) => new Promise((r) => s.emit('presenter-plugin:join', { plugin: 'markerboard', roomId: room }, r));
  const sa1 = await connect(a.url, plugins.PRESENTER_PLUGINS_SOCKET_PATH);
  const sa2 = await connect(a.url, plugins.PRESENTER_PLUGINS_SOCKET_PATH);
  const sb = await connect(b.url, plugins.PRESENTER_PLUGINS_SOCKET_PATH);
  for (const s of [sa1, sa2, sb]) await join(s, 'shared-room-1');
  const heard = once(sa2, 'presenter-plugin:event');
  let leaked = false;
  sb.once('presenter-plugin:event', () => { leaked = true; });
  sa1.emit('presenter-plugin:event', { type: 'x', payload: { n: 1 } });
  assert.deepStrictEqual((await heard).payload, { n: 1 });
  await sleep(100);
  assert.strictEqual(leaked, false);
  [sa1, sa2, sb].forEach((s) => s.close());
  brokerA.close(); brokerB.close();
  await Promise.all([a, b].map(({ server }) => new Promise((r) => server.close(r))));
});

test('two Reveal Remote brokers do not share channels, hash secrets or state', async () => {
  const a = await listen();
  const b = await listen();
  const brokerA = remote.createRevealRemoteBroker();
  const brokerB = remote.createRevealRemoteBroker();
  brokerA.attach(a.server);
  brokerB.attach(b.server);
  const presenter = await connect(a.url, remote.REVEAL_REMOTE_SOCKET_PATH);
  const init = once(presenter, 'init');
  presenter.emit('start', { type: 'presenter', shareUrl: 'http://x.test/d' });
  const info = await init;

  // Resuming on the OTHER broker with a hash minted by A must fail: each broker has its own secret.
  const other = await connect(b.url, remote.REVEAL_REMOTE_SOCKET_PATH);
  const otherInit = once(other, 'init');
  other.emit('start', { type: 'presenter', shareUrl: 'http://x.test/d', remoteId: info.remoteId, multiplexId: info.multiplexId, hash: info.hash });
  assert.notStrictEqual((await otherInit).remoteId, info.remoteId);

  // A remote on B asking for A's channel gets nothing.
  presenter.emit('state_changed', { indexh: 1 });
  await sleep(80);
  const stranger = await connect(b.url, remote.REVEAL_REMOTE_SOCKET_PATH);
  let got = false;
  stranger.on('state_changed', () => { got = true; });
  stranger.emit('start', { type: 'remote', id: info.remoteId });
  await sleep(150);
  assert.strictEqual(got, false);
  [presenter, other, stranger].forEach((s) => s.close());
  brokerA.close(); brokerB.close();
  await Promise.all([a, b].map(({ server }) => new Promise((r) => server.close(r))));
});

test('close() drops every client but leaves the HTTP server running and closable by its owner', async () => {
  const { server, url } = await listen();
  const broker = plugins.createPresenterPluginsBroker();
  broker.attach(server);
  const client = await connect(url, plugins.PRESENTER_PLUGINS_SOCKET_PATH);
  const disconnected = once(client, 'disconnect');
  broker.close();
  await disconnected;
  assert.strictEqual(server.listening, true, 'the owner of the HTTP server decides when it closes');
  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

test('after close() a broker can be attached again to a new server', async () => {
  const first = await listen();
  const broker = remote.createRevealRemoteBroker();
  broker.attach(first.server);
  broker.close();
  await new Promise((r) => first.server.close(r));
  const second = await listen();
  assert.ok(broker.attach(second.server));
  const s = await connect(second.url, remote.REVEAL_REMOTE_SOCKET_PATH);
  s.close();
  broker.close();
  await new Promise((r) => second.server.close(r));
});
