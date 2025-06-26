import Reveal from 'reveal.js';
import Markdown from 'reveal.js/plugin/markdown/markdown.esm.js';
import Notes from 'reveal.js/plugin/notes/notes.esm.js';
import Zoom from 'reveal.js/plugin/zoom/zoom.esm.js';
import Search from 'reveal.js/plugin/search/search.esm.js';
import RevealRemote from 'reveal.js-remote/plugin/remote.js';

import { loadAndPreprocessMarkdown } from './loader.js';
import { revealTweaks } from './tweaks.js';

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

loadAndPreprocessMarkdown(deck);

revealTweaks(deck);

deck.on('ready', () => {
  // Let browser layout settle first
  window.setTimeout(() => {
    document.body.classList.remove('hidden');
    document.body.classList.add('reveal-ready');
  }, 500); // adjust if needed (100–300ms is usually enough)
});

