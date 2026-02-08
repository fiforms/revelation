import Reveal from 'reveal.js';
import Markdown from 'reveal.js/plugin/markdown/markdown.esm.js';
import Notes from 'reveal.js/plugin/notes/notes.esm.js';
import Zoom from 'reveal.js/plugin/zoom/zoom.esm.js';
import Search from 'reveal.js/plugin/search/search.esm.js';
import RevealRemote from 'reveal.js-remote/plugin/remote.js';

import { loadAndPreprocessMarkdown } from './loader.js';
import { revealTweaks } from './tweaks.js';
import { contextMenu, sendPresentationToPeers, closePresentationsOnPeers } from './contextmenu.js';
import { pluginLoader } from './pluginloader.js';

(async () => {

const match = window.location.pathname.match(/presentations_([^/]+)/);
let key = match ? match[1] : null;
const urlParams = new URLSearchParams(window.location.search);
const isRemoteFollower = urlParams.has('remoteMultiplexId');


const isRemote = window.location.protocol !== 'file:' &&
                 !['localhost', '127.0.0.1'].includes(window.location.hostname);


pluginLoader('presentations',`/plugins_${key}`).then(async function() {

  const plugins = [Markdown, Notes, Zoom, Search];
  if (window.revealRemoteServer) {
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

  const deck = new Reveal({
    plugins,
    ...((window.revealRemoteServer) && {
      remote: {
        remote: true,
        multiplex: true,
        server: window.revealRemoteServer,
        path: "/socket.io"
      }
    })
  });
  
  window.deck = deck;

  loadAndPreprocessMarkdown(deck);
  const NOTES_SCROLL_DELAY_MS = 3000;
  const NOTES_SCROLL_SPEED_VH_PERCENT_PER_SEC_DEFAULT = 2;
  const NOTES_SCROLL_READY_RETRIES = 16;
  const NOTES_SCROLL_READY_RETRY_MS = 250;
  let notesScrollStartTimer = null;
  let notesScrollReadyTimer = null;
  let notesScrollRaf = null;
  let notesScrollContextKey = '';

  function cancelNotesAutoScroll() {
    if (notesScrollStartTimer) {
      window.clearTimeout(notesScrollStartTimer);
      notesScrollStartTimer = null;
    }
    if (notesScrollReadyTimer) {
      window.clearTimeout(notesScrollReadyTimer);
      notesScrollReadyTimer = null;
    }
    if (notesScrollRaf) {
      window.cancelAnimationFrame(notesScrollRaf);
      notesScrollRaf = null;
    }
  }

  function getNotesContextKey() {
    const idx = deck.getIndices?.() || {};
    return `${idx.h ?? 0}:${idx.v ?? 0}:${idx.f ?? -1}`;
  }

  function getNotesScrollSpeedVhPercentPerSec() {
    const runtimeSpeed = Number.parseFloat(window.RevelationRuntime?.notesScrollSpeed);
    if (Number.isFinite(runtimeSpeed) && runtimeSpeed > 0) {
      return runtimeSpeed;
    }
    return NOTES_SCROLL_SPEED_VH_PERCENT_PER_SEC_DEFAULT;
  }

  function scheduleNotesAutoScroll() {
    if (document.body.dataset.variant !== 'notes') return;
    if (document.body.classList.contains('notes-pane-hidden')) return;
    const contextKey = getNotesContextKey();
    const hasActiveScrollCycle = !!(notesScrollStartTimer || notesScrollReadyTimer || notesScrollRaf);
    if (hasActiveScrollCycle && notesScrollContextKey === contextKey) {
      return;
    }
    notesScrollContextKey = contextKey;
    cancelNotesAutoScroll();
    const immediateNotesPane = document.querySelector('.reveal .speaker-notes');
    if (immediateNotesPane) {
      immediateNotesPane.scrollTop = 0;
    }
    console.log('[notes-scroll] schedule');

    notesScrollStartTimer = window.setTimeout(() => {
      notesScrollStartTimer = null;

      const beginAnimation = (notesPane) => {
        let lastTs = null;
        notesPane.scrollTop = 0;
        console.log('[notes-scroll] start', {
          scrollHeight: notesPane.scrollHeight,
          clientHeight: notesPane.clientHeight
        });

        const step = (ts) => {
          if (!notesPane.isConnected || document.body.classList.contains('notes-pane-hidden')) {
            notesScrollRaf = null;
            return;
          }

          if (lastTs === null) {
            lastTs = ts;
          }

          const deltaSeconds = (ts - lastTs) / 1000;
          lastTs = ts;

          const maxScroll = notesPane.scrollHeight - notesPane.clientHeight;
          if (maxScroll <= 0 || notesPane.scrollTop >= maxScroll) {
            notesPane.scrollTop = Math.max(0, maxScroll);
            notesScrollRaf = null;
            console.log('[notes-scroll] complete');
            return;
          }

          const speedPercent = getNotesScrollSpeedVhPercentPerSec();
          const speedPxPerSec = (window.innerHeight || notesPane.clientHeight || 0) * (speedPercent / 100);
          notesPane.scrollTop = Math.min(maxScroll, notesPane.scrollTop + (speedPxPerSec * deltaSeconds));
          notesScrollRaf = window.requestAnimationFrame(step);
        };

        notesScrollRaf = window.requestAnimationFrame(step);
      };

      const waitUntilReady = (retriesLeft) => {
        const notesPane = document.querySelector('.reveal .speaker-notes');
        if (!notesPane || !notesPane.isConnected || document.body.classList.contains('notes-pane-hidden')) {
          console.log('[notes-scroll] canceled before start');
          return;
        }
        const maxScroll = notesPane.scrollHeight - notesPane.clientHeight;
        if (maxScroll > 0) {
          beginAnimation(notesPane);
          return;
        }
        if (retriesLeft <= 0) {
          console.log('[notes-scroll] skipped: no overflow');
          return;
        }
        notesScrollReadyTimer = window.setTimeout(() => {
          waitUntilReady(retriesLeft - 1);
        }, NOTES_SCROLL_READY_RETRY_MS);
      };

      waitUntilReady(NOTES_SCROLL_READY_RETRIES);
    }, NOTES_SCROLL_DELAY_MS);
  }

  function currentSlideHasNotes() {
    const slide = deck.getCurrentSlide?.();
    if (!slide) return false;

    const slideNotesAttr = slide.getAttribute('data-notes');
    if (slideNotesAttr && slideNotesAttr.trim()) {
      return true;
    }

    const slideNotes = slide.querySelectorAll('aside.notes');
    for (const notesEl of slideNotes) {
      if ((notesEl.textContent || '').trim()) {
        return true;
      }
    }

    const currentFragment = slide.querySelector('.current-fragment');
    if (currentFragment) {
      const fragmentNotesAttr = currentFragment.getAttribute('data-notes');
      if (fragmentNotesAttr && fragmentNotesAttr.trim()) {
        return true;
      }
      const fragmentNotes = currentFragment.querySelector('aside.notes');
      if (fragmentNotes && (fragmentNotes.textContent || '').trim()) {
        return true;
      }
    }

    return false;
  }

  function updateNotesPaneVisibility() {
    if (document.body.dataset.variant !== 'notes') return;
    const showNotesEnabled = !!deck.getConfig?.().showNotes;
    if (!showNotesEnabled) {
      cancelNotesAutoScroll();
      return;
    }
    const hasNotes = currentSlideHasNotes();
    const shouldHide = !hasNotes;
    const changed = document.body.classList.contains('notes-pane-hidden') !== shouldHide;
    document.body.classList.toggle('notes-pane-hidden', shouldHide);
    if (shouldHide) {
      notesScrollContextKey = '';
      cancelNotesAutoScroll();
    } else {
      scheduleNotesAutoScroll();
    }
    if (changed) {
      // Re-run Reveal layout once after the CSS transition to resize slide text.
      window.setTimeout(() => {
        deck.layout?.();
      }, 280);
    }
  }

  revealTweaks(deck);
  contextMenu(deck);
  deck.addKeyBinding({ keyCode: 90, key: 'Z', description: 'Send presentation to peers' }, () => {
    sendPresentationToPeers();
  });
  deck.addKeyBinding({ keyCode: 81, key: 'Q', description: 'Close presentations on peers' }, () => {
    closePresentationsOnPeers();
  });

  deck.on('ready', () => {
    updateNotesPaneVisibility();
    const indices = deck.getIndices();

    // Let browser layout settle first
    window.setTimeout(() => {
      // Remote followers should not force local slide state after join.
      // The remote plugin will sync to the master's current indices.
      if (!isRemoteFollower) {
        deck.slide(indices.h, indices.v);  // Force refresh of current slide
      }
      document.body.classList.remove('hidden');
      document.body.classList.add('reveal-ready');
    }, 800); // adjust if needed 
  });

  deck.on('slidechanged', updateNotesPaneVisibility);
  deck.on('fragmentshown', updateNotesPaneVisibility);
  deck.on('fragmenthidden', updateNotesPaneVisibility);
});


const mdFile = urlParams.get('p');
const config = window.electronAPI ? await window.electronAPI.getAppConfig() : {};
window.AppConfig = config;

// If embedded in a PIP iframe, forward X key presses to the parent.
if (window.parent && window.parent !== window) {
  document.addEventListener('keydown', (event) => {
    if (event.key === 'x' || event.key === 'X') {
      event.preventDefault();
      event.stopPropagation();
      window.parent.postMessage('pip-toggle', '*');
    }
  }, true);
}


// VITE Hot Reloading Hook
if (import.meta.hot) {
  import.meta.hot.on('reload-presentations', (data) => {
    if(window.location.href.includes(`${data.slug}/`) && mdFile === data.mdFile) {
      console.log('[HMR] Reloading presentation');
      location.reload();
    }
  });
}

})();
