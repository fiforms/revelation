// Pure checks for pip.html (the picture-in-picture shell): which URL it may embed, which colour it may
// apply, and which postMessage events it may act on. No DOM access, so tests/unit/pip-core.test.cjs can
// import it directly. pip.js is the page script that uses it.
//
// Why this exists: pip.html is served to the whole network without a key and opened in a window that has
// the wrapper's presentation preload (electronAPI.sendPeerCommand, closePresentation, ...). It used to
// assign ?src= to an iframe unchecked (a `javascript:` URL ran in the server's origin) and to act on any
// postMessage (so any frame could make the presenter push a URL to paired peers).

const MAX_SRC_LENGTH = 4096;
const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

// The embedded page must be an absolute http(s) URL. Relative URLs, and javascript:, data:, blob:,
// file:, vbscript: and anything else, are refused. The wrapper only ever passes an absolute http(s)
// URL (it refuses other schemes before wrapping a page in PiP), so this does not narrow real use.
// Returns { ok: true, url } with the normalised URL, or { ok: false, reason }.
export function parsePipSource(raw, maxLength = MAX_SRC_LENGTH) {
  if (typeof raw !== 'string' || !raw.trim()) return { ok: false, reason: 'missing' };
  if (raw.length > maxLength) return { ok: false, reason: 'too long' };
  let parsed;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return { ok: false, reason: 'not an absolute URL' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: `unsupported scheme ${parsed.protocol}` };
  }
  return { ok: true, url: parsed.href };
}

// ?color= goes into a CSS custom property, so take only a hex colour or something the browser itself
// accepts as a complete <color> (`supports` is CSS.supports in the page, injectable for tests).
export function safeColor(raw, fallback = '#00ff00', supports = (v) => globalThis.CSS?.supports?.('color', v)) {
  if (typeof raw !== 'string') return fallback;
  const value = raw.trim();
  if (!value || value.length > 64) return fallback;
  if (HEX_COLOR.test(value)) return value;
  try {
    return supports(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

// What a message event asks for, or null if it must be ignored. A message is acted on only if it was
// sent by the embedded frame or by this page itself, and from this page's own origin: the presentation
// shipped with the app is same-origin, an arbitrary external page (or any other window) is not.
// ctx = { frameWindow, selfWindow, selfOrigin }.
export function classifyMessage(event, ctx) {
  if (!event || !event.data) return null;
  if (event.origin !== ctx.selfOrigin) return null;
  if (event.source !== ctx.selfWindow && !(ctx.frameWindow && event.source === ctx.frameWindow)) return null;

  const data = event.data;
  if (data === 'pip-toggle') return { action: 'toggle' };
  if (data === 'pip-close-presentation') return { action: 'close-presentation' };
  if (typeof data === 'object') {
    if (data.type === 'pip-send-to-peers') {
      const target = parsePipSource(data.payload?.url, 2048);
      return target.ok ? { action: 'send-to-peers', url: target.url } : null;
    }
    if (data.type === 'pip-close-on-peers') return { action: 'close-on-peers' };
  }
  return null;
}
