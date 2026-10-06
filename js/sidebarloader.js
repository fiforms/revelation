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
  // sidebar.js inserts into document.body immediately, so wait until the body exists.
  const loadSidebarJs = () => {
    const js = document.createElement('script');
    js.src = '/admin/sidebar.js';
    head.appendChild(js);
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadSidebarJs, { once: true });
  } else {
    loadSidebarJs();
  }
}
