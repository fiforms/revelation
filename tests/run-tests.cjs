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

function loadPresentationSegments() {
  const filePath = path.join(REVELATION_ROOT, 'js', 'compiler', 'presentation-segments.js');
  let source = readText(filePath);
  source = source.replace(/export function /g, 'function ');
  source += `
module.exports = {
  segmentPresentation,
  splitSlides,
  splitSlideContentAndNotes,
  stripSlideSeparatorsOutsideCodeBlocks
};
`;

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

function loadSlideCompiler() {
  const filePath = path.join(REVELATION_ROOT, 'js', 'compiler', 'slide-compiler.js');
  let source = readText(filePath);
  source = source.replace(/export function /g, 'function ');
  source += `
module.exports = {
  createSlideCompiler
};
`;

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

function loadMarkdownLineParsers() {
  const filePath = path.join(REVELATION_ROOT, 'js', 'compiler', 'markdown-line-parsers.js');
  let source = readText(filePath);
  source = source.replace(/export function /g, 'function ');
  source += `
module.exports = {
  createMarkdownLineParsers
};
`;

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

function loadMediaLineParsers() {
  const filePath = path.join(REVELATION_ROOT, 'js', 'compiler', 'media-line-parsers.js');
  let source = readText(filePath);
  source = source.replace(/export function /g, 'function ');
  source += `
module.exports = {
  createMediaLineParsers
};
`;

  const module = { exports: {} };
  const context = {
    module,
    exports: module.exports,
    require,
    console,
    window: global.window
  };
  vm.runInNewContext(source, context, { filename: filePath });
  return module.exports;
}

function loadLoaderUtils() {
  const filePath = path.join(REVELATION_ROOT, 'js', 'compiler', 'compiler-utils.js');
  let source = readText(filePath);
  source = source.replace(/export function /g, 'function ');
  source = source.replace(/export \{\s*NOTE_SEPARATOR_CURRENT,\s*NOTE_SEPARATOR_LEGACY\s*\};/, '');
  source += `
module.exports = {
  getStorageItemSafe,
  usesNewNoteSeparator,
  getNoteSeparator,
  sanitizeMarkdownFilename,
  NOTE_SEPARATOR_CURRENT,
  NOTE_SEPARATOR_LEGACY
};
`;

  const module = { exports: {} };
  const context = { module, exports: module.exports, require, console, window: global.window };
  vm.runInNewContext(source, context, { filename: filePath });
  return module.exports;
}

function loadHtmlSanitization() {
  const filePath = path.join(REVELATION_ROOT, 'js', 'compiler', 'html-sanitization.js');
  let source = readText(filePath);
  source = source.replace(/export function /g, 'function ');
  source += `
module.exports = {
  isDangerousURL,
  sanitizeMarkdownEmbeddedHTML,
  sanitizeRenderedHTML
};
`;

  const module = { exports: {} };
  const context = { module, exports: module.exports, require, console, document: global.document };
  vm.runInNewContext(source, context, { filename: filePath });
  return module.exports;
}

function loadCreditCcliMarkdownPreprocessor() {
  const filePath = path.join(REVELATION_ROOT, '..', 'plugins', 'credit_ccli', 'markdown-preprocessor.js');
  let source = readText(filePath);
  source = source.replace(/export function /g, 'function ');
  source += '\nmodule.exports = { preprocessMarkdown };\n';

  const module = { exports: {} };
  const context = {
    module,
    exports: module.exports,
    require,
    console,
    window: global.window,
    tr: (value) => value
  };
  vm.runInNewContext(source, context, { filename: filePath });
  return module.exports;
}

function loadMarkdownCompiler(slideCompiler, markdownLineParsers, mediaLineParsers, htmlSanitization, loaderUtils) {
  const filePath = path.join(REVELATION_ROOT, 'js', 'compiler', 'markdown-compiler.js');
  let source = readText(filePath);
  source = source.replace("import yaml from 'js-yaml';", "const yaml = require('js-yaml');");
  source = source.replace("import { createSlideCompiler } from './slide-compiler.js';", 'const { createSlideCompiler } = __imports.slideCompiler;');
  source = source.replace("import { createMarkdownLineParsers } from './markdown-line-parsers.js';", 'const { createMarkdownLineParsers } = __imports.markdownLineParsers;');
  source = source.replace("import { createMediaLineParsers } from './media-line-parsers.js';", 'const { createMediaLineParsers } = __imports.mediaLineParsers;');
  source = source.replace("import { isDangerousURL, sanitizeMarkdownEmbeddedHTML, sanitizeRenderedHTML } from './html-sanitization.js';", 'const { isDangerousURL, sanitizeMarkdownEmbeddedHTML, sanitizeRenderedHTML } = __imports.htmlSanitization;');
  source = source.replace(/import \{\s*getStorageItemSafe,\s*usesNewNoteSeparator,\s*getNoteSeparator,\s*NOTE_SEPARATOR_CURRENT,\s*NOTE_SEPARATOR_LEGACY\s*\} from '\.\/compiler-utils\.js';/, 'const { getStorageItemSafe, usesNewNoteSeparator, getNoteSeparator, NOTE_SEPARATOR_CURRENT, NOTE_SEPARATOR_LEGACY } = __imports.loaderUtils;');
  source = source.replace(/export async function /g, 'async function ');
  source = source.replace(/export function /g, 'function ');
  source = source.replace(/export \{\s*usesNewNoteSeparator,\s*getNoteSeparator,\s*sanitizeMarkdownEmbeddedHTML,\s*sanitizeRenderedHTML\s*\};/, '');
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
    __imports: { slideCompiler, markdownLineParsers, mediaLineParsers, htmlSanitization, loaderUtils },
    window: global.window,
    document: global.document,
    URLSearchParams,
    fetch: global.fetch
  };
  vm.runInNewContext(source, context, { filename: filePath });
  return module.exports;
}

const convertSmartQuotes = loadSmartQuotes();
const slideCompiler = loadSlideCompiler();
const markdownLineParsers = loadMarkdownLineParsers();
const mediaLineParsers = loadMediaLineParsers();
const htmlSanitization = loadHtmlSanitization();
const loaderUtils = loadLoaderUtils();
const {
  segmentPresentation,
  stripSlideSeparatorsOutsideCodeBlocks
} = loadPresentationSegments();
const {
  extractFrontMatter,
  getNoteSeparator,
  preprocessMarkdown,
  sanitizeMarkdownEmbeddedHTML,
  sanitizeRenderedHTML
} = loadMarkdownCompiler(slideCompiler, markdownLineParsers, mediaLineParsers, htmlSanitization, loaderUtils);
const { preprocessMarkdown: preprocessCreditCcliMarkdown } = loadCreditCcliMarkdownPreprocessor();

function runPluginRegressionTests() {
  const creditsMarkdown = [
    ':credits:',
    '  words: Fanny Crosby',
    '  music: William H. Doane',
    '  year: 1875',
    '  copyright: Public Domain Archive',
    '  license: public'
  ].join('\n');

  const processed = preprocessCreditCcliMarkdown(creditsMarkdown, {
    parseYAML: (value) => require('js-yaml').load(value),
    appConfig: {}
  });

  assert.match(processed, /Words by Fanny Crosby \(1875\)/);
  assert.match(processed, /Music by William H\. Doane/);
  assert.match(processed, /Public Domain/);
  assert.doesNotMatch(processed, /&copy;|©|\{\{ATTRIB:/);
}

function isCommentOnlyMarkdown(markdown) {
  if (!markdown || !markdown.trim()) return true;
  return markdown.replace(/<!--[\s\S]*?-->/g, '').trim().length === 0;
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
  const noteSeparator = getNoteSeparator(metadata);
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
  const slides = segmentPresentation(processed, noteSeparator);
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
    } else if (slide.breakBefore === 'horizontal') {
      hIndex += 1;
      vIndex = 1;
    } else if (slide.breakBefore === 'vertical') {
      vIndex += 1;
    } else {
      hIndex += 1;
      vIndex = 1;
    }

    slideCount += 1;

    const cleanedMarkdown = stripSlideSeparatorsOutsideCodeBlocks(slide.content).trim();
    const cleanedNote = slide.notes
      ? stripSlideSeparatorsOutsideCodeBlocks(slide.notes).trim()
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
  runPluginRegressionTests();
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
