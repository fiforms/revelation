export function contextMenu(deck) {
    document.addEventListener('contextmenu', function (e) {
      e.preventDefault();

      const existing = document.getElementById('reveal-context-menu');
      if (existing) existing.remove();

      const menu = document.createElement('div');
      menu.id = 'reveal-context-menu';
      const menuWidth = 220;
      const menuHeight = 280;

      const maxLeft = window.innerWidth - menuWidth - 10;
      const maxTop = window.innerHeight - menuHeight - 10;

      const clampedX = Math.min(e.clientX, maxLeft);
      const clampedY = Math.min(e.clientY, maxTop);

      menu.style = `
        position: fixed;
        top: ${clampedY}px;
        left: ${clampedX}px;
        background: #222;
        border: 1px solid #444;
        border-radius: 6px;
        color: white;
        z-index: 9999;
        font-family: sans-serif;
        box-shadow: 0 0 8px #000;
      `;

      const isLocal = window.location.hostname === 'localhost';

      const canSendToPeers = !!window.electronAPI?.sendPeerCommand || (window.parent && window.parent !== window);

      const items = [
        { label: tr('Show Reveal.js Help (?)'), action: () => deck.toggleHelp() },
        { label: tr('Show Speaker Notes (s)'), action: () => deck.getPlugins().notes.open() },
        { label: tr('Toggle Fullscreen'), action: () => toggleFullscreen() },
        ...(!isLocal ? [
          { label: tr('Toggle Remote Follower Link (a)'), action: () => fireRevealKey('a') },
          { label: tr('Toggle Remote Control Link (r)'), action: () => fireRevealKey('r') }
	  ] : []),
        ...(canSendToPeers ? [
          { label: tr('Send Presentation to Peers (z)'), action: () => sendPresentationToPeers() },
          { label: tr('Close Presentations on Peers (q)'), action: () => closePresentationsOnPeers() }
        ] : []),
        { label: deck.isOverview() ? tr('Close Overview (ESC)') : tr('Overview (ESC)'), action: () => deck.toggleOverview() },
        { label: deck.isPaused() ? tr('Unpause/Unblank (b)') : tr('Pause/Blank (b)'), action: () => deck.togglePause() }
      ];

      if (e.target.tagName === 'A' && e.target.href) {
        const link = e.target.href;
        items.unshift(
          { label: tr('Open Link in New Tab'), action: () => window.open(link, '_blank') },
		  {
              label: tr('Copy Link Address'),
              action: () => {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                  navigator.clipboard.writeText(link)
                    .then(() => console.log('✅ ' + tr('Link copied to clipboard')))
                    .catch(err => {
                      console.error('❌ Clipboard error:', err);
                      fallbackCopyText(link);
                    });
                } else {
                  fallbackCopyText(link);
                }
              }
            }

        );
      }

      const plugins = Object.entries(window.RevelationPlugins)
        .map(([name, plugin]) => ({
          name,
          plugin,
          priority: plugin.priority
        }))
        .sort((a, b) => a.priority - b.priority);  // Ascending = high priority first


      for (const { plugin } of plugins) {
        if (typeof plugin.getPresentationMenuItems === 'function') {
          const menuItems = plugin.getPresentationMenuItems(deck);
          if (Array.isArray(menuItems)) {
            items.push(...menuItems);
          }
        }
      }

      items.push({ label: tr('Close Presentation'), action: () => closePresentation() });


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

export function sendPresentationToPeers() {
  const url = getPeerShareUrl();
  if (!url) {
    alert(tr('Remote share link not ready yet.'));
    return;
  }

  if (window.electronAPI?.sendPeerCommand) {
    window.electronAPI.sendPeerCommand({
      type: 'open-presentation',
      payload: { url }
    });
    return;
  }

  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: 'pip-send-to-peers', payload: { url } }, '*');
    return;
  }

  console.warn('Peer commands unavailable outside Electron.');
}

export function closePresentationsOnPeers() {
  if (window.electronAPI?.sendPeerCommand) {
    window.electronAPI.sendPeerCommand({
      type: 'close-presentation',
      payload: {}
    });
    return;
  }

  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: 'pip-close-on-peers' }, '*');
    return;
  }

  console.warn('Peer commands unavailable outside Electron.');
}

function getPeerShareUrl() {
  const baseUrl = window.location.href.replace(/#.*/, '');
  const canonicalBaseUrl = stripPeerModeParams(baseUrl);
  if (!window.localStorage) return null;

  try {
    const presentations = JSON.parse(window.localStorage.getItem('presentations') || '{}');
    const entry = presentations[baseUrl] || presentations[canonicalBaseUrl];
    const multiplexId = entry?.multiplexId;
    if (!multiplexId) return null;

    const joiner = canonicalBaseUrl.includes('?') ? '&' : '?';
    return `${canonicalBaseUrl}${joiner}remoteMultiplexId=${multiplexId}`;
  } catch (err) {
    console.warn('Failed to read remote share link from local storage.', err);
    return null;
  }
}

function stripPeerModeParams(url) {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete('lang');
    parsed.searchParams.delete('variant');
    return parsed.toString();
  } catch {
    return url;
  }
}

function fallbackCopyText(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';  // avoid scroll jump
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    document.execCommand('copy');
    console.log('✅ Link copied (fallback)');
  } catch (err) {
    console.error('❌ Fallback copy failed', err);
    alert('Failed to copy the link. You can do it manually:\n' + text);
  }
  document.body.removeChild(textarea);
}



function toggleFullscreen() {
  if (window.electronAPI?.toggleFullScreen) {
    window.electronAPI.toggleFullScreen();
  } else {
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
  }
}

function closePresentation() {
  if (window.electronAPI?.closePresentation) {
    window.electronAPI.closePresentation();
    return;
  }
  if (window.parent && window.parent !== window) {
    window.parent.postMessage('pip-close-presentation', '*');
    return;
  } else {
    // Try to close the browser tab/window
    window.close();

    // If window.close() fails (e.g., not opened via script), show a fallback message
    if (!window.closed) {
      alert(tr("Please close this tab manually."));
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
