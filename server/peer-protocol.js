// server/peer-protocol.js — the peer wire protocol's cryptographic constructions, in ONE place.
// Pure (only node:crypto), so it can be required by both sides of the protocol:
//   - the master, server/peer-server.js (runs in the Vite utility process), and
//   - the wrapper's follower side, lib/peerAuth.js, which loads this file from the bundled
//     revelation folder (see lib/revelationModules.js). The wrapper no longer carries a copy.
// Wire spec: doc/dev/PEERING.md in the wrapper repo ("Signature Constructions"). Everything here is
// protocol: changing a domain string, a field order or the digest changes what peers accept, so bump
// PEER_PROTOCOL_VERSION and update both apps together (followers refuse another version).
//
// Version history:
//   v1: dedicated peer keypair and domain-separated signatures (doc/SECURITY.md F2).
//   v2: PIN used only for enrollment; followers authenticate with their own key.
//
// DOMAIN SEPARATION. /peer/challenge signs caller-supplied bytes by design (that is how a follower
// proves the master holds the key), so it must never produce a signature that is meaningful outside
// the peer protocol. Every signature therefore covers a constant-length, prefixed digest, never the
// caller's bytes. The prefix names the protocol and the operation, so a challenge signature is not a
// valid socket signature and neither is valid anywhere outside this protocol. Follower auth has its
// own domain for the same reason in the other direction: one instance can be both master and
// follower with a single peer keypair, so its challenge signatures must never pass as follower auth.
// signChallenge/verifyChallenge sign the RAW message; peer code must use the signPeer*/verifyPeer*
// wrappers so signatures stay domain-separated.
//
// verifyChallenge never throws: a malformed key or signature is simply "not verified" (false).
const crypto = require('crypto');

// Peer wire protocol version; followers refuse masters advertising another.
const PEER_PROTOCOL_VERSION = 2;

const PEER_CHALLENGE_DOMAIN = 'revelation-peer-challenge:v1:';
const PEER_SOCKET_DOMAIN = 'revelation-peer-socket:v1:';
const PEER_FOLLOWER_AUTH_DOMAIN = 'revelation-peer-follower-auth:v2:';

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');
}

function generateKeyPair() {
  return crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
}

function fingerprintPublicKey(publicKeyPem) {
  return crypto.createHash('sha256').update(publicKeyPem).digest('hex');
}

function generateChallenge() {
  return crypto.randomBytes(32).toString('base64');
}

function signChallenge(privateKeyPem, message) {
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(message);
  signer.end();
  return signer.sign(privateKeyPem).toString('base64');
}

function verifyChallenge(publicKeyPem, message, signatureBase64) {
  try {
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(message);
    verifier.end();
    return verifier.verify(publicKeyPem, Buffer.from(String(signatureBase64 || ''), 'base64'));
  } catch {
    return false;
  }
}

function peerChallengeMessage(challenge) {
  return `${PEER_CHALLENGE_DOMAIN}${sha256Hex(challenge)}`;
}

function peerSocketMessage(payload) {
  return `${PEER_SOCKET_DOMAIN}${sha256Hex(payload)}`;
}

// Signed by a paired follower on every request after enrollment. `nonce` is issued by the master
// (GET /peer/auth-nonce); `masterId` is the audience, so a signature made for one master is useless
// at another.
function peerFollowerAuthMessage({ purpose, masterId, followerId, nonce, extra = '' }) {
  const fields = [purpose, masterId, followerId, nonce, extra].map((v) => String(v ?? ''));
  return `${PEER_FOLLOWER_AUTH_DOMAIN}${sha256Hex(fields.join('\n'))}`;
}

// What the master signs when it grants a command-socket token (POST /peer/socket-info).
function buildSocketPayload(token, expiresAt, socketPath) {
  return `${token}:${expiresAt}:${socketPath}`;
}

function signPeerFollowerAuth(privateKeyPem, fields) {
  return signChallenge(privateKeyPem, peerFollowerAuthMessage(fields));
}

function signPeerChallenge(privateKeyPem, challenge) {
  return signChallenge(privateKeyPem, peerChallengeMessage(challenge));
}

function verifyPeerChallenge(publicKeyPem, challenge, signatureBase64) {
  return verifyChallenge(publicKeyPem, peerChallengeMessage(challenge), signatureBase64);
}

function signPeerSocketPayload(privateKeyPem, payload) {
  return signChallenge(privateKeyPem, peerSocketMessage(payload));
}

function verifyPeerSocketPayload(publicKeyPem, payload, signatureBase64) {
  return verifyChallenge(publicKeyPem, peerSocketMessage(payload), signatureBase64);
}

module.exports = {
  PEER_PROTOCOL_VERSION,
  generateKeyPair,
  fingerprintPublicKey,
  generateChallenge,
  signChallenge,
  verifyChallenge,
  peerChallengeMessage,
  peerSocketMessage,
  peerFollowerAuthMessage,
  buildSocketPayload,
  signPeerFollowerAuth,
  signPeerChallenge,
  verifyPeerChallenge,
  signPeerSocketPayload,
  verifyPeerSocketPayload
};
