const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const matter = require('gray-matter');
const ip = require('ip');
const serveStatic = require('serve-static');
const { Server } = require('socket.io');

const localIp = ip.address(); // Gets the LAN IP

const baseDir = __dirname;
const prefix = 'presentations_';
const PEER_SOCKET_PATH = '/peer-commands';
let peerCommandIo = null;

let presentationsWebPath = '';
let presentationsDir = '';
let key = '';
let customPath = false;
let pluginsDir = '';
let pluginsWebPath = '';

if(process.env.PRESENTATIONS_DIR_OVERRIDE && process.env.PRESENTATIONS_KEY_OVERRIDE) {
    presentationsDir = process.env.PRESENTATIONS_DIR_OVERRIDE;
    key = process.env.PRESENTATIONS_KEY_OVERRIDE;
    presentationsWebPath = `/${prefix}${key}`;
    customPath = true;
    pluginsDir = process.env.PLUGINS_DIR_OVERRIDE;
    pluginsWebPath = `/plugins_${key}`
}
else {
    const folderName = fs.readdirSync(baseDir).find(name =>
        fs.statSync(path.join(baseDir, name)).isDirectory() && name.startsWith(prefix)
    );
    if (!folderName) throw new Error('No presentations folder found');

    presentationsDir = path.join(baseDir, folderName); // full path
    key = folderName.replace(prefix, '');
    presentationsWebPath = `/${folderName}`;
}

const outputFile = path.join(presentationsDir, 'index.json');

const readmePresDir = path.join(presentationsDir, 'readme');
const readmePresentationPath = path.join(readmePresDir, 'presentation.md');
const readmeYamlPath = path.join(readmePresDir, 'header.yaml');
const projectReadmePath = path.resolve(__dirname, 'README.md');
const referencePath = path.resolve(__dirname, 'doc/REFERENCE.md');

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
  
      let combined = `${header}\n\n${body}`;
      if (fs.existsSync(referencePath)) {
        const reference = fs.readFileSync(referencePath, 'utf-8');
        combined += `\n\n***\n\n${reference}`;
      }
      
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
      const files = fs.readdirSync(folderPath).filter((file) => file.endsWith('.md') && file !== '__builder_temp.md');
      
      files.forEach((mdFile) => {
        const mdPath = path.join(folderPath, mdFile);
        const fileContent = fs.readFileSync(mdPath, 'utf-8');

        let data;
        try {
          // Attempt to read YAML front matter
          data = matter(fileContent).data || {};
        } catch (err) {
          console.error(`⚠ Malformed YAML in ${dir}/${mdFile}: ${err.message}`);

          // Fallback metadata when YAML is broken
          data = {
            title: "{malformed YAML}",
            description: err.message,
            thumbnail: "preview.jpg",
            _malformed: true
          };
        }

        // Skip hidden alternatives
        if (data.alternatives === "hidden") {
          return;
        }

        indexData.push({
          slug: dir,
          md: mdFile,
          title: data.title || `${dir}/${mdFile}`,
          description: data.description || "",
          thumbnail: data.thumbnail || "preview.jpg",
          theme: data.theme || "",
          _malformed: data._malformed || false
        });
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
      const isGui = /^(1|true)$/i.test(process.env.REVELATION_GUI || '');
      const cssServeDir = isGui ? path.resolve(__dirname, 'dist/css') : path.resolve(__dirname, 'css');
      const revealDistDir = path.resolve(__dirname, 'node_modules/reveal.js/dist');
      const userDataDir = process.env.USER_DATA_DIR;
      const configPath = userDataDir ? path.join(userDataDir, 'config.json') : null;

      if(!isGui) {
        copyFonts();
      }
      generatePresentationIndex();
      generateMediaIndex();

      if (fs.existsSync(revealDistDir)) {
        server.middlewares.use('/css/reveal.js/dist', serveStatic(revealDistDir, { fallthrough: true }));
      }

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

    const watcher = chokidar.watch(presentationsDir, {
      ignored: /(^|[/\\])\../, // Ignore dotfiles
      persistent: true,
      ignoreInitial: true,  
      depth: 5
    });

    const triggerReload = (event, filePath) => {
      if (filePath.endsWith('.md') && filePath.includes(presentationsDir)) {
        console.log(`📦 ${event.toUpperCase()}:`, filePath);
        generatePresentationIndex();
        mdFile = path.basename(filePath);
        slug = path.basename(path.dirname(filePath));

        console.log(`Triggering reload-presentations for slug: ${slug}, md: ${mdFile}`);
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
        // This code not needed as the creation of the .md file also triggers
        // and sets up a race condition
        /*
	        console.log('📁 Folder added:', dirPath);
          generatePresentationIndex();
          console.log('Triggering full-reload');
          server.ws.send({ type: 'full-reload' });
        */
        })
      .on('unlinkDir', dirPath => {
        if (dirPath.includes(presentationsDir)) {
          console.log('📁 Folder deleted:', dirPath);
          generatePresentationIndex();
          console.log('Triggering full-reload');
          server.ws.send({ type: 'full-reload' });
        }
      });
      
    // Prefer dist/css output if available; fall back to css/.
    console.log(`Serving /css from ${cssServeDir}`);
    server.middlewares.use(
      '/css',
      serveStatic(cssServeDir, {
        index: false,
        fallthrough: true,
      })
    );

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

      // Peer pairing + peer command endpoints (served from the same Vite server)
      ensurePeerCommandServer(server, configPath);
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/peer/')) return next();

        const config = loadPeerConfig(configPath);
        if (!config) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Peer config unavailable' }));
          return;
        }

        const parsedUrl = new URL(req.url, 'http://localhost');

        if (req.method === 'GET' && req.url === '/peer/public-key') {
          const publicKey = config.rsaPublicKey;
          const payload = {
            instanceId: config.mdnsInstanceId,
            instanceName: config.mdnsInstanceName,
            hostname: os.hostname(),
            publicKey,
            publicKeyFingerprint: fingerprintPublicKey(publicKey || '')
          };
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(payload));
          return;
        }

        if (req.method === 'GET' && parsedUrl.pathname === '/peer/socket-info') {
          if (!config.rsaPrivateKey) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Peer private key unavailable' }));
            return;
          }
          const token = crypto.randomBytes(16).toString('hex');
          const expiresAt = Date.now() + 60_000;
          const socketPath = PEER_SOCKET_PATH;
          const payload = buildSocketPayload(token, expiresAt, socketPath);
          const signature = signChallenge(config.rsaPrivateKey, payload);
          const protocol = req.socket?.encrypted ? 'https' : 'http';
          const socketUrl = `${protocol}://${req.headers.host}`;

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ socketUrl, socketPath, token, expiresAt, signature }));
          return;
        }

        if (req.method === 'POST' && parsedUrl.pathname === '/peer/command') {
          if (!peerCommandIo) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Peer command server unavailable' }));
            return;
          }
          if (!isLoopbackAddress(req.socket?.remoteAddress)) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Forbidden' }));
            return;
          }

          let body = '';
          req.on('data', (chunk) => {
            body += chunk.toString();
          });
          req.on('end', () => {
            let data;
            try {
              data = JSON.parse(body || '{}');
            } catch {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid JSON' }));
              return;
            }
            const command = data.command;
            if (!command?.type) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Missing command type' }));
              return;
            }

            peerCommandIo.emit('peer-command', command);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
          });
          return;
        }

        if (req.method === 'POST' && req.url === '/peer/challenge') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk.toString();
          });
          req.on('end', () => {
            let data;
            try {
              data = JSON.parse(body || '{}');
            } catch {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid JSON' }));
              return;
            }
            const challenge = data.challenge;
            if (!challenge || !config.rsaPrivateKey) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Missing challenge or private key' }));
              return;
            }
            try {
              const signature = signChallenge(config.rsaPrivateKey, challenge);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ signature }));
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      });

      // Restrict access to presentation/media indexes to localhost only
      server.middlewares.use((req, res, next) => {

            const lowerUrl = req.url?.toLowerCase() || '';
            if (lowerUrl.includes('index.json')) {
            const rawIp = req.socket.remoteAddress;

            // Normalize to raw IPv4 if in IPv6-mapped format
            const clientIp = rawIp.startsWith('::ffff:') ? rawIp.replace('::ffff:', '') : rawIp;

            // Normalize IPv6 localhost
            const normalizedClientIp = clientIp === '::1' ? '127.0.0.1' : clientIp;

            const isLocalhost = normalizedClientIp === '127.0.0.1';

            if (!isLocalhost) {
              console.log(`Attempted access from ${normalizedClientIp} blocked.`);
              res.writeHead(403, { 'Content-Type': 'text/plain' });
              res.end('403 Forbidden: index.json access denied (localhost only)');
              return;
            }
          }

          next();
       });

       // Serve presentations from a custom path

       if(customPath && fs.existsSync(presentationsDir)) {
          console.log(`Serving ${presentationsWebPath} from custom presentations directory ${presentationsDir}`);
          server.middlewares.use(presentationsWebPath, 
            serveStatic(
              presentationsDir,
              {
                  index: false,
                  fallthrough: true,
              }
            )
          );
          if(fs.existsSync(pluginsDir)) {
            console.log(`Serving ${pluginsWebPath} from plugins directory ${pluginsDir}`);
            server.middlewares.use(pluginsWebPath, 
              serveStatic(pluginsDir,{})
            );
          }
        }

        // Middleware to serve files from revelation_electron-wrapper/http_admin
        // This allows serving static files from the external folder

        const adminDir = process.env.ADMIN_DIR_OVERRIDE;
        if (adminDir && fs.existsSync(adminDir)) {
          server.middlewares.use(
            '/admin',
            serveStatic(adminDir, {
              index: false,
              fallthrough: true,
            })
          );
        } else {
          console.warn('⚠️  External http_admin folder not found — skipping mount.');
        }
	    
    }
  };
};

function copyFonts() {
  // No longer used — fonts are now included directly in the css/fonts folder
  /*
      const src = path.resolve(__dirname, 'node_modules/reveal.js/dist/theme/fonts');
      const dest = path.resolve(__dirname, 'css/fonts');

      // Skip if already copied
      if (fs.existsSync(dest)) return;

      // Recursively copy
      copyRecursiveSync(src, dest);
      console.log('📁 Copied Reveal.js fonts to css/fonts');
  */
}

function loadPeerConfig(configPath) {
  if (!configPath || !fs.existsSync(configPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch {
    return null;
  }
}

function isLoopbackAddress(address) {
  if (!address) return false;
  const normalized = address.startsWith('::ffff:') ? address.replace('::ffff:', '') : address;
  return normalized === '127.0.0.1' || normalized === '::1';
}

function ensurePeerCommandServer(server, configPath) {
  if (peerCommandIo || !server.httpServer) return;

  peerCommandIo = new Server(server.httpServer, {
    path: PEER_SOCKET_PATH,
    cors: { origin: '*', methods: ['GET', 'POST'] }
  });

  peerCommandIo.use((socket, next) => {
    const auth = socket.handshake.auth || {};
    const { token, expiresAt, signature } = auth;
    const config = loadPeerConfig(configPath);

    if (!token || !expiresAt || !signature || !config?.rsaPublicKey) {
      return next(new Error('Missing peer auth'));
    }
    if (Number(expiresAt) < Date.now()) {
      return next(new Error('Peer auth expired'));
    }
    const payload = buildSocketPayload(token, expiresAt, PEER_SOCKET_PATH);
    if (!verifySignature(config.rsaPublicKey, payload, signature)) {
      return next(new Error('Invalid peer signature'));
    }
    return next();
  });
}

function signChallenge(privateKeyPem, challenge) {
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(challenge);
  signer.end();
  return signer.sign(privateKeyPem).toString('base64');
}

function verifySignature(publicKeyPem, payload, signatureBase64) {
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(payload);
  verifier.end();
  return verifier.verify(publicKeyPem, Buffer.from(signatureBase64, 'base64'));
}

function buildSocketPayload(token, expiresAt, socketPath) {
  return `${token}:${expiresAt}:${socketPath}`;
}

function fingerprintPublicKey(publicKeyPem) {
  return crypto.createHash('sha256').update(publicKeyPem).digest('hex');
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
