# REVELation Tests

`npm run tests` runs everything below. It needs Node 22.7+ (ES modules are imported directly) and never opens a browser or Electron.

```
npm run tests            # fixtures, then unit and server tests
npm run tests:fixtures   # compiler fixtures only (fast)
npm run tests:generate   # regenerate fixture references from the current compiler
```

## 1. Compiler fixtures (`run-tests.cjs`, `fixtures/`)

Each `fixtures/<name>/presentation.md` stores generated reference output in `reference/reveal.md` (the simplified markdown
passed to Reveal.js) and `reference/handout.html`. The runner `import()`s the real modules in `js/compiler/` and
`plugins/credit_ccli/`, so new exports, imports and modules need no change to the test code. If a comparison fails, actual
output is written to `tests/_actual/<name>/`.

## 2. The server

The back end is one Vite plugin, `vite.plugins.js`, composed from factories in `server/` (see the header of each file).
`createRevelationPlugin(options)` takes the settings that used to come only from environment variables (`server/config.js`
lists both), keeps its state per instance, and releases its file watcher, sockets and parent-port listener when the server
closes. That is what the tests build on.

### Unit tests (`unit/*.test.cjs`): each `server/` module on its own, no Vite

| File | Module | Covers |
|------|--------|--------|
| `frontmatter.test.cjs` | `js/frontmatter.js`, `js/imports-loader.js` | browser-side front-matter split/parse (CRLF, malformed flagged, `---` inside values), the compiler's malformed-YAML placeholder, and the `imports:` merge with a fake `fetch` |
| `config.test.cjs` | `config.js` | mode selection, option/env precedence, GUI index paths, lazy `ffmpegBin`, no `process.env` access |
| `pip-core.test.cjs` | `js/pip-core.js` | which URL `pip.html` may embed (absolute http/https only, obfuscated `javascript:` refused), colour validation, and which `postMessage` events are acted on (sender and origin checks, peer-URL validation) |
| `pip-page.test.cjs` | `js/pip.js` | the page script run against a fake DOM: what reaches the iframe, which messages reach `electronAPI`, the fallbacks |
| `network.test.cjs` | `network.js` | the loopback decision: which addresses count, mapped IPv6, missing values |
| `peer-protocol.test.cjs` | `peer-protocol.js` | **known-answer vectors** for every wire string (hashes computed independently), domain separation, non-throwing verify; the module may require only `crypto` |
| `access-gates.test.cjs` | `access-gates.js` | loopback gates driven with **fake remote addresses** (IPv4, IPv6, mapped, missing), so no LAN interface is needed |
| `presentation-index.test.cjs` | `presentation-index.js` | index entries and every exclusion rule, README deck refresh, media index, GUI index route |
| `presentation-watcher.test.cjs` | `presentation-watcher.js` | debounce, batching, unchanged-content filter, folder removal, `close()` (fake chokidar, recording `send`) |
| `media-share.test.cjs` | `media-share.js` | token rules, parent messages, Range handling, per-instance registries |
| `thumbnails.test.cjs` | `thumbnails.js` | concurrency cap, de-duplication, failure recovery, `/thumbs` route, legacy `.webp` fallback (fake ffmpeg) |
| `brokers.test.cjs` | both socket brokers | sanitizers, isolation between instances, shutdown semantics |

### Server tests (`server/*.test.cjs`): a real Vite server over HTTP and Socket.IO

`helpers/vite-server.cjs` builds the plugin from explicit options (no `process.env`, no `process.parentPort`), loads the
settings from `vite.config.js`, and starts Vite on an ephemeral port with throwaway directories. It returns
`{ base, dirs, send, posted, parentPort, setFfmpegBin, lanUrl, close }`; `send()` delivers a message as the Electron main
process would.

| File | Covers |
|------|--------|
| `custom-gui.test.cjs` | the wrapper's configuration end to end: index generation and cache, loopback gates from a real non-loopback address, `Origin: null`, URL rewrites, CSP hash, `/media-share`, `/thumbs`, `/publish`, `/admin`, watcher-driven reindexing |
| `pip.test.cjs` | `pip.html` as served: strict CSP, no inline script, modules served; (also listed in the relay 404 surface) |
| `relay.test.cjs` | public relay mode: deny-by-default 404 surface, no peer endpoints, remote UI, both sockets |
| `sockets.test.cjs` | Reveal Remote broker and presenter-plugin rooms through the full server |
| `modes.test.cjs` | a relay, a custom-path and a standalone server in one process; isolation; `close()` releases everything |
| `peer.test.cjs` | `server/peer-server.js` on a plain `http.Server`: pairing, PIN lockout, nonces, signatures, socket grants |

Notes:

- Servers are independent, so a file may start several (any mode). Standalone mode runs against a temp folder
  (`baseDir`), never the checked-out `presentations_*`.
- Requests through the machine's LAN address arrive from a non-loopback address; those assertions skip on a machine with no
  LAN interface. `unit/access-gates.test.cjs` covers the same gates without needing one.
- Keep test output quiet: `node --test` children report over stdout, and a stray line from the code under test can corrupt
  that stream. The harness mutes the plugin's console output; unit tests that load server modules do the same.

## What is still inline in `vite.plugins.js`

`configureServer` still mounts the static trees (`/css`, `/publish`, the presentations and plugins folders, `/admin`, the
remote UI), the slug/handout URL rewrite and the startup banner directly. They are thin wrappers over `serve-static` or a
few lines of string handling and are covered by `server/custom-gui.test.cjs`. Extract them into `server/` only if they grow
logic of their own.
