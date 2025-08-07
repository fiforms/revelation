import Reveal from 'reveal.js';
import Markdown from 'reveal.js/plugin/markdown/markdown.esm.js';
import Notes from 'reveal.js/plugin/notes/notes.esm.js';
import Zoom from 'reveal.js/plugin/zoom/zoom.esm.js';
import Search from 'reveal.js/plugin/search/search.esm.js';
import RevealRemote from 'reveal.js-remote/plugin/remote.js';

import { loadAndPreprocessMarkdown } from './loader.js';
import { revealTweaks } from './tweaks.js';
import { contextMenu } from './contextmenu.js';
import { pluginLoader } from './pluginloader.js';


await pluginLoader('presentations');

const isRemote = window.location.protocol !== 'file:' &&
                 !['localhost', '127.0.0.1'].includes(window.location.hostname);


const plugins = [Markdown, Notes, Zoom, Search];
if (isRemote) {
  plugins.push(RevealRemote);
}

for (const plugin of Object.values(window.RevelationPlugins)) {
  if (typeof plugin.getRevealPlugins === 'function') {
    const revealPlugins = await plugin.getRevealPlugins(isRemote);
    if (Array.isArray(revealPlugins)) {
      plugins.push(...revealPlugins);
    }
  }
}

console.log(plugins);

const deck = new Reveal({
  plugins,
  ...((isRemote && window.revealRemoteServer) && {
    remote: {
      remote: true,
      multiplex: true,
      server: window.revealRemoteServer,
      path: "/socket.io"
    }
  })
});

const urlParams = new URLSearchParams(window.location.search);
const mdFile = urlParams.get('p');

// VITE Hot Reloading Hook
if (import.meta.hot) {
  import.meta.hot.on('reload-presentations', (data) => {
    if(window.location.href.includes(`${data.slug}/`) && mdFile === data.mdFile) {
      console.log('[HMR] Reloading presentation');
      location.reload();
    }
  });
}

loadAndPreprocessMarkdown(deck);

revealTweaks(deck);
contextMenu(deck);

deck.on('ready', () => {
  const indices = deck.getIndices();

  // Let browser layout settle first
  window.setTimeout(() => {
    deck.slide(indices.h, indices.v);  // Force refresh of current slide
    document.body.classList.remove('hidden');
    document.body.classList.add('reveal-ready');
  }, 800); // adjust if needed 
});

