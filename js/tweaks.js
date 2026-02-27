
export function revealTweaks(deck) {

    const isThumbnail = window.location.href.includes('backgroundTransition=none');

    const readyTweaks = () => {
      applyStackAttributes(deck);
      updateAttributionFromCurrentSlide(deck);
      ensureLinksOpenExternally(deck);
      updateFixedOverlayVisibility(deck);
    }

    deck.on('ready', readyTweaks);       
    deck.on('slidechanged', () => {
      updateAttributionFromCurrentSlide(deck);
      ensureLinksOpenExternally(deck);
      updateFixedOverlayVisibility(deck);
    });
    deck.on('overviewshown', () => updateFixedOverlayVisibility(deck));
    deck.on('overviewhidden', () => {
      updateAttributionFromCurrentSlide(deck);
      updateFixedOverlayVisibility(deck);
    });
    deck.on('pdf-ready', () => {
      enforcePdfPageBackground();
      fixFitMediaPdfLayout(deck);
      window.setTimeout(() => {
        enforcePdfPageBackground();
        fixFitMediaPdfLayout(deck);
      }, 80);
    });


    // Play videos with data-imagefit attribute when the slide is shown
    // This is necessary because Reveal.js may not autoplay videos in the background
    // and some browsers require user interaction to start video playback.

    if (!isThumbnail) {
      initBackgroundAudio(deck);
      initCountdowns(deck);
      initFitVideoControls(deck);
      deck.on('slidechanged', e => {
        e.currentSlide.querySelectorAll('video[data-imagefit]').forEach(v => {
          v.play().catch(() => {});
        });
      });

      deck.on('ready', e => {
        e.currentSlide.querySelectorAll('video[data-imagefit]').forEach(v => {
          v.play().catch(() => {});
        });
      });
    }
    
    scrubBackgroundVideos(isThumbnail);
    enforcePdfPageBackground();
    fixFitMediaPdfLayout(deck);
    hideControlsOnSpeakerNotes();
    doubleClickFullScreen();
    hideCursorOnIdle();
}

function fixFitMediaPdfLayout(deck) {
  const isPrintPdf = /(?:\?|&)print-pdf(?:&|$)/i.test(window.location.search);
  if (!isPrintPdf) return;

  const config = deck?.getConfig?.() || {};
  const baseWidth = Number(config.width) || 1920;
  const baseHeight = Number(config.height) || 1080;
  if (!baseWidth || !baseHeight) return;
  const targetAspect = baseHeight / baseWidth;

  const fitSlides = document.querySelectorAll('.reveal .slides .pdf-page > section');
  fitSlides.forEach((slide) => {
    if (!slide.querySelector('[data-imagefit]')) return;
    const page = slide.closest('.pdf-page');
    if (!page) return;

    const slideRect = slide.getBoundingClientRect();
    const pageRect = page.getBoundingClientRect();
    const slideWidth = slideRect.width || Number.parseFloat(slide.style.width) || 0;
    if (!slideWidth) return;

    const targetHeight = slideWidth * targetAspect;
    const top = Math.max((pageRect.height - targetHeight) / 2, 0);

    slide.style.top = `${top}px`;
    slide.style.height = `${targetHeight}px`;
    slide.style.minHeight = `${targetHeight}px`;
  });
}

function enforcePdfPageBackground() {
  const isPrintPdf = /(?:\?|&)print-pdf(?:&|$)/i.test(window.location.search);
  if (!isPrintPdf) return;

  const rootStyles = window.getComputedStyle(document.documentElement);
  const themeBackground = String(rootStyles.getPropertyValue('--r-background-color') || '').trim();
  if (!themeBackground) return;

  const pages = document.querySelectorAll('.reveal .slides .pdf-page');
  pages.forEach((page) => {
    page.style.backgroundColor = themeBackground;
  });
}

function initFitVideoControls(deck) {
  const wireSlideFitVideos = (slide) => {
    if (!slide) {
      return;
    }

    slide.querySelectorAll('video[data-imagefit]').forEach((video) => {
      if (video.dataset.fitVideoControlsWired === '1') {
        return;
      }
      video.dataset.fitVideoControlsWired = '1';

      const syncControlsToState = () => {
        video.controls = !!(video.paused || video.ended);
      };

      // With controls hidden, keep click useful by toggling pause/play directly.
      video.addEventListener('click', () => {
        if (video.controls) {
          return;
        }
        if (video.paused || video.ended) {
          video.play().catch(() => {});
          return;
        }
        video.pause();
      });

      video.addEventListener('play', syncControlsToState);
      video.addEventListener('pause', syncControlsToState);
      video.addEventListener('ended', syncControlsToState);
      syncControlsToState();
    });
  };

  deck.on('ready', (e) => wireSlideFitVideos(e.currentSlide));
  deck.on('slidechanged', (e) => wireSlideFitVideos(e.currentSlide));
}

function ensureLinksOpenExternally(deck) {
  const scope = deck?.getRevealElement?.() || document;
  scope.querySelectorAll('a[href]').forEach((link) => {
    const href = link.getAttribute('href');
    if (!href || href.trim().startsWith('#')) return;
    const trimmed = href.trim();

    let shouldOpenExternally = false;
    if (/^(mailto:|tel:)/i.test(trimmed)) {
      shouldOpenExternally = true;
    } else {
      try {
        const resolved = new URL(trimmed, window.location.href);
        const isHttp = resolved.protocol === 'http:' || resolved.protocol === 'https:';
        shouldOpenExternally = isHttp && resolved.host !== window.location.host;
      } catch {
        shouldOpenExternally = false;
      }
    }

    if (shouldOpenExternally) {
      link.setAttribute('target', '_blank');
      const rel = link.getAttribute('rel') || '';
      const relParts = new Set(rel.split(/\s+/).filter(Boolean));
      relParts.add('noopener');
      relParts.add('noreferrer');
      link.setAttribute('rel', Array.from(relParts).join(' '));
      return;
    }

    if (String(link.getAttribute('target') || '').toLowerCase() === '_blank') {
      link.removeAttribute('target');
    }
    const rel = link.getAttribute('rel') || '';
    if (rel) {
      const relParts = rel.split(/\s+/).filter(Boolean).filter((part) => {
        const lower = part.toLowerCase();
        return lower !== 'noopener' && lower !== 'noreferrer';
      });
      if (relParts.length) {
        link.setAttribute('rel', relParts.join(' '));
      } else {
        link.removeAttribute('rel');
      }
    }
  });
}

function applyStackAttributes(deck) {
  const revealElement = deck?.getRevealElement?.();
  if (!revealElement) {
    return;
  }

  const stacks = revealElement.querySelectorAll('.slides > section.stack');
  const attributeRegex = /([^"= ]+?)="([^"]+?)"|(data-[^"= ]+?)(?=[" ]|$)/g;

  stacks.forEach((stack) => {
    const firstVerticalSlide = Array.from(stack.children).find((child) => child.tagName === 'SECTION');
    if (!firstVerticalSlide) {
      return;
    }

    const markers = firstVerticalSlide.querySelectorAll('.revelation-stack-attrs[data-stack-attrs]');
    markers.forEach((marker) => {
      const encoded = marker.getAttribute('data-stack-attrs') || '';
      let attributeString = encoded;
      try {
        attributeString = decodeURIComponent(encoded);
      } catch {
        // Keep raw value if decode fails.
      }

      attributeRegex.lastIndex = 0;
      let match;
      while ((match = attributeRegex.exec(attributeString)) !== null) {
        if (match[2]) {
          stack.setAttribute(match[1], match[2]);
        } else if (match[3]) {
          stack.setAttribute(match[3], '');
        }
      }

      marker.remove();
    });
  });
}

function initBackgroundAudio(deck) {
  const audioEl = document.getElementById('background-audio-player');
  if (!audioEl) {
    return;
  }

  let lastCommand = null;

  const normalizeSrc = (src) => {
    try {
      return new URL(src, window.location.href).href;
    } catch {
      return src;
    }
  };

  const stopAudio = () => {
    audioEl.pause();
    audioEl.currentTime = 0;
    audioEl.removeAttribute('src');
    audioEl.load();
    lastCommand = 'stop';
  };

  const startAudio = (src, loop) => {
    const normalized = normalizeSrc(src);
    const current = audioEl.src ? normalizeSrc(audioEl.src) : '';
    const commandKey = `play:${normalized}:${loop ? 'loop' : 'once'}`;

    if (lastCommand === commandKey) {
      return;
    }

    const isSameSrc = current && normalized === current;
    audioEl.loop = !!loop;

    if (!isSameSrc) {
      audioEl.src = src;
      audioEl.currentTime = 0;
    } else if (audioEl.ended && !audioEl.loop) {
      lastCommand = commandKey;
      return;
    }

    audioEl.play().catch(() => {});
    lastCommand = commandKey;
  };

  const handleSlideAudio = (slide) => {
    if (!slide) {
      return;
    }

    if (slide.hasAttribute('data-background-audio-stop')) {
      stopAudio();
      return;
    }

    const loopSrc = slide.getAttribute('data-background-audio-loop');
    const startSrc = slide.getAttribute('data-background-audio-start');

    if (loopSrc) {
      startAudio(loopSrc, true);
      return;
    }

    if (startSrc) {
      startAudio(startSrc, false);
    }
  };

  deck.on('ready', e => handleSlideAudio(e.currentSlide));
  deck.on('slidechanged', e => handleSlideAudio(e.currentSlide));
}

function initCountdowns(deck) {
  const activeIntervals = [];

  const clearCountdownIntervals = () => {
    while (activeIntervals.length > 0) {
      const id = activeIntervals.pop();
      window.clearInterval(id);
    }
  };

  const pad2 = (value) => String(Math.max(0, Number.parseInt(value, 10) || 0)).padStart(2, '0');

  const formatTime = (seconds) => {
    const total = Math.max(0, Number.parseInt(seconds, 10) || 0);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    if (hours > 0) {
      return `${pad2(hours)}:${pad2(minutes)}:${pad2(secs)}`;
    }
    return `${pad2(minutes)}:${pad2(secs)}`;
  };

  const secondsUntilClockTime = (hour, minute) => {
    const now = new Date();
    const target = new Date(now);
    target.setHours(hour, minute, 0, 0);
    if (target.getTime() < now.getTime()) {
      target.setDate(target.getDate() + 1);
    }
    return Math.max(0, Math.ceil((target.getTime() - now.getTime()) / 1000));
  };

  const updateCountdownsOnSlide = (slide) => {
    clearCountdownIntervals();
    if (!slide) {
      return;
    }

    const countdownEls = slide.querySelectorAll('.countdown[data-countdown-mode]');
    countdownEls.forEach((el) => {
      const mode = (el.dataset.countdownMode || '').toLowerCase();

      if (mode === 'from') {
        const durationSeconds = Number.parseInt(el.dataset.countdownSeconds || '', 10);
        if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
          return;
        }
        const startMs = Date.now();
        const tickFrom = () => {
          const elapsed = Math.floor((Date.now() - startMs) / 1000);
          const remaining = Math.max(0, durationSeconds - elapsed);
          el.textContent = formatTime(remaining);
        };
        tickFrom();
        activeIntervals.push(window.setInterval(tickFrom, 250));
        return;
      }

      if (mode === 'to') {
        const hour = Number.parseInt(el.dataset.countdownHour || '', 10);
        const minute = Number.parseInt(el.dataset.countdownMinute || '', 10);
        if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
          return;
        }
        const tickTo = () => {
          el.textContent = formatTime(secondsUntilClockTime(hour, minute));
        };
        tickTo();
        activeIntervals.push(window.setInterval(tickTo, 250));
      }
    });
  };

  deck.on('ready', e => updateCountdownsOnSlide(e.currentSlide));
  deck.on('slidechanged', e => updateCountdownsOnSlide(e.currentSlide));
}

// Hide the cursor after a period of inactivity
function hideCursorOnIdle() {
  let timer;
  const hideDelay = 2000; // milliseconds

  document.addEventListener('mousemove', () => {
    document.body.style.cursor = 'default';
    clearTimeout(timer);
    timer = setTimeout(() => {
      document.body.style.cursor = 'none';
    }, hideDelay);
  });
}

// Disable video backgrounds in speaker notes view (iFrames)
function scrubBackgroundVideos(isThumbnail) {
    if (isThumbnail) {
      document.querySelectorAll('.slide-background-content video').forEach(video => {
        if (!video.hasAttribute('data-paused-by-notes')) {
          video.pause();
          video.remove();  // or: video.src = ""; video.load();
          video.setAttribute('data-paused-by-notes', 'true');
          console.log('[Notes] Paused and removed background video');
        }
      });
      // Re-run after 1 second
      setTimeout(() => scrubBackgroundVideos(true), 1000);
    }
}

function updateAttributionFromCurrentSlide(deck) {
    const currentSlide = deck.getCurrentSlide();
    if (!currentSlide) {
      return;
    }
    const source = currentSlide.querySelector('.slide-attribution');
    const overlay = document.getElementById('fixed-overlay-wrapper');
    const aiSource = currentSlide.querySelector('.slide-ai-symbol');
    const aiOverlay = document.getElementById('fixed-ai-wrapper');

    if (source) {
    overlay.innerHTML = source.innerHTML;
    overlay.style.display = '';
    } else {
    overlay.innerHTML = '';
    overlay.style.display = 'none';
    }

    if (aiOverlay) {
      if (aiSource) {
        aiOverlay.innerHTML = aiSource.innerHTML;
        aiOverlay.style.display = '';
      } else {
        aiOverlay.innerHTML = '';
        aiOverlay.style.display = 'none';
      }
    }

    const tintcolor = currentSlide.getAttribute('data-tint-color');
    const tint = document.getElementById('fixed-tint-wrapper');
    const tintFadeMs = 300;
    const tintStyle = resolveTintStyle(tintcolor);

    if (!tint) {
      return;
    }

    const tintLayers = ensureTintLayers(tint, tintFadeMs);
    const wasHidden = getComputedStyle(tint).display === 'none';
    tint.style.transition = `opacity ${tintFadeMs}ms ease`;

    if (tint._hideTimeout) {
      clearTimeout(tint._hideTimeout);
      tint._hideTimeout = null;
    }

    if (tintStyle) {
      const activeIndex = tint._activeTintLayerIndex ?? 0;
      const inactiveIndex = activeIndex === 0 ? 1 : 0;
      const activeLayer = tintLayers[activeIndex];
      const inactiveLayer = tintLayers[inactiveIndex];
      const targetSignature = tintStyleSignature(tintStyle);
      const activeSignature = activeLayer.dataset.tintSignature || '';

      if (activeSignature !== targetSignature) {
        applyTintStyleToLayer(inactiveLayer, tintStyle);

        if (wasHidden) {
          activeLayer.style.opacity = '0';
          inactiveLayer.style.opacity = '1';
        } else {
          inactiveLayer.style.opacity = '0';
          void inactiveLayer.offsetHeight;
          inactiveLayer.style.opacity = '1';
          activeLayer.style.opacity = '0';
        }

        tint._activeTintLayerIndex = inactiveIndex;
      } else {
        activeLayer.style.opacity = '1';
        inactiveLayer.style.opacity = '0';
      }

      if (wasHidden) {
        tint.style.display = '';
        tint.style.opacity = '0';
        void tint.offsetHeight;
      }
      tint.style.opacity = '1';
    } else if (!wasHidden) {
      tint.style.opacity = '0';
      tint._hideTimeout = setTimeout(() => {
        tint.style.display = 'none';
      }, tintFadeMs);
    }
}

function updateFixedOverlayVisibility(deck) {
  const inOverview = !!deck?.isOverview?.();
  const visibility = inOverview ? 'hidden' : '';
  ['fixed-tint-wrapper', 'fixed-ai-wrapper', 'fixed-overlay-wrapper'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.style.visibility = visibility;
    }
  });
}

function resolveTintStyle(rawTint) {
  if (!rawTint) {
    return null;
  }

  const value = rawTint.trim();
  if (!value) {
    return null;
  }

  if (/^image\s*:/i.test(value)) {
    const source = value.replace(/^image\s*:/i, '').trim();
    if (!source) {
      return null;
    }
    return {
      type: 'image',
      value: normalizeTintImageValue(source)
    };
  }

  if (/^(linear-gradient|radial-gradient|conic-gradient)\s*\(/i.test(value)) {
    return { type: 'gradient', value };
  }

  return { type: 'color', value };
}

function normalizeTintImageValue(source) {
  if (/^url\(/i.test(source)) {
    return source;
  }

  const unquoted = source.replace(/^['"]|['"]$/g, '');
  const escaped = unquoted.replace(/"/g, '\\"');
  return `url("${escaped}")`;
}

function ensureTintLayers(tint, tintFadeMs) {
  if (Array.isArray(tint._tintLayers) && tint._tintLayers.length === 2) {
    tint.style.backgroundColor = 'transparent';
    tint.style.backgroundImage = 'none';
    tint._tintLayers.forEach((layer) => {
      layer.style.transition = `opacity ${tintFadeMs}ms ease`;
    });
    return tint._tintLayers;
  }

  const createLayer = () => {
    const layer = document.createElement('div');
    layer.style.position = 'absolute';
    layer.style.top = '0';
    layer.style.left = '0';
    layer.style.width = '100%';
    layer.style.height = '100%';
    layer.style.pointerEvents = 'none';
    layer.style.opacity = '0';
    layer.style.transition = `opacity ${tintFadeMs}ms ease`;
    layer.style.backgroundColor = 'transparent';
    layer.style.backgroundImage = 'none';
    return layer;
  };

  const layerA = createLayer();
  const layerB = createLayer();
  tint.style.backgroundColor = 'transparent';
  tint.style.backgroundImage = 'none';
  tint.append(layerA, layerB);

  tint._tintLayers = [layerA, layerB];
  tint._activeTintLayerIndex = 0;
  return tint._tintLayers;
}

function tintStyleSignature(tintStyle) {
  return tintStyle ? `${tintStyle.type}:${tintStyle.value}` : '';
}

function applyTintStyleToLayer(layer, tintStyle) {
  layer.style.backgroundColor = 'transparent';
  layer.style.backgroundImage = 'none';
  layer.style.backgroundPosition = '';
  layer.style.backgroundRepeat = '';
  layer.style.backgroundSize = '';

  if (tintStyle.type === 'color') {
    layer.style.backgroundColor = tintStyle.value;
  } else {
    layer.style.backgroundImage = tintStyle.value;
  }

  if (tintStyle.type === 'image') {
    layer.style.backgroundPosition = 'center';
    layer.style.backgroundRepeat = 'no-repeat';
    layer.style.backgroundSize = 'cover';
  }

  layer.dataset.tintSignature = tintStyleSignature(tintStyle);
}

function hideControlsOnSpeakerNotes() {
    window.addEventListener('message', event => {
      // Reveal Notes plugin sends this message from the notes window
      let edata = event.data;
      if (typeof edata === 'string') {
        try {
          edata = JSON.parse(edata);
        } catch {
          return;
        }
      }
      if (!edata || typeof edata !== 'object') return;
      if (edata.namespace === 'reveal-notes' && edata.type === 'connected') {
        console.log('Speaker Notes Connected, hiding controls');
        document.querySelector('.controls')?.classList.add('hide-when-notes');
        document.querySelector('.progress')?.classList.add('hide-when-notes');
      }
    });
}

function doubleClickFullScreen() {
    const urlParams = new URLSearchParams(window.location.search);
    const forceControls = urlParams.get('forceControls') === '1';
    if (forceControls) {
      // if forceControls mode is on, do not enable double-click fullscreen
      return;
    }
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
