const fs = require('fs');
const path = require('path');

const presentationsDir = path.resolve(__dirname, 'presentations');
const outputFile = path.join(presentationsDir, 'index.json');

function generatePresentationIndex() {
  const dirs = fs.readdirSync(presentationsDir).filter((dir) => {
    const metaPath = path.join(presentationsDir, dir, 'metadata.json');
    const indexPath = path.join(presentationsDir, dir, 'index.html');
    return fs.existsSync(metaPath) && fs.existsSync(indexPath);
  });

  const indexData = dirs.map((dir) => {
    const metadata = JSON.parse(
      fs.readFileSync(path.join(presentationsDir, dir, 'metadata.json'), 'utf-8')
    );
    return {
      slug: dir,
      ...metadata
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

      // Watch all metadata.json files in presentation subdirectories
      fs.readdirSync(presentationsDir).forEach((dir) => {
        const metaFile = path.join(presentationsDir, dir, 'metadata.json');
        if (fs.existsSync(metaFile)) {
          server.watcher.add(metaFile);
        }
      });

      // Watch for any changes to metadata.json files
      server.watcher.on('change', (changedPath) => {
        if (changedPath.includes('webroot/presentations') && changedPath.endsWith('metadata.json')) {
          generatePresentationIndex();
        }
      });
    }
  };
};

