// server/config.js: which mode the server runs in and where its files are, from options and/or env.
// Pure function: no server, no process.env involved.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { resolveServerConfig, REVELATION_ROOT } = require('../../server/config.js');
const { tmpDir, writeTree, remove } = require('../helpers/tmp.cjs');

const base = (files = { 'presentations_abc/.keep': '' }) => writeTree(tmpDir(), files);

test('standalone: picks the first presentations_<key> folder in baseDir and derives the key', () => {
  const dir = base({ 'zzz/.keep': '', 'presentations_k1/.keep': '', 'file.txt': 'x' });
  const c = resolveServerConfig({ env: {}, argv: [], baseDir: dir });
  assert.strictEqual(c.mode, 'standalone');
  assert.strictEqual(c.presentationsDir, path.join(dir, 'presentations_k1'));
  assert.strictEqual(c.key, 'k1');
  assert.strictEqual(c.presentationsWebPath, '/presentations_k1');
  assert.strictEqual(c.customPath, false);
  assert.strictEqual(c.pluginsWebPath, '');
  remove(dir);
});

test('standalone without a presentations folder throws a clear error', () => {
  const dir = base({ 'other/.keep': '' });
  assert.throws(() => resolveServerConfig({ env: {}, argv: [], baseDir: dir }), /No presentations folder found/);
  remove(dir);
});

test('custom path mode needs BOTH directory and key, from options or env', () => {
  const fromOptions = resolveServerConfig({ env: {}, argv: [], presentationsDir: '/p', key: 'k', pluginsDir: '/pl' });
  assert.strictEqual(fromOptions.mode, 'custom');
  assert.deepStrictEqual(
    [fromOptions.presentationsDir, fromOptions.presentationsWebPath, fromOptions.pluginsDir, fromOptions.pluginsWebPath, fromOptions.customPath],
    ['/p', '/presentations_k', '/pl', '/plugins_k', true]
  );
  const fromEnv = resolveServerConfig({
    env: { PRESENTATIONS_DIR_OVERRIDE: '/e', PRESENTATIONS_KEY_OVERRIDE: 'ek', PLUGINS_DIR_OVERRIDE: '/epl' }, argv: []
  });
  assert.deepStrictEqual([fromEnv.mode, fromEnv.presentationsDir, fromEnv.key, fromEnv.pluginsDir], ['custom', '/e', 'ek', '/epl']);

  const dir = base();
  const onlyOne = resolveServerConfig({ env: { PRESENTATIONS_DIR_OVERRIDE: '/e' }, argv: [], baseDir: dir });
  assert.strictEqual(onlyOne.mode, 'standalone', 'a directory without a key falls back to standalone');
  remove(dir);
});

test('options win over the environment', () => {
  const c = resolveServerConfig({
    env: { PRESENTATIONS_DIR_OVERRIDE: '/env', PRESENTATIONS_KEY_OVERRIDE: 'envkey', REVELATION_GUI: '1', USER_DATA_DIR: '/env-ud' },
    argv: [], presentationsDir: '/opt', key: 'optkey', gui: false, userDataDir: '/opt-ud'
  });
  assert.deepStrictEqual([c.presentationsDir, c.key, c.isGuiMode, c.userDataDir], ['/opt', 'optkey', false, path.resolve('/opt-ud')]);
});

test('public relay: from the option, the env var (1/true, any case) or --public-server; no directories', () => {
  for (const spec of [{ publicRelay: true, env: {}, argv: [] }, { env: { REVELATION_PUBLIC_SERVER: '1' }, argv: [] },
    { env: { REVELATION_PUBLIC_SERVER: 'TRUE' }, argv: [] }, { env: {}, argv: ['node', 'vite', '--public-server'] }]) {
    const c = resolveServerConfig(spec);
    assert.strictEqual(c.mode, 'relay', JSON.stringify(spec));
    assert.strictEqual(c.isPublicServerMode, true);
    assert.deepStrictEqual([c.presentationsDir, c.key, c.presentationsWebPath], ['', '', '']);
  }
  assert.strictEqual(resolveServerConfig({ env: { REVELATION_PUBLIC_SERVER: '0' }, argv: [], presentationsDir: '/p', key: 'k' }).mode, 'custom');
  assert.strictEqual(
    resolveServerConfig({ publicRelay: false, env: { REVELATION_PUBLIC_SERVER: '1' }, argv: [], presentationsDir: '/p', key: 'k' }).mode,
    'custom', 'an explicit false overrides the environment'
  );
  assert.strictEqual(resolveServerConfig({ env: { REVELATION_PUBLIC_SERVER: '1', PRESENTATIONS_DIR_OVERRIDE: '/p', PRESENTATIONS_KEY_OVERRIDE: 'k' }, argv: [] }).mode, 'relay',
    'relay takes precedence over custom path');
});

test('GUI mode moves the index into userData; otherwise it stays in the presentations folder', () => {
  const gui = resolveServerConfig({ env: {}, argv: [], presentationsDir: '/p', key: 'k', gui: true, userDataDir: '/ud' });
  assert.strictEqual(gui.localIndexFile, path.join(path.resolve('/ud'), '.revelation-cache', 'presentations-index.json'));
  assert.strictEqual(gui.outputFile, gui.localIndexFile);
  assert.notStrictEqual(gui.outputFile, gui.sharedIndexFile);

  const plain = resolveServerConfig({ env: {}, argv: [], presentationsDir: '/p', key: 'k', gui: false, userDataDir: '/ud' });
  assert.strictEqual(plain.localIndexFile, '');
  assert.strictEqual(plain.outputFile, path.join('/p', 'index.json'));
  assert.strictEqual(plain.outputFile, plain.sharedIndexFile);

  const noUserData = resolveServerConfig({ env: {}, argv: [], presentationsDir: '/p', key: 'k', gui: true });
  assert.strictEqual(noUserData.outputFile, noUserData.sharedIndexFile, 'GUI without userData cannot use a cache');
});

test('ffmpegBin is read lazily, from an option (value or function) or the env object', () => {
  const env = { FFMPEG_BIN: '/first' };
  const fromEnv = resolveServerConfig({ env, argv: [], publicRelay: true });
  assert.strictEqual(fromEnv.ffmpegBin(), '/first');
  env.FFMPEG_BIN = '/second';
  assert.strictEqual(fromEnv.ffmpegBin(), '/second', 'later changes are seen');
  assert.strictEqual(resolveServerConfig({ env, argv: [], publicRelay: true, ffmpegBin: '/opt' }).ffmpegBin(), '/opt');
  let bin = 'a';
  const fn = resolveServerConfig({ env, argv: [], publicRelay: true, ffmpegBin: () => bin });
  bin = 'b';
  assert.strictEqual(fn.ffmpegBin(), 'b');
  assert.strictEqual(resolveServerConfig({ env: {}, argv: [], publicRelay: true }).ffmpegBin(), undefined);
});

test('rootDir is the revelation folder and adminDir defaults to empty', () => {
  const c = resolveServerConfig({ env: {}, argv: [], publicRelay: true });
  assert.strictEqual(c.rootDir, REVELATION_ROOT);
  assert.ok(require('fs').existsSync(path.join(c.rootDir, 'vite.plugins.js')));
  assert.strictEqual(c.adminDir, '');
  assert.strictEqual(resolveServerConfig({ env: { ADMIN_DIR_OVERRIDE: '/a' }, argv: [], publicRelay: true }).adminDir, '/a');
});

test('creating a config does not read or change process.env', () => {
  const before = JSON.stringify(process.env);
  resolveServerConfig({ env: { PRESENTATIONS_DIR_OVERRIDE: '/p', PRESENTATIONS_KEY_OVERRIDE: 'k' }, argv: [] });
  assert.strictEqual(JSON.stringify(process.env), before);
});
