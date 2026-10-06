// server/network.js: the loopback decision every gate relies on.
const test = require('node:test');
const assert = require('node:assert');
const { isLoopbackAddress, normalizeRemoteAddress } = require('../../server/network.js');

test('normalizeRemoteAddress strips only the IPv4-mapped prefix; missing becomes "unknown"', () => {
  assert.strictEqual(normalizeRemoteAddress('::ffff:10.0.0.5'), '10.0.0.5');
  assert.strictEqual(normalizeRemoteAddress('::ffff:127.0.0.1'), '127.0.0.1');
  assert.strictEqual(normalizeRemoteAddress('10.0.0.5'), '10.0.0.5');
  assert.strictEqual(normalizeRemoteAddress('::1'), '::1');
  assert.strictEqual(normalizeRemoteAddress('2001:db8::ffff:1'), '2001:db8::ffff:1', 'only a leading prefix');
  for (const missing of [undefined, null, '']) assert.strictEqual(normalizeRemoteAddress(missing), 'unknown');
});

test('isLoopbackAddress: exactly 127.0.0.1 and ::1, however they are written', () => {
  for (const ok of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) assert.ok(isLoopbackAddress(ok), ok);
  for (const no of ['127.0.0.2', '127.1', '0.0.0.0', 'localhost', '::', '::2', '::ffff:10.0.0.5', '10.0.0.5', '192.168.1.1', 'unknown', '', null, undefined]) {
    assert.ok(!isLoopbackAddress(no), String(no));
  }
});
