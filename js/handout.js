import { extractFrontMatter, preprocessMarkdown } from './loader.js';
import { marked } from 'marked';

const urlParams = new URLSearchParams(window.location.search);
const mdFile = urlParams.get('p');

const container = document.getElementById('handout-content');

if (!mdFile) {
  container.innerHTML = '<p>No markdown file specified.</p>';
} else {
  fetch(`${mdFile}`)
    .then(res => res.text())
    .then(rawMarkdown => {
      const { metadata, content } = extractFrontMatter(rawMarkdown);
      document.title = metadata.title || "Presentation Handout";

      const processed = preprocessMarkdown(content, metadata.macros || {});
      const slides = processed.split(/\n(?=(\*\*\*|---|#\s))/g);
      const output = [];
      const incremental = metadata && metadata.config && (metadata.config.slideNumber === 'c' || metadata.config.slideNumber === 'c/t');
	
      let hIndex = 0;
      let vIndex = 1;
      let slideCount = 0;
      let lastBreakWasVertical = false;

      for (let rawSlide of slides) {
          const lines = rawSlide.trim().split('\nNote:');
          const cleanedMarkdown = lines[0].replace(/^\s*(\*\*\*|---)\s*$/gm, '').trim();
          const slideHTML = marked.parse(cleanedMarkdown);
          const cleanedNote = (lines.length > 1) ? lines[1].replace(/^\s*(\*\*\*|---)\s*$/gm, '').trim() : '';
          const noteHTML = marked.parse(cleanedNote);

      // Determine what kind of break this is
      const isHorizontalBreak = rawSlide.match(/^\s*\*\*\*/m);
      const isVerticalBreak = rawSlide.match(/^\s*---/m);
      const startsWithHeading = /^\s{0,3}#{1,2}\s/.test(cleanedMarkdown);
	  if (isVerticalBreak) {
    	      lastBreakWasVertical = true;
	  }
	  if((!cleanedMarkdown || 
		   /^#+$/.test(cleanedMarkdown) ||
		   /^\s*<!--[\s\S]*?-->\s*$/.test(cleanedMarkdown)
	          ) && !cleanedNote) {
	    continue;
          }

      if (isHorizontalBreak || (startsWithHeading && !lastBreakWasVertical)) {
        hIndex++;
        vIndex = 1;
      } else if (isVerticalBreak || (startsWithHeading && lastBreakWasVertical)) {
        vIndex++;
      } else {
        // Catch-all: assume horizontal
        hIndex++;
        vIndex = 1;
      }
      
	  slideCount++;
          lastBreakWasVertical = false;
	  const slideno = incremental ? slideCount : `${hIndex}.${vIndex}` ;

          output.push('<section class="slide">');
	  output.push(`<div class="slide-number"><a href="index.html?p=${mdFile}#${hIndex}/${vIndex}" target="_blank">${slideno}</a></div>`);
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

