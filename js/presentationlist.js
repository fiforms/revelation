import { pluginLoader } from './pluginloader.js';
import yaml from 'js-yaml';

const urlParams = new URLSearchParams(window.location.search);
const url_key = urlParams.get('key');
const url_prefix = `/presentations_${url_key}`;

const container = document.getElementById('presentation-list');
let selectedCardElement = null;
let selectedPresentationKey = '';
const detailsCache = new Map();

if(!url_key) {
    container.innerHTML = tr('No key specified, unable to load presentation list');
}

if (container) {
  container.addEventListener('click', (event) => {
    if (event.target === container) {
      clearSelection();
    }
  });
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
            throw new Error(tr('Access denied. This presentation list is restricted.'));
          } else {
            throw new Error(tr("Failed to load presentations") + `: ${res.status} ${res.statusText}`);
          }
        }
        return res.json();
      })
      .then(presentations => {

        if (!presentations.length) {
          container.innerHTML = '<p>' + tr('No presentations available.') + '</p>';
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
            e.preventDefault();
            selectPresentation(pres, card);
          });

          card.addEventListener('dblclick', (e) => {
            e.preventDefault();
            openPrimaryPresentation(pres);
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
const lanIpRow = document.getElementById('lan-ip-row');
const lanIpDisplay = document.getElementById('lan-ip-display');
const pairingPinRow = document.getElementById('pairing-pin-row');
const pairingPinDisplay = document.getElementById('pairing-pin-display');
const selectedLanguageDisplay = document.getElementById('selected-language-display');
const selectedVariantDisplay = document.getElementById('selected-variant-display');

let appConfig = null;
if (window.electronAPI?.getAppConfig) {
  try {
    appConfig = await window.electronAPI.getAppConfig();
  } catch (err) {
    console.warn('Failed to load app config:', err);
  }
}


if (lanIpRow && lanIpDisplay) {
  if (appConfig?.mode === 'network' && appConfig?.hostLANURL) {
    const port = appConfig?.viteServerPort;
    const host = appConfig.hostLANURL;
    lanIpRow.style.display = 'block';
    lanIpDisplay.textContent = port ? `${host}:${port}` : host;
  } else {
    lanIpRow.style.display = 'none';
  }
}

if (pairingPinRow && pairingPinDisplay) {
  if (window.electronAPI && appConfig?.mdnsPairingPin) {
    pairingPinRow.style.display = 'block';
    pairingPinDisplay.textContent = appConfig.mdnsPairingPin;
  } else {
    pairingPinRow.style.display = 'none';
  }
}

function formatVariantName(variant) {
  if (!variant) return tr('Normal');
  if (variant === 'lowerthirds') return 'Lower Thirds';
  if (variant === 'confidencemonitor') return 'Confidence Monitor';
  if (variant === 'notes') return 'Notes';
  return variant;
}

if (selectedLanguageDisplay) {
  const lang = (appConfig?.preferredPresentationLanguage || appConfig?.language || 'en').toLowerCase();
  selectedLanguageDisplay.textContent = lang;
}

if (selectedVariantDisplay) {
  const variant = (appConfig?.screenTypeVariant || '').toLowerCase();
  selectedVariantDisplay.textContent = formatVariantName(variant);
}

if (optionsBtn) {
  const variant = (appConfig?.screenTypeVariant || '').trim().toLowerCase();
  if (variant) {
    optionsBtn.style.background = '#8f1010';
    optionsBtn.style.borderColor = '#d24a4a';
  } else {
    optionsBtn.style.background = '#222';
    optionsBtn.style.borderColor = '#555';
  }
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

function appendMediaParam(url) {
  if (!appConfig?.preferHighBitrate) return url;
  try {
    const parsed = new URL(url, window.location.origin);
    parsed.searchParams.set('media', 'high');
    return parsed.toString();
  } catch {
    return url + (url.includes('?') ? '&' : '?') + 'media=high';
  }
}

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
  link.setAttribute('data-translate', 'true');
  link.textContent = '📁 View Media Library';
  link.style = 'color: #4da6ff; font-size: 1rem; text-decoration: none;';
  link.onmouseover = () => link.style.textDecoration = 'underline';
  link.onmouseout = () => link.style.textDecoration = 'none';
  mediaLinkDiv.appendChild(link);
}

function getPresentationKey(pres) {
  return `${pres.slug}::${pres.md}`;
}

function openPrimaryPresentation(pres) {
  if (window.electronAPI?.openPresentation) {
    window.electronAPI.openPresentation(pres.slug, pres.md, true);
  } else {
    window.open(
      `${url_prefix}/${pres.slug}/index.html?p=${pres.md}`,
      'revelation_presentation',
      'toolbar=no,location=no,status=no,menubar=no,scrollbars=no,resizable=yes,width=1920,height=1080'
    );
  }
}

function extractFrontMatter(raw = '') {
  const match = String(raw).match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return {};
  try {
    return yaml.load(match[1]) || {};
  } catch (err) {
    console.warn('Failed to parse presentation metadata:', err.message);
    return {};
  }
}

function readAuthorName(metadata = {}) {
  if (typeof metadata.author === 'string') return metadata.author;
  if (metadata.author && typeof metadata.author === 'object') {
    return metadata.author.name || metadata.author.fullname || metadata.author.full || '';
  }
  return '';
}

async function loadPresentationDetails(pres) {
  const key = getPresentationKey(pres);
  if (detailsCache.has(key)) return detailsCache.get(key);

  const details = {
    author: '',
    variants: []
  };

  try {
    const response = await fetch(`${url_prefix}/${pres.slug}/${pres.md}`);
    if (response.ok) {
      const markdown = await response.text();
      const metadata = extractFrontMatter(markdown);
      details.author = readAuthorName(metadata);
      if (metadata.alternatives && typeof metadata.alternatives === 'object' && !Array.isArray(metadata.alternatives)) {
        details.variants = Object.entries(metadata.alternatives).map(([mdFile, language]) => ({
          mdFile,
          language: String(language || '').trim().toLowerCase(),
          isCurrent: mdFile === pres.md,
          isMaster: mdFile === pres.md
        }));
      }
    }
  } catch (err) {
    console.warn('Failed to load markdown metadata for presentation details:', err);
  }

  if (window.electronAPI?.getPresentationVariants) {
    try {
      const variantState = await window.electronAPI.getPresentationVariants({ slug: pres.slug, mdFile: pres.md });
      if (Array.isArray(variantState?.entries)) {
        details.variants = variantState.entries;
      }
    } catch (err) {
      console.warn('Failed to load presentation variants:', err);
    }
  }

  detailsCache.set(key, details);
  return details;
}

function formatVariantDetails(variants = []) {
  if (!Array.isArray(variants) || !variants.length) {
    return tr('Default only');
  }
  return variants
    .filter((entry) => !entry?.hidden)
    .map((entry) => {
      const language = String(entry.language || '').trim() || tr('default');
      const masterSuffix = entry.isMaster ? ` (${tr('master')})` : '';
      return `${language}${masterSuffix}`;
    })
    .join(', ') || tr('Default only');
}

function getSelectedPanelHost() {
  let host = document.getElementById('selected-presentation-panel-host');
  if (host) {
    const sidebarSlot = document.getElementById('sidebar-current-presentation');
    if (sidebarSlot && host.parentElement !== sidebarSlot) {
      sidebarSlot.prepend(host);
    }
    return host;
  }

  const sidebarSlot = document.getElementById('sidebar-current-presentation');
  if (sidebarSlot) {
    host = document.createElement('div');
    host.id = 'selected-presentation-panel-host';
    sidebarSlot.prepend(host);
    return host;
  }

  const heading = document.querySelector('h1');
  if (!heading) return null;
  host = document.createElement('div');
  host.id = 'selected-presentation-panel-host';
  heading.insertAdjacentElement('afterend', host);
  return host;
}

function renderSelectedPresentationPanel(pres, details = null) {
  const host = getSelectedPanelHost();
  if (!host) return;

  const actions = getPresentationActions(pres);
  const detailsLoaded = !!details;
  const author = detailsLoaded ? (details.author || tr('Unknown')) : tr('Loading...');
  const variants = detailsLoaded ? formatVariantDetails(details.variants) : tr('Loading...');

  host.innerHTML = `
    <section id="selected-presentation-panel" class="selected-presentation-panel">
      <div class="selected-presentation-header">${tr('Selected Presentation')}</div>
      <img class="selected-presentation-thumb" src="${url_prefix}/${pres.slug}/${pres.thumbnail}" alt="${pres.title}">
      <div class="selected-presentation-title">${pres.title}</div>
      <div class="selected-presentation-meta">${pres.description || ''}</div>
      <div class="selected-presentation-meta"><strong>${tr('Author')}:</strong> ${author}</div>
      <div class="selected-presentation-meta"><strong>${tr('Language variants')}:</strong> ${variants}</div>
      <div class="selected-presentation-help">${tr('Double-click any tile to open immediately.')}</div>
      <div class="selected-presentation-actions"></div>
    </section>
  `;

  const actionsContainer = host.querySelector('.selected-presentation-actions');
  for (const opt of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'selected-presentation-action-btn';
    button.textContent = opt.label;
    button.onclick = () => opt.action();
    actionsContainer.appendChild(button);
  }
}

function clearSelection() {
  selectedPresentationKey = '';
  if (selectedCardElement) {
    selectedCardElement.classList.remove('card-selected');
    selectedCardElement = null;
  }
  const host = document.getElementById('selected-presentation-panel-host');
  if (host) {
    host.innerHTML = '';
  }
}

async function selectPresentation(pres, cardElement) {
  selectedPresentationKey = getPresentationKey(pres);
  if (selectedCardElement) {
    selectedCardElement.classList.remove('card-selected');
  }
  selectedCardElement = cardElement;
  selectedCardElement.classList.add('card-selected');

  renderSelectedPresentationPanel(pres);
  const details = await loadPresentationDetails(pres);
  if (selectedPresentationKey !== getPresentationKey(pres)) return;
  renderSelectedPresentationPanel(pres, details);
}

function getPresentationActions(pres) {
  const target = window.electronAPI?.editPresentation ? 'Window' : 'Tab';
  const options = [
    {
      label: '🪟 ' + tr(`Open in ${target}`),
      action: () => {
        if (window.electronAPI?.openPresentation) {
          window.electronAPI.openPresentation(pres.slug, pres.md, false);
        } else {
          window.open(`${url_prefix}/${pres.slug}/index.html?p=${pres.md}`, '_blank');
        }
      }
    },
    {
      label: '🔗 ' + tr('Copy Link'),
      action: async () => {
        const baseURL = await getCopyLinkBaseURL();
        let link = `${baseURL}${url_prefix}/${pres.slug}/index.html?p=${pres.md}`;
        link = appendMediaParam(link);
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
    { label: '📄 ' + tr('Handout View'), action: () => handoutView(pres.slug, pres.md) }
  ];

  if (window.electronAPI?.editPresentation) {
    options.push({
      label: '🧩 ' + tr('Open Presentation Builder'),
      action: () => window.electronAPI.openPresentationBuilder(pres.slug, pres.md)
    });
    options.push({
      label: '📂 ' + tr('Show Presentation Files'),
      action: () => window.electronAPI.showPresentationFolder(pres.slug)
    });
    options.push({
      label: '🖼️ ' + tr('Regenerate Thumbnail'),
      action: async () => {
        await window.electronAPI.exportImages(pres.slug, pres.md, 853, 480, 2, true);
        window.location = window.location.href;
      }
    });
    options.push({
      label: '📤 ' + tr('Export Presentation…'),
      action: async () => {
        await window.electronAPI.showExportWindow(pres.slug, pres.md);
      }
    });
    options.push({
      label: '📥 ' + tr('Download Missing Media'),
      action: async () => {
        try {
          const result = await window.electronAPI.importMissingMedia(pres.slug);
          if (!result?.success) {
            alert(`❌ ${tr('Download failed')}: ${result?.error || tr('Unknown error')}`);
            return;
          }
          if (!result.missingCount) {
            showToast(`✅ ${tr('No missing media found')}`);
            return;
          }
          if (result.skipped) {
            showToast(`ℹ️ ${tr('Skipped downloading')} (${result.missingCount})`);
            return;
          }
          const extra = result.largeDownloaded
            ? ` (+${result.largeDownloaded} ${tr('large variants')})`
            : '';
          showToast(`✅ ${tr('Downloaded')} ${result.downloadedCount}/${result.missingCount}${extra}`);
        } catch (err) {
          alert(`❌ ${tr('Download failed')}: ${err.message}`);
        }
      }
    });
    options.push({
      label: '🗑️ ' + tr('Delete Presentation…'),
      action: async () => {
        try {
          const result = await window.electronAPI.deletePresentation(pres.slug, pres.md);
          if (result?.success) {
            showToast(`🗑️ ${tr('Deleted')}: ${pres.title}`);
            window.location = window.location.href;
          } else if (!result?.canceled) {
            alert(`❌ ${tr('Delete failed')}: ${result?.error || tr('Unknown error')}`);
          }
        } catch (err) {
          alert(`❌ ${tr('Delete failed')}: ${err.message}`);
        }
      }
    });
  } else {
    options.push({
      label: '📑 ' + tr('Export as PDF'),
      action: () => exportPDF(pres.slug, pres.md)
    });
  }

  const plugins = Object.entries(window.RevelationPlugins || {})
    .map(([name, plugin]) => ({
      name,
      plugin,
      priority: plugin.priority
    }))
    .sort((a, b) => a.priority - b.priority);

  for (const { plugin } of plugins) {
    if (typeof plugin.getListMenuItems === 'function') {
      const menuItems = plugin.getListMenuItems(pres);
      if (Array.isArray(menuItems)) {
        options.push(...menuItems);
      }
    }
  }

  return options;
}

function showCustomContextMenu(x, y, pres) {
  const existing = document.getElementById('custom-context-menu');
  if (existing) existing.remove();

  const menu = document.createElement('div');
  menu.id = 'custom-context-menu';

  const scrollY = window.scrollY || document.documentElement.scrollTop;
  const scrollX = window.scrollX || document.documentElement.scrollLeft;

  const menuWidth = 330;
  const menuHeight = 480; // Estimate or measure depending on items

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

  const options = getPresentationActions(pres);


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

async function getCopyLinkBaseURL() {
  if (window.electronAPI?.getAppConfig) {
    try {
      const appConfig = await window.electronAPI.getAppConfig();
      if (appConfig?.mode === 'network' && appConfig?.hostLANURL) {
        return `http://${appConfig.hostLANURL}:${appConfig.viteServerPort}`;
      }
    } catch (err) {
      console.warn('Failed to load app config for copy link:', err);
    }
  }
  return window.location.origin;
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
          alert(`✅ ${tr('PDF exported to')}: ${result.filePath}`);
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
    alert(tr('Failed to copy the link. You can do it manually') + ':\n' + text);
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
