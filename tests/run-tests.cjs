#!/usr/bin/env node
// `npm run tests`: compiler fixtures (below), then the server tests in tests/server/. See tests/README.md.

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { pathToFileURL } = require('url');
const { spawnSync } = require('child_process');
const { marked } = require('marked');

const ROOT = __dirname;
const REVELATION_ROOT = path.resolve(ROOT, '..');
const FIXTURES_DIR = path.join(ROOT, 'fixtures');
const ACTUAL_DIR = path.join(ROOT, '_actual');
const GENERATE_MODE = process.argv.includes('--generate');
const FIXTURES_ONLY = process.argv.includes('--fixtures-only');

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

// The compiler modules are browser ES modules. Import them directly instead of rewriting their
// source: adding an export, an import or a new module needs no change here. Node 22.7+ detects
// ESM syntax in .js files; the typeless-package warning that triggers is filtered below.
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 7)) {
  console.error(`These tests need Node 22.7 or newer (running ${process.versions.node}).`);
  process.exit(1);
}
process.removeAllListeners('warning');
process.on('warning', (warning) => {
  if (warning.code !== 'MODULE_TYPELESS_PACKAGE_JSON') console.warn(warning);
});

const importModule = (...segments) => import(pathToFileURL(path.join(...segments)).href);

// Browser globals the modules read at call time. `document` is deliberately undefined so the
// sanitizers take their DOM-free path, as they do for the handout/export code.
global.tr = (value) => value; // plugin client modules use the page-level translate function

let convertSmartQuotes;
let segmentPresentation;
let stripSlideSeparatorsOutsideCodeBlocks;
let extractFrontMatter;
let getNoteSeparator;
let preprocessMarkdown;
let sanitizeMarkdownEmbeddedHTML;
let sanitizeRenderedHTML;
let preprocessCreditCcliMarkdown;

async function loadModules() {
  convertSmartQuotes = (await importModule(REVELATION_ROOT, 'js', 'smart-quotes.js')).default;
  ({ segmentPresentation, stripSlideSeparatorsOutsideCodeBlocks } =
    await importModule(REVELATION_ROOT, 'js', 'compiler', 'presentation-segments.js'));
  ({ extractFrontMatter, getNoteSeparator, preprocessMarkdown, sanitizeMarkdownEmbeddedHTML, sanitizeRenderedHTML } =
    await importModule(REVELATION_ROOT, 'js', 'compiler', 'markdown-compiler.js'));
  ({ preprocessMarkdown: preprocessCreditCcliMarkdown } =
    await importModule(REVELATION_ROOT, '..', 'plugins', 'credit_ccli', 'markdown-preprocessor.js'));
}

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
  const partiallyProcessed = preprocessMarkdown(
    content,
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

async function main() {
  await loadModules();
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
  } else {
    process.stdout.write(`\nAll ${fixtures.length} fixture(s) matched reference output.\n`);
  }
}

// tests/server/*.test.cjs start a real Vite server, so each file runs in its own process (the plugin
// reads its mode from the environment once). --test-force-exit because the plugin never closes its
// file watcher or sockets.
function runServerTests() {
  const dir = path.join(ROOT, 'server');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.test.cjs')).sort().map((f) => path.join(dir, f));
  process.stdout.write(`\nServer tests (${files.length} file(s))\n`);
  const passthrough = process.argv.slice(2).filter((a) => a.startsWith('--test-'));
  const result = spawnSync(process.execPath, ['--test', '--test-force-exit', ...passthrough, ...files], { stdio: 'inherit' });
  if (result.status !== 0) process.exitCode = 1;
}

main().then(() => {
  if (!GENERATE_MODE && !FIXTURES_ONLY) runServerTests();
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
