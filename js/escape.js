// js/escape.js
// Purpose: the one browser-side HTML escaper. Encodes & < > " ' so the result is safe both as element
//   text and inside a single- or double-quoted attribute value. (The DOM-based copies this replaces
//   used div.textContent/innerHTML, which leaves quotes alone and so allowed attribute injection.)
// Callers: presentationlist.js, media-core.js, handout.js, http_admin/settings.js.
// Not for: <script>/<style> bodies, URLs placed in href/src (validate those), or JSON in attributes
//   beyond the escaping itself.
// Twin: lib/escapeHtml.js (CommonJS, main process); tests/escapeHtml.test.js cross-checks them.
const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ENTITIES[char]);
}
