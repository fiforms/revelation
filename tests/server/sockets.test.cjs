// The two open Socket.IO brokers served by vite.plugins.js:
//   /socket.io                  Reveal Remote (presenter / remote / follower), per-channel UUID
//   /presenter-plugins-socket   plugin rooms (markerboard etc.), room id only
// Run against a real server with a real socket.io-client, so event names, rooms and sanitizing
// are checked as a browser would exercise them.
const test = require('node:test');
const assert = require('node:assert');
const { io } = require('socket.io-client');
const { startServer } = require('../helpers/vite-server.cjs');

let srv;
const sockets = [];
test.before(async () => { srv = await startServer({}); });
test.after(async () => { sockets.forEach((s) => s.close()); await srv.close(); });

function connect(socketPath) {
  const socket = io(srv.base, { path: socketPath, transports: ['websocket'], forceNew: true });
  sockets.push(socket);
  return new Promise((resolve, reject) => {
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
  });
}

const once = (socket, event, ms = 2000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`timed out waiting for "${event}"`)), ms);
  socket.once(event, (data) => { clearTimeout(timer); resolve(data); });
});

// Resolves true when `event` does NOT arrive within ms.
const silent = (socket, event, ms = 300) => new Promise((resolve) => {
  const handler = () => resolve(false);
  socket.once(event, handler);
  setTimeout(() => { socket.off(event, handler); resolve(true); }, ms);
});

async function startPresenter(extra = {}) {
  const socket = await connect('/socket.io');
  const init = once(socket, 'init');
  socket.emit('start', { type: 'presenter', shareUrl: 'http://host.test/deck?x=1#/2/3', ...extra });
  return { socket, info: await init };
}

// --- Reveal Remote ----------------------------------------------------------------------------

test('presenter start returns ids, a verifiable hash, URLs and QR codes', async () => {
  const { info } = await startPresenter();
  assert.match(info.remoteId, /^[0-9a-f-]{36}$/);
  assert.match(info.multiplexId, /^[0-9a-f-]{36}$/);
  assert.match(info.hash, /^[0-9a-f]{64}$/);
  assert.ok(info.remoteUrl.endsWith(`/_remote/ui/?${info.remoteId}`));
  assert.strictEqual(info.multiplexUrl, `http://host.test/deck?x=1&remoteMultiplexId=${info.multiplexId}`, 'fragment dropped, & used after an existing ?');
  assert.match(info.remoteImage, /^data:image\/png;base64,/);
  assert.match(info.multiplexImage, /^data:image\/png;base64,/);
});

test('a presenter can resume its channel with a valid hash but cannot forge one', async () => {
  const first = await startPresenter();
  const resumed = await startPresenter({ remoteId: first.info.remoteId, multiplexId: first.info.multiplexId, hash: first.info.hash });
  assert.strictEqual(resumed.info.remoteId, first.info.remoteId);

  const forged = await startPresenter({ remoteId: 'attacker-chosen-id', multiplexId: 'm-1', hash: 'f'.repeat(64) });
  assert.notStrictEqual(forged.info.remoteId, 'attacker-chosen-id', 'a bad hash gets a fresh channel');
  const tampered = await startPresenter({ remoteId: first.info.remoteId, multiplexId: 'other-multiplex', hash: first.info.hash });
  assert.notStrictEqual(tampered.info.remoteId, first.info.remoteId, 'hash covers both ids');
});

test('state, notes and buttons reach a remote; a late joiner is brought up to date', async () => {
  const { socket: presenter, info } = await startPresenter();
  presenter.emit('state_changed', { indexh: 2 });
  presenter.emit('notes_changed', { notes: 'hello' });
  presenter.emit('buttons_changed', { buttons: [{ id: 'go', label: 'Go' }] });
  await new Promise((r) => setTimeout(r, 100));

  const remote = await connect('/socket.io');
  const got = { state: once(remote, 'state_changed'), notes: once(remote, 'notes_changed'), buttons: once(remote, 'buttons_changed'), url: once(remote, 'presentation_url') };
  remote.emit('start', { type: 'remote', id: info.remoteId });
  assert.deepStrictEqual(await got.state, { indexh: 2 });
  assert.deepStrictEqual(await got.notes, { notes: 'hello' });
  assert.deepStrictEqual(await got.buttons, { buttons: [{ id: 'go', label: 'Go', title: '', disabled: false }] });
  assert.strictEqual((await got.url).url, info.multiplexUrl);

  const live = once(remote, 'state_changed');
  presenter.emit('state_changed', { indexh: 3 });
  assert.deepStrictEqual(await live, { indexh: 3 });
});

test('remote commands reach only the matching presenter, and only well-formed ones', async () => {
  const a = await startPresenter();
  const b = await startPresenter();
  const remote = await connect('/socket.io');
  remote.emit('start', { type: 'remote', id: a.info.remoteId });
  await once(a.socket, 'client_connected');

  const received = once(a.socket, 'command');
  remote.emit('command', { command: 'next' });
  assert.deepStrictEqual(await received, { command: 'next' });
  assert.ok(await silent(b.socket, 'command'), 'a different presenter hears nothing');

  const malformed = silent(a.socket, 'command');
  remote.emit('command', { command: 42 });
  remote.emit('command', 'next');
  remote.emit('command', null);
  assert.ok(await malformed, 'non-string commands are dropped');
});

test('remote buttons are clamped: count, id/label/title lengths, empty ids, types', async () => {
  const { socket: presenter, info } = await startPresenter();
  const remote = await connect('/socket.io');
  remote.emit('start', { type: 'remote', id: info.remoteId });
  await once(presenter, 'client_connected');

  const got = once(remote, 'buttons_changed');
  presenter.emit('buttons_changed', { buttons: [
    ...Array.from({ length: 20 }, (_, i) => ({ id: `b${i}`, label: 'L'.repeat(100), title: 'T'.repeat(500), disabled: 1 })),
  ] });
  const { buttons } = await got;
  assert.strictEqual(buttons.length, 12);
  assert.strictEqual(buttons[0].label.length, 40);
  assert.strictEqual(buttons[0].title.length, 120);
  assert.strictEqual(buttons[0].disabled, true);

  const second = once(remote, 'buttons_changed');
  presenter.emit('buttons_changed', { buttons: [{ id: '' }, { id: 7 }, null, 'x', { id: 'x'.repeat(100) }, { id: 'ok' }] });
  const cleaned = (await second).buttons;
  assert.deepStrictEqual(cleaned.map((b) => b.id.length), [64, 2]);
  assert.strictEqual(cleaned[1].label, 'ok', 'label defaults to the id');

  const third = once(remote, 'buttons_changed');
  presenter.emit('buttons_changed', 'not an object');
  assert.deepStrictEqual((await third).buttons, []);
});

test('followers get multiplex state and video commands; the last multiplex state is replayed', async () => {
  const { socket: presenter, info } = await startPresenter();
  presenter.emit('multiplex', { indexh: 4 });
  await new Promise((r) => setTimeout(r, 100));

  const follower = await connect('/socket.io');
  const replay = once(follower, 'multiplex');
  follower.emit('start', { type: 'follower', id: info.multiplexId });
  assert.deepStrictEqual(await replay, { indexh: 4 });

  const video = once(follower, 'video-command');
  presenter.emit('video-command', { action: 'play' });
  assert.deepStrictEqual(await video, { action: 'play' });
});

test('channel state is dropped when the presenter disconnects', async () => {
  const { socket: presenter, info } = await startPresenter();
  presenter.emit('state_changed', { indexh: 9 });
  presenter.emit('multiplex', { indexh: 9 });
  await new Promise((r) => setTimeout(r, 100));
  presenter.close();
  await new Promise((r) => setTimeout(r, 200));

  const remote = await connect('/socket.io');
  remote.emit('start', { type: 'remote', id: info.remoteId });
  assert.ok(await silent(remote, 'state_changed'), 'no stale state after the presenter left');
  const follower = await connect('/socket.io');
  follower.emit('start', { type: 'follower', id: info.multiplexId });
  assert.ok(await silent(follower, 'multiplex'), 'no stale multiplex after the presenter left');
});

test('bad start messages are ignored without taking the server down', async () => {
  const socket = await connect('/socket.io');
  socket.emit('start', undefined);
  const s2 = await connect('/socket.io');
  s2.emit('start', { type: 'presenter' }); // no shareUrl
  const s3 = await connect('/socket.io');
  s3.emit('start', { type: 'remote' });    // no id
  await new Promise((r) => setTimeout(r, 200));
  const { info } = await startPresenter();
  assert.ok(info.remoteId, 'server still healthy');
});

// --- Presenter plugins rooms ------------------------------------------------------------------

async function joinRoom(plugin, roomId) {
  const socket = await connect('/presenter-plugins-socket');
  const ack = await new Promise((resolve) => socket.emit('presenter-plugin:join', { plugin, roomId }, resolve));
  return { socket, ack };
}

test('plugin rooms: join acks, events fan out to the other members only, tagged with plugin and room', async () => {
  const a = await joinRoom('markerboard', 'room-abcdefgh');
  const b = await joinRoom('markerboard', 'room-abcdefgh');
  const other = await joinRoom('markerboard', 'room-zzzzzzzz');
  const otherPlugin = await joinRoom('captions', 'room-abcdefgh');
  assert.deepStrictEqual(a.ack, { ok: true, room: 'markerboard:room-abcdefgh' });

  const received = once(b.socket, 'presenter-plugin:event');
  const selfEcho = silent(a.socket, 'presenter-plugin:event');
  const wrongRoom = silent(other.socket, 'presenter-plugin:event');
  const wrongPlugin = silent(otherPlugin.socket, 'presenter-plugin:event');
  a.socket.emit('presenter-plugin:event', { type: 'stroke', payload: { x: 1 } });
  const event = await received;
  assert.strictEqual(event.plugin, 'markerboard');
  assert.strictEqual(event.roomId, 'room-abcdefgh');
  assert.strictEqual(event.type, 'stroke');
  assert.deepStrictEqual(event.payload, { x: 1 });
  assert.ok(Number.isFinite(event.ts));
  assert.ok(await selfEcho && await wrongRoom && await wrongPlugin);
});

test('plugin rooms: invalid plugin names and room ids are refused', async () => {
  const bad = [
    ['', 'room-abcdefgh'], ['Has Space', 'room-abcdefgh'], ['../x', 'room-abcdefgh'], ['x'.repeat(65), 'room-abcdefgh'],
    ['markerboard', ''], ['markerboard', 'short'], ['markerboard', 'room with space'], ['markerboard', 'r'.repeat(129)], ['markerboard', 'room:colon-1']
  ];
  for (const [plugin, roomId] of bad) {
    const { ack } = await joinRoom(plugin, roomId);
    assert.deepStrictEqual(ack, { ok: false, error: 'Invalid plugin or room' }, `${plugin} / ${roomId}`);
  }
  const { ack } = await joinRoom('MarkerBoard', 'room-abcdefgh');
  assert.strictEqual(ack.room, 'markerboard:room-abcdefgh', 'plugin names are lower-cased');
});

test('plugin rooms: events before joining, without a type, or with a junk payload are handled safely', async () => {
  const lurker = await joinRoom('markerboard', 'room-lurkers1');
  const loner = await connect('/presenter-plugins-socket');
  const heard = silent(lurker.socket, 'presenter-plugin:event');
  loner.emit('presenter-plugin:event', { type: 'x' });
  assert.ok(await heard, 'an event from a socket that never joined goes nowhere');

  const sender = await joinRoom('markerboard', 'room-lurkers1');
  const typeless = silent(lurker.socket, 'presenter-plugin:event');
  sender.socket.emit('presenter-plugin:event', { payload: {} });
  assert.ok(await typeless);

  const got = once(lurker.socket, 'presenter-plugin:event');
  sender.socket.emit('presenter-plugin:event', { type: 't', payload: 'not-an-object' });
  assert.deepStrictEqual((await got).payload, {}, 'non-object payload becomes {}');
});

test('plugin rooms: switching rooms leaves the old one', async () => {
  const mover = await joinRoom('markerboard', 'room-old-0001');
  const watcher = await joinRoom('markerboard', 'room-old-0001');
  await new Promise((resolve) => mover.socket.emit('presenter-plugin:join', { plugin: 'markerboard', roomId: 'room-new-0001' }, resolve));
  const heard = silent(watcher.socket, 'presenter-plugin:event');
  mover.socket.emit('presenter-plugin:event', { type: 'ping' });
  assert.ok(await heard, 'the old room no longer hears this socket');
});
