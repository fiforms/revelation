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


  const dirs = fs.readdirSync(presentationsDir).filter((dir) => {
    const mdPath = path.join(presentationsDir, dir, 'presentation.md');
    const indexPath = path.join(presentationsDir, dir, 'index.html');
    return fs.existsSync(mdPath) && fs.existsSync(indexPath);
  });

  const indexData = dirs.map((dir) => {
    const mdPath = path.join(presentationsDir, dir, 'presentation.md');
    const fileContent = fs.readFileSync(mdPath, 'utf-8');
    const { data } = matter(fileContent);

    return {
      slug: dir,
      title: data.title || dir,
      description: data.description || '',
      thumbnail: data.thumbnail || 'preview.jpg',
      theme: data.theme || '',
    };
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
      generatePresentationIndex();

      // Watch all presentation.md files
      fs.readdirSync(presentationsDir).forEach((dir) => {
        const mdFile = path.join(presentationsDir, dir, 'presentation.md');
        if (fs.existsSync(mdFile)) {
          server.watcher.add(mdFile);
        }
      });

      server.watcher.on('change', (changedPath) => {
        if (changedPath.includes('presentations') && changedPath.endsWith('presentation.md')) {
          generatePresentationIndex();
        }
      });
    }
  };
};

