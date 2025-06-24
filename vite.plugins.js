const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

const presentationsDir = path.resolve(__dirname, 'presentations');
const outputFile = path.join(presentationsDir, 'index.json');

function generatePresentationIndex() {
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

