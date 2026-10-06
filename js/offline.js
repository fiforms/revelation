// offline.js — entry point of the standalone/offline export bundle (`vite build` -> an IIFE at
// dist/js/offline-bundle.js, see vite.config.js). It pulls in the same modules the live
// presentation page uses; importing presentations.js is what boots the deck. Exported HTML
// (lib/exportPresentation.js createOfflineHTML) injects the markdown/plugin list/server URLs as
// window globals (window.offlineMarkdown, __offlinePluginList, revealRemoteServer, ...) before
// loading this file; the compiler/plugin loader/translate.js branch on those globals.
import './tweaks.js';
import './contextmenu.js';
import './presentations.js';
import './splashscreen.js';
