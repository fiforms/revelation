// electron-api.js — finds the wrapper's `electronAPI` for presentation code, including inside picture-in-picture.
//
// The Electron preload exposes `window.electronAPI` on the top frame only. In picture-in-picture the deck is an
// iframe of pip.html (a presentation window, same origin), so the deck sees no electronAPI and would behave as in
// a plain browser. `getElectronAPI()` returns the window's own API or, for a PiP parent only, the parent's.
//
// "PiP parent" means a parent that exposes `presentationPluginTrigger` (the presentation preload). The builder
// preview's parent is the admin window, whose preload is much larger (file access, save-app-config, export...),
// so it is deliberately NOT returned here and `window.electronAPI` is never aliased. A cross-origin parent
// (an external page in PiP) throws on access; that is caught and treated as "no parent API".
//
// Callers: presentations.js, presentation-bootstrap.js, info-panel.js (ES import) and plugins/widgets/client.js
// (classic script, via `window.RevelationElectronAPI`, resolved at call time).

export function createElectronApiLocator(win) {
  function pipParentApi() {
    try {
      const parent = win.parent;
      if (!parent || parent === win) return null;
      const api = parent.electronAPI;
      return api && typeof api.presentationPluginTrigger === 'function' ? api : null;
    } catch {
      return null; // cross-origin parent
    }
  }
  return {
    getElectronAPI: () => win.electronAPI || pipParentApi() || null,
    isInPictureInPicture: () => !win.electronAPI && !!pipParentApi(),
  };
}

const locator = typeof window !== 'undefined' ? createElectronApiLocator(window) : null;
export const getElectronAPI = () => (locator ? locator.getElectronAPI() : null);
export const isInPictureInPicture = () => (locator ? locator.isInPictureInPicture() : false);
if (locator) window.RevelationElectronAPI = locator;
