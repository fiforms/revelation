const container = document.getElementById('media-grid');
const urlParams = new URLSearchParams(window.location.search);
const url_key = urlParams.get('key');
let mediaInfo = {};

import { pluginLoader } from './pluginloader.js';  

const backLink = document.getElementById('back-link');
if (url_key) {
  const a = document.createElement('a');
  a.href = `/presentations.html?key=${url_key}`;
  a.textContent = '← Back to Presentations';
  a.style = 'color: #4da6ff; text-decoration: none; font-size: 1rem;';
  a.onmouseover = () => a.style.textDecoration = 'underline';
  a.onmouseout = () => a.style.textDecoration = 'none';
  backLink.appendChild(a);
}

// VITE Hot Reloading Hook
if (import.meta.hot) {
  import.meta.hot.on('reload-media', () => {
    console.log('[HMR] Reloading media list');
    location.reload();
  });
}

pluginLoader('media-library');

fetch(`/presentations_${url_key}/_media/index.json`)
  .then(res => res.json())
  .then(media => {
    const entries = Object.entries(media);
    if (!entries.length) {
      container.innerHTML = '<p>No media found.</p>';
      return;
    }

    mediaInfo = media;
    container.innerHTML = '';

    for (const [key, item] of entries) {
      const card = document.createElement('div');
      card.className = 'media-card';
      card.dataset.key = key;
      card.addEventListener('click', clickToView);
      card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showMediaContextMenu(e.pageX, e.pageY, item);
      });

      const thumb = document.createElement('img');
      thumb.src = `/presentations_${url_key}/_media/${item.thumbnail}`;
      thumb.alt = item.title || item.original_filename;
      card.appendChild(thumb);

      const title = document.createElement('div');
      title.className = 'title';
      title.textContent = item.title || item.original_filename;
      card.appendChild(title);

      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.innerHTML = `
        ${item.description || ''}<br/>
        <small>${item.original_filename}</small><br/>
        ${item.copyright ? `<small>${item.copyright}</small><br/>` : ''}
      `;
      card.appendChild(meta);

      container.appendChild(card);
    }
  })
  .catch(err => {
    container.innerHTML = `<p style="color:red">Failed to load media index: ${err.message}</p>`;
    console.error(err);
  });

  // Create lightbox modal
const lightbox = document.createElement('div');
lightbox.id = 'lightbox-overlay';
lightbox.style.display = 'none';
lightbox.style.position = 'fixed';
lightbox.style.top = '0';
lightbox.style.left = '0';
lightbox.style.width = '100%';
lightbox.style.height = '100%';
lightbox.style.background = 'rgba(0,0,0,0.9)';
lightbox.style.zIndex = '9999';
lightbox.style.display = 'flex';
lightbox.style.alignItems = 'center';
lightbox.style.justifyContent = 'center';
lightbox.style.cursor = 'pointer';
lightbox.innerHTML = '<div id="lightbox-content" style="max-width: 90%; max-height: 90%;"></div>';

document.body.appendChild(lightbox);
lightbox.style.display = 'none';

lightbox.addEventListener('click', () => {
  lightbox.style.display = 'none';
  document.getElementById('lightbox-content').innerHTML = '';
});

function clickToView(e) {
  const card = e.currentTarget;
  if (!card) return;
  const key = card.dataset.key;
  const item = mediaInfo[key];
  if (!item) return;

  const fullSrc = `/presentations_${url_key}/_media/${item.hashed_filename}`;
  const content = document.getElementById('lightbox-content');
  content.innerHTML = '';

  if (item.mediatype === 'image') {
    const img = document.createElement('img');
    img.src = fullSrc;
    img.style.maxWidth = '100%';
    img.style.maxHeight = '100%';
    content.appendChild(img);
  } else if (item.mediatype === 'video') {
    const video = document.createElement('video');
    video.src = fullSrc;
    video.controls = true;
    video.autoplay = true;
    video.style.maxWidth = '100%';
    video.style.maxHeight = '100%';
    content.appendChild(video);
  }

  lightbox.style.display = 'flex';
}


function showMediaContextMenu(x, y, item) {
  const existing = document.getElementById('media-context-menu');
  if (existing) existing.remove();

  const menu = document.createElement('div');
  menu.id = 'media-context-menu';
  menu.style = `
    position: absolute;
    top: ${y}px;
    left: ${x}px;
    background: #222;
    border: 1px solid #555;
    border-radius: 8px;
    color: white;
    z-index: 9999;
    font-family: sans-serif;
    min-width: 240px;
    box-shadow: 0 0 10px #000;
  `;

  const options = [
    {
      label: '📋 Copy YAML',
      action: () => {
        fallbackCopyText(generateYAML(item));
        menu.remove();
      }
    },
    {
      label: '📋 Copy Markdown',
      action: () => {
        fallbackCopyText(generateMD(item));
        menu.remove();
      }
    }
  ];

  // 🔌 Inject plugin menu items
  const plugins = Object.entries(window.RevelationPlugins || {})
    .map(([name, plugin]) => ({ name, plugin, priority: plugin.priority || 100 }))
    .sort((a, b) => a.priority - b.priority);

  for (const { plugin } of plugins) {
    if (typeof plugin.getMediaMenuItems === 'function') {
      const items = plugin.getMediaMenuItems(item);
      if (Array.isArray(items)) options.push(...items);
    }
  }

  for (const opt of options) {
    const el = document.createElement('div');
    el.textContent = opt.label;
    el.style = 'padding: 0.5rem 1rem; cursor: pointer;';
    el.onmouseover = () => el.style.background = '#444';
    el.onmouseout = () => el.style.background = 'transparent';
    el.onclick = () => {
      opt.action();
      menu.remove();
    };
    menu.appendChild(el);
  }

  document.body.appendChild(menu);
  document.addEventListener('click', () => menu.remove(), { once: true });
}

function generateYAML(item) {
  const tag = generateTag(item);
  const url = item.url;

   return `media:\n  ${tag}:\n    filename: ${item.hashed_filename}\n    title: ${item.title}\n    description: ${item.description}\n    copyright: ${item.copyright}\n    url: ${item.url}`;
}

function generateMD(item) {
  const tag = generateTag(item);

   return `![](media:${tag})`;
}

function fallbackCopyText(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';  // Prevent scroll jump
  textarea.style.opacity = '0';       // Make it invisible
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    const success = document.execCommand('copy');
    if (success) console.log(`✅ copied`);
    else throw new Error('execCommand failed');
  } catch (err) {
    console.error('❌ Fallback copy failed:', err);
    alert('Failed to copy. You can do it manually:\n\n' + text);
  }

  document.body.removeChild(textarea);
}

function generateTag(item) {
  // Extract first word (up to 7 letters max)
  const firstWord = item.title.split(/\s+/)[0].substring(0, 7).replace(/[^a-zA-Z]/g, '');

  // Extract first three digits from hashed filename
  const digits = item.hashed_filename.match(/\d/g);
  const numberPart = digits ? digits.slice(0, 3).join('') : '000';

  return firstWord + numberPart;
}