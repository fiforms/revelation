// server/reveal-remote-broker.js — /socket.io (Socket.IO default namespace): the Reveal Remote broker
// for reveal.js-remote. First message must be `start` {type}:
//   presenter  -> gets remoteId/multiplexId (re-issued if the supplied hash verifies against the
//                 per-broker secret), QR codes, relays state/notes/buttons/multiplex/video-command
//   remote     -> {id: remoteId}: receives presenter state, sends `command` back
//   follower   -> {id: multiplexId}: receives multiplex state
// No authentication beyond knowing the UUID of the channel (T3 to connect, UUID is the secret).
// State is in-memory only and dropped when the presenter disconnects.
//
// createRevealRemoteBroker() -> { attach(httpServer), close() }
//   One broker owns its own channel state and hash secret, so two brokers never see each other's
//   channels. attach is idempotent; close() disconnects every client (the HTTP server is left to
//   Vite). Created by vite.plugins.js and, in public relay mode, by server/public-relay.js.
const crypto = require('crypto');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const { toDataURL: qrToDataURL } = require('qrcode');

const REVEAL_REMOTE_SOCKET_PATH = '/socket.io';

// Host-supplied remote buttons (see addRemoteButton in reveal.js-remote's plugin).
// Mirrors sanitizeButtons in reveal.js-remote's server: clamp what a presenter
// can put on remote screens. The remote UI renders labels as plain text.
const REVEAL_REMOTE_MAX_BUTTONS = 12;
function sanitizeRevealRemoteButtons(data) {
  const list = data && Array.isArray(data.buttons) ? data.buttons : [];
  return list
    .filter((b) => b && typeof b.id === 'string' && b.id !== '')
    .slice(0, REVEAL_REMOTE_MAX_BUTTONS)
    .map((b) => ({
      id: b.id.slice(0, 64),
      label: String(b.label ?? b.id).slice(0, 40),
      title: typeof b.title === 'string' ? b.title.slice(0, 120) : '',
      disabled: !!b.disabled
    }));
}

function createRevealRemoteBroker() {
  let io = null;
  const states = {};
  const multiplexes = {};
  const hashSecret = uuidv4();

  function mkHash(remoteId, multiplexId) {
    return crypto.createHash('sha256')
      .update(`${remoteId}-${multiplexId}-${hashSecret}`, 'utf8')
      .digest('hex');
  }

  function initPresenter(socket, initialData, baseUrl) {
    let remoteId = null;
    let multiplexId = null;
    let hash = null;

    if (initialData.remoteId && initialData.multiplexId && initialData.hash &&
        mkHash(initialData.remoteId, initialData.multiplexId) === initialData.hash) {
      remoteId = initialData.remoteId;
      multiplexId = initialData.multiplexId;
      hash = initialData.hash;
    }

    if (remoteId === null) {
      remoteId = uuidv4();
      multiplexId = uuidv4();
      hash = mkHash(remoteId, multiplexId);
    }

    socket.join('presenter-' + remoteId);

    const remoteUrl = baseUrl + '_remote/ui/?' + remoteId;
    const multiplexUrl = initialData.shareUrl.replace(/#.*/, '') +
      (initialData.shareUrl.indexOf('?') > 0 ? '&' : '?') + 'remoteMultiplexId=' + multiplexId;

    if (!states[remoteId]) states[remoteId] = {};
    states[remoteId].multiplexUrl = multiplexUrl;

    socket.on('disconnect', () => {
      delete states[remoteId];
      delete multiplexes[multiplexId];
    });

    Promise.all([
      qrToDataURL(remoteUrl, { errorCorrectionLevel: 'Q' }),
      qrToDataURL(multiplexUrl, { errorCorrectionLevel: 'Q' })
    ]).then((base64) => {
      socket.emit('init', {
        remoteUrl, multiplexUrl, hash, remoteId, multiplexId,
        remoteImage: base64[0], multiplexImage: base64[1]
      });
    });

    socket.on('state_changed', (data) => {
      if (!states[remoteId]) states[remoteId] = {};
      states[remoteId].state = data;
      socket.to('remote-' + remoteId).emit('state_changed', data);
    });

    socket.on('notes_changed', (data) => {
      if (!states[remoteId]) states[remoteId] = {};
      states[remoteId].notes = data;
      socket.to('remote-' + remoteId).emit('notes_changed', data);
    });

    socket.on('buttons_changed', (data) => {
      if (!states[remoteId]) states[remoteId] = {};
      const buttons = { buttons: sanitizeRevealRemoteButtons(data) };
      states[remoteId].buttons = buttons;
      socket.to('remote-' + remoteId).emit('buttons_changed', buttons);
    });

    socket.on('multiplex', (data) => {
      multiplexes[multiplexId] = data;
      socket.to('multiplex-' + multiplexId).emit('multiplex', data);
    });

    socket.on('video-command', (data) => {
      socket.to('multiplex-' + multiplexId).emit('video-command', data);
    });
  }

  function initControl(socket, data) {
    const id = data.id;
    socket.join('remote-' + id);
    socket.to('presenter-' + id).emit('client_connected', {});

    if (states[id]) {
      if (states[id].notes) socket.emit('notes_changed', states[id].notes);
      if (states[id].state) socket.emit('state_changed', states[id].state);
      if (states[id].buttons) socket.emit('buttons_changed', states[id].buttons);
      if (states[id].multiplexUrl) socket.emit('presentation_url', { url: states[id].multiplexUrl });
    }

    socket.on('command', (cmd) => {
      if (typeof cmd?.command === 'string') {
        socket.to('presenter-' + id).emit('command', cmd);
      }
    });
  }

  function initFollower(socket, data) {
    socket.join('multiplex-' + data.id);
    if (multiplexes[data.id]) {
      socket.emit('multiplex', multiplexes[data.id]);
    }
  }

  function attach(httpServer) {
    if (io || !httpServer) return io;

    io = new Server(httpServer, {
      path: REVEAL_REMOTE_SOCKET_PATH,
      cookie: false,
      cors: { origin: true }
    });

    io.sockets.on('connection', (socket) => {
      const host = socket.request.headers['x-forwarded-host'] || socket.request.headers['host'];
      const proto = socket.request.headers['x-forwarded-proto'] || 'http';
      const baseUrl = proto + '://' + host + '/';

      socket.once('start', (data) => {
        try {
          if (data.type === 'presenter') {
            initPresenter(socket, data, baseUrl);
          } else if (data.type === 'follower' && data.id) {
            initFollower(socket, data);
          } else if (data.type === 'remote' && data.id) {
            initControl(socket, data);
          }
        } catch (e) {
          console.warn(e);
        }
      });
    });

    console.log('🎛️  Reveal Remote server attached to Vite httpServer at /socket.io');
    return io;
  }

  function close() {
    const active = io;
    io = null;
    if (!active) return;
    // Not io.close(): that also closes the HTTP server, which Vite closes itself, and a second
    // close of a stopped server rejects. Drop the clients and stop the engine instead.
    active.disconnectSockets(true);
    active.engine.close();
  }

  return { attach, close };
}

module.exports = { createRevealRemoteBroker, sanitizeRevealRemoteButtons, REVEAL_REMOTE_SOCKET_PATH, REVEAL_REMOTE_MAX_BUTTONS };
