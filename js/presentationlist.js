
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
          container.appendChild(card);
 	  card.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showCustomContextMenu(e.pageX, e.pageY, pres);
          });

        });
});


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

  const options = [
    { label: 'Open in New Tab', action: () => window.open(`./presentations/${pres.slug}/index.html?p=${pres.md}`, '_blank') },
    { label: 'Print / Export PDF', action: () => window.open(`./presentations/${pres.slug}/index.html?print-pdf&p=${pres.md}`, '_blank') },
    { label: 'Handout View', action: () => window.open(`./presentations/${pres.slug}/handout?p=${pres.md}`, '_blank') }
  ];

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

