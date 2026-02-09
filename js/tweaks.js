
export function revealTweaks(deck) {

    const isThumbnail = window.location.href.includes('backgroundTransition=none');

    const readyTweaks = () => {
      updateAttributionFromCurrentSlide(deck);
      ensureLinksOpenExternally(deck);
    }

    deck.on('ready', readyTweaks);       
    deck.on('slidechanged', () => {
      updateAttributionFromCurrentSlide(deck);
      ensureLinksOpenExternally(deck);
    });


    // Play videos with data-imagefit attribute when the slide is shown
    // This is necessary because Reveal.js may not autoplay videos in the background
    // and some browsers require user interaction to start video playback.

    if (!isThumbnail) {
      initBackgroundAudio(deck);
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
    hideControlsOnSpeakerNotes();
    doubleClickFullScreen();
    hideCursorOnIdle();
}

function ensureLinksOpenExternally(deck) {
  const scope = deck?.getRevealElement?.() || document;
  scope.querySelectorAll('a[href]').forEach((link) => {
    const href = link.getAttribute('href');
    if (!href || href.trim().startsWith('#')) return;
    link.setAttribute('target', '_blank');
    const rel = link.getAttribute('rel') || '';
    const relParts = new Set(rel.split(/\s+/).filter(Boolean));
    relParts.add('noopener');
    relParts.add('noreferrer');
    link.setAttribute('rel', Array.from(relParts).join(' '));
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
    console.log('Tint style for current slide:', tintStyle);

    if (!tint) {
      return;
    }

    tint.style.transition = `opacity ${tintFadeMs}ms ease, background-color ${tintFadeMs}ms ease, background-image ${tintFadeMs}ms ease,`;

    if (tint._hideTimeout) {
      clearTimeout(tint._hideTimeout);
      tint._hideTimeout = null;
    }

    if (tintStyle) {
      tint.style.backgroundColor = 'transparent';
      tint.style.backgroundImage = 'none';
      tint.style.backgroundPosition = '';
      tint.style.backgroundRepeat = '';
      tint.style.backgroundSize = '';

      if (tintStyle.type === 'color') {
        tint.style.backgroundColor = tintStyle.value;
      } else {
        console.log('Setting background image to ' + tintStyle.value)
        tint.style.backgroundImage = tintStyle.value;
      }

      if (tintStyle.type === 'image') {
        tint.style.backgroundPosition = 'center';
        tint.style.backgroundRepeat = 'no-repeat';
        tint.style.backgroundSize = 'cover';
      }

      if (getComputedStyle(tint).display === 'none') {
        tint.style.display = '';
        tint.style.opacity = '0';
        // Force a reflow so the opacity transition starts from 0.
        void tint.offsetHeight;
      }
      tint.style.opacity = '1';
    } else if (getComputedStyle(tint).display !== 'none') {
      tint.style.opacity = '0';
      tint._hideTimeout = setTimeout(() => {
        tint.style.display = 'none';
      }, tintFadeMs);
    }
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
