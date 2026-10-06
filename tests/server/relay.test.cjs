// Public relay mode (REVELATION_PUBLIC_SERVER=1): a bare socket relay with every local-machine
// feature switched off. The point of these tests is the deny-by-default surface: a relay may be
// reachable from the internet through a same-machine reverse proxy, where every request looks
// like loopback, so nothing local may be routable at all.
const test = require('node:test');
const assert = require('node:assert');
const { io } = require('socket.io-client');
const { startServer, REVELATION_ROOT } = require('../helpers/vite-server.cjs');

let srv;
test.before(async () => { srv = await startServer({ relay: true }); });
test.after(() => srv.close());

const get = (p, init) => fetch(`${srv.base}${p}`, init);

test('the landing page says only that the relay is alive', async () => {
  for (const p of ['/', '/index.html']) {
    const res = await get(p);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(await res.text(), 'REVELation relay: socket relay only.\n');
  }
});

test('everything outside the remote UI is a flat 404, including Vite internals and project files', async () => {
  const paths = [
    '/presentations.html', '/presentation.html', '/handout.html', '/vite.plugins.js', '/package.json',
    '/@fs/etc/hosts', `/@fs${REVELATION_ROOT}/package.json`, '/@vite/client', '/node_modules/vite/package.json',
    '/admin/', '/media-share/' + 'a'.repeat(48), '/publish/x.rev', '/css/black.css', '/js/presentations.js',
    '/presentations_x/index.json', '/plugins_x/', '/thumbs_x/a.png', '/_media/index.json', '/src/../package.json'
  ];
  for (const p of paths) {
    const res = await get(p);
    assert.strictEqual(res.status, 404, `${p} must be 404`);
    assert.strictEqual(await res.text(), '404 Not Found', `${p} must not reveal anything`);
  }
});

test('peer pairing endpoints are not mounted', async () => {
  for (const p of ['/peer/status', '/peer/public-key', '/peer/auth-nonce']) {
    assert.strictEqual((await get(p)).status, 404, p);
  }
  assert.strictEqual((await get('/peer/pair', { method: 'POST', body: '{}' })).status, 404);
});

test('the static remote-control UI is served', async () => {
  const res = await get('/_remote/ui/');
  assert.strictEqual(res.status, 200);
  assert.match(res.headers.get('content-type'), /html/);
});

test('the remote UI path cannot be used to escape its directory', async () => {
  for (const p of ['/_remote/ui/../../package.json', '/_remote/ui/%2e%2e/%2e%2e/package.json', '/_remote/ui/..%2f..%2fpackage.json']) {
    const res = await get(p);
    assert.ok(![200, 206].includes(res.status) || !(await res.text()).includes('"name": "revelation"'), `${p} leaked package.json`);
  }
});

test('malformed request targets get 400/404, never a stack trace', async () => {
  const res = await get('/%');
  assert.ok([400, 404].includes(res.status), String(res.status));
  assert.ok(!(await res.text()).includes('at '), 'no stack trace');
});

test('both relay sockets still work (Reveal Remote handshake and presenter-plugins rooms)', async () => {
  const presenter = io(srv.base, { path: '/socket.io', transports: ['websocket'] });
  const init = new Promise((resolve) => presenter.on('init', resolve));
  presenter.emit('start', { type: 'presenter', shareUrl: 'http://example.test/x#/1' });
  const info = await init;
  assert.match(info.remoteId, /^[0-9a-f-]{36}$/);
  presenter.close();

  const plugins = io(srv.base, { path: '/presenter-plugins-socket', transports: ['websocket'] });
  const ack = await new Promise((resolve) => plugins.emit('presenter-plugin:join', { plugin: 'markerboard', roomId: 'room-12345678' }, resolve));
  assert.deepStrictEqual(ack, { ok: true, room: 'markerboard:room-12345678' });
  plugins.close();
});
