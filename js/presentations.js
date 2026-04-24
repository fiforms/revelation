import Reveal from 'reveal.js';
import { io as socketIoClient } from 'socket.io-client';
import Markdown from 'reveal.js/plugin/markdown';
import Notes from 'reveal.js/plugin/notes';
import Zoom from 'reveal.js/plugin/zoom';
import Search from 'reveal.js/plugin/search';
import RevealRemote from 'reveal.js-remote/plugin/remote.js';

import { loadAndPreprocessMarkdown } from './presentation-bootstrap.js';
import { revealTweaks } from './tweaks.js';
import { contextMenu, sendPresentationToPeers, closePresentationsOnPeers } from './contextmenu.js';
import { pluginLoader } from './pluginloader.js';

(async () => {

window.RevelationSocketIOClient = socketIoClient;

const match = window.location.pathname.match(/presentations_([^/]+)/);
let key = match ? match[1] : null;
const urlParams = new URLSearchParams(window.location.search);
const isRemoteFollower = urlParams.has('remoteMultiplexId');


const isRemote = window.location.protocol !== 'file:' &&
                 !['localhost', '127.0.0.1'].includes(window.location.hostname);
const builderPreviewMode = urlParams.get('builderPreview') === '1';
const builderPreviewPeerEnabled = builderPreviewMode && urlParams.get('builderPreviewPeer') === '1';
const builderPreviewToken = urlParams.get('builderPreviewToken') || '';
const PREVIEW_BRIDGE = 'revelation-builder-preview-bridge';
const SAFE_MD_LINK_RE = /^(?:\.\/)?(?:[a-zA-Z0-9_.-]+\/)*[a-zA-Z0-9_.-]+\.md$/;

function setupBuilderPreviewBridge(deck) {
  if (!builderPreviewMode) return;
  if (!builderPreviewToken) return;
  if (!window.parent || window.parent === window) return;

  const postPreviewEvent = (eventName, payload = {}) => {
    window.parent.postMessage(
      {
        bridge: PREVIEW_BRIDGE,
        type: 'preview-event',
        token: builderPreviewToken,
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
    if (data.token !== builderPreviewToken) return;

    const command = String(data.command || '');
    const payload = data.payload && typeof data.payload === 'object' ? data.payload : {};

    if (command === 'hello') {
      deck.layout?.();
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
      return;
    }

    if (command === 'layout') {
      deck.layout?.();
      window.setTimeout(() => deck.layout?.(), 120);
      postCurrentState('slidechanged');
      return;
    }

    if (command === 'pauseRevealRemote') {
      const remote = deck.getPlugin('RevealRemote');
      if (remote && typeof remote.setMultiplexPaused === 'function') remote.setMultiplexPaused(true);
      return;
    }

    if (command === 'resumeRevealRemote') {
      const remote = deck.getPlugin('RevealRemote');
      if (remote && typeof remote.setMultiplexPaused === 'function') {
        remote.setMultiplexPaused(false);
        if (typeof remote.sendCurrentState === 'function') remote.sendCurrentState();
      }
      return;
    }
  });

  if (builderPreviewPeerEnabled) {
    const pollForMultiplexId = () => {
      // Try getMultiplexId() from patched remote.js first
      const remote = deck.getPlugin('RevealRemote');
      let id = remote && typeof remote.getMultiplexId === 'function' ? remote.getMultiplexId() : null;
      // Fallback: unpatched remote.js stores multiplexId in localStorage after init
      if (!id && window.localStorage) {
        const urlKey = window.location.href.replace(/#.*/, '');
        try {
          const stored = JSON.parse(window.localStorage.getItem('presentations') || '{}');
          id = stored[urlKey]?.multiplexId || null;
        } catch (e) { /* ignore */ }
      }
      if (id) {
        postPreviewEvent('revealRemoteReady', { multiplexId: id });
        return;
      }
      setTimeout(pollForMultiplexId, 300);
    };
    deck.on('ready', () => {
      setTimeout(pollForMultiplexId, 300);
    });
  }

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

  // Forward Ctrl+Arrow keys to the parent builder for slide navigation.
  document.addEventListener('keydown', (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    if (!event.key.startsWith('Arrow')) return;
    postPreviewEvent('keydown', { key: event.key });
    event.preventDefault();
  }, true);
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
  const enableRevealRemote = !!window.revealRemoteServer && (!builderPreviewMode || builderPreviewPeerEnabled);
  if (enableRevealRemote) {
    // Instantiate the plugin early so we can pre-pause before Reveal (and the
    // socket) initialises. multiplexPaused is module-level in the plugin, so
    // setting it here guarantees sendMultiplexState()'s guard fires before the
    // initial msgInit call on socket connect.
    const remotePlugin = RevealRemote();
    if (builderPreviewPeerEnabled) {
      remotePlugin.setMultiplexPaused(true);
    }
    plugins.push(remotePlugin);
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
    ...(enableRevealRemote && {
      remote: {
        remote: true,
        multiplex: true,
        server: window.revealRemoteServer,
        path: "/socket.io",
        suppressInOverview: true,
        normalizeShareUrl: (url) => {
          try {
            const u = new URL(url);
            u.searchParams.delete('variant');
            return u.toString();
          } catch { return url; }
        }
      }
    })
  });
  
  window.deck = deck;
  setupBuilderPreviewBridge(deck);
  setupInterPresentationLinkHandler();
  setHotReloading();

  loadAndPreprocessMarkdown(deck);
  const NOTES_SCROLL_DELAY_MS = 3000;
  const NOTES_SCROLL_SPEED_VH_PERCENT_PER_SEC_DEFAULT = 3.5;
  const NOTES_SCROLL_READY_RETRIES = 16;
  const NOTES_SCROLL_READY_RETRY_MS = 250;
  const NOTES_SCROLL_USER_RESUME_IDLE_MS = 1400;
  const NOTES_LAYOUT_BREAKPOINT_PX = 1024;
  let notesScrollStartTimer = null;
  let notesScrollReadyTimer = null;
  let notesScrollRaf = null;
  let notesScrollContextKey = '';
  let notesScrollDetachInteractionListeners = null;
  let notesViewportMode = null;
  let notesResizeDebounceTimer = null;

  function clearNotesInteractionListeners() {
    if (typeof notesScrollDetachInteractionListeners === 'function') {
      notesScrollDetachInteractionListeners();
      notesScrollDetachInteractionListeners = null;
    }
  }

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
    clearNotesInteractionListeners();
  }

  function getNotesContextKey() {
    const idx = deck.getIndices?.() || {};
    return `${idx.h ?? 0}:${idx.v ?? 0}:${idx.f ?? -1}`;
  }

  function getNotesScrollSpeedVhPercentPerSec() {
    const runtimeSpeed = Number.parseFloat(window.RevelationRuntime?.notesScrollSpeed);
    if (Number.isFinite(runtimeSpeed) && runtimeSpeed >= 0) {
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
        let startScrollTop = 0;
        let userHoldingScroll = false;
        let userPauseUntilTs = 0;
        const nowTs = () => (
          window.performance && typeof window.performance.now === 'function'
            ? window.performance.now()
            : Date.now()
        );
        const rebaseToCurrentScroll = (tsOverride = null) => {
          const stamp = Number.isFinite(tsOverride) ? tsOverride : nowTs();
          startTs = stamp;
          startScrollTop = notesPane.scrollTop;
        };
        const pauseForUserInteraction = (idleMs = NOTES_SCROLL_USER_RESUME_IDLE_MS) => {
          rebaseToCurrentScroll();
          userPauseUntilTs = Math.max(userPauseUntilTs, nowTs() + idleMs);
        };
        const restorePresentationFocus = () => {
          window.setTimeout(() => {
            deck.focus?.focus?.();
            if (document.activeElement === notesPane) {
              notesPane.blur();
            }
            document.body?.focus?.();
          }, 0);
        };
        const startUserHold = () => {
          userHoldingScroll = true;
          rebaseToCurrentScroll();
        };
        const endUserHold = () => {
          if (!userHoldingScroll) return;
          userHoldingScroll = false;
          pauseForUserInteraction();
          restorePresentationFocus();
        };
        const isScrollKey = (key) => (
          key === 'ArrowUp' ||
          key === 'ArrowDown' ||
          key === 'PageUp' ||
          key === 'PageDown' ||
          key === 'Home' ||
          key === 'End' ||
          key === ' ' ||
          key === 'Spacebar'
        );
        const onWheel = () => pauseForUserInteraction();
        const onPointerDown = () => startUserHold();
        const onPointerUp = () => endUserHold();
        const onTouchStart = () => startUserHold();
        const onTouchMove = () => pauseForUserInteraction();
        const onTouchEnd = () => endUserHold();
        const onTouchCancel = () => endUserHold();
        // Keyboard handler for when the notes pane has DOM focus (e.g. after the
        // user clicks into it). Goal: every key still drives the presentation rather
        // than operating on the notes pane as a scrollable text region.
        const onKeyDown = (event) => {
          if (!event) return;

          // Keys that would normally scroll a focused div (arrows, page keys, space)
          // are also the ones the presenter uses to pace the auto-scroll by hand.
          // Treat them as a deliberate "I'm controlling the scroll" signal so the
          // auto-scroll pauses and doesn't fight the manual position.
          if (isScrollKey(event.key)) {
            pauseForUserInteraction();
          }

          // Forward every plain key (no modifier) to Reveal so slide navigation,
          // fragment stepping, pause, etc. all keep working normally.
          // Guard: modifier combos (Ctrl+C, Alt+Tab, …) are OS/browser actions that
          // should not be hijacked, and a non-finite keyCode means an unrecognised
          // synthetic event we can't safely forward.
          if (!event.metaKey && !event.ctrlKey && !event.altKey && Number.isFinite(event.keyCode)) {
            // Prevent the browser from scrolling the notes div and stop the event
            // bubbling up to any other listeners before we re-dispatch it ourselves.
            event.preventDefault();
            event.stopPropagation();

            // Reveal.js keyboard.js bails out early when document.activeElement has
            // the class "speaker-notes" (intentional: prevents nav keys from firing
            // while the operator is typing in a notes textarea). We must blur the
            // pane synchronously *before* calling triggerKey so that check passes.
            notesPane.blur();
            deck.triggerKey?.(event.keyCode);

            // After triggerKey the active element is still the body or nothing, so
            // put focus back on the Reveal viewport so subsequent keys (including
            // from a remote clicker) continue to work without another click.
            restorePresentationFocus();
          }
        };

        clearNotesInteractionListeners();
        notesPane.addEventListener('wheel', onWheel, { passive: true });
        notesPane.addEventListener('pointerdown', onPointerDown, { passive: true });
        window.addEventListener('pointerup', onPointerUp, { passive: true });
        notesPane.addEventListener('touchstart', onTouchStart, { passive: true });
        notesPane.addEventListener('touchmove', onTouchMove, { passive: true });
        notesPane.addEventListener('touchend', onTouchEnd, { passive: true });
        notesPane.addEventListener('touchcancel', onTouchCancel, { passive: true });
        notesPane.addEventListener('keydown', onKeyDown);
        notesScrollDetachInteractionListeners = () => {
          notesPane.removeEventListener('wheel', onWheel);
          notesPane.removeEventListener('pointerdown', onPointerDown);
          window.removeEventListener('pointerup', onPointerUp);
          notesPane.removeEventListener('touchstart', onTouchStart);
          notesPane.removeEventListener('touchmove', onTouchMove);
          notesPane.removeEventListener('touchend', onTouchEnd);
          notesPane.removeEventListener('touchcancel', onTouchCancel);
          notesPane.removeEventListener('keydown', onKeyDown);
        };

        notesPane.scrollTop = 0;
        startScrollTop = 0;
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
            startScrollTop = notesPane.scrollTop;
          }

          if (userHoldingScroll) {
            notesScrollRaf = window.requestAnimationFrame(step);
            return;
          }

          if (userPauseUntilTs > ts) {
            notesScrollRaf = window.requestAnimationFrame(step);
            return;
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
          const targetScrollTop = Math.min(maxScroll, startScrollTop + (speedPxPerSec * elapsedSeconds));
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
    const shouldHide = !hasNotes || !!deck.isOverview?.();
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

  function getNotesViewportMode() {
    if (document.body.dataset.variant !== 'notes') return 'off';
    const viewportWidth = window.innerWidth || document.documentElement?.clientWidth || 0;
    return viewportWidth <= NOTES_LAYOUT_BREAKPOINT_PX ? 'narrow' : 'wide';
  }

  function refreshNotesLayoutAfterViewportChange() {
    if (document.body.dataset.variant !== 'notes') return;
    const nextMode = getNotesViewportMode();
    const modeChanged = nextMode !== notesViewportMode;
    notesViewportMode = nextMode;
    notesScrollContextKey = '';
    cancelNotesAutoScroll();
    updateNotesPaneVisibility();
    updateNextSlidePreview?.();
    deck.layout?.();
    if (modeChanged) {
      // Let CSS transitions settle when crossing wide/narrow layout mode.
      window.setTimeout(() => {
        updateNotesPaneVisibility();
        updateNextSlidePreview?.();
        deck.layout?.();
      }, 320);
    }
  }

  // --- Next Slide Preview (notes variant) ---

  function setupNextSlidePreview() {
    if (document.body.dataset.variant !== 'notes') return null;

    const previewEl = document.createElement('div');
    previewEl.id = 'notes-next-preview';
    previewEl.className = 'notes-next-preview';

    const labelEl = document.createElement('div');
    labelEl.className = 'notes-next-preview-label';
    labelEl.textContent = 'Next';

    const slideWrapEl = document.createElement('div');
    slideWrapEl.className = 'notes-next-preview-slide-wrap';

    previewEl.appendChild(labelEl);
    previewEl.appendChild(slideWrapEl);
    document.body.appendChild(previewEl);

    function updateNextSlidePreview() {
      slideWrapEl.innerHTML = '';

      if (deck.isOverview?.()) {
        document.body.classList.remove('has-next-preview');
        return;
      }

      const indices = deck.getIndices?.();
      if (!indices) {
        document.body.classList.remove('has-next-preview');
        return;
      }

      const { h, v } = indices;

      // If the current slide has fragments not yet shown, preview the current
      // slide fully built out. Otherwise preview the next slide.
      const currentSlide = deck.getCurrentSlide?.();
      const hasUnshownFragments = currentSlide &&
        Array.from(currentSlide.querySelectorAll('.fragment')).some(f => !f.classList.contains('visible'));

      let previewSlide, previewH, previewV;
      if (hasUnshownFragments) {
        previewSlide = currentSlide;
        previewH = h;
        previewV = v || 0;
      } else {
        const nextV = (v || 0) + 1;
        previewH = h;
        previewV = nextV;
        previewSlide = deck.getSlide(h, nextV);
        if (!previewSlide) {
          previewH = h + 1;
          previewV = 0;
          previewSlide = deck.getSlide(previewH, 0);
        }
      }

      if (!previewSlide) {
        document.body.classList.remove('has-next-preview');
        return;
      }

      document.body.classList.add('has-next-preview');
      labelEl.textContent = hasUnshownFragments ? 'Complete' : 'Next';

      const slideW = deck.getConfig?.().width || 960;
      const slideH = deck.getConfig?.().height || 700;
      const wrapW = slideWrapEl.offsetWidth;
      const wrapH = slideWrapEl.offsetHeight;
      const scale = (slideW > 0 && slideH > 0 && wrapW > 0 && wrapH > 0)
        ? Math.min(wrapW / slideW, wrapH / slideH) : 1;

      // Pixel offsets to center the scaled slide in the wrap — avoids
      // percentage-based translate which breaks under Reveal's perspective transforms.
      const scaledW = slideW * scale;
      const scaledH = slideH * scale;
      const offsetX = Math.round((wrapW - scaledW) / 2);
      const offsetY = Math.round((wrapH - scaledH) / 2);

      // Positioned container — 'overview' makes appearance plugin show all
      // animated elements at full opacity regardless of data-appearance-can-start.
      const fakeReveal = document.createElement('div');
      fakeReveal.className = 'reveal overview';
      fakeReveal.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;background:transparent;';

      // Shared placement CSS for both background and slide: top-left at offset,
      // scale from top-left corner so position math stays simple.
      const placementCss = [
        'position:absolute',
        `width:${slideW}px`,
        `height:${slideH}px`,
        `top:${offsetY}px`,
        `left:${offsetX}px`,
        `transform:scale(${scale})`,
        'transform-origin:top left',
      ].join(';');

      // Background: Reveal keeps these in a separate .backgrounds container.
      const bgEl = deck.getSlideBackground?.(previewH, previewV);
      if (bgEl) {
        const bgClone = bgEl.cloneNode(true);
        bgClone.classList.remove('future', 'past');
        bgClone.classList.add('present');
        bgClone.style.cssText = 'display:block;width:100%;height:100%;opacity:1;visibility:visible;transform:none;position:absolute;top:0;left:0;';
        bgClone.querySelectorAll('video').forEach(el => {
          el.removeAttribute('autoplay');
          el.removeAttribute('data-autoplay');
          el.pause?.();
        });
        const fakeBgs = document.createElement('div');
        fakeBgs.className = 'backgrounds';
        fakeBgs.style.cssText = placementCss;
        fakeBgs.appendChild(bgClone);
        fakeReveal.appendChild(fakeBgs);
      }

      // Slides wrapper — disable perspective to prevent coordinate-space distortion.
      const fakeSlides = document.createElement('div');
      fakeSlides.className = 'slides';
      fakeSlides.style.cssText = 'position:absolute;inset:0;perspective:none;';

      const clone = previewSlide.cloneNode(true);

      // Strip present/past/future so Reveal's visibility rules don't hide content.
      clone.classList.remove('future', 'past');
      clone.classList.add('present');
      clone.querySelectorAll('.future, .past').forEach(el => {
        el.classList.remove('future', 'past');
        el.classList.add('present');
      });

      // Show all fragments and appearance-animated elements in final state.
      clone.querySelectorAll('.fragment').forEach(el => el.classList.add('visible'));
      clone.querySelectorAll('.animate__animated').forEach(el => el.classList.add('animationended'));

      // Disable media.
      clone.querySelectorAll('video, audio').forEach(el => {
        el.removeAttribute('src');
        el.removeAttribute('autoplay');
        el.removeAttribute('data-autoplay');
        el.querySelectorAll('source').forEach(s => s.remove());
      });
      clone.querySelectorAll('iframe').forEach(el => el.removeAttribute('src'));
      clone.querySelectorAll('aside.notes').forEach(el => el.remove());

      // Replace all inline styles (Reveal sets transform offsets, visibility:hidden, etc.)
      clone.style.cssText = placementCss + ';display:block;visibility:visible;opacity:1;pointer-events:none;';

      fakeSlides.appendChild(clone);
      fakeReveal.appendChild(fakeSlides);
      slideWrapEl.appendChild(fakeReveal);
    }

    deck.on('slidechanged', updateNextSlidePreview);
    deck.on('fragmentshown', updateNextSlidePreview);
    deck.on('fragmenthidden', updateNextSlidePreview);
    deck.on('overviewshown', updateNextSlidePreview);
    deck.on('overviewhidden', updateNextSlidePreview);

    return updateNextSlidePreview;
  }

  const updateNextSlidePreview = setupNextSlidePreview();

  revealTweaks(deck);
  contextMenu(deck);
  deck.addKeyBinding({ keyCode: 90, key: 'Z', description: 'Send presentation to peers' }, () => {
    sendPresentationToPeers();
  });
  deck.addKeyBinding({ keyCode: 81, key: 'Q', description: 'Close presentations on peers' }, () => {
    closePresentationsOnPeers();
  });

  deck.on('ready', () => {
    // Restore heading id anchors removed in marked v5+.
    deck.getSlides().forEach(slide => {
      slide.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(h => {
        if (!h.id) {
          h.id = h.textContent.trim().toLowerCase().replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');
        }
      });
    });

    notesViewportMode = getNotesViewportMode();
    updateNotesPaneVisibility();
    updateNextSlidePreview?.();

    if (typeof window.translatePage === 'function') {
      const userLanguage = String(navigator.language || 'en').slice(0, 2);
      window.translatePage(userLanguage);
    }

    // Let browser layout settle first
    window.setTimeout(() => {
      deck.layout?.();
      window.setTimeout(() => deck.layout?.(), 180);
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
      // Fade out the black screen cover (500ms, see #screen-cover CSS in presentation.html)
      const screenCover = document.getElementById('screen-cover');
      if (screenCover) screenCover.classList.add('faded-out');
    }, 500); // adjust if needed 
  });

  deck.on('slidechanged', updateNotesPaneVisibility);
  deck.on('fragmentshown', updateNotesPaneVisibility);
  deck.on('fragmenthidden', updateNotesPaneVisibility);
  deck.on('overviewshown', updateNotesPaneVisibility);
  deck.on('overviewhidden', updateNotesPaneVisibility);

  // When the notes pane has keyboard focus, intercept navigation keys and forward
  // them to Reveal. This covers the gap before beginAnimation's keydown listener
  // is active (3-second delay, no-overflow slides, etc.).
  // Capture phase so we beat the browser's default scroll-the-focused-div behaviour.
  if (document.body.dataset.variant === 'notes') {
    document.addEventListener('keydown', (e) => {
      // Only act when the focused element is inside the notes pane.
      if (!document.activeElement?.closest?.('.speaker-notes')) return;
      // beginAnimation's own onKeyDown listener handles this case with finer control.
      if (notesScrollDetachInteractionListeners) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!Number.isFinite(e.keyCode)) return;
      e.preventDefault();
      e.stopPropagation();
      document.activeElement.blur();
      deck.triggerKey?.(e.keyCode);
    }, true);
  }

  window.addEventListener('resize', () => {
    if (notesResizeDebounceTimer) {
      window.clearTimeout(notesResizeDebounceTimer);
    }
    notesResizeDebounceTimer = window.setTimeout(() => {
      notesResizeDebounceTimer = null;
      refreshNotesLayoutAfterViewportChange();
    }, 140);
  });
  window.addEventListener('orientationchange', () => {
    refreshNotesLayoutAfterViewportChange();
  });
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


function setHotReloading() {
  // VITE Hot Reloading Hook
  if (!import.meta.hot) return false;
  let reloadPending = false;

  const fadeAndReload = () => {
    const cover = document.getElementById('screen-cover');
    if (!cover || !cover.classList.contains('faded-out')) {
      location.reload();
      return;
    }
    cover.classList.remove('faded-out'); // triggers CSS fade to black (800ms)
    let done = false;
    const doReload = () => { if (!done) { done = true; location.reload(); } };
    cover.addEventListener('transitionend', (e) => {
      if (e.propertyName === 'opacity') doReload();
    }, { once: true });
    setTimeout(doReload, 950); // fallback if transitionend doesn't fire
  };

  import.meta.hot.on('reload-presentations', (data) => {
    if (!window.location.href.includes(`${data.slug}/`) || mdFile !== data.mdFile) return;
    if (reloadPending) return;
    reloadPending = Date.now();

    if (isRemoteFollower) {
      // Don't reload immediately — wait for the next navigation event from the
      // presenter so the follower reloads in sync rather than mid-slide.
      console.log('[HMR] Follower: deferring reload to next navigation');
      return;
    }

    console.log('[HMR] Reloading presentation');
    fadeAndReload();
  });

  // Followers: hook into RevealRemote so the reload fires on the next
  // incoming multiplex navigation rather than immediately.
  // Must be deferred to deck.on('ready') — getPlugin() returns undefined
  // if called before deck.initialize() has completed.
  if (isRemoteFollower) {
    window.deck.on('ready', () => {
      const remotePlugin = window.deck.getPlugin('RevealRemote');
      if (!remotePlugin) {
        console.warn('[HMR] Follower: RevealRemote plugin not found; deferred reload will not work');
        return;
      }
      if (!remotePlugin.onBeforeSync) {
        console.warn('[HMR] Follower: RevealRemote missing onBeforeSync hook; is node_modules up to date?');
        return;
      }
      remotePlugin.onBeforeSync(async () => {
        if (!reloadPending) return; // undefined → proceed normally
        let currentTime = Date.now();
        if (currentTime - reloadPending < 3000) {
          console.log('[HMR] Follower: onBeforeSync triggered but reload already pending — ignoring');
          return; // too soon since reload was triggered, likely same navigation event
        }
        // Fade then reload; return false to suppress this navigation
        // (we're about to reload anyway).
        console.log('[HMR] Follower: navigation received while reload pending — fading and reloading');
        await new Promise((resolve) => {
          const cover = document.getElementById('screen-cover');
          if (!cover || !cover.classList.contains('faded-out')) { resolve(); return; }
          cover.classList.remove('faded-out');
          let done = false;
          const finish = () => { if (!done) { done = true; resolve(); } };
          cover.addEventListener('transitionend', (e) => {
            if (e.propertyName === 'opacity') finish();
          }, { once: true });
          setTimeout(finish, 950);
        });
        location.reload();
        return false;
      });
    });
  }
}

})();
