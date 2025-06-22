import Reveal from 'reveal.js';
import Markdown from 'reveal.js/plugin/markdown/markdown.esm.js';
import Notes from 'reveal.js/plugin/notes/notes.esm.js';
import Zoom from 'reveal.js/plugin/zoom/zoom.esm.js';
import Search from 'reveal.js/plugin/search/search.esm.js';

const deck = new Reveal({
  plugins: [Markdown, Notes, Zoom, Search],
});
deck.initialize();

  
// Disable video backgrounds in speaker notes view (iFrames)
(function scrubBackgroundVideos() {
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
})();


// Get base URL of the current presentation (e.g., /presentations/sermon-1/)
const baseUrl = window.location.pathname.replace(/\/[^\/]*$/, '/');

// Load metadata.json relative to the current presentation folder
fetch(`${baseUrl}metadata.json`)
      .then(res => res.json())
      .then(meta => {
        document.title = meta.title || "Reveal.js Presentation";

        // Load theme from metadata
        if (meta.theme) {
          document.getElementById('theme-stylesheet').href = meta.theme;
        }
      });

