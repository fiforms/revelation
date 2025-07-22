const container = document.getElementById('media-grid');
const urlParams = new URLSearchParams(window.location.search);
const url_key = urlParams.get('key');

const backLink = document.getElementById('back-link');
if (url_key) {
  const a = document.createElement('a');
  a.href = `/presentations.html?key=${url_key}`;
  a.textContent = '← Back to Presentations';
  a.style = 'color: #4da6ff; text-decoration: none; font-size: 1rem;';
  a.onmouseover = () => a.style.textDecoration = 'underline';
  a.onmouseout = () => a.style.textDecoration = 'none';
  backLink.appendChild(a);
}

// VITE Hot Reloading Hook
if (import.meta.hot) {
  import.meta.hot.on('reload-media', () => {
    console.log('[HMR] Reloading media list');
    location.reload();
  });
}

fetch(`/presentations_${url_key}/_media/index.json`)
  .then(res => res.json())
  .then(media => {
    const entries = Object.entries(media);
    if (!entries.length) {
      container.innerHTML = '<p>No media found.</p>';
      return;
    }

    container.innerHTML = '';

    for (const [key, item] of entries) {
      const card = document.createElement('div');
      card.className = 'media-card';

      const thumb = document.createElement('img');
      thumb.src = `/presentations_${url_key}/_media/${item.thumbnail}`;
      thumb.alt = item.title || item.original_filename;
      card.appendChild(thumb);

      const title = document.createElement('div');
      title.className = 'title';
      title.textContent = item.title || item.original_filename;
      card.appendChild(title);

      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.innerHTML = `
        ${item.description || ''}<br/>
        <small>${item.original_filename}</small><br/>
        ${item.copyright ? `<small>${item.copyright}</small><br/>` : ''}
      `;
      card.appendChild(meta);

      container.appendChild(card);
    }
  })
  .catch(err => {
    container.innerHTML = `<p style="color:red">Failed to load media index: ${err.message}</p>`;
    console.error(err);
  });
