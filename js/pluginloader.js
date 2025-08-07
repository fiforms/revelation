
export function pluginLoader(page) {
  window.RevelationPlugins = {};

  if(!window.electronAPI) {
    return 1;
  }
  // Register electronAPI Plugins
  window.electronAPI.getPluginList().then(pluginList => {
    // Loop over plugins
    for (const [name, plugin] of Object.entries(pluginList)) {
      if (plugin.baseURL && plugin.clientHookJS) {
        const scriptURL = `${plugin.baseURL}/${plugin.clientHookJS}`;
        const script = document.createElement('script');
        script.src = scriptURL;
        script.type = 'text/javascript';
        script.async = true;
        script.onload = () => {
          if (
            window.RevelationPlugins &&
            typeof window.RevelationPlugins[name] === 'object'
          ) {
            const pluginModule = window.RevelationPlugins[name];
            if (typeof pluginModule.init === 'function') {
              pluginModule.init({ pluginName: name, baseURL: plugin.baseURL, page: page });
            }

            console.log(`✅ Plugin '${name}' loaded`);
          } else {
            console.warn(`⚠️ Plugin '${name}' did not register correctly in window.RevelationPlugins`);
          }
        };
        script.onerror = () => window.alert(`❌ Failed to load plugin: ${name} (${scriptURL})`);
        document.head.appendChild(script);
      }
    }
  });  
}

