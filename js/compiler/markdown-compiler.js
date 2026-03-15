/**
 * Markdown compiler architecture
 *
 * This module is the compiler entry point for REVELation presentation markdown.
 * It consumes raw markdown plus compiler options and produces the markdown that
 * Reveal's markdown plugin will render.
 *
 * High-level pipeline
 * 1. `extractFrontMatter()` peels YAML metadata off the top of the document.
 * 2. `runPluginMarkdownPreprocessors()` lets plugins perform source-to-source
 *    markdown transforms before the built-in compiler runs.
 * 3. `preprocessMarkdown()` scans the markdown line-by-line and delegates:
 *    - syntax recognition for macros/directives to `markdown-line-parsers.js`
 *    - media/image recognition to `media-line-parsers.js`
 *    - slide-level state, sticky behavior, and final output assembly to
 *      `slide-compiler.js`
 * 4. Sanitization helpers live in `html-sanitization.js` and are re-exported
 *    here because callers typically treat them as compiler-adjacent behavior.
 *
 * Related modules
 * - `slide-compiler.js`: stateful slide assembly and slide-boundary logic
 * - `markdown-line-parsers.js`: macro/directive recognition -> compiler ops
 * - `media-line-parsers.js`: media/image recognition -> compiler ops
 * - `presentation-segments.js`: fence-aware slide/note segmentation utilities
 * - `compiler-utils.js`: note separator, storage, and filename utilities
 * - `html-sanitization.js`: markdown/rendered HTML sanitization helpers
 *
 * Runtime/bootstrap behavior such as fetching markdown, reading URL params,
 * mutating the DOM, and initializing Reveal lives outside this module in
 * `../presentation-bootstrap.js`.
 */
import yaml from 'js-yaml';
import { createSlideCompiler } from './slide-compiler.js';
import { createMarkdownLineParsers } from './markdown-line-parsers.js';
import { createMediaLineParsers } from './media-line-parsers.js';
import { isDangerousURL, sanitizeMarkdownEmbeddedHTML, sanitizeRenderedHTML } from './html-sanitization.js';
import {
  getStorageItemSafe,
  usesNewNoteSeparator,
  getNoteSeparator,
  NOTE_SEPARATOR_CURRENT,
  NOTE_SEPARATOR_LEGACY
} from './compiler-utils.js';

function parseHideTarget(rawValue) {
  const normalized = String(rawValue || '').trim().toLowerCase();
  if (!normalized) return 'both';
  if (normalized === 'handout' || normalized === 'slideshow') {
    return normalized;
  }
  return null;
}

function shouldHideCurrentSlide(target, forHandout) {
  if (!target) return false;
  if (target === 'both') return true;
  return forHandout ? target === 'handout' : target === 'slideshow';
}

// Peel YAML front matter off the source document and recover safely from malformed YAML.
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

/**
 * Runs plugin-provided markdown preprocessors before the built-in compiler.
 * Plugins can transform raw markdown, but they do not directly participate in
 * slide-state assembly; the built-in compiler still owns the final pipeline.
 */
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

/**
 * Compiles REVELation-flavored markdown into Reveal-compatible markdown.
 *
 * This is the main compiler entry point. It scans the source, recognizes
 * REVELation-specific syntax, emits compiler operations, and relies on the
 * slide compiler to assemble final per-slide output with sticky state and
 * boundary behavior preserved.
 */
export function preprocessMarkdown(md, userMacros = {}, forHandout = false, media = {}, newSlideOnHeading = true, mediaIndex = null, preferHigh = null, suppressVisualElements = false, appConfig = null, showHiddenSlidesInPreview = false) {
  // Give plugins first pass over the raw markdown so custom transforms happen before built-ins.
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

  // Seed the compiler with built-in macros, then overlay any deck-specific macro definitions.
  const lines = md.split('\n');
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

  // Group slide metadata into suppression buckets so sticky macros can be neutralized selectively.
  const getSuppressionGroupsForLine = (value) => {
    const groups = [];
    const text = String(value || '');
    if (/\bdata-background-(image|video)\s*=/i.test(text)) groups.push('background');
    if (/\bdata-shift(left|right)\b/i.test(text)) groups.push('shift');
    if (/\bdata-(darkbg|lightbg)\b/i.test(text)) groups.push('bgmode');
    if (/\bdata-tint-color\s*=/i.test(text)) groups.push('bgtint');
    if (/\bdata-(lower-third|upper-third)\b/i.test(text)) groups.push('third');
    return groups;
  };

  // Convert REVELation's underscore cite shorthand before markdown rendering.
  const convertUnderscoreCites = (value) => String(value ?? '').replace(
    /(^|[\s([{<'"])_([^\s_](?:[^_]*?[^\s_])?)_(?=$|[\s)\]}'".,!?;:])/g,
    (_, prefix, inner) => `${prefix}<cite>${inner}</cite>`
  );
  // Convert delimiter-style double underscores into underline markup without mangling filenames.
  const convertDoubleUnderscoreUnderlines = (value) => String(value ?? '').replace(
    /(^|[\s([{<'"])__([^\s_](?:[^_]*?[^\s_])?)__(?=$|[\s)\]}'".,!?;:])/g,
    (_, prefix, inner) => `${prefix}<u>${inner}</u>`
  );

  // Shared iframe sandbox policy for generated embeds such as YouTube and web snapshots.
  const iframeSandboxAttr = 'sandbox="allow-scripts allow-same-origin allow-forms"';
  const magicImageHandlers = {};
  const totalLines = lines.length;
  let index = -1;
  let insideCodeBlock = false;
  let currentFence = '';
  let columnPipeState = 0;

  // Media resolution prefers local high-bitrate variants when the caller requested them.
  const mediaIndexMap = mediaIndex && typeof mediaIndex === 'object' ? mediaIndex : null;
  const prefersHigh = typeof preferHigh === 'boolean'
    ? preferHigh
    : (getStorageItemSafe('options_media-version') === 'high');
  const isVideoSource = (value) => /\.(webm|mp4|mov|m4v)(\?.*)?(#.*)?$/i.test(String(value || '').trim());
  const isHighVariantAvailable = (item) => {
    if (!item?.large_variant?.filename) return false;
    if (!mediaIndexMap) return false;
    const indexItem = mediaIndexMap[item.filename];
    return indexItem?.large_variant_local === true;
  };
  const resolveMediaAlias = (input) => {
    if (!input || !media) return input;
    const aliasMatch = input.match(/^media:([a-zA-Z0-9_-]+)$/);
    if (!aliasMatch) return input;
    const alias = aliasMatch[1];
    const item = media[alias];
    if (!item?.filename) return input;
    let resolvedFile = item.filename;
    if (prefersHigh && isHighVariantAvailable(item)) {
      resolvedFile = item.large_variant.filename;
    }
    let basePath = '../_media/';
    if (typeof window !== 'undefined' && window.mediaPath) {
      basePath = window.mediaPath.endsWith('/') ? window.mediaPath : `${window.mediaPath}/`;
    }
    return `${basePath}${resolvedFile}`;
  };

  // Escape attribute values before they are interpolated into generated embed HTML.
  const escapeHtmlAttr = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Parse web-embed modifier strings like `scrollx=120,scrolly=240` into normalized settings.
  const parseWebEmbedSpec = (modifier, srcPart) => {
    const resolvedSrc = resolveMediaAlias(String(srcPart || '').trim()).trim();
    if (!resolvedSrc || isDangerousURL(resolvedSrc)) return null;
    const options = { scrollX: 0, scrollY: 0, overflowX: 0, overflowY: 8192, hasScrollDirective: false };
    const optionsPart = String(modifier || '').trim();
    if (optionsPart) {
      for (const token of optionsPart.split(',')) {
        const [rawKey, rawVal] = token.split('=');
        const key = String(rawKey || '').trim().toLowerCase();
        const parsed = Number.parseFloat(String(rawVal || '').trim());
        if (Number.isFinite(parsed) && parsed >= 0) {
          if (key === 'scrollx') {
            options.scrollX = Math.round(parsed);
            options.hasScrollDirective = true;
          } else if (key === 'scrolly') {
            options.scrollY = Math.round(parsed);
            options.hasScrollDirective = true;
          } else if (key === 'overflowx') {
            options.overflowX = Math.round(parsed);
          } else if (key === 'overflowy') {
            options.overflowY = Math.round(parsed);
          }
        }
      }
    }
    return { src: resolvedSrc, ...options };
  };

  // Countdown helpers normalize REVELation countdown syntax into final markup payloads.
  const pad2 = (value) => String(Math.max(0, Number.parseInt(value, 10) || 0)).padStart(2, '0');
  const formatCountdownDisplay = (seconds) => {
    const total = Math.max(0, Number.parseInt(seconds, 10) || 0);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    return hours > 0 ? `${pad2(hours)}:${pad2(minutes)}:${pad2(secs)}` : `${pad2(minutes)}:${pad2(secs)}`;
  };
  const buildCountdownMarkup = (params) => {
    const mode = (params[0] || '').trim().toLowerCase();
    if (mode === 'from') {
      const n1 = Number.parseInt(params[1], 10);
      const n2 = Number.parseInt(params[2], 10);
      const n3 = Number.parseInt(params[3], 10);
      const hasThreeParts = params.length >= 4 && Number.isFinite(n3);
      if (hasThreeParts) {
        const totalSeconds = (Math.max(0, n1 || 0) * 3600) + (Math.max(0, n2 || 0) * 60) + Math.max(0, n3 || 0);
        return `<h2 class="countdown" data-countdown-mode="from" data-countdown-seconds="${totalSeconds}">${formatCountdownDisplay(totalSeconds)}</h2>`;
      }
      if (Number.isFinite(n1) && Number.isFinite(n2)) {
        const totalSeconds = (Math.max(0, n1) * 60) + Math.max(0, n2);
        return `<h2 class="countdown" data-countdown-mode="from" data-countdown-seconds="${totalSeconds}">${formatCountdownDisplay(totalSeconds)}</h2>`;
      }
      return '';
    }
    if (mode === 'to') {
      const hours = Number.parseInt(params[1], 10);
      const minutes = Number.parseInt(params[2], 10);
      if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return '';
      const normalizedHours = ((hours % 24) + 24) % 24;
      const normalizedMinutes = ((minutes % 60) + 60) % 60;
      return `<h2 class="countdown" data-countdown-mode="to" data-countdown-hour="${normalizedHours}" data-countdown-minute="${normalizedMinutes}">${pad2(normalizedHours)}:${pad2(normalizedMinutes)}</h2>`;
    }
    return '';
  };
  // Convert stack directive comments into hidden markers that downstream runtime code can consume.
  const toStackAttrsMarker = (attributeString) => `<div class="revelation-stack-attrs" data-stack-attrs="${encodeURIComponent(attributeString)}" hidden></div>`;
  const extractSlideTransitionValue = (value) => {
    const match = value.match(/<!--\s*\.slide:\s*[^>]*\bdata-transition="([^"]+)"[^>]*-->/i);
    return match ? match[1] : null;
  };
  const convertStackDirectiveLine = (value) => {
    const stackCommentMatch = value.match(/^\s*<!--\s*\.stack:\s*(\S.+?)\s*-->\s*$/i);
    return stackCommentMatch ? toStackAttrsMarker(stackCommentMatch[1]) : value;
  };

  // The slide compiler is the stateful sink for all parser-emitted operations.
  const compiler = createSlideCompiler({
    forHandout,
    newSlideOnHeading,
    getSuppressionGroupsForLine,
    toStackAttrsMarker,
    extractSlideTransitionValue
  });
  const { processedLines, lastmacros, thismacros, slideLocalSuppressions } = compiler.state;
  const applyOperations = (operations) => compiler.applyOperations(operations);
  const appendLineOp = (value) => ({ type: 'append_line', value });
  const rememberSuppressionsOp = (value) => ({ type: 'remember_local_suppressions', value });
  const addStickyMacroOp = (value) => ({ type: 'add_sticky_macro', value });
  const resetStickyMacrosOp = () => ({ type: 'reset_sticky_macros' });
  const requestAiSymbolOp = () => ({ type: 'request_ai_symbol' });
  const addAttributionOp = (value) => ({ type: 'add_attribution', value });
  const setPendingTransitionOp = (value) => ({ type: 'set_pending_transition', value });
  const enterHiddenSlideOp = () => ({ type: 'enter_hidden_slide' });
  const markHiddenPreviewOp = () => ({ type: 'mark_hidden_preview' });

  // Non-media line parsers handle macros, directives, attributions, and sticky metadata.
  const { tryHandleInlineMacroLine, tryHandleMacroUseLine, tryHandleStickyMetaLine } = createMarkdownLineParsers({
    macros,
    forHandout,
    showHiddenSlidesInPreview,
    slideLocalSuppressions,
    parseHideTarget,
    shouldHideCurrentSlide,
    buildCountdownMarkup,
    resolveMediaAlias,
    convertStackDirectiveLine,
    extractSlideTransitionValue,
    applyOperations,
    ops: {
      appendLineOp,
      rememberSuppressionsOp,
      addStickyMacroOp,
      resetStickyMacrosOp,
      requestAiSymbolOp,
      addAttributionOp,
      setPendingTransitionOp,
      enterHiddenSlideOp,
      markHiddenPreviewOp
    }
  });
  // Runtime-specific magic-image handlers turn media shorthand into final slide markup.
  if (!forHandout) {
    magicImageHandlers.background = (src, modifier, attribution) => {
      const isVideo = /\.(webm|mp4|mov|m4v)$/i.test(src);
      const normalizedModifier = String(modifier || '').trim().toLowerCase();
      const shouldLoop = normalizedModifier !== 'noloop';
      const tag = isVideo
        ? `<!-- .slide: data-background-video="${src}"${shouldLoop ? ' data-background-video-loop' : ''} data-background-video-muted -->`
        : `<!-- .slide: data-background-image="${src}" -->`;
      slideLocalSuppressions.add('background');
      if (normalizedModifier === 'sticky') {
        thismacros.push(tag);
        if (attribution) thismacros.push(`{{attrib:${attribution}}}`);
        lastmacros.length = 0;
      }
      return tag;
    };
    magicImageHandlers.fit = (src) => /\.(webm|mp4|mov|m4v)$/i.test(src)
      ? `<video src="${src}" controls playsinline data-imagefit></video>`
      : `![](${src})<!-- .element data-imagefit -->`;
    magicImageHandlers.youtube = (src, modifier) => {
      const match = src.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|watch\?v=))([\w-]+)/);
      const id = match ? match[1] : null;
      const widthHeight = modifier === 'fit' ? 'class="youtube-fit"' : 'class="youtube-iframe"';
      return id
        ? `<iframe ${widthHeight} src="https://www.youtube.com/embed/${id}?autoplay=0&mute=1&loop=1&playlist=${id}" frameborder="0" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen ${iframeSandboxAttr}></iframe>`
        : `<!-- Invalid YouTube URL: ${src} -->`;
    };
    magicImageHandlers.web = (src, modifier) => {
      const embed = parseWebEmbedSpec(modifier, src);
      if (!embed) return `<!-- Invalid embed URL: ${src} -->`;
      const safeSrc = escapeHtmlAttr(embed.src);
      const overflowX = Number.isFinite(Number(embed.overflowX)) ? Number(embed.overflowX) : 0;
      const overflowY = Number.isFinite(Number(embed.overflowY)) ? Number(embed.overflowY) : 8192;
      if (!embed.hasScrollDirective) {
        return `<iframe class="revelation-web-iframe" src="${safeSrc}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen ${iframeSandboxAttr}></iframe>`;
      }
      return `<div class="revelation-web-embed" style="--web-overflow-x:${overflowX}px;--web-overflow-y:${overflowY}px;"><iframe src="${safeSrc}" style="margin-left:-${Number(embed.scrollX) || 0}px;margin-top:-${Number(embed.scrollY) || 0}px;" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen ${iframeSandboxAttr}></iframe></div>`;
    };
  }
  magicImageHandlers.caption = (src, modifier) => `
<figure class="captioned-image">
  <img src="${src}" alt="">
  <figcaption>${modifier}</figcaption>
</figure>
  `.trim();

  // Media parsers resolve aliases, magic-image syntax, and plain markdown video shorthands.
  const { resolveMediaAliasInLine, tryHandleMagicImageLine, tryHandlePlainMediaLine } = createMediaLineParsers({
    forHandout,
    media,
    prefersHigh,
    isHighVariantAvailable,
    applyOperations,
    magicImageHandlers,
    isVideoSource,
    ops: { appendLineOp, addAttributionOp }
  });

  // Main compiler scan: process one source line at a time while preserving fence and slide state.
  for (let line of lines) {
    index += 1;
    // Fence transitions are handled first so separator-like lines inside code blocks stay inert.
    const fenceMatch = line.match(/^\s{0,3}((`{3,}|~{3,}))[ \t]*(.*)$/);
    if (fenceMatch) {
      const fence = fenceMatch[1];
      const fenceChar = fence[0];
      const fenceLength = fence.length;
      if (!insideCodeBlock) {
        insideCodeBlock = true;
        currentFence = fence;
      } else if (currentFence && fenceChar === currentFence[0] && fenceLength >= currentFence.length) {
        insideCodeBlock = false;
        currentFence = '';
      }
      applyOperations([appendLineOp(line)]);
      continue;
    }
    // Inside fenced code blocks, keep content literal and neutralize separator-only lines.
    if (insideCodeBlock) {
      const trimmedFenceLine = line.trim();
      applyOperations([appendLineOp(
        trimmedFenceLine === '---' || trimmedFenceLine === '***' || trimmedFenceLine === NOTE_SEPARATOR_CURRENT || trimmedFenceLine.toLowerCase() === NOTE_SEPARATOR_LEGACY.toLowerCase()
          ? `${line} `
          : line
      )]);
      continue;
    }
    // Stack comments become hidden markers before the generic parsers see the line.
    const stackCommentMatch = line.match(/^\s*<!--\s*\.stack:\s*(\S.+?)\s*-->\s*$/i);
    if (stackCommentMatch) {
      applyOperations([appendLineOp(toStackAttrsMarker(stackCommentMatch[1]))]);
      continue;
    }
    // Some runtime variants strip purely visual authoring syntax while keeping notes and hide logic.
    if (suppressVisualElements) {
      const trimmedLine = line.trim();
      const isNoteSeparator = trimmedLine.toLowerCase() === NOTE_SEPARATOR_CURRENT || trimmedLine.toLowerCase() === NOTE_SEPARATOR_LEGACY.toLowerCase();
      const isMacroUse = /^\s*\{\{[^}]+\}\}\s*$/.test(line);
      const isInlineMacro = /^\s*:[A-Za-z0-9_]+(?::.*)?:\s*$/.test(line);
      const isHideMacro = /^\s*\{\{hide(?::(?:handout|slideshow))?\}\}\s*$/i.test(line) || /^\s*:hide(?::(?:handout|slideshow))?:\s*$/i.test(line);
      const isAttribLine = /^\s*:ATTRIB:.*$/i.test(line) || /^\s*:AI:\s*$/i.test(line);
      const hasMarkdownImage = /!\[[^\]]*]\([^)]*\)/.test(line);
      const hasHtmlVisual = /<\s*(img|video|iframe|figure)\b/i.test(line);
      const hasBackgroundData = /data-background-(image|video|audio|audio-start|audio-loop|audio-stop)/i.test(line);
      if (!isNoteSeparator && !isHideMacro && (isMacroUse || isInlineMacro || isAttribLine || hasMarkdownImage || hasHtmlVisual || hasBackgroundData)) {
        continue;
      }
    }
    // `{{}}` clears sticky macro inheritance without emitting output.
    if (line.match(/^\{\{\}\}$/)) {
      lastmacros.length = 0;
      continue;
    }
    // `||` cycles the three column macros: start, break, end.
    if (line.trim() === '||') {
      const columnKeys = ['columnstart', 'columnbreak', 'columnend'];
      const key = columnKeys[columnPipeState];
      const template = macros[key];
      if (template) {
        applyOperations(template.split('\n').map((expandedLine) => appendLineOp(expandedLine)));
      } else {
        console.log('Markdown Column Macro Not Found: ' + key);
      }
      columnPipeState = (columnPipeState + 1) % columnKeys.length;
      continue;
    }
    // Media resolution happens before generic line parsing so aliases are already expanded.
    const mediaResolution = resolveMediaAliasInLine(line);
    if (mediaResolution.skipLine) continue;
    line = mediaResolution.line;
    if (tryHandleMagicImageLine(line, mediaResolution.lastAttribution)) continue;
    if (tryHandlePlainMediaLine(line)) continue;

    // After media processing, determine note separators and heading-driven auto-slide boundaries.
    const trimmedLine = line.trim();
    const isNoteSeparatorLine = trimmedLine.toLowerCase() === NOTE_SEPARATOR_CURRENT || trimmedLine.toLowerCase() === NOTE_SEPARATOR_LEGACY.toLowerCase();
    const autoSlide = compiler.detectAutoSlide(line);
    const hiddenResult = compiler.handleHiddenSlide(line, index, lines.length, autoSlide);
    if (hiddenResult.skipLine) continue;
    if (isNoteSeparatorLine) {
      applyOperations([appendLineOp(line)]);
      continue;
    }
    // Try specialized line parsers before falling back to ordinary markdown content.
    if (tryHandleInlineMacroLine(line) || tryHandleMacroUseLine(line) || tryHandleStickyMetaLine(line)) {
      continue;
    }
    // Mark visible content so heading-based auto-slide insertion knows whether the slide is blank.
    compiler.markContentLine(line);
    // Finalize the current slide when we hit a real or synthetic boundary.
    if (compiler.shouldFinalize(line, index, lines.length, autoSlide)) {
      const finalizeResult = compiler.finalizeSlide(line, autoSlide, columnPipeState);
      columnPipeState = finalizeResult.nextColumnPipeState;
      continue;
    }
    // Fallback path: treat the line as ordinary markdown content plus fragment/cite transforms.
    let transformedLine = convertUnderscoreCites(convertDoubleUnderscoreUnderlines(line));
    if (/^\s*<cite>.*<\/cite>\s{2,}$/.test(transformedLine)) {
      transformedLine = transformedLine.replace(/\s+$/, '');
    }
    if (transformedLine.endsWith('++')) {
      applyOperations([
        rememberSuppressionsOp(transformedLine),
        appendLineOp(transformedLine.replace(/\s*\+\+$/, '') + ' <!-- .element: class="fragment" -->')
      ]);
    } else {
      const transitionValue = extractSlideTransitionValue(transformedLine);
      const ops = [rememberSuppressionsOp(transformedLine)];
      if (transitionValue) ops.push(setPendingTransitionOp(transitionValue));
      ops.push(appendLineOp(transformedLine));
      applyOperations(ops);
    }
  }
  return processedLines.join('\n');
}

export {
  usesNewNoteSeparator,
  getNoteSeparator,
  sanitizeMarkdownEmbeddedHTML,
  sanitizeRenderedHTML
};
