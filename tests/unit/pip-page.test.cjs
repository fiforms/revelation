// js/pip.js, the script behind pip.html, run against a small fake DOM: what it puts in the iframe and
// which messages reach electronAPI. pip-core.test.cjs covers the rules; this covers the wiring.
// The module imports pip-core.js, and vm cannot load ES modules without a flag, so the two files are
// joined into one script (export/import keywords removed) before running.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const js = (name) => fs.readFileSync(path.join(__dirname, '..', '..', 'js', name), 'utf8');
const SOURCE = [
  js('pip-core.js').replace(/^export /gm, ''),
  js('pip.js').replace(/^import .*pip-core\.js';\s*$/m, '')
].join('\n');

const ORIGIN = 'http://192.168.1.5:8000';

function boot(query, { electron = true } = {}) {
  const calls = { closePresentation: 0, peerCommands: [], windowClosed: 0 };
  const listeners = {};
  const classes = new Set();
  const cssProps = {};
  const appended = [];
  const frameListeners = {};

  const frame = {
    src: undefined,
    contentWindow: { name: 'presentation', addEventListener() {}, document: { addEventListener() {} }, focus() {} },
    addEventListener: (type, fn) => { frameListeners[type] = fn; }
  };
  const chroma = { addEventListener() {} };
  const document = {
    body: { classList: { add: (c) => classes.add(c), toggle: (c) => (classes.has(c) ? classes.delete(c) : classes.add(c)), contains: (c) => classes.has(c) }, appendChild: (el) => appended.push(el) },
    documentElement: { style: { setProperty: (k, v) => { cssProps[k] = v; } } },
    getElementById: (id) => ({ presentationFrame: frame, chromaArea: chroma })[id],
    createElement: () => ({ className: '', textContent: '' })
  };
  const win = {
    location: { search: query, origin: ORIGIN },
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
    postMessage() {},
    close: () => { calls.windowClosed += 1; },
    electronAPI: electron ? {
      closePresentation: () => { calls.closePresentation += 1; },
      sendPeerCommand: (cmd) => { calls.peerCommands.push(cmd); }
    } : undefined
  };
  const sandbox = { window: win, document, URLSearchParams, URL, KeyboardEvent: class {}, globalThis: { CSS: { supports: (_p, v) => v === 'red' } } };
  vm.runInNewContext(SOURCE, sandbox);

  const send = (data, { origin = ORIGIN, source = frame.contentWindow } = {}) => {
    for (const fn of listeners.message || []) fn({ data, origin, source: source === 'self' ? win : source });
  };
  return { frame, classes, cssProps, appended, calls, send, win };
}

const enc = encodeURIComponent;
// Objects made inside the vm context have another realm's prototypes; compare by value.
const plain = (value) => JSON.parse(JSON.stringify(value));

test('a normal https or http presentation URL is loaded into the iframe', () => {
  const page = boot(`?src=${enc('https://example.org/deck/index.html?p=a.md')}&side=right&start=on&color=%23ff0000`);
  assert.strictEqual(page.frame.src, 'https://example.org/deck/index.html?p=a.md');
  assert.strictEqual(page.appended.length, 0);
  assert.ok(page.classes.has('pip-mode'));
  assert.ok(!page.classes.has('pip-left'));
  assert.strictEqual(page.cssProps['--pip-color'], '#ff0000');

  const internal = boot(`?src=${enc(`${ORIGIN}/presentations_k/demo/index.html?p=presentation.md`)}`);
  assert.strictEqual(internal.frame.src, `${ORIGIN}/presentations_k/demo/index.html?p=presentation.md`);
  assert.ok(internal.classes.has('pip-left'), 'left is the default side');
});

test('javascript:, data:, blob:, file: and relative sources are never put in the iframe', () => {
  for (const src of ['javascript:alert(document.domain)', 'data:text/html,<script>alert(1)</script>', 'blob:http://x/y', 'file:///etc/passwd', '/admin/settings.html', '//evil.example/x']) {
    const page = boot(`?src=${enc(src)}`);
    assert.strictEqual(page.frame.src, undefined, src);
    assert.strictEqual(page.appended.length, 1, `${src}: an error message is shown instead`);
    assert.match(page.appended[0].textContent, /Unsupported presentation source/);
  }
});

test('a missing source shows the missing message', () => {
  const page = boot('');
  assert.strictEqual(page.frame.src, undefined);
  assert.strictEqual(page.appended[0].textContent, 'Missing presentation source.');
});

test('an unsafe colour falls back to the default green', () => {
  const page = boot(`?src=${enc('https://example.org/')}&color=${enc('red;background:url(http://evil/x)')}`);
  assert.strictEqual(page.cssProps['--pip-color'], '#00ff00');
  assert.strictEqual(boot(`?src=${enc('https://example.org/')}&color=red`).cssProps['--pip-color'], 'red');
});

test('messages from the embedded presentation reach electronAPI; the same messages from elsewhere do not', () => {
  const page = boot(`?src=${enc('https://example.org/')}`);

  page.send('pip-close-presentation');
  page.send({ type: 'pip-send-to-peers', payload: { url: 'https://share.example/p?id=1' } });
  page.send({ type: 'pip-close-on-peers' });
  assert.strictEqual(page.calls.closePresentation, 1);
  assert.deepStrictEqual(plain(page.calls.peerCommands), [
    { type: 'open-presentation', payload: { url: 'https://share.example/p?id=1' } },
    { type: 'close-presentation', payload: {} }
  ]);

  const before = JSON.stringify(page.calls);
  for (const options of [{ origin: 'https://evil.example' }, { source: { name: 'other window' } }, { source: null }, { origin: 'null' }]) {
    page.send('pip-close-presentation', options);
    page.send({ type: 'pip-send-to-peers', payload: { url: 'https://attacker.example/x' } }, options);
    page.send({ type: 'pip-close-on-peers' }, options);
  }
  assert.strictEqual(JSON.stringify(page.calls), before, 'nothing from a stranger gets through');
});

test('a hostile URL in pip-send-to-peers is not forwarded even from the frame', () => {
  const page = boot(`?src=${enc('https://example.org/')}`);
  page.send({ type: 'pip-send-to-peers', payload: { url: 'javascript:alert(1)' } });
  page.send({ type: 'pip-send-to-peers', payload: { url: '/relative' } });
  assert.deepStrictEqual(page.calls.peerCommands, []);
});

test('pip-toggle works from the frame and from the page itself, and close falls back to window.close', () => {
  const page = boot(`?src=${enc('https://example.org/')}`, { electron: false });
  page.send('pip-toggle');
  assert.ok(page.classes.has('pip-mode'));
  page.send('pip-toggle', { source: 'self' });
  assert.ok(!page.classes.has('pip-mode'));
  page.send('pip-close-presentation');
  assert.strictEqual(page.calls.windowClosed, 1);
  page.send({ type: 'pip-send-to-peers', payload: { url: 'https://share.example/x' } }); // no electronAPI: nothing to call, no crash
  assert.deepStrictEqual(page.calls.peerCommands, []);
});
