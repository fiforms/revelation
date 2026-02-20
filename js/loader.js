import yaml from 'js-yaml';
import convertSmartQuotes from './smart-quotes';

let style_path = '/css/';
const URL_ATTR_NAMES = new Set(['href', 'src', 'xlink:href', 'formaction', 'action', 'poster']);
const BLOCKED_TAGS = new Set(['script', 'object', 'embed', 'applet', 'base', 'meta']);
const NOTE_SEPARATOR_LEGACY = 'Note:';
const NOTE_SEPARATOR_CURRENT = ':note:';
const NOTE_VERSION_BREAKPOINT = [0, 2, 6];

function parseSemverTuple(version) {
  const raw = String(version || '').trim();
  const match = raw.match(/^v?(\d+)\.(\d+)\.(\d+)/i);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersionTuples(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return 0;
  for (let i = 0; i < 3; i += 1) {
    const av = Number(a[i] || 0);
    const bv = Number(b[i] || 0);
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}

export function usesNewNoteSeparator(metadata = {}) {
  const tuple = parseSemverTuple(metadata?.version);
  if (!tuple) return false;
  return compareVersionTuples(tuple, NOTE_VERSION_BREAKPOINT) > 0;
}

export function getNoteSeparator(metadata = {}) {
  return usesNewNoteSeparator(metadata) ? NOTE_SEPARATOR_CURRENT : NOTE_SEPARATOR_LEGACY;
}

function isDangerousURL(value) {
  const normalized = String(value || '')
    .replace(/[\u0000-\u001F\u007F\s]+/g, '')
    .toLowerCase();
  return (
    normalized.startsWith('javascript:') ||
    normalized.startsWith('vbscript:') ||
    normalized.startsWith('data:text/html') ||
    normalized.startsWith('data:application/javascript')
  );
}

function sanitizeHTMLFragment(html) {
  const template = document.createElement('template');
  template.innerHTML = String(html || '');
  const elements = template.content.querySelectorAll('*');

  for (const el of elements) {
    const tagName = el.tagName.toLowerCase();
    if (BLOCKED_TAGS.has(tagName)) {
      el.remove();
      continue;
    }

    const attrs = Array.from(el.attributes || []);
    for (const attr of attrs) {
      const name = attr.name.toLowerCase();
      const value = attr.value;

      if (name.startsWith('on') || name === 'srcdoc') {
        el.removeAttribute(attr.name);
        continue;
      }

      if (URL_ATTR_NAMES.has(name) && isDangerousURL(value)) {
        el.removeAttribute(attr.name);
        continue;
      }

      if (
        name === 'style' &&
        /expression\s*\(|url\s*\(\s*['"]?\s*javascript:|@import/i.test(String(value || ''))
      ) {
        el.removeAttribute(attr.name);
      }
    }

    if (tagName === 'a' && String(el.getAttribute('target') || '').toLowerCase() === '_blank') {
      const currentRel = String(el.getAttribute('rel') || '');
      const relSet = new Set(currentRel.split(/\s+/).filter(Boolean).map((part) => part.toLowerCase()));
      relSet.add('noopener');
      relSet.add('noreferrer');
      el.setAttribute('rel', Array.from(relSet).join(' '));
    }
  }

  return template.innerHTML;
}

export function sanitizeMarkdownEmbeddedHTML(markdown) {
  let source = String(markdown || '');

  // Strip active script blocks entirely.
  source = source.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '');

  // Remove inline event handlers and srcdoc.
  source = source.replace(/\son[a-z0-9_-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  source = source.replace(/\ssrcdoc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  // Remove dangerous URL-bearing attributes.
  source = source.replace(
    /\s(href|src|xlink:href|formaction|action|poster)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    (fullMatch, attrName, fullValue, dqValue, sqValue, bareValue) => {
      const rawValue = dqValue ?? sqValue ?? bareValue ?? '';
      if (isDangerousURL(rawValue)) {
        return '';
      }
      return ` ${attrName}=${fullValue}`;
    }
  );

  // Remove dangerous inline style payloads.
  source = source.replace(
    /\sstyle\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    (fullMatch, fullValue, dqValue, sqValue, bareValue) => {
      const rawValue = dqValue ?? sqValue ?? bareValue ?? '';
      if (/expression\s*\(|url\s*\(\s*['"]?\s*javascript:|@import/i.test(rawValue)) {
        return '';
      }
      return ` style=${fullValue}`;
    }
  );

  return source;
}

export function sanitizeRenderedHTML(html) {
  return sanitizeHTMLFragment(html);
}

export async function loadAndPreprocessMarkdown(deck,selectedFile = null) {
      const defaultFile = 'presentation.md';
      const urlParams = new URLSearchParams(window.location.search);
      const variant = (urlParams.get('variant') || '').trim().toLowerCase();
      const ccliFromUrl = (urlParams.get('ccli') || '').trim();
      const variantThemeMap = {
        lowerthirds: 'lowerthirds.css',
        confidencemonitor: 'confidencemonitor.css'
      };
      const variantExtraStylesheetMap = {
        notes: 'notes-teleprompter.css'
      };
      const suppressVisualElements = variant === 'lowerthirds' || variant === 'confidencemonitor';

      if (variant) {
        document.body.dataset.variant = variant;
      } else {
        delete document.body.dataset.variant;
      }

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

      // 🧠 Check for global offlineMarkdown
      if (typeof window.offlineMarkdown === 'string') {
        rawMarkdown = window.offlineMarkdown;
	style_path = "_resources/css/";
      } else {
        const customFile = sanitizeMarkdownFilename(urlParams.get('p'));

        const markdownFile = selectedFile || customFile || defaultFile;
        let response = await fetch(markdownFile);
        if (!response.ok) {
          console.warn(`Could not load ${markdownFile}, falling back to ${defaultFile}`);
          response = await fetch(defaultFile);
        }
        rawMarkdown = await response.text();
      }

      const macros = {};

      const { metadata, content } = extractFrontMatter(rawMarkdown);
      const contentWithBlankSlide = `${content}\n\n---\n\n`;
      const forceControls = urlParams.get('forceControls') === '1';
      const yamlScrollSpeed = Number.parseFloat(metadata.scrollspeed);
      window.RevelationRuntime = window.RevelationRuntime || {};
      if (Number.isFinite(yamlScrollSpeed) && yamlScrollSpeed > 0) {
        window.RevelationRuntime.notesScrollSpeed = yamlScrollSpeed;
      } else {
        delete window.RevelationRuntime.notesScrollSpeed;
      }

      // check for alternative versions, create a selector drop-down
      if (!selectedFile && metadata.alternatives && typeof metadata.alternatives === 'object') {
         const selectedLang = (urlParams.get('lang') || '').trim().toLowerCase();
         const matchedAlternative = selectedLang
           ? Object.entries(metadata.alternatives).find(([, langCode]) =>
               String(langCode || '').trim().toLowerCase() === selectedLang
             )
           : null;
         const matchedFile = matchedAlternative ? sanitizeMarkdownFilename(matchedAlternative[0]) : null;
         if (matchedFile) {
           return loadAndPreprocessMarkdown(deck, matchedFile);
         }
         createAlternativeSelector(deck, metadata.alternatives);
         document.title = "Waiting for Selection";
         return 1;
      }

      // Update document title and theme
      document.title = metadata.title || "Reveal.js Presentation";
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
        if (!existingVariantStyle) {
          document.head.appendChild(styleEl);
        }
      } else if (existingVariantStyle) {
        existingVariantStyle.remove();
      }

      if (metadata.macros && typeof metadata.macros === 'object') {
        Object.assign(macros, metadata.macros); // User-defined macros from front matter 
      }

      // Resolve preferred media version from URL (preferred) or localStorage fallback
      const mediaParam = (urlParams.get('media') || '').toLowerCase();
      if (mediaParam === 'high') {
        prefersHigh = true;
      } else if (mediaParam === 'low' || mediaParam === 'standard') {
        prefersHigh = false;
      } else if (!window.electronAPI) {
        const stored = localStorage.getItem('options_media-version');
        prefersHigh = stored === 'high';
      }

      if (!appConfig && window.electronAPI?.getAppConfig) {
        try {
          appConfig = await window.electronAPI.getAppConfig();
          window.AppConfig = appConfig;
        } catch {
          // Keep processing even if config is unavailable.
        }
      }

      if (ccliFromUrl) {
        appConfig = { ...(appConfig || {}), ccliLicenseNumber: ccliFromUrl };
      }

      // Load media index (if available) for high-bitrate availability checks
      try {
        let mediaBasePath = '../_media/';
        if (typeof window !== 'undefined' && window.mediaPath) {
          mediaBasePath = window.mediaPath.endsWith('/') ? window.mediaPath : window.mediaPath + '/';
        }
        const mediaIndexUrl = `${mediaBasePath}index.json`;
        const mediaIndexRes = await fetch(mediaIndexUrl, { cache: 'no-store' });
        if (mediaIndexRes.ok) {
          mediaIndex = await mediaIndexRes.json();
        }
      } catch (err) {
        console.warn('Media index not available:', err.message);
      }

      // Hydrate large_variant from media index when missing in front matter
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

      const partProcessedMarkdown = preprocessMarkdown(
        contentWithBlankSlide,
        macros,
        false,
        metadata.media,
        metadata.newSlideOnHeading,
        mediaIndex,
        prefersHigh,
        suppressVisualElements,
        appConfig
      );
      const processedMarkdown = metadata.convertSmartQuotes === false ? partProcessedMarkdown : convertSmartQuotes(partProcessedMarkdown);
      const sanitizedMarkdown = sanitizeMarkdownEmbeddedHTML(processedMarkdown);

      // Create a temporary element to convert markdown into HTML slides
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

      // Initialize Reveal.js
      const config = metadata.config || {};
      if (variant === 'notes') {
        config.showNotes = true;
      }
      if (forceControls) {
        config.controls = true;
        config.progress = true;
        config.slideNumber = true;
        config.showSlideNumber = 'all';
        config.autoSlide = false;
        config.autoSlideStoppable = false;
      }
      deck.initialize(config);
}

function createAlternativeSelector(deck, alternatives) {
    console.log('Showing Selector for Alternative Version');
    const selector = document.createElement('div');
    selector.style = 'position: fixed; top: 40%; left: 40%; background: rgba(0,0,0,0.85); color: white; padding: 1rem; border-radius: 8px; z-index: 9999; font-family: sans-serif;';
    selector.innerHTML = `<strong style="display:block;margin-bottom:0.5rem;">Select Version:</strong>`;

    for (const [file, label] of Object.entries(alternatives)) {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.style = 'display: block; width: 100%; margin: 0.25rem 0; background: #444; color: white; border: none; padding: 0.5rem; border-radius: 4px; cursor: pointer;';
      btn.onclick = async () => {
          document.body.classList.add('hidden');
          selector.remove();
          loadAndPreprocessMarkdown(deck, file);
      }
      selector.appendChild(btn);
    }
    document.body.appendChild(selector);
    document.body.classList.remove('hidden');
}


export function extractFrontMatter(md) {
  const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
  const match = md.match(FRONTMATTER_RE);
  if (!match) {
    return { metadata: {}, content: md };
  }

  const yamlText = match[1];
  const content = md.slice(match[0].length);

  try {
    const metadata = yaml.load(yamlText) || {};
    return { metadata, content };
  } catch (err) {
    console.error("⚠ Malformed YAML in presentation:", err.message);

    // Return SAFE metadata with a flag
    return {
      metadata: {
        title: "{malformed YAML}",
        description: err.message,
        _malformed: true
      },
      content
    };
  }
}

function runPluginMarkdownPreprocessors(md, context = {}) {
  if (typeof window === 'undefined' || !window.RevelationPlugins) {
    return md;
  }

  const plugins = Object.entries(window.RevelationPlugins)
    .map(([name, plugin]) => ({
      name,
      plugin,
      priority: Number.isFinite(plugin?.priority) ? plugin.priority : 100
    }))
    .sort((a, b) => a.priority - b.priority);

  let transformed = String(md ?? '');
  for (const { name, plugin } of plugins) {
    if (typeof plugin?.preprocessMarkdown !== 'function') {
      continue;
    }
    try {
      const next = plugin.preprocessMarkdown(transformed, context);
      if (typeof next === 'string') {
        transformed = next;
      } else if (next !== undefined && next !== null) {
        console.warn(`Plugin '${name}' preprocessMarkdown returned non-string value; ignoring.`);
      }
    } catch (err) {
      console.error(`Plugin '${name}' preprocessMarkdown failed:`, err);
    }
  }

  return transformed;
}

export function preprocessMarkdown(md, userMacros = {}, forHandout = false, media = {}, newSlideOnHeading = true, mediaIndex = null, preferHigh = null, suppressVisualElements = false, appConfig = null) {
  md = runPluginMarkdownPreprocessors(md, {
    forHandout,
    userMacros,
    media,
    newSlideOnHeading,
    mediaIndex,
    preferHigh,
    suppressVisualElements,
    appConfig,
    parseYAML: (text) => yaml.load(text)
  });

  const lines = md.split('\n');
  const processedLines = [];
  const attributions = [];
  const lastmacros = [];
  const thismacros = [];
  let aiSymbolRequested = false;

  const defaultMacros = {
    darkbg: `<!-- .slide: data-darkbg -->`,
    lightbg: `<!-- .slide: data-lightbg -->`,
    darktext: `<!-- .slide: data-darktext -->`,
    lighttext: `<!-- .slide: data-lighttext -->`,
    shiftright: `<!-- .slide: data-shiftright -->`,
    shiftleft: `<!-- .slide: data-shiftleft -->`,
    lowerthird: `<!-- .slide: data-lower-third -->`,
    upperthird: `<!-- .slide: data-upper-third -->`,
    info: `<!-- .slide: data-infoslide --><div class="info-head"></div><div class="info-body"></div>`,
    infofull: `<!-- .slide: data-infoslide data-infoslidefull --></div><div class="info-body info-bodyfull"></div>`,
    columnstart: `<div class="flexcontainer"><div class="first">`,
    columnbreak: `</div><div class="second">`,
    columnend: `</div></div>`,
    bgtint: `<!-- .slide: data-tint-color="$1" -->`,
    transition: `<!-- .slide: data-transition="$1" -->`,
    animate: `<!-- .slide: data-auto-animate -->`,
    autoslide: `<!-- .slide: data-autoslide="$1" -->`,
    audiostart: `<!-- .slide: data-background-audio-start="$1" -->`,
    audioloop: `<!-- .slide: data-background-audio-loop="$1" -->`,
    audiostop: `<!-- .slide: data-background-audio-stop -->`
  };

  const macros = { ...defaultMacros, ...userMacros };

  const magicImageHandlers = {}
  if (!forHandout) {
    magicImageHandlers.background = (src, modifier, attribution) => {
      const isVideo = /\.(webm|mp4|mov|m4v)$/i.test(src);
      const normalizedModifier = String(modifier || '').trim().toLowerCase();
      const shouldLoop = normalizedModifier !== 'noloop';

      const tag = isVideo
        ? `<!-- .slide: data-background-video="${src}"${shouldLoop ? ' data-background-video-loop' : ''} -->`
        : `<!-- .slide: data-background-image="${src}" -->`;
      if(normalizedModifier === 'sticky') {
        thismacros.push(tag);
        if(attribution) {
          thismacros.push(`{{attrib:${attribution}}}`);
        }
        lastmacros.length = 0;  // Sticky background resets previous macros
      }
      return tag;
    };

    magicImageHandlers.fit = (src) => {
      const isVideo = /\.(webm|mp4|mov|m4v)$/i.test(src);
      return isVideo
        ? `<video src="${src}" controls playsinline data-imagefit></video>`
        : `![](${src})<!-- .element data-imagefit -->`;
    };

    magicImageHandlers.youtube = (src, modifier, attribution) => {
      const match = src.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|watch\?v=))([\w-]+)/);
      const id = match ? match[1] : null;
      const widthHeight = modifier === 'fit' ? 'class="youtube-fit"' : 'class="youtube-iframe"';
      return id
        ? `<iframe ${widthHeight} src="https://www.youtube.com/embed/${id}?autoplay=0&mute=1&loop=1&playlist=${id}" frameborder="0" allowfullscreen></iframe>`
        : `<!-- Invalid YouTube URL: ${src} -->`;
    };
  }

  magicImageHandlers.caption = (src, modifier, attribution) => {
     return `
<figure class="captioned-image">
  <img src="${src}" alt="">
  <figcaption>${modifier}</figcaption>
</figure>
  `.trim();
    };

  const totalLines = lines.length;
  var index = -1;
  var blankslide = true;
  let insideCodeBlock = false;
  let currentFence = '';
  let columnPipeState = 0; // 0=start, 1=break, 2=end
  const mediaIndexMap = mediaIndex && typeof mediaIndex === 'object' ? mediaIndex : null;
  const fallbackConfig = (typeof window !== 'undefined' && window.AppConfig) ? window.AppConfig : null;
  const ccliLicenseNumber = String(appConfig?.ccliLicenseNumber || fallbackConfig?.ccliLicenseNumber || '{Please set in settings}').trim();
  const replaceSettingMacros = (value) => {
    if (!ccliLicenseNumber) return value;
    return String(value).replace(/:ccli:/gi, ccliLicenseNumber);
  };
  const prefersHigh = typeof preferHigh === 'boolean'
    ? preferHigh
    : (localStorage.getItem('options_media-version') === 'high');
  const isHighVariantAvailable = (item) => {
    if (!item?.large_variant?.filename) return false;
    if (!mediaIndexMap) return false;
    const indexItem = mediaIndexMap[item.filename];
    return indexItem?.large_variant_local === true;
  };
  const resolveMediaAlias = (input) => {
    if (!input || !media) {
      return input;
    }
    const aliasMatch = input.match(/^media:([a-zA-Z0-9_-]+)$/);
    if (!aliasMatch) {
      return input;
    }
    const alias = aliasMatch[1];
    const item = media[alias];
    if (!item?.filename) {
      return input;
    }

    let resolvedFile = item.filename;
    if (prefersHigh && isHighVariantAvailable(item)) {
      resolvedFile = item.large_variant.filename;
    }

    let basePath = '../_media/';
    if (typeof window !== 'undefined' && window.mediaPath) {
      basePath = window.mediaPath.endsWith('/') ? window.mediaPath : window.mediaPath + '/';
    }

    return `${basePath}${resolvedFile}`;
  };

  const pad2 = (value) => String(Math.max(0, Number.parseInt(value, 10) || 0)).padStart(2, '0');

  const formatCountdownDisplay = (seconds) => {
    const total = Math.max(0, Number.parseInt(seconds, 10) || 0);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    if (hours > 0) {
      return `${pad2(hours)}:${pad2(minutes)}:${pad2(secs)}`;
    }
    return `${pad2(minutes)}:${pad2(secs)}`;
  };

  const buildCountdownMarkup = (params) => {
    const mode = (params[0] || '').trim().toLowerCase();

    if (mode === 'from') {
      const n1 = Number.parseInt(params[1], 10);
      const n2 = Number.parseInt(params[2], 10);
      const n3 = Number.parseInt(params[3], 10);
      const hasThreeParts = params.length >= 4 && Number.isFinite(n3);

      if (hasThreeParts) {
        const hours = Math.max(0, n1 || 0);
        const minutes = Math.max(0, n2 || 0);
        const secs = Math.max(0, n3 || 0);
        const totalSeconds = (hours * 3600) + (minutes * 60) + secs;
        return `<h2 class="countdown" data-countdown-mode="from" data-countdown-seconds="${totalSeconds}">${formatCountdownDisplay(totalSeconds)}</h2>`;
      }

      if (Number.isFinite(n1) && Number.isFinite(n2)) {
        const minutes = Math.max(0, n1);
        const secs = Math.max(0, n2);
        const totalSeconds = (minutes * 60) + secs;
        return `<h2 class="countdown" data-countdown-mode="from" data-countdown-seconds="${totalSeconds}">${formatCountdownDisplay(totalSeconds)}</h2>`;
      }

      return '';
    }

    if (mode === 'to') {
      const hours = Number.parseInt(params[1], 10);
      const minutes = Number.parseInt(params[2], 10);
      if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
        return '';
      }
      const normalizedHours = ((hours % 24) + 24) % 24;
      const normalizedMinutes = ((minutes % 60) + 60) % 60;
      return `<h2 class="countdown" data-countdown-mode="to" data-countdown-hour="${normalizedHours}" data-countdown-minute="${normalizedMinutes}">${pad2(normalizedHours)}:${pad2(normalizedMinutes)}</h2>`;
    }

    return '';
  };

  const toStackAttrsMarker = (attributeString) => {
    const stackAttrs = encodeURIComponent(attributeString);
    return `<div class="revelation-stack-attrs" data-stack-attrs="${stackAttrs}" hidden></div>`;
  };

  const extractSlideTransitionValue = (value) => {
    const match = value.match(/<!--\s*\.slide:\s*[^>]*\bdata-transition="([^"]+)"[^>]*-->/i);
    return match ? match[1] : null;
  };

  const convertStackDirectiveLine = (value) => {
    const stackCommentMatch = value.match(/^\s*<!--\s*\.stack:\s*(\S.+?)\s*-->\s*$/i);
    if (!stackCommentMatch) {
      return value;
    }
    return toStackAttrsMarker(stackCommentMatch[1]);
  };

  let previousSeparatorType = null; // null | 'horizontal' | 'vertical'
  let pendingAutoStackTransition = null;

  for (var line of lines) {
    index++;

  const fenceMatch = line.match(/^(`{3,})(.*)$/);  // Matches ``` or more

    if (fenceMatch) {
      const fence = fenceMatch[1];
      
      if (!insideCodeBlock) {
        insideCodeBlock = true;
        currentFence = fence;
      } else if (fence === currentFence) {
        insideCodeBlock = false;
        currentFence = '';
      }

      processedLines.push(line);
      continue;
    }

    if (insideCodeBlock) {
      processedLines.push(line);
      continue;  // 🛑 Skip transformation inside code blocks
    }

    line = replaceSettingMacros(line);

    const stackCommentMatch = line.match(/^\s*<!--\s*\.stack:\s*(\S.+?)\s*-->\s*$/i);
    if (stackCommentMatch) {
      processedLines.push(toStackAttrsMarker(stackCommentMatch[1]));
      continue;
    }

    if (suppressVisualElements) {
      const trimmedLine = line.trim();
      const isNoteSeparator =
        trimmedLine.toLowerCase() === NOTE_SEPARATOR_CURRENT ||
        trimmedLine.toLowerCase() === NOTE_SEPARATOR_LEGACY.toLowerCase();
      const isMacroUse = /^\s*\{\{[^}]+\}\}\s*$/.test(line);
      const isInlineMacro = /^\s*:[A-Za-z0-9_]+(?::.*)?:\s*$/.test(line);
      const isAttribLine = /^\s*:ATTRIB:.*$/i.test(line) || /^\s*:AI:\s*$/i.test(line);
      const hasMarkdownImage = /!\[[^\]]*]\([^)]*\)/.test(line);
      const hasHtmlVisual = /<\s*(img|video|iframe|figure)\b/i.test(line);
      const hasBackgroundData = /data-background-(image|video|audio|audio-start|audio-loop|audio-stop)/i.test(line);

      if (!isNoteSeparator && (isMacroUse || isInlineMacro || isAttribLine || hasMarkdownImage || hasHtmlVisual || hasBackgroundData)) {
        continue;
      }
    }

    if(line.match(/^\{\{\}\}$/)) {
        lastmacros.length = 0; // Reset the list of saved macros
	      continue;
    }

    if (line.trim() === '||') {
      const columnKeys = ['columnstart', 'columnbreak', 'columnend'];
      const key = columnKeys[columnPipeState];
      const template = macros[key];
      if (template) {
        const expanded = template.split('\n');
        for (const expandedLine of expanded) {
          processedLines.push(expandedLine);
        }
      } else {
        console.log('Markdown Column Macro Not Found: ' + key);
      }
      columnPipeState = (columnPipeState + 1) % columnKeys.length;
      continue;
    }

    const mediaAliasMatch = line.match(/[\(\"]media:([a-zA-Z0-9_-]+)[\)\"]/);
    let lastattribution = null;
    if (mediaAliasMatch && forHandout) {
      // In handout mode, skip media lines
      continue;
    }
    if (mediaAliasMatch && media) {
      const alias = mediaAliasMatch[1];
      const item = media[alias];
      if (item?.filename) {
        let resolvedFile = item.filename;

        // 🔥 use large variant if config says so and it is available
        if (prefersHigh && isHighVariantAvailable(item)) {
          resolvedFile = item.large_variant.filename;
        }

        // Compute the base path dynamically
        let basePath = '../_media/';
        if (typeof window !== 'undefined' && window.mediaPath) {
          basePath = window.mediaPath.endsWith('/') ? window.mediaPath : window.mediaPath + '/';
        }

        const resolvedSrc = `${basePath}${resolvedFile}`;
        line = line.replace(/\((media:[a-zA-Z0-9_-]+)\)/, `(${resolvedSrc})`);
        line = line.replace(/\"(media:[a-zA-Z0-9_-]+)\"/, `"${resolvedSrc}"`);
        if (item.attribution) {
          lastattribution = `© ${item.attribution} (${item.license})`;
          attributions.push(lastattribution); // Add media attribution
        }
      }
    }

    const magicImageMatch = line.match(/^!\[([a-zA-Z0-9_-]+)(?::([a-zA-Z0-9_ -]+))?\]\((.+?)\)$/);
    if (magicImageMatch) {
      const keyword = magicImageMatch[1].toLowerCase();
      const modifier = magicImageMatch[2]?.trim() || '';
      const src = magicImageMatch[3];
      if (forHandout && keyword === 'background' && modifier === 'sticky') {
        continue;
      }
      const handler = magicImageHandlers[keyword];
      if (handler) {
        processedLines.push(handler(src, modifier, lastattribution));
        continue;
      }
    }

    const inlineMacroMatch = line.match(/^:([A-Za-z0-9_]+)(?::(.*))?:\s*$/);
    if (inlineMacroMatch) {
      const key = inlineMacroMatch[1].trim().toLowerCase();
      const paramString = inlineMacroMatch[2];
      const params = key === 'bgtint'
        ? [paramString ?? '']
        : (paramString ? paramString.split(':') : []);
      if (key !== 'attrib' && key !== 'ai' && !key.startsWith('column')) {
        if (key === 'countdown') {
          const countdownMarkup = buildCountdownMarkup(params);
          if (countdownMarkup) {
            processedLines.push(countdownMarkup);
            continue;
          }
          console.log('Markdown Countdown Inline Macro Not Found or Invalid: ' + paramString);
        }
        if (key === 'animate') {
          const mode = params[0]?.trim().toLowerCase() || '';
          if (!mode) {
            processedLines.push('<!-- .slide: data-auto-animate -->');
            continue;
          }
          if (mode === 'restart') {
            processedLines.push('<!-- .slide: data-auto-animate-restart -->');
            continue;
          }
          console.log('Markdown Animate Inline Macro Not Found: ' + paramString);
        }
        if (key === 'audio') {
          const command = params[0]?.toLowerCase() || '';
          const rawSrc = params[1] || '';
          const src = resolveMediaAlias(rawSrc);
          let audioLine = '';

          if (command === 'stop') {
            audioLine = `<!-- .slide: data-background-audio-stop -->`;
          } else if (command === 'play' && src) {
            audioLine = `<!-- .slide: data-background-audio-start="${src}" -->`;
          } else if ((command === 'playloop' || command === 'loop') && src) {
            audioLine = `<!-- .slide: data-background-audio-loop="${src}" -->`;
          } else {
            console.log('Markdown Audio Inline Macro Not Found or Missing File: ' + paramString);
          }

          if (audioLine) {
            processedLines.push(audioLine);
            continue;
          }
        }

        const template = macros[key];
        if (template) {
          const expanded = template.replace(/\$(\d+)/g, (_, n) => resolveMediaAlias(params[+n - 1] ?? ''));
          const mlines = expanded.split('\n');
          for (const mline of mlines) {
            const normalizedLine = convertStackDirectiveLine(mline);
            const attribMatch = normalizedLine.match(/^\{\{attrib:(.*)}}\s*$/i);
            if (attribMatch) {
              attributions.push(attribMatch[1]);
              continue;
            }
            const transitionValue = extractSlideTransitionValue(normalizedLine);
            if (transitionValue) {
              pendingAutoStackTransition = transitionValue;
            }
            processedLines.push(normalizedLine);
          }
          continue;
        } else {
          console.log('Markdown Inline Macro Not Found: ' + key);
        }
      }
    }

    const macroUseMatch = line.match(/^\{\{([A-Za-z0-9_]+)(?::([^}]+))?\}\}$/);

    if (macroUseMatch) {
      const key = macroUseMatch[1].trim();
      const paramString = macroUseMatch[2];
      const params = key.toLowerCase() === 'bgtint'
        ? [paramString ?? '']
        : (paramString ? paramString.split(':') : []);
      if (key.toLowerCase() === 'transition') {
        const transitionValue = params[0]?.trim() || '';
        if (transitionValue) {
          const transitionLine = `<!-- .slide: data-transition="${transitionValue}" -->`;
          thismacros.push(transitionLine);
          processedLines.push(transitionLine);
          pendingAutoStackTransition = transitionValue;
          lastmacros.length = 0;
          continue;
        }
        console.log('Markdown Transition Macro Not Found: ' + paramString);
      }
      if (key.toLowerCase() === 'animate') {
        const mode = params[0]?.trim().toLowerCase() || '';
        const animateLine = !mode
          ? '<!-- .slide: data-auto-animate -->'
          : (mode === 'restart' ? '<!-- .slide: data-auto-animate-restart -->' : '');
        if (animateLine) {
          thismacros.push(animateLine);
          processedLines.push(animateLine);
          lastmacros.length = 0;
          continue;
        }
        console.log('Markdown Animate Macro Not Found: ' + paramString);
      }
      if (key === 'audio') {
        const command = params[0]?.toLowerCase() || '';
        const rawSrc = params[1] || '';
        const src = resolveMediaAlias(rawSrc);
        let audioLine = '';

        if (command === 'stop') {
          audioLine = `<!-- .slide: data-background-audio-stop -->`;
        } else if (command === 'play' && src) {
          audioLine = `<!-- .slide: data-background-audio-start="${src}" -->`;
        } else if ((command === 'playloop' || command === 'loop') && src) {
          audioLine = `<!-- .slide: data-background-audio-loop="${src}" -->`;
        } else {
          console.log('Markdown Audio Macro Not Found or Missing File: ' + paramString);
        }

        if (audioLine) {
          if (command === 'stop') {
            processedLines.push(audioLine);
          } else {
            thismacros.push(audioLine);
            processedLines.push(audioLine);
            lastmacros.length = 0;
          }
          continue;
        }
      }
      const template = macros[key];
      if (template) {
        // Replace $1, $2, ... with provided params
        let expanded = template.replace(/\$(\d+)/g, (_, n) => resolveMediaAlias(params[+n - 1] ?? ''));
        const mlines = expanded.split('\n');
        for (const mline of mlines) {
          const normalizedLine = convertStackDirectiveLine(mline);
          thismacros.push(normalizedLine);
          const attribMatch = normalizedLine.match(/^\{\{attrib:(.*)}}\s*$/i);
          if (attribMatch) {
            attributions.push(attribMatch[1]);
            continue;
          }
          const transitionValue = extractSlideTransitionValue(normalizedLine);
          if (transitionValue) {
            pendingAutoStackTransition = transitionValue;
          }
          processedLines.push(normalizedLine);
        }
        lastmacros.length = 0;
        continue;
      } else {
        console.log('Markdown Macro Not Found: ' + key);
      }
    }

    // Sticky attribution: persists until macros reset
    const stickyAttribMatch = line.match(/^\{{attrib:(.*)}}\s*$/i);
    if (stickyAttribMatch) {
      const attribText = stickyAttribMatch[1].replace("(c)","©");
      thismacros.push(`{{attrib:${attribText}}}`);
      attributions.push(attribText);
      continue;
    }

    // Sticky AI tag: persists until macros reset
    const stickyAiMatch = line.match(/^{{ai}}\s*$/i);
    if (stickyAiMatch) {
      if (!forHandout) {
        aiSymbolRequested = true;
        thismacros.push('{{ai}}');
      }
      continue;
    }

    // Check for attributions and load them into the attributions array
    const attribMatch = line.match(/^\:ATTRIB\:(.*)$/i);
    if (attribMatch) {
      attributions.push(attribMatch[1].replace("*(c)","©"));
      continue;
    }

    const aiSymbolMatch = line.match(/^:AI:\s*$/i);
    if (aiSymbolMatch) {
      if (!forHandout) {
        aiSymbolRequested = true;
      }
      continue;
    }

    var autoSlide = false;
    if(newSlideOnHeading && line.match(/^#{1,3} (?!#)/) && !blankslide) {
        // Always insert a slide break before a heading
	      autoSlide = true;
    }
    if (line.trim() !== '' && !line.trim().match(/^<!--.*?-->$/)) {
      blankslide = false;
    }

    // Inject saved macros and attribution HTML before slide break
    if (autoSlide || line === '---' || line === '***' || line.match(/^[Nn][Oo][Tt][Ee]\:/) || index >= lines.length - 1) {
      var blankslide = !autoSlide;
      const breakType = autoSlide
        ? (/^###\s*/.test(line) ? 'vertical' : 'horizontal')
        : (line === '---' ? 'vertical' : (line === '***' ? 'horizontal' : null));
      if (columnPipeState !== 0) {
        console.warn('Unclosed column section before slide break.');
        columnPipeState = 0;
      }
      if(thismacros.length > 0) {
        lastmacros.length = 0;
        lastmacros.push(...thismacros);
      }
      else {
        for (const val of lastmacros) {
          const attribMatch = val.match(/^\{\{attrib:(.*)}}\s*$/i);
          if (attribMatch) {
            attributions.push(attribMatch[1]);
            continue;
          }
          const aiStickyMatch = val.match(/^{{ai}}\s*$/i);
          if (aiStickyMatch) {
            if (!forHandout) {
              aiSymbolRequested = true;
            }
            continue;
          }
          const transitionValue = extractSlideTransitionValue(val);
          if (transitionValue) {
            pendingAutoStackTransition = transitionValue;
          }
          processedLines.push(val);
        }
        processedLines.push('');
      }
      thismacros.length = 0;

      if (attributions.length > 0) {

        processedLines.push('<div class="slide-attribution">');
        for (const attrib of attributions) {
          processedLines.push(`<div class="attribution">${attrib}</div>`);
        }
        processedLines.push('</div>');
        processedLines.push('');
        attributions.length = 0; // Clear the array
      }

      if (aiSymbolRequested) {
        processedLines.push('<div class="slide-ai-symbol">');
        processedLines.push('</div>');
        processedLines.push('');
        aiSymbolRequested = false;
      }

      if (
        breakType === 'vertical' &&
        previousSeparatorType !== 'vertical' &&
        pendingAutoStackTransition
      ) {
        processedLines.push(toStackAttrsMarker(`data-transition="${pendingAutoStackTransition}"`));
        processedLines.push('');
      }

      if(autoSlide) {
        if (/^###\s*/.test(line)) {
          processedLines.push('---');
          processedLines.push('');
        }
        else {
          processedLines.push('***');
          processedLines.push('');
        }
      }
      processedLines.push(line); // Preserve the slide break itself
      if (breakType) {
        previousSeparatorType = breakType;
      }
      pendingAutoStackTransition = null;
      continue;
    }

    if (line.endsWith('++')) {
      processedLines.push(
        line.replace(/\s*\+\+$/, '') + ' <!-- .element: class="fragment" -->'
      );
    } else {
      const transitionValue = extractSlideTransitionValue(line);
      if (transitionValue) {
        pendingAutoStackTransition = transitionValue;
      }
      processedLines.push(line);
    }
  }
  return processedLines.join('\n');
}

function sanitizeMarkdownFilename(filename) {
  const mdPattern = /^[a-zA-Z0-9_.-]+\.md$/;

  if (!filename || !mdPattern.test(filename)) {
    console.warn(`Blocked invalid markdown filename: ${filename}`);
    return null;
  }

  return filename;
}
