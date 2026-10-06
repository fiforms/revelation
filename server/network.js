// server/network.js — remote-address helpers shared by the access gates and the peer endpoints.
//   normalizeRemoteAddress(addr)  strips the IPv4-mapped IPv6 prefix ("::ffff:10.0.0.5" -> "10.0.0.5");
//                                 'unknown' for a missing address
//   isLoopbackAddress(addr)       true only for 127.0.0.1 and ::1 (after normalizing); false for a
//                                 missing address, "localhost", or any other 127.x.x.x
// NOTE: behind a same-machine reverse proxy every forwarded request presents 127.0.0.1, so a loopback
// check passes for the whole internet; see server/public-relay.js. Pure, no dependencies.
// Used by server/access-gates.js and server/peer-server.js.
function normalizeRemoteAddress(address) {
  if (!address) return 'unknown';
  return address.startsWith('::ffff:') ? address.replace('::ffff:', '') : address;
}

function isLoopbackAddress(address) {
  if (!address) return false;
  const normalized = normalizeRemoteAddress(address);
  return normalized === '127.0.0.1' || normalized === '::1';
}

module.exports = { normalizeRemoteAddress, isLoopbackAddress };
