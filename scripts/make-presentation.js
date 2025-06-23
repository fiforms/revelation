const fs = require('fs');
const path = require('path');
const readline = require('readline');

const presentationsDir = path.resolve(__dirname, '../presentations');
const templateDir = path.resolve(__dirname, '../templates/default');
const themeDir = path.resolve(__dirname, '../css');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function main() {
  const title = await ask('Presentation title: ');
  const slug = title.toLowerCase().replace(/\s+/g, '-');
  const description = await ask('Description: ');

  // List available themes
  const themes = fs.readdirSync(themeDir).filter(file => file.endsWith('.css'));
  console.log('Available themes:', themes.join(', '));
  const theme = await ask(`Select a theme [${themes[0]}]: `) || themes[0];

  const exampleChoice = await ask('Use example content? (y/N): ');
  const useExample = exampleChoice.trim().toLowerCase() === 'y';

  const presDir = path.join(presentationsDir, slug);
  if (fs.existsSync(presDir)) {
    console.error('❌ Presentation already exists');
    process.exit(1);
  }

  fs.mkdirSync(presDir, { recursive: true });

  // Copy index.html template
  fs.copyFileSync(path.join(templateDir, 'index.html'), path.join(presDir, 'index.html'));
  fs.copyFileSync(path.join(templateDir, 'thumbnail.webp'), path.join(presDir, 'thumbnail.webp'));

  // Generate presentation.md
  const date = new Date().toISOString().split('T')[0];
  let content = `<!-- Presentation Created ${date} -->\n`;
  content += `# ${title}\n\n${description}\n`;

  if (useExample) {
    const examplePath = path.join(templateDir, 'presentation.md');
    if (fs.existsSync(examplePath)) {
      const exampleContent = fs.readFileSync(examplePath, 'utf-8');
      content += `\n\n${exampleContent}`;
    } else {
      console.warn('⚠️ Example template not found. Continuing with stub.');
    }
  }

  fs.writeFileSync(path.join(presDir, 'presentation.md'), content);

  // Create metadata.json
  const metadata = {
    title,
    description,
    theme,
    thumbnail: 'thumbnail.webp',
    version: 1.0
  };
  fs.writeFileSync(path.join(presDir, 'metadata.json'), JSON.stringify(metadata, null, 2));

  console.log(`✅ Presentation '${title}' created in presentations/${slug}`);
  rl.close();
}

main();
