
fetch('./presentations/index.json')
      .then(res => res.json())
      .then(presentations => {
        const container = document.getElementById('presentation-list');
        presentations.forEach(pres => {
          const card = document.createElement('a');
          card.href = `./presentations/${pres.slug}/?p=${pres.md}`;
          card.target = '_blank';
          card.className = 'card';
          card.innerHTML = `
            <img src="./presentations/${pres.slug}/${pres.thumbnail}" alt="${pres.title}">
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
	        window.open(`./presentations/${pres.slug}/index.html?p=${pres.md}`, 'revelation_presentation',
		'toolbar=no,location=no,status=no,menubar=no,scrollbars=no,resizable=yes,width=1920,height=1080')
	    }
          });

 	  card.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showCustomContextMenu(e.pageX, e.pageY, pres);
          });

          container.appendChild(card);

        });
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
	        window.open(`./presentations/${pres.slug}/index.html?p=${pres.md}`, '_blank')
	    }
        }
      },
    { label: 'Print / Export PDF', action: () => window.open(`./presentations/${pres.slug}/index.html?print-pdf&p=${pres.md}`, '_blank') },
    { label: 'Handout View', action: () => window.open(`./presentations/${pres.slug}/handout?p=${pres.md}`, '_blank') }
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
      label: 'Export Presentation',
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

