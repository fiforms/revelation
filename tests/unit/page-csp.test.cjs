// The pages that render deck-controlled text carry a CSP whose script-src has no 'unsafe-inline', so an
// HTML-injection slip in the sanitizer or in an innerHTML template cannot run script. These tests only
// check the policy is present and that the page scripts use no inline event handlers (which it would block).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

for (const page of ['presentation.html', 'presentations.html', 'handout.html', 'pip.html']) {
  test(`${page} has a CSP that blocks inline script`, () => {
    const html = read(page);
    const m = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]*)"/);
    assert.ok(m, 'CSP meta tag present');
    const scriptSrc = m[1].split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src')) || '';
    assert.ok(scriptSrc, 'script-src directive present');
    assert.ok(!/'unsafe-inline'|'unsafe-eval'/.test(scriptSrc), scriptSrc);
    assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html.replace(/<script[^>]*type="application\/json"[^>]*>/gi, '')) || page === 'presentation.html',
      'no inline <script> blocks (presentation.html allows one by hash)');
  });
}

test('presentationlist.js and handout.js build no inline event-handler attributes', () => {
  for (const f of ['js/presentationlist.js', 'js/handout.js']) {
    assert.ok(!/\son(error|load|click|mouse\w+|focus|change)\s*=\s*["'\\]/i.test(read(f)), f);
  }
});
