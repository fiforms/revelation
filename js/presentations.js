import Reveal from 'reveal.js';
import Markdown from 'reveal.js/plugin/markdown/markdown.esm.js';
import Notes from 'reveal.js/plugin/notes/notes.esm.js';
import Zoom from 'reveal.js/plugin/zoom/zoom.esm.js';
import Search from 'reveal.js/plugin/search/search.esm.js';
import RevealRemote from 'reveal.js-remote/plugin/remote.js';

import yaml from 'js-yaml';

const style_path = '/css/';

const isRemote = !['localhost', '127.0.0.1'].includes(window.location.hostname);

const plugins = [Markdown, Notes, Zoom, Search];
if (isRemote) {
  plugins.push(RevealRemote);
}

const deck = new Reveal({
  plugins,
  ...(isRemote && {
    remote: {
      remote: true,
      multiplex: true,
      server: window.location.protocol + "//" + window.location.hostname + ":1947/",
      path: "/socket.io"
    }
  })
});

deck.on('ready', updateAttributionFromCurrentSlide);       
deck.on('slidechanged', updateAttributionFromCurrentSlide); 

loadAndPreprocessMarkdown();

scrubBackgroundVideos();
hideControlsOnSpeakerNotes();
doubleClickFullScreen();


// Disable video backgrounds in speaker notes view (iFrames)
function scrubBackgroundVideos() {
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
}

function sanitizeMarkdownFilename(filename) {
  const mdPattern = /^[a-zA-Z0-9_.-]+\.md$/;

  if (!filename || !mdPattern.test(filename)) {
    console.warn(`Blocked invalid markdown filename: ${filename}`);
    return null;
  }

  return filename;
}

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

async function loadAndPreprocessMarkdown(selectedFile = null) {
      const defaultFile = 'presentation.md';
      const urlParams = new URLSearchParams(window.location.search);
      const customFile = sanitizeMarkdownFilename(urlParams.get('p'));

      const markdownFile = selectedFile || customFile || defaultFile;
      let response = await fetch(markdownFile);
      if (!response.ok) {
        console.warn(`Could not load ${markdownFile}, falling back to ${defaultFile}`);
        response = await fetch(defaultFile);
      }

      let rawMarkdown = await response.text();

      const macros = {};

      const { metadata, content } = extractFrontMatter(rawMarkdown);

      // check for alternative versions, create a selector drop-down
      if (!selectedFile && metadata.alternatives && typeof metadata.alternatives === 'object') {
         createAlternativeSelector(metadata.alternatives);
         document.title = "Waiting for Selection";
         return 1;
      }

      // Update document title and theme
      document.title = metadata.title || "Reveal.js Presentation";
      if (metadata.theme) {
        document.getElementById('theme-stylesheet').href = style_path + metadata.theme;
      }
      if (metadata.macros) {
          Object.assign(macros, metadata.macros);
      }

      const processedMarkdown = preprocessMarkdown(content, macros);

      // Create a temporary element to convert markdown into HTML slides
      const section = document.getElementById('markdown-container');
      section.setAttribute('data-markdown', '');
      section.setAttribute('data-separator', '^\n\\*\\*\\*\n$');
      section.setAttribute('data-separator-vertical', '^\n---\n$');
      section.setAttribute('data-separator-notes', '^Note:');
      section.innerHTML = `<textarea data-template>${processedMarkdown}</textarea>`;

      // Initialize Reveal.js
      deck.initialize(metadata.config);
}

function createAlternativeSelector(alternatives) {
    console.log('Showing Selector for Alternative Version');
    const selector = document.createElement('div');
    selector.style = 'position: fixed; top: 40%; left: 40%; background: rgba(0,0,0,0.85); color: white; padding: 1rem; border-radius: 8px; z-index: 9999; font-family: sans-serif;';
    selector.innerHTML = `<strong style="display:block;margin-bottom:0.5rem;">Select Version:</strong>`;

    for (const [file, label] of Object.entries(alternatives)) {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.style = 'display: block; width: 100%; margin: 0.25rem 0; background: #444; color: white; border: none; padding: 0.5rem; border-radius: 4px; cursor: pointer;';
      btn.onclick = async () => {
          selector.remove();
          loadAndPreprocessMarkdown(file);
      }
      selector.appendChild(btn);
    }
    document.body.appendChild(selector);
}


function extractFrontMatter(md) {
  const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?/;
  const match = md.match(FRONTMATTER_RE);
  if (match) {
    const yamlText = match[1];
    const content = md.slice(match[0].length);
    const metadata = yaml.load(yamlText) || {};
    return { metadata, content };
  }
  return { metadata: {}, content: md };
}

function preprocessMarkdown(md, macros = {}) {
  const lines = md.split('\n');
  const processedLines = [];
  const attributions = [];
  const lastmacros = [];
  const thismacros = [];

  const totalLines = lines.length;
  var index = -1;
  var blankslide = true;
  for (var line of lines) {
    index++;

    if(line.match(/^\{\{\}\}$/)) {
        lastmacros.length = 0; // Reset the list of saved macros
	continue;
    }
    
    const macroUseMatch = line.match(/^\{\{([A-Za-z0-9_]+)(?::([^}]+))?\}\}$/);

    if (macroUseMatch) {
      const key = macroUseMatch[1].trim();
      const paramString = macroUseMatch[2];
      const params = paramString ? paramString.split(':') : [];
      const template = macros[key];
      if (template) {
        // Replace $1, $2, ... with provided params
        let expanded = template.replace(/\$(\d+)/g, (_, n) => params[+n - 1] ?? '');
        const mlines = expanded.split('\n');
        for (const mline of mlines) {
          thismacros.push(mline);
          const attribMatch = mline.match(/^\:ATTRIB\:(.*)$/);
          if (attribMatch) {
            attributions.push(attribMatch[1]);
            continue;
          }
          processedLines.push(mline);
        }
        lastmacros.length = 0;
        continue;
      } else {
        console.log('Markdown Macro Not Found: ' + key);
      }
    }

    // Check for attributions and load them into the attributions array
    const attribMatch = line.match(/^\:ATTRIB\:(.*)$/); 
    if(attribMatch) {
      attributions.push(attribMatch[1]);
      continue;
    }

    var autoSlide = false;
    if(line.match(/^\#/) && !blankslide) {
        // Always insert a slide break before a heading
	autoSlide = true;
    }
    if (line.trim() !== '' && !line.trim().match(/^<!--.*?-->$/)) {
      blankslide = false;
    }

    // Inject saved macros and attribution HTML before slide break
    if (autoSlide || line === '---' || line === '***' || line.match(/^[Nn][Oo][Tt][Ee]\:/) || index >= lines.length - 1) {
      var blankslide = true;
      if(thismacros.length > 0) {
	  lastmacros.length = 0;
	  lastmacros.push(...thismacros);
      }
      else {
	  for (const val of lastmacros) {
	      const attribMatch = val.match(/^\:ATTRIB\:(.*)$/);
    	      if(attribMatch) {
      		attributions.push(attribMatch[1]);
   	      }
	      else {
	        processedLines.push(val);
	      }
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
      continue;
    }

    if (line.endsWith('++')) {
      processedLines.push(
        line.replace(/\s*\+\+$/, '') + ' <!-- .element: class="fragment" -->'
      );
    } else {
      processedLines.push(line);
    }
  }

  return processedLines.join('\n');
}

function hideControlsOnSpeakerNotes() {
    window.addEventListener('message', event => {
      // Reveal Notes plugin sends this message from the notes window
      let edata = JSON.parse(event.data)
      if (edata.namespace === 'reveal-notes' && edata.type === 'connected') {
        console.log('Speaker Notes Connected, hiding controls');
        document.querySelector('.controls')?.classList.add('hide-when-notes');
        document.querySelector('.progress')?.classList.add('hide-when-notes');
      }
    });
}

function doubleClickFullScreen() {
    document.addEventListener('dblclick', () => {
      const elem = document.documentElement;
      if (!document.fullscreenElement) {
        if (elem.requestFullscreen) {
          elem.requestFullscreen();
        } else if (elem.webkitRequestFullscreen) { /* Safari */
          elem.webkitRequestFullscreen();
        } 
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        }
      }
    });
}
