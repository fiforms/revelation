/**
 * Presentation bootstrap architecture
 *
 * This module is the runtime/bootstrap entry point for slideshow rendering in
 * the browser. It sits above the compiler and is responsible for environment-
 * specific work that should not live in the pure-ish compiler layer.
 *
 * Responsibilities
 * - choose which markdown file to load
 * - read URL params / app config / runtime preferences
 * - resolve variant-specific runtime behavior and styles
 * - load metadata-dependent resources such as the media index
 * - invoke the compiler entry points from `./compiler/markdown-compiler.js`
 * - inject the compiled markdown into the DOM for Reveal
 * - initialize Reveal with the final runtime config
 *
 * Compiler-related logic remains below this layer:
 * - source parsing / front matter: `./compiler/markdown-compiler.js`
 * - sanitization: `./compiler/html-sanitization.js`
 * - DOM-only helper widgets: `./loader-dom.js`
 */
import convertSmartQuotes from './smart-quotes';
import { preprocessMarkdown, extractFrontMatter } from './compiler/markdown-compiler.js';
import { sanitizeMarkdownEmbeddedHTML } from './compiler/html-sanitization.js';
import {
  getStorageItemSafe,
  getNoteSeparator,
  sanitizeMarkdownFilename,
  NOTE_SEPARATOR_CURRENT
} from './compiler/compiler-utils.js';
import { ensureHiddenSlidePreviewStyles, createAlternativeSelector } from './loader-dom.js';

let style_path = '/css/';

/**
 * Loads a presentation source file, compiles it, injects the result into the
 * Reveal markdown container, and initializes the deck with runtime config.
 */
export async function loadAndPreprocessMarkdown(deck, selectedFile = null) {
  // Resolve the runtime asset base; hosted builds use packaged resources instead of root-relative CSS.
  style_path = window.__revelationHostedRoute ? '_resources/css/' : '/css/';
  const defaultFile = 'presentation.md';

  // Read URL-level runtime switches such as `?variant=notes` or `?ccli=123456`.
  const urlParams = new URLSearchParams(window.location.search);
  const variant = (urlParams.get('variant') || '').trim().toLowerCase();
  const forceNoTransitions = variant === 'lowerthirds';
  const ccliFromUrl = (urlParams.get('ccli') || '').trim();
  const variantThemeMap = {
    lowerthirds: 'lowerthirds.css',
    confidencemonitor: 'confidencemonitor.css'
  };
  const variantExtraStylesheetMap = {
    notes: 'notes-teleprompter.css'
  };
  const suppressVisualElements = variant === 'lowerthirds' || variant === 'confidencemonitor';

  // Stamp the active variant onto the DOM so variant-specific CSS can react, e.g. notes or lower-thirds mode.
  if (variant) {
    document.body.dataset.variant = variant;
  } else {
    delete document.body.dataset.variant;
  }

  // Apply runtime-only variant tweaks that are not part of markdown compilation, e.g. lower-thirds chroma key color.
  if (variant === 'lowerthirds') {
    let chromaKeyColor = '#00ff00';
    if (window.AppConfig?.pipColor) {
      chromaKeyColor = window.AppConfig.pipColor;
    } else if (window.electronAPI?.getAppConfig) {
      try {
        const cfg = await window.electronAPI.getAppConfig();
        if (cfg?.pipColor) chromaKeyColor = cfg.pipColor;
      } catch {
        // Keep default chroma key color.
      }
    }
    document.documentElement.style.setProperty('--chroma-key-color', chromaKeyColor);
  }

  let rawMarkdown;
  let mediaIndex = null;
  let prefersHigh = false;
  let appConfig = window.AppConfig || null;

  // Load markdown from an injected offline payload or fetch the requested `.md` file from disk/server.
  if (typeof window.offlineMarkdown === 'string') {
    rawMarkdown = window.offlineMarkdown;
    style_path = '_resources/css/';
  } else {
    const sanitizedSelected = sanitizeMarkdownFilename(selectedFile);
    const customFile = sanitizeMarkdownFilename(urlParams.get('p'));
    const markdownFile = sanitizedSelected || customFile || defaultFile;
    let response = await fetch(markdownFile);
    if (!response.ok) {
      console.warn(`Could not load ${markdownFile}, falling back to ${defaultFile}`);
      response = await fetch(defaultFile);
    }
    rawMarkdown = await response.text();
  }

  const macros = {};

  // Normalize newlines and split front matter so metadata drives both compilation and runtime behavior.
  const normalizedMarkdown = String(rawMarkdown ?? '').replace(/\r\n?/g, '\n');
  const { metadata, content } = extractFrontMatter(normalizedMarkdown);
  const contentWithBlankSlide = `${content}\n\n---\n\n`;
  const forceControls = urlParams.get('forceControls') === '1';
  const yamlScrollSpeed = Number.parseFloat(metadata.scrollspeed);

  // Publish runtime-only values that other views consume, e.g. teleprompter notes scroll speed.
  window.RevelationRuntime = window.RevelationRuntime || {};
  if (Number.isFinite(yamlScrollSpeed) && yamlScrollSpeed > 0) {
    window.RevelationRuntime.notesScrollSpeed = yamlScrollSpeed;
  } else {
    delete window.RevelationRuntime.notesScrollSpeed;
  }

  const isExportMode = urlParams.get('exportMode') === '1';

  // Resolve alternate language/version decks, e.g. `presentation_es.md` selected by `?lang=es`.
  if (!selectedFile && metadata.alternatives && typeof metadata.alternatives === 'object') {
    const alternativeEntries = Object.entries(metadata.alternatives)
      .map(([candidateFile, langCode]) => ({
        file: sanitizeMarkdownFilename(candidateFile),
        langCode: String(langCode || '').trim().toLowerCase(),
        rawKey: String(candidateFile || '').trim().toLowerCase()
      }))
      .filter((entry) => entry.file && entry.rawKey !== 'self' && entry.langCode !== 'hidden');
    const selectedLang = (urlParams.get('lang') || '').trim().toLowerCase();
    const matchedAlternative = selectedLang
      ? alternativeEntries.find((entry) => entry.langCode === selectedLang)
      : null;
    const matchedFile = matchedAlternative ? matchedAlternative.file : null;
    if (matchedFile) {
      return loadAndPreprocessMarkdown(deck, matchedFile);
    }
    if (!selectedLang && alternativeEntries.length && !isExportMode) {
      createAlternativeSelector({
        alternatives: Object.fromEntries(alternativeEntries.map((entry) => [entry.file, entry.langCode])),
        sanitizeMarkdownFilename,
        onSelect: (file) => loadAndPreprocessMarkdown(deck, file)
      });
      document.title = 'Waiting for Selection';
      return 1;
    }
  }

  // Reflect front matter into the page shell, e.g. title plus theme stylesheet selection.
  document.title = metadata.title || 'Reveal.js Presentation';
  const selectedTheme = variantThemeMap[variant] || metadata.theme;
  if (selectedTheme) {
    document.getElementById('theme-stylesheet').href = style_path + selectedTheme;
  }
  if (metadata.stylesheet) {
    const styleEl = document.createElement('link');
    styleEl.rel = 'stylesheet';
    styleEl.href = metadata.stylesheet;
    document.head.appendChild(styleEl);
  }

  const variantExtraStylesheet = variantExtraStylesheetMap[variant];
  const existingVariantStyle = document.getElementById('variant-extra-stylesheet');
  if (variantExtraStylesheet) {
    const styleEl = existingVariantStyle || document.createElement('link');
    styleEl.id = 'variant-extra-stylesheet';
    styleEl.rel = 'stylesheet';
    styleEl.href = style_path + variantExtraStylesheet;
    if (!existingVariantStyle) document.head.appendChild(styleEl);
  } else if (existingVariantStyle) {
    existingVariantStyle.remove();
  }

  // Merge user-defined YAML macros into the compiler macro table before compilation starts.
  if (metadata.macros && typeof metadata.macros === 'object') {
    Object.assign(macros, metadata.macros);
  }

  // Resolve media quality preference from URL first, then local storage for non-Electron browser usage.
  const mediaParam = (urlParams.get('media') || '').toLowerCase();
  if (mediaParam === 'high') {
    prefersHigh = true;
  } else if (mediaParam === 'low' || mediaParam === 'standard') {
    prefersHigh = false;
  } else if (!window.electronAPI) {
    prefersHigh = getStorageItemSafe('options_media-version') === 'high';
  }

  // Hydrate application config lazily so runtime options like PIP color or CCLI can affect rendering.
  if (!appConfig && window.electronAPI?.getAppConfig) {
    try {
      appConfig = await window.electronAPI.getAppConfig();
      window.AppConfig = appConfig;
    } catch {
      // Keep processing even if config is unavailable.
    }
  }

  // Allow URL overrides for session-specific values, e.g. a one-off CCLI license number.
  if (ccliFromUrl) {
    appConfig = { ...(appConfig || {}), ccliLicenseNumber: ccliFromUrl };
  }

  // Load the media index when available so aliases can prefer a local high-bitrate variant.
  try {
    let mediaBasePath = '../_media/';
    if (typeof window !== 'undefined' && window.mediaPath) {
      mediaBasePath = window.mediaPath.endsWith('/') ? window.mediaPath : `${window.mediaPath}/`;
    }
    const mediaIndexRes = await fetch(`${mediaBasePath}index.json`, { cache: 'no-store' });
    if (mediaIndexRes.ok) {
      mediaIndex = await mediaIndexRes.json();
    }
  } catch (err) {
    console.warn('Media index not available:', err.message);
  }

  // Backfill front matter media entries with index metadata, e.g. late-discovered `large_variant` info.
  if (mediaIndex && metadata.media && typeof metadata.media === 'object') {
    for (const key of Object.keys(metadata.media)) {
      const entry = metadata.media[key];
      if (!entry?.filename) continue;
      const indexItem = mediaIndex[entry.filename];
      if (!indexItem) continue;
      if (!entry.large_variant && indexItem.large_variant) {
        entry.large_variant = { ...indexItem.large_variant };
      }
      if (entry.large_variant && entry.large_variant_local === undefined && indexItem.large_variant_local !== undefined) {
        entry.large_variant_local = indexItem.large_variant_local;
      }
    }
  }

  // Compile REVELation markdown into Reveal-ready markdown with the current runtime/compiler options.
  const partProcessedMarkdown = preprocessMarkdown(
    contentWithBlankSlide,
    macros,
    false,
    metadata.media,
    metadata.newSlideOnHeading,
    mediaIndex,
    prefersHigh,
    suppressVisualElements,
    appConfig,
    forceControls
  );
  if (forceControls) {
    ensureHiddenSlidePreviewStyles();
  }

  // Apply final text-level post-processing, e.g. smart quotes unless the deck opted out in front matter.
  const processedMarkdown = metadata.convertSmartQuotes === false ? partProcessedMarkdown : convertSmartQuotes(partProcessedMarkdown);

  // Remove transitions for variants that need hard cuts only, such as lower-thirds video output.
  const transitionSafeMarkdown = forceNoTransitions
    ? processedMarkdown.replace(/\sdata-transition="[^"]*"/gi, '').replace(/\sdata-transition-speed="[^"]*"/gi, '')
    : processedMarkdown;

  // Sanitize embedded HTML before handing the markdown off to Reveal's markdown plugin.
  const sanitizedMarkdown = sanitizeMarkdownEmbeddedHTML(transitionSafeMarkdown);

  // Inject the compiled markdown into Reveal's expected `<section data-markdown>` container.
  const section = document.getElementById('markdown-container');
  section.setAttribute('data-markdown', '');
  section.setAttribute('data-separator', '^\n\\*\\*\\*\n$');
  section.setAttribute('data-separator-vertical', '^\n---\n$');
  const noteSeparator = getNoteSeparator(metadata);
  section.setAttribute('data-separator-notes', noteSeparator === NOTE_SEPARATOR_CURRENT ? '^:note:$' : '^Note:$');
  const markdownTemplate = document.createElement('textarea');
  markdownTemplate.setAttribute('data-template', '');
  markdownTemplate.textContent = sanitizedMarkdown;
  section.replaceChildren(markdownTemplate);

  // Build the final Reveal config from front matter plus runtime flags like notes mode or forced controls.
  const config = metadata.config || {};
  if (urlParams.has('remoteMultiplexId')) {
    config.scrollActivationWidth = null;
  }
  if (Object.prototype.hasOwnProperty.call(config, 'margin')) {
    const parsedMargin = Number(config.margin);
    if (Number.isFinite(parsedMargin) && parsedMargin < 0.002) {
      config.margin = 0.002;
    }
  }
  if (variant === 'notes') {
    config.showNotes = true;
    config.controls = true;
  }
  if (forceControls) {
    config.controls = true;
    config.progress = true;
    config.slideNumber = true;
    config.showSlideNumber = 'all';
    config.autoSlide = false;
    config.autoSlideStoppable = false;
  }
  if (forceNoTransitions) {
    config.transition = 'none';
    config.backgroundTransition = 'none';
  }

  // After Reveal applies <!-- .element: --> attributes, lift data-parentfragment
  // values onto the nearest block-level parent (<li> or <p>) so the whole item
  // or paragraph animates as a fragment rather than just the inner inline element.
  deck.on('ready', () => {
    document.querySelectorAll('[data-parentfragment]').forEach(el => {
      const parent = el.closest('li, p');
      if (!parent) return;
      const classes = (el.getAttribute('data-parentfragment') || '').split(/\s+/).filter(Boolean);
      if (classes.length) parent.classList.add(...classes);
      el.removeAttribute('data-parentfragment');
    });
  });

  // Hand off to Reveal after all markdown, DOM, and runtime config preparation is complete.
  deck.initialize(config);
}
