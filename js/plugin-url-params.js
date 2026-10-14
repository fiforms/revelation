// revelation/js/plugin-url-params.js  (browser ES module)
// Collects extra presentation-URL query parameters that plugins want forwarded to a presentation
// (e.g. a licensing plugin passing the user's license number to remote/other windows).
// Hook, implemented on window.RevelationPlugins[name]:
//   getPresentationUrlParams({ appConfig }) -> { paramName: 'value', ... }
// Callers: presentationlist.js (appendBrowserPresentationParams), http_admin/builder/preview.js.
// Main-process twin: lib/presentationWindow.js (AppContext.presentationUrlParamProviders).
// Gotchas: names must match /^[a-z][a-z0-9_]*$/ and may not shadow a core parameter (RESERVED);
// values are trimmed strings, capped at 200 chars; a throwing plugin is skipped.

const NAME_RE = /^[a-z][a-z0-9_]*$/;
const MAX_VALUE_LENGTH = 200;
const RESERVED = new Set([
  'p', 'lang', 'variant', 'media', 'noTransitions', 'noshuffle', 'forcecontrols', 'exportmode',
  'builderpreview', 'builderpreviewtoken', 'builderpreviewpeer'
].map((n) => n.toLowerCase()));

export function collectPluginPresentationParams(appConfig) {
  const out = {};
  Object.entries(window.RevelationPlugins || {})
    .map(([name, plugin]) => ({ name, plugin, priority: plugin?.priority ?? 999 }))
    .sort((a, b) => a.priority - b.priority)
    .forEach(({ name, plugin }) => {
      if (typeof plugin?.getPresentationUrlParams !== 'function') return;
      try {
        const params = plugin.getPresentationUrlParams({ appConfig }) || {};
        for (const [key, raw] of Object.entries(params)) {
          const value = String(raw ?? '').trim().slice(0, MAX_VALUE_LENGTH);
          if (!value || !NAME_RE.test(key) || RESERVED.has(key.toLowerCase())) continue;
          if (!(key in out)) out[key] = value;
        }
      } catch (err) {
        console.warn(`[presentation-url-params] hook failed for plugin '${name}':`, err);
      }
    });
  return out;
}
