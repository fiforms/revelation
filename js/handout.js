import {
  extractFrontMatter,
  preprocessMarkdown,
  sanitizeRenderedHTML,
  getNoteSeparator
} from './loader.js';
import { marked } from 'marked';

const urlParams = new URLSearchParams(window.location.search);
const mdFile = urlParams.get('p');

function splitSlides(markdown) {
  const lines = markdown.split('\n');
  const slides = [];
  let current = [];
  let insideCodeBlock = false;
  let currentFence = '';
  let breakType = 'start';

  for (const line of lines) {
    const fenceMatch = line.match(/^(`{3,})(.*)$/);
    if (fenceMatch) {
      const fence = fenceMatch[1];
      if (!insideCodeBlock) {
        insideCodeBlock = true;
        currentFence = fence;
      } else if (fence === currentFence) {
        insideCodeBlock = false;
        currentFence = '';
      }
      current.push(line);
      continue;
    }

    const trimmed = line.trim();
    if (!insideCodeBlock && (trimmed === '---' || trimmed === '***')) {
      slides.push({ content: current.join('\n'), breakType });
      current = [];
      breakType = trimmed === '---' ? 'vertical' : 'horizontal';
      continue;
    }

    current.push(line);
  }

  slides.push({ content: current.join('\n'), breakType });
  return slides;
}

function isCommentOnlyMarkdown(markdown) {
  if (!markdown || !markdown.trim()) return true;
  const withoutComments = markdown
    // Remove HTML comments (including multiline)
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();
  return withoutComments.length === 0;
}

function splitSlideContentAndNotes(rawSlide, noteSeparator) {
  const lines = String(rawSlide || '').split(/\r?\n/);
  const noteIndex = lines.findIndex((line) => line.trim() === noteSeparator);
  if (noteIndex < 0) {
    return { content: String(rawSlide || ''), notes: '' };
  }
  return {
    content: lines.slice(0, noteIndex).join('\n'),
    notes: lines.slice(noteIndex + 1).join('\n')
  };
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
      const { metadata, content } = extractFrontMatter(rawMarkdown);
      document.title = metadata.title || "Presentation Handout";

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
      const slides = splitSlides(processed);
      const output = [];
      const incremental = metadata && metadata.config && (metadata.config.slideNumber === 'c' || metadata.config.slideNumber === 'c/t');
      const noteSeparator = getNoteSeparator(metadata);
	
      let hIndex = 1;
      let vIndex = 1;
      let slideCount = 0;
      let started = false;

      for (let slide of slides) {
      if (!started) {
        hIndex = 1;
        vIndex = 1;
        started = true;
      } else if (slide.breakType === 'horizontal') {
        hIndex++;
        vIndex = 1;
      } else if (slide.breakType === 'vertical') {
        vIndex++;
      } else {
        // Catch-all: assume horizontal
        hIndex++;
        vIndex = 1;
      }

      slideCount++;

          const rawSlide = slide.content;
          const parsedSlide = splitSlideContentAndNotes(rawSlide.trim(), noteSeparator);
          const cleanedMarkdown = parsedSlide.content.replace(/^\s*(\*\*\*|---)\s*$/gm, '').trim();
          const slideHTML = sanitizeRenderedHTML(marked.parse(cleanedMarkdown));
          const cleanedNote = parsedSlide.notes ? parsedSlide.notes.replace(/^\s*(\*\*\*|---)\s*$/gm, '').trim() : '';
          const noteHTML = sanitizeRenderedHTML(marked.parse(cleanedNote));

	  if((!cleanedMarkdown || 
		   /^#+$/.test(cleanedMarkdown) ||
		   isCommentOnlyMarkdown(cleanedMarkdown)
	          ) && !cleanedNote) {
	    continue;
          }
	  const slideno = incremental ? slideCount : `${hIndex}.${vIndex}` ;

          output.push('<section class="slide">');
	  output.push(`<div class="slide-number slide-number-link" style="display: none"><a href="index.html?p=${mdFile}#${hIndex}/${vIndex}" target="_blank">${slideno}</a></div>`);
	  output.push(`<div class="slide-number slide-number-nolink">${slideno}</div>`);
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
