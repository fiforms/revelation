import fs from 'fs';
import path from 'path';
import readline from 'readline/promises';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const presentationsDir = path.resolve(__dirname, '../presentations');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function getPresentationSlugs() {
  return (await fs.promises.readdir(presentationsDir)).filter(dir =>
    fs.existsSync(path.join(presentationsDir, dir, 'presentation.md'))
  );
}

async function choosePresentation(slugs) {
  console.log('\nAvailable Presentations:\n');
  slugs.forEach((slug, i) => {
    console.log(`  [${i + 1}] ${slug}`);
  });
  const answer = await rl.question('\nChoose a presentation by number: ');
  const index = parseInt(answer.trim()) - 1;
  return slugs[index];
}

async function getImageFiles(presPath) {
  const allFiles = await fs.promises.readdir(presPath);
  return allFiles.filter(f =>
    f.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i)
  );
}

function createSlideContent(filename) {
  return `![](${filename})\n\n---\n`;
}

async function appendSlides(presPath, imageFiles) {
  const mdPath = path.join(presPath, 'presentation.md');
  const slides = imageFiles.map(createSlideContent).join('\n');
  await fs.promises.appendFile(mdPath, '\n\n' + slides);
}

async function main() {
  try {
    const slugs = await getPresentationSlugs();
    if (slugs.length === 0) throw new Error('No presentations found.');
    const chosen = await choosePresentation(slugs);
    const presPath = path.join(presentationsDir, chosen);
    const imageFiles = await getImageFiles(presPath);
    if (imageFiles.length === 0) throw new Error('No image files found in selected presentation.');
    await appendSlides(presPath, imageFiles);
    console.log(`\n✅ Added ${imageFiles.length} image slides to '${chosen}/presentation.md'.`);
  } catch (err) {
    console.error('\n❌ Error:', err.message);
  } finally {
    rl.close();
  }
}

main();

