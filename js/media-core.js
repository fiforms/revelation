// js/media-core.js
// Reusable media library core (standalone or picker)

import { pluginLoader } from './pluginloader.js';

export async function initMediaLibrary(container, {
  key,
  mode = 'standalone',           // 'standalone' | 'picker'
  onPick = null,                  // function(item) when mode === 'picker'
  enableContextMenu = true,       // keep plugin menu integration
} = {}) {
  if (!key) {
    container.innerHTML = '<p style="color:#f66">Missing ?key=…</p>';
    return;
  }

  const state = {
    key,
    itemsById: {},
    pluginsReady: false,
  };

  const mediaList = [];
  let currentIndex = -1;

  const usedMedia = window.electronAPI ? await window.electronAPI.getUsedMedia() : [];


  // Simple structure
  container.innerHTML = `
    <div class="media-lib">
      <div class="media-toolbar"></div>
      <div class="media-grid" id="media-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:1.5rem;"></div>
    </div>
  `;
  const grid = container.querySelector('#media-grid');
  const toolbar = container.querySelector('.media-toolbar');

  // Optional toolbar affordances
  if (mode === 'picker') {
    const bar = document.createElement('div');
    bar.style = 'margin: 0 0 1rem 0; display:flex; gap:.5rem; align-items:center;';
    bar.innerHTML = `
      <span style="opacity:.8">Pick a media item…</span>
      <button data-action="cancel" style="margin-left:auto;padding:.4rem .8rem;border-radius:6px;border:1px solid #555;background:#222;color:#eee;cursor:pointer;">Cancel</button>
    `;
    bar.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action="cancel"]');
      if (!btn) return;
      if (typeof onPick === 'function') onPick(null); // canceled
    });
    toolbar.appendChild(bar);
  }

  // Load plugins (for context menus) but don’t block UI
  pluginLoader('media-library',`/plugins_${key}`).finally(() => { state.pluginsReady = true; });

  // Lightbox
  const lightbox = document.createElement('div');
  lightbox.id = 'mlightbox';
  Object.assign(lightbox.style, {
    position:'fixed', inset:'0', background:'rgba(0,0,0,.9)', display:'none',
    zIndex:'9999', alignItems:'center', justifyContent:'center', cursor:'pointer'
  });
  lightbox.innerHTML = `<div id="mlightbox-content" style="max-width:90%;max-height:90%"></div>`;
  document.body.appendChild(lightbox);
  const lbContent = lightbox.querySelector('#mlightbox-content');
  lightbox.addEventListener('click', () => { lightbox.style.display = 'none'; lbContent.innerHTML=''; });

    document.addEventListener('keydown', (e) => {
        if (lightbox.style.display !== 'flex') return;

        if (e.key === 'Escape') {
            lightbox.style.display = 'none';
            lbContent.innerHTML = '';
        }
        if (e.key === 'ArrowRight') {
            currentIndex = (currentIndex + 1) % mediaList.length;
            openPreview(mediaList[currentIndex], currentIndex);
        }
        if (e.key === 'ArrowLeft') {
            currentIndex = (currentIndex - 1 + mediaList.length) % mediaList.length;
            openPreview(mediaList[currentIndex], currentIndex);
        }
    });

  // Fetch
  fetch(`/presentations_${key}/_media/index.json`)
    .then(r => r.json())
    .then((media) => render(media))
    .catch(err => {
      grid.innerHTML = `<p style="color:#f66">Failed to load media index: ${err.message}</p>`;
      console.error(err);
    });

  function render(media) {
    const entries = Object.entries(media);

    mediaList.length = 0; // reset
    if (!entries.length) {
      grid.innerHTML = '<p>No media found.</p>';
      return;
    }
    grid.innerHTML = '';
    for (const [id, item] of entries) {
      mediaList.push(item);
      state.itemsById[id] = item;

      const card = document.createElement('div');
      card.className = 'media-card';
      card.dataset.id = id;
      card.style = 'background:#222;border:1px solid #444;border-radius:8px;padding:1rem;box-shadow:0 0 6px rgba(0,0,0,.5)';

      if(usedMedia.length) {
        if (usedMedia.includes(item.hashed_filename)) {
          card.classList.add('media-used');
        } else {
          card.classList.add('media-unused');
        }
      }

      const thumb = document.createElement('img');
      thumb.src = `/presentations_${state.key}/_media/${item.thumbnail}`;
      thumb.alt = item.title || item.original_filename;
      thumb.style = 'max-width:100%;border-radius:4px;margin-bottom:.5rem;cursor:zoom-in;';
      thumb.addEventListener('click', (e) => {
        e.stopPropagation();
        openPreview(item, mediaList.indexOf(item));
      });

      const title = document.createElement('div');
      title.style = 'font-weight:700;font-size:1.05rem;';
      title.textContent = item.title || item.original_filename;

      const meta = document.createElement('div');
      meta.style = 'font-size:.9rem;opacity:.8;margin-top:.25rem;';
      meta.innerHTML = `
        ${item.description || ''}<br/>
        <small>${item.original_filename}</small><br/>
        ${item.copyright ? `<small>${item.copyright}</small><br/>` : ''}
      `;

      // Picker affordance
      if (mode === 'picker') {
        const pickRow = document.createElement('div');
        pickRow.style = 'display:flex; gap:.5rem; margin-top:.6rem;';
        pickRow.innerHTML = `
          <button data-action="pick:background" title="Insert as background" class="mlbtn">Background</button>
          <button data-action="pick:fit" title="Insert as fit image" class="mlbtn">Fit</button>
          <button data-action="pick:normal" title="Insert normal image" class="mlbtn">Normal</button>
        `;
        pickRow.querySelectorAll('.mlbtn').forEach(btn => {
          btn.style = 'padding:.4rem .6rem;border-radius:6px;border:1px solid #555;background:#2a2a2a;color:#eee;cursor:pointer;';
        });
        pickRow.addEventListener('click', (e) => {
          const b = e.target.closest('[data-action^="pick:"]');
          if (!b) return;
          const variant = b.dataset.action.split(':')[1]; // background|fit|normal
          if (typeof onPick === 'function') onPick({ variant, item });
        });
        card.appendChild(pickRow);
      }

      // Context menu (standalone mode keeps your plugin hooks)
      if (enableContextMenu && mode === 'standalone') {
        card.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          showContextMenu(e.pageX, e.pageY, item);
        });
      }

      // Whole card click = preview (standalone)
      if (mode === 'standalone') {
        card.addEventListener('click', () => openPreview(item, mediaList.indexOf(item)));
      }

      const thumbWrap = document.createElement('div');
      thumbWrap.className = 'media-thumb-wrapper';
      thumbWrap.appendChild(thumb);
      card.appendChild(thumbWrap);

      title.className = 'media-title';
      card.appendChild(title);
      card.appendChild(meta);
      grid.appendChild(card);
    }
  }

function openPreview(item, index = null) {
  if (index !== null) currentIndex = index;
  lbContent.innerHTML = '';

  const figure = document.createElement('figure');
  figure.style.maxWidth = '90vw';
  figure.style.maxHeight = '90vh';
  figure.style.display = 'flex';
  figure.style.flexDirection = 'column';
  figure.style.alignItems = 'center';
  figure.style.gap = '1rem';

  // Media element
  let mediaEl;
  const full = `/presentations_${state.key}/_media/${item.hashed_filename}`;
  if (item.mediatype === 'video') {
    mediaEl = document.createElement('video');
    mediaEl.src = full;
    mediaEl.controls = true;
    mediaEl.autoplay = true;
    mediaEl.style.maxWidth = '100%';
    mediaEl.style.maxHeight = '70vh';
  } else {
    mediaEl = document.createElement('img');
    mediaEl.src = full;
    mediaEl.style.maxWidth = '100%';
    mediaEl.style.maxHeight = '70vh';
  }

  // Right-click in lightbox
  mediaEl.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showContextMenu(e.pageX, e.pageY, item);
  });

// Metadata panel
const caption = document.createElement('figcaption');
caption.style = `
  color: #ddd;
  font-size: 0.95rem;
  text-align: left;
  max-width: 100%;
  width: 100%;
  background: rgba(0,0,0,0.6);
  padding: 0.75rem 1rem;
  border-radius: 6px;
  box-sizing: border-box;
`;
caption.innerHTML = `
  <div style="font-weight: 700; font-size: 1.05rem; margin-bottom: .3rem;">
    ${item.title || item.original_filename}
  </div>
  ${item.description ? `<div>${item.description}</div>` : ''}
  ${item.keywords ? `<div><strong>Keywords:</strong> ${item.keywords}</div>` : ''}
  ${item.license ? `<div><strong>License:</strong> ${item.license}</div>` : ''}
  <div style="font-size: .85rem; opacity: .8; margin-top: .3rem;">
    <div>File: ${item.original_filename}</div>
    ${item.attribution ? `<div>© ${item.attribution}</div>` : ''}
    ${item.url_origin ? `<div>Origin: <a href="${item.url_origin}" target="_blank" style="color:#4da6ff">${item.url_origin}</a></div>` : ''}
    ${item.url_library ? `<div>Library: <a href="${item.url_library}" target="_blank" style="color:#4da6ff">${item.url_library}</a></div>` : ''}
    ${item.url_direct ? `<div>Direct Download: <a href="${item.url_direct}" target="_blank" style="color:#4da6ff">${item.url_direct}</a></div>` : ''}
  </div>
`;

  figure.appendChild(mediaEl);
  figure.appendChild(caption);
  lbContent.appendChild(figure);

  lightbox.style.display = 'flex';

  // Right-click context menu in lightbox
  lbContent.firstChild.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showContextMenu(e.pageX, e.pageY, item);
  });

}


  function showContextMenu(x, y, item) {
    const existing = document.getElementById('media-context-menu');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.id = 'media-context-menu';
    const menuWidth = 240;
    const menuHeight = 220;
    const padding = 10;

    const maxLeft = window.innerWidth - menuWidth - padding;
    const maxTop = window.innerHeight - menuHeight - padding;

    const scrollX = window.scrollX || document.documentElement.scrollLeft;
    const scrollY = window.scrollY || document.documentElement.scrollTop;

    const clampedX = Math.min(x - scrollX, maxLeft);
    const clampedY = Math.min(y - scrollY, maxTop);

    menu.style = `
      position: fixed;
      left: ${clampedX}px;
      top: ${clampedY}px;
      background: #222;
      border: 1px solid #555;
      border-radius: 8px;
      color: white;
      z-index: 9999;
      font-family: sans-serif;
      min-width: ${menuWidth}px;
      box-shadow: 0 0 10px #000;
    `;


    const options = [
      { label: '📋 Copy YAML', action: () => fallbackCopyText(generateYAML(item)) },
      { label: '📋 Copy Markdown', action: () => fallbackCopyText(generateMD(item)) },
    ];

    if(usedMedia.length && !usedMedia.includes(item.hashed_filename)) {
      options.push({ label: '❌ Delete Media Item', action: async () => {
        const confirmed = confirm('Are you sure you want to delete this media item? This action cannot be undone.');
        if (!confirmed) return;
        try {
          const result = await window.electronAPI.deleteMediaItem(item.hashed_filename);
          if (result.success) {
            const card = grid.querySelector(`.media-card[data-id="${item.hashed_filename}"]`);
            if (card) card.remove();
          } else {
            alert('Failed to delete media item: ' + (result.error || 'Unknown error'));
          }
        }
        catch (err) {
          alert('Error deleting media item: ' + err.message);
        } 
      }});
    }

    if (state.pluginsReady && window.RevelationPlugins) {
      const plugins = Object.entries(window.RevelationPlugins)
        .map(([name, plugin]) => ({ name, plugin, priority: plugin.priority || 100 }))
        .sort((a,b) => a.priority - b.priority);

      for (const { plugin } of plugins) {
        if (typeof plugin.getMediaMenuItems === 'function') {
          const items = plugin.getMediaMenuItems(item);
          if (Array.isArray(items)) options.push(...items);
        }
      }
    }

    for (const opt of options) {
      const el = document.createElement('div');
      el.textContent = opt.label;
      el.style = 'padding:.5rem 1rem; cursor:pointer;';
      el.onmouseover = () => el.style.background = '#444';
      el.onmouseout = () => el.style.background = 'transparent';
      el.onclick = () => { opt.action(); menu.remove(); };
      menu.appendChild(el);
    }

    document.body.appendChild(menu);
    document.addEventListener('click', () => menu.remove(), { once:true });
  }

  function generateYAML(item) {
    const tag = generateTag(item);
    
    let yaml = `media:
  ${tag}:
    filename: ${item.hashed_filename}
    title: ${item.title || ''}
    description: ${item.description || ''}
    attribution: ${item.attribution || ''}
    license: ${item.license || ''}
    url_origin: ${item.url_origin || ''}
    url_library: ${item.url_library || ''}
    url_direct: ${item.url_direct || ''}
    mediatype: ${item.mediatype || ''}
    keywords: ${item.keywords || ''}`;

    if (item.large_variant) {
      yaml += `
    large_variant:
      filename: ${item.large_variant.hashed_filename}
      url_direct: ${item.large_variant.url_direct || ''}`;
    }
    return yaml;
  }
  function generateMD(item) {
    return `![](media:${generateTag(item)})`;
  }
  function generateTag(item) {
    const firstWord = (item.title || item.original_filename || '')
      .split(/\s+/)[0].substring(0,7).replace(/[^a-zA-Z]/g,'') || 'media';
    const digits = (item.hashed_filename.match(/\d/g) || []).slice(0,3).join('') || '000';
    return firstWord + digits;
  }
  function fallbackCopyText(text) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position='fixed'; ta.style.opacity='0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch {}
    document.body.removeChild(ta);
  }

  return {
    // expose a tiny API in case you want to add future filters/search
    openPreview,
  };
}
