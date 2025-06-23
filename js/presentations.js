import Reveal from 'reveal.js';
import Markdown from 'reveal.js/plugin/markdown/markdown.esm.js';
import Notes from 'reveal.js/plugin/notes/notes.esm.js';
import Zoom from 'reveal.js/plugin/zoom/zoom.esm.js';
import Search from 'reveal.js/plugin/search/search.esm.js';

const style_path = '/css/';

const deck = new Reveal({
  plugins: [Markdown, Notes, Zoom, Search],
});

function updateAttributionFromCurrentSlide() {
  const currentSlide = deck.getCurrentSlide();
  const source = event.currentSlide.querySelector('.slide-attribution');
  const overlay = document.getElementById('fixed-overlay-wrapper');

  if (source) {
    overlay.innerHTML = source.innerHTML;
    overlay.style.display = '';
  } else {
    overlay.innerHTML = '';
    overlay.style.display = 'none';
  }
}

deck.on('ready', updateAttributionFromCurrentSlide);       
deck.on('slidechanged', updateAttributionFromCurrentSlide); 

// Disable video backgrounds in speaker notes view (iFrames)
(function scrubBackgroundVideos() {
    if (window.self !== window.top) {
      document.querySelectorAll('.slide-background-content video').forEach(video => {
        if (!video.hasAttribute('data-paused-by-notes')) {
          video.pause();
          video.remove();  // or: video.src = ""; video.load();
          video.setAttribute('data-paused-by-notes', 'true');
          console.log('[Notes] Paused and removed background video');
        }
      });
      // Re-run after 1 second
      setTimeout(scrubBackgroundVideos, 1000);
    }
})();


// Get base URL of the current presentation (e.g., /presentations/sermon-1/)
const baseUrl = window.location.pathname.replace(/\/[^\/]*$/, '/');

// Load metadata.json relative to the current presentation folder
fetch(`${baseUrl}metadata.json`)
      .then(res => res.json())
      .then(meta => {
        document.title = meta.title || "Reveal.js Presentation";

        // Load theme from metadata
        if (meta.theme) {
          document.getElementById('theme-stylesheet').href = style_path + meta.theme;
        }
        loadAndPreprocessMarkdown();
      });


async function loadAndPreprocessMarkdown() {
  let response = await fetch('presentation.md');
  let markdown = await response.text();

  // ✅ Your custom preprocessing
  markdown = preprocessMarkdown(markdown);

  // Create a temporary element to convert markdown into HTML slides
  const section = document.getElementById('markdown-container');
  section.setAttribute('data-markdown', '');
  section.setAttribute('data-separator', '^\n\\*\\*\\*\n$');
  section.setAttribute('data-separator-vertical', '^\n---\n$');
  section.setAttribute('data-separator-notes', '^Note:');
  section.innerHTML = `<textarea data-template>${markdown}</textarea>`;

  // Initialize Reveal.js
  deck.initialize();
}


function preprocessMarkdown(md) {
  const lines = md.split('\n');
  const macros = {};
  const processedLines = [];
  const attributions = [];

  for (var line of lines) {
    const macroDefMatch = line.match(/^\[\]\(([A-Z1-9_:]+)\)(.+)$/);
    if (macroDefMatch) {
      const [, key, value] = macroDefMatch;
      macros[key.trim()] = value.trim();
      continue; // Skip macro definition lines
    }

    const macroUseMatch = line.match(/^\[\]\(([A-Z1-9_:]+)\)$/);
    if (macroUseMatch) {
      const key = macroUseMatch[1].trim();
      const value = macros[key];
      if (value) {
        line = value;
      }
      else {
	console.log('Markdown Macro Not Found: ' + key);
      }
    }
	  
    // Check for attributions and load them into the attributions array
    const attribMatch = line.match(/^\:ATTRIB\:(.*)$/); 
    if(attribMatch) {
      attributions.push(attribMatch[1]);
      continue;
    }

    // Inject attribution HTML before slide break
    if (line.trim() === '---' || line.trim() === '***' || line.match(/^[Nn][Oo][Tt][Ee]\:/)) {
      if (attributions.length > 0) {

        processedLines.push('<div class="slide-attribution">');
        for (const attrib of attributions) {
          processedLines.push(`<div class="attribution">${attrib}</div>`);
        }
        processedLines.push('</div>');
        processedLines.push('');
        attributions.length = 0; // Clear the array
      }
      processedLines.push(line); // Preserve the slide break itself
      continue;
    }

    if (line.trimEnd().endsWith('++')) {
      processedLines.push(
        line.replace(/\s*\+\+$/, '') + ' <!-- .element: class="fragment" -->'
      );
    } else {
      processedLines.push(line);
    }
  }

  return processedLines.join('\n');
}

window.addEventListener('message', event => {
  // Reveal Notes plugin sends this message from the notes window
  let edata = JSON.parse(event.data)
  if (edata.namespace === 'reveal-notes' && edata.type === 'connected') {
    console.log('Speaker Notes Connected, hiding controls');
    document.querySelector('.controls')?.classList.add('hide-when-notes');
    document.querySelector('.progress')?.classList.add('hide-when-notes');
  }
});

