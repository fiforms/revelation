// pip.html as the real server serves it. It is reachable without a key and the wrapper opens it in a
// window with the presentation preload, so the served page must carry its CSP and have no inline script
// (S3 in the wrapper's doc/dev/KNOWN_ISSUES.md: a javascript: ?src= used to run in this origin).
const test = require('node:test');
const assert = require('node:assert');
const { startServer } = require('../helpers/vite-server.cjs');

let srv;
test.before(async () => { srv = await startServer({ files: { 'demo/presentation.md': '# hi' } }); });
test.after(() => srv.close());

const get = (p) => fetch(`${srv.base}${p}`);

async function page() {
  const res = await get('/pip.html?src=https%3A%2F%2Fexample.org%2F');
  assert.strictEqual(res.status, 200);
  return res.text();
}

test('pip.html carries a strict CSP: own scripts only, http(s) frames only, no plugins or base tag', async () => {
  const html = await page();
  const csp = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)?.[1];
  assert.ok(csp, 'a Content-Security-Policy meta tag is present');
  const directive = (name) => csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${name} `));

  assert.strictEqual(directive('default-src'), "default-src 'none'");
  assert.strictEqual(directive('script-src'), "script-src 'self'", 'no unsafe-inline or unsafe-eval for scripts');
  assert.strictEqual(directive('frame-src'), 'frame-src http: https:', 'javascript:, data: and blob: frames are not allowed');
  assert.strictEqual(directive('object-src'), "object-src 'none'");
  assert.strictEqual(directive('base-uri'), "base-uri 'none'");
  assert.strictEqual(directive('form-action'), "form-action 'none'");
  assert.ok(!/unsafe-eval/.test(csp));
});

test('pip.html has no inline script: every script tag loads a file from this server', async () => {
  const html = await page();
  const scripts = html.match(/<script\b[^>]*>[\s\S]*?<\/script>/g) || [];
  assert.ok(scripts.length >= 1);
  for (const tag of scripts) {
    assert.match(tag, /<script\b[^>]*\bsrc="\/[^"]+"/, `inline script found: ${tag.slice(0, 80)}`);
    assert.strictEqual(tag.replace(/<script\b[^>]*>/, '').replace('</script>', '').trim(), '', 'script tags are empty');
  }
  assert.match(html, /<script type="module" src="\/js\/pip\.js">/);
});

test('the page script and its core module are served as JavaScript', async () => {
  for (const p of ['/js/pip.js', '/js/pip-core.js']) {
    const res = await get(p);
    assert.strictEqual(res.status, 200, p);
    assert.match(res.headers.get('content-type') || '', /javascript/, p);
  }
  assert.match(await (await get('/js/pip-core.js')).text(), /parsePipSource/);
});
