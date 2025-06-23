import { defineConfig } from 'vite';
const presentationIndexPlugin = require('./vite.plugins.js');
import path from 'path';


export default {
  root: '.',      
  publicDir: 'assets',   // Default for static assets
  server: {
    port: 8000
  },
  plugins: [presentationIndexPlugin()],
  resolve: {
    alias: {
      'socket.io-client': path.resolve(__dirname, 'node_modules/socket.io-client/dist/socket.io.esm.min.js'),
    }
  }
};

