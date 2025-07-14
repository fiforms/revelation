export function contextMenu(deck) {
    document.addEventListener('contextmenu', function (e) {
      e.preventDefault();

      const existing = document.getElementById('reveal-context-menu');
      if (existing) existing.remove();

      const menu = document.createElement('div');
      menu.id = 'reveal-context-menu';
      menu.style = `
        position: fixed;
        top: ${e.clientY}px;
        left: ${e.clientX}px;
        background: #222;
        border: 1px solid #444;
        border-radius: 6px;
        color: white;
        z-index: 9999;
        font-family: sans-serif;
        box-shadow: 0 0 8px #000;
      `;

      const items = [
        { label: 'Show Reveal.js Help (?)', action: () => deck.toggleHelp() },
        { label: 'Show Speaker Notes (s)', action: () => deck.getPlugins().notes.open() },
        { label: 'Toggle Fullscreen', action: () => fireRevealKey('f') },
        { label: 'Toggle Remote Follower Link (a)', action: () => fireRevealKey('a') },
        { label: 'Toggle Remote Control Link (r)', action: () => fireRevealKey('r') },
        { label: deck.isOverview() ? 'Close Overview (ESC)' : 'Overview (ESC)', action: () => deck.toggleOverview() },
        { label: deck.isPaused() ? 'Unpause (b)' : 'Pause/Blank (b)', action: () => deck.togglePause() },
        { label: 'Close Presentation', action: () => closePresentation() }
      ];

      items.forEach(({ label, action }) => {
        const item = document.createElement('div');
        item.textContent = label;
        item.style = 'padding: 0.5rem 1rem; cursor: pointer;';
        item.onmouseover = () => item.style.background = '#444';
        item.onmouseout = () => item.style.background = 'transparent';
        item.onclick = () => {
          action();
          menu.remove();
        };
        menu.appendChild(item);
      });

      document.body.appendChild(menu);
      document.addEventListener('click', () => menu.remove(), { once: true });
    });
}

function closePresentation() {
  if (window.electronAPI?.closeWindow) {
    window.electronAPI.closeWindow();
  } else {
    // Try to close the browser tab/window
    window.close();

    // If window.close() fails (e.g., not opened via script), show a fallback message
    if (!window.closed) {
      alert("Please close this tab manually.");
    }
  }
}

function fireRevealKey(key) {
  const code = key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0;
  const event = new KeyboardEvent('keydown', {
    key,
    keyCode: code,
    bubbles: true,
    cancelable: true
  });
  document.dispatchEvent(event);
}

