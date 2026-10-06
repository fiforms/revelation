// vite.config.js — Vite config for the REVELation server and the offline bundle.
//
// - Dev/serve: root is this directory; `assets/` is Vite's publicDir (so assets/oldcss/<ver>/
//   is served at /oldcss/<ver>/). All server behavior (index generation, media/publish/admin
//   routes, thumbnails, sockets, public relay) is in vite.plugins.js.
// - server.cors allows only `Origin: null` (the builder preview iframe is sandboxed without
//   allow-same-origin); vite.plugins.js additionally restricts that to loopback.
// - server.allowedHosts is `true` (any Host header) because LAN/proxy access is intended;
//   see doc/SECURITY.md and doc/REVERSE_PROXY.md. HTTPS only when VITE_HTTPS_CERT and
//   VITE_HTTPS_KEY are both set.
// - `vite build` does NOT build the app pages: its only input is js/offline.js, emitted as a
//   single IIFE at dist/js/offline-bundle.js. The wrapper's lib/exportPresentation.js copies
//   that file into standalone/offline exports (and WordPress/ keeps a copy). Theme CSS is built
//   separately by `npm run build:theme` (sass -> dist/css) and fonts by `npm run build:fonts`.
// - socket.io-client is aliased to its ESM build so the browser bundle and the offline IIFE
//   share one copy.
import { defineConfig } from 'vite';
const presentationIndexPlugin = require('./vite.plugins.js');
import path from 'path';
import fs from 'fs';


export default {
  root: '.',
  publicDir: 'assets',   // Default for static assets
  server: {
    port: 8000,
    allowedHosts: true,
    https: process.env.VITE_HTTPS_CERT && process.env.VITE_HTTPS_KEY ? {
      cert: fs.readFileSync(process.env.VITE_HTTPS_CERT),
      key: fs.readFileSync(process.env.VITE_HTTPS_KEY)
    } : false,
    cors: {
      // Builder preview iframe runs sandboxed without allow-same-origin (Origin: null).
      origin: 'null',
      methods: ['GET', 'HEAD', 'OPTIONS']
    },
    // Transform the main entry modules at startup, before the first page asks.
    warmup: {
      clientFiles: ['./js/presentationlist.js', './js/presentations.js']
    }
  },
  optimizeDeps: {
    // build.rollupOptions.input below names only offline.js, which Vite also
    // takes as its dev dependency-scan entry. List the real pages so deps are
    // pre-bundled at server start rather than discovered on first request
    // (which forces a full page reload — slow and flaky on loaded machines).
    entries: ['*.html'],
    include: [
      'reveal.js',
      'reveal.js/plugin/markdown',
      'reveal.js/plugin/notes',
      'reveal.js/plugin/search',
      'reveal.js/plugin/zoom',
      'reveal.js-remote/plugin/remote.js',
      'reveal.js-remote/plugin/remotezoomsync.js',
      'js-yaml',
      'socket.io-client'
    ]
  },
  plugins: [presentationIndexPlugin()],
  build: {
    minify: false,
    rollupOptions: {
      input: {
        'offline-bundle': path.resolve(__dirname, 'js/offline.js')
      },
      // Suppress EMPTY_IMPORT_META warning: Vite's internal preload helper uses
      // import.meta, which isn't valid in iife output and gets replaced with {}.
      transform: { define: { 'import.meta': '({})' } },
      output: {
        entryFileNames: 'js/[name].js', // ✅ outputs js/offline-bundle.js
        format: 'iife' // ✅ makes it usable via <script>
      }
    }
  },
  resolve: {
    alias: {
      'socket.io-client': path.resolve(__dirname, 'node_modules/socket.io-client/dist/socket.io.esm.min.js'),
    }
  }
};
