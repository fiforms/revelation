// server/presenter-plugins-broker.js — /presenter-plugins-socket (Socket.IO).
// Open room relay for collaboration plugins (slidecontrol, markerboard, bibletext-live, captions,
// videostream). Protocol: client emits `presenter-plugin:join` {plugin, roomId} (ack {ok, room});
// thereafter `presenter-plugin:event` {type, payload} is re-emitted to the other sockets in room
// `<plugin>:<roomId>`. NO authentication: holding the room id is the permission (T2c, see
// doc/SECURITY.md "Open-collaboration plugins"). Input is only shape-checked (plugin name and room
// id regexes, payload must be an object).
//
// createPresenterPluginsBroker() -> { attach(httpServer), close() }
//   attach is idempotent per broker; close() disconnects every client (called when the Vite server
//   closes; it leaves the HTTP server itself to Vite). Created by vite.plugins.js and, in public relay
//   mode, by server/public-relay.js.
const { Server } = require('socket.io');

const PRESENTER_PLUGINS_SOCKET_PATH = '/presenter-plugins-socket';

function sanitizePluginName(value) {
  const plugin = String(value || '').trim().toLowerCase();
  if (!plugin) return '';
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(plugin)) return '';
  return plugin;
}

function sanitizeRoomId(value) {
  const roomId = String(value || '').trim();
  if (!roomId) return '';
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(roomId)) return '';
  return roomId;
}

function createPresenterPluginsBroker() {
  let io = null;

  function attach(httpServer) {
    if (io || !httpServer) return io;

    io = new Server(httpServer, {
      path: PRESENTER_PLUGINS_SOCKET_PATH,
      cors: { origin: '*', methods: ['GET', 'POST'] },
      // Markerboard full-state snapshots can be large (import/restore). Increase
      // payload budget so those sync events are not dropped by Socket.IO defaults.
      maxHttpBufferSize: 25 * 1024 * 1024
    });

    io.on('connection', (socket) => {
      let activeRoom = '';
      let activePlugin = '';

      socket.on('presenter-plugin:join', (data = {}, ack) => {
        const plugin = sanitizePluginName(data.plugin);
        const roomId = sanitizeRoomId(data.roomId);
        if (!plugin || !roomId) {
          if (typeof ack === 'function') ack({ ok: false, error: 'Invalid plugin or room' });
          return;
        }

        const room = `${plugin}:${roomId}`;
        if (activeRoom && activeRoom !== room) {
          socket.leave(activeRoom);
        }
        socket.join(room);
        activeRoom = room;
        activePlugin = plugin;
        if (typeof ack === 'function') ack({ ok: true, room });
      });

      socket.on('presenter-plugin:event', (message = {}) => {
        if (!activeRoom || !activePlugin) return;
        const type = String(message.type || '').trim();
        if (!type) return;
        const event = {
          plugin: activePlugin,
          roomId: activeRoom.split(':').slice(1).join(':'),
          type,
          payload: message.payload && typeof message.payload === 'object' ? message.payload : {},
          ts: Date.now()
        };
        socket.to(activeRoom).emit('presenter-plugin:event', event);
      });
    });

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

module.exports = {
  createPresenterPluginsBroker,
  sanitizePluginName,
  sanitizeRoomId,
  PRESENTER_PLUGINS_SOCKET_PATH
};
