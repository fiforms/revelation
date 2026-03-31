import { pluginLoader } from './pluginloader.js';
import { createInfoPanel } from './info-panel.js';
import yaml from 'js-yaml';

const urlParams = new URLSearchParams(window.location.search);
const url_key = urlParams.get('key');
const url_prefix = `/presentations_${url_key}`;

const container = document.getElementById('presentation-list');
let selectedCardElement = null;
let selectedPresentationKey = '';
let selectedPresentationBase = null;
let selectedSidebarMdFile = '';
const detailsCache = new Map();
const isStandaloneMode = !window.electronAPI;

const SCREEN_TYPE_VARIANTS = [
  { value: '', label: 'Normal' },
  { value: 'lowerthirds', label: 'Lower Thirds' },
  { value: 'confidencemonitor', label: 'Confidence Monitor' },
  { value: 'notes', label: 'Notes' }
];

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

const sortBtn = document.getElementById('sort-button');
const sortDropdown = document.getElementById('sort-dropdown');
const sortOptionsList = document.getElementById('sort-options-list');
const sortMenu = document.getElementById('sort-menu');

const SORT_STORAGE_KEY = 'revelation.presentationSortMode';
const SORT_MODES = [
  { value: 'slug', labelKey: 'Slug' },
  { value: 'title', labelKey: 'Title' },
  { value: 'modified_desc', labelKey: 'Last Modified' },
  { value: 'modified_asc', labelKey: 'First Modified' },
  { value: 'created_desc', labelKey: 'Last Created' },
  { value: 'created_asc', labelKey: 'First Created' }
];

let presentationItems = [];
let currentSortMode = getStoredSortMode();
let sortMenuOffsetObserver = null;
const TRANSLATE_PRESENTATION_TITLES = true;

function updateSortMenuOffset() {
  if (!sortMenu) return;
  const sidebar = document.querySelector('nav.sidebar');
  if (sidebar) {
    const rect = sidebar.getBoundingClientRect();
    const safeLeft = Math.max(16, Math.round(rect.right + 16));
    sortMenu.style.left = `${safeLeft}px`;
    return;
  }
  sortMenu.style.left = '1rem';
}

function initSortMenuOffsetTracking() {
  updateSortMenuOffset();
  window.addEventListener('resize', updateSortMenuOffset);

  if (sortMenuOffsetObserver) {
    sortMenuOffsetObserver.disconnect();
  }
  sortMenuOffsetObserver = new MutationObserver(() => {
    updateSortMenuOffset();
  });
  sortMenuOffsetObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class']
  });
}

function getStoredSortMode() {
  try {
    const saved = String(window.localStorage?.getItem(SORT_STORAGE_KEY) || '').trim();
    if (SORT_MODES.some((entry) => entry.value === saved)) {
      return saved;
    }
  } catch (err) {
    console.warn('Failed to read sort mode from localStorage:', err);
  }
  return 'title';
}

function setStoredSortMode(value) {
  try {
    window.localStorage?.setItem(SORT_STORAGE_KEY, value);
  } catch (err) {
    console.warn('Failed to persist sort mode:', err);
  }
}

function compareText(a, b) {
  return String(a || '').toLowerCase().localeCompare(String(b || '').toLowerCase());
}

function translatePresentationTitle(title) {
  const rawTitle = String(title || '').trim();
  if (!rawTitle || !TRANSLATE_PRESENTATION_TITLES) return rawTitle;
  return tr(rawTitle);
}

function getModifiedTimestamp(item) {
  const direct = Number(item?.modifiedTimestamp);
  if (Number.isFinite(direct)) return direct;
  const parsed = Date.parse(String(item?.modified || ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function getCreatedTimestamp(item) {
  const direct = Number(item?.createdTimestamp);
  if (Number.isFinite(direct)) return direct;
  const parsed = Date.parse(String(item?.created || ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function sortPresentations(items, mode) {
  const sorted = [...items];
  sorted.sort((a, b) => {
    if (mode === 'slug') {
      const bySlug = compareText(a.slug, b.slug);
      return bySlug || compareText(a.title, b.title);
    }
    if (mode === 'title') {
      const byTitle = compareText(a.title, b.title);
      return byTitle || compareText(a.slug, b.slug);
    }
    if (mode === 'modified_desc') {
      const aValue = getModifiedTimestamp(a);
      const bValue = getModifiedTimestamp(b);
      const aRank = aValue == null ? Number.NEGATIVE_INFINITY : aValue;
      const bRank = bValue == null ? Number.NEGATIVE_INFINITY : bValue;
      if (aRank !== bRank) return bRank - aRank;
      return compareText(a.title, b.title);
    }
    if (mode === 'modified_asc') {
      const aValue = getModifiedTimestamp(a);
      const bValue = getModifiedTimestamp(b);
      const aRank = aValue == null ? Number.POSITIVE_INFINITY : aValue;
      const bRank = bValue == null ? Number.POSITIVE_INFINITY : bValue;
      if (aRank !== bRank) return aRank - bRank;
      return compareText(a.title, b.title);
    }
    if (mode === 'created_desc') {
      const aValue = getCreatedTimestamp(a);
      const bValue = getCreatedTimestamp(b);
      const aRank = aValue == null ? Number.NEGATIVE_INFINITY : aValue;
      const bRank = bValue == null ? Number.NEGATIVE_INFINITY : bValue;
      if (aRank !== bRank) return bRank - aRank;
      return compareText(a.title, b.title);
    }
    if (mode === 'created_asc') {
      const aValue = getCreatedTimestamp(a);
      const bValue = getCreatedTimestamp(b);
      const aRank = aValue == null ? Number.POSITIVE_INFINITY : aValue;
      const bRank = bValue == null ? Number.POSITIVE_INFINITY : bValue;
      if (aRank !== bRank) return aRank - bRank;
      return compareText(a.title, b.title);
    }
    return compareText(a.title, b.title);
  });
  return sorted;
}

function renderSortMenu() {
  if (!sortOptionsList) return;
  if (sortBtn) {
    sortBtn.title = tr('Sort');
  }
  sortOptionsList.innerHTML = SORT_MODES.map((mode) => {
    const isCurrent = mode.value === currentSortMode;
    return `<button type="button" class="sort-option-btn${isCurrent ? ' is-current' : ''}" data-sort-mode="${mode.value}" style="display:block;width:100%;text-align:left;background:${isCurrent ? '#1f3b53' : '#1a1a1a'};color:#f0f0f0;border:1px solid #444;border-radius:6px;padding:.4rem .55rem;cursor:pointer;margin:.2rem 0;">${isCurrent ? '✓ ' : ''}${tr(mode.labelKey)}</button>`;
  }).join('');
  sortOptionsList.querySelectorAll('[data-sort-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      const mode = String(button.dataset.sortMode || '').trim();
      if (!mode) return;
      applySortMode(mode, { persist: true, closeMenu: true });
    });
  });
}

function renderPresentationCards() {
  if (!container) return;

  if (!presentationItems.length) {
    container.innerHTML = '<p>' + tr('No presentations available.') + '</p>';
    return;
  }

  const sorted = sortPresentations(presentationItems, currentSortMode);
  container.innerHTML = '';
  selectedCardElement = null;

  sorted.forEach((pres) => {
    const displayTitle = translatePresentationTitle(pres.title);
    const card = document.createElement('a');
    card.href = `${url_prefix}/${pres.slug}/?p=${pres.md}`;
    card.target = '_blank';
    card.className = 'card';
    if (selectedPresentationBase && selectedPresentationBase.slug === pres.slug && selectedPresentationBase.md === pres.md) {
      card.classList.add('card-selected');
      selectedCardElement = card;
    }
    card.innerHTML = `
      <img src="${url_prefix}/${pres.slug}/${pres.thumbnail}" alt="${displayTitle}">
      <div class="card-content">
        <div class="card-title">${displayTitle}</div>
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
}

function applySortMode(mode, { persist = false, closeMenu = false } = {}) {
  if (!SORT_MODES.some((entry) => entry.value === mode)) return;
  currentSortMode = mode;
  if (persist) {
    setStoredSortMode(mode);
  }
  renderSortMenu();
  renderPresentationCards();
  if (closeMenu && sortDropdown) {
    sortDropdown.style.display = 'none';
  }
}

function rerenderForTranslations() {
  renderSortMenu();
  renderPresentationCards();
  if (!selectedPresentationBase) return;
  const details = detailsCache.get(getPresentationKey(selectedPresentationBase)) || null;
  renderSelectedPresentationPanel(selectedPresentationBase, details);
}

if (window.translationsLoaded) {
  rerenderForTranslations();
} else {
  window.addEventListener('translations-loaded', () => {
    rerenderForTranslations();
  }, { once: true });
}

renderSortMenu();
initSortMenuOffsetTracking();

fetch(`${url_prefix}/index.json`)
  .then((res) => {
    if (!res.ok) {
      if (res.status === 403) {
        throw new Error(tr('Access denied. This presentation list is restricted.'));
      } else {
        throw new Error(tr("Failed to load presentations") + `: ${res.status} ${res.statusText}`);
      }
    }
    return res.json();
  })
  .then((presentations) => {
    presentationItems = Array.isArray(presentations) ? presentations : [];
    renderSortMenu();
    renderPresentationCards();
    if (!selectedPresentationBase) {
      renderNoSelectionPanel();
    }
  })
  .catch((err) => {
    container.innerHTML = `
      <div style="color: red; font-weight: bold; padding: 1rem;">
        ❌ ${err.message}
      </div>
    `;
    console.error('[Presentation Load Error]', err);
  });

// Info dropdown setup
const optionsBtn = document.getElementById('options-button');
const optionsDropdown = document.getElementById('options-dropdown');

let appConfig = null;
if (window.electronAPI?.getAppConfig) {
  try {
    appConfig = await window.electronAPI.getAppConfig();
  } catch (err) {
    console.warn('Failed to load app config:', err);
  }
}

const infoPanel = optionsDropdown
  ? createInfoPanel(optionsDropdown, () => appConfig, {
      onPeerEvent(event) {
        if (event.type === 'follower-connected') {
          showToast(`Follower connected: ${event.hostname || event.instanceName || event.remoteAddress || 'unknown'}`);
        } else if (event.type === 'pin-lockout') {
          const ip = String(event.remoteAddress || 'unknown');
          const retryAfterSec = Number.parseInt(event.retryAfterSec, 10);
          const retryText = Number.isFinite(retryAfterSec) && retryAfterSec > 0 ? ` (${retryAfterSec}s)` : '';
          showToast(`Peer PIN lockout from ${ip}${retryText}`);
        }
      }
    })
  : null;

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
    if (sortDropdown) sortDropdown.style.display = 'none';
    const isVisible = optionsDropdown.style.display === 'block';
    optionsDropdown.style.display = isVisible ? 'none' : 'block';
    if (!isVisible) infoPanel?.triggerPoll();
  });

  document.addEventListener('click', (e) => {
    if (!optionsDropdown.contains(e.target) && e.target !== optionsBtn) {
      optionsDropdown.style.display = 'none';
    }
  });
}

infoPanel?.startPolling();

if (sortBtn && sortDropdown) {
  sortBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (optionsDropdown) {
      optionsDropdown.style.display = 'none';
    }
    const isVisible = sortDropdown.style.display === 'block';
    sortDropdown.style.display = isVisible ? 'none' : 'block';
  });

  document.addEventListener('click', (e) => {
    if (!sortDropdown.contains(e.target) && e.target !== sortBtn) {
      sortDropdown.style.display = 'none';
    }
  });
}

function getConfiguredCcliNumber(config) {
  const pluginValue = String(config?.pluginConfigs?.credit_ccli?.licenseNumber || '').trim();
  if (pluginValue) return pluginValue;
  return String(config?.ccliLicenseNumber || '').trim();
}

function appendBrowserPresentationParams(url, overrides = {}) {
  const ccli = getConfiguredCcliNumber(appConfig);
  const needsMedia = !!appConfig?.preferHighBitrate;
  const requestedLanguage = Object.prototype.hasOwnProperty.call(overrides, 'language')
    ? overrides.language
    : (appConfig?.preferredPresentationLanguage || appConfig?.language || 'en');
  const requestedVariant = Object.prototype.hasOwnProperty.call(overrides, 'variant')
    ? overrides.variant
    : (appConfig?.screenTypeVariant || '');
  const lang = String(requestedLanguage || '').trim().toLowerCase();
  const variant = String(requestedVariant || '').trim().toLowerCase();
  if (!needsMedia && !ccli && !lang && !variant) return url;

  try {
    const parsed = new URL(url, window.location.origin);
    if (needsMedia) {
      parsed.searchParams.set('media', 'high');
    }
    if (ccli) {
      parsed.searchParams.set('ccli', ccli);
    }
    if (lang) {
      parsed.searchParams.set('lang', lang);
    }
    if (variant) {
      parsed.searchParams.set('variant', variant);
    } else {
      parsed.searchParams.delete('variant');
    }
    return parsed.toString();
  } catch {
    const params = [];
    if (needsMedia) params.push('media=high');
    if (ccli) params.push(`ccli=${encodeURIComponent(ccli)}`);
    if (lang) params.push(`lang=${encodeURIComponent(lang)}`);
    if (variant) params.push(`variant=${encodeURIComponent(variant)}`);
    if (!params.length) return url;
    return `${url}${url.includes('?') ? '&' : '?'}${params.join('&')}`;
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

function showPeerScreensFlyout(anchorBtn) {
  const existing = document.getElementById('peer-screens-flyout');
  if (existing) { existing.remove(); return; }

  const rect = anchorBtn.getBoundingClientRect();
  const flyout = document.createElement('div');
  flyout.id = 'peer-screens-flyout';
  flyout.style.cssText = `
    position: fixed;
    top: ${rect.bottom + 4}px;
    left: ${rect.left}px;
    min-width: ${rect.width}px;
    background: #1a1a1a;
    border: 1px solid #444;
    border-radius: 6px;
    padding: 0.3rem;
    z-index: 9999;
    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
  `;

  const items = [
    {
      label: tr('Open Screens'),
      action: async () => {
        if (!window.electronAPI?.openScreens) return;
        try {
          const result = await window.electronAPI.openScreens();
          if (result?.success) {
            showToast(tr('Screens opened.'));
          } else {
            showToast(result?.error || tr('Unable to open screens.'));
          }
        } catch (err) {
          showToast(`${tr('Unable to open screens.')}: ${err.message}`);
        }
      }
    },
    /* { label: tr('Blank Remote Screens'), action: () => {} }, */
    {
      label: tr('End Remote Presentation'),
      action: async () => {
        if (!window.electronAPI?.sendPeerCommand) return;
        try {
          await window.electronAPI.sendPeerCommand({ type: 'close-presentation', payload: {} });
        } catch (err) {
          showToast(`${tr('Unable to end remote presentation.')}: ${err.message}`);
        }
      }
    },
    {
      label: tr('Close Screens'),
      action: async () => {
        if (!window.electronAPI?.closeScreens) return;
        try {
          await window.electronAPI.closeScreens();
        } catch (err) {
          showToast(`${tr('Unable to close screens.')}: ${err.message}`);
        }
      }
    }
  ];

  for (const item of items) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'selected-presentation-action-btn';
    el.textContent = item.label;
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      flyout.remove();
      item.action();
    });
    flyout.appendChild(el);
  }

  document.body.appendChild(flyout);
  setTimeout(() => {
    document.addEventListener('click', () => flyout.remove(), { once: true });
  }, 0);
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

function getCurrentSelectionKey() {
  if (!selectedPresentationBase) return '';
  return getPresentationKey({
    slug: selectedPresentationBase.slug,
    md: selectedSidebarMdFile || selectedPresentationBase.md
  });
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

function isValidMarkdownPath(mdFile = '') {
  const candidate = String(mdFile || '').trim();
  if (!candidate) return false;
  return /^(?:[a-zA-Z0-9_.-]+\/)*[a-zA-Z0-9_.-]+\.md$/.test(candidate);
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
    selectedMdFile: pres.md,
    slug: pres.slug,
    title: pres.title,
    description: pres.description,
    thumbnail: pres.thumbnail,
    author: '',
    variants: [],
    languageVariants: [],
    additionalPresentations: []
  };

  if (window.electronAPI?.getPresentationFileContext) {
    try {
      const context = await window.electronAPI.getPresentationFileContext({ slug: pres.slug, mdFile: pres.md });
      const selected = context?.selected || null;
      details.selectedMdFile = selected?.mdFile || context?.selectedMdFile || pres.md;
      details.title = selected?.title || pres.title;
      details.description = selected?.description ?? pres.description;
      details.thumbnail = selected?.thumbnail || pres.thumbnail;
      details.author = selected?.author || '';
      details.variants = Array.isArray(context?.entries) ? context.entries : [];
      details.languageVariants = Array.isArray(context?.languageVariants) ? context.languageVariants : [];
      details.additionalPresentations = Array.isArray(context?.additionalPresentations) ? context.additionalPresentations : [];
      detailsCache.set(key, details);
      return details;
    } catch (err) {
      console.warn('Failed to load presentation file context:', err);
    }
  }

  try {
    const response = await fetch(`${url_prefix}/${pres.slug}/${pres.md}`);
    if (response.ok) {
      const markdown = await response.text();
      const metadata = extractFrontMatter(markdown);
      details.author = readAuthorName(metadata);
      details.title = String(metadata.title || details.title || '').trim() || details.title;
      details.description = String(metadata.description || details.description || '').trim();
      details.thumbnail = String(metadata.thumbnail || details.thumbnail || '').trim() || details.thumbnail;
      if (metadata.alternatives && typeof metadata.alternatives === 'object' && !Array.isArray(metadata.alternatives)) {
        details.variants = Object.entries(metadata.alternatives)
          .filter(([mdFile]) => String(mdFile || '').trim().toLowerCase() !== 'self')
          .filter(([mdFile]) => isValidMarkdownPath(mdFile))
          .map(([mdFile, language]) => ({
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
        details.languageVariants = variantState.entries.map((entry) => ({
          mdFile: entry.mdFile,
          title: entry.mdFile,
          description: '',
          thumbnail: details.thumbnail,
          author: '',
          language: entry.language,
          hidden: !!entry.hidden,
          inLanguageVariants: true,
          isMaster: !!entry.isMaster,
          isCurrent: !!entry.isCurrent
        }));
      }
    } catch (err) {
      console.warn('Failed to load presentation variants:', err);
    }
  }

  detailsCache.set(key, details);
  return details;
}

function getLanguageFromMdFile(mdFile = '') {
  const match = String(mdFile || '').trim().toLowerCase().match(/_([a-z]{2,8}(?:-[a-z0-9]{2,8})?)\.md$/);
  return match ? match[1] : '';
}

function getLanguageVariantOptions(pres, details = null) {
  const entries = Array.isArray(details?.languageVariants) && details.languageVariants.length
    ? details.languageVariants
    : (Array.isArray(details?.variants) ? details.variants : []);
  const seenMdFiles = new Set();
  const options = [];
  const addOption = (mdFile, language, isMaster = false) => {
    const safeMdFile = String(mdFile || '').trim();
    if (!safeMdFile || seenMdFiles.has(safeMdFile)) return;
    seenMdFiles.add(safeMdFile);
    const normalizedLanguage = String(language || '').trim().toLowerCase() || getLanguageFromMdFile(safeMdFile);
    options.push({
      mdFile: safeMdFile,
      language: normalizedLanguage,
      isMaster: !!isMaster
    });
  };

  entries.forEach((entry) => {
    addOption(entry?.mdFile, entry?.language, entry?.isMaster);
  });

  addOption(pres.md, appConfig?.preferredPresentationLanguage || appConfig?.language || 'en', true);
  return options;
}

function buildLanguageOptionLabel(option) {
  const language = option.language || tr('default');
  const masterSuffix = option.isMaster ? ` (${tr('master')})` : '';
  return `${language}${masterSuffix}`;
}

async function buildPresentationBrowserUrl(pres, mdFile, overrides = {}) {
  const baseURL = await getCopyLinkBaseURL();
  const parsed = new URL(`${url_prefix}/${pres.slug}/index.html`, baseURL);
  parsed.searchParams.set('p', mdFile);
  return appendBrowserPresentationParams(parsed.toString(), overrides);
}

async function launchPresentationWithOptions(pres, options = {}) {
  const mode = String(options.mode || 'fullscreen').trim().toLowerCase();
  const mdFile = String(options.mdFile || pres.md).trim() || pres.md;
  const language = String(options.language || '').trim().toLowerCase();
  const variant = String(options.variant || '').trim().toLowerCase();
  const overrides = { language, variant };

  if (mode === 'browser') {
    const link = await buildPresentationBrowserUrl(pres, mdFile, overrides);
    if (window.electronAPI?.openExternalURL) {
      window.electronAPI.openExternalURL(link);
      return;
    }
    window.open(link, '_blank', 'noopener,noreferrer');
    return;
  }

  if (window.electronAPI?.openPresentation) {
    const fullscreen = mode !== 'window';
    window.electronAPI.openPresentation(pres.slug, mdFile, fullscreen, overrides);
    return;
  }

  const parsed = new URL(`${url_prefix}/${pres.slug}/index.html`, window.location.origin);
  parsed.searchParams.set('p', mdFile);
  const targetUrl = appendBrowserPresentationParams(parsed.toString(), overrides);
  window.open(targetUrl, '_blank');
}

async function openSlideshowOptionsLightbox(pres, details = null) {
  const variantDetails = details || await loadPresentationDetails(pres);
  const languageOptions = getLanguageVariantOptions(pres, variantDetails);
  const defaultLanguage = String(appConfig?.preferredPresentationLanguage || appConfig?.language || 'en').trim().toLowerCase();
  const defaultVariant = String(appConfig?.screenTypeVariant || '').trim().toLowerCase();
  const defaultOption = languageOptions.find((entry) => entry.language === defaultLanguage)
    || languageOptions.find((entry) => entry.mdFile === variantDetails?.selectedMdFile)
    || languageOptions.find((entry) => entry.mdFile === pres.md)
    || languageOptions[0];

  const existing = document.getElementById('slideshow-options-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'slideshow-options-overlay';
  overlay.className = 'slideshow-options-overlay';
  const languageSelectOptions = languageOptions.map((entry) => (
    `<option value="${entry.mdFile}" data-language="${entry.language}">${buildLanguageOptionLabel(entry)}</option>`
  )).join('');
  const screenTypeOptions = SCREEN_TYPE_VARIANTS.map((entry) => (
    `<option value="${entry.value}">${tr(entry.label)}</option>`
  )).join('');

  overlay.innerHTML = `
    <div class="slideshow-options-dialog" role="dialog" aria-modal="true" aria-labelledby="slideshow-options-title">
      <div class="slideshow-options-title" id="slideshow-options-title">${tr('Slideshow Options')}</div>
      <label class="slideshow-options-label" for="slideshow-open-in">${tr('Open in')}</label>
      <select id="slideshow-open-in" class="slideshow-options-input">
        <option value="window">${tr('Window')}</option>
        <option value="fullscreen">${tr('Fullscreen')}</option>
        <option value="browser">${tr('Browser')}</option>
      </select>

      <label class="slideshow-options-label" for="slideshow-language-variant">${tr('Language Variant')}</label>
      <select id="slideshow-language-variant" class="slideshow-options-input">
        ${languageSelectOptions}
      </select>

      <label class="slideshow-options-label" for="slideshow-screen-variant">${tr('Screen Type Variant')}</label>
      <select id="slideshow-screen-variant" class="slideshow-options-input">
        ${screenTypeOptions}
      </select>

      <div class="slideshow-options-actions">
        <button type="button" id="slideshow-options-cancel" class="slideshow-options-btn">${tr('Cancel')}</button>
        <button type="button" id="slideshow-options-open" class="slideshow-options-btn slideshow-options-btn-primary">${tr('Open')}</button>
      </div>
    </div>
  `;

  const closeOverlay = () => overlay.remove();
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeOverlay();
  });
  document.body.appendChild(overlay);

  const openInSelect = overlay.querySelector('#slideshow-open-in');
  const languageSelect = overlay.querySelector('#slideshow-language-variant');
  const screenVariantSelect = overlay.querySelector('#slideshow-screen-variant');
  const cancelBtn = overlay.querySelector('#slideshow-options-cancel');
  const openBtn = overlay.querySelector('#slideshow-options-open');

  openInSelect.value = 'window';
  if (defaultOption) {
    languageSelect.value = defaultOption.mdFile;
  }
  screenVariantSelect.value = defaultVariant;

  cancelBtn.addEventListener('click', closeOverlay);
  openBtn.addEventListener('click', async () => {
    const selectedMd = String(languageSelect.value || variantDetails?.selectedMdFile || pres.md);
    const selectedLanguage = languageSelect.selectedOptions?.[0]?.dataset?.language || '';
    const selectedVariant = String(screenVariantSelect.value || '');
    const selectedMode = String(openInSelect.value || 'window');
    await launchPresentationWithOptions(pres, {
      mode: selectedMode,
      mdFile: selectedMd,
      language: selectedLanguage,
      variant: selectedVariant
    });
    closeOverlay();
  });
}

function setStandaloneSidebarOpen(open) {
  const shell = document.getElementById('standalone-selected-sidebar');
  const toggle = document.getElementById('standalone-selected-sidebar-toggle');
  if (!shell || !toggle) return;
  shell.classList.toggle('is-open', !!open);
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  toggle.textContent = open ? '▶' : '◀';
}

function ensureStandalonePanelHost() {
  if (!isStandaloneMode || document.getElementById('sidebar-current-presentation')) return null;

  let shell = document.getElementById('standalone-selected-sidebar');
  if (!shell) {
    shell = document.createElement('aside');
    shell.id = 'standalone-selected-sidebar';
    shell.className = 'standalone-selected-sidebar';

    const toggle = document.createElement('button');
    toggle.id = 'standalone-selected-sidebar-toggle';
    toggle.className = 'standalone-selected-sidebar-toggle';
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.textContent = '◀';
    toggle.addEventListener('click', () => {
      const isOpen = shell.classList.contains('is-open');
      setStandaloneSidebarOpen(!isOpen);
    });
    shell.appendChild(toggle);

    document.body.appendChild(shell);
  }

  let host = document.getElementById('selected-presentation-panel-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'selected-presentation-panel-host';
  }
  if (host.parentElement !== shell) {
    shell.appendChild(host);
  }
  return host;
}

function getSelectedPanelHost() {
  let host = document.getElementById('selected-presentation-panel-host');
  if (host) {
    const sidebarSlot = document.getElementById('sidebar-current-presentation');
    if (sidebarSlot && host.parentElement !== sidebarSlot) {
      sidebarSlot.prepend(host);
    }
    if (!sidebarSlot && isStandaloneMode) {
      return ensureStandalonePanelHost();
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

  if (isStandaloneMode) {
    return ensureStandalonePanelHost();
  }

  const heading = document.querySelector('h1');
  if (!heading) return null;
  host = document.createElement('div');
  host.id = 'selected-presentation-panel-host';
  heading.insertAdjacentElement('afterend', host);
  return host;
}

function makeEffectivePresentation(basePres, details = null) {
  const selectedMd = String(details?.selectedMdFile || selectedSidebarMdFile || basePres.md || '').trim() || basePres.md;
  return {
    ...basePres,
    md: selectedMd,
    title: details?.title || basePres.title,
    description: details?.description ?? basePres.description,
    thumbnail: details?.thumbnail || basePres.thumbnail
  };
}

function buildFileLineLabel(entry) {
  const mdFile = String(entry?.mdFile || '').trim();
  const language = String(entry?.language || '').trim().toLowerCase();
  const flags = [];
  if (language) flags.push(language);
  if (entry?.isMaster) flags.push(tr('master'));
  if (entry?.hidden) flags.push(tr('hidden'));
  if (!flags.length) return mdFile;
  return `${mdFile} (${flags.join(', ')})`;
}

function renderSelectedPresentationPanel(pres, details = null) {
  const host = getSelectedPanelHost();
  if (!host) return;

  const effectivePres = makeEffectivePresentation(pres, details);
  const actions = getPresentationActions(effectivePres, details);
  const detailsLoaded = !!details;
  const displayTitle = translatePresentationTitle(effectivePres.title);
  const author = detailsLoaded ? (details.author || tr('Unknown')) : tr('Loading...');
  const languageVariants = detailsLoaded ? (details.languageVariants || []) : [];
  const additionalPresentations = detailsLoaded ? (details.additionalPresentations || []) : [];
  const selectedMd = String(effectivePres.md || '').trim();

  host.innerHTML = `
    <section id="selected-presentation-panel" class="selected-presentation-panel">
      <div class="selected-presentation-header">${tr('Selected Presentation')}</div>
      <img class="selected-presentation-thumb" src="${url_prefix}/${effectivePres.slug}/${effectivePres.thumbnail}" alt="${displayTitle}">
      <div class="selected-presentation-title">${displayTitle}</div>
      <div class="selected-presentation-meta">${effectivePres.description || ''}</div>
      <div class="selected-presentation-meta"><strong>${tr('Slug')}:</strong> ${effectivePres.slug}</div>
      <div class="selected-presentation-meta"><strong>${tr('File')}:</strong> ${selectedMd}</div>
      <div class="selected-presentation-meta"><strong>${tr('Author')}:</strong> ${author}</div>
      <div class="selected-presentation-meta"><strong>${tr('Language variants')}:</strong></div>
      <div class="selected-presentation-file-list selected-presentation-variant-list">
        ${
          detailsLoaded
            ? (languageVariants.length
              ? languageVariants.map((entry) => {
                const mdFile = String(entry?.mdFile || '').trim();
                const isCurrent = mdFile === selectedMd;
                return `<button type="button" class="selected-presentation-file-link${isCurrent ? ' is-current' : ''}" data-file-md="${mdFile}" data-file-group="variant">${buildFileLineLabel(entry)}</button>`;
              }).join('')
              : `<div class="selected-presentation-meta">${tr('Default only')}</div>`)
            : `<div class="selected-presentation-meta">${tr('Loading...')}</div>`
        }
      </div>
      <div class="selected-presentation-meta"><strong>${tr('Additional Presentations')}:</strong></div>
      <div class="selected-presentation-file-list selected-presentation-additional-list">
        ${
          detailsLoaded
            ? (additionalPresentations.length
              ? additionalPresentations.map((entry) => {
                const mdFile = String(entry?.mdFile || '').trim();
                const isCurrent = mdFile === selectedMd;
                return `<button type="button" class="selected-presentation-file-link${isCurrent ? ' is-current' : ''}" data-file-md="${mdFile}" data-file-group="additional">${buildFileLineLabel(entry)}</button>`;
              }).join('')
              : `<div class="selected-presentation-meta">${tr('None')}</div>`)
            : `<div class="selected-presentation-meta">${tr('Loading...')}</div>`
        }
      </div>
      <div class="selected-presentation-help">${tr('Double-click any tile to open immediately.')}</div>
      <div class="selected-presentation-actions"></div>
    </section>
  `;

  host.querySelectorAll('.selected-presentation-file-link[data-file-md]').forEach((button) => {
    button.addEventListener('click', () => {
      const mdFile = String(button.dataset.fileMd || '').trim();
      if (!mdFile || !selectedPresentationBase) return;
      if (mdFile === selectedSidebarMdFile) return;
      selectPresentationFile(mdFile);
    });
  });

  const actionsContainer = host.querySelector('.selected-presentation-actions');
  for (const opt of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'selected-presentation-action-btn';
    button.textContent = opt.label;
    button.onclick = () => opt.action();
    actionsContainer.appendChild(button);
  }

  if (isStandaloneMode) {
    setStandaloneSidebarOpen(true);
  }
}

function renderNoSelectionPanel() {
  if (!window.electronAPI) return;
  const host = getSelectedPanelHost();
  if (!host) return;
  host.innerHTML = `<div class="selected-presentation-actions" id="no-selection-panel" style="margin-top:1em;"></div>`;
  const actionsContainer = host.querySelector('#no-selection-panel');
  const buttons = [
    { label: tr('New Presentation'), handler: () => window.electronAPI.openNewPresentation() },
    { label: tr('Import Presentation'), handler: () => window.electronAPI.openImportPresentation() }
  ];
  for (const { label, handler } of buttons) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'selected-presentation-action-btn new-item-btn';
    btn.textContent = label;
    btn.addEventListener('click', handler);
    actionsContainer.appendChild(btn);
  }

  const screenMode = String(
    appConfig?.presentationScreenMode
    || (typeof appConfig?.virtualPeersAlwaysOpen === 'boolean'
      ? (appConfig.virtualPeersAlwaysOpen ? 'group-control' : 'on-demand')
      : 'group-control')
  ).trim().toLowerCase();
  if (window.electronAPI?.openScreens && screenMode === 'group-control') {
    const peerBtn = document.createElement('button');
    peerBtn.type = 'button';
    peerBtn.className = 'selected-presentation-action-btn new-item-btn';
    peerBtn.textContent = tr('Peer Screens') + '\u2026 \u25b8';
    peerBtn.style.marginTop = '0.5rem';
    peerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showPeerScreensFlyout(peerBtn);
    });
    actionsContainer.appendChild(peerBtn);
  }
}

function clearSelection() {
  selectedPresentationKey = '';
  selectedPresentationBase = null;
  selectedSidebarMdFile = '';
  if (selectedCardElement) {
    selectedCardElement.classList.remove('card-selected');
    selectedCardElement = null;
  }
  renderNoSelectionPanel();
  if (isStandaloneMode) {
    setStandaloneSidebarOpen(false);
  }
}

async function selectPresentationFile(mdFile) {
  if (!selectedPresentationBase) return;
  const nextMdFile = String(mdFile || '').trim();
  if (!nextMdFile) return;
  selectedSidebarMdFile = nextMdFile;
  selectedPresentationKey = getCurrentSelectionKey();
  const selection = {
    ...selectedPresentationBase,
    md: nextMdFile
  };
  renderSelectedPresentationPanel(selectedPresentationBase);
  const details = await loadPresentationDetails(selection);
  if (selectedPresentationKey !== getCurrentSelectionKey()) return;
  renderSelectedPresentationPanel(selectedPresentationBase, details);
}

async function selectPresentation(pres, cardElement) {
  selectedPresentationBase = { ...pres };
  selectedSidebarMdFile = pres.md;
  selectedPresentationKey = getCurrentSelectionKey();
  if (selectedCardElement) {
    selectedCardElement.classList.remove('card-selected');
  }
  selectedCardElement = cardElement;
  selectedCardElement.classList.add('card-selected');

  renderSelectedPresentationPanel(pres);
  const details = await loadPresentationDetails({ ...pres, md: selectedSidebarMdFile });
  if (selectedPresentationKey !== getCurrentSelectionKey()) return;
  renderSelectedPresentationPanel(selectedPresentationBase, details);
}

function getPresentationActions(pres, details = null) {
  const options = [
    {
      label: '🖥️ ' + tr('Slideshow (Full Screen)'),
      action: () => openPrimaryPresentation(pres)
    },
    {
      label: '⚙️ ' + tr('Slideshow') + '...',
      action: () => openSlideshowOptionsLightbox(pres, details)
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
    const params = new URLSearchParams();
    params.set('p', mdFile);
    const lang = String(appConfig?.preferredPresentationLanguage || appConfig?.language || '').trim().toLowerCase();
    if (lang) {
      params.set('lang', lang);
    }
    window.open(`${url_prefix}/${slug}/handout?${params.toString()}`, '_blank');
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
