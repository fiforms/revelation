// server/peer-protocol.js: the peer wire protocol's constructions, shared by the master
// (server/peer-server.js) and the wrapper's follower side (lib/peerAuth.js).
// The known-answer tests pin the exact strings that go on the wire. The expected hashes were
// computed independently with sha256sum, not with this code: if one of them has to change, the
// protocol changed, so bump PEER_PROTOCOL_VERSION and update both apps together.
const test = require('node:test');
const assert = require('node:assert');
const p = require('../../server/peer-protocol.js');

const SHA256_ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'; // the standard test vector

test('known answers: challenge, socket and follower-auth messages', () => {
  assert.strictEqual(p.peerChallengeMessage('abc'), `revelation-peer-challenge:v1:${SHA256_ABC}`);
  assert.strictEqual(p.peerSocketMessage('abc'), `revelation-peer-socket:v1:${SHA256_ABC}`);
  assert.strictEqual(
    p.peerFollowerAuthMessage({ purpose: 'challenge', masterId: 'master-1', followerId: 'follower-1', nonce: 'n.1.2', extra: 'x' }),
    'revelation-peer-follower-auth:v2:85eca6ff2e8794519879a025fcd6b62026859c36bdaaf50e191639fb058ae44c', // sha256 of "challenge\nmaster-1\nfollower-1\nn.1.2\nx"
  );
  assert.strictEqual(
    p.peerFollowerAuthMessage({ purpose: 'socket-info', masterId: 'm', followerId: 'f', nonce: 'n' }),
    'revelation-peer-follower-auth:v2:825df15c68406bf77f2b308ece5927883f6124587dbe7ec8b32c6e5e6668d240', // sha256 of "socket-info\nm\nf\nn\n" (extra defaults to "")
  );
  assert.strictEqual(p.buildSocketPayload('tok', 1700000000000, '/peer-commands'), 'tok:1700000000000:/peer-commands');
  assert.strictEqual(p.fingerprintPublicKey('KEY'), '5ca24005b740717ba4f3f6bc48a230700e68c2a4b11ecedb96f169f4efaf1f21');
  assert.strictEqual(p.PEER_PROTOCOL_VERSION, 2);
});

test('the three domains differ, so one signature can never be replayed as another kind', () => {
  const messages = [p.peerChallengeMessage('x'), p.peerSocketMessage('x'), p.peerFollowerAuthMessage({ purpose: 'x' })];
  assert.strictEqual(new Set(messages.map((m) => m.split(':')[0] + m.split(':')[1])).size, 3);
});

test('follower-auth fields are order- and boundary-sensitive; missing fields count as empty', () => {
  const base = { purpose: 'a', masterId: 'b', followerId: 'c', nonce: 'd', extra: 'e' };
  assert.notStrictEqual(p.peerFollowerAuthMessage(base), p.peerFollowerAuthMessage({ ...base, purpose: 'ab', masterId: '' }));
  assert.notStrictEqual(p.peerFollowerAuthMessage(base), p.peerFollowerAuthMessage({ ...base, masterId: 'c', followerId: 'b' }));
  assert.strictEqual(p.peerFollowerAuthMessage({ purpose: 'a' }), p.peerFollowerAuthMessage({ purpose: 'a', masterId: '', followerId: null, nonce: undefined, extra: '' }));
});

const a = p.generateKeyPair();
const b = p.generateKeyPair();

test('sign/verify round trips and rejects the wrong key, message and signature', () => {
  const sig = p.signChallenge(a.privateKey, 'message');
  assert.ok(p.verifyChallenge(a.publicKey, 'message', sig));
  assert.ok(!p.verifyChallenge(b.publicKey, 'message', sig));
  assert.ok(!p.verifyChallenge(a.publicKey, 'messagE', sig));
  const flip = (c) => (c === 'A' ? 'B' : 'A');
  assert.ok(!p.verifyChallenge(a.publicKey, 'message', sig.slice(0, 100) + flip(sig[100]) + sig.slice(101)), 'one changed character in the signature');
});

test('verifyChallenge never throws: bad keys, bad signatures and missing arguments are just false', () => {
  const sig = p.signChallenge(a.privateKey, 'm');
  for (const [key, signature] of [['not a key', sig], [a.publicKey, undefined], [a.publicKey, null], [a.publicKey, '%%%not base64%%%'], [a.publicKey, ''], [undefined, sig], [null, null]]) {
    assert.strictEqual(p.verifyChallenge(key, 'm', signature), false, `${String(key).slice(0, 12)} / ${signature}`);
  }
  assert.strictEqual(p.verifyPeerChallenge('garbage', 'c', 'garbage'), false);
  assert.strictEqual(p.verifyPeerSocketPayload('garbage', 'c', 'garbage'), false);
});

test('peer wrappers are domain-separated from each other and from raw signatures', () => {
  const ch = p.signPeerChallenge(a.privateKey, 'same');
  const so = p.signPeerSocketPayload(a.privateKey, 'same');
  assert.ok(p.verifyPeerChallenge(a.publicKey, 'same', ch) && p.verifyPeerSocketPayload(a.publicKey, 'same', so));
  assert.ok(!p.verifyPeerSocketPayload(a.publicKey, 'same', ch));
  assert.ok(!p.verifyPeerChallenge(a.publicKey, 'same', so));
  assert.ok(!p.verifyPeerChallenge(a.publicKey, 'same', p.signChallenge(a.privateKey, 'same')), 'a raw signature is not a peer signature');
  const fields = { purpose: 'challenge', masterId: 'm', followerId: 'f', nonce: 'n', extra: 'x' };
  const auth = p.signPeerFollowerAuth(a.privateKey, fields);
  assert.ok(p.verifyChallenge(a.publicKey, p.peerFollowerAuthMessage(fields), auth));
  assert.ok(!p.verifyPeerChallenge(a.publicKey, 'x', auth), 'follower auth is not a challenge signature');
});

test('generated keys are 2048-bit RSA PEM; challenges are random 32-byte values', () => {
  assert.match(a.publicKey, /^-----BEGIN PUBLIC KEY-----/);
  assert.match(a.privateKey, /^-----BEGIN PRIVATE KEY-----/);
  assert.strictEqual(require('crypto').createPublicKey(a.publicKey).asymmetricKeyDetails.modulusLength, 2048);
  assert.strictEqual(Buffer.from(p.generateChallenge(), 'base64').length, 32);
  assert.notStrictEqual(p.generateChallenge(), p.generateChallenge());
});

test('the module needs nothing but node:crypto (it is loaded by the wrapper too)', () => {
  const src = require('fs').readFileSync(require.resolve('../../server/peer-protocol.js'), 'utf8');
  const requires = [...src.matchAll(/require\('([^']+)'\)/g)].map((m) => m[1]);
  assert.deepStrictEqual(requires, ['crypto']);
});
