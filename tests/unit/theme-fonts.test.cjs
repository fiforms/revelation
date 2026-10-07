// Offline fonts: no compiled stylesheet may reach for the network, and every local font file it
// points at must exist. Compiles each css/source/*.scss exactly as `npm run build:theme` does
// (after scripts/prepare-reveal-themes.js, which swaps reveal.js's Google Fonts imports for local
// ones) and scans the result. Fails if a reveal.js upgrade adds a font we do not bundle, or if a
// theme of ours adds a CDN URL.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const sass = require('sass');

const ROOT = path.resolve(__dirname, '../..');
const SOURCE_DIR = path.join(ROOT, 'css/source');
const CSS_DIR = path.join(ROOT, 'css'); // compiled sheets are served from here, so ./fonts/... resolves against it

// Same load paths, in the same order, as the watch:theme / build:theme scripts in package.json.
const LOAD_PATHS = ['.theme-shim', 'node_modules', 'node_modules/reveal.js/css/theme'].map((p) => path.join(ROOT, p));

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

// url(...) and @import "..." targets in compiled CSS, comments removed.
function references(css) {
  const out = [];
  const text = stripComments(css);
  for (const m of text.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) out.push(m[2].trim());
  for (const m of text.matchAll(/@import\s+(['"])([^'"]+)\1/g)) out.push(m[2].trim());
  return out;
}

const isRemote = (ref) => /^(https?:)?\/\//i.test(ref);
const isInline = (ref) => /^(data:|#)/i.test(ref);

const themes = fs.readdirSync(SOURCE_DIR).filter((f) => f.endsWith('.scss') && !f.startsWith('_')).sort();

test('theme sources: found some themes to check', () => {
  assert.ok(themes.length >= 10, `only found ${themes.length} .scss files in css/source`);
});

test('prepare-reveal-themes.js patches reveal.js themes without editing node_modules', () => {
  const shimDir = path.join(ROOT, '.theme-shim/reveal.js/css/theme');
  const vendor = path.join(ROOT, 'node_modules/reveal.js/css/theme/night.scss');
  const before = fs.readFileSync(vendor, 'utf8');

  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/prepare-reveal-themes.js')], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);

  assert.strictEqual(fs.readFileSync(vendor, 'utf8'), before, 'node_modules was modified');
  const patched = fs.readFileSync(path.join(shimDir, 'night.scss'), 'utf8');
  assert.doesNotMatch(patched, /fonts\.(googleapis|gstatic)\.com/);
  assert.match(patched, /\.\/fonts\/greek-fallback\.css/);
});

test('our own theme sources have no Google Fonts or other CDN font URLs', () => {
  const files = [...themes, 'custom/layouts.scss', 'custom/text-colors.scss', 'medialibrary.css'];
  for (const file of files) {
    const text = stripComments(fs.readFileSync(path.join(SOURCE_DIR, file), 'utf8'));
    assert.doesNotMatch(text, /fonts\.(googleapis|gstatic)\.com/, `${file} loads Google Fonts`);
    for (const ref of references(text)) assert.ok(!isRemote(ref), `${file} references a remote URL: ${ref}`);
  }
});

for (const theme of themes) {
  test(`compiled ${theme}: no remote URLs, every local file exists`, () => {
    const result = sass.compile(path.join(SOURCE_DIR, theme), {
      loadPaths: LOAD_PATHS,
      silenceDeprecations: ['import'],
      logger: sass.Logger.silent
    });

    const seen = new Set();
    const problems = [];
    const check = (css, baseDir, origin) => {
      for (const ref of references(css)) {
        if (isInline(ref)) continue;
        if (isRemote(ref)) {
          problems.push(`${origin}: remote URL ${ref}`);
          continue;
        }
        // Strip ?#iefix style suffixes. URLs are relative to the stylesheet, except /css/reveal.js/dist,
        // which vite.plugins.js mounts from node_modules/reveal.js/dist.
        const bare = ref.split(/[?#]/)[0];
        const target = bare.startsWith('reveal.js/dist/')
          ? path.join(ROOT, 'node_modules', bare)
          : path.resolve(baseDir, bare.replace(/^\//, ''));
        if (!fs.existsSync(target)) {
          problems.push(`${origin}: missing file ${ref}`);
          continue;
        }
        // Font stylesheets import their own files, so follow them (url() in a .css is relative to that file).
        if (target.endsWith('.css') && !seen.has(target)) {
          seen.add(target);
          check(fs.readFileSync(target, 'utf8'), path.dirname(target), path.relative(ROOT, target));
        }
      }
    };
    check(result.css, CSS_DIR, theme);

    assert.deepStrictEqual(problems, [], `\n${problems.join('\n')}`);
  });
}
