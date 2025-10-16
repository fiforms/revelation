import { pluginLoader } from './pluginloader.js';

const urlParams = new URLSearchParams(window.location.search);
const url_key = urlParams.get('key');
const url_prefix = `/presentations_${url_key}`;

const container = document.getElementById('presentation-list');

if(!url_key) {
    container.innerHTML = 'No key specified, unable to load presentation list';
}

// VITE Hot Reloading Hook
if (import.meta.hot) {
  import.meta.hot.on('reload-presentations', () => {
    console.log('[HMR] Reloading presentation list');
    location.reload();
  });
}

if(window.electronAPI) {
  window.electronAPI.onShowToast((msg) => {
    showToast(msg);
  });
}

pluginLoader('presentationlist',`/plugins_${url_key}`);

fetch(`${url_prefix}/index.json`)
      .then(res => {
        if (!res.ok) {
          if (res.status === 403) {
            throw new Error('Access denied. This presentation list is restricted.');
          } else {
            throw new Error(`Failed to load presentations: ${res.status} ${res.statusText}`);
          }
        }
        return res.json();
      })
      .then(presentations => {

        if (!presentations.length) {
          container.innerHTML = '<p>No presentations available.</p>';
          return;
        }

        presentations.forEach(pres => {
          const card = document.createElement('a');
          card.href = `${url_prefix}/${pres.slug}/?p=${pres.md}`;
          card.target = '_blank';
          card.className = 'card';
          card.innerHTML = `
            <img src="${url_prefix}/${pres.slug}/${pres.thumbnail}" alt="${pres.title}">
            <div class="card-content">
              <div class="card-title">${pres.title}</div>
              <div class="card-desc">${pres.description}</div>
            </div>
          `;

          card.addEventListener('click', (e) => {
            e.preventDefault(); // Prevent default navigation
            if (window.electronAPI?.openPresentation) {
              window.electronAPI.openPresentation(pres.slug, pres.md, true);
            }
	    else {
	        window.open(`${url_prefix}/${pres.slug}/index.html?p=${pres.md}`, 'revelation_presentation',
		'toolbar=no,location=no,status=no,menubar=no,scrollbars=no,resizable=yes,width=1920,height=1080')
	    }
          });

 	  card.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showCustomContextMenu(e.pageX, e.pageY, pres);
          });

          container.appendChild(card);
        });
	})
        .catch(err => {
          container.innerHTML = `
            <div style="color: red; font-weight: bold; padding: 1rem;">
              ❌ ${err.message}
            </div>
          `;
          console.error('[Presentation Load Error]', err);

});

// Replace hostname indicator logic with dropdown setup
const optionsBtn = document.getElementById('options-button');
const optionsDropdown = document.getElementById('options-dropdown');
const hostnameDisplay = document.getElementById('hostname-display');

if (hostnameDisplay) {
  hostnameDisplay.textContent = window.location.hostname;
}

if (optionsBtn && optionsDropdown) {
  optionsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isVisible = optionsDropdown.style.display === 'block';
    optionsDropdown.style.display = isVisible ? 'none' : 'block';
  });

  document.addEventListener('click', (e) => {
    if (!optionsDropdown.contains(e.target) && e.target !== optionsBtn) {
      optionsDropdown.style.display = 'none';
    }
  });
}

// load and persist settings via localStorage
const mediaSelect = document.getElementById('media-version');
const langInput = document.getElementById('lang-code');
const variantSelect = document.getElementById('variant');

// Hide Media Version if running inside Electron (handled in app settings)
if (window.electronAPI) {
  mediaSelect.disabled = true;
  const appConfig = await window.electronAPI.getAppConfig()
  mediaSelect.value = appConfig.preferHighBitrate ? 'high' : 'low';
  localStorage.setItem('options_media-version', mediaSelect.value);
}

// Common persistence for other fields
[mediaSelect, langInput, variantSelect].forEach(el => {
  const key = `options_${el.id}`;
  const saved = localStorage.getItem(key);
  if (saved) el.value = saved;
  el.addEventListener('change', () => localStorage.setItem(key, el.value));
});

// --- Open Presentation List in a New Window ---
const openBtn = document.getElementById('open-new-window');
if (openBtn) {
  openBtn.addEventListener('click', (e) => {
    e.stopPropagation();

    // Build URL with key param (preserve ?key=... if present)
    const currentURL = new URL(window.location.href);
    const keyParam = currentURL.searchParams.get('key');
    const baseURL = `${window.location.origin}/presentations.html`;
    const newURL = keyParam ? `${baseURL}?key=${encodeURIComponent(keyParam)}` : baseURL;

    // If inside Electron, open via the electronAPI; otherwise use window.open
    if (window.electronAPI) {
      window.electronAPI.openExternalURL?.(newURL);
    } else {
      window.open(newURL, '_blank', 'noopener,noreferrer');
    }
  });
}


const mediaLinkDiv = document.getElementById('media-library-link');
if (url_key && mediaLinkDiv) {
  const link = document.createElement('a');
  link.href = `/media-library.html?key=${url_key}`;
  link.textContent = '📁 View Media Library';
  link.style = 'color: #4da6ff; font-size: 1rem; text-decoration: none;';
  link.onmouseover = () => link.style.textDecoration = 'underline';
  link.onmouseout = () => link.style.textDecoration = 'none';
  mediaLinkDiv.appendChild(link);
}

function showCustomContextMenu(x, y, pres) {
  const existing = document.getElementById('custom-context-menu');
  if (existing) existing.remove();

  const menu = document.createElement('div');
  menu.id = 'custom-context-menu';

  const scrollY = window.scrollY || document.documentElement.scrollTop;
  const scrollX = window.scrollX || document.documentElement.scrollLeft;

  const menuWidth = 220;
  const menuHeight = 240; // Estimate or measure depending on items

  const maxLeft = window.innerWidth - menuWidth - 10;
  const maxTop = window.innerHeight - menuHeight - 10;

  const clampedX = Math.min(x - scrollX, maxLeft);
  const clampedY = Math.min(y - scrollY, maxTop);

  menu.style = `
    position: fixed;
    top: ${clampedY}px;
    left: ${clampedX}px;
    background: #222;
    border: 1px solid #555;
    border-radius: 8px;
    color: white;
    z-index: 9999;
    font-family: sans-serif;
    min-width: ${menuWidth}px;
    box-shadow: 0 0 10px #000;
  `;

  const target = window.electronAPI?.editPresentation ? 'Window' : 'Tab';
  const options = [
    { label: `Open in ${target}`, action: () => {
            if (window.electronAPI?.openPresentation) {
	        window.electronAPI.openPresentation(pres.slug, pres.md, false);
	    }
	    else {
	        window.open(`${url_prefix}/${pres.slug}/index.html?p=${pres.md}`, '_blank')
	    }
        }
      },
    { 
        label: 'Copy Link',
        action: () => {
                const link = `${window.location.origin}${url_prefix}/${pres.slug}/index.html?p=${pres.md}`;
                if (navigator.clipboard && navigator.clipboard.writeText) {
                  navigator.clipboard.writeText(link)
                    .then(() => console.log('✅ Link copied to clipboard'))
                    .catch(err => {
                      console.error('❌ Clipboard error:', err);
                      fallbackCopyText(link);
                    });
                } else {
                  fallbackCopyText(link);
                }
              }
       },
    { label: 'Handout View', action: () => handoutView(pres.slug,pres.md) }
  ];


  if (window.electronAPI?.editPresentation) {
    options.push({
      label: 'Edit Markdown',
      action: () => window.electronAPI.editPresentation(pres.slug, pres.md)
    });
    options.push({
      label: 'Edit Presentation Metadata',
      action: () => window.electronAPI.editPresentationMetadata(pres.slug, pres.md)
    });
    options.push({
      label: 'Show Presentation Files',
      action: () => window.electronAPI.showPresentationFolder(pres.slug)
    });
    options.push({
      label: 'Export as ZIP',
      action: async () => {
        const result = await window.electronAPI.exportPresentation(pres.slug);
        if (result?.success) {
          alert(`✅ Exported to: ${result.filePath}`);
        } else if (!result?.canceled) {
          alert(`❌ Export failed: ${result?.error || 'Unknown error'}`);
        }
      }
    });
  }
  options.push({
    label: 'Export as PDF',
    action: () => exportPDF(pres.slug, pres.md)
  });

  const plugins = Object.entries(window.RevelationPlugins)
    .map(([name, plugin]) => ({
      name,
      plugin,
      priority: plugin.priority
    }))
    .sort((a, b) => a.priority - b.priority);  // Ascending = high priority first

  for (const { plugin } of plugins) {
    if (typeof plugin.getListMenuItems === 'function') {
      const menuItems = plugin.getListMenuItems(pres);
      if (Array.isArray(menuItems)) {
        options.push(...menuItems);
      }
    }
  }


  for (const opt of options) {
    const item = document.createElement('div');
    item.textContent = opt.label;
    item.style = 'padding: 0.5rem 1rem; cursor: pointer;';
    item.onmouseover = () => item.style.background = '#444';
    item.onmouseout = () => item.style.background = 'transparent';
    item.onclick = () => {
      opt.action();
      menu.remove();
    };
    menu.appendChild(item);
  }

  document.body.appendChild(menu);

  document.addEventListener('click', () => menu.remove(), { once: true });
}

function handoutView(slug, mdFile) {
  if (window.electronAPI?.openHandoutView) {
    window.electronAPI.openHandoutView(slug, mdFile);
  } else {
    window.open(`${url_prefix}/${slug}/handout?p=${mdFile}`, '_blank');
  } 
}


function exportPDF(slug, mdFile) {
  if(window.electronAPI?.exportPresentationPDF) {
    window.electronAPI.exportPresentationPDF(slug, mdFile)
      .then(result => {
        if (result.success) {
          alert(`✅ PDF exported to: ${result.filePath}`);
        } else {
          // alert('❌ PDF export failed');
        }
      })
      .catch(err => {
        console.error('PDF Export Error:', err);
        // alert('❌ PDF export failed: ' + err.message);
      });
    } 
    else {
      window.open(`${url_prefix}/${slug}/index.html?print-pdf&p=${mdFile}`, '_blank') 
    }
}

function fallbackCopyText(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';  // avoid scroll jump
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    document.execCommand('copy');
    console.log('✅ Link copied (fallback)');
  } catch (err) {
    console.error('❌ Fallback copy failed', err);
    alert('Failed to copy the link. You can do it manually:\n' + text);
  }
  document.body.removeChild(textarea);
}

function showToast(message) {
  const existing = document.getElementById('toast-message');
  if (existing) existing.remove(); // Only one toast at a time

  const toast = document.createElement('div');
  toast.id = 'toast-message';
  toast.textContent = message;

  toast.style = `
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.85);
    color: #fff;
    padding: 0.8rem 1.2rem;
    border-radius: 8px;
    font-size: 1rem;
    font-family: sans-serif;
    box-shadow: 0 2px 10px rgba(0,0,0,0.4);
    opacity: 0;
    transition: opacity 0.5s ease-in-out;
    z-index: 9999;
  `;

  document.body.appendChild(toast);
  // Trigger fade-in
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
  });

  // Fade out after 5 seconds
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, 5000);
}