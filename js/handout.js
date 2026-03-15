import {
  extractFrontMatter,
  preprocessMarkdown,
  sanitizeRenderedHTML,
  getNoteSeparator
} from './compiler/markdown-compiler.js';
import {
  segmentPresentation,
  stripSlideSeparatorsOutsideCodeBlocks
} from './compiler/presentation-segments.js';
import { marked } from 'marked';

const urlParams = new URLSearchParams(window.location.search);
const mdFile = urlParams.get('p');
const selectedLang = String(urlParams.get('lang') || '').trim().toLowerCase();
const SAFE_MD_LINK_RE = /^(?:\.\/)?(?:[a-zA-Z0-9_.-]+\/)*[a-zA-Z0-9_.-]+\.md$/;
const optionsToggleButton = document.getElementById('handout-options-toggle');
const optionsPanel = document.getElementById('handout-options');

function setHandoutOptionsOpen(isOpen) {
  if (!optionsToggleButton || !optionsPanel) return;
  optionsPanel.hidden = !isOpen;
  optionsToggleButton.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
}

function setupHandoutOptionsMenu() {
  if (!optionsToggleButton || !optionsPanel) return;

  optionsToggleButton.addEventListener('click', (event) => {
    event.stopPropagation();
    const nextOpen = optionsPanel.hidden;
    setHandoutOptionsOpen(nextOpen);
  });

  optionsPanel.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  document.addEventListener('click', () => {
    if (!optionsPanel.hidden) {
      setHandoutOptionsOpen(false);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !optionsPanel.hidden) {
      setHandoutOptionsOpen(false);
      optionsToggleButton.focus();
    }
  });
}

function resolveHandoutMarkdownTarget(href) {
  if (!href) return null;
  const trimmed = String(href).trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  if (/^(https?:|mailto:|tel:|javascript:|data:)/i.test(trimmed)) return null;
  if (trimmed.includes('../')) {
    console.warn(`Blocked parent-directory markdown link in handout: ${trimmed}`);
    return null;
  }

  try {
    const parsed = new URL(trimmed, window.location.href);
    if (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      parsed.host !== window.location.host
    ) {
      return null;
    }

    const rawPath = decodeURIComponent(parsed.pathname.split('/').pop() || '');
    const isIndexPath = /^index\.html?$/i.test(rawPath);
    const isHandoutPath = /^handout(?:\.html)?$/i.test(rawPath);
    if ((isIndexPath || isHandoutPath) && parsed.searchParams.has('p')) {
      const p = parsed.searchParams.get('p') || '';
      if (!SAFE_MD_LINK_RE.test(p)) return null;
      return { mdFile: p, hash: parsed.hash || '' };
    }

    const local = trimmed.startsWith('./') ? trimmed.slice(2) : trimmed;
    const [candidatePath, hashPart = ''] = local.split('#', 2);
    if (!SAFE_MD_LINK_RE.test(candidatePath)) return null;
    return { mdFile: candidatePath, hash: hashPart ? `#${hashPart}` : '' };
  } catch {
    return null;
  }
}

function navigateHandoutInPlace(target) {
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set('p', target.mdFile);
  nextUrl.hash = target.hash || '';
  window.location.href = nextUrl.toString();
}

function setupInterPresentationHandoutLinks() {
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented) return;
    if (event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const anchor = event.target?.closest?.('a[href]');
    if (!anchor) return;
    if (anchor.hasAttribute('data-handout-skip-intercept')) return;

    const target = resolveHandoutMarkdownTarget(anchor.getAttribute('href'));
    if (!target) return;

    event.preventDefault();
    navigateHandoutInPlace(target);
  }, true);
}

function findAlternativeMarkdownFile(metadata = {}, language = '') {
  const alternatives = metadata?.alternatives;
  if (!alternatives || typeof alternatives !== 'object' || Array.isArray(alternatives)) {
    return null;
  }
  const requestedLang = String(language || '').trim().toLowerCase();
  if (!requestedLang) return null;

  for (const [candidate, langCode] of Object.entries(alternatives)) {
    const key = String(candidate || '').trim();
    const safe = key.startsWith('./') ? key.slice(2) : key;
    if (!SAFE_MD_LINK_RE.test(safe)) continue;
    if (String(key || '').trim().toLowerCase() === 'self') continue;
    if (String(langCode || '').trim().toLowerCase() === requestedLang) {
      return safe;
    }
  }
  return null;
}

function isCommentOnlyMarkdown(markdown) {
  if (!markdown || !markdown.trim()) return true;
  const withoutComments = markdown
    // Remove HTML comments (including multiline)
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();
  return withoutComments.length === 0;
}

// VITE Hot Reloading Hook
if (import.meta.hot) {
  import.meta.hot.on('reload-presentations', (data) => {
    if(window.location.href.includes(`${data.slug}/handout?`) && mdFile === data.mdFile) {
      console.log('[HMR] Reloading presentation handout');
      location.reload();
    }
  });
}

const container = document.getElementById('handout-content');

if (!mdFile) {
  container.innerHTML = '<p>No markdown file specified.</p>';
} else {
  setupHandoutOptionsMenu();
  setupInterPresentationHandoutLinks();
  fetch(`${mdFile}`)
    .then(res => res.text())
    .then(async (rawMarkdown) => {
      let appConfig = window.AppConfig || null;
      if (!appConfig && window.electronAPI?.getAppConfig) {
        try {
          appConfig = await window.electronAPI.getAppConfig();
          window.AppConfig = appConfig;
        } catch {
          // Keep rendering handout even if config cannot be loaded.
        }
      }
      // Normalize line endings up front so markdown parsing is consistent on Windows/Linux/macOS.
      let normalizedMarkdown = String(rawMarkdown ?? '').replace(/\r\n?/g, '\n');
      let { metadata, content } = extractFrontMatter(normalizedMarkdown);
      let resolvedMdFile = mdFile;
      const alternativeFile = findAlternativeMarkdownFile(metadata, selectedLang);
      if (alternativeFile) {
        try {
          const altRes = await fetch(alternativeFile);
          if (altRes.ok) {
            resolvedMdFile = alternativeFile;
            normalizedMarkdown = String(await altRes.text() ?? '').replace(/\r\n?/g, '\n');
            const parsedAlt = extractFrontMatter(normalizedMarkdown);
            metadata = parsedAlt.metadata;
            content = parsedAlt.content;
          }
        } catch (err) {
          console.warn(`Failed to load handout alternative markdown (${alternativeFile}):`, err?.message || err);
        }
      }
      document.title = metadata.title || "Presentation Handout";
      const noteSeparator = getNoteSeparator(metadata);

      const processed = preprocessMarkdown(
        content,
        metadata.macros || {},
        true,
        metadata.media,
        metadata.newSlideOnHeading,
        null,
        null,
        false,
        appConfig
      );
      const slides = segmentPresentation(processed, noteSeparator);
      const output = [];
      const incremental = metadata && metadata.config && (metadata.config.slideNumber === 'c' || metadata.config.slideNumber === 'c/t');
	
      let hIndex = 1;
      let vIndex = 1;
      let slideCount = 0;
      let started = false;

      for (let slide of slides) {
      if (!started) {
        hIndex = 1;
        vIndex = 1;
        started = true;
      } else if (slide.breakBefore === 'horizontal') {
        hIndex++;
        vIndex = 1;
      } else if (slide.breakBefore === 'vertical') {
        vIndex++;
      } else {
        // Catch-all: assume horizontal
        hIndex++;
        vIndex = 1;
      }

      slideCount++;

          const cleanedMarkdown = stripSlideSeparatorsOutsideCodeBlocks(slide.content).trim();
          const slideHTML = sanitizeRenderedHTML(marked.parse(cleanedMarkdown));
          const cleanedNote = slide.notes
            ? stripSlideSeparatorsOutsideCodeBlocks(slide.notes).trim()
            : '';
          const noteHTML = sanitizeRenderedHTML(marked.parse(cleanedNote));

	  if((!cleanedMarkdown || 
		   /^#+$/.test(cleanedMarkdown) ||
		   isCommentOnlyMarkdown(cleanedMarkdown)
	          ) && !cleanedNote) {
	    continue;
          }
	  const slideno = incremental ? slideCount : `${hIndex}.${vIndex}` ;

          output.push('<section class="slide">');
	  const presParams = new URLSearchParams();
	  presParams.set('p', resolvedMdFile);
	  if (selectedLang) {
	    presParams.set('lang', selectedLang);
	  }
	  output.push(`<div class="slide-number slide-number-link"><a data-handout-skip-intercept=\"1\" href=\"index.html?${presParams.toString()}#${hIndex}/${vIndex}\" target=\"_blank\">${slideno}</a></div>`);
	  output.push(`<div class="slide-number slide-number-nolink" style="display: none">${slideno}</div>`);
          output.push(slideHTML);
	  if(cleanedNote) {
              output.push(`<div class="note">${noteHTML}</div>`);
          }
          output.push('</section>');
      }

      container.innerHTML = output.join('\n');
      // Initial toggle states after render
	    
      document.querySelectorAll('.slide-attribution, .attribution').forEach(el => {
        el.style.display = 'none';
      });


    })
    .catch(err => {
      container.innerHTML = `<p>Error loading handout: ${err.message}</p>`;
    });
}

document.getElementById('toggle-images').addEventListener('change', e => {
  document.querySelectorAll('img').forEach(el => {
    el.style.display = e.target.checked ? '' : 'none';
  });
});

document.getElementById('toggle-notes').addEventListener('change', e => {
  document.querySelectorAll('.note').forEach(el => {
    el.style.display = e.target.checked ? '' : 'none';
  });
});

document.getElementById('toggle-attributions').addEventListener('change', e => {
  document.querySelectorAll('.slide-attribution, .attribution').forEach(el => {
    el.style.display = e.target.checked ? '' : 'none';
  });
});

document.getElementById('toggle-links').addEventListener('change', e => {
  document.querySelectorAll('.slide-number-link').forEach(el => {
    el.style.display = e.target.checked ? '' : 'none';
  });
  document.querySelectorAll('.slide-number-nolink').forEach(el => {
    el.style.display = e.target.checked ? 'none' : '';
  });
});
