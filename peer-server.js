// Master side of the peer protocol: the /peer/* HTTP endpoints, the
// /peer-commands Socket.IO namespace, and the store of paired followers.
//
// Protocol v2 (doc/dev/PEERING.md in the wrapper repo):
//   - The pairing PIN is used once, at enrollment (POST /peer/pair). The
//     follower hands over its peer public key and the master remembers it.
//   - Every later request from that follower (socket-info, challenge) is
//     signed with the follower's peer private key over a master-issued nonce.
//     No PIN, and nothing secret, goes over the wire after pairing.
//   - Changing the PIN affects new pairings only. Access is revoked by
//     forgetting the follower here (Settings → Peer Pairing on the master).
//
// This file runs in the Vite utility process, which is the only writer of the
// follower store. The Electron main process reads the store to display it and
// asks this process (via parentPort) to forget followers and to fan commands
// out to followers. There is deliberately no HTTP endpoint for sending
// commands: a loopback-only check does not stop a web page in a browser on
// this machine from POSTing to 127.0.0.1.

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { Server } = require('socket.io');

const PEER_SOCKET_PATH = '/peer-commands';
// Bumped when the peer wire protocol changes incompatibly.
//   v1: dedicated peer keypair and domain-separated signatures (doc/SECURITY.md F2).
//   v2: PIN used only for enrollment; followers authenticate with their own key.
// Followers refuse to pair with a master advertising any other version.
const PEER_PROTOCOL_VERSION = 2;

const PIN_FAILURE_LIMIT = 3;
const PIN_BLOCK_MS = 60_000;
const PEER_EVENT_LIMIT = 200;
const AUTH_NONCE_TTL_MS = 60_000;
const SOCKET_TOKEN_TTL_MS = 60_000;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_FOLLOWERS = 256;
const FOLLOWER_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

// --- Domain-separated peer signatures -------------------------------------
//
// /peer/challenge signs caller-supplied bytes by design, so it must never
// produce a signature that is meaningful outside the peer protocol. Signing a
// prefixed digest rather than the caller's bytes makes the endpoint useless as
// an oracle for any other verifier. See doc/SECURITY.md (F2).
//
// The follower-auth domain matters for the same reason in the other
// direction: an instance can be both a master and a follower with one peer
// keypair, so its challenge signatures must never pass as follower auth.
//
// ⚠ These constructions are byte-identical copies of the ones in the wrapper's
// lib/peerAuth.js (this file runs in the Vite utility process and cannot
// require from the wrapper). They are wire protocol: change both sides
// together or pairing breaks.

const PEER_CHALLENGE_DOMAIN = 'revelation-peer-challenge:v1:';
const PEER_SOCKET_DOMAIN = 'revelation-peer-socket:v1:';
const PEER_FOLLOWER_AUTH_DOMAIN = 'revelation-peer-follower-auth:v2:';

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');
}

function signRaw(privateKeyPem, message) {
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(message);
  signer.end();
  return signer.sign(privateKeyPem).toString('base64');
}

function verifyRaw(publicKeyPem, message, signatureBase64) {
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

function peerFollowerAuthMessage({ purpose, masterId, followerId, nonce, extra = '' }) {
  const fields = [purpose, masterId, followerId, nonce, extra].map((v) => String(v ?? ''));
  return `${PEER_FOLLOWER_AUTH_DOMAIN}${sha256Hex(fields.join('\n'))}`;
}

function buildSocketPayload(token, expiresAt, socketPath) {
  return `${token}:${expiresAt}:${socketPath}`;
}

function fingerprintPublicKey(publicKeyPem) {
  return crypto.createHash('sha256').update(publicKeyPem).digest('hex');
}

// --- Small helpers ---------------------------------------------------------

function normalizeRemoteAddress(address) {
  if (!address) return 'unknown';
  return address.startsWith('::ffff:') ? address.replace('::ffff:', '') : address;
}

function isLoopbackAddress(address) {
  if (!address) return false;
  const normalized = normalizeRemoteAddress(address);
  return normalized === '127.0.0.1' || normalized === '::1';
}

function normalizeLabel(value, maxLength = 128) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function timingSafeEqualString(a, b) {
  const bufA = Buffer.from(String(a ?? ''), 'utf8');
  const bufB = Buffer.from(String(b ?? ''), 'utf8');
  // Length is not hidden, but the PIN is a fixed 6 digits and three wrong
  // guesses trigger a 60s lockout, so that leak carries no useful signal.
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function sendJSON(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function readJSONBody(req, res, callback) {
  let body = '';
  let tooLarge = false;
  req.on('data', (chunk) => {
    if (tooLarge) return;
    body += chunk.toString();
    if (body.length > MAX_BODY_BYTES) {
      tooLarge = true;
      sendJSON(res, 413, { error: 'Request body too large' });
      req.destroy();
    }
  });
  req.on('end', () => {
    if (tooLarge) return;
    let data;
    try {
      data = JSON.parse(body || '{}');
    } catch {
      sendJSON(res, 400, { error: 'Invalid JSON' });
      return;
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      sendJSON(res, 400, { error: 'Invalid JSON' });
      return;
    }
    callback(data);
  });
}

function isUsableFollowerKey(publicKeyPem) {
  if (typeof publicKeyPem !== 'string' || publicKeyPem.length > 8192) return false;
  try {
    const key = crypto.createPublicKey(publicKeyPem);
    return key.asymmetricKeyType === 'rsa' && (key.asymmetricKeyDetails?.modulusLength || 0) >= 2048;
  } catch {
    return false;
  }
}

// --- Config -----------------------------------------------------------------

// The wrapper keeps the active profile's settings in profiles/<name>.config.json
// and leaves only a pointer (plus the Default profile's settings) in
// config.json. Follow the pointer so the endpoints enforce the same PIN and
// keys the running app shows. Mirrors loadConfig() in lib/configManager.js.
function loadPeerConfig(configPath) {
  if (!configPath || !fs.existsSync(configPath)) return null;
  let mainConfig;
  try {
    mainConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch {
    return null;
  }
  const profile = typeof mainConfig.profile === 'string' ? mainConfig.profile.trim() : '';
  if (profile && profile !== 'Default') {
    const profilePath = path.join(path.dirname(configPath), 'profiles', `${profile}.config.json`);
    if (fs.existsSync(profilePath)) {
      try {
        return JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
      } catch {
        return null;
      }
    }
  }
  return mainConfig;
}

// --- Paired follower store ---------------------------------------------------
//
// { version: 1, followers: [{ instanceId, name, publicKey, pairedAt,
//   lastSeenAt, lastAddress }] }
//
// Read from disk on every use (it is tiny) so an edit made by the main process
// while this process was down is picked up; written atomically.

function readFollowerStore(followersPath) {
  if (!followersPath || !fs.existsSync(followersPath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(followersPath, 'utf-8'));
    const list = Array.isArray(parsed?.followers) ? parsed.followers : [];
    return list.filter((f) => f && FOLLOWER_ID_RE.test(String(f.instanceId || '')) && typeof f.publicKey === 'string');
  } catch (err) {
    console.error(`⚠ Could not read paired followers (${followersPath}): ${err.message}`);
    return [];
  }
}

function writeFollowerStore(followersPath, followers) {
  if (!followersPath) throw new Error('Follower store path unavailable');
  const tmpPath = `${followersPath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify({ version: 1, followers }, null, 2));
  fs.renameSync(tmpPath, followersPath);
}

// --- Server -----------------------------------------------------------------

// postToParent(message) delivers replies and notifications to the Electron
// main process (process.parentPort.postMessage in production).
function createPeerServer({ configPath, followersPath, postToParent } = {}) {
  let peerCommandIo = null;
  const pinFailures = new Map();
  let eventSeq = 0;
  const eventLog = [];
  const activeFollowers = new Map(); // socket.id → { instanceId, ... }
  const socketTokens = new Map(); // token → { followerId, expiresAt }
  const usedNonces = new Map(); // nonce → expiresAt
  const nonceSecret = crypto.randomBytes(32);

  function post(message) {
    try {
      postToParent?.(message);
    } catch (err) {
      console.error(`⚠ Could not message the main process: ${err.message}`);
    }
  }

  function notifyFollowersChanged(requestId) {
    post({ type: 'peer-followers-changed', requestId: requestId || null });
  }

  // Fan a command out to every connected (therefore paired) follower.
  function sendCommand(command) {
    const config = loadPeerConfig(configPath);
    if (config?.mdnsPublish !== true) {
      throw new Error('Peer endpoints disabled (mDNS publishing off)');
    }
    if (!peerCommandIo) {
      throw new Error('Peer command server unavailable');
    }
    if (!command || typeof command !== 'object' || typeof command.type !== 'string' || !command.type) {
      throw new Error('Missing command type');
    }
    peerCommandIo.emit('peer-command', command);
  }

  function recordPeerEvent(type, payload = {}) {
    eventSeq += 1;
    eventLog.push({ id: eventSeq, type, at: new Date().toISOString(), ...payload });
    if (eventLog.length > PEER_EVENT_LIMIT) {
      eventLog.splice(0, eventLog.length - PEER_EVENT_LIMIT);
    }
    return eventSeq;
  }

  function getPeerStatus(sinceId = 0) {
    const parsedSince = Number.parseInt(sinceId, 10);
    const safeSince = Number.isFinite(parsedSince) && parsedSince > 0 ? parsedSince : 0;
    const events = safeSince ? eventLog.filter((entry) => entry.id > safeSince) : [];
    const followers = Array.from(activeFollowers.values())
      .sort((a, b) => String(a.connectedAt).localeCompare(String(b.connectedAt)));
    return { activeFollowers: followers, events, lastEventId: eventSeq };
  }

  // --- PIN lockout (enrollment only) ---

  function getPinFailureState(remoteAddress) {
    const current = pinFailures.get(remoteAddress);
    if (!current) return { failures: 0, blockedUntil: 0 };
    if (current.blockedUntil && current.blockedUntil <= Date.now()) {
      pinFailures.delete(remoteAddress);
      return { failures: 0, blockedUntil: 0 };
    }
    return current;
  }

  function registerPinFailure(remoteAddress) {
    const failures = (getPinFailureState(remoteAddress).failures || 0) + 1;
    const next = failures >= PIN_FAILURE_LIMIT
      ? { failures: 0, blockedUntil: Date.now() + PIN_BLOCK_MS }
      : { failures, blockedUntil: 0 };
    pinFailures.set(remoteAddress, next);
    return next;
  }

  function retryAfterSec(state) {
    return Math.max(1, Math.ceil((state.blockedUntil - Date.now()) / 1000));
  }

  // Gate an enrollment request on the PIN. Returns true when the request has
  // already been answered and the caller must stop; false to continue.
  //
  // Fails CLOSED. The previous check was `if (expectedPin && providedPin !==
  // expectedPin)`, so a missing, empty or non-string PIN skipped verification
  // altogether. This config is re-read from disk on every request and trusted
  // as found, so a hand-edited file, a failed write, a restored older-schema
  // config or a profile switch was enough to open the endpoint.
  // Authentication must not be structurally fail-open. See doc/SECURITY.md (F4).
  function enforcePairingPin(config, providedPin, remoteAddress, res) {
    const rawPin = config?.mdnsPairingPin;
    const expectedPin = (typeof rawPin === 'string' || typeof rawPin === 'number')
      ? String(rawPin).trim()
      : '';

    if (!expectedPin) {
      console.warn(
        '⚠ Peer pairing request refused: no mdnsPairingPin is configured. ' +
        'Set a pairing PIN in Settings (or disable Master Mode).'
      );
      sendJSON(res, 503, { error: 'Pairing is not configured on this device', code: 'pairing-unavailable' });
      return true;
    }

    const state = getPinFailureState(remoteAddress);
    if (state.blockedUntil && state.blockedUntil > Date.now()) {
      sendJSON(res, 429, { error: 'Too many invalid pairing PIN attempts', code: 'pin-lockout', retryAfterSec: retryAfterSec(state) });
      return true;
    }

    if (!timingSafeEqualString(providedPin, expectedPin)) {
      const next = registerPinFailure(remoteAddress);
      if (next.blockedUntil && next.blockedUntil > Date.now()) {
        const retry = retryAfterSec(next);
        recordPeerEvent('pin-lockout', { remoteAddress, retryAfterSec: retry });
        sendJSON(res, 429, { error: 'Too many invalid pairing PIN attempts', code: 'pin-lockout', retryAfterSec: retry });
      } else {
        sendJSON(res, 403, {
          error: 'Invalid pairing PIN',
          code: 'invalid-pin',
          remainingAttempts: Math.max(0, PIN_FAILURE_LIMIT - next.failures)
        });
      }
      return true;
    }

    pinFailures.delete(remoteAddress);
    return false;
  }

  // --- Follower authentication ---
  //
  // Nonces are stateless to issue (HMAC over expiry + randomness, keyed per
  // process), so an unauthenticated caller cannot fill memory by requesting
  // them. Only nonces that complete a valid follower signature are remembered,
  // until they expire, to stop replay.

  function issueAuthNonce() {
    const expiresAt = Date.now() + AUTH_NONCE_TTL_MS;
    const body = `${expiresAt}.${crypto.randomBytes(16).toString('hex')}`;
    const mac = crypto.createHmac('sha256', nonceSecret).update(body).digest('hex');
    return { nonce: `${body}.${mac}`, expiresAt };
  }

  function checkAuthNonce(nonce) {
    const parts = String(nonce || '').split('.');
    if (parts.length !== 3) return false;
    const [expiresRaw, rand, mac] = parts;
    const expected = crypto.createHmac('sha256', nonceSecret).update(`${expiresRaw}.${rand}`).digest('hex');
    if (!timingSafeEqualString(mac, expected)) return false;
    const expiresAt = Number(expiresRaw);
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
    const now = Date.now();
    for (const [used, usedExpiry] of usedNonces) {
      if (usedExpiry < now) usedNonces.delete(used);
    }
    return !usedNonces.has(nonce) ? expiresAt : false;
  }

  // Returns the follower record, or answers the request and returns null.
  function authenticateFollower(config, body, purpose, extra, res) {
    const followerId = String(body.followerInstanceId || '').trim();
    if (!FOLLOWER_ID_RE.test(followerId)) {
      sendJSON(res, 400, { error: 'Missing or invalid followerInstanceId' });
      return null;
    }
    const follower = readFollowerStore(followersPath).find((f) => f.instanceId === followerId);
    if (!follower) {
      sendJSON(res, 403, { error: 'This device is not paired with this master', code: 'not-paired' });
      return null;
    }
    const nonceExpiresAt = checkAuthNonce(body.nonce);
    if (!nonceExpiresAt) {
      sendJSON(res, 401, { error: 'Missing, expired or reused auth nonce', code: 'invalid-nonce' });
      return null;
    }
    const message = peerFollowerAuthMessage({
      purpose,
      masterId: config.mdnsInstanceId,
      followerId,
      nonce: body.nonce,
      extra
    });
    if (!verifyRaw(follower.publicKey, message, body.signature)) {
      sendJSON(res, 403, { error: 'Follower signature verification failed', code: 'invalid-signature' });
      return null;
    }
    usedNonces.set(body.nonce, nonceExpiresAt);
    return follower;
  }

  function upsertFollower(record) {
    const followers = readFollowerStore(followersPath);
    const index = followers.findIndex((f) => f.instanceId === record.instanceId);
    if (index >= 0) {
      followers[index] = { ...followers[index], ...record };
    } else {
      if (followers.length >= MAX_FOLLOWERS) {
        throw new Error('Too many paired followers; forget some on the master first');
      }
      followers.push(record);
    }
    writeFollowerStore(followersPath, followers);
  }

  function touchFollower(instanceId, remoteAddress) {
    try {
      const followers = readFollowerStore(followersPath);
      const follower = followers.find((f) => f.instanceId === instanceId);
      if (!follower) return;
      follower.lastSeenAt = new Date().toISOString();
      follower.lastAddress = remoteAddress;
      writeFollowerStore(followersPath, followers);
      notifyFollowersChanged();
    } catch (err) {
      console.error(`⚠ Could not update follower last-seen: ${err.message}`);
    }
  }

  function disconnectFollowerSockets(instanceId = null) {
    for (const [token, entry] of socketTokens) {
      if (!instanceId || entry.followerId === instanceId) socketTokens.delete(token);
    }
    if (!peerCommandIo) return;
    for (const socket of peerCommandIo.sockets.sockets.values()) {
      if (!instanceId || socket.data?.followerId === instanceId) {
        socket.disconnect(true);
      }
    }
  }

  // instanceId null → forget every follower.
  function forgetFollowers(instanceId = null, requestId) {
    const followers = readFollowerStore(followersPath);
    const remaining = instanceId ? followers.filter((f) => f.instanceId !== instanceId) : [];
    const removed = followers.length - remaining.length;
    if (removed > 0) writeFollowerStore(followersPath, remaining);
    disconnectFollowerSockets(instanceId);
    recordPeerEvent('followers-forgotten', { instanceId: instanceId || null, count: removed });
    notifyFollowersChanged(requestId);
    return removed;
  }

  // Messages from the Electron main process (see lib/peerFollowers.js).
  function handleParentMessage(data) {
    if (data?.type === 'peer-forget-follower') {
      const id = String(data.instanceId || '').trim();
      if (!FOLLOWER_ID_RE.test(id)) {
        notifyFollowersChanged(data.requestId);
        return true;
      }
      forgetFollowers(id, data.requestId);
      return true;
    }
    if (data?.type === 'peer-forget-all-followers') {
      forgetFollowers(null, data.requestId);
      return true;
    }
    if (data?.type === 'peer-command') {
      try {
        sendCommand(data.command);
        post({ type: 'peer-command-result', requestId: data.requestId || null });
      } catch (err) {
        post({ type: 'peer-command-result', requestId: data.requestId || null, error: err.message });
      }
      return true;
    }
    return false;
  }

  // --- HTTP ---

  function middleware(req, res, next) {
    if (!req.url?.startsWith('/peer/')) return next();

    const config = loadPeerConfig(configPath);
    if (!config) {
      sendJSON(res, 500, { error: 'Peer config unavailable' });
      return;
    }
    if (config.mdnsPublish !== true) {
      sendJSON(res, 403, { error: 'Peer endpoints disabled (mDNS publishing off)', code: 'master-disabled' });
      return;
    }

    const parsedUrl = new URL(req.url, 'http://localhost');
    const pathname = parsedUrl.pathname;
    const remoteAddress = normalizeRemoteAddress(req.socket?.remoteAddress);

    if (req.method === 'GET' && pathname === '/peer/status') {
      if (!isLoopbackAddress(req.socket?.remoteAddress)) {
        sendJSON(res, 403, { error: 'Forbidden' });
        return;
      }
      sendJSON(res, 200, getPeerStatus(parsedUrl.searchParams.get('since')));
      return;
    }

    if (req.method === 'GET' && pathname === '/peer/public-key') {
      // Serves the peer identity only. The WordPress keypair
      // (config.rsaPublicKey) is deliberately never published here.
      const publicKey = config.peerRsaPublicKey;
      sendJSON(res, 200, {
        instanceId: config.mdnsInstanceId,
        instanceName: config.mdnsInstanceName,
        hostname: os.hostname(),
        peerProtocol: PEER_PROTOCOL_VERSION,
        publicKey,
        publicKeyFingerprint: fingerprintPublicKey(publicKey || '')
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/peer/auth-nonce') {
      sendJSON(res, 200, issueAuthNonce());
      return;
    }

    if (!config.peerRsaPrivateKey) {
      sendJSON(res, 500, { error: 'Peer private key unavailable' });
      return;
    }

    // Enrollment: the only request that carries the PIN.
    if (req.method === 'POST' && pathname === '/peer/pair') {
      readJSONBody(req, res, (data) => {
        if (enforcePairingPin(config, data.pin, remoteAddress, res)) return;
        const followerId = String(data.followerInstanceId || '').trim();
        const challenge = typeof data.challenge === 'string' ? data.challenge : '';
        if (!FOLLOWER_ID_RE.test(followerId)) {
          sendJSON(res, 400, { error: 'Missing or invalid followerInstanceId' });
          return;
        }
        if (!challenge || challenge.length > 1024) {
          sendJSON(res, 400, { error: 'Missing or invalid challenge' });
          return;
        }
        if (!isUsableFollowerKey(data.followerPublicKey)) {
          sendJSON(res, 400, { error: 'Missing or invalid followerPublicKey (RSA, 2048 bits or more)' });
          return;
        }
        const name = normalizeLabel(data.followerName) || followerId;
        try {
          upsertFollower({
            instanceId: followerId,
            name,
            publicKey: data.followerPublicKey,
            pairedAt: new Date().toISOString(),
            lastAddress: remoteAddress
          });
          // A re-pair replaces the key, so drop sessions made with the old one.
          disconnectFollowerSockets(followerId);
          const signature = signRaw(config.peerRsaPrivateKey, peerChallengeMessage(challenge));
          recordPeerEvent('follower-paired', { instanceId: followerId, instanceName: name, remoteAddress });
          notifyFollowersChanged();
          sendJSON(res, 200, {
            signature,
            peerProtocol: PEER_PROTOCOL_VERSION,
            instanceId: config.mdnsInstanceId,
            instanceName: config.mdnsInstanceName
          });
        } catch (err) {
          sendJSON(res, 500, { error: err.message });
        }
      });
      return;
    }

    // Identity check for a paired follower (mDNS re-verification).
    if (req.method === 'POST' && pathname === '/peer/challenge') {
      readJSONBody(req, res, (data) => {
        const challenge = typeof data.challenge === 'string' ? data.challenge : '';
        if (!challenge || challenge.length > 1024) {
          sendJSON(res, 400, { error: 'Missing or invalid challenge' });
          return;
        }
        if (!authenticateFollower(config, data, 'challenge', challenge, res)) return;
        try {
          // Domain-separated: the caller's bytes are hashed under a peer
          // protocol prefix, never signed directly. See doc/SECURITY.md (F2).
          const signature = signRaw(config.peerRsaPrivateKey, peerChallengeMessage(challenge));
          sendJSON(res, 200, { signature, peerProtocol: PEER_PROTOCOL_VERSION });
        } catch (err) {
          sendJSON(res, 500, { error: err.message });
        }
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/peer/socket-info') {
      readJSONBody(req, res, (data) => {
        const follower = authenticateFollower(config, data, 'socket-info', '', res);
        if (!follower) return;
        const now = Date.now();
        for (const [issued, entry] of socketTokens) {
          if (entry.expiresAt < now) socketTokens.delete(issued);
        }
        const token = crypto.randomBytes(16).toString('hex');
        const expiresAt = now + SOCKET_TOKEN_TTL_MS;
        socketTokens.set(token, { followerId: follower.instanceId, expiresAt });
        const signature = signRaw(
          config.peerRsaPrivateKey,
          peerSocketMessage(buildSocketPayload(token, expiresAt, PEER_SOCKET_PATH))
        );
        const protocol = req.socket?.encrypted ? 'https' : 'http';
        sendJSON(res, 200, {
          socketUrl: `${protocol}://${req.headers.host}`,
          socketPath: PEER_SOCKET_PATH,
          token,
          expiresAt,
          signature
        });
      });
      return;
    }

    sendJSON(res, 404, { error: 'Not found' });
  }

  // --- Socket.IO ---

  function socketAuthError(message, code) {
    const err = new Error(message);
    err.data = { code };
    return err;
  }

  function attachSocketServer(httpServer) {
    if (peerCommandIo || !httpServer) return peerCommandIo;

    peerCommandIo = new Server(httpServer, {
      path: PEER_SOCKET_PATH,
      cors: { origin: '*', methods: ['GET', 'POST'] }
    });

    peerCommandIo.use((socket, next) => {
      const { token, expiresAt, signature } = socket.handshake.auth || {};
      const config = loadPeerConfig(configPath);

      if (!token || !expiresAt || !signature || !config?.peerRsaPublicKey) {
        return next(socketAuthError('Missing peer auth', 'missing-auth'));
      }
      if (config.mdnsPublish !== true) {
        return next(socketAuthError('Peer endpoints disabled (mDNS publishing off)', 'master-disabled'));
      }
      const issued = socketTokens.get(token);
      if (!issued || Number(expiresAt) !== issued.expiresAt || issued.expiresAt < Date.now()) {
        return next(socketAuthError('Peer auth expired', 'expired'));
      }
      const payload = buildSocketPayload(token, expiresAt, PEER_SOCKET_PATH);
      if (!verifyRaw(config.peerRsaPublicKey, peerSocketMessage(payload), signature)) {
        return next(socketAuthError('Invalid peer signature', 'invalid-signature'));
      }
      const follower = readFollowerStore(followersPath).find((f) => f.instanceId === issued.followerId);
      if (!follower) {
        return next(socketAuthError('This device is not paired with this master', 'not-paired'));
      }
      // Identity comes from the token binding, never from the client's claims.
      socket.data.followerId = follower.instanceId;
      socket.data.followerName = follower.name;
      return next();
    });

    peerCommandIo.on('connection', (socket) => {
      const auth = socket.handshake.auth || {};
      const instanceId = socket.data.followerId;
      const instanceName = socket.data.followerName || normalizeLabel(auth.instanceName);
      const hostname = normalizeLabel(auth.hostname) || instanceName;
      const remoteAddress = normalizeRemoteAddress(socket.handshake.address || socket.request?.socket?.remoteAddress);
      activeFollowers.set(socket.id, {
        socketId: socket.id,
        instanceId,
        instanceName,
        hostname,
        remoteAddress,
        connectedAt: new Date().toISOString()
      });
      touchFollower(instanceId, remoteAddress);
      recordPeerEvent('follower-connected', { instanceId, instanceName, hostname, remoteAddress });

      socket.on('disconnect', () => {
        activeFollowers.delete(socket.id);
        notifyFollowersChanged();
      });
    });

    return peerCommandIo;
  }

  return {
    middleware,
    attachSocketServer,
    handleParentMessage,
    // Exposed for tests.
    _forgetFollowers: forgetFollowers
  };
}

module.exports = {
  PEER_PROTOCOL_VERSION,
  PEER_SOCKET_PATH,
  createPeerServer,
  isLoopbackAddress,
  normalizeRemoteAddress,
  peerFollowerAuthMessage
};
