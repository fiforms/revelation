export function pluginLoader(page) {
  window.RevelationPlugins = {};

  if (!window.electronAPI) {
    return Promise.resolve(1);
  }

  return window.electronAPI.getPluginList().then(pluginList => {
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
  });
}
