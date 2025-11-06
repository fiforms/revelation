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
    const author = await ask('Author Name: ');

    const themes = fs.readdirSync(themeDir).filter(file => file.endsWith('.css'));

    console.log('\nAvailable themes:');
    themes.forEach((theme, index) => {
      console.log(`${index + 1}. ${theme}`);
    });

    let selectedTheme = null;
    while (!selectedTheme) {
        const input = await ask(`\nSelect a theme [1-${themes.length}]: `);
        const index = parseInt(input, 10);
        if (!isNaN(index) && index >= 1 && index <= themes.length) {
            selectedTheme = themes[index - 1];
        } else {
            console.log(`❌ Invalid choice. Please enter a number between 1 and ${themes.length}.`);
        }
    }

    const theme = selectedTheme;

    const exampleChoice = await ask('Use example content? (y/N): ');
    const useExample = exampleChoice.trim().toLowerCase() === 'y';

    const presDir = path.join(presentationsDir, slug);
    if (fs.existsSync(presDir)) {
    console.error('❌ Presentation already exists');
    process.exit(1);
    }

    fs.mkdirSync(presDir, { recursive: true });

    // Copy basic files
    fs.copyFileSync(path.join(templateDir, 'style.css'), path.join(presDir, 'style.css'));
    fs.copyFileSync(path.join(templateDir, 'thumbnail.jpg'), path.join(presDir, 'thumbnail.jpg'));

    // Generate presentation.md with YAML front matter
    const date = new Date().toISOString().split('T')[0];
    let content = `---\n`;
    content += `title: ${title}\n`;
    content += `description: ${description}\n`;
    content += `author:\n`;
    content += `  name: ${author}\n`;
    content += `theme: ${theme}\n`;
    content += `thumbnail: thumbnail.jpg\n`;
    content += `created: ${date}\n`;

    if (useExample) {
        const examplePath = path.join(templateDir, 'presentation.md');
        if (fs.existsSync(examplePath)) {
          let exampleContent = fs.readFileSync(examplePath, 'utf-8');

          // Match full YAML frontmatter
          const frontmatterMatch = exampleContent.match(/^---\n([\s\S]*?)\n---/);
          if (frontmatterMatch) {
            const fullMatch = frontmatterMatch[0];       // Entire --- ... --- block
            const frontmatter = frontmatterMatch[1];     // Content inside frontmatter
            const macrosIndex = frontmatter.indexOf('macros:');
            if (macrosIndex !== -1) {
              const macrosSection = frontmatter.slice(macrosIndex);
              content += `${macrosSection}\n---\n\n`;
            } else {
              console.warn('⚠️ No macros found in frontmatter.');
              content += `---\n`;
            }

            // Append everything after the second ---
            const restOfContent = exampleContent.slice(fullMatch.length).trimStart();
            content += restOfContent + '\n';
          } else {
            console.warn('⚠️ Example template missing frontmatter.');
            content += `---\n# ${title}\n\n${description}\n`;
          }
        } else {
          console.warn('⚠️ Example template not found. Continuing with stub.');
          content += `---\n# ${title}\n\n${description}\n`;
        }
    } else {
      content += `---\n# ${title}\n\n${description}\n`;
    }

  fs.writeFileSync(path.join(presDir, 'presentation.md'), content);

  console.log(`✅ Presentation '${title}' created in presentations/${slug}`);
  rl.close();
}

main();

