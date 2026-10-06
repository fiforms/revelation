// server/config.js — decides which mode the REVELation server runs in and where its files live.
// Pure: reads only the `options` object and the `env`/`argv` it is given (default: process.env and
// process.argv), so tests can describe a server without touching the process environment.
// Used by vite.plugins.js (createRevelationPlugin) and tests/helpers/vite-server.cjs.
//
// resolveServerConfig(options) -> {
//   mode: 'relay' | 'custom' | 'standalone',
//   isPublicServerMode, isGuiMode, customPath,
//   presentationsDir, key, presentationsWebPath, pluginsDir, pluginsWebPath,
//   userDataDir, adminDir, sharedIndexFile, localIndexFile, outputFile,
//   rootDir, argv, ffmpegBin()   // ffmpegBin is a function, read per request
// }
//
// Every option falls back to the environment variable named here (the wrapper sets these):
//   publicRelay      REVELATION_PUBLIC_SERVER=1|true, or the --public-server argument
//   gui              REVELATION_GUI=1|true
//   presentationsDir PRESENTATIONS_DIR_OVERRIDE  \  both required for "custom path" mode
//   key              PRESENTATIONS_KEY_OVERRIDE  /  (presentations served at /presentations_<key>/)
//   pluginsDir       PLUGINS_DIR_OVERRIDE        (custom path mode only, served at /plugins_<key>/)
//   userDataDir      USER_DATA_DIR
//   adminDir         ADMIN_DIR_OVERRIDE
//   ffmpegBin        FFMPEG_BIN  (a path, or a function returning one)
// Other options: env, argv, baseDir (where standalone mode looks for presentations_*; default: the
// revelation folder).
//
// Modes: relay = bare socket relay, no local files at all; custom = presentations in an external
// folder (the Electron wrapper); standalone = the first revelation/presentations_* folder, created
// by scripts/init-presentations.js (throws if there is none).
const fs = require('fs');
const path = require('path');

const REVELATION_ROOT = path.resolve(__dirname, '..');
const PRESENTATIONS_PREFIX = 'presentations_';

const isTruthyFlag = (value) => /^(1|true)$/i.test(value || '');

function resolveServerConfig(options = {}) {
  const env = options.env || process.env;
  const argv = options.argv || process.argv;
  const baseDir = options.baseDir || REVELATION_ROOT;
  const pick = (optionValue, envName) => (optionValue !== undefined ? optionValue : env[envName]);

  const isPublicServerMode = options.publicRelay !== undefined
    ? !!options.publicRelay
    : isTruthyFlag(env.REVELATION_PUBLIC_SERVER) || argv.includes('--public-server');
  const isGuiMode = options.gui !== undefined ? !!options.gui : isTruthyFlag(env.REVELATION_GUI);
  const explicitDir = pick(options.presentationsDir, 'PRESENTATIONS_DIR_OVERRIDE');
  const explicitKey = pick(options.key, 'PRESENTATIONS_KEY_OVERRIDE');

  let mode;
  let presentationsDir = '';
  let key = '';
  let presentationsWebPath = '';
  let pluginsDir = '';
  let pluginsWebPath = '';
  let customPath = false;

  if (isPublicServerMode) {
    // A relay has no presentations directory; nothing in this mode reads these.
    mode = 'relay';
  } else if (explicitDir && explicitKey) {
    mode = 'custom';
    customPath = true;
    presentationsDir = explicitDir;
    key = explicitKey;
    presentationsWebPath = `/${PRESENTATIONS_PREFIX}${key}`;
    pluginsDir = pick(options.pluginsDir, 'PLUGINS_DIR_OVERRIDE') || '';
    pluginsWebPath = `/plugins_${key}`;
  } else {
    mode = 'standalone';
    const folderName = fs.readdirSync(baseDir).find((name) =>
      fs.statSync(path.join(baseDir, name)).isDirectory() && name.startsWith(PRESENTATIONS_PREFIX)
    );
    if (!folderName) throw new Error('No presentations folder found');
    presentationsDir = path.join(baseDir, folderName);
    key = folderName.replace(PRESENTATIONS_PREFIX, '');
    presentationsWebPath = `/${folderName}`;
  }

  const userDataRaw = pick(options.userDataDir, 'USER_DATA_DIR');
  const userDataDir = userDataRaw ? path.resolve(userDataRaw) : '';
  const sharedIndexFile = path.join(presentationsDir, 'index.json');
  // In GUI mode the index lives in the wrapper's userData so cloud-synced presentation folders
  // are not rewritten; the server then serves it at <presentationsWebPath>/index.json.
  const localIndexFile = isGuiMode && userDataDir
    ? path.join(userDataDir, '.revelation-cache', 'presentations-index.json')
    : '';

  const ffmpegBin = typeof options.ffmpegBin === 'function'
    ? options.ffmpegBin
    : () => (options.ffmpegBin !== undefined ? options.ffmpegBin : env.FFMPEG_BIN);

  return {
    mode,
    isPublicServerMode,
    isGuiMode,
    customPath,
    presentationsDir,
    key,
    presentationsWebPath,
    pluginsDir,
    pluginsWebPath,
    userDataDir,
    adminDir: pick(options.adminDir, 'ADMIN_DIR_OVERRIDE') || '',
    sharedIndexFile,
    localIndexFile,
    outputFile: localIndexFile || sharedIndexFile,
    rootDir: REVELATION_ROOT,
    argv,
    ffmpegBin
  };
}

module.exports = { resolveServerConfig, REVELATION_ROOT, PRESENTATIONS_PREFIX };
