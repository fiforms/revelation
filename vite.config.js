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
