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
    }
  },
  plugins: [presentationIndexPlugin()],
  build: {
    minify: false,
    rollupOptions: {
      input: {
        'offline-bundle': path.resolve(__dirname, 'js/offline.js')
      },
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
