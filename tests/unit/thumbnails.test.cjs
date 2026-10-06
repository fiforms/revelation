// server/thumbnails.js: the ffmpeg thumbnail generator (concurrency cap, de-duplication, failure
// recovery), the /thumbs_<key> middleware and the legacy .webp fallback. Uses a fake ffmpeg.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { createThumbnailGenerator, createThumbsMiddleware, createLegacyThumbnailFallback } = require('../../server/thumbnails.js');
const { tmpDir, writeTree, remove } = require('../helpers/tmp.cjs');

const quiet = () => {
  const saved = [console.log, console.warn, console.error];
  console.log = console.warn = console.error = () => {};
  return () => { [console.log, console.warn, console.error] = saved; };
};

// A fake ffmpeg (a node script). Each call appends "start <out>" and "end <out>" to a log so
// overlap can be measured. FAIL_ON in the output path makes it exit 1. `ms` is how long it "works".
function makeFakeFfmpeg(dir, ms = 120) {
  const bin = path.join(dir, 'fake-ffmpeg.js');
  const log = path.join(dir, 'ffmpeg.log');
  fs.writeFileSync(bin, `#!${process.execPath}
const fs = require('fs');
const args = process.argv.slice(2);
const out = args[args.length - 1];
fs.appendFileSync(${JSON.stringify(log)}, 'start ' + args.join(' ') + '\\n');
setTimeout(() => {
  fs.appendFileSync(${JSON.stringify(log)}, 'end ' + out + '\\n');
  if (out.includes('FAIL')) { process.stderr.write('boom'); process.exit(1); }
  fs.writeFileSync(out, 'JPEG');
}, ${ms});
`, { mode: 0o755 });
  const lines = () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean) : []);
  return { bin, lines, starts: () => lines().filter((l) => l.startsWith('start')) };
}

test('the generator never runs more than maxConcurrent ffmpeg processes at once', async () => {
  const restore = quiet();
  const dir = tmpDir();
  const ff = makeFakeFfmpeg(dir, 150);
  const gen = createThumbnailGenerator({ maxConcurrent: 2 });
  const jobs = Array.from({ length: 6 }, (_, i) => gen.ensure(ff.bin, path.join(dir, `s${i}.png`), path.join(dir, `.t${i}`, `s${i}.jpg`)));
  await Promise.all(jobs);
  restore();
  let running = 0;
  let peak = 0;
  for (const line of ff.lines()) {
    running += line.startsWith('start') ? 1 : -1;
    peak = Math.max(peak, running);
  }
  assert.strictEqual(ff.starts().length, 6);
  assert.strictEqual(peak, 2, 'exactly the configured limit was reached and never exceeded');
  remove(dir);
});

test('concurrent requests for the same thumbnail share one ffmpeg run', async () => {
  const restore = quiet();
  const dir = tmpDir();
  const ff = makeFakeFfmpeg(dir);
  const gen = createThumbnailGenerator();
  const thumb = path.join(dir, '.thumbs', 'a.png.thumb.jpg');
  const a = gen.ensure(ff.bin, path.join(dir, 'a.png'), thumb);
  const b = gen.ensure(ff.bin, path.join(dir, 'a.png'), thumb);
  assert.strictEqual(a, b, 'the same pending promise');
  await Promise.all([a, b]);
  restore();
  assert.strictEqual(ff.starts().length, 1);
  assert.ok(fs.existsSync(thumb));
  remove(dir);
});

test('video sources seek to the start; images do not; both scale to 320px wide', async () => {
  const restore = quiet();
  const dir = tmpDir();
  const ff = makeFakeFfmpeg(dir, 10);
  const gen = createThumbnailGenerator();
  await gen.ensure(ff.bin, path.join(dir, 'v.MP4'), path.join(dir, '.t', 'v.jpg'));
  await gen.ensure(ff.bin, path.join(dir, 'i.png'), path.join(dir, '.t', 'i.jpg'));
  restore();
  const [video, image] = ff.starts();
  assert.match(video, /-ss 0 -i .*v\.MP4 /);
  assert.ok(!image.includes('-ss'));
  for (const call of [video, image]) assert.match(call, /scale=320:-2.*-frames:v 1/);
  remove(dir);
});

test('a failed run rejects, clears the in-flight entry, and a retry runs ffmpeg again', async () => {
  const restore = quiet();
  const dir = tmpDir();
  const ff = makeFakeFfmpeg(dir, 10);
  const gen = createThumbnailGenerator();
  const bad = path.join(dir, '.thumbs', 'FAIL.jpg');
  await assert.rejects(gen.ensure(ff.bin, path.join(dir, 's.png'), bad), /ffmpeg exit 1: boom/);
  await assert.rejects(gen.ensure(ff.bin, path.join(dir, 's.png'), bad), /ffmpeg exit 1/);
  await assert.rejects(gen.ensure('/definitely/not/ffmpeg', path.join(dir, 's.png'), path.join(dir, '.thumbs', 'x.jpg')), /ENOENT/);
  restore();
  assert.strictEqual(ff.starts().length, 2, 'the second attempt really ran again');
  remove(dir);
});

async function withThumbsServer(ffmpegBin, fn) {
  const dir = writeTree(tmpDir(), { 'demo/_media/pic.png': 'png', 'demo/note.txt': 'x' });
  const middleware = createThumbsMiddleware({ presentationsDir: dir, key: 'k', ffmpegBin });
  const server = http.createServer((req, res) => middleware(req, res, () => { res.writeHead(418); res.end('next'); }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try { await fn({ base: `http://127.0.0.1:${server.address().port}`, dir }); }
  finally { server.closeAllConnections?.(); await new Promise((r) => server.close(r)); remove(dir); }
}

test('thumbs middleware: other paths fall through; no ffmpeg configured is 503', async () => {
  const restore = quiet();
  await withThumbsServer(() => undefined, async ({ base }) => {
    assert.strictEqual((await fetch(`${base}/elsewhere`)).status, 418);
    assert.strictEqual((await fetch(`${base}/thumbs_other/demo/_media/pic.png`)).status, 418, 'the key is part of the prefix');
    const res = await fetch(`${base}/thumbs_k/demo/_media/pic.png`);
    assert.strictEqual(res.status, 503);
    assert.strictEqual(await res.text(), 'FFMPEG_BIN not set');
  });
  restore();
});

test('thumbs middleware: ffmpegBin is asked per request, so it can be set after startup', async () => {
  const restore = quiet();
  const dir = tmpDir();
  const ff = makeFakeFfmpeg(dir, 10);
  let bin;
  await withThumbsServer(() => bin, async ({ base }) => {
    assert.strictEqual((await fetch(`${base}/thumbs_k/demo/_media/pic.png`)).status, 503);
    bin = ff.bin;
    const res = await fetch(`${base}/thumbs_k/demo/_media/pic.png`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(await res.text(), 'JPEG');
    assert.strictEqual(res.headers.get('content-type'), 'image/jpeg');
    assert.match(res.headers.get('cache-control'), /max-age=86400/);
  });
  restore();
  remove(dir);
});

test('thumbs middleware: missing source 404, ffmpeg failure 500, traversal falls through untouched', async () => {
  const restore = quiet();
  const dir = tmpDir();
  const ff = makeFakeFfmpeg(dir, 10);
  await withThumbsServer(() => ff.bin, async ({ base }) => {
    assert.strictEqual((await fetch(`${base}/thumbs_k/demo/_media/nope.png`)).status, 404);
    for (const evil of ['..%2F..%2Fsecret', 'demo/../../x', '%2e%2e/x', 'demo%2F..%2F..%2Fx']) {
      assert.strictEqual((await fetch(`${base}/thumbs_k/${evil}`)).status, 418, evil);
    }
    assert.strictEqual(ff.starts().length, 0, 'ffmpeg was never started for these');
  });
  await withThumbsServer(() => ff.bin, async ({ base, dir: presDir }) => {
    fs.writeFileSync(path.join(presDir, 'demo', 'FAIL.png'), 'x');
    assert.strictEqual((await fetch(`${base}/thumbs_k/demo/FAIL.png`)).status, 500);
  });
  restore();
  remove(dir);
});

test('thumbs middleware: the cache is used while fresh and refreshed when the source is newer', async () => {
  const restore = quiet();
  const dir = tmpDir();
  const ff = makeFakeFfmpeg(dir, 10);
  await withThumbsServer(() => ff.bin, async ({ base, dir: presDir }) => {
    const url = `${base}/thumbs_k/demo/_media/pic.png`;
    await (await fetch(url)).text();
    await (await fetch(url)).text();
    assert.strictEqual(ff.starts().length, 1, 'second request served from .thumbs/');
    const future = new Date(Date.now() + 60_000);
    fs.utimesSync(path.join(presDir, 'demo', '_media', 'pic.png'), future, future);
    await (await fetch(url)).text();
    assert.strictEqual(ff.starts().length, 2);
  });
  restore();
  remove(dir);
});

async function withFallbackServer(files, fn) {
  const dir = writeTree(tmpDir(), files);
  const middleware = createLegacyThumbnailFallback({ presentationsDir: dir, presentationsWebPath: '/presentations_k' });
  const server = http.createServer((req, res) => middleware(req, res, () => { res.writeHead(418); res.end('next'); }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try { await fn(`http://127.0.0.1:${server.address().port}/presentations_k/_media`); }
  finally { server.closeAllConnections?.(); await new Promise((r) => server.close(r)); remove(dir); }
}

test('legacy fallback: serves the webp only for GET/HEAD of a well-formed thumbnail name whose jpg is absent', async () => {
  await withFallbackServer({ '_media/old.thumbnail.webp': 'WEBP', '_media/new.thumbnail.webp': 'WEBP', '_media/new.thumbnail.jpg': 'JPG' }, async (media) => {
    const old = await fetch(`${media}/old.thumbnail.jpg`);
    assert.deepStrictEqual([old.status, old.headers.get('content-type'), await old.text()], [200, 'image/webp', 'WEBP']);
    assert.strictEqual(old.headers.get('cache-control'), 'no-cache');
    const head = await fetch(`${media}/old.thumbnail.jpg`, { method: 'HEAD' });
    assert.deepStrictEqual([head.status, head.headers.get('content-length')], [200, '4']);
    assert.strictEqual((await fetch(`${media}/new.thumbnail.jpg`)).status, 418, 'an existing jpg is left to the static handler');
    assert.strictEqual((await fetch(`${media}/old.thumbnail.jpg`, { method: 'POST', body: 'x' })).status, 418);
    assert.strictEqual((await fetch(`${media}/absent.thumbnail.jpg`)).status, 418, 'no webp either');
    for (const bad of ['..%2Fold.thumbnail.jpg', '.old.thumbnail.jpg', 'old.thumbnail.png', 'old.thumbnail.jpg%00', 'sub%2Fold.thumbnail.jpg', '%E0%A4%A.thumbnail.jpg']) {
      assert.strictEqual((await fetch(`${media}/${bad}`)).status, 418, bad);
    }
  });
});

test('legacy fallback: a webp that is really a directory is not served', async () => {
  await withFallbackServer({ '_media/dir.thumbnail.webp/inner': 'x' }, async (media) => {
    assert.strictEqual((await fetch(`${media}/dir.thumbnail.jpg`)).status, 418);
  });
});
