# SECURITY.md — REVELation Snapshot Presenter

Security model for the HTTP/WebSocket surface created by
[`vite.plugins.js`](vite.plugins.js) and the Electron wrapper that drives it.

This document has two parts:

1. **[The security model](#part-1--the-security-model)** — the trust tiers this
   software intends to enforce, what each tier is allowed to do, and where the
   boundaries actually live in code.
2. **[Findings](#part-2--findings)** — places where the implementation does not
   match that model, ranked by severity, with concrete remediation.

Reviewed against commit `05714ae` (2026-09-20).

---

## Part 1 — The security model

### 1.1 Threat model in one paragraph

The app runs on a presenter's own computer. **Anyone with local console access,
or with the app's secret `key`, is fully trusted** — they can read every
presentation, drive every screen, and trigger media conversion, file writes and
subprocess execution. That is the nature of the product and is not a
vulnerability. The boundaries worth defending are the two *outer* tiers: a LAN
neighbour who merely discovers the service, and an audience member who was given
a link to one presentation.

### 1.2 Trust tiers

| Tier | Who | Should be able to | Must **not** be able to |
|---|---|---|---|
| **T0 — Operator** | Console user of the machine; anything reaching the app over loopback | Everything | — |
| **T1 — Key holder** | Anyone who knows `config.key` (it appears in every shared presentation URL) | Read presentations and media; render decks | Reach the control API, read app config, execute code in the Electron app |
| **T2 — Invited viewer** | Given one presentation or multiplex link | View that content; follow the presenter | Modify content, control other viewers' decks, enumerate the library |
| **T3 — LAN prober** | Discovers `http://<host>:8000/` with no link and no key | Learn that a presenter app is running | Enumerate presentations, read files, obtain keys/PINs, trigger any operation |
| **T4 — Paired peer** | A follower instance paired over mDNS with the PIN | Receive slide-sync commands | Extract signing material or act as the app toward third parties |

### 1.3 Secrets and what each one gates

| Secret | Entropy | Gates | Where it leaks to |
|---|---|---|---|
| `config.key` | 64 bits (`crypto`) | `/presentations_<key>/`, `/plugins_<key>/`, `/thumbs_<key>/`, API server on :8001 | **Every shared presentation link** (`/presentation.html?slug=…&key=…`) |
| `presentationPublishKey` | 64 bits (`crypto`) | `/publish/<key>.html` | The URL-publish screen link |
| `mdnsPairingPin` | 6 digits (`crypto`) | `/peer/socket-info`, `/peer/challenge` | Shown in the presenter info panel |
| `rsaPrivateKey` | RSA | Peer socket auth **and** WordPress publish auth | Never served; but see F2 (signing oracle) |
| Reveal-remote `remoteId` | UUIDv4 | Remote-control channel for one deck | Presenter's remote QR code |
| Reveal-remote `multiplexId` | UUIDv4 | Follower/multiplex channel | Every follower link |
| `/media-share/<token>` | 192 bits (`crypto`) | One registered media file | Deck HTML |

> **The key is global, not per-presentation.** Handing someone a link to one
> presentation hands them T1 for the entire library. The only thing standing
> between a T2 viewer and the rest of the library is that `index.json` is
> loopback-only, so they cannot *enumerate* slugs — they can still fetch any
> slug they can guess or that was ever mentioned to them. Treat "share a link"
> as "share the library, unlisted".

### 1.4 Enforcement mechanisms in use

- **Loopback check** — `isLoopbackAddress(req.socket.remoteAddress)`
  ([vite.plugins.js:1114](vite.plugins.js#L1114)). Used for `/admin`,
  `/peer/status`, `/peer/command`, `*/index.json`, and the sandbox-origin gate.
- **Secret in the URL path** — `/presentations_<key>/`, `/plugins_<key>/`,
  `/thumbs_<key>/`, `/publish/<publishKey>.html`, `/media-share/<token>`.
  Not enumerable: `serve-static` does not emit directory listings and
  `index: false` is set on the presentations mount.
- **PIN + lockout** — 3 failures per remote address, 60 s block
  ([vite.plugins.js:1077-1112](vite.plugins.js#L1077-L1112)).
- **RSA challenge/response** — the `/peer-commands` Socket.IO namespace requires
  a server-signed `token:expiresAt:socketPath` bearer payload
  ([vite.plugins.js:1128-1144](vite.plugins.js#L1128-L1144)).
- **Feature flag** — the whole `/peer/*` tree 403s unless
  `config.mdnsPublish === true` ([vite.plugins.js:634-638](vite.plugins.js#L634-L638)).
- **Bind address** — in `localhost` mode Vite is started without `--host`, so
  nothing but loopback can connect at all. The API server on :8001 is always
  bound to `127.0.0.1` ([lib/apiServer.js:26](../lib/apiServer.js#L26)).
- **CSP** — `presentation.html` ships
  `script-src 'self'; object-src 'none'; base-uri 'self'`, which is what keeps
  injected markup from becoming code execution (see F3).

### 1.5 Endpoint map

| Path | Reachable by | Gate |
|---|---|---|
| `/`, `/presentation.html`, `/presentations.html`, `/@fs/*`, `/node_modules/*` | T3 | none (Vite dev-server root) |
| `/presentations_<key>/**` | T1 | key in path |
| `/plugins_<key>/**` | T1 | key in path — **serves server-side plugin source**, F7 |
| `/thumbs_<key>/**` | T1 | key in path — **spawns ffmpeg**, F6 |
| `**/index.json` | T0 | loopback |
| `/admin/**` | T0 | loopback |
| `/peer/status`, `/peer/command` | T0 | loopback + `mdnsPublish` |
| `/peer/public-key` | T3 | `mdnsPublish` only — F8 |
| `/peer/socket-info`, `/peer/challenge` | T4 | `mdnsPublish` + PIN — F2, F4 |
| `/publish/<publishKey>.html` | T2 | 64-bit key in filename |
| `/media-share/<token>` | T2 | 192-bit token |
| `/_remote/ui/**` | T3 | none (static UI only) |
| `/socket.io` (Reveal Remote) | T3 | none; per-channel UUID | 
| `/peer-commands` | T4 | RSA bearer |
| `/presenter-plugins-socket` | T3 | **none at all** — F3 |
| `http://127.0.0.1:8001/api/**` | T0 + key | loopback bind + `key` |

---

## Part 2 — Findings

Nine issues break the model above. F1 is fixed; F2 and F3 are the ones I would
fix next.

---

### F1 — `config.key` and `mdnsPairingPin` were generated with `Math.random()` — **FIXED**

**Severity: High** · Fixed 2026-09-20

```js
key: [...Array(10)].map(() => Math.random().toString(36)[2]).join(''),
```

`Math.random()` is V8's xorshift128+ — not a CSPRNG, and its internal state is
recoverable from observed output. Every other secret in the config was already
generated with `crypto.randomBytes` (`mdnsInstanceId`, `mdnsAuthToken`,
`presentationPublishKey`); these two were missed.

`key` is the single most load-bearing secret in the product: it gates the
presentation library, the plugin tree, the thumbnail service, and the control
API. `mdnsPairingPin` gates the RSA signing oracle in F2.

There was also a latent correctness bug: if `Math.random()` returned a value
whose base-36 string is shorter than 3 characters, `[2]` is `undefined` and the
key silently contained the literal text `undefined`.

**Resolution.** Two CSPRNG helpers now live in
[lib/configManager.js](../lib/configManager.js) and are exported for reuse:

```js
function generateAccessKey() { return crypto.randomBytes(8).toString('hex'); }
function generatePairingPin() { return String(crypto.randomInt(100000, 1000000)); }
```

Applied at all six generation sites:

| File | Site |
|---|---|
| `lib/configManager.js` | `defaultConfig.key`; `loadConfig` key backfill; `loadConfig` PIN backfill |
| `lib/otherEventHandlers.js` | `save-app-config` PIN generation; `reset-key` handler |
| `revelation/scripts/init-presentations.js` | CLI-mode `presentations_<key>` folder name |

The last one is in the submodule and must be committed there separately.

Shape is deliberately conservative so nothing downstream needs to change: the
key stays lowercase-alphanumeric (16 hex chars, 64 bits — up from ~52 bits of
base36), which remains safe to interpolate into folder names, URL paths and the
regex built at [vite.plugins.js:603](vite.plugins.js#L603); the PIN is still
exactly 6 digits in 100000–999999, so the Settings field and info-panel display
are unaffected.

**Not done: rotating existing keys.** Installs created before this change keep
their `Math.random`-derived key, and rotating automatically would break every
already-shared presentation link and every `/publish/*.html` file that embeds
the old key. Users can rotate deliberately via the existing `reset-key` handler
in Settings. If you want to force it, do it as an explicit one-time prompt
rather than a silent migration.

---

### F2 — `/peer/challenge` is a blind signing oracle for the WordPress publishing key

**Severity: High** · [vite.plugins.js:754-811](vite.plugins.js#L754-L811)

`/peer/challenge` signs **arbitrary caller-supplied bytes** with
`config.rsaPrivateKey`:

```js
const signature = signChallenge(config.rsaPrivateKey, challenge);
```

That same keypair authenticates the app to a paired WordPress site
([plugins/wordpress_publish/plugin.js:262, :332, :355](../plugins/wordpress_publish/plugin.js#L262)),
where signatures authorise publish and delete operations via
`createRequestSignatureMessage(action, pairingId, timestamp, nonce, payloadHash)`.

A T4 peer — someone who legitimately knows the pairing PIN, e.g. a follower
machine in the same building — can therefore:

1. Fetch a pairing challenge from the victim's WordPress site.
2. POST it to `/peer/challenge` on the presenter's machine.
3. Receive a valid signature and complete pairing **as the presenter's app**.
4. Construct arbitrary `action|pairingId|timestamp|nonce|payloadHash` strings,
   sign them the same way, and issue authenticated publish/delete calls.

This is a trust-tier crossing: T4 (slide sync only) escalates to full control of
the user's WordPress presentation library. It also violates the general rule
that a key should serve exactly one protocol.

**Fix — do both:**

1. **Separate the keys.** Give peer pairing its own keypair
   (`peerRsaPublicKey`/`peerRsaPrivateKey`) and leave `rsaPrivateKey` for
   WordPress only. This alone closes the cross-protocol path.
2. **Domain-separate the oracle.** Never sign raw caller input. Sign a
   structured, prefixed message the peer protocol owns:

   ```js
   const signature = signChallenge(
     config.peerRsaPrivateKey,
     `revelation-peer-challenge:v1:${crypto.createHash('sha256').update(String(challenge)).digest('hex')}`
   );
   ```

   and have the peer client verify against the same construction. A signature
   produced here is then structurally unusable anywhere else.

---

### F3 — `/presenter-plugins-socket` has no authentication; any client can inject content into other viewers' decks

**Severity: High** · [vite.plugins.js:1184-1231](vite.plugins.js#L1184-L1231)

```js
presenterPluginsIo = new Server(server.httpServer, {
  path: PRESENTER_PLUGINS_SOCKET_PATH,
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 25 * 1024 * 1024
});

presenterPluginsIo.on('connection', (socket) => { /* no auth of any kind */
```

There is no handshake check, no token, no origin restriction. Any party that can
reach the socket may `presenter-plugin:join` any `{plugin, roomId}` pair and then
`presenter-plugin:event` arbitrary `{type, payload}` to everyone else in that
room. Room membership is the *only* access control, and the room ids are not
secrets:

| Plugin | Room id | Known to |
|---|---|---|
| `bibletext` | `live-<config.key>` ([client.js:100-103](../plugins/bibletext/client.js#L100-L103)) | anyone with any presentation link |
| `slidecontrol`, `markerboard`, `captions` | the `remoteMultiplexId` from the URL | every follower |

Two concrete consequences:

**(a) Markup injection into every viewer's slide.** The bibletext live-verse
follower assigns the received payload straight to `innerHTML`
([plugins/bibletext/client.js:194](../plugins/bibletext/client.js#L194)):

```js
el.innerHTML = html ? `<div class="bibletext-live-container">${html}</div>` : '';
```

`html` is `event.payload.html`, unvalidated, from an unauthenticated broadcast.
The CSP on `presentation.html` (`script-src 'self'`) is what stops this from
being remote code execution — inline handlers and inline scripts are blocked,
and `innerHTML`-inserted `<script>` never executes. It does **not** stop
defacement: `style-src` allows `'unsafe-inline'`, so an injected
`<div style="position:fixed;inset:0;z-index:9999">` covers the projected screen
with arbitrary text or imagery for the whole audience. **The CSP is the only
thing between this bug and full code execution — treat it as load-bearing and do
not relax it.**

**(b) Deck hijacking by any viewer.** `slidecontrol` executes `prev`, `next`,
`blank`, `overview`, `slide_to`, and `markerboard_toggle` received on this
channel ([plugins/slidecontrol/client.js:222-234](../plugins/slidecontrol/client.js#L222-L234)).
`allowControlFromAnyClient` defaults to `true`
([client.js:78](../plugins/slidecontrol/client.js#L78)), and a follower is
excluded from *executing* commands but not from *sending* them. So any audience
member holding a multiplex link can drive the presenter's projected deck. This
may be the intent for small trusted rooms, but it directly contradicts the T2
rule, and it is on by default.

Note that by default this traffic does not even stay on the LAN:
`presenterPluginsPublicServer` defaults to
`https://revealremote.fiforms.org/presenter-plugins-socket`
([lib/configManager.js:29](../lib/configManager.js#L29)), so rooms named
`live-<key>` are joinable from anywhere on the internet by anyone who has seen a
presentation link.

**Fix, in priority order:**

1. **Sanitise the sink now** — it is one line and removes the worst case
   regardless of transport. In `bibletext/client.js:194`, run `html` through the
   project's existing markdown sanitizer, or restrict to a tag allowlist, before
   assignment.
2. **Authenticate the namespace.** Mirror what `/peer-commands` already does —
   require a short-lived server-signed token in `socket.handshake.auth`, issued
   over loopback, in `presenterPluginsIo.use(...)`.
3. **Split publish from subscribe.** Viewers need to *receive*
   `live-verse`/`caption-state` and to *send* nothing but navigation intent.
   Give the presenter a per-session publisher token and reject
   `presenter-plugin:event` from unauthenticated sockets for presenter-owned
   event types.
4. **Stop deriving room ids from `config.key`.** `live-<key>` both leaks the key
   into room names on a third-party server and makes the room guessable. Use a
   per-session random id distributed the same way `multiplexId` is.
5. Surface `allowControlFromAnyClient` in Settings and consider defaulting it to
   `false` for network mode.

---

### F4 — The pairing PIN check is skipped entirely when no PIN is configured

**Severity: Medium** · [vite.plugins.js:684](vite.plugins.js#L684),
[vite.plugins.js:778](vite.plugins.js#L778)

```js
const expectedPin = config.mdnsPairingPin;
const providedPin = parsedUrl.searchParams.get('pin');
if (expectedPin && providedPin !== expectedPin) { /* reject */ }
```

If `mdnsPairingPin` is null, empty, or absent, the guard is a no-op and *any*
LAN host gets a signed `/peer/socket-info` token and unrestricted access to the
`/peer/challenge` signing oracle from F2.

In the normal flow this is unreachable: `configManager` auto-generates a PIN
whenever `mdnsPublish` is true ([configManager.js:216-223](../lib/configManager.js#L216-L223)).
But the server reads `config.json` off disk on every request
([vite.plugins.js:999-1006](vite.plugins.js#L999-L1006)) and trusts whatever it
finds. A hand-edited config, a failed write, a config restored from an older
schema, or a profile switch that lands a PIN-less config on disk all silently
open the endpoint. Fail-open authentication should never be structural.

**Fix:** invert the condition so a missing PIN denies rather than allows.

```js
if (!expectedPin) {
  res.writeHead(503, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Pairing not configured' }));
  return;
}
if (providedPin !== expectedPin) { /* existing failure path */ }
```

Apply at both sites. While there, compare with
`crypto.timingSafeEqual` on equal-length buffers — the lockout makes timing
attacks impractical, but it costs nothing.

---

### F5 — `allowedHosts: true` disables Vite's DNS-rebinding protection, and every loopback gate depends on it

**Severity: Medium** · [vite.config.js:11](vite.config.js#L11)

```js
server: { port: 8000, allowedHosts: true, ... }
```

Vite's host check exists specifically to stop DNS rebinding. With it disabled,
any website the presenter visits can point a hostname it controls at `127.0.0.1`
and make the browser issue **same-origin** requests to the dev server. Those
requests arrive with `req.socket.remoteAddress === '127.0.0.1'`, so every gate in
§1.4 that relies on `isLoopbackAddress()` passes:

- `**/index.json` → the full presentation library is enumerable.
- `/admin/**` → the admin UI is readable.
- `POST /peer/command` → arbitrary peer commands are broadcast to all paired
  followers, including `open-presentation` with an attacker-chosen URL.

The API server on :8001 is `http.createServer` with no `Host` validation at all,
so it is rebindable too; it additionally requires `key`, which a T2 viewer
already has.

`open-presentation` is partly defended: external URLs are opened with
`preload: null` ([lib/presentationWindow.js:273-275](../lib/presentationWindow.js#L273-L275)),
so an attacker page loaded this way cannot reach `electronAPI`. That mitigation
is **conditional on `pipEnabled` being false** — when PiP is on, the external URL
is wrapped in `pip.html` and the preload *is* attached to the wrapper. The
external content sits in a cross-origin iframe and Electron does not run preloads
in subframes by default, so it still cannot reach `electronAPI` today. Both of
those are one config change or one `nodeIntegrationInSubFrames` away from
breaking; the defence is thin.

**Fix:** replace `allowedHosts: true` with an explicit list built from what the
app actually needs to serve — `localhost`, the current LAN IP, and the mDNS
`.local` name:

```js
allowedHosts: ['localhost', '127.0.0.1', process.env.REVELATION_LAN_HOST, `${os.hostname()}.local`]
  .filter(Boolean)
```

`serverManager` already tracks the LAN address (`getLANAddress()`, and
`startIPWatcher` restarts on change), so pass it through the child env alongside
the other `*_OVERRIDE` variables. Add a `Host`-header check to `apiServer` as
well.

---

### F6 — `/thumbs_<key>/` lets any link holder spawn ffmpeg and grow an unbounded queue

**Severity: Medium** · [vite.plugins.js:887-951](vite.plugins.js#L887-L951)

Reachable by T1 (so, by anyone holding any presentation link). Each request for
an uncached thumbnail spawns an `ffmpeg` subprocess against a file under
`presentationsDir`.

Path traversal is handled correctly — segments are decoded individually and
`decodedPath.includes('..')` catches `..`, `%2e%2e`, and `..%2f` alike, and
`path.join` neutralises absolute-path attempts. Concurrency is capped at 2
(`_THUMB_MAX_CONCURRENT`) and identical in-flight requests are deduplicated by
`_thumbInFlight`.

What is not bounded is `_thumbQueue` ([vite.plugins.js:342-359](vite.plugins.js#L342-L359)).
A client requesting thumbnails for many distinct source files enqueues a closure
per request with no ceiling and no client timeout, and each queued request holds
an open HTTP response. Sustained requests grow the queue and the pending-socket
set until the Vite process degrades. Requests also create `.thumbs` directories
throughout the presentations tree on demand.

**Fix:** cap the queue (reject with `503` past, say, 200 pending), and reject
requests whose extension is not in `_THUMB_VIDEO_EXTS` or a comparable image
allowlist before doing any filesystem work.

---

### F7 — `/plugins_<key>/` serves main-process plugin source over the network

**Severity: Low** · [vite.plugins.js:878-883](vite.plugins.js#L878-L883)

```js
server.middlewares.use(pluginWebPath, serveStatic(pluginsDir, {}));
```

The mount passes `{}`, so unlike the presentations mount it keeps `serve-static`'s
default `index: ['index.html']`. More importantly it serves the *entire* plugin
directory, including files that only ever run in the Electron main process —
`plugin.js`, `api-server.js`, `localbiblemanager.js`, `fetch-bibles.js`. Only
`client.js` and the plugin's HTML/locales are needed by the browser.

The code is open source, so this is disclosure rather than compromise — but it
hands an attacker an exact map of the main-process attack surface for the
specific version installed, and it means any future plugin that ships a
credential, a template with an embedded token, or a `.env` alongside its client
code is published to every key holder automatically.

**Fix:** mirror the presentations mount (`{ index: false, fallthrough: true }`)
and serve only browser-facing files — either an extension allowlist
(`.js` client entrypoints, `.html`, `.css`, `.json` under `locales/`, images) or
a per-plugin `web/` subdirectory declared in `plugin-manifest.json`.

---

### F8 — `/peer/public-key` discloses hostname and instance identity to any LAN host

**Severity: Low** · [vite.plugins.js:655-667](vite.plugins.js#L655-L667)

When `mdnsPublish` is on, any LAN host — no PIN, no pairing — gets
`instanceId`, `instanceName`, `os.hostname()`, the RSA public key and its
fingerprint. This is genuinely needed before pairing, so it cannot simply be
gated. But `mdnsPublish` already advertises instance name and fingerprint over
mDNS, so `os.hostname()` is the one field that adds new information, and it is a
gratuitous fingerprinting datum for a T3 prober.

**Fix:** drop `hostname` from the payload; `instanceName` already serves the
"which machine is this" purpose in the pairing UI. This also slightly reduces the
value of scanning for presenters on a hostile network.

---

### F9 — Reveal Remote `/socket.io` accepts unauthenticated presenters

**Severity: Low** · [vite.plugins.js:1410-1440](vite.plugins.js#L1410-L1440)

The namespace has no handshake auth and `cors: { origin: true }` (reflect any
origin). Its channel ids are the real access control, and that part is sound:
`remoteId` and `multiplexId` are UUIDv4, and `mkRevealRemoteHash` binds the pair
to a process-lifetime secret, so a follower holding `multiplexId` cannot forge a
presenter session and a remote holding `remoteId` cannot reach the multiplex
channel. Followers register no inbound handlers.

The residual issue is resource consumption: any client — including a web page the
presenter visits, since WebSocket upgrades are not subject to CORS — can send
`{type:'presenter'}` repeatedly. Each one allocates a `revealRemoteStates` entry
and generates two QR code images ([vite.plugins.js:1353-1361](vite.plugins.js#L1353-L1361)).
Entries are freed on disconnect, so this is a live-connection cost rather than a
leak, but there is no rate limit.

**Fix:** low priority. Rate-limit `start` per socket and cap concurrent presenter
sessions. Do not set `cors: { origin: '*' }` here or anywhere else on this
server.

---

## Part 3 — Previously-identified items, now resolved

For the record, three items from the 2026-03-22 review are fixed in the current
code:

- **`index.json` URL-encoding bypass** — now uses
  `new URL(req.url, 'http://localhost').pathname` rather than a substring match
  on the raw URL, so `/index%2ejson` no longer slips through
  ([vite.plugins.js:818-837](vite.plugins.js#L818-L837)).
- **`/admin` exposure** — now behind a loopback gate registered *before* the
  static mount ([vite.plugins.js:961-975](vite.plugins.js#L961-L975)).
- **`/publish` exposure** — deliberately LAN-reachable, which is its purpose,
  and now protected by a 64-bit `presentationPublishKey` in the filename with
  no directory listing ([vite.plugins.js:473-486](vite.plugins.js#L473-L486)).

Still outstanding from that review:

- **Reverse-proxy documentation.** Every loopback gate in §1.4 fails open behind
  a same-machine reverse proxy, because all forwarded requests present
  `127.0.0.1`. F5 is the browser-side version of the same weakness. If running
  behind nginx/Caddy is ever supported, `/admin`, `/peer/*` and `**/index.json`
  must be explicitly blocked at the proxy, and that needs to be written down in
  `doc/` with worked config examples.
- **`shareUrl` handling.** `initialData.shareUrl` is client-supplied and is
  interpolated into `multiplexUrl`, then emitted to remote-control clients as
  `presentation_url` ([vite.plugins.js:1342-1343](vite.plugins.js#L1342-L1343),
  [:1393](vite.plugins.js#L1393)). No server-side risk; the remaining question is
  whether the reveal.js-remote UI navigates to it. Worth one pass through
  `node_modules/reveal.js-remote/server-ui`.

---

## Part 4 — Suggested order of work

| # | Change | Effort |
|---|---|---|
| 1 | Sanitise `bibletext/client.js:194` before `innerHTML` | minutes |
| ~~2~~ | ~~`crypto.randomBytes` / `crypto.randomInt` for `key` and PIN (F1)~~ | **done** |
| 3 | Fail-closed PIN check at both `/peer/*` sites (F4) | minutes |
| 4 | Drop `hostname` from `/peer/public-key` (F8) | minutes |
| 5 | Restrict `/plugins_<key>/` to browser-facing files (F7) | ~1 hour |
| 6 | Bound `_thumbQueue`, extension allowlist (F6) | ~1 hour |
| 7 | Explicit `allowedHosts` + `Host` check on apiServer (F5) | ~2 hours |
| 8 | Separate peer and WordPress keypairs; domain-separate the challenge (F2) | ~half day + migration |
| 9 | Authenticate `/presenter-plugins-socket`; split publish/subscribe (F3) | ~1–2 days, touches 5 plugins |

Items 1–4 are one-line-ish and remove the sharpest edges. Item 9 is the real
architectural fix and the one that most directly restores the T2 boundary.

## Reporting a vulnerability

Please report security issues privately to the maintainers rather than opening a
public issue.
