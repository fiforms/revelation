#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { marked } = require('marked');

const ROOT = __dirname;
const REVELATION_ROOT = path.resolve(ROOT, '..');
const FIXTURES_DIR = path.join(ROOT, 'fixtures');
const ACTUAL_DIR = path.join(ROOT, '_actual');
const GENERATE_MODE = process.argv.includes('--generate');

global.window = {
  localStorage: {
    getItem() {
      return null;
    }
  },
  RevelationPlugins: null
};
global.document = undefined;

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function normalizeText(value) {
  return String(value ?? '').replace(/\r\n?/g, '\n');
}

function ensureTrailingNewline(value) {
  const text = normalizeText(value);
  return text.endsWith('\n') ? text : `${text}\n`;
}

function loadSmartQuotes() {
  const filePath = path.join(REVELATION_ROOT, 'js', 'smart-quotes.js');
  let source = readText(filePath);
  source = source.replace('export default function convertSmartQuotes', 'function convertSmartQuotes');
  source += '\nmodule.exports = convertSmartQuotes;\n';

  const module = { exports: {} };
  const context = {
    module,
    exports: module.exports,
    require,
    console
  };
  vm.runInNewContext(source, context, { filename: filePath });
  return module.exports;
}

function loadLoader(convertSmartQuotes) {
  const filePath = path.join(REVELATION_ROOT, 'js', 'loader.js');
  let source = readText(filePath);
  source = source.replace("import yaml from 'js-yaml';", "const yaml = require('js-yaml');");
  source = source.replace("import convertSmartQuotes from './smart-quotes';", 'const convertSmartQuotes = __imports.convertSmartQuotes;');
  source = source.replace(/export async function /g, 'async function ');
  source = source.replace(/export function /g, 'function ');
  source += `
module.exports = {
  extractFrontMatter,
  getNoteSeparator,
  preprocessMarkdown,
  sanitizeMarkdownEmbeddedHTML,
  sanitizeRenderedHTML,
  usesNewNoteSeparator
};
`;

  const module = { exports: {} };
  const context = {
    module,
    exports: module.exports,
    require,
    console,
    __imports: { convertSmartQuotes },
    window: global.window,
    document: global.document,
    URLSearchParams,
    fetch: global.fetch
  };
  vm.runInNewContext(source, context, { filename: filePath });
  return module.exports;
}

const convertSmartQuotes = loadSmartQuotes();
const {
  extractFrontMatter,
  getNoteSeparator,
  preprocessMarkdown,
  sanitizeMarkdownEmbeddedHTML,
  sanitizeRenderedHTML
} = loadLoader(convertSmartQuotes);

function splitSlides(markdown) {
  const lines = normalizeText(markdown).split('\n');
  const slides = [];
  let current = [];
  let insideCodeBlock = false;
  let currentFence = '';
  let breakType = 'start';

  for (const line of lines) {
    const fenceMatch = line.match(/^\s{0,3}((`{3,}|~{3,}))[ \t]*(.*)$/);
    if (fenceMatch) {
      const fence = fenceMatch[1];
      const fenceChar = fence[0];
      const fenceLength = fence.length;
      if (!insideCodeBlock) {
        insideCodeBlock = true;
        currentFence = fence;
      } else if (
        currentFence &&
        fenceChar === currentFence[0] &&
        fenceLength >= currentFence.length
      ) {
        insideCodeBlock = false;
        currentFence = '';
      }
      current.push(line);
      continue;
    }

    const trimmed = line.trim();
    if (!insideCodeBlock && (trimmed === '---' || trimmed === '***')) {
      slides.push({ content: current.join('\n'), breakType });
      current = [];
      breakType = trimmed === '---' ? 'vertical' : 'horizontal';
      continue;
    }

    current.push(line);
  }

  slides.push({ content: current.join('\n'), breakType });
  return slides;
}

function isCommentOnlyMarkdown(markdown) {
  if (!markdown || !markdown.trim()) return true;
  return markdown.replace(/<!--[\s\S]*?-->/g, '').trim().length === 0;
}

function splitSlideContentAndNotes(rawSlide, noteSeparator) {
  const lines = normalizeText(rawSlide).split('\n');
  let insideCodeBlock = false;
  let currentFence = '';
  let noteIndex = -1;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const fenceMatch = line.match(/^\s{0,3}((`{3,}|~{3,}))[ \t]*(.*)$/);
    if (fenceMatch) {
      const fence = fenceMatch[1];
      const fenceChar = fence[0];
      const fenceLength = fence.length;
      if (!insideCodeBlock) {
        insideCodeBlock = true;
        currentFence = fence;
      } else if (
        currentFence &&
        fenceChar === currentFence[0] &&
        fenceLength >= currentFence.length
      ) {
        insideCodeBlock = false;
        currentFence = '';
      }
      continue;
    }

    if (!insideCodeBlock && line.trim() === noteSeparator) {
      noteIndex = i;
      break;
    }
  }

  if (noteIndex < 0) {
    return { content: rawSlide, notes: '' };
  }

  return {
    content: lines.slice(0, noteIndex).join('\n'),
    notes: lines.slice(noteIndex + 1).join('\n')
  };
}

function stripSlideSeparatorsOutsideCodeBlocks(markdown) {
  const lines = normalizeText(markdown).split('\n');
  const kept = [];
  let insideCodeBlock = false;
  let currentFence = '';

  for (const line of lines) {
    const fenceMatch = line.match(/^\s{0,3}((`{3,}|~{3,}))[ \t]*(.*)$/);
    if (fenceMatch) {
      const fence = fenceMatch[1];
      const fenceChar = fence[0];
      const fenceLength = fence.length;
      if (!insideCodeBlock) {
        insideCodeBlock = true;
        currentFence = fence;
      } else if (
        currentFence &&
        fenceChar === currentFence[0] &&
        fenceLength >= currentFence.length
      ) {
        insideCodeBlock = false;
        currentFence = '';
      }
      kept.push(line);
      continue;
    }

    if (!insideCodeBlock && /^\s*(\*\*\*|---)\s*$/.test(line)) {
      continue;
    }
    kept.push(line);
  }

  return kept.join('\n');
}

function buildRevealMarkdown(rawMarkdown) {
  const normalized = normalizeText(rawMarkdown);
  const { metadata, content } = extractFrontMatter(normalized);
  const withBlankSlide = `${content}\n\n---\n\n`;
  const partiallyProcessed = preprocessMarkdown(
    withBlankSlide,
    metadata.macros || {},
    false,
    metadata.media,
    metadata.newSlideOnHeading
  );
  const processed = metadata.convertSmartQuotes === false
    ? partiallyProcessed
    : convertSmartQuotes(partiallyProcessed);

  return sanitizeMarkdownEmbeddedHTML(processed);
}

function buildHandoutHTML(rawMarkdown, mdFile = 'presentation.md') {
  const normalized = normalizeText(rawMarkdown);
  const { metadata, content } = extractFrontMatter(normalized);
  const processed = preprocessMarkdown(
    content,
    metadata.macros || {},
    true,
    metadata.media,
    metadata.newSlideOnHeading,
    null,
    null,
    false,
    null
  );
  const slides = splitSlides(processed);
  const noteSeparator = getNoteSeparator(metadata);
  const incremental = metadata?.config && (metadata.config.slideNumber === 'c' || metadata.config.slideNumber === 'c/t');
  const output = [];

  let hIndex = 1;
  let vIndex = 1;
  let slideCount = 0;
  let started = false;

  for (const slide of slides) {
    if (!started) {
      hIndex = 1;
      vIndex = 1;
      started = true;
    } else if (slide.breakType === 'horizontal') {
      hIndex += 1;
      vIndex = 1;
    } else if (slide.breakType === 'vertical') {
      vIndex += 1;
    } else {
      hIndex += 1;
      vIndex = 1;
    }

    slideCount += 1;

    const parsedSlide = splitSlideContentAndNotes(slide.content.trim(), noteSeparator);
    const cleanedMarkdown = stripSlideSeparatorsOutsideCodeBlocks(parsedSlide.content).trim();
    const cleanedNote = parsedSlide.notes
      ? stripSlideSeparatorsOutsideCodeBlocks(parsedSlide.notes).trim()
      : '';

    if (
      (!cleanedMarkdown || /^#+$/.test(cleanedMarkdown) || isCommentOnlyMarkdown(cleanedMarkdown)) &&
      !cleanedNote
    ) {
      continue;
    }

    const slideHTML = sanitizeRenderedHTML(marked.parse(cleanedMarkdown));
    const noteHTML = cleanedNote ? sanitizeRenderedHTML(marked.parse(cleanedNote)) : '';
    const slideNumber = incremental ? slideCount : `${hIndex}.${vIndex}`;

    output.push('<section class="slide">');
    output.push(`<div class="slide-number slide-number-link"><a data-handout-skip-intercept="1" href="index.html?p=${encodeURIComponent(mdFile)}#${hIndex}/${vIndex}" target="_blank">${slideNumber}</a></div>`);
    output.push(`<div class="slide-number slide-number-nolink" style="display: none">${slideNumber}</div>`);
    output.push(slideHTML);
    if (cleanedNote) {
      output.push(`<div class="note">${noteHTML}</div>`);
    }
    output.push('</section>');
  }

  return output.join('\n');
}

function getFixtures() {
  return fs.readdirSync(FIXTURES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      dir: path.join(FIXTURES_DIR, entry.name),
      inputPath: path.join(FIXTURES_DIR, entry.name, 'presentation.md'),
      processedPath: path.join(FIXTURES_DIR, entry.name, 'reference', 'reveal.md'),
      handoutPath: path.join(FIXTURES_DIR, entry.name, 'reference', 'handout.html')
    }))
    .filter((fixture) => fs.existsSync(fixture.inputPath))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function writeFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, ensureTrailingNewline(value));
}

function removeDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

function main() {
  const fixtures = getFixtures();
  if (fixtures.length === 0) {
    throw new Error(`No fixtures found in ${FIXTURES_DIR}`);
  }

  const failures = [];
  if (!GENERATE_MODE) {
    removeDir(ACTUAL_DIR);
  }

  for (const fixture of fixtures) {
    const rawMarkdown = readText(fixture.inputPath);
    const revealMarkdown = buildRevealMarkdown(rawMarkdown);
    const handoutHTML = buildHandoutHTML(rawMarkdown, 'presentation.md');

    if (GENERATE_MODE) {
      writeFile(fixture.processedPath, revealMarkdown);
      writeFile(fixture.handoutPath, handoutHTML);
      continue;
    }

    const expectedReveal = ensureTrailingNewline(readText(fixture.processedPath));
    const expectedHandout = ensureTrailingNewline(readText(fixture.handoutPath));
    const actualReveal = ensureTrailingNewline(revealMarkdown);
    const actualHandout = ensureTrailingNewline(handoutHTML);

    try {
      assert.strictEqual(actualReveal, expectedReveal);
      assert.strictEqual(actualHandout, expectedHandout);
      process.stdout.write(`PASS ${fixture.name}\n`);
    } catch (error) {
      const actualFixtureDir = path.join(ACTUAL_DIR, fixture.name);
      writeFile(path.join(actualFixtureDir, 'reveal.md'), actualReveal);
      writeFile(path.join(actualFixtureDir, 'handout.html'), actualHandout);
      failures.push({
        fixture: fixture.name,
        actualDir: actualFixtureDir,
        message: error.message
      });
      process.stdout.write(`FAIL ${fixture.name}\n`);
    }
  }

  if (GENERATE_MODE) {
    process.stdout.write(`Generated reference output for ${fixtures.length} fixture(s).\n`);
    return;
  }

  if (failures.length > 0) {
    process.stdout.write('\nMismatches:\n');
    for (const failure of failures) {
      process.stdout.write(`- ${failure.fixture}: see ${failure.actualDir}\n`);
    }
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`\nAll ${fixtures.length} fixture(s) matched reference output.\n`);
}

main();
