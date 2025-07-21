
const urlParams = new URLSearchParams(window.location.search);
const url_key = urlParams.get('key');
const url_prefix = `/presentations_${url_key}`;

const container = document.getElementById('presentation-list');

if(!url_key) {
    container.innerHTML = 'No key specified, unable to load presentation list';
}

// VITE Hot Reloading Hook
if (import.meta.hot) {
  import.meta.hot.on('reload-presentations', () => {
    console.log('[HMR] Reloading presentation list');
    location.reload();
  });
}

electronAPI?.onShowToast((msg) => {
  showToast(msg);
});


fetch(`${url_prefix}/index.json`)
      .then(res => {
        if (!res.ok) {
          if (res.status === 403) {
            throw new Error('Access denied. This presentation list is restricted.');
          } else {
            throw new Error(`Failed to load presentations: ${res.status} ${res.statusText}`);
          }
        }
        return res.json();
      })
      .then(presentations => {

        if (!presentations.length) {
          container.innerHTML = '<p>No presentations available.</p>';
          return;
        }

        presentations.forEach(pres => {
          const card = document.createElement('a');
          card.href = `${url_prefix}/${pres.slug}/?p=${pres.md}`;
          card.target = '_blank';
          card.className = 'card';
          card.innerHTML = `
            <img src="${url_prefix}/${pres.slug}/${pres.thumbnail}" alt="${pres.title}">
            <div class="card-content">
              <div class="card-title">${pres.title}</div>
              <div class="card-desc">${pres.description}</div>
            </div>
          `;

          card.addEventListener('click', (e) => {
            e.preventDefault(); // Prevent default navigation
            if (window.electronAPI?.openPresentation) {
              window.electronAPI.openPresentation(pres.slug, pres.md, true);
            }
	    else {
	        window.open(`${url_prefix}/${pres.slug}/index.html?p=${pres.md}`, 'revelation_presentation',
		'toolbar=no,location=no,status=no,menubar=no,scrollbars=no,resizable=yes,width=1920,height=1080')
	    }
          });

 	  card.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showCustomContextMenu(e.pageX, e.pageY, pres);
          });

          container.appendChild(card);
        });
	})
        .catch(err => {
          container.innerHTML = `
            <div style="color: red; font-weight: bold; padding: 1rem;">
              ❌ ${err.message}
            </div>
          `;
          console.error('[Presentation Load Error]', err);

});

// Display hostname in top-right corner
const hostnameDiv = document.getElementById('hostname-indicator');
if (hostnameDiv) {
  hostnameDiv.textContent = window.location.hostname;
}


function showCustomContextMenu(x, y, pres) {
  const existing = document.getElementById('custom-context-menu');
  if (existing) existing.remove();

  const menu = document.createElement('div');
  menu.id = 'custom-context-menu';
  menu.style = `
    position: absolute;
    top: ${y}px;
    left: ${x}px;
    background: #222;
    border: 1px solid #555;
    border-radius: 8px;
    color: white;
    z-index: 9999;
    font-family: sans-serif;
    min-width: 200px;
    box-shadow: 0 0 10px #000;
  `;

  const target = window.electronAPI?.editPresentation ? 'Window' : 'Tab';
  const options = [
    { label: `Open in ${target}`, action: () => {
            if (window.electronAPI?.openPresentation) {
	        window.electronAPI.openPresentation(pres.slug, pres.md, false);
	    }
	    else {
	        window.open(`${url_prefix}/${pres.slug}/index.html?p=${pres.md}`, '_blank')
	    }
        }
      },
    { 
        label: 'Copy Link',
        action: () => {
                const link = `${window.location.origin}${url_prefix}/${pres.slug}/index.html?p=${pres.md}`;
                if (navigator.clipboard && navigator.clipboard.writeText) {
                  navigator.clipboard.writeText(link)
                    .then(() => console.log('✅ Link copied to clipboard'))
                    .catch(err => {
                      console.error('❌ Clipboard error:', err);
                      fallbackCopyText(link);
                    });
                } else {
                  fallbackCopyText(link);
                }
              }
       },
    { label: 'Handout View', action: () => handoutView(pres.slug,pres.md) }
  ];


  if (window.electronAPI?.editPresentation) {
    options.push({
      label: 'Edit Markdown',
      action: () => window.electronAPI.editPresentation(pres.slug, pres.md)
    });
    options.push({
      label: 'Show Presentation Files',
      action: () => window.electronAPI.showPresentationFolder(pres.slug)
    });
    options.push({
      label: 'Export as ZIP',
      action: async () => {
        const result = await window.electronAPI.exportPresentation(pres.slug);
        if (result?.success) {
          alert(`✅ Exported to: ${result.filePath}`);
        } else if (!result?.canceled) {
          alert(`❌ Export failed: ${result?.error || 'Unknown error'}`);
        }
      }
    });
  }
  options.push({
    label: 'Export as PDF',
    action: () => exportPDF(pres.slug, pres.md)
  });


  for (const opt of options) {
    const item = document.createElement('div');
    item.textContent = opt.label;
    item.style = 'padding: 0.5rem 1rem; cursor: pointer;';
    item.onmouseover = () => item.style.background = '#444';
    item.onmouseout = () => item.style.background = 'transparent';
    item.onclick = () => {
      opt.action();
      menu.remove();
    };
    menu.appendChild(item);
  }

  document.body.appendChild(menu);

  document.addEventListener('click', () => menu.remove(), { once: true });
}

function handoutView(slug, mdFile) {
  if (window.electronAPI?.openHandoutView) {
    window.electronAPI.openHandoutView(slug, mdFile);
  } else {
    window.open(`${url_prefix}/${slug}/handout?p=${mdFile}`, '_blank');
  } 
}


function exportPDF(slug, mdFile) {
  if(window.electronAPI?.exportPresentationPDF) {
    window.electronAPI.exportPresentationPDF(slug, mdFile)
      .then(result => {
        if (result.success) {
          alert(`✅ PDF exported to: ${result.filePath}`);
        } else {
          // alert('❌ PDF export failed');
        }
      })
      .catch(err => {
        console.error('PDF Export Error:', err);
        // alert('❌ PDF export failed: ' + err.message);
      });
    } 
    else {
      window.open(`${url_prefix}/${slug}/index.html?print-pdf&p=${mdFile}`, '_blank') 
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

function showToast(message) {
  const existing = document.getElementById('toast-message');
  if (existing) existing.remove(); // Only one toast at a time

  const toast = document.createElement('div');
  toast.id = 'toast-message';
  toast.textContent = message;

  toast.style = `
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.85);
    color: #fff;
    padding: 0.8rem 1.2rem;
    border-radius: 8px;
    font-size: 1rem;
    font-family: sans-serif;
    box-shadow: 0 2px 10px rgba(0,0,0,0.4);
    opacity: 0;
    transition: opacity 0.5s ease-in-out;
    z-index: 9999;
  `;

  document.body.appendChild(toast);
  // Trigger fade-in
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
  });

  // Fade out after 5 seconds
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, 5000);
}