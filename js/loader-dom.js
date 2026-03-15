export function ensureHiddenSlidePreviewStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('revelation-hidden-slide-preview-styles')) return;

  const styleEl = document.createElement('style');
  styleEl.id = 'revelation-hidden-slide-preview-styles';
  styleEl.textContent = `
    #fixed-hidden-preview-wrapper {
      position: fixed;
      inset: 0;
      display: none;
      align-items: center;
      justify-content: center;
      font-size: clamp(2rem, 7vw, 5rem);
      font-weight: 800;
      letter-spacing: 0.24em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.9);
      background: rgba(128, 0, 0, 0.28);
      border: 0.2rem solid rgba(255, 255, 255, 0.3);
      pointer-events: none;
      z-index: 30;
      text-shadow: 0 0.08em 0.2em rgba(0, 0, 0, 0.45);
      box-sizing: border-box;
    }
  `;
  document.head.appendChild(styleEl);
}

export function createAlternativeSelector({ alternatives, sanitizeMarkdownFilename, onSelect }) {
  console.log('Showing Selector for Alternative Version');
  const selector = document.createElement('div');
  selector.style = 'position: fixed; top: 40%; left: 40%; background: rgba(0,0,0,0.85); color: white; padding: 1rem; border-radius: 8px; z-index: 9999; font-family: sans-serif;';
  selector.innerHTML = `<strong style="display:block;margin-bottom:0.5rem;">Select Version:</strong>`;

  for (const [file, label] of Object.entries(alternatives)) {
    const sanitizedFile = sanitizeMarkdownFilename(file);
    if (!sanitizedFile) continue;
    if (String(file || '').trim().toLowerCase() === 'self') continue;
    if (String(label || '').trim().toLowerCase() === 'hidden') continue;
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style = 'display: block; width: 100%; margin: 0.25rem 0; background: #444; color: white; border: none; padding: 0.5rem; border-radius: 4px; cursor: pointer;';
    btn.onclick = async () => {
      document.body.classList.add('hidden');
      selector.remove();
      onSelect(sanitizedFile);
    };
    selector.appendChild(btn);
  }
  document.body.appendChild(selector);
  document.body.classList.remove('hidden');
}
