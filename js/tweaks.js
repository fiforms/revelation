
export function revealTweaks(deck) {
    const updateAttribution = () => updateAttributionFromCurrentSlide(deck);

    deck.on('ready', updateAttribution);       
    deck.on('slidechanged', () => updateAttributionFromCurrentSlide(deck));

    
    scrubBackgroundVideos();
    hideControlsOnSpeakerNotes();
    doubleClickFullScreen();
    hideCursorOnIdle();
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

function updateAttributionFromCurrentSlide(deck) {
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
