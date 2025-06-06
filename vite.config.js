const presentationIndexPlugin = require('./vite.plugins.js');

export default {
  root: '.',      
  publicDir: 'assets',   // Default for static assets
  server: {
    port: 8000
  },
  plugins: [presentationIndexPlugin()]
};

