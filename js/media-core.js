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


  // NEW: search/filter/sort bar on top + media layout below
  container.innerHTML = `
    <div id="media-controls" style="
      position:fixed;top:0;left:0;right:0;
      padding:.5rem 1rem;
      background:#111;border-bottom:1px solid #333;
      z-index:1000;display:flex;gap:.5rem;align-items:center;">
        <input id="media-search" type="text" placeholder="Search…" 
          style="flex:1;padding:.35rem .5rem;border-radius:4px;border:1px solid #555;background:#222;color:#eee;">
        <select id="media-type" 
          style="padding:.35rem .5rem;border-radius:4px;border:1px solid #555;background:#222;color:#eee;">
          <option value="all">All</option>
          <option value="image">Images</option>
          <option value="video">Videos</option>
        </select>
        <select id="media-sort"
          style="padding:.35rem .5rem;border-radius:4px;border:1px solid #555;background:#222;color:#eee;">
          <option value="name-asc">Filename A→Z</option>
          <option value="name-desc">Filename Z→A</option>
          <option value="date-new">Date Added (newest)</option>
          <option value="date-old">Date Added (oldest)</option>
        </select>
    </div>

    <div class="media-lib" style="padding-top:60px;">
      <div class="media-toolbar"></div>
      <div class="media-grid" id="media-grid"
        style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:1.5rem;">
      </div>
    </div>
  `;

  // Adjust search bar for Electron sidebar
  const mediaControls = container.querySelector('#media-controls');
  if (window.electronAPI && mode === 'standalone') {
    // Scoot over by sidebar width (tweak 260px if your sidebar is different)
    mediaControls.style.left = '260px';
  } else {
    mediaControls.style.left = '0';
  }

  const searchBox = container.querySelector('#media-search');
  const typeSelect = container.querySelector('#media-type');
  const sortSelect = container.querySelector('#media-sort');

  searchBox.focus();

  let masterList = [];
  let viewList = [];

  const grid = container.querySelector('#media-grid');
  const toolbar = container.querySelector('.media-toolbar');

  
  let debounceTimer = null;
  function triggerUpdate() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      viewList = applyFiltersAndSort(masterList);
      render(viewList);
    }, 150);
  }

  searchBox.addEventListener('input', triggerUpdate);
  typeSelect.addEventListener('change', triggerUpdate);
  sortSelect.addEventListener('change', triggerUpdate);


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
  lightbox.innerHTML = `
    <button type="button" id="mlightbox-close" aria-label="Close preview">×</button>
    <div id="mlightbox-content"></div>
  `;
  document.body.appendChild(lightbox);
  const lbContent = lightbox.querySelector('#mlightbox-content');
  const lbClose = lightbox.querySelector('#mlightbox-close');
  Object.assign(lbClose.style, {
    position: 'fixed',
    top: '16px',
    right: '16px',
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    border: '1px solid rgba(255,255,255,0.35)',
    background: 'rgba(0,0,0,0.55)',
    color: '#fff',
    fontSize: '22px',
    lineHeight: '32px',
    textAlign: 'center',
    cursor: 'pointer',
    zIndex: '10000'
  });
  lightbox.addEventListener('click', () => { lightbox.style.display = 'none'; lbContent.innerHTML=''; });
  lbClose.addEventListener('click', (e) => {
    e.stopPropagation();
    lightbox.style.display = 'none';
    lbContent.innerHTML = '';
  });

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
    .then((media) => {
      masterList = Object.values(media);
      viewList = masterList;
      render(viewList);
    })
    .catch(err => {
      grid.innerHTML = `<p style="color:#f66">${tr('Failed to load media index')}: ${err.message}</p>`;
      console.error(err);
    });

  function pickItem(item) {
    if (typeof onPick !== 'function') return;
    const yaml = generateYAML(item);
    const md = generateMD(item);
    onPick({ variant: 'auto', yaml, md, item });
  }

  function formatVariantStatus(item, longDesc = false) {
    const front = longDesc ? 'High-resolution variant: ' : '💎 ';
    if (!item.large_variant) return ''
    if (item.large_variant_local === false) return front + '<span style="color: #33cc33;">' + tr('available') + '</span>';
    if (item.large_variant_local === true) return front + '<span style="color: #6666ee;">' +tr('downloaded') + '</span>';
    return '';
  }

  function updateCardVariantStatus(item) {
    const card = grid.querySelector(`.media-card[data-id="${item.filename}"]`);
    if (!card) return;
    const statusEl = card.querySelector('.media-variant-status');
    if (!statusEl) return;
    statusEl.textContent = formatVariantStatus(item);
  }

  function render(list) {
    grid.innerHTML = '';

    if (!list.length) {
      grid.innerHTML = `<p>${tr('No media found.')}</p>`;
      return;
    }

    for (const item of list) {
      const card = document.createElement('div');
      card.className = 'media-card';
      card.dataset.id = item.filename;
      card.style = 'background:#222;border:1px solid #444;border-radius:8px;padding:1rem;box-shadow:0 0 6px rgba(0,0,0,.5)';

      if (usedMedia.length) {
        if (usedMedia.includes(item.filename)) card.classList.add('media-used');
        else card.classList.add('media-unused');
      }

      const thumb = document.createElement('img');
      thumb.src = `/presentations_${state.key}/_media/${item.thumbnail}`;
      thumb.alt = item.title || item.original_filename;
      thumb.style = 'max-width:100%;border-radius:4px;margin-bottom:.5rem;cursor:zoom-in;';
      thumb.addEventListener('click', (e) => {
        if (mode === 'picker') return;
        e.stopPropagation();
        openPreview(item, list.indexOf(item));
      });

      const thumbWrap = document.createElement('div');
      thumbWrap.className = 'media-thumb-wrapper';
      thumbWrap.appendChild(thumb);

      const title = document.createElement('div');
      title.className = 'media-title';
      title.textContent = item.title || item.original_filename;

      const meta = document.createElement('div');
      meta.style = 'font-size:.9rem;opacity:.8;margin-top:.25rem;';
      meta.innerHTML = `
        ${item.description || ''}<br/>
        <small>${item.original_filename}</small><br/>
        ${item.copyright ? `<small>${item.copyright}</small><br/>` : ''}
      `;
      const variantStatus = document.createElement('small');
      variantStatus.className = 'media-variant-status';
      variantStatus.innerHTML = formatVariantStatus(item);
      meta.appendChild(variantStatus);

      card.appendChild(thumbWrap);
      card.appendChild(title);
      card.appendChild(meta);

      if (enableContextMenu) {
        card.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          showContextMenu(e.pageX, e.pageY, item);
        });
        if (mode === 'standalone') {
          card.addEventListener('click', () => openPreview(item, list.indexOf(item)));
        }
      }

      if (mode === 'picker') {
        card.addEventListener('click', () => {
          pickItem(item);
        });
      }

      grid.appendChild(card);
    }
  }

function openPreview(item, index = null) {
  if (index !== null) currentIndex = index;
  lbContent.innerHTML = '';

  const figure = document.createElement('figure');
  figure.className = 'mlightbox-figure';
  figure.addEventListener('click', (e) => e.stopPropagation());

  // Media element
  let mediaEl;
  const full = `/presentations_${state.key}/_media/${item.filename}`;
  const standardSrc = `/presentations_${state.key}/_media/${item.filename}`;
  let highSrc = item.large_variant
    ? `/presentations_${state.key}/_media/${item.large_variant.filename}`
    : null;
  let highLocal = item.large_variant_local === true;
    
  if (item.mediatype === 'video') {
    mediaEl = document.createElement('video');
    mediaEl.src = full;
    mediaEl.controls = true;
    mediaEl.autoplay = true;
    mediaEl.className = 'mlightbox-media';
  } else {
    mediaEl = document.createElement('img');
    mediaEl.src = full;
    mediaEl.className = 'mlightbox-media';
  }
  mediaEl.addEventListener('click', (e) => e.stopPropagation());

  // Right-click in lightbox
  mediaEl.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showContextMenu(e.pageX, e.pageY, item);
  });

// Metadata panel
const caption = document.createElement('figcaption');
caption.className = 'mlightbox-caption';
caption.addEventListener('click', (e) => e.stopPropagation());

  let filenameInfo = `<div>${tr('Original File')}: ${item.original_filename} &nbsp; &nbsp; &nbsp; ${tr('Present Filename')}: ${item.filename}</div>`;
  if (highSrc) {
    filenameInfo += `<div>${tr('High-bitrate file')}: ${item.large_variant.filename}</div>`;
  }

caption.innerHTML = `
  <div style="font-weight: 700; font-size: 1.05rem; margin-bottom: .3rem;">
    ${item.title || item.original_filename}
  </div>
  ${item.description ? `<div>${item.description}</div>` : ''}
  <div style="font-size:.85rem;opacity:.8;margin-top:.3rem;">${filenameInfo}</div>
  <div> ${item.keywords ? `<strong>${tr('Keywords')}:</strong> ${item.keywords}` : ''}
  ${item.license ? `<strong>${tr('License')}:</strong> ${item.license}` : ''} 
  ${item.attribution ? `© ${item.attribution}` : ''} </div>
  <div style="font-size: .85rem; opacity: .8; margin-top: .3rem;">
    ${item.url_origin ? `<div>${tr('Origin')}: <a href="${item.url_origin}" target="_blank" style="color:#4da6ff">${item.url_origin}</a></div>` : ''}
    ${item.url_library ? `<div>${tr('Library')}: <a href="${item.url_library}" target="_blank" style="color:#4da6ff">${item.url_library}</a></div>` : ''}
    ${item.url_direct ? `<div>${tr('Direct Download')}: <a href="${item.url_direct}" target="_blank" style="color:#4da6ff">${item.url_direct}</a></div>` : ''}
  </div>
`;

  const variantRow = document.createElement('div');
  variantRow.className = 'mlightbox-variant-row';
  const variantStatus = document.createElement('div');
  variantStatus.className = 'mlightbox-variant-status';
  variantRow.appendChild(variantStatus);

  const actionRow = document.createElement('div');
  actionRow.className = 'mlightbox-actions';

  const canUseElectron = !!window.electronAPI?.downloadLargeVariant;
  let usingHigh = false;
  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'mlightbox-button';
  toggleBtn.textContent = tr('Play High Bitrate');

  const downloadBtn = document.createElement('button');
  downloadBtn.className = 'mlightbox-button';
  downloadBtn.textContent = tr('Download High-res');

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'mlightbox-button';
  deleteBtn.textContent = tr('Delete High-res');

  const updateVariantUI = () => {
    variantStatus.innerHTML = formatVariantStatus(item, true);
    if (!item.large_variant) {
      toggleBtn.style.display = 'none';
      downloadBtn.style.display = 'none';
      deleteBtn.style.display = 'none';
      return;
    }
    if (highLocal) {
      toggleBtn.style.display = '';
      downloadBtn.style.display = 'none';
      deleteBtn.style.display = '';
      toggleBtn.disabled = false;
    } else {
      toggleBtn.style.display = 'none';
      downloadBtn.style.display = canUseElectron ? '' : 'none';
      deleteBtn.style.display = 'none';
    }
  };

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!highLocal || !highSrc) return;
    usingHigh = !usingHigh;
    const newSrc = usingHigh ? highSrc : standardSrc;
    mediaEl.pause();
    mediaEl.src = newSrc;
    mediaEl.load();

    toggleBtn.textContent = usingHigh
      ? tr('Play Standard Bitrate')
      : tr('Play High Bitrate');

    mediaEl.oncanplay = () => {
      mediaEl.play().catch(err => console.warn('Playback failed:', err.message));
      mediaEl.oncanplay = null;
    };
  });

  downloadBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!item.large_variant || !window.electronAPI?.downloadLargeVariant) return;
    downloadBtn.disabled = true;
    downloadBtn.textContent = tr('Downloading...');
    try {
      const result = await window.electronAPI.downloadLargeVariant(item.filename);
      if (!result.success) throw new Error(result.error || 'Download failed.');
      if (result.filename) {
        item.large_variant.filename = result.filename;
        highSrc = `/presentations_${state.key}/_media/${item.large_variant.filename}`;
      }
      highLocal = true;
      item.large_variant_local = true;
      updateCardVariantStatus(item);
      updateVariantUI();
    } catch (err) {
      alert(tr('Failed to download high-res variant: ') + err.message);
    } finally {
      downloadBtn.disabled = false;
      downloadBtn.textContent = tr('Download High-res');
    }
  });

  deleteBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!window.electronAPI?.deleteLargeVariant) return;
    const confirmed = confirm(tr('Delete the high-resolution variant?'));
    if (!confirmed) return;
    deleteBtn.disabled = true;
    try {
      const result = await window.electronAPI.deleteLargeVariant(item.filename);
      if (!result.success) throw new Error(result.error || 'Delete failed.');
      highLocal = false;
      usingHigh = false;
      item.large_variant_local = false;
      mediaEl.pause();
      mediaEl.src = standardSrc;
      mediaEl.load();
      toggleBtn.textContent = tr('Play High Bitrate');
      updateCardVariantStatus(item);
      updateVariantUI();
    } catch (err) {
      alert(tr('Failed to delete high-res variant: ') + err.message);
    } finally {
      deleteBtn.disabled = false;
    }
  });

  caption.appendChild(variantRow);
  if (item.large_variant) {
    actionRow.appendChild(toggleBtn);
    actionRow.appendChild(downloadBtn);
    actionRow.appendChild(deleteBtn);
    caption.appendChild(actionRow);
  }
  updateVariantUI();

  figure.appendChild(mediaEl);
  figure.appendChild(caption);
  lbContent.appendChild(figure);

  if (item.large_variant && item.large_variant_local === undefined && highSrc) {
    fetch(highSrc, { method: 'HEAD' })
      .then(res => {
        highLocal = res.ok;
        item.large_variant_local = res.ok;
        updateCardVariantStatus(item);
        updateVariantUI();
      })
      .catch(() => {});
  }

  requestAnimationFrame(() => {
    const captionHeight = caption.offsetHeight;
    const maxMediaHeight = Math.max(140, Math.floor(window.innerHeight * 0.92 - (captionHeight + 24)));
    mediaEl.style.maxHeight = `${maxMediaHeight}px`;
  });

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


    let options = [];

    if (mode === 'picker') {
      options = [
        { label: '🔍 ' + tr('Preview'), action: () => openPreview(item, viewList.indexOf(item)) },
        { label: '➕ ' + tr('Add media to selected presentation'), action: () => pickItem(item) },
      ];
    } else {
      options = [
        { label: '📋 '+ tr('Copy YAML'), action: () => fallbackCopyText(generateYAML(item)) },
        { label: '📋 '+ tr('Copy Markdown'), action: () => fallbackCopyText(generateMD(item)) },
      ];
    }

    if (item.large_variant && window.electronAPI?.downloadLargeVariant) {
      if (item.large_variant_local === true) {
        options.push({
          label: '🧹 ' + tr('Delete High-res'),
          action: async () => {
            const confirmed = confirm(tr('Delete the high-resolution variant?'));
            if (!confirmed) return;
            const result = await window.electronAPI.deleteLargeVariant(item.filename);
            if (!result.success) {
              alert(tr('Failed to delete high-res variant: ') + (result.error || 'Unknown error'));
              return;
            }
            item.large_variant_local = false;
            updateCardVariantStatus(item);
          }
        });
      } else {
        options.push({
          label: '⬇️ ' + tr('Download High-res'),
          action: async () => {
            const result = await window.electronAPI.downloadLargeVariant(item.filename);
            if (!result.success) {
              alert(tr('Failed to download high-res variant: ') + (result.error || 'Unknown error'));
              return;
            }
            if (result.filename) {
              item.large_variant.filename = result.filename;
            }
            item.large_variant_local = true;
            updateCardVariantStatus(item);
          }
        });
      }
    }

    if(!usedMedia.length || !usedMedia.includes(item.filename)) {
      options.push({ label: '❌ ' + tr('Delete Media Item'), action: async () => {
        const confirmed = confirm(tr('Are you sure you want to delete this media item? This action cannot be undone.'));
        if (!confirmed) return;
        try {
          const result = await window.electronAPI.deleteMediaItem(item.filename);
          if (result.success) {
            const card = grid.querySelector(`.media-card[data-id="${item.filename}"]`);
            if (card) card.remove();
          } else {
            alert(tr('Failed to delete media item: ') + (result.error || 'Unknown error'));
          }
        }
        catch (err) {
          alert(tr('Error deleting media item: ') + err.message);
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
    filename: ${item.filename}
    original_filename: ${item.original_filename}
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
      filename: ${item.large_variant.filename}
      original_filename: ${item.large_variant.original_filename}
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
    const digits = (item.filename.match(/\d/g) || []).slice(0,3).join('') || '000';
    return firstWord + digits;
  }
  function fallbackCopyText(text) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position='fixed'; ta.style.opacity='0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch {}
    document.body.removeChild(ta);
  }

  function applyFiltersAndSort(list) {
    const q = searchBox.value.trim().toLowerCase();
    const type = typeSelect.value;
    const sort = sortSelect.value;
    const tokens = q ? q.split(/\s+/) : [];

    let filtered = list.filter(item => {
      if (type === "video" && item.mediatype !== "video") return false;
      if (type === "image" && item.mediatype === "video") return false;

      return tokens.every(t =>
        (item.original_filename || "").toLowerCase().includes(t) ||
        (item.title || "").toLowerCase().includes(t) ||
        (item.description || "").toLowerCase().includes(t) ||
        (item.keywords || "").toLowerCase().includes(t)
      );
    });

    switch (sort) {
      case "name-desc":
        filtered.sort((a, b) => b.original_filename.localeCompare(a.original_filename));
        break;
      case "date-new":
        filtered.sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
        break;
      case "date-old":
        filtered.sort((a, b) => (a.mtime || 0) - (b.mtime || 0));
        break;
      default:
        filtered.sort((a, b) => a.original_filename.localeCompare(b.original_filename));
    }

    return filtered;
  }

  return {
    // expose a tiny API in case you want to add future filters/search
    openPreview,
  };
}
