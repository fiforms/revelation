// server/thumbnails.js — thumbnail routes.
//
// createThumbnailGenerator({ maxConcurrent }) -> { ensure(ffmpegBin, sourceFile, thumbFile) }
//   Runs ffmpeg for one 320px-wide JPEG. At most `maxConcurrent` (default 2) ffmpeg processes run
//   at once; identical in-flight requests share one job; results are cached by the caller next to
//   the source in a hidden .thumbs/ folder.
//
// createThumbsMiddleware({ presentationsDir, key, ffmpegBin, generator? })
//   /thumbs_<key>/<slug>/<file> -> cached 320-wide JPEG (custom-path mode only). `ffmpegBin` is a
//   function returning the binary path or a falsy value (503 "FFMPEG_BIN not set"). Trust tier T1
//   (key in the path); it spawns ffmpeg on a file inside the presentations dir, so `..` is refused.
//
// createLegacyThumbnailFallback({ presentationsDir, presentationsWebPath })
//   Media imported before the webp -> jpg switch only has `<file>.thumbnail.webp`; builders always
//   request `.jpg`, so serve the webp when the jpg is missing. Checks for the jpg itself because in
//   non-custom mode this runs ahead of Vite's static handler.
// Created by vite.plugins.js.
const fs = require('fs');
const path = require('path');

const THUMB_VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov', '.m4v', '.ogv']);
const THUMB_MAX_CONCURRENT = 2;

function createThumbnailGenerator({ maxConcurrent = THUMB_MAX_CONCURRENT } = {}) {
  let activeCount = 0;
  const queue = [];
  const inFlight = new Map();

  function withSlot(fn) {
    return new Promise((resolve, reject) => {
      function tryRun() {
        if (activeCount < maxConcurrent) {
          activeCount++;
          fn().then(resolve, reject).finally(() => {
            activeCount--;
            if (queue.length) queue.shift()();
          });
        } else {
          queue.push(tryRun);
        }
      }
      tryRun();
    });
  }

  function runFfmpegThumb(ffmpegBin, sourceFile, thumbFile) {
    const isVideo = THUMB_VIDEO_EXTS.has(path.extname(sourceFile).toLowerCase());
    const args = isVideo
      ? ['-y', '-ss', '0', '-i', sourceFile, '-vf', 'scale=320:-2', '-frames:v', '1', '-update', '1', thumbFile]
      : ['-y', '-i', sourceFile, '-vf', 'scale=320:-2', '-frames:v', '1', '-update', '1', thumbFile];
    return withSlot(() => new Promise((resolve, reject) => {
      console.log(`[thumbs] ffmpeg cmd: ${ffmpegBin} ${args.join(' ')}`);
      const proc = require('child_process').spawn(ffmpegBin, args, { stdio: 'pipe' });
      const stderr = [];
      proc.stderr?.on('data', (d) => stderr.push(d));
      proc.on('close', (code) => {
        if (code === 0) return resolve();
        reject(new Error(`ffmpeg exit ${code}: ${Buffer.concat(stderr).toString().slice(-300)}`));
      });
      proc.on('error', reject);
    }));
  }

  // Returns a promise for the finished thumbFile; concurrent calls for the same file share it.
  function ensure(ffmpegBin, sourceFile, thumbFile) {
    let pending = inFlight.get(thumbFile);
    if (!pending) {
      const thumbDir = path.dirname(thumbFile);
      const dirExisted = fs.existsSync(thumbDir);
      fs.mkdirSync(thumbDir, { recursive: true });
      if (!dirExisted && process.platform === 'win32') {
        try {
          require('child_process').execFile('attrib', ['+h', thumbDir], () => {});
        } catch {}
      }
      pending = runFfmpegThumb(ffmpegBin, sourceFile, thumbFile)
        .finally(() => inFlight.delete(thumbFile));
      inFlight.set(thumbFile, pending);
    }
    return pending;
  }

  return { ensure };
}

function createThumbsMiddleware({ presentationsDir, key, ffmpegBin, generator = createThumbnailGenerator() }) {
  const thumbsPrefix = `/thumbs_${key}/`;
  return (req, res, next) => {
    if (!req.url.startsWith(thumbsPrefix)) return next();

    const bin = ffmpegBin();
    if (!bin) { res.statusCode = 503; return res.end('FFMPEG_BIN not set'); }

    const rawPath = req.url.slice(thumbsPrefix.length).split('?')[0];
    const decodedPath = rawPath.split('/').map(seg => {
      try { return decodeURIComponent(seg); } catch { return seg; }
    }).join('/');
    if (!decodedPath || decodedPath.includes('..')) return next();

    const sourceFile = path.join(presentationsDir, decodedPath);
    if (!fs.existsSync(sourceFile)) {
      console.warn(`[thumbs] 404 source not found: ${decodedPath}`);
      res.statusCode = 404; return res.end();
    }

    const sourceStat = fs.statSync(sourceFile);
    const thumbFile = path.join(
      path.dirname(sourceFile), '.thumbs',
      path.basename(sourceFile) + '.thumb.jpg'
    );

    function serveThumb() {
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      fs.createReadStream(thumbFile).pipe(res);
    }

    if (fs.existsSync(thumbFile) && fs.statSync(thumbFile).mtimeMs >= sourceStat.mtimeMs) {
      console.log(`[thumbs] cache hit: ${decodedPath}`);
      return serveThumb();
    }

    console.log(`[thumbs] generating: ${decodedPath}`);
    generator.ensure(bin, sourceFile, thumbFile)
      .then(() => {
        if (fs.existsSync(thumbFile)) {
          console.log(`[thumbs] generated ok: ${decodedPath}`);
          serveThumb();
        } else {
          console.warn(`[thumbs] generation produced no file: ${decodedPath}`);
          res.statusCode = 404; res.end();
        }
      })
      .catch((err) => {
        console.error(`[thumbs] ffmpeg failed for ${decodedPath}: ${err.message}`);
        res.statusCode = 500; res.end();
      });
  };
}

function createLegacyThumbnailFallback({ presentationsDir, presentationsWebPath }) {
  const mediaThumbPrefix = `${presentationsWebPath}/_media/`;
  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (!req.url.startsWith(mediaThumbPrefix)) return next();
    let name = req.url.slice(mediaThumbPrefix.length).split('?')[0];
    try { name = decodeURIComponent(name); } catch { return next(); }
    if (!/^[A-Za-z0-9_-][A-Za-z0-9._-]*\.thumbnail\.jpg$/.test(name)) return next();

    const jpgPath = path.join(presentationsDir, '_media', name);
    const webpPath = jpgPath.replace(/\.jpg$/, '.webp');
    if (fs.existsSync(jpgPath)) return next();
    fs.stat(webpPath, (err, stats) => {
      if (err || !stats.isFile()) return next();
      res.writeHead(200, {
        'Content-Type': 'image/webp',
        'Content-Length': stats.size,
        'Cache-Control': 'no-cache',
      });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(webpPath).on('error', () => res.destroy()).pipe(res);
    });
  };
}

module.exports = { createThumbnailGenerator, createThumbsMiddleware, createLegacyThumbnailFallback, THUMB_MAX_CONCURRENT };
