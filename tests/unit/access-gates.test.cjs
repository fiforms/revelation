// server/access-gates.js: the loopback-only gates, driven with fake requests so every remote
// address can be tested (including ones this machine could never connect from).
const test = require('node:test');
const assert = require('node:assert');
const { createSandboxOriginGate, createIndexJsonGate, createAdminGate } = require('../../server/access-gates.js');

function run(gate, { url = '/', method = 'GET', origin, address }) {
  const result = { next: false, status: null, body: '', headers: {} };
  const req = { url, method, headers: origin === undefined ? {} : { origin }, socket: { remoteAddress: address } };
  const res = {
    statusCode: 200,
    writeHead(status, headers) { result.status = status; result.headers = headers || {}; },
    end(body) { if (result.status === null) result.status = this.statusCode; result.body = body || ''; }
  };
  gate(req, res, () => { result.next = true; });
  return result;
}

const LOOPBACK = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
const REMOTE = ['192.168.1.20', '10.0.0.5', '::ffff:10.0.0.5', '2001:db8::1', '8.8.8.8', '127.0.0.2', '::ffff:192.168.0.1', 'localhost', '', undefined];

test('sandbox-origin gate: Origin null is refused from every non-loopback address', () => {
  const gate = createSandboxOriginGate();
  for (const address of REMOTE) {
    const r = run(gate, { origin: 'null', address, url: '/presentations_k/x/presentation.md' });
    assert.strictEqual(r.status, 403, String(address));
    assert.strictEqual(r.next, false);
  }
});

test('sandbox-origin gate: origin comparison ignores case and surrounding space', () => {
  const gate = createSandboxOriginGate();
  assert.strictEqual(run(gate, { origin: '  NULL ', address: '10.0.0.5' }).status, 403);
});

test('sandbox-origin gate: loopback may use it; OPTIONS preflight is answered 204', () => {
  const gate = createSandboxOriginGate();
  for (const address of LOOPBACK) {
    const get = run(gate, { origin: 'null', address });
    assert.strictEqual(get.next, true, `${address} GET passes through`);
    const options = run(gate, { origin: 'null', address, method: 'OPTIONS' });
    assert.strictEqual(options.status, 204, `${address} OPTIONS`);
    assert.strictEqual(options.next, false);
  }
});

test('sandbox-origin gate: ordinary origins and no origin are untouched from anywhere', () => {
  const gate = createSandboxOriginGate();
  for (const address of [...LOOPBACK, ...REMOTE]) {
    for (const origin of [undefined, '', 'http://example.test']) {
      assert.strictEqual(run(gate, { origin, address }).next, true, `${address} / ${origin}`);
    }
  }
  assert.strictEqual(run(gate, { origin: 'http://x', method: 'OPTIONS', address: '127.0.0.1' }).next, true, 'only the sandbox origin gets the 204');
});

test('sandbox-origin gate: /peer/ is exempt (peers authenticate with signatures, not origin)', () => {
  const gate = createSandboxOriginGate();
  assert.strictEqual(run(gate, { origin: 'null', address: '10.0.0.5', url: '/peer/public-key' }).next, true);
  assert.strictEqual(run(gate, { origin: 'null', address: '10.0.0.5', url: '/peerless' }).status, 403, 'prefix is /peer/ exactly');
});

test('index.json gate: any path ending /index.json is loopback only, case-insensitive, query ignored', () => {
  const gate = createIndexJsonGate();
  const urls = ['/presentations_k/index.json', '/presentations_k/_media/index.json', '/PRESENTATIONS_K/INDEX.JSON', '/a/index.json?x=1', '/a/index.json#frag'];
  for (const url of urls) {
    for (const address of REMOTE) assert.strictEqual(run(gate, { url, address }).status, 403, `${address} ${url}`);
    for (const address of LOOPBACK) assert.strictEqual(run(gate, { url, address }).next, true, `${address} ${url}`);
  }
});

test('index.json gate: a protocol-relative target (//index.json) is read as host "index.json" and slips past', () => {
  // Documents a parser divergence, not a leak: new URL('//index.json', base) has pathname '/', so the
  // gate does not see an index.json path. Nothing is served at that path today. If a gate were ever
  // needed there, parse req.url without URL (as Connect's parseurl does).
  assert.strictEqual(run(createIndexJsonGate(), { url: '//index.json', address: '10.0.0.5' }).next, true);
  assert.strictEqual(run(createIndexJsonGate(), { url: '//host/index.json', address: '10.0.0.5' }).status, 403);
});

test('index.json gate: other paths and look-alikes pass', () => {
  const gate = createIndexJsonGate();
  for (const url of ['/presentation.html', '/index.json.bak', '/xindex.json2', '/a/index.jsonx', '/index.html', '/']) {
    assert.strictEqual(run(gate, { url, address: '10.0.0.5' }).next, true, url);
  }
});

test('index.json gate: a malformed URL does not throw and is not blocked by this gate', () => {
  const gate = createIndexJsonGate();
  assert.strictEqual(run(gate, { url: 'http://[bad', address: '10.0.0.5' }).next, true);
  assert.strictEqual(run(gate, { url: undefined, address: '10.0.0.5' }).next, true);
});

test('admin gate: loopback only', () => {
  const gate = createAdminGate();
  for (const address of LOOPBACK) assert.strictEqual(run(gate, { address }).next, true, address);
  for (const address of REMOTE) {
    const r = run(gate, { address });
    assert.strictEqual(r.status, 403, String(address));
    assert.strictEqual(r.next, false);
  }
});

test('a missing socket (no remote address) is treated as non-loopback by every gate', () => {
  const noSocket = (gate, extra) => {
    const result = { next: false, status: null };
    gate({ url: '/a/index.json', method: 'GET', headers: extra || {} }, { writeHead(s) { result.status = s; }, end() {}, statusCode: 200 }, () => { result.next = true; });
    return result;
  };
  assert.strictEqual(noSocket(createIndexJsonGate()).status, 403);
  assert.strictEqual(noSocket(createAdminGate()).status, 403);
  assert.strictEqual(noSocket(createSandboxOriginGate(), { origin: 'null' }).status, 403);
});
