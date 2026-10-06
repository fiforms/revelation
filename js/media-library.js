// media-library.js — page script for media-library.html (the standalone media library).
// Adds the "back to presentations" link (hidden inside Electron), reloads on the Vite
// `reload-media` HMR event, and hands the grid to initMediaLibrary() in media-core.js, which
// does the real work. Requires ?key=<presentations key>.
import { initMediaLibrary } from './media-core.js';

const container = document.getElementById('media-grid-container'); // existing div in media-library.html
const urlParams = new URLSearchParams(window.location.search);
const url_key = urlParams.get('key');

const backLink = document.getElementById('back-link');
if (url_key && backLink) {
  const a = document.createElement('a');
  a.href = `/presentations.html?key=${url_key}`;
  // set data-translate attribute for translation
  a.setAttribute('data-translate', 'true');
  a.textContent = '← Back to Presentations';
  a.style = 'color:#4da6ff;text-decoration:none;font-size:1rem;';
  a.onmouseover = () => a.style.textDecoration = 'underline';
  a.onmouseout = () => a.style.textDecoration = 'none';
  backLink.appendChild(a);
}

// Vite HMR hook (unchanged)
if (import.meta.hot) {
  import.meta.hot.on('reload-media', () => location.reload());
}

if(window.electronAPI) {
  const linkBack = document.getElementById('back-link');
  if(linkBack) linkBack.style.display = 'none';
}

initMediaLibrary(container, { key: url_key, mode: 'standalone' });
