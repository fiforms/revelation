// Several servers, in different modes, in ONE process. This is what createRevelationPlugin(options)
// makes possible (the plugin used to keep its mode and state in module-level variables): isolation
// between instances, standalone mode against a temp folder, and clean shutdown of everything a
// plugin instance starts.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { io } = require('socket.io-client');
const { startServer } = require('../helpers/vite-server.cjs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TOKEN = 'ab'.repeat(24);
const front = (title) => `---\ntitle: ${title}\n---\n\n# ${title}\n`;
const servers = [];
const start = async (options) => { const s = await startServer(options); servers.push(s); return s; };
test.after(async () => { for (const s of servers.splice(0)) await s.close().catch(() => {}); });

test('a relay, a custom-path server and a standalone server run side by side', async () => {
  const [relay, custom, standalone] = await Promise.all([
    start({ relay: true }),
    start({ files: { 'demo/presentation.md': front('Custom Deck') } }),
    start({ standalone: true, gui: false, key: 'solo', files: { 'demo/presentation.md': front('Solo Deck') } })
  ]);
  assert.strictEqual((await fetch(`${relay.base}/`)).status, 200);
  assert.strictEqual((await fetch(`${relay.base}/presentations_${custom.key}/index.json`)).status, 404, 'the relay serves nothing local');

  const customIndex = await (await fetch(`${custom.base}/presentations_${custom.key}/index.json`)).json();
  assert.deepStrictEqual(customIndex.map((e) => e.title), ['Custom Deck']);

  // Standalone, non-GUI: the index is written next to the presentations, with the README deck.
  const written = JSON.parse(fs.readFileSync(path.join(standalone.dirs.presentations, 'index.json'), 'utf8'));
  assert.deepStrictEqual(written.map((e) => e.slug).sort(), ['demo', 'readme']);
  assert.strictEqual(written.find((e) => e.slug === 'demo').title, 'Solo Deck');
  assert.ok(fs.existsSync(path.join(standalone.dirs.presentations, 'readme', 'presentation.md')));
  assert.ok(!fs.existsSync(path.join(standalone.dirs.userData, '.revelation-cache')), 'no GUI cache in non-GUI mode');
  const rewritten = await fetch(`${standalone.base}/presentations_solo/demo/`);
  assert.strictEqual(rewritten.status, 200, 'slug URL rewrite works in standalone mode');
  const thumbs = await fetch(`${standalone.base}/thumbs_solo/demo/presentation.md`);
  assert.notStrictEqual(thumbs.headers.get('content-type'), 'image/jpeg', 'the thumbnail route is custom-path only');
});

test('instances do not share media tokens, parent ports or posted messages', async () => {
  const a = await start({ files: { 'x/presentation.md': front('A') } });
  const b = await start({ files: { 'x/presentation.md': front('B') } });
  const file = path.join(a.dirs.userData, 'shared.bin');
  fs.writeFileSync(file, 'hello');
  a.send({ type: 'register-media-token', token: TOKEN, absolutePath: file, mimeType: 'text/plain' });
  assert.strictEqual(await (await fetch(`${a.base}/media-share/${TOKEN}`)).text(), 'hello');
  assert.strictEqual((await fetch(`${b.base}/media-share/${TOKEN}`)).status, 404, 'B never saw A\'s token');

  a.send({ type: 'peer-forget-all-followers', requestId: 'only-a' });
  assert.ok(a.posted.some((m) => m.requestId === 'only-a'), 'A answered over its own parent port');
  assert.deepStrictEqual(b.posted, [], 'B heard nothing');
});

test('Reveal Remote channels are per server: a presenter on A is invisible to a remote on B', async () => {
  const a = await start({ files: {} });
  const b = await start({ files: {} });
  const connect = (srv) => new Promise((resolve, reject) => {
    const s = io(srv.base, { path: '/socket.io', transports: ['websocket'], forceNew: true, reconnection: false });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
  const presenter = await connect(a);
  const init = new Promise((r) => presenter.once('init', r));
  presenter.emit('start', { type: 'presenter', shareUrl: 'http://x.test/d' });
  const info = await init;
  presenter.emit('state_changed', { indexh: 4 });
  await sleep(80);

  const remoteOnB = await connect(b);
  let leaked = false;
  remoteOnB.on('state_changed', () => { leaked = true; });
  remoteOnB.emit('start', { type: 'remote', id: info.remoteId });
  const remoteOnA = await connect(a);
  const seen = new Promise((r) => remoteOnA.once('state_changed', r));
  remoteOnA.emit('start', { type: 'remote', id: info.remoteId });
  assert.deepStrictEqual(await seen, { indexh: 4 }, 'the right server does deliver it');
  await sleep(150);
  assert.strictEqual(leaked, false);
  [presenter, remoteOnA, remoteOnB].forEach((s) => s.close());
});

test('closing one server leaves the others fully working', async () => {
  const keep = await start({ files: { 'k/presentation.md': front('Keep') } });
  const drop = await start({ files: { 'd/presentation.md': front('Drop') } });
  await drop.close();
  servers.splice(servers.indexOf(drop), 1);
  assert.strictEqual((await fetch(`${keep.base}/presentations_${keep.key}/index.json`)).status, 200);
  fs.mkdirSync(path.join(keep.dirs.presentations, 'later'));
  fs.writeFileSync(path.join(keep.dirs.presentations, 'later', 'presentation.md'), front('Added After'));
  let found = false;
  for (let i = 0; i < 40 && !found; i += 1) {
    await sleep(100);
    const index = await (await fetch(`${keep.base}/presentations_${keep.key}/index.json`)).json();
    found = index.some((e) => e.title === 'Added After');
  }
  assert.ok(found, 'the survivor\'s watcher still works');
});

test('close() releases the file watcher and the parent-port listener', async () => {
  const lines = [];
  const realLog = console.log;
  console.log = (...args) => lines.push(args.join(' '));
  let srv;
  try {
    srv = await startServer({ quiet: false, files: { 'a/presentation.md': front('A') } });
    assert.strictEqual(srv.parentPort.listenerCount('message'), 1, 'the server listens for Electron messages');
    lines.length = 0;
    await srv.close();   // this also deletes the presentations folder, which a live watcher would report
    await sleep(600);
  } finally {
    console.log = realLog;
  }
  assert.strictEqual(srv.parentPort.listenerCount('message'), 0, 'listener removed');
  assert.deepStrictEqual(lines.filter((l) => /UNLINK|Folder deleted|Triggering reload/.test(l)), [], 'the watcher saw nothing after close');
});

test('creating a plugin has no side effects until Vite uses it', () => {
  const { EventEmitter } = require('events');
  const parentPort = new EventEmitter();
  const before = JSON.stringify(process.env);
  const { createRevelationPlugin } = require('../../vite.plugins.js');
  const plugin = createRevelationPlugin({ parentPort, presentationsDir: '/does/not/exist', key: 'k' });
  assert.strictEqual(plugin.name, 'generate-presentation-index');
  assert.strictEqual(parentPort.listenerCount('message'), 0);
  assert.strictEqual(JSON.stringify(process.env), before);
  assert.strictEqual(typeof createRevelationPlugin, 'function');
  assert.strictEqual(require('../../vite.plugins.js'), createRevelationPlugin, 'the default export is the factory (vite.config.js calls it with no arguments)');
});
