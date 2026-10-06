// server/presentation-index.js: index generation, README deck, media index and the GUI index route,
// against temp folders and with no server.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { resolveServerConfig } = require('../../server/config.js');
const idx = require('../../server/presentation-index.js');
const { tmpDir, writeTree, remove } = require('../helpers/tmp.cjs');

const quiet = () => {
  const saved = [console.log, console.warn, console.error];
  console.log = console.warn = console.error = () => {};
  return () => { [console.log, console.warn, console.error] = saved; };
};
const front = (title, extra = '') => `---\ntitle: ${title}\n${extra}---\n\n# ${title}\n`;

function setup(files, { gui = false } = {}) {
  const root = tmpDir();
  const presentationsDir = path.join(root, 'pres');
  writeTree(presentationsDir, files);
  const config = resolveServerConfig({
    env: {}, argv: [], presentationsDir, key: 'k', gui, userDataDir: path.join(root, 'ud')
  });
  return { root, presentationsDir, config, index: idx.createPresentationIndex(config) };
}

test('readFrontMatterData: values, none, empty/comment-only, non-object, CRLF, and malformed', () => {
  assert.deepStrictEqual(idx.readFrontMatterData('---\ntitle: A\nn: 3\n---\nbody'), { title: 'A', n: 3 });
  assert.deepStrictEqual(idx.readFrontMatterData('# no front matter'), {});
  assert.deepStrictEqual(idx.readFrontMatterData('---\n# only a comment\n---\nbody'), {});
  assert.deepStrictEqual(idx.readFrontMatterData('---\n---\nbody'.replace('---\n---', '---\n\n---')), {});
  assert.deepStrictEqual(idx.readFrontMatterData('---\r\ntitle: Win\r\n---\r\nbody'), { title: 'Win' });
  assert.throws(() => idx.readFrontMatterData('---\ntitle: [unclosed\n---\n'));
});

test('small helpers', () => {
  assert.strictEqual(idx.toPosixPath('a\\b\\c.md'), 'a/b/c.md');
  assert.strictEqual(idx.toPosixPath(undefined), '');
  assert.strictEqual(idx.normalizeCreatedField(new Date('2026-01-02T03:04:05Z')), '2026-01-02T03:04:05.000Z');
  assert.strictEqual(idx.normalizeCreatedField('  2026-01-02 '), '2026-01-02');
  assert.strictEqual(idx.normalizeCreatedField(0), '1970-01-01T00:00:00.000Z');
  assert.strictEqual(idx.normalizeCreatedField(NaN), '');
  assert.strictEqual(idx.normalizeCreatedField(new Date('nope')), '');
  assert.strictEqual(idx.normalizeCreatedField(null), '');
  assert.ok(idx.isLegacyLockOrTempEntry('a.lock') && idx.isLegacyLockOrTempEntry('x.lock.~1~') && idx.isLegacyLockOrTempEntry('LOCK_x'));
  assert.ok(!idx.isLegacyLockOrTempEntry('block') && !idx.isLegacyLockOrTempEntry(5));
  assert.ok(idx.isHiddenAlternativeMetadata({ alternatives: ' Hidden ' }));
  assert.ok(idx.isHiddenAlternativeMetadata({ alternatives: { self: 'hidden' } }));
  assert.ok(!idx.isHiddenAlternativeMetadata({ alternatives: { self: 'shown' } }));
  assert.ok(!idx.isHiddenAlternativeMetadata(null));
  for (const code of ['ENOENT', 'ENOTDIR', 'ESTALE']) assert.ok(idx.isTransientFsError({ code }));
  assert.ok(!idx.isTransientFsError({ code: 'EACCES' }) && !idx.isTransientFsError(null));
});

test('collectMarkdownFilesRecursive: sorted, nested, skips dotfiles, non-md and builder temp files', () => {
  const dir = writeTree(tmpDir(), {
    'b.md': '', 'a.md': '', 'sub/z.MD': '', 'sub/deep/y.md': '', '.hidden/x.md': '', '.dot.md': '',
    'notes.txt': '', '__builder_temp.md': '', 'sub/__builder_temp.md': ''
  });
  assert.deepStrictEqual(idx.collectMarkdownFilesRecursive(dir), ['a.md', 'b.md', 'sub/deep/y.md', 'sub/z.MD']);
  assert.deepStrictEqual(idx.collectMarkdownFilesRecursive(path.join(dir, 'missing')), []);
  remove(dir);
});

test('buildEntries: fields, fallbacks, ordering and every exclusion rule', () => {
  const restore = quiet();
  const { root, index } = setup({
    'demo/presentation.md': front('Demo', 'description: D\ntheme: black.css\nthumbnail: custom.jpg\ncreated: 2026-03-04\n'),
    'demo/second.md': front('Second'),
    'demo/hid.md': front('Hid', 'alternatives:\n  self: hidden\n'),
    'aaa/presentation.md': '# no front matter\n',
    'list/presentation.md': '---\n- a\n- b\n---\n# list front matter\n',
    'bad/presentation.md': '---\ntitle: [x\n---\n',
    '_current_open/presentation.md': front('Transient'),
    '.git/presentation.md': front('Dot'),
    'job.lock/presentation.md': front('Lock'),
    'lock_old/presentation.md': front('Lock2'),
    'loose-file.md': front('Not in a folder'),
    '_media/pic.png': 'x'
  });
  const entries = index.buildEntries();
  restore();
  const ids = entries.map((e) => `${e.slug}/${e.md}`);
  assert.deepStrictEqual([...ids].sort(), ['aaa/presentation.md', 'bad/presentation.md', 'demo/presentation.md', 'demo/second.md', 'list/presentation.md']);
  assert.strictEqual(entries.find((e) => e.slug === 'list').title, 'list/presentation.md', 'non-mapping front matter falls back to defaults');

  const demo = entries.find((e) => e.md === 'presentation.md' && e.slug === 'demo');
  assert.deepStrictEqual(
    { ...demo, modified: undefined, modifiedTimestamp: undefined, createdTimestamp: undefined },
    { slug: 'demo', md: 'presentation.md', title: 'Demo', description: 'D', thumbnail: 'custom.jpg', created: '2026-03-04',
      createdTimestamp: undefined, modified: undefined, modifiedTimestamp: undefined, theme: 'black.css', _malformed: false }
  );
  assert.strictEqual(demo.createdTimestamp, Date.parse('2026-03-04'));
  assert.ok(Number.isFinite(demo.modifiedTimestamp) && demo.modified.endsWith('Z'));
  const plain = entries.find((e) => e.slug === 'aaa');
  assert.deepStrictEqual([plain.title, plain.description, plain.thumbnail, plain.theme, plain.created, plain.createdTimestamp],
    ['aaa/presentation.md', '', 'presentation.thumb.jpg', '', '', null]);
  const bad = entries.find((e) => e.slug === 'bad');
  assert.deepStrictEqual([bad.title, bad._malformed, bad.thumbnail], ['{malformed YAML}', true, 'presentation.thumb.jpg']);
  assert.ok(bad.description.length > 0, 'the YAML error is surfaced as the description');
  remove(root);
});

test('buildEntries returns null (and writes nothing) when the folder cannot be listed', () => {
  const restore = quiet();
  const config = resolveServerConfig({ env: {}, argv: [], presentationsDir: path.join(tmpDir(), 'does-not-exist'), key: 'k', gui: false });
  const index = idx.createPresentationIndex(config);
  assert.strictEqual(index.buildEntries(), null);
  index.safeGenerate('test'); // must not throw
  restore();
});

test('generate (GUI): writes the userData cache and leaves the presentations folder alone', () => {
  const restore = quiet();
  const { root, presentationsDir, config, index } = setup({ 'demo/presentation.md': front('Demo') }, { gui: true });
  index.generate();
  restore();
  const written = JSON.parse(fs.readFileSync(config.outputFile, 'utf8'));
  assert.deepStrictEqual(written.map((e) => e.title), ['Demo']);
  assert.ok(config.outputFile.includes('.revelation-cache'));
  assert.deepStrictEqual(fs.readdirSync(presentationsDir).sort(), ['demo'], 'no index.json and no README deck in GUI mode');
  remove(root);
});

test('generate (non-GUI): writes index.json beside the presentations and refreshes the README deck', () => {
  const restore = quiet();
  const { root, presentationsDir, config, index } = setup({ 'demo/presentation.md': front('Demo') });
  index.generate();
  restore();
  assert.strictEqual(config.outputFile, path.join(presentationsDir, 'index.json'));
  const titles = JSON.parse(fs.readFileSync(config.outputFile, 'utf8')).map((e) => e.slug);
  assert.ok(titles.includes('demo') && titles.includes('readme'), titles.join());
  const deck = fs.readFileSync(path.join(presentationsDir, 'readme', 'presentation.md'), 'utf8');
  assert.ok(deck.includes('REVELation') || deck.length > 100, 'README deck generated from header.yaml + README.md');
  remove(root);
});

test('generate (non-GUI): the README deck is only rewritten when README.md is newer', () => {
  const restore = quiet();
  const { root, presentationsDir, index } = setup({});
  index.generate();
  const deckPath = path.join(presentationsDir, 'readme', 'presentation.md');
  fs.writeFileSync(deckPath, 'CUSTOM EDIT');
  const future = new Date(Date.now() + 120_000);
  fs.utimesSync(deckPath, future, future);
  index.generate();
  assert.strictEqual(fs.readFileSync(deckPath, 'utf8'), 'CUSTOM EDIT', 'a newer deck is kept');
  const past = new Date(Date.now() - 365 * 86400_000);
  fs.utimesSync(deckPath, past, past);
  index.generate();
  restore();
  assert.notStrictEqual(fs.readFileSync(deckPath, 'utf8'), 'CUSTOM EDIT', 'an older deck is regenerated');
  remove(root);
});

test('generateMediaIndex: keyed by file name, large_variant_local reflects the disk, bad JSON skipped, index.json excluded', () => {
  const restore = quiet();
  const { root, presentationsDir, index } = setup({
    '_media/a.json': JSON.stringify({ title: 'A', large_variant: { filename: 'a-large.mp4' } }),
    '_media/a-large.mp4': 'x',
    '_media/b.json': JSON.stringify({ title: 'B', large_variant: { filename: 'missing.mp4' } }),
    '_media/c.json': '{broken',
    '_media/index.json': JSON.stringify({ stale: true }),
    '_media/d.txt': 'ignored'
  });
  index.generateMediaIndex();
  restore();
  const built = JSON.parse(fs.readFileSync(path.join(presentationsDir, '_media', 'index.json'), 'utf8'));
  assert.deepStrictEqual(Object.keys(built).sort(), ['a', 'b']);
  assert.strictEqual(built.a.large_variant_local, true);
  assert.strictEqual(built.b.large_variant_local, false);
  remove(root);
});

test('generateMediaIndex does nothing without a _media folder', () => {
  const { root, presentationsDir, index } = setup({ 'demo/presentation.md': front('x') });
  index.generateMediaIndex();
  assert.ok(!fs.existsSync(path.join(presentationsDir, '_media')));
  remove(root);
});

function callRoute(route, url) {
  const out = { next: undefined, status: null, headers: null, body: null };
  route({ url }, { writeHead(s, h) { out.status = s; out.headers = h; }, end(b) { out.body = b; } }, (err) => { out.next = err === undefined ? true : err; });
  return out;
}

test('GUI index route: serves the cache, [] while it is missing, passes other paths and real errors on', () => {
  const root = tmpDir();
  const cache = path.join(root, 'cache.json');
  const route = idx.createIndexRoute({ presentationsWebPath: '/presentations_k', outputFile: cache });

  const missing = callRoute(route, '/presentations_k/index.json');
  assert.deepStrictEqual([missing.status, missing.body], [200, '[]']);

  fs.writeFileSync(cache, '[{"slug":"x"}]');
  const served = callRoute(route, '/presentations_k/index.json?t=123');
  assert.deepStrictEqual([served.status, served.body], [200, '[{"slug":"x"}]']);
  assert.match(served.headers['Content-Type'], /application\/json/);

  assert.strictEqual(callRoute(route, '/presentations_k/other.json').next, true);
  assert.strictEqual(callRoute(route, '/presentations_other/index.json').next, true);
  assert.strictEqual(callRoute(route, 'http://[bad').next, true, 'unparseable URL falls through');

  const unreadable = idx.createIndexRoute({ presentationsWebPath: '/presentations_k', outputFile: root }); // a directory: EISDIR
  const failed = callRoute(unreadable, '/presentations_k/index.json');
  assert.ok(failed.next instanceof Error, 'a non-transient error goes to the error handler');
  remove(root);
});
