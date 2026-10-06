// server/presentation-watcher.js with a fake chokidar and a recording `send`: no file system
// watching, no Vite. Verifies debouncing, batching, change detection and shutdown.
const test = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const { createPresentationWatcher } = require('../../server/presentation-watcher.js');
const { tmpDir, writeTree, remove } = require('../helpers/tmp.cjs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function harness(files = {}, { debounceMs = 30 } = {}) {
  const dir = writeTree(tmpDir(), files);
  const fake = Object.assign(new EventEmitter(), { closed: false, async close() { this.closed = true; } });
  const chokidar = { watch: (target, opts) => { fake.target = target; fake.opts = opts; return fake; } };
  const sent = [];
  const calls = { generate: 0, media: 0 };
  const index = { safeGenerate: () => { calls.generate += 1; }, generateMediaIndex: () => { calls.media += 1; } };
  const log = console.log;
  console.log = () => {};
  const watcher = createPresentationWatcher({ presentationsDir: dir, index, send: (p) => sent.push(p), debounceMs, chokidar });
  return {
    dir, fake, sent, calls, watcher,
    file: (rel) => path.join(dir, ...rel.split('/')),
    done() { console.log = log; remove(dir); }
  };
}

const reloads = (sent) => sent.filter((m) => m.event === 'reload-presentations').map((m) => m.data);

test('start() watches the presentations folder, ignoring dotfiles, to depth 5; start is idempotent', () => {
  const h = harness();
  h.watcher.start();
  h.watcher.start();
  assert.strictEqual(h.fake.target, h.dir);
  assert.strictEqual(h.fake.opts.depth, 5);
  assert.strictEqual(h.fake.opts.ignoreInitial, true);
  assert.ok(h.fake.opts.ignored.test('/a/.hidden/x') && !h.fake.opts.ignored.test('/a/visible/x'));
  h.done();
});

test('a burst of changes becomes ONE index rebuild and one batched notice', async () => {
  const h = harness({ 'a/presentation.md': 'one', 'b/presentation.md': 'two' });
  h.watcher.start();
  fs.writeFileSync(h.file('a/presentation.md'), 'one!');
  fs.writeFileSync(h.file('b/presentation.md'), 'two!');
  h.fake.emit('change', h.file('a/presentation.md'));
  h.fake.emit('change', h.file('b/presentation.md'));
  h.fake.emit('change', h.file('a/presentation.md')); // same file again: still one entry
  assert.strictEqual(h.calls.generate, 0, 'nothing happens until the debounce elapses');
  await sleep(120);
  assert.strictEqual(h.calls.generate, 1);
  assert.deepStrictEqual(reloads(h.sent).map((d) => `${d.slug}/${d.mdFile}`).sort(), ['a/presentation.md', 'b/presentation.md']);
  const notices = h.sent.filter((m) => m.event === 'presentations-index-updated');
  assert.strictEqual(notices.length, 1);
  assert.strictEqual(notices[0].data.changes.length, 2);
  assert.ok(h.sent.every((m) => m.type === 'custom'));
  h.watcher.close().then(h.done);
});

test('the debounce restarts on every event', async () => {
  const h = harness({ 'a/presentation.md': 'x' }, { debounceMs: 80 });
  h.watcher.start();
  for (let i = 0; i < 4; i += 1) {
    fs.writeFileSync(h.file('a/presentation.md'), `v${i}`);
    h.fake.emit('change', h.file('a/presentation.md'));
    await sleep(40);
  }
  assert.strictEqual(h.calls.generate, 0, 'still being edited');
  await sleep(150);
  assert.strictEqual(h.calls.generate, 1);
  await h.watcher.close();
  h.done();
});

test('touching a file without changing its content is ignored (cloud-sync noise)', async () => {
  const h = harness({ 'a/presentation.md': 'same' });
  h.watcher.start();
  await sleep(40); // let the initial hash seeding finish
  h.fake.emit('change', h.file('a/presentation.md')); // content identical to the seeded hash
  await sleep(100);
  assert.strictEqual(h.calls.generate, 0);
  assert.deepStrictEqual(h.sent, []);
  fs.writeFileSync(h.file('a/presentation.md'), 'different');
  h.fake.emit('change', h.file('a/presentation.md'));
  await sleep(100);
  assert.strictEqual(h.calls.generate, 1);
  await h.watcher.close();
  h.done();
});

test('only markdown inside a slug folder counts; stray files and other types are ignored', async () => {
  const h = harness({ 'a/presentation.md': 'x', 'top.md': 'x', 'a/notes.txt': 'x' });
  h.watcher.start();
  h.fake.emit('add', h.file('top.md'));          // not inside a slug folder
  h.fake.emit('add', h.file('a/notes.txt'));     // not markdown
  h.fake.emit('add', '/elsewhere/a/presentation.md'); // outside the presentations dir
  await sleep(100);
  assert.strictEqual(h.calls.generate, 0);
  await h.watcher.close();
  h.done();
});

test('nested markdown reports its path relative to the slug; unlink forgets the hash so a re-add is seen', async () => {
  const h = harness({ 'a/nested/deep.md': 'x' });
  h.watcher.start();
  await sleep(40);
  fs.rmSync(h.file('a/nested/deep.md'));
  h.fake.emit('unlink', h.file('a/nested/deep.md'));
  await sleep(100);
  assert.deepStrictEqual(reloads(h.sent), [{ slug: 'a', mdFile: 'nested/deep.md' }]);
  h.sent.length = 0;
  fs.writeFileSync(h.file('a/nested/deep.md'), 'x'); // identical to the original content
  h.fake.emit('add', h.file('a/nested/deep.md'));
  await sleep(100);
  assert.deepStrictEqual(reloads(h.sent), [{ slug: 'a', mdFile: 'nested/deep.md' }], 're-adding identical content after a delete is a real change');
  await h.watcher.close();
  h.done();
});

test('removing a slug folder rebuilds the index and notifies without a per-file reload', async () => {
  const h = harness({ 'gone/presentation.md': 'x', 'keep/presentation.md': 'y' });
  h.watcher.start();
  h.fake.emit('unlinkDir', h.file('gone'));
  await sleep(100);
  assert.strictEqual(h.calls.generate, 1);
  assert.deepStrictEqual(reloads(h.sent), [], 'there is no markdown file to reload');
  const notice = h.sent.find((m) => m.event === 'presentations-index-updated');
  assert.deepStrictEqual(notice.data.changes, [{ slug: 'gone', mdFile: null, event: 'unlinkDir' }]);
  h.sent.length = 0;
  h.fake.emit('unlinkDir', path.join(h.dir, '..'));   // outside: ignored
  await sleep(80);
  assert.strictEqual(h.calls.generate, 1);
  await h.watcher.close();
  h.done();
});

test('_media/*.json changes rebuild the media index and announce reload-media immediately', async () => {
  const h = harness({ '_media/x.json': '{}' });
  h.watcher.start();
  h.fake.emit('change', h.file('_media/x.json'));
  assert.strictEqual(h.calls.media, 1, 'no debounce for media');
  assert.deepStrictEqual(h.sent, [{ type: 'custom', event: 'reload-media', data: { filePath: h.file('_media/x.json') } }]);
  h.fake.emit('add', h.file('a/other.json')); // json outside _media: ignored
  assert.strictEqual(h.calls.media, 1);
  await h.watcher.close();
  h.done();
});

test('close() stops chokidar, cancels a pending rebuild and is safe to repeat', async () => {
  const h = harness({ 'a/presentation.md': 'x' });
  h.watcher.start();
  fs.writeFileSync(h.file('a/presentation.md'), 'changed');
  h.fake.emit('change', h.file('a/presentation.md'));
  await h.watcher.close();
  assert.strictEqual(h.fake.closed, true);
  await sleep(120);
  assert.strictEqual(h.calls.generate, 0, 'the pending rebuild never fires after close');
  assert.deepStrictEqual(h.sent, []);
  await h.watcher.close();
  h.done();
});
