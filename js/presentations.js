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
const builderPreviewMode = urlParams.get('builderPreview') === '1';
const PREVIEW_BRIDGE = 'revelation-builder-preview-bridge';
const SAFE_MD_LINK_RE = /^(?:\.\/)?[a-zA-Z0-9_.-]+\.md$/;

function setupBuilderPreviewBridge(deck) {
  if (!builderPreviewMode) return;
  if (!window.parent || window.parent === window) return;

  const postPreviewEvent = (eventName, payload = {}) => {
    window.parent.postMessage(
      {
        bridge: PREVIEW_BRIDGE,
        type: 'preview-event',
        event: eventName,
        payload
      },
      '*'
    );
  };

  const postCurrentState = (eventName = 'ready') => {
    const indices = deck.getIndices ? deck.getIndices() : { h: 0, v: 0 };
    const isOverview = deck.isOverview ? deck.isOverview() : false;
    postPreviewEvent(eventName, { indices, isOverview });
  };

  window.addEventListener('message', (event) => {
    if (event.source !== window.parent) return;
    const data = event.data || {};
    if (data.bridge !== PREVIEW_BRIDGE || data.type !== 'builder-command') return;

    const command = String(data.command || '');
    const payload = data.payload && typeof data.payload === 'object' ? data.payload : {};

    if (command === 'hello') {
      postCurrentState('ready');
      return;
    }

    if (command === 'slide') {
      const h = Number.isFinite(Number(payload.h)) ? Number(payload.h) : 0;
      const v = Number.isFinite(Number(payload.v)) ? Number(payload.v) : 0;
      deck.slide(h, v);
      return;
    }

    if (command === 'toggleOverview' && typeof deck.toggleOverview === 'function') {
      deck.toggleOverview();
    }
  });

  deck.on('ready', () => {
    postCurrentState('ready');
  });
  deck.on('slidechanged', () => {
    postCurrentState('slidechanged');
  });
  deck.on('overviewshown', () => {
    postCurrentState('overview');
  });
  deck.on('overviewhidden', () => {
    postCurrentState('overview');
  });
}

function setupInterPresentationLinkHandler() {
  const resolveInternalMarkdownTarget = (href) => {
    if (!href) return null;
    const trimmed = String(href).trim();
    if (!trimmed || trimmed.startsWith('#')) return null;
    if (/^(https?:|mailto:|tel:|javascript:|data:)/i.test(trimmed)) return null;

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
      const hasPathTraversal = trimmed.includes('../');
      if (hasPathTraversal) {
        console.warn(`Blocked parent-directory markdown link: ${trimmed}`);
        return null;
      }

      // Existing generated links like index.html?p=foo.md
      if (isIndexPath && parsed.searchParams.has('p')) {
        const p = parsed.searchParams.get('p') || '';
        if (!SAFE_MD_LINK_RE.test(p)) return null;
        return { mdFile: p, hash: parsed.hash || '' };
      }

      // Authoring contract: [Next](something.md)
      const pathWithoutLeadingDot = trimmed.startsWith('./') ? trimmed.slice(2) : trimmed;
      const [candidatePath, hashPart = ''] = pathWithoutLeadingDot.split('#', 2);
      if (!SAFE_MD_LINK_RE.test(candidatePath)) return null;
      return { mdFile: candidatePath, hash: hashPart ? `#${hashPart}` : '' };
    } catch {
      return null;
    }
  };

  document.addEventListener('click', (event) => {
    if (event.defaultPrevented) return;
    if (event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const anchor = event.target?.closest?.('a[href]');
    if (!anchor) return;

    const href = anchor.getAttribute('href');
    const target = resolveInternalMarkdownTarget(href);
    if (!target) return;

    event.preventDefault();
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('p', target.mdFile);
    nextUrl.hash = target.hash || '';
    window.location.href = nextUrl.toString();
  }, true);
}


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
  setupBuilderPreviewBridge(deck);
  setupInterPresentationLinkHandler();

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
        let startTs = null;
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

          if (startTs === null) {
            startTs = ts;
          }

          const maxScroll = notesPane.scrollHeight - notesPane.clientHeight;
          if (maxScroll <= 0) {
            notesPane.scrollTop = Math.max(0, maxScroll);
            notesScrollRaf = null;
            console.log('[notes-scroll] complete');
            return;
          }

          const speedPercent = getNotesScrollSpeedVhPercentPerSec();
          const viewportBase = Math.max(window.innerHeight || 0, notesPane.clientHeight || 0, 1);
          const speedPxPerSec = viewportBase * (speedPercent / 100);
          const elapsedSeconds = Math.max(0, (ts - startTs) / 1000);
          const targetScrollTop = Math.min(maxScroll, speedPxPerSec * elapsedSeconds);
          notesPane.scrollTop = targetScrollTop;
          if (targetScrollTop >= maxScroll - 0.5) {
            notesPane.scrollTop = maxScroll;
            notesScrollRaf = null;
            console.log('[notes-scroll] complete');
            return;
          }
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

    // Let browser layout settle first
    window.setTimeout(() => {
      // Remote followers should not force local slide state after join.
      // The remote plugin will sync to the master's current indices.
      // Builder preview receives explicit slide commands from the editor bridge.
      // Forcing a delayed local slide here can race and snap back selection.
      if (!isRemoteFollower && !builderPreviewMode) {
        const indices = deck.getIndices();
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
