// Styling and controls for Reveal's built-in speaker view window.
//
// The window is an about:blank popup, so it is same-origin with the presentation and
// inherits its CSP. We cannot add script to it (only the one hashed Reveal script is
// allowed), but code running here can edit its DOM: a <style> element is allowed by
// `style-src 'unsafe-inline'`, and listeners attached from this realm still fire.
// Preferences live in this window's localStorage, which the popup shares.

const STORAGE_THEME = 'speakerView.theme';
const STORAGE_FONT = 'speakerView.fontScale';
const FONT_MIN = 0.8;
const FONT_MAX = 3;
const FONT_STEP = 0.15;

function readPref(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function writePref(key, value) {
  try { localStorage.setItem(key, String(value)); } catch { /* storage unavailable */ }
}

const CSS = `
  body { --sv-font-scale: 1; }
  /* Inline text colors ([text]{.red}); light-theme values first, dark overrides below. */
  .speaker-controls-notes .value { font-size: calc(1.2em * var(--sv-font-scale)); }
  .speaker-controls-notes .text-red { color: #c62828; }
  .speaker-controls-notes .text-green { color: #2e7d32; }
  .speaker-controls-notes .text-blue { color: #1565c0; }
  .speaker-controls-notes .text-purple { color: #7b1fa2; }
  .speaker-controls-notes .text-highlight { color: #b26a00; }
  .speaker-controls-notes .text-muted { color: #757575; }

  #sv-toolbar {
    position: absolute; bottom: 6px; right: 8px; z-index: 15;
    display: flex; gap: 4px; font-family: Helvetica, Arial, sans-serif;
  }
  #sv-toolbar button {
    font: inherit; font-size: 13px; min-width: 30px; height: 28px; padding: 0 8px;
    cursor: pointer; border-radius: 4px; border: 1px solid #bbb;
    background: rgba(220,220,220,0.8); color: #222;
  }
  #sv-toolbar button:hover { background: #ddd; }

  body.sv-dark { background: #14161a; color: #e6e6e6; }
  body.sv-dark #connection-status { background: #14161a; color: #e6e6e6; }
  body.sv-dark #current-slide iframe,
  body.sv-dark #upcoming-slide iframe { border-color: #3a3d44; }
  body.sv-dark .overlay-element { background: rgba(60,64,72,0.85); color: #e6e6e6; }
  body.sv-dark .overlay-element.interactive:hover { background: rgba(80,85,95,1); }
  body.sv-dark #speaker-layout { color: #e6e6e6; }
  body.sv-dark #speaker-layout select { color: #222; }
  body.sv-dark .speaker-controls-time .label,
  body.sv-dark .speaker-controls-pace .label,
  body.sv-dark .speaker-controls-notes .label,
  body.sv-dark .speaker-controls-time .reset-button { color: #9aa0a6; }
  body.sv-dark .speaker-controls-time,
  body.sv-dark .speaker-controls-pace { border-bottom-color: rgba(120,125,135,0.5); }
  body.sv-dark .speaker-controls-time .pacing.ahead { color: #6cb4ff; }
  body.sv-dark .speaker-controls-time .pacing.on-track { color: #6fcf8a; }
  body.sv-dark .speaker-controls-time .pacing.behind { color: #ff6b6b; }
  body.sv-dark .speaker-controls-notes a { color: #8ab4f8; }
  body.sv-dark .speaker-controls-notes .text-red { color: #ff6b6b; }
  body.sv-dark .speaker-controls-notes .text-green { color: #6fcf8a; }
  body.sv-dark .speaker-controls-notes .text-blue { color: #6cb4ff; }
  body.sv-dark .speaker-controls-notes .text-purple { color: #c792ea; }
  body.sv-dark .speaker-controls-notes .text-highlight { color: #ffd54f; }
  body.sv-dark .speaker-controls-notes .text-muted { color: #9aa0a6; }
  body.sv-dark #sv-toolbar button { background: rgba(60,64,72,0.9); color: #e6e6e6; border-color: #555; }
  body.sv-dark #sv-toolbar button:hover { background: rgba(80,85,95,1); }
`;

export function styleSpeakerView(popup) {
  let doc;
  try {
    doc = popup?.document;
    if (!doc?.body) return;
  } catch {
    return; // cross-origin or closed
  }
  if (doc.getElementById('sv-style')) return;

  const style = doc.createElement('style');
  style.id = 'sv-style';
  style.textContent = CSS;
  doc.head.appendChild(style);

  const body = doc.body;
  let fontScale = parseFloat(readPref(STORAGE_FONT, '1')) || 1;
  const applyFont = () => body.style.setProperty('--sv-font-scale', String(fontScale));
  const applyTheme = (dark) => body.classList.toggle('sv-dark', dark);
  let dark = readPref(STORAGE_THEME, 'dark') === 'dark';
  applyTheme(dark);
  applyFont();

  const toolbar = doc.createElement('div');
  toolbar.id = 'sv-toolbar';
  const addButton = (label, title, onClick) => {
    const b = doc.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.title = title;
    b.addEventListener('click', onClick);
    toolbar.appendChild(b);
    return b;
  };
  const changeFont = (delta) => {
    fontScale = Math.min(FONT_MAX, Math.max(FONT_MIN, Math.round((fontScale + delta) * 100) / 100));
    applyFont();
    writePref(STORAGE_FONT, fontScale);
  };
  addButton('A−', 'Smaller notes text', () => changeFont(-FONT_STEP));
  addButton('A+', 'Larger notes text', () => changeFont(FONT_STEP));
  const themeButton = addButton('', 'Toggle light/dark theme', () => {
    dark = !dark;
    applyTheme(dark);
    writePref(STORAGE_THEME, dark ? 'dark' : 'light');
    themeButton.textContent = dark ? '☀' : '☾';
  });
  themeButton.textContent = dark ? '☀' : '☾';
  body.appendChild(toolbar);
}
