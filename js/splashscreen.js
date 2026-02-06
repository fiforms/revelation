(function() {
  if(!window.splashScreenEnabled) return;
  const splash = document.createElement('div');
  splash.id = 'revelation-splash';
  splash.innerHTML = `
    <div class="splash-content">
      <h2>Created with REVELation Snapshot Presenter v. <span id="app-version"></span></h2>
      <p><a href="https://snapshots.vrbm.org/revelation-snapshot-presenter/" target="_blank">Learn More</a></p>
    </div>
  `;
  document.body.appendChild(splash);

  // Styles
  const style = document.createElement('style');
  style.textContent = `
    #revelation-splash {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(17, 17, 17, 0.95);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      font-family: system-ui, sans-serif;
      text-align: center;
      transition: opacity 1s ease-in-out;
    }
    #revelation-splash.fade-out {
      opacity: 0;
      pointer-events: none;
    }
    #revelation-splash .splash-content {
      max-width: 90%;
    }
    #revelation-splash h2 {
      font-size: 2rem;
      margin-bottom: 1rem;
    }
    #revelation-splash a {
      color: #4da6ff;
      font-size: 1.2rem;
      text-decoration: none;
    }
    #revelation-splash a:hover {
      text-decoration: underline;
    }
  `;
  document.head.appendChild(style);

  const versionSpan = splash.querySelector('#app-version');
  if (versionSpan) {
    versionSpan.textContent = window.exportedAppVersion || 'unknown';
  }

  // Remove after delay or user input
  let dismissed = false;
  const dismissSplash = () => {
    if (dismissed) return;
    dismissed = true;
    splash.classList.add('fade-out');
    setTimeout(() => splash.remove(), 1000);
  };

  setTimeout(dismissSplash, 5000);
  splash.addEventListener('click', dismissSplash);
  document.addEventListener('keydown', dismissSplash, { once: true });
})();
