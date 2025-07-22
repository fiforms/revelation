const os = require('os');
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const ip = require('ip');
const localIp = ip.address(); // Gets the LAN IP

const baseDir = __dirname;
const prefix = 'presentations_';

const folderName = fs.readdirSync(baseDir).find(name =>
  fs.statSync(path.join(baseDir, name)).isDirectory() && name.startsWith(prefix)
);

if (!folderName) throw new Error('No presentations_<key> folder found');

const presentationsDir = path.join(baseDir, folderName); // full path
const key = folderName.replace(prefix, '');
const presentationsWebPath = `/${folderName}`;

const outputFile = path.join(presentationsDir, 'index.json');

const readmePresDir = path.join(presentationsDir, 'readme');
const readmePresentationPath = path.join(readmePresDir, 'presentation.md');
const readmeYamlPath = path.join(readmePresDir, 'header.yaml');
const projectReadmePath = path.resolve(__dirname, 'README.md');

function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

function generatePresentationIndex() {
  // Refresh README presentation first, if needed:
  
  if (fs.existsSync(readmeYamlPath) && fs.existsSync(projectReadmePath)) {
    const shouldGenerate =
      !fs.existsSync(readmePresentationPath) ||
      fs.statSync(readmePresentationPath).mtime < fs.statSync(projectReadmePath).mtime;

    if (shouldGenerate) {
      const header = fs.readFileSync(readmeYamlPath, 'utf-8');
      const body = fs.readFileSync(projectReadmePath, 'utf-8');
  
      const combined = `${header}\n\n${body}`;
      fs.writeFileSync(readmePresentationPath, combined, 'utf-8');
      console.log(`📝 Regenerated ${readmePresentationPath}`);
    }
  }

    // Generate presentation manifest
    const dirs = fs.readdirSync(presentationsDir).filter((dir) => {
      return fs.lstatSync(path.join(presentationsDir, dir)).isDirectory();
    });

    const indexData = [];

    dirs.forEach((dir) => {
      const folderPath = path.join(presentationsDir, dir);
      const files = fs.readdirSync(folderPath).filter((file) => file.endsWith('.md'));

      files.forEach((mdFile) => {
        const mdPath = path.join(folderPath, mdFile);
        const fileContent = fs.readFileSync(mdPath, 'utf-8');
        const { data } = matter(fileContent);
	if(data.alternatives !== 'hidden') {

          indexData.push({
            slug: dir,
            md: mdFile,
            title: data.title || `${dir}/${mdFile}`,
            description: data.description || '',
            thumbnail: data.thumbnail || 'preview.jpg',
            theme: data.theme || '',
          });
	}
      });
    });

    fs.writeFileSync(outputFile, JSON.stringify(indexData, null, 2), 'utf-8');
    console.log(`📄 presentations/index.json regenerated`);
}

function presentationIndexPlugin() {
  return {
    name: 'generate-presentation-index',
    buildStart() {
      generatePresentationIndex();
      generateMediaIndex();
    },
    configureServer(server) {
      copyFonts();
      generatePresentationIndex();
      generateMediaIndex();

     // 👇 Find out if Vite was started with --host (network mode)
    const isNetwork = process.argv.includes('--host');
    const host = isNetwork ? getLocalIp() : 'localhost';

    // 👇 Dynamically get port from server.httpServer
    server.httpServer?.once('listening', () => {
      const actualPort = server.httpServer.address().port;
      const url = `http://${host}:${actualPort}/presentations.html?key=${key}`;
      console.log(`\n🌐 Open your presentations at:\n   \x1b[36m${url}\x1b[0m\n`);
    });

    const chokidar = require('chokidar');
    const path = require('path');
    const fs = require('fs');

    const watcher = chokidar.watch(folderName, {
      ignored: /(^|[/\\])\../, // Ignore dotfiles
      persistent: true,
      ignoreInitial: true,  
      depth: 5
    });

    const triggerReload = (event, filePath) => {
      if (filePath.endsWith('.md') && filePath.includes(folderName)) {
        console.log(`📦 ${event.toUpperCase()}:`, filePath);
        generatePresentationIndex();
        const parts = filePath.split(path.sep);
        const slugIndex = parts.findIndex(p => p === folderName) + 1;
        const slug = parts[slugIndex]; 
        const mdFile = parts[slugIndex + 1];


        server.ws.send({
          type: 'custom',
          event: 'reload-presentations',
          data: { slug, mdFile }
        });
      }

      if (filePath.endsWith('.json') && filePath.includes('_media')) {
        console.log(`🧩 ${event.toUpperCase()}: Media JSON changed →`, filePath);
        generateMediaIndex();

        server.ws.send({
          type: 'custom',
          event: 'reload-media',
          data: { filePath }
        });
      }
    };

    watcher
      .on('add',    filePath => triggerReload('add', filePath))
      .on('change', filePath => triggerReload('change', filePath))
      .on('unlink', filePath => triggerReload('unlink', filePath))
      .on('addDir', dirPath => {
	  console.log('📁 Folder added:', dirPath);
          generatePresentationIndex();
          server.ws.send({ type: 'full-reload' });
        })
      .on('unlinkDir', dirPath => {
        if (dirPath.includes(folderName)) {
          console.log('📁 Folder deleted:', dirPath);
          generatePresentationIndex();
          server.ws.send({ type: 'full-reload' });
        }
      });
      
    // Rewrite `/presentations/foo/index.html` to `/presentation.html?slug=foo`
    server.middlewares.use((req, res, next) => {
      const escaped = presentationsWebPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // escape for regex

      const match = req.url.match(new RegExp(`^${escaped}/([^/]+)/(?:index\\.html)?(?:\\?.*)?$`));
      if (match) {
        const slug = match[1];
        req.url = `/presentation.html?slug=${slug}&key=${key}`;
      }

      const hmatch = req.url.match(new RegExp(`^${escaped}/([^/]+)/handout(?:\\.html)?(?:\\?.*)?$`));
      if (hmatch) {
        const slug = hmatch[1];
        req.url = `/handout.html?slug=${slug}&key=${key}`;
      }

        next();
      });

      // Restrict access to presentation listing from other hosts by default
      server.middlewares.use((req, res, next) => {
          const restrictedPath = `/${folderName}/index.json`;

          if (req.url === restrictedPath) {
            const rawIp = req.socket.remoteAddress;

            // Normalize to raw IPv4 if in IPv6-mapped format
            const clientIp = rawIp.startsWith('::ffff:') ? rawIp.replace('::ffff:', '') : rawIp;

            // Normalize IPv6 localhost
            const normalizedClientIp = clientIp === '::1' ? '127.0.0.1' : clientIp;

            const isLocalhost = normalizedClientIp === '127.0.0.1';
            const isSameAsServer = normalizedClientIp === localIp;

            if (!isLocalhost && !isSameAsServer) {
              console.log(`Attempted access from ${normalizedClientIp} blocked.`);
              res.writeHead(403, { 'Content-Type': 'text/plain' });
              res.end('403 Forbidden: index.json access denied');
              return;
            }
          }

          next();
       });

        // Middleware to serve files from revelation_electron-wrapper/http_admin
        // This allows serving static files from the external folder

        const adminDir = path.resolve(__dirname, '../http_admin');
        if (fs.existsSync(adminDir)) {
          const serveStatic = require('serve-static');
          server.middlewares.use(
            '/admin',
            serveStatic(adminDir, {
              index: false,
              fallthrough: true,
            })
          );
        } else {
          console.warn('⚠️  External /http_admin folder not found — skipping mount.');
        }
	    
    }
  };
};

function copyFonts() {
      const src = path.resolve(__dirname, 'node_modules/reveal.js/dist/theme/fonts');
      const dest = path.resolve(__dirname, 'css/fonts');

      // Skip if already copied
      if (fs.existsSync(dest)) return;

      // Recursively copy
      copyRecursiveSync(src, dest);
      console.log('📁 Copied Reveal.js fonts to css/fonts');
}

// Helper: Recursive copy
function copyRecursiveSync(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });

  for (const item of fs.readdirSync(src)) {
    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);

    if (fs.lstatSync(srcPath).isDirectory()) {
      copyRecursiveSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function generateMediaIndex() {
  const mediaDir = path.join(presentationsDir, '_media');
  if (!fs.existsSync(mediaDir)) return;

  const files = fs.readdirSync(mediaDir).filter(f =>
    f.endsWith('.json') && f !== 'index.json'
  );

  const index = {};
  for (const file of files) {
    const fullPath = path.join(mediaDir, file);
    try {
      const data = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
      const key = path.basename(file, '.json');
      index[key] = data;
    } catch (e) {
      console.warn(`⚠️ Failed to parse ${file}: ${e.message}`);
    }
  }

  fs.writeFileSync(path.join(mediaDir, 'index.json'), JSON.stringify(index, null, 2));
  console.log(`📁 _media/index.json updated with ${Object.keys(index).length} entries`);
}

module.exports = presentationIndexPlugin;