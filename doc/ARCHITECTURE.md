---

# REVELation Architecture Reference

---

## Table of Contents
* [System Overview](#architecture-system-overview)
* [Request Flow: presentation.html](#architecture-request-flow)
* [Compiler Pipeline](#architecture-compiler)
* [Plugin Loader Contract](#architecture-plugin-loader)
* [Server Surface (vite.plugins.js)](#architecture-server)
* [Environment Variables](#architecture-env)
* [Offline / Standalone Bundle](#architecture-offline-bundle)
* [Themes](#architecture-themes)
* [Translations](#architecture-translations)
* [Tests](#architecture-tests)
* [Reveal.js Runtime Integration](#architecture-reveal-runtime)
* [Default Plugin Stack](#architecture-default-plugins)
* [Inter-Presentation Link Resolution](#architecture-inter-presentation-links)
* [Builder Plugin Hooks](#architecture-builder-hooks)
* [Offline Export Plugin Hooks](#architecture-offline-hooks)
* [Core CLI Workflows](#architecture-cli)

---

<a id="architecture-system-overview"></a>

## System Overview

REVELation is a Reveal.js-based markdown presentation framework with:
- YAML-driven metadata and authoring extensions
- Preprocessing for macros, media aliases, and custom markdown syntax
- Runtime pages for presentation, handout, media library, and listing views

Primary entry points in this module include `revelation/presentation.html`, `revelation/handout.html`, `revelation/presentations.html`, and `revelation/media-library.html`. `pip.html` is a picture-in-picture shell that iframes a presentation URL, and `index.html` is a static welcome page.

Source layout:

| Path | Role |
| ---- | ---- |
| `vite.config.js`, `vite.plugins.js` | Vite config and the server back end (one Vite plugin, `createRevelationPlugin(options)`), which composes the modules in `server/` |
| `server/*.js` | The server's parts, each a factory that can be required and tested alone: `config` (mode and paths), `presentation-index`, `presentation-watcher`, `media-share`, `thumbnails`, `access-gates`, `presenter-plugins-broker`, `reveal-remote-broker`, `public-relay` |
| `server/peer-server.js` | Peer pairing HTTP endpoints and the `/peer-commands` socket (master side) |
| `server/peer-protocol.js` | The peer signature constructions (domains, nonces, sign/verify), shared with the wrapper's follower side |
| `server/network.js` | `isLoopbackAddress` / `normalizeRemoteAddress` |
| `js/presentations.js`, `js/presentation-bootstrap.js` | Presentation page controller and markdown loading/compilation bootstrap |
| `js/compiler/` | Markdown compiler (front matter, macros, media, slide assembly, sanitization) |
| `js/pluginloader.js` | Browser-side plugin loader |
| `js/presentationlist.js`, `js/media-core.js`, `js/handout.js` | Library page, media library, handout page |
| `js/tweaks.js`, `js/transitions.js`, `js/easings.js`, `js/slide-labels/` | Runtime behaviors, transition registry, auto-animate easings, overview slide labels |
| `js/translate.js`, `js/translations.json` | i18n |
| `js/offline.js` | Entry point of the offline bundle |
| `css/source/*.scss` | Theme and page styles (compiled by Sass) |
| `templates/` | `default` new-presentation template, `readme` documentation deck |
| `scripts/` | npm helper scripts (see [Core CLI Workflows](#architecture-cli)) |
| `tests/` | Compiler fixture tests |

---

<a id="architecture-request-flow"></a>

## Request Flow: presentation.html

1. A deck is opened at `/presentations_<key>/<slug>/` (or `.../index.html`); `vite.plugins.js` rewrites that to `/presentation.html?slug=<slug>&key=<key>` while the browser keeps the original path. (`.../handout` is rewritten to `/handout.html` the same way.)
2. `presentation.html` is a stub with a Content-Security-Policy (`script-src 'self'` plus one hashed script for Reveal's speaker view, substituted at serve time by the plugin). It loads `/js/translate.js`, `/reveal-remote.js` (sets `window.revealRemoteServer`, `presenterPluginsPublicServer`, `presenterLiveRoomId`) and the module `/js/presentations.js`.
3. `presentations.js` extracts the key from the URL path, runs the [plugin loader](#architecture-plugin-loader), assembles the Reveal plugin list, creates the `Reveal` instance and calls `loadAndPreprocessMarkdown(deck)` in `js/presentation-bootstrap.js`.
4. The bootstrap picks the markdown file (`?p=` validated by `sanitizeMarkdownFilename`, default `presentation.md`, relative to the presentation folder), splits front matter, resolves `alternatives:` language files (`?lang=`), selects the theme stylesheet (`/css/<theme>`, or a frozen `oldcss/<version>/` snapshot for decks older than the snapshot breakpoint), merges `macros:` and `imports:`, loads `_media/index.json`, and runs the [compiler](#architecture-compiler).
5. The compiled markdown is smart-quoted (unless `convertSmartQuotes: false`), passed through `sanitizeMarkdownEmbeddedHTML`, placed in a `<textarea data-template>` for Reveal's Markdown plugin, and `deck.initialize(config)` runs with front-matter `config:` plus runtime overrides (variants, `forceControls`, capture/no-transition switches).
6. On `ready`, the rendered slide tree is sanitized again (`sanitizeElementTree`) and `tweaks.js` behaviors, transition styles and Reveal Remote hooks attach.

Runtime variants are selected with `?variant=` (`notes`, `notesteleprompter`, `remotepreview`, `lowerthirds`, `confidencemonitor`).

The handout page (`handout.js`) is a separate render path: same front-matter and `preprocessMarkdown(..., forHandout=true)`, then `marked` plus `sanitizeRenderedHTML`, with no Reveal and no plugin loader.

---

<a id="architecture-compiler"></a>

## Compiler Pipeline

All of `js/compiler/`, entry point `markdown-compiler.js` (documented in that file's header):

1. `extractFrontMatter()` - YAML front matter (js-yaml); malformed YAML yields a `{malformed YAML}` placeholder.
2. `preExpandUserMacros()` then `runPluginMarkdownPreprocessors()` - user macros are expanded first so they can chain into plugin macros; each loaded plugin's optional `preprocessMarkdown(md, context)` runs in `priority` order (default 100).
3. `preprocessMarkdown()` - line scan delegating to `markdown-line-parsers.js` (macros/directives), `media-line-parsers.js` (media aliases, magic images, video shorthands) and `slide-compiler.js` (stateful slide assembly, sticky macros, hidden slides, attribution).
4. `presentation-segments.js` - fence-aware slide/note splitting (used by the handout).
5. `html-sanitization.js` - blocked tags, dangerous URL/attribute stripping, SVG animation checks; applied to markdown-embedded HTML and rendered HTML.
6. `compiler-utils.js` - note separator rules (`Note:` legacy vs `:note:` for decks with `version` above 0.2.6), filename/path validation, and `CSS_VERSION_SNAPSHOTS` (which `version` values use a frozen CSS snapshot).

---

<a id="architecture-plugin-loader"></a>

## Plugin Loader Contract

`pluginLoader(page, prefix)` (`js/pluginloader.js`) resets `window.RevelationPlugins`, then reads the plugin list from `window.__offlinePluginList` (exports) or `GET <prefix>/plugins.json` (`prefix` is `/plugins_<key>`). For every entry `{ baseURL, clientHookJS, priority, config }` it loads `<baseURL>/<clientHookJS>` as a module script. The script must register itself:

```js
window.RevelationPlugins['myplugin'] = {
  init({ pluginName, baseURL, page, config }) {},   // optional
  preprocessMarkdown(md, context) { return md; },   // optional, compiler hook
  getRevealPlugins(isRemote) { return []; }         // optional, extra Reveal plugins
};
```

`page` is `presentations`, `presentationlist` or `media-library`. The loader stamps `priority` onto the registered object. A failed plugin shows a toast and never blocks the others. Under `file://` no plugins load. If the page URL has no key, the list URL is `/plugins_null/plugins.json`, fails, and the page runs without plugins.

---

<a id="architecture-server"></a>

## Server Surface (vite.plugins.js and server/)

The Vite server is the whole back end. The middleware stack in registration order (full detail and trust tiers in the comment banner above `createRevelationPlugin()` in `vite.plugins.js` and in [SECURITY.md](SECURITY.md)); the code for each row lives in the `server/` module named in that file's header:

| Route | Purpose | Gate |
| ----- | ------- | ---- |
| sandbox-origin check | `Origin: null` (builder preview iframe) only from loopback | loopback |
| `/media-share/<token>` | Range-capable stream of a file registered by Electron | 192-bit token |
| `/css/reveal.js/dist` | Reveal base CSS | none |
| `/publish/<key>.html`, `.rev` | URL-publish screens for LAN browsers/TVs | 64-bit key in filename |
| `/css` | Compiled themes (`dist/css` in GUI mode, `css/` otherwise) | none |
| `/presentations_<key>/<slug>/` | Rewritten to `presentation.html` / `handout.html` | key in path |
| `/_remote/ui/**` | Static remote-control web UI | none |
| `/peer/*` | Peer pairing and auth (see `server/peer-server.js`) | `mdnsPublish`, PIN or follower signature |
| `**/index.json` | Presentation and media indexes | loopback only |
| `<presentations>/_media/*.thumbnail.jpg` | Legacy `.webp` fallback | key in path |
| `/presentations_<key>/`, `/plugins_<key>/` (custom path mode) | Static presentation and plugin trees | key in path |
| `/thumbs_<key>/<slug>/<file>` (custom path mode) | ffmpeg 320px JPEG thumbnails, cached in `.thumbs/` | key in path |
| `/admin/**` | The wrapper's `http_admin/` UI | loopback |

Three Socket.IO servers share the one HTTP server, each on its own `path` (they use the default `/` namespace; there are no custom namespaces):

| Path | File | Purpose | Auth |
| ---- | ---- | ------- | ---- |
| `/socket.io` | `server/reveal-remote-broker.js` | Reveal Remote broker: `presenter`, `remote`, `follower` roles | channel UUIDs |
| `/presenter-plugins-socket` | `server/presenter-plugins-broker.js` | Collaboration plugin rooms (`presenter-plugin:join` / `presenter-plugin:event`) | room id only |
| `/peer-commands` | `server/peer-server.js` | Master-to-follower slide-sync commands | RSA-signed bearer token |

The plugin also watches the presentations directory (chokidar) and pushes Vite HMR custom events: `reload-presentations`, `presentations-index-updated`, `reload-media`. `presentations/index.json` (library list) and `_media/index.json` (media sidecar aggregate) are generated here.

**Public relay mode** (`REVELATION_PUBLIC_SERVER=1`, `--public-server`, or `npm run relay`) registers only `/socket.io`, `/presenter-plugins-socket`, `/_remote/ui/**` and a liveness string at `/`; everything else is 404 and no presentations directory is needed. See `doc/dev/PUBLIC_RELAY.md` in the outer repository.

---

<a id="architecture-env"></a>

## Environment Variables

| Variable | Effect |
| -------- | ------ |
| `PRESENTATIONS_DIR_OVERRIDE` + `PRESENTATIONS_KEY_OVERRIDE` | Serve an external presentations directory at `/presentations_<key>/` (both required) |
| `PLUGINS_DIR_OVERRIDE` | Plugins directory served at `/plugins_<key>/` (with the two above) |
| `ADMIN_DIR_OVERRIDE` | Directory mounted at `/admin` (loopback only) |
| `FFMPEG_BIN` | ffmpeg binary enabling `/thumbs_<key>/` |
| `USER_DATA_DIR` | Wrapper userData: peer config and follower store, `publish/`, local index cache |
| `REVELATION_GUI=1` | Electron mode: css from `dist/css`, index cache in userData, no README-deck generation |
| `REVELATION_PUBLIC_SERVER=1` | Public relay mode |
| `VITE_HTTPS_CERT`, `VITE_HTTPS_KEY` | Enable HTTPS in `vite.config.js` |

Without the overrides, the first `revelation/presentations_*` folder is used; `scripts/init-presentations.js` creates one at `npm install`. That folder name is the access key and is git-ignored.

---

<a id="architecture-offline-bundle"></a>

## Offline / Standalone Bundle

`npm run vite:build` builds only `js/offline.js` into one IIFE, `dist/js/offline-bundle.js`. Exports made by the wrapper (`lib/exportPresentation.js`) copy it to `_resources/`, together with `css/` (fonts rewritten to CDN), needed `oldcss/<version>/` snapshots, `reveal.css`, `translate.js` and `translations.json`. The generated HTML embeds the markdown and sets `window.offlineMarkdown`, `__offlinePluginList`, `revealRemoteServer` and `presenterPluginsPublicServer` before loading the bundle; the bootstrap, plugin loader and `translate.js` branch on those globals. See [Offline Export Plugin Hooks](#architecture-offline-hooks).

---

<a id="architecture-themes"></a>

## Themes

Themes are Sass sources in `css/source/` (compiled to the git-ignored `css/` by `npm run watch:theme`/`dev`, or to `dist/css` by `npm run build:theme`). Most slideshow themes import a reveal.js theme and `custom/layouts.scss` (shared layout classes, text-color variables from `custom/text-colors.scss`) and add overlay styles. Non-theme stylesheets in the same folder: `presentations.scss` (library page), `handout.scss`, `medialibrary.css` (plain CSS), and the variant sheets `confidencemonitor`, `lowerthirds`, `notes-teleprompter`. A deck selects a theme with `theme: name.css` (validated by `isValidStylesheetPath`); `variant` overrides it for `lowerthirds` and `confidencemonitor`. Theme previews are in `css/theme-thumbnails/`. Frozen older CSS lives in `assets/oldcss/<version>/` (git-ignored) and is chosen by `resolveLegacyCssFolder()`. It is downloaded by `scripts/fetch-oldcss.js` (this package's `postinstall`, or `npm run fetch-oldcss`; `SKIP_BLOBS=1` skips it at install).

---

<a id="architecture-translations"></a>

## Translations

`js/translate.js` provides `window.tr(key)` and `data-translate` page translation. Keys are the English strings; `js/translations.json` currently holds `es` only. The language is `navigator.language` (first two letters). Extra sources are appended to `window.translationsources` (the wrapper's admin pages do this) and merged per language.

---

<a id="architecture-tests"></a>

## Tests

`npm run tests` (`tests/run-tests.cjs`) loads the compiler modules by rewriting their ES `export` statements and evaluating them in a VM (no bundler or DOM), compiles every `tests/fixtures/<name>/presentation.md`, and compares against `reference/reveal.md` and `reference/handout.html`. `npm run tests:generate` rewrites the references; mismatches are written to `tests/_actual/`. Coverage is the compiler and sanitizer only (including the `credit_ccli` plugin preprocessor); browser runtime, server and peer code have no automated tests.

---

<a id="architecture-reveal-runtime"></a>

## Reveal.js Runtime Integration

You can set Reveal.js options in front matter `config:`.

```yaml
config:
  transition: fade
  controls: false
  slideNumber: c
  hash: true
  progress: true
  autoAnimate: true
```

All standard Reveal.js data attributes and HTML patterns are supported in processed markdown output.

---

<a id="architecture-default-plugins"></a>

## Default Plugin Stack

`js/presentations.js` always enables these Reveal.js plugins:
- Markdown
- Notes
- Zoom
- Search
- Slide Labels (`js/slide-labels/`, overview-mode labels from speaker-note headings)

When `window.revealRemoteServer` is set (by `reveal-remote.js`, which the Electron app generates at startup, either pointing at the local server or at the configured public relay) it also adds:
- Reveal Remote and Remote Zoom Sync (not in the builder preview unless peer preview is enabled)

Loaded REVELation plugins may add more through `getRevealPlugins(isRemote)`.

---

<a id="architecture-inter-presentation-links"></a>

## Inter-Presentation Link Resolution

Author-facing markdown uses plain relative `.md` links (for example `[Next](something.md)`), not implementation-specific query URLs.

Resolution model (implemented in `js/presentations.js` `setupInterPresentationLinkHandler()` and `js/handout.js` `resolveHandoutMarkdownTarget()`):
- Links ending in `.md` (optionally with `#anchor`) are treated as internal presentation navigation and rewrite the current URL's `?p=`.
- Legacy `index.html?p=...` links are also recognized.
- Parent-directory targets (`../other.md`) and unsafe characters are rejected.
- Linked `.md` targets are expected in the same presentation directory tree.

Current runtime path base behavior:
- Markdown file loading (`?p=...`) resolves from the presentation root directory (the folder containing `index.html`), even when `p` points to nested paths like `nest1/nest2/deep.md`.
- Markdown links inside slides are interpreted relative to that same presentation root for navigation (`?p=...`), not relative to the current markdown file's own folder.
- Media alias resolution (`media:` and `_media` fetch paths), theme stylesheet paths, and related runtime asset references also use the presentation root model.

---

<a id="architecture-builder-hooks"></a>

## Builder Plugin Hooks

Plugins can contribute builder menu content via browser-side hooks:
- `getContentCreators(context)` (legacy)
- `getBuilderTemplates(context)` (recommended)

Template items can provide:
- `label` or `title`
- `template` / `markdown` / `content`
- `slides` / `stacks`
- `onSelect(ctx)` or `build(ctx)`

Context can include:
- `slug`, `mdFile`, `dir`, `origin`, `insertAt`
- `insertContent(payload)`

If `onSelect`/`build` calls `insertContent(...)`, insertion is treated as complete.

---

<a id="architecture-offline-hooks"></a>

## Offline Export Plugin Hooks

Plugins can provide `offline.js` in their folder with:
- `export(context)` (alias `onExport`) - called by `lib/exportPresentation.js` during a standalone export
- `build(context)` - declared by some bundled plugins (appearance, highlight) to verify prebuilt assets, but nothing in the wrapper currently calls it

`context` includes `pluginName`, `plugin`, `pluginDir`, `pluginConfig`, `presentationFolder`, `resourcesDir`, `includeMedia`, `presentations` and `appContext`.

`export(context)` may return:
- `pluginListEntry`
- `headTags`
- `bodyTags`
- `copy` entries with `{ from, to }`

Example:

```js
module.exports = {
  async export(ctx) {
    return {
      pluginListEntry: {
        baseURL: './_resources/plugins/example',
        clientHookJS: 'client.js',
        priority: 100,
        config: {}
      },
      copy: [
        { from: 'client.js', to: 'plugins/example/client.js' },
        { from: 'dist', to: 'plugins/example/dist' }
      ]
    };
  }
};
```

---

<a id="architecture-cli"></a>

## Core CLI Workflows

Common framework scripts:

| Command             | Description |
| ------------------- | ----------- |
| `npm run dev`       | Sass theme watcher plus Vite on localhost. |
| `npm run serve`     | Sass theme watcher plus Vite with `--host` (LAN). The Reveal Remote broker is embedded in the same server; there is no separate remote server. |
| `npm run vite`      | Vite only (no theme watcher). |
| `npm run relay`     | Public socket relay (`REVELATION_PUBLIC_SERVER=1 vite --host`). |
| `npm run build`     | `vite build` (offline bundle), `build:theme` (Sass to `dist/css`), `build:fonts`. |
| `npm run tests`     | Compiler fixture tests (`tests:generate` to regenerate references). |
| `npm run make`      | Scaffold a presentation into the `presentations_<key>/` folder (created if missing). |
| `npm run fetch-oldcss` | Download the legacy CSS snapshots into `assets/oldcss/` (also runs, non-fatally, on `npm install`). |
| `npm run addimages` | Append image slides from folder input (same `presentations_<key>/` folder). |

`reveal-remote.js` is git-ignored and generated by the wrapper; in a bare checkout the Vite server falls back to serving the tracked `reveal-remote.js.default` for `/reveal-remote.js`.

For markdown authoring details, use [revelation/doc/AUTHORING_REFERENCE.md](AUTHORING_REFERENCE.md) and [revelation/doc/METADATA_REFERENCE.md](METADATA_REFERENCE.md).
