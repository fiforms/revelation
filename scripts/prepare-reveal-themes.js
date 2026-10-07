// `npm run prepare:theme` (also run first by `watch:theme` and `build:theme`).
//
// Offline fonts for the reveal.js themes. Several reveal.js theme sources
// (node_modules/reveal.js/css/theme/*.scss) start with
//   @import url('https://fonts.googleapis.com/css?family=Lato:400,700,...');
// which Sass passes into the compiled CSS, so the theme loads fonts from Google's CDN.
// We never edit node_modules. Instead this script writes a patched copy of each affected
// theme to .theme-shim/reveal.js/css/theme/<name>.scss, with every Google import replaced
// by a local import of css/fonts/<family>/<family>.css, and css/fonts/greek-fallback.css
// appended. The sass scripts put .theme-shim first on --load-path, so the unchanged
// `@import 'reveal.js/css/theme/<name>'` in css/source/*.scss resolves to the copy.
// Everything else in the copy (relative `@use 'template/...'`) falls through to the real
// reveal.js load path.
//
// Gotchas: a Google family with no local folder in FONT_DIRS aborts the build, so a new
// reveal.js version that adds a font cannot silently reintroduce a CDN request. The
// `./fonts/...` URLs are relative to the compiled CSS (css/ or dist/css/), same as the
// existing theme imports. Our own css/source/*.scss files must not use Google URLs either.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const srcDir = path.join(root, 'node_modules/reveal.js/css/theme');
const outDir = path.join(root, '.theme-shim/reveal.js/css/theme');

// Google family name -> local CSS file, relative to css/fonts/
const FONT_DIRS = {
  'Lato': 'lato/lato.css',
  'Open Sans': 'open_sans/open_sans.css',
  'Montserrat': 'montserrat/montserrat.css',
  'News Cycle': 'news_cycle/news_cycle.css',
  'Quicksand': 'quicksand/quicksand.css',
  'Ubuntu': 'ubuntu/ubuntu.css',
  'League Gothic': 'league-gothic/league-gothic.css',
};

const GOOGLE_IMPORT = /@import\s+url\(\s*['"]?https?:\/\/fonts\.googleapis\.com\/css\?family=([^'")]+)['"]?\s*\)\s*;?/g;
const localImport = (file) => `@import url('./fonts/${file}');`;

fs.rmSync(path.join(root, '.theme-shim'), { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

let patched = 0;
for (const name of fs.readdirSync(srcDir)) {
  if (!name.endsWith('.scss')) continue;
  const text = fs.readFileSync(path.join(srcDir, name), 'utf8');
  if (!/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(text)) continue;

  const seen = new Set();
  let out = text.replace(GOOGLE_IMPORT, (_m, family) => {
    const fam = decodeURIComponent(family.split(':')[0].replace(/\+/g, ' '));
    const file = FONT_DIRS[fam];
    if (!file) throw new Error(`${name}: no local font for Google family "${fam}"; add it to css/fonts and FONT_DIRS`);
    if (seen.has(file)) return '';
    seen.add(file);
    return localImport(file);
  });
  if (/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(out)) {
    throw new Error(`${name}: Google Fonts reference not handled by prepare-reveal-themes.js`);
  }
  out += `\n// Greek glyphs for families that lack them (see css/fonts/greek-fallback.css)\n${localImport('greek-fallback.css')}\n`;
  fs.writeFileSync(path.join(outDir, name), out);
  patched++;
}
console.log(`🔤 Patched ${patched} reveal.js theme(s) for offline fonts -> .theme-shim`);
