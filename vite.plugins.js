const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

const presentationsDir = path.resolve(__dirname, 'presentations');
const outputFile = path.join(presentationsDir, 'index.json');

const readmePresDir = path.join(presentationsDir, 'readme');
const readmePresentationPath = path.join(readmePresDir, 'presentation.md');
const readmeYamlPath = path.join(readmePresDir, 'header.yaml');
const projectReadmePath = path.resolve(__dirname, 'README.md');

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
      console.log('📝 Regenerated presentations/readme/presentation.md');
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

module.exports = function presentationIndexPlugin() {
  return {
    name: 'generate-presentation-index',
    buildStart() {
      generatePresentationIndex();
    },
    configureServer(server) {
      copyFonts();
      generatePresentationIndex();

    // Watch all *.md files in each presentation subdirectory
    fs.readdirSync(presentationsDir).forEach((dir) => {
      const folder = path.join(presentationsDir, dir);
      if (fs.lstatSync(folder).isDirectory()) {
        fs.readdirSync(folder).forEach((file) => {
          if (file.endsWith('.md')) {
            const mdPath = path.join(folder, file);
            server.watcher.add(mdPath);
          }
        });
      }
    });

    server.watcher.on('change', (changedPath) => {
      if (
        changedPath.includes('presentations') &&
        changedPath.endsWith('.md')
      ) {
        generatePresentationIndex();
	server.ws.send({ type: 'full-reload' });
      }
    });

      // Rewrite `/presentations/foo/index.html` to `/presentation.html?slug=foo`
      server.middlewares.use((req, res, next) => {
	const match = req.url.match(/^\/presentations\/([^\/]+)\/(?:index\.html)?(?:\?.*)?$/);
        if (match) {
          const slug = match[1];
          req.url = `/presentation.html?slug=${slug}`;
        }
	const hmatch = req.url.match(/^\/presentations\/([^\/]+)\/handout(?:\.html)?(?:\?.*)?$/);
        if (hmatch) {
          const slug = hmatch[1];
          req.url = `/handout.html?slug=${slug}`;
        }
        next();
      });
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
