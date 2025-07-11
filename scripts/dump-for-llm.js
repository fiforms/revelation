// scripts/dump-for-llm.js
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const outputFile = process.argv[2] || 'relevant_files_for_llm.txt';

// Define exclusions (adjust as needed)
const excludePatterns = [
  /\.jpg$/i, /\.jpeg$/i, /\.png$/i, /\.gif$/i, /\.webp/,
  /\.webm$/i, /\.mp4$/i, /\.ico$/i,
  /\.sass$/i, /\.scss$/i,
  /node_modules\//, /dist\//,
  /package\-lock\.json/,
  /.gitignore/,
  /\.lock$/, /\.log$/i
];

// 1. Capture all files from git
const allFiles = execSync('git ls-files', { encoding: 'utf-8' }).split('\n').filter(Boolean);

// 2. Filter only included files
const includedFiles = allFiles.filter(file => !excludePatterns.some(pattern => pattern.test(file)));

// 3. Create output stream
const output = fs.createWriteStream(outputFile, 'utf-8');

// 4. Write all files at top
output.write('All Git-tracked files:\n');
output.write(allFiles.map(f => `- ${f}`).join('\n'));
output.write('\n\nIncluded files for content dump:\n');
output.write(includedFiles.map(f => `- ${f}`).join('\n'));
output.write('\n\n===========================\n\n');

// 5. Dump file contents
for (const file of includedFiles) {
  output.write(`\n\n===== FILE: ${file} =====\n\n`);
  try {
    const content = fs.readFileSync(file, 'utf-8');
    output.write(content);
  } catch (err) {
    output.write(`[Error reading file: ${err.message}]`);
  }
}

output.end(() => {
  console.log(`✅ Wrote ${includedFiles.length} files (from ${allFiles.length} total) to ${outputFile}`);
});
