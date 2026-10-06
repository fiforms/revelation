// sidebarloader.js — inside Electron only (window.electronAPI present), injects the wrapper's
// sidebar (/admin/sidebar.css and /admin/sidebar.js, served from http_admin/ via /admin).
if (window.electronAPI) {
  const head = document.head;

  // Load sidebar.css
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = '/admin/sidebar.css';
  head.appendChild(css);

  // Load sidebar.js
  const js = document.createElement('script');
  js.src = '/admin/sidebar.js';
  head.appendChild(js);
}
