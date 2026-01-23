import { defineConfig } from 'vite';
const presentationIndexPlugin = require('./vite.plugins.js');
import path from 'path';


export default {
  root: '.',      
  publicDir: 'assets',   // Default for static assets
  server: {
    port: 8000,
    allowedHosts: true
  },
  plugins: [presentationIndexPlugin()],
  build: {
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

