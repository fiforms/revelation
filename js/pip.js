// Page script for pip.html: embeds the presentation from ?src= next to a chroma-key area, toggled with
// X. Opened by the wrapper's lib/presentationWindow.js. Query: src (absolute http/https URL), side
// (left|right), color, start (on|off). All validation lives in pip-core.js; this file only wires it to
// the DOM. It is an external module (not inline) so pip.html can carry a CSP without 'unsafe-inline'.
import { parsePipSource, safeColor, classifyMessage } from './pip-core.js';

const params = new URLSearchParams(window.location.search);
const side = (params.get('side') || 'left').toLowerCase();
const start = (params.get('start') || 'off').toLowerCase();

if (side === 'left') {
  document.body.classList.add('pip-left');
}
if (start === 'on') {
  document.body.classList.add('pip-mode');
}
document.documentElement.style.setProperty('--pip-color', safeColor(params.get('color')));

const frame = document.getElementById('presentationFrame');
const source = parsePipSource(params.get('src'));
if (!source.ok) {
  const error = document.createElement('div');
  error.className = 'pip-error';
  error.textContent = source.reason === 'missing'
    ? 'Missing presentation source.'
    : 'Unsupported presentation source (an absolute http or https address is required).';
  document.body.appendChild(error);
} else {
  frame.src = source.url;
}

const togglePip = () => {
  document.body.classList.toggle('pip-mode');
};

const handleKey = (event) => {
  if (event.key === 'x' || event.key === 'X') {
    event.preventDefault();
    togglePip();
  }
};

const forwardKeyToIframe = (event) => {
  if (!frame?.contentWindow) return;
  if (event.key === 'x' || event.key === 'X') return;
  try {
    const targetDoc = frame.contentWindow.document;
    const forwarded = new KeyboardEvent('keydown', {
      key: event.key,
      code: event.code,
      keyCode: event.keyCode,
      which: event.which,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      metaKey: event.metaKey,
      bubbles: true
    });
    targetDoc.dispatchEvent(forwarded);
  } catch (err) {
    // Cross-origin or blocked; ignore.
  }
};

window.addEventListener('keydown', handleKey, true);
window.addEventListener('keydown', forwardKeyToIframe, true);

window.addEventListener('message', (event) => {
  const request = classifyMessage(event, {
    frameWindow: frame?.contentWindow || null,
    selfWindow: window,
    selfOrigin: window.location.origin
  });
  if (!request) return;

  switch (request.action) {
    case 'toggle':
      togglePip();
      break;
    case 'close-presentation':
      if (window.electronAPI?.closePresentation) {
        window.electronAPI.closePresentation();
      } else {
        window.close();
      }
      break;
    case 'send-to-peers':
      if (window.electronAPI?.sendPeerCommand) {
        window.electronAPI.sendPeerCommand({
          type: 'open-presentation',
          payload: { url: request.url }
        });
      }
      break;
    case 'close-on-peers':
      if (window.electronAPI?.sendPeerCommand) {
        window.electronAPI.sendPeerCommand({
          type: 'close-presentation',
          payload: {}
        });
      }
      break;
    default:
      break;
  }
});

const attachIframeKeyListener = () => {
  try {
    if (frame?.contentWindow) {
      const forwardToggle = (event) => {
        if (event.key === 'x' || event.key === 'X') {
          event.preventDefault();
          window.postMessage('pip-toggle', window.location.origin);
        }
      };
      frame.contentWindow.addEventListener('keydown', forwardToggle, true);
      frame.contentWindow.document.addEventListener('keydown', forwardToggle, true);
    }
  } catch (err) {
    // Cross-origin presentations may block key interception.
  }
};

frame.addEventListener('load', attachIframeKeyListener);

document.getElementById('chromaArea').addEventListener('mousedown', () => {
  try {
    frame?.contentWindow?.focus();
  } catch (err) {
    // Ignore focus failures.
  }
});
