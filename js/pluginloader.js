export function pluginLoader(page, prefix) {
  window.RevelationPlugins = {};

  if (window.location.protocol === 'file:') {
    showFileProtocolPluginWarning();
    return Promise.resolve([]);
  }

  if (window.__offlinePluginList && typeof window.__offlinePluginList === 'object') {
    return handlePluginList(window.__offlinePluginList, page);
  }

  return fetch(`${prefix}/plugins.json`)
    .then(res => {
      if (!res.ok) {
        throw new Error(`Server error: ${res.status}`);
      }
      return res.json();
    })
    .then(pluginList => {
      return handlePluginList(pluginList, page);
    })
    .catch(err => {
      console.error("Failed to fetch plugin list:", err);
      return [];
    });
}

function showPluginNotice(message, options = {}) {
  const { onceKey = '' } = options;

  if (!window.__revelationPluginNoticeState) {
    window.__revelationPluginNoticeState = {
      onceKeys: new Set()
    };
  }

  if (onceKey && window.__revelationPluginNoticeState.onceKeys.has(onceKey)) {
    return;
  }
  if (onceKey) {
    window.__revelationPluginNoticeState.onceKeys.add(onceKey);
  }

  console.warn(`[pluginloader] ${message}`);

  if (typeof document === 'undefined' || !document.body) return;

  const existing = document.getElementById('plugin-loader-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'plugin-loader-toast';
  toast.textContent = message;
  toast.style.cssText = [
    'position: fixed',
    'left: 50%',
    'bottom: 20px',
    'transform: translateX(-50%)',
    'max-width: min(90vw, 880px)',
    'padding: 10px 14px',
    'border-radius: 8px',
    'background: rgba(20, 20, 20, 0.92)',
    'color: #fff',
    'font: 13px/1.4 system-ui, sans-serif',
    'z-index: 2147483647',
    'box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3)',
    'opacity: 0',
    'transition: opacity 160ms ease'
  ].join(';');

  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
  });

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, 3200);
}

function showFileProtocolPluginWarning() {
  const warning =
    'Plugins and some advanced features are disabled when opening presentation HTML directly as file:///.\n\nUse a local web server (http://localhost/...) to enable full functionality.';

  showPluginNotice(warning, { onceKey: 'file-protocol-warning' });
}

function handlePluginList(pluginList, page) {
    const pluginPromises = [];

    for (const [name, plugin] of Object.entries(pluginList)) {
      if (plugin.baseURL && plugin.clientHookJS) {
        let normalizedBaseURL = String(plugin.baseURL || '').replace(/\/+$/, '');
        try {
          normalizedBaseURL = new URL(normalizedBaseURL, window.location.href).toString().replace(/\/+$/, '');
        } catch (err) {
          console.warn(`⚠️ Plugin '${name}' has invalid baseURL '${plugin.baseURL}':`, err);
          continue;
        }

        const scriptURL = `${normalizedBaseURL}/${plugin.clientHookJS}`;

        const promise = new Promise((resolve) => {
          const script = document.createElement('script');
          script.src = scriptURL;
          script.type = 'module';
          script.async = true;

          script.onload = () => {
            if (
              window.RevelationPlugins &&
              typeof window.RevelationPlugins[name] === 'object'
            ) {
              const pluginModule = window.RevelationPlugins[name];
              if (typeof pluginModule.init === 'function') {
                pluginModule.init({
                  pluginName: name,
                  baseURL: normalizedBaseURL,
                  page: page,
                  config: plugin.config
                });
              }
              window.RevelationPlugins[name].priority = plugin.priority;
              console.log(`✅ Plugin '${name}' loaded`);
              resolve();
            } else {
              console.warn(`⚠️ Plugin '${name}' did not register correctly`);
              resolve();
            }
          };

          script.onerror = () => {
            showPluginNotice(`Failed to load plugin: ${name} (${scriptURL})`);
            resolve(); // Still resolve to allow Promise.allSettled to complete
          };

          document.head.appendChild(script);
        });

        pluginPromises.push(promise);
      }
    }

    return Promise.allSettled(pluginPromises); // Resolves when all plugins are loaded or failed
}
