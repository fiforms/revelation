# REVELation Tests

`npm run tests` runs everything below. It needs Node 22.7+ (ES modules are imported directly) and never opens a browser or Electron.

```
npm run tests            # fixtures, then server tests
npm run tests:fixtures   # compiler fixtures only (fast)
npm run tests:generate   # regenerate fixture references from the current compiler
```

## 1. Compiler fixtures (`run-tests.cjs`, `fixtures/`)

Each `fixtures/<name>/presentation.md` stores generated reference output in `reference/reveal.md` (the simplified markdown
passed to Reveal.js) and `reference/handout.html`. The runner `import()`s the real modules in `js/compiler/` and
`plugins/credit_ccli/`, so new exports, imports and modules need no change to the test code. If a comparison fails, actual
output is written to `tests/_actual/<name>/`.

## 2. Server tests (`server/*.test.cjs`)

These start a **real Vite dev server** with the REVELation plugin (`vite.plugins.js`) in the test process, on an ephemeral
port and throwaway directories, and talk to it over HTTP and Socket.IO. No refactoring of the plugin is needed because it is
configured entirely by environment variables; `helpers/vite-server.cjs` sets them and returns `{ base, dirs, send, posted, ... }`.

| File | Mode | Covers |
|------|------|--------|
| `custom-gui.test.cjs` | Custom path + GUI (as the Electron wrapper runs it) | index.json generation and cache, loopback-only gates, `Origin: null` handling, URL rewrites, CSP script hash, legacy thumbnail fallback, `/media-share` tokens and Range requests, `/thumbs` (cache, dedupe, traversal), `/publish`, `/admin`, watcher-driven reindexing |
| `relay.test.cjs` | Public relay (`REVELATION_PUBLIC_SERVER=1`) | deny-by-default 404 surface, no peer endpoints, remote UI, both sockets |
| `sockets.test.cjs` | Custom + GUI | Reveal Remote broker (presenter/remote/follower, hash resume, button clamping) and presenter-plugin rooms |
| `peer.test.cjs` | `createPeerServer()` on a plain `http.Server` | pairing, PIN lockout, nonces/replay, signatures, socket grants, forgetting followers |

Rules for these tests:

- **One server per test file.** The plugin reads its mode from the environment when first required, and `node --test` runs
  each file in its own process. A new mode needs a new file.
- Run them through `npm run tests` (or `node --test --test-force-exit tests/server/<file>`): the plugin never closes its
  chokidar watcher or sockets, so the process must be force-exited.
- Requests made to the machine's own LAN address arrive from a non-loopback address; that is how the loopback-only gates are
  tested. Those assertions skip on a machine with no LAN interface.
- Standalone (non-custom-path) mode is not tested: it serves, and writes the README deck and `index.json` into, the checked-out
  `presentations_*` folder.

## Testability notes (not done yet)

The real-server tests work without touching `vite.plugins.js`, but its shape limits what can be tested in isolation:

1. **Environment read at require time.** Mode, directories, key, the peer server and the `process.parentPort` listener are
   module-level state, set once when the file is first loaded. That is why each mode needs its own test process. A
   `createRevelationPlugin(options)` factory (defaulting to the environment) would allow several modes in one process.
2. **`configureServer` is ~450 lines of inline closures.** `/media-share`, `/thumbs`, the loopback gates and the index
   generator could be exported as factories (`createMediaShareMiddleware(registry)`, `generatePresentationIndex({ presentationsDir,
   outputFile })`, ...) and unit-tested without a Vite server. `peer-server.js` already has this shape and is the easiest
   module to test.
3. **Resources are never released.** The chokidar watcher and both Socket.IO servers are not closed when the server closes,
   so tests need `--test-force-exit`. Closing them on the HTTP server's `close` event would also make server restarts clean.
4. **`process.parentPort` is read directly.** `peer-server.js` takes `postToParent` as an argument; the media-token and parent
   messages in `vite.plugins.js` could be injected the same way instead of the harness defining `process.parentPort`.
