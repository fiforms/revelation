(function () {
  const PLUGIN_NAME = 'slide-labels';

  window.RevelationPlugins = window.RevelationPlugins || {};
  window.RevelationPlugins[PLUGIN_NAME] = {
    name: PLUGIN_NAME,

    async getRevealPlugins(isRemote) {
      // Dynamically import the plugin factory
      const { default: SlideLabelsFactory } = await import('./plugin.js');
      return [SlideLabelsFactory()];
    }
  };
})();
