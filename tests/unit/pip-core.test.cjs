// js/pip-core.js: what pip.html may embed, which colours it applies and which messages it acts on.
// The bug this guards (S3): ?src= was assigned to an iframe unchecked, so pip.html?src=javascript:... ran
// script in the server's origin, and any window could drive the presenter's peer commands.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { pathToFileURL } = require('url');

const core = () => import(pathToFileURL(path.join(__dirname, '..', '..', 'js', 'pip-core.js')).href);

test('parsePipSource accepts absolute http and https URLs and normalises them', async () => {
  const { parsePipSource } = await core();
  assert.deepStrictEqual(parsePipSource('https://example.org/a b?x=1#h'), { ok: true, url: 'https://example.org/a%20b?x=1#h' });
  assert.deepStrictEqual(parsePipSource('  http://192.168.1.5:8000/presentations_k/demo/index.html?p=presentation.md  '),
    { ok: true, url: 'http://192.168.1.5:8000/presentations_k/demo/index.html?p=presentation.md' });
});

test('parsePipSource refuses every other scheme, including obfuscated javascript:', async () => {
  const { parsePipSource } = await core();
  const bad = [
    'javascript:alert(1)', 'JaVaScRiPt:alert(1)', '  javascript:alert(1)', 'java\tscript:alert(1)', 'java\nscript:alert(1)',
    'data:text/html,<script>alert(1)</script>', 'blob:http://example.org/x', 'file:///etc/passwd',
    'vbscript:msgbox(1)', 'about:blank', 'ftp://example.org/x', 'chrome://settings'
  ];
  for (const value of bad) {
    const result = parsePipSource(value);
    assert.strictEqual(result.ok, false, JSON.stringify(value));
  }
});

test('parsePipSource refuses relative, protocol-relative, empty, oversized and non-string input', async () => {
  const { parsePipSource } = await core();
  for (const value of ['/admin/settings.html', '//evil.example/x', 'presentation.html', '', '   ', null, undefined, 5, {}, ['https://a.b']]) {
    assert.strictEqual(parsePipSource(value).ok, false, JSON.stringify(value));
  }
  assert.strictEqual(parsePipSource(`https://example.org/${'a'.repeat(5000)}`).reason, 'too long');
  assert.strictEqual(parsePipSource('https://example.org/x', 10).ok, false);
  assert.strictEqual(parsePipSource(undefined).reason, 'missing');
});

test('safeColor takes hex colours and anything the browser accepts as a colour, nothing else', async () => {
  const { safeColor } = await core();
  const supports = (v) => ['red', 'rgb(0, 255, 0)'].includes(v); // stands in for CSS.supports('color', v)
  for (const hex of ['#0f0', '#00ff00', '#00FF00', '#00ff0080', '#0f08']) assert.strictEqual(safeColor(hex, '#000', supports), hex, hex);
  assert.strictEqual(safeColor('red', '#000', supports), 'red');
  assert.strictEqual(safeColor('rgb(0, 255, 0)', '#000', supports), 'rgb(0, 255, 0)');
  for (const bad of ['red; background:url(http://evil/x)', 'url(http://evil/x)', 'var(--x)', '#12', '#12345', '#gggggg', 'x'.repeat(100), '', '  ', null, undefined, 7]) {
    assert.strictEqual(safeColor(bad, '#abcdef', supports), '#abcdef', JSON.stringify(bad));
  }
  assert.strictEqual(safeColor('red', '#abcdef', () => { throw new Error('boom'); }), '#abcdef', 'a throwing supports() falls back');
  assert.strictEqual(safeColor('notacolor', '#abcdef', () => false), '#abcdef');
});

const ORIGIN = 'http://192.168.1.5:8000';
const self = { name: 'pip' };
const frame = { name: 'presentation' };
const stranger = { name: 'someone else' };
const ctx = { selfWindow: self, frameWindow: frame, selfOrigin: ORIGIN };
const msg = (data, { origin = ORIGIN, source = frame } = {}) => ({ data, origin, source });

test('classifyMessage maps the four real messages from the frame or the page itself', async () => {
  const { classifyMessage } = await core();
  assert.deepStrictEqual(classifyMessage(msg('pip-toggle'), ctx), { action: 'toggle' });
  assert.deepStrictEqual(classifyMessage(msg('pip-toggle', { source: self }), ctx), { action: 'toggle' });
  assert.deepStrictEqual(classifyMessage(msg('pip-close-presentation'), ctx), { action: 'close-presentation' });
  assert.deepStrictEqual(classifyMessage(msg({ type: 'pip-close-on-peers' }), ctx), { action: 'close-on-peers' });
  assert.deepStrictEqual(
    classifyMessage(msg({ type: 'pip-send-to-peers', payload: { url: 'https://share.example/p?id=1' } }), ctx),
    { action: 'send-to-peers', url: 'https://share.example/p?id=1' }
  );
});

test('classifyMessage ignores messages from other windows or other origins', async () => {
  const { classifyMessage } = await core();
  const everyAction = ['pip-toggle', 'pip-close-presentation', { type: 'pip-close-on-peers' },
    { type: 'pip-send-to-peers', payload: { url: 'https://share.example/x' } }];
  for (const data of everyAction) {
    assert.strictEqual(classifyMessage(msg(data, { source: stranger }), ctx), null, 'another window');
    assert.strictEqual(classifyMessage(msg(data, { source: null }), ctx), null, 'no source');
    assert.strictEqual(classifyMessage(msg(data, { origin: 'https://evil.example' }), ctx), null, 'other origin (e.g. an external page in the frame)');
    assert.strictEqual(classifyMessage(msg(data, { origin: 'null' }), ctx), null, 'opaque origin');
  }
  // With no frame yet, a frameless "source" must not match by accident.
  assert.strictEqual(classifyMessage(msg('pip-toggle', { source: undefined }), { ...ctx, frameWindow: null }), null);
});

test('classifyMessage refuses to forward a URL that is not an absolute http(s) link, and unknown messages', async () => {
  const { classifyMessage } = await core();
  for (const url of ['javascript:alert(1)', 'data:text/html,x', '/relative', '', null, undefined, 5, 'https://x.example/' + 'a'.repeat(3000)]) {
    assert.strictEqual(classifyMessage(msg({ type: 'pip-send-to-peers', payload: { url } }), ctx), null, String(JSON.stringify(url)).slice(0, 40));
  }
  assert.strictEqual(classifyMessage(msg({ type: 'pip-send-to-peers' }), ctx), null, 'no payload');
  for (const data of [{ type: 'something-else' }, {}, [], 'hello', 42, true, null, undefined, '']) {
    assert.strictEqual(classifyMessage(msg(data), ctx), null, JSON.stringify(data));
  }
  assert.strictEqual(classifyMessage(null, ctx), null);
  assert.strictEqual(classifyMessage(undefined, ctx), null);
});
