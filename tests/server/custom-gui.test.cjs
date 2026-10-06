// The REVELation Vite plugin as the Electron wrapper runs it: custom presentations path + GUI mode
// + USER_DATA_DIR + admin dir. Drives the real middleware stack over HTTP and checks the routes,
// trust gates and file serving documented in the header of vite.plugins.js (section 5).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { startServer } = require('../helpers/vite-server.cjs');

const TOKEN = 'a'.repeat(48);
const MEDIA = Buffer.from('0123456789abcdefghij'); // 20 bytes: ranges are easy to verify
let srv;
let mediaFile;
let thumbLog;

const front = (title, extra = '') => `---\ntitle: ${title}\n${extra}---\n\n# ${title}\n`;
const pres = (p) => `${srv.base}/presentations_${srv.key}${p}`;

test.before(async () => {
  srv = await startServer({
    parentPort: true,
    adminFiles: { 'hello.html': '<p>admin</p>' },
    files: {
      'demo/presentation.md': front('Demo Deck', 'description: A demo\ntheme: black.css\n'),
      'demo/variant.md': front('Variant', 'alternatives: hidden\n'),
      'demo/nested/inner.md': front('Inner'),
      'broken/presentation.md': '---\ntitle: [unclosed\n---\n# x\n',
      'notitle/presentation.md': '# no front matter\n',
      '_current_open/presentation.md': front('Transient'),
      '.hidden/presentation.md': front('Hidden'),
      'locked.lock/presentation.md': front('Locked'),
      '_media/legacy.thumbnail.webp': 'webp-bytes',
      '_media/both.thumbnail.webp': 'webp-bytes',
      '_media/both.thumbnail.jpg': 'jpg-bytes',
      'demo/_media/pic.png': 'png-bytes'
    },
    pluginFiles: { 'sample/plugin.js': 'module.exports = {};' }
  });
  mediaFile = path.join(srv.dirs.userData, 'share.bin');
  fs.writeFileSync(mediaFile, MEDIA);

  // A fake ffmpeg: logs each call and writes a tiny file to the output path (the last argument).
  const bin = path.join(srv.dirs.userData, 'fake-ffmpeg.js');
  thumbLog = path.join(srv.dirs.userData, 'ffmpeg-calls.log');
  fs.writeFileSync(bin, `#!${process.execPath}
const fs = require('fs');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(thumbLog)}, args.join(' ') + '\\n');
setTimeout(() => { fs.writeFileSync(args[args.length - 1], 'JPEGDATA'); }, 150);
`, { mode: 0o755 });
  srv.setFfmpegBin(bin);
});

test.after(() => srv.close());

// --- Presentation index ------------------------------------------------------------------------

test('index.json is served from the userData cache and lists presentations correctly', async () => {
  const res = await fetch(pres('/index.json'));
  assert.strictEqual(res.status, 200);
  assert.match(res.headers.get('content-type'), /application\/json/);
  const index = await res.json();
  const byId = Object.fromEntries(index.map((e) => [`${e.slug}/${e.md}`, e]));

  assert.deepStrictEqual(Object.keys(byId).sort(), [
    'broken/presentation.md', 'demo/nested/inner.md', 'demo/presentation.md', 'notitle/presentation.md'
  ]);
  assert.strictEqual(byId['demo/presentation.md'].title, 'Demo Deck');
  assert.strictEqual(byId['demo/presentation.md'].description, 'A demo');
  assert.strictEqual(byId['demo/presentation.md'].theme, 'black.css');
  assert.strictEqual(byId['demo/presentation.md'].thumbnail, 'presentation.thumb.jpg');
  assert.strictEqual(byId['notitle/presentation.md'].title, 'notitle/presentation.md', 'falls back to the path');
  assert.strictEqual(byId['broken/presentation.md']._malformed, true);
  assert.strictEqual(byId['broken/presentation.md'].title, '{malformed YAML}');
  // Never listed: hidden alternatives, the transient .revel copy, dot folders, lock files.
  for (const hidden of ['demo/variant.md', '_current_open/presentation.md', '.hidden/presentation.md', 'locked.lock/presentation.md']) {
    assert.ok(!byId[hidden], `${hidden} must not be listed`);
  }
});

test('the index cache lives in userData and nothing is written into the presentations folder', () => {
  assert.ok(fs.existsSync(path.join(srv.dirs.userData, '.revelation-cache', 'presentations-index.json')));
  assert.ok(!fs.existsSync(path.join(srv.dirs.presentations, 'index.json')));
});

test('index.json and _media/index.json are refused to non-loopback clients', async (t) => {
  if (!srv.lanUrl) return t.skip('no non-loopback IPv4 interface on this machine');
  const lan = (p) => `${srv.lanUrl}/presentations_${srv.key}${p}`;
  assert.strictEqual((await fetch(lan('/index.json'))).status, 403);
  assert.strictEqual((await fetch(lan('/_media/index.json'))).status, 403);
  assert.strictEqual((await fetch(lan('/INDEX.JSON'))).status, 403, 'case-insensitive');
  assert.strictEqual((await fetch(pres('/index.json'))).status, 200, 'loopback still allowed');
});

test('sandbox origin (Origin: null) is only honoured from loopback', async (t) => {
  const opt = await fetch(pres('/demo/presentation.md'), { method: 'OPTIONS', headers: { origin: 'null' } });
  assert.strictEqual(opt.status, 204);
  if (!srv.lanUrl) return t.skip('no non-loopback IPv4 interface on this machine');
  const lanRes = await fetch(`${srv.lanUrl}/presentations_${srv.key}/demo/presentation.md`, { headers: { origin: 'null' } });
  assert.strictEqual(lanRes.status, 403);
  const plainLan = await fetch(`${srv.lanUrl}/presentations_${srv.key}/demo/presentation.md`);
  assert.strictEqual(plainLan.status, 200, 'LAN access without the sandbox origin is the normal case');
});

// --- Presentation files and rewrites -----------------------------------------------------------

test('presentations are served from the custom path; the plugins tree from /plugins_<key>', async () => {
  const md = await fetch(pres('/demo/presentation.md'));
  assert.strictEqual(md.status, 200);
  assert.match(await md.text(), /Demo Deck/);
  const plugin = await fetch(`${srv.base}/plugins_${srv.key}/sample/plugin.js`);
  assert.strictEqual(plugin.status, 200);
});

test('/presentations_<key>/<slug>/ and /handout rewrite to the viewer pages', async () => {
  const viewer = await fetch(pres('/demo/'));
  const handout = await fetch(pres('/demo/handout'));
  const direct = await fetch(`${srv.base}/presentation.html?slug=demo&key=${srv.key}`);
  const directHandout = await fetch(`${srv.base}/handout.html?slug=demo&key=${srv.key}`);
  assert.strictEqual(viewer.status, 200);
  assert.strictEqual(await viewer.text(), await direct.text());
  assert.strictEqual(handout.status, 200);
  assert.strictEqual(await handout.text(), await directHandout.text());
});

test('presentation.html carries the speaker-view script hash in its CSP (placeholder substituted)', async () => {
  const html = await (await fetch(`${srv.base}/presentation.html?slug=demo&key=${srv.key}`)).text();
  assert.ok(!html.includes('NOTES_VIEW_SCRIPT_HASH'), 'placeholder must be replaced');
  assert.match(html, /'sha256-[A-Za-z0-9+/=]+'/);
});

// --- Legacy thumbnails ------------------------------------------------------------------------

test('a missing .thumbnail.jpg falls back to the legacy .webp; an existing jpg wins', async () => {
  const legacy = await fetch(pres('/_media/legacy.thumbnail.jpg'));
  assert.strictEqual(legacy.status, 200);
  assert.strictEqual(legacy.headers.get('content-type'), 'image/webp');
  assert.strictEqual(await legacy.text(), 'webp-bytes');

  const both = await fetch(pres('/_media/both.thumbnail.jpg'));
  assert.strictEqual(await both.text(), 'jpg-bytes');

  const head = await fetch(pres('/_media/legacy.thumbnail.jpg'), { method: 'HEAD' });
  assert.strictEqual(head.status, 200);
  assert.strictEqual(await head.text(), '');
});

test('the webp fallback only answers well-formed thumbnail names', async () => {
  for (const bad of ['..%2Flegacy.thumbnail.jpg', '%2e%2e%2Flegacy.thumbnail.jpg', 'legacy.thumbnail.jpg%00', '.legacy.thumbnail.jpg']) {
    const res = await fetch(pres(`/_media/${bad}`));
    assert.notStrictEqual(await res.text(), 'webp-bytes', `${bad} must not reach the webp`);
  }
});

// --- /media-share tokens ------------------------------------------------------------------------

test('media-share: registered token streams the file with the registered type', async () => {
  srv.send({ type: 'register-media-token', token: TOKEN, absolutePath: mediaFile, mimeType: 'video/mp4' });
  const res = await fetch(`${srv.base}/media-share/${TOKEN}`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get('content-type'), 'video/mp4');
  assert.strictEqual(res.headers.get('accept-ranges'), 'bytes');
  assert.ok(Buffer.from(await res.arrayBuffer()).equals(MEDIA));
});

test('media-share: Range requests give 206 slices and 416 for bad ranges', async () => {
  const get = (range) => fetch(`${srv.base}/media-share/${TOKEN}`, { headers: { range } });
  const part = await get('bytes=5-9');
  assert.strictEqual(part.status, 206);
  assert.strictEqual(part.headers.get('content-range'), 'bytes 5-9/20');
  assert.strictEqual(await part.text(), '56789');
  const open = await get('bytes=15-');
  assert.strictEqual(open.status, 206);
  assert.strictEqual(await open.text(), 'fghij');
  for (const bad of ['bytes=10-5', 'bytes=0-20', 'bytes=99-100', 'garbage']) {
    const res = await get(bad);
    assert.strictEqual(res.status, 416, bad);
    assert.strictEqual(res.headers.get('content-range'), 'bytes */20');
  }
});

test('media-share: unknown, malformed and revoked tokens are 404; bad registrations are ignored', async () => {
  const status = async (token) => (await fetch(`${srv.base}/media-share/${token}`)).status;
  assert.strictEqual(await status('b'.repeat(48)), 404, 'unknown');
  assert.strictEqual(await status('short'), 404, 'malformed');
  assert.strictEqual(await status('A'.repeat(48)), 404, 'uppercase is not a valid token');
  assert.strictEqual(await status(`${TOKEN}/../x`), 404);

  const bad = 'c'.repeat(47) + 'z'; // 'z' is not hex
  srv.send({ type: 'register-media-token', token: bad, absolutePath: mediaFile });
  assert.strictEqual(await status(bad), 404, 'non-hex token is not registered');
  srv.send({ type: 'register-media-token', token: 'd'.repeat(48), absolutePath: 42 });
  assert.strictEqual(await status('d'.repeat(48)), 404, 'non-string path is not registered');

  srv.send({ type: 'revoke-media-token', token: TOKEN });
  assert.strictEqual(await status(TOKEN), 404, 'revoked');
});

test('media-share: a token whose file vanished is 404, not a crash', async () => {
  const token = 'e'.repeat(48);
  const gone = path.join(srv.dirs.userData, 'gone.bin');
  fs.writeFileSync(gone, 'x');
  srv.send({ type: 'register-media-token', token, absolutePath: gone });
  fs.rmSync(gone);
  assert.strictEqual((await fetch(`${srv.base}/media-share/${token}`)).status, 404);
});

// --- /thumbs ------------------------------------------------------------------------------------

test('thumbs: generates once, serves from cache, and shares one ffmpeg run between concurrent requests', async () => {
  const url = `${srv.base}/thumbs_${srv.key}/demo/_media/pic.png`;
  const [a, b] = await Promise.all([fetch(url), fetch(url)]);
  assert.strictEqual(a.status, 200);
  assert.strictEqual(a.headers.get('content-type'), 'image/jpeg');
  assert.strictEqual(await a.text(), 'JPEGDATA');
  assert.strictEqual(await b.text(), 'JPEGDATA');
  assert.strictEqual(fs.readFileSync(thumbLog, 'utf8').trim().split('\n').length, 1, 'one ffmpeg run for two requests');

  const cached = await fetch(url);
  assert.strictEqual(await cached.text(), 'JPEGDATA');
  assert.strictEqual(fs.readFileSync(thumbLog, 'utf8').trim().split('\n').length, 1, 'cache hit does not re-run ffmpeg');
  assert.ok(fs.existsSync(path.join(srv.dirs.presentations, 'demo', '_media', '.thumbs', 'pic.png.thumb.jpg')));
});

test('thumbs: a source newer than its thumbnail is regenerated', async () => {
  const source = path.join(srv.dirs.presentations, 'demo', '_media', 'pic.png');
  const future = new Date(Date.now() + 60_000);
  fs.utimesSync(source, future, future);
  const before = fs.readFileSync(thumbLog, 'utf8').trim().split('\n').length;
  const res = await fetch(`${srv.base}/thumbs_${srv.key}/demo/_media/pic.png`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(fs.readFileSync(thumbLog, 'utf8').trim().split('\n').length, before + 1);
});

test('thumbs: missing source is 404 and path traversal never reaches ffmpeg', async () => {
  const before = fs.readFileSync(thumbLog, 'utf8');
  assert.strictEqual((await fetch(`${srv.base}/thumbs_${srv.key}/demo/_media/nope.png`)).status, 404);
  // share.bin sits in userData, one level above the presentations folder: these are real targets.
  assert.ok(fs.existsSync(mediaFile));
  for (const evil of ['..%2FuserData%2Fshare.bin', '%2e%2e%2FuserData%2Fshare.bin', 'demo%2F..%2F..%2FuserData%2Fshare.bin']) {
    const res = await fetch(`${srv.base}/thumbs_${srv.key}/${evil}`);
    assert.notStrictEqual(res.headers.get('content-type'), 'image/jpeg', evil);
    assert.notStrictEqual(await res.text(), 'JPEGDATA', evil);
  }
  assert.strictEqual(fs.readFileSync(thumbLog, 'utf8'), before, 'ffmpeg was not invoked for any of these');
  assert.ok(!fs.existsSync(path.join(srv.dirs.userData, '.thumbs')), 'nothing was written outside the presentations folder');
});

// --- /publish and /admin ------------------------------------------------------------------------

test('/publish serves files from userData/publish with no-store headers and no directory listing', async () => {
  fs.writeFileSync(path.join(srv.dirs.userData, 'publish', 'k123.rev'), '42');
  const res = await fetch(`${srv.base}/publish/k123.rev`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(await res.text(), '42');
  assert.match(res.headers.get('cache-control'), /no-store/);
  const listing = await fetch(`${srv.base}/publish/`);
  assert.ok(!(await listing.text()).includes('k123'), 'file names are not enumerable');
});

test('/admin serves the wrapper pages to loopback only', async (t) => {
  const ok = await fetch(`${srv.base}/admin/hello.html`);
  assert.strictEqual(ok.status, 200);
  assert.match(await ok.text(), /admin/);
  if (!srv.lanUrl) return t.skip('no non-loopback IPv4 interface on this machine');
  assert.strictEqual((await fetch(`${srv.lanUrl}/admin/hello.html`)).status, 403);
});

// --- Index maintenance ---------------------------------------------------------------------------

test('adding a presentation on disk shows up in the index after the watcher debounce', async () => {
  fs.mkdirSync(path.join(srv.dirs.presentations, 'fresh'));
  fs.writeFileSync(path.join(srv.dirs.presentations, 'fresh', 'presentation.md'), front('Fresh One'));
  let found = false;
  for (let i = 0; i < 40 && !found; i += 1) {
    await new Promise((r) => setTimeout(r, 250));
    const index = await (await fetch(pres('/index.json'))).json();
    found = index.some((e) => e.slug === 'fresh' && e.title === 'Fresh One');
  }
  assert.ok(found, 'new presentation was never indexed');
});

test('_media/index.json is built from the *.json sidecar files', async () => {
  const file = path.join(srv.dirs.presentations, '_media', 'index.json');
  // Created at startup only when _media existed; rebuilt when a sidecar changes.
  fs.writeFileSync(path.join(srv.dirs.presentations, '_media', 'clip.json'), JSON.stringify({ title: 'Clip' }));
  let data = null;
  for (let i = 0; i < 40 && !data?.clip; i += 1) {
    await new Promise((r) => setTimeout(r, 250));
    try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* not written yet */ }
  }
  assert.strictEqual(data?.clip?.title, 'Clip');
});
