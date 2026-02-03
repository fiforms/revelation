import yaml from 'js-yaml';
import convertSmartQuotes from './smart-quotes';

let style_path = '/css/';

export async function loadAndPreprocessMarkdown(deck,selectedFile = null) {
      const defaultFile = 'presentation.md';
      const urlParams = new URLSearchParams(window.location.search);

      let rawMarkdown;

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
      const forceControls = urlParams.get('forceControls') === '1';

      // check for alternative versions, create a selector drop-down
      if (!selectedFile && metadata.alternatives && typeof metadata.alternatives === 'object') {
         createAlternativeSelector(deck, metadata.alternatives);
         document.title = "Waiting for Selection";
         return 1;
      }

      // Update document title and theme
      document.title = metadata.title || "Reveal.js Presentation";
      if (metadata.theme) {
        document.getElementById('theme-stylesheet').href = style_path + metadata.theme;
      }
      if (metadata.stylesheet) {
        const styleEl = document.createElement('link');
        styleEl.rel = 'stylesheet';
        styleEl.href = metadata.stylesheet;
        document.head.appendChild(styleEl);
      }

      if (metadata.macros && typeof metadata.macros === 'object') {
        Object.assign(macros, metadata.macros); // User-defined macros from front matter 
      }

      const partProcessedMarkdown = preprocessMarkdown(content, macros, false, metadata.media, metadata.newSlideOnHeading);
      const processedMarkdown = metadata.convertSmartQuotes === false ? partProcessedMarkdown : convertSmartQuotes(partProcessedMarkdown);

      // Create a temporary element to convert markdown into HTML slides
      const section = document.getElementById('markdown-container');
      section.setAttribute('data-markdown', '');
      section.setAttribute('data-separator', '^\n\\*\\*\\*\n$');
      section.setAttribute('data-separator-vertical', '^\n---\n$');
      section.setAttribute('data-separator-notes', '^Note:$');
      section.innerHTML = `<textarea data-template>${processedMarkdown}</textarea>`;

      // Initialize Reveal.js
      const config = metadata.config || {};
      if (forceControls) {
        config.controls = true;
        config.progress = true;
        config.slideNumber = true;
        config.showSlideNumber = 'all';
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

export function preprocessMarkdown(md, userMacros = {}, forHandout = false, media = {}, newSlideOnHeading = true) {
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
    columnstart: `<div class="flexcontainer"><div class="first">`,
    columnbreak: `</div><div class="second">`,
    columnend: `</div></div>`,
    bgtint: `<!-- .slide: data-tint-color="$1" -->`,
    audiostart: `<!-- .slide: data-background-audio-start="$1" -->`,
    audioloop: `<!-- .slide: data-background-audio-loop="$1" -->`,
    audiostop: `<!-- .slide: data-background-audio-stop -->`
  };

  const macros = { ...defaultMacros, ...userMacros };

  const magicImageHandlers = {}
  if (!forHandout) {
    magicImageHandlers.background = (src, modifier, attribution) => {
      const isVideo = /\.(webm|mp4|mov|m4v)$/i.test(src);

      const tag = isVideo
        ? `<!-- .slide: data-background-video="${src}" data-background-video-loop -->`
        : `<!-- .slide: data-background-image="${src}" -->`;
      if(modifier === 'sticky') {
        thismacros.push(tag);
        if(attribution) {
          thismacros.push(`:ATTRIB:${attribution}`);
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
      return id
        ? `<iframe width="960" height="540" src="https://www.youtube.com/embed/${id}?autoplay=0&mute=1&loop=1&playlist=${id}" frameborder="0" allowfullscreen></iframe>`
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
    const prefersHigh = localStorage.getItem('options_media-version') === 'high';
    if (prefersHigh && item.large_variant?.filename) {
      resolvedFile = item.large_variant.filename;
    }

    let basePath = '../_media/';
    if (typeof window !== 'undefined' && window.mediaPath) {
      basePath = window.mediaPath.endsWith('/') ? window.mediaPath : window.mediaPath + '/';
    }

    return `${basePath}${resolvedFile}`;
  };

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

        // 🔥 use large variant if config says so
        let prefersHigh = localStorage.getItem('options_media-version') === 'high';
        if (prefersHigh && item.large_variant?.filename) {
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

    const macroUseMatch = line.match(/^\{\{([A-Za-z0-9_]+)(?::([^}]+))?\}\}$/);

    if (macroUseMatch) {
      const key = macroUseMatch[1].trim();
      const paramString = macroUseMatch[2];
      const params = paramString ? paramString.split(':') : [];
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
          thismacros.push(audioLine);
          processedLines.push(audioLine);
          lastmacros.length = 0;
          continue;
        }
      }
      const template = macros[key];
      if (template) {
        // Replace $1, $2, ... with provided params
        let expanded = template.replace(/\$(\d+)/g, (_, n) => resolveMediaAlias(params[+n - 1] ?? ''));
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

    const aiSymbolMatch = line.match(/^::AI\s*$/i);
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

      if (aiSymbolRequested) {
        processedLines.push('<div class="slide-ai-symbol">');
        processedLines.push('</div>');
        processedLines.push('');
        aiSymbolRequested = false;
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

function sanitizeMarkdownFilename(filename) {
  const mdPattern = /^[a-zA-Z0-9_.-]+\.md$/;

  if (!filename || !mdPattern.test(filename)) {
    console.warn(`Blocked invalid markdown filename: ${filename}`);
    return null;
  }

  return filename;
}
