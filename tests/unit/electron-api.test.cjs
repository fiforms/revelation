// js/electron-api.js: the PiP-aware electronAPI locator. It must never hand out the builder
// preview's (admin window) API, only a presentation window's.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { pathToFileURL } = require('url');

let create;
test.before(async () => {
  ({ createElectronApiLocator: create } = await import(pathToFileURL(path.join(__dirname, '..', '..', 'js', 'electron-api.js')).href));
});

const presentationApi = { presentationPluginTrigger() {} };
const adminApi = { pluginTrigger() {}, savePresentation() {} };

test('own electronAPI wins', () => {
  const win = { electronAPI: presentationApi };
  win.parent = { electronAPI: adminApi };
  const loc = create(win);
  assert.strictEqual(loc.getElectronAPI(), presentationApi);
  assert.strictEqual(loc.isInPictureInPicture(), false);
});

test('PiP: a presentation-window parent supplies the API', () => {
  const loc = create({ parent: { electronAPI: presentationApi } });
  assert.strictEqual(loc.getElectronAPI(), presentationApi);
  assert.strictEqual(loc.isInPictureInPicture(), true);
});

test('builder preview: the admin window API is not returned', () => {
  const loc = create({ parent: { electronAPI: adminApi } });
  assert.strictEqual(loc.getElectronAPI(), null);
  assert.strictEqual(loc.isInPictureInPicture(), false);
});

test('top window and cross-origin parent yield null', () => {
  const top = {}; top.parent = top;
  assert.strictEqual(create(top).getElectronAPI(), null);
  const hostile = { get parent() { return { get electronAPI() { throw new Error('cross-origin'); } }; } };
  assert.strictEqual(create(hostile).getElectronAPI(), null);
  assert.strictEqual(create(hostile).isInPictureInPicture(), false);
});
