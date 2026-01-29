export function pluginLoader(page, prefix) {
  window.RevelationPlugins = {};

  if (window.electronAPI && window.electronAPI.getPluginList) {
    // Use Electron API
    return window.electronAPI.getPluginList({ host: window.location.host }).then(pluginList => {
      return handlePluginList(pluginList, page);
    });
  } else {
    // Fallback: fetch from server
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
}

function handlePluginList(pluginList, page) {
    const pluginPromises = [];

    for (const [name, plugin] of Object.entries(pluginList)) {
      if (plugin.baseURL && plugin.clientHookJS) {
        const scriptURL = `${plugin.baseURL}/${plugin.clientHookJS}`;

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
                pluginModule.init({ pluginName: name, baseURL: plugin.baseURL, page: page, config: plugin.config });
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
            window.alert(`❌ Failed to load plugin: ${name} (${scriptURL})`);
            resolve(); // Still resolve to allow Promise.allSettled to complete
          };

          document.head.appendChild(script);
        });

        pluginPromises.push(promise);
      }
    }

    return Promise.allSettled(pluginPromises); // Resolves when all plugins are loaded or failed
}
