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

One deliberate exception qualifies that second boundary. When a collaboration
plugin is enabled, viewers holding a link are *meant* to be able to change the
shared slide space — navigate the deck, draw on the whiteboard, push a verse.
See [§1.6](#16-open-collaboration-plugins--accepted-design); that carve-out is
part of the model, not a gap in it.

### 1.2 Trust tiers

| Tier | Who | Should be able to | Must **not** be able to |
|---|---|---|---|
| **T0 — Operator** | Console user of the machine; anything reaching the app over loopback | Everything | — |
| **T1 — Key holder** | Anyone who knows `config.key` (it appears in every shared presentation URL) | Read presentations and media; render decks | Reach the control API, read app config, execute code in the Electron app |
| **T2 — Invited viewer** | Given one presentation or multiplex link | View that content; follow the presenter | Modify content, control other viewers' decks, enumerate the library |
| **T2c — Collaborating viewer** | An invited viewer, when a collaboration plugin is enabled | Everything T2 can, **plus** drive the shared slide space — see [§1.6](#16-open-collaboration-plugins--accepted-design) | Execute code, read files, reach the control API, enumerate the library |
| **T3 — LAN prober** | Discovers `http://<host>:8000/` with no link and no key | Learn that a presenter app is running | Enumerate presentations, read files, obtain keys/PINs, trigger any operation |
| **T4 — Paired peer** | A follower instance paired over mDNS with the PIN | Receive slide-sync commands | Extract signing material or act as the app toward third parties |

### 1.3 Secrets and what each one gates

| Secret | Entropy | Gates | Where it leaks to |
|---|---|---|---|
| `config.key` | 64 bits (`crypto`) | `/presentations_<key>/`, `/plugins_<key>/`, `/thumbs_<key>/`, API server on :8001 | **Every shared presentation link** (`/presentation.html?slug=…&key=…`) |
| `presentationPublishKey` | 64 bits (`crypto`) | `/publish/<key>.html` | The URL-publish screen link |
| `mdnsPairingPin` | 6 digits (`crypto`) | `/peer/socket-info`, `/peer/challenge` | Shown in the presenter info panel |
| `rsaPrivateKey` | RSA | WordPress publish auth only | Never served |
| `peerRsaPrivateKey` | RSA | Peer pairing and peer socket auth | Never served |
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
| `/peer/socket-info`, `/peer/challenge` | T4 | `mdnsPublish` + PIN (fail-closed, 3-strike lockout) |
| `/publish/<publishKey>.html` | T2 | 64-bit key in filename |
| `/media-share/<token>` | T2 | 192-bit token |
| `/_remote/ui/**` | T3 | none (static UI only) |
| `/socket.io` (Reveal Remote) | T3 | none; per-channel UUID | 
| `/peer-commands` | T4 | RSA bearer |
| `/presenter-plugins-socket` | T2c | room id only — **open by design**, see [§1.6](#16-open-collaboration-plugins--accepted-design) |
| `http://127.0.0.1:8001/api/**` | T0 + key | loopback bind + `key` |

---

### 1.6 Open-collaboration plugins — accepted design

Five plugins use the `/presenter-plugins-socket` namespace, and all five treat
a shared room as **a collaborative space in which every participant is a peer**:

| Plugin | What a participant may do | Room id |
|---|---|---|
| `slidecontrol` | Navigate the deck for everyone: next/prev, jump to slide, blank, overview | `remoteMultiplexId` |
| `markerboard` | Draw on, clear, and restore the shared whiteboard | `remoteMultiplexId` |
| `bibletext` | Push the live verse shown on every magic slide | `live-<config.key>` |
| `captions` | Push live caption text | `remoteMultiplexId` |
| `videostream` | Drive shared video playback | `remoteMultiplexId` |

**This is intended behaviour, not a defect.** The namespace has no
authentication and no publish/subscribe split: holding the room id is the
permission. A room id is not a capability the app tries to protect — it is in
the multiplex link handed to every viewer.

Accordingly, **T2c is the operative tier whenever any of these plugins is
enabled**: sharing a presentation link is equivalent to granting collaborator
rights in that slide space. The T2 restrictions in §1.2 ("must not modify
content, control other viewers' decks") describe the app only when none of
these plugins is enabled.

These five declare `"collaboration": true` in their `plugin-manifest.json`,
alongside a `collaboration_detail` string naming the specific abilities a
viewer gains. Settings badges them, shows the detail when the plugin is
expanded, and displays a standing banner listing whichever are enabled — so the
operational rule below is visible at the moment of choosing, not only here. A
new plugin that accepts `presenter-plugin:event` from other participants must
set the same flag; see `doc/dev/PLUGINS.md`.

#### Operational rule

> **If any collaboration plugin is enabled, share presentation and multiplex
> links only with a small group of trusted people.** There is no per-viewer
> permission, no read-only mode, and no way to eject a participant. Anyone who
> obtains the link — or forwards it onward — can drive the shared space for
> everyone in it.

Two consequences worth stating plainly, because they are easy to under-estimate:

- **Revocation means rotating the secret.** To remove a collaborator you must
  invalidate the room id: rotate `config.key` (Settings → reset key) for
  `bibletext`, or start a new multiplex session for the other four. Un-sharing
  a link does nothing on its own.
- **The room is not confined to the LAN.** `presenterPluginsPublicServer`
  defaults to `https://revealremote.fiforms.org/presenter-plugins-socket`, a
  public internet relay, so a participant does not need to be on your network —
  only to hold the room id. Point it at the local server if you want the
  collaboration space bounded by the LAN.

#### What the carve-out does *not* cover

Accepting open collaboration means accepting that participants can change what
the room displays. It does not extend to letting them escape the room:

- **No code execution.** A participant may set slide *content*, not run script
  in another viewer's page. The `bibletext` allowlist sanitizer (F3) and the
  `presentation.html` CSP both enforce this and remain load-bearing.
- **No access to anything outside the shared space.** The library, local files,
  app config and the control API stay off-limits — those are T0/T1 boundaries
  and are unaffected by this carve-out.
- **No leaking the access key.** See F3: `bibletext` derives its room id from
  `config.key`, which puts the install's master secret on a third-party relay.
  That is a real defect independent of the collaboration model.

#### Deferred: publish/subscribe permission split

A future design could separate *publish* from *subscribe* on this namespace —
a presenter-held token permitting broadcast, with viewers subscribed read-only
and navigation intent relayed through the presenter. **Not planned.** There is
no concrete use case today for a viewer who should see the shared space but not
participate in it, and the open model is what makes the collaborative
whiteboard and audience-driven navigation work at all. Revisit only if a
deployment appears that needs mixed-permission rooms — for example a public
broadcast where the audience should watch but not draw.

---

## Part 2 — Findings

Nine issues were raised against the model above. F1, F2 and F4 are fixed, and
F3 has been reduced: its injection sink is sanitized and its open-channel half
is now [accepted design](#16-open-collaboration-plugins--accepted-design).
Nothing above Medium remains. What is left of F3 — `bibletext` using the access
key as a room id — is the top open item, followed by F8 and F5.

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

### F2 — `/peer/challenge` was a blind signing oracle for the WordPress publishing key — **FIXED**

**Severity: High** · Fixed 2026-09-20

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

**Resolution — both halves were applied.**

**1. The keys are separated.** `peerRsaPublicKey`/`peerRsaPrivateKey` are new
config fields, generated at both keypair sites in
[lib/configManager.js](../lib/configManager.js) and stripped from
`get-app-config` alongside `rsaPrivateKey`. `rsaPrivateKey` is now used by
`plugins/wordpress_publish` and nothing else; every peer path — `/peer/public-key`,
`/peer/socket-info`, `/peer/challenge`, the `/peer-commands` handshake check, and
the mDNS `pubKeyFingerprint` — uses the peer key. `/peer/public-key` no longer
publishes the WordPress public key at all.

**2. Peer signatures are domain-separated.** Nothing signs caller bytes
directly any more. Two constructions cover a prefixed digest:

```
revelation-peer-challenge:v1:<sha256hex of challenge>
revelation-peer-socket:v1:<sha256hex of token:expiresAt:socketPath>
```

exposed as `signPeerChallenge` / `verifyPeerChallenge` /
`signPeerSocketPayload` / `verifyPeerSocketPayload` in
[lib/peerAuth.js](../lib/peerAuth.js). So even within the peer protocol a
challenge signature is not a valid socket signature, and neither is meaningful
to any other verifier.

**⚠ The two constructions are duplicated** in `lib/peerAuth.js` and
[vite.plugins.js](vite.plugins.js) — the Vite plugin runs in the utility process
and cannot require from the wrapper. They are wire protocol. Both copies carry a
warning comment; change them together or pairing silently breaks.

**Breaking change: existing pairings must be renewed.** The master now signs
with a key its paired followers have never seen, so old pairings cannot verify.
This is handled explicitly rather than as a crypto failure:

- `/peer/public-key` and `/peer/challenge` advertise `peerProtocol: 1`.
- `pairWithPeer` refuses a master that does not advertise it, with "…is running
  an older, incompatible peering protocol. Update the app on the master and try
  again." Refusing rather than falling back is deliberate — a fallback would
  keep the oracle reachable.
- Paired-master records store `peerPublicKey` + `peerProtocol`; the legacy
  `publicKey` field is no longer persisted. `peerCommandClient` detects its
  absence and raises "pairing…must be renewed — unpair and pair again" once,
  instead of failing signature verification on every refresh.

Verified with a round-trip harness: the two copies of each construction agree
byte-for-byte over ASCII, empty, colon-bearing, Unicode and 5 KB inputs; the
happy-path challenge and socket flows verify and reject tampering; an oracle
response is not accepted as a WordPress signature; and challenge and socket
signatures do not cross-validate.

---

### F3 — `bibletext` uses the access key as its collaboration room id

**Severity: Medium — the injection sink is FIXED; the room-id defect is open**
· [vite.plugins.js](vite.plugins.js),
[plugins/bibletext/client.js](../plugins/bibletext/client.js)

The `/presenter-plugins-socket` namespace has no handshake check, no token and
no origin restriction. Any party that can reach it may `presenter-plugin:join`
any `{plugin, roomId}` pair and `presenter-plugin:event` arbitrary
`{type, payload}` to everyone else in that room:

```js
presenterPluginsIo = new Server(server.httpServer, {
  path: PRESENTER_PLUGINS_SOCKET_PATH,
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 25 * 1024 * 1024
});

presenterPluginsIo.on('connection', (socket) => { /* no auth of any kind */
```

**The open channel itself is accepted design** — see
[§1.6](#16-open-collaboration-plugins--accepted-design). Room membership is the
permission, deliberately, so that collaborative navigation and the shared
whiteboard work. Viewers changing what the room displays is a feature, and the
publish/subscribe split that would change it is explicitly deferred.

What remains a defect is narrower, and survives the carve-out because it is not
about collaboration at all:

**`bibletext` derives its room id from the install's master secret**
([client.js:100-103](../plugins/bibletext/client.js#L100-L103)):

```js
getLiveRoomId() { return `live-${key}`; }   // key = config.key
```

`config.key` gates `/presentations_<key>/`, `/plugins_<key>/`,
`/thumbs_<key>/` and the control API. Using it as a room name sends it, in
cleartext at the application layer, to whatever server
`presenterPluginsPublicServer` points at — by default the public relay
`revealremote.fiforms.org`, operated by a third party, where it lands in room
tables and plausibly in logs. The other four plugins do not have this problem:
they use `remoteMultiplexId`, a per-session UUID that gates nothing else.

Two things follow:

- A secret that protects the whole presentation library is disclosed to a third
  party as a side effect of enabling a verse plugin. Nobody consented to that
  at the point of sharing a link.
- Rotating the key to eject a `bibletext` collaborator (§1.6) simultaneously
  invalidates every shared presentation link and every `/publish/*.html` file.
  The two concerns should not be coupled to the same secret.

**Fix:** give `bibletext` a per-session room id like the other four —
`remoteMultiplexId` where one exists, otherwise a random id minted per
presentation session and distributed the same way. Nothing about the open
collaboration model has to change; the room id simply stops being the access
key. This is a small, self-contained change and is now the top open item.

---

**(a) Markup injection into every viewer's slide — FIXED 2026-09-20.** The
bibletext live-verse follower assigned the received payload straight to
`innerHTML`:

```js
el.innerHTML = html ? `<div class="bibletext-live-container">${html}</div>` : '';
```

`html` was `event.payload.html`, unvalidated, from a broadcast any room
participant can send. Because the channel is open by design (§1.6), sanitizing
this sink is not optional — it is what keeps "a collaborator may change what
the room displays" from becoming "a collaborator may run code in everyone's
browser". The CSP on `presentation.html` (`script-src 'self'`) is what stopped
this from being remote code execution — inline handlers and inline scripts are
blocked, and `innerHTML`-inserted `<script>` never executes. It did **not** stop
defacement: `style-src` allows `'unsafe-inline'`, so an injected
`<div style="position:fixed;inset:0;z-index:9999">` could cover the projected
screen with arbitrary content for the whole audience. **The CSP remains
load-bearing for this channel — do not relax it.**

`_sanitizeLiveHtml()` in
[plugins/bibletext/client.js](../plugins/bibletext/client.js) now sanitizes at
the point of receipt (the only writer of `_latest`), so unsanitized markup is
never stored or rendered. It is a strict **allowlist**, not the general
`sanitizeRenderedHTML()`: `buildLiveVerseHtml()` emits an exactly known
vocabulary — `div/p/span/em/br` carrying only `bibletext-live*` classes — so the
sanitizer parses into an inert `<template>` and rebuilds the tree from that
vocabulary alone. Unknown elements are unwrapped (text kept, so a future
formatting change degrades to readable text rather than a blank slide) except
for a small raw-text/embedding set (`script`, `style`, `noscript`, `template`,
`iframe`, `object`, `embed`, `svg`, `math`) which is dropped with its subtree.
`class` is the only attribute carried over, and only within the plugin's own
namespace.

This is deliberately stricter than the general sanitizer, because it also has
to reject what that one permits by design: `<img>`, `<iframe>`, `id`, borrowed
theme classes, and the inline `style` behind the defacement vector above.

Verified against a real HTML parser (jsdom) with 37 assertions: genuine
payloads round-trip byte-identically; `onerror`/`onload`/`<script>`/nested
`<scr<script>ipt>`/`javascript:`/`srcdoc`/entity-space handler variants are all
stripped; the defacement vectors are stripped; and inserting sanitized output
into a live `runScripts: 'dangerously'` document fires nothing.

**⚠ If `buildLiveVerseHtml()` gains a tag or class, add it to the allowlist** or
the new markup is silently flattened to text.

**(b) Deck control by any viewer — ACCEPTED DESIGN, not a finding.**
`slidecontrol` executes `prev`, `next`, `blank`, `overview`, `slide_to` and
`markerboard_toggle` received on this channel
([plugins/slidecontrol/client.js:222-234](../plugins/slidecontrol/client.js#L222-L234)),
and `allowControlFromAnyClient` defaults to `true`
([client.js:78](../plugins/slidecontrol/client.js#L78)). Any viewer holding a
multiplex link can therefore drive the projected deck. Per
[§1.6](#16-open-collaboration-plugins--accepted-design) this is the intended
collaborative model, and the T2 rule in §1.2 is superseded by T2c whenever such
a plugin is enabled. Recorded here only so the behaviour is not re-filed as a
bug on a later pass.

The one thing worth reconsidering independently is that
`allowControlFromAnyClient` is not surfaced in Settings, so an operator who
wants the collaborative model *off* has to hand-edit `pluginConfigs`. Exposing
the toggle would make the §1.6 operational rule actionable rather than
advisory. Low priority; not a security defect given the carve-out.

**Remaining fix list**

1. ~~**Sanitise the sink**~~ — **done**, see (a).
2. **Stop deriving the `bibletext` room id from `config.key`** — the open item
   described at the head of this finding.
3. ~~Authenticate the namespace~~ / ~~split publish from subscribe~~ —
   **deferred by design**, see §1.6. Not planned; revisit only if a
   mixed-permission deployment appears.
4. Surface `allowControlFromAnyClient` in Settings (usability, not security).

---

### F4 — The pairing PIN check was skipped entirely when no PIN is configured — **FIXED**

**Severity: Medium** · Fixed 2026-09-20

```js
const expectedPin = config.mdnsPairingPin;
const providedPin = parsedUrl.searchParams.get('pin');
if (expectedPin && providedPin !== expectedPin) { /* reject */ }
```

If `mdnsPairingPin` was null, empty, or absent, the guard was a no-op and *any*
LAN host got a signed `/peer/socket-info` token and unrestricted access to the
`/peer/challenge` signer.

In the normal flow this was unreachable: `configManager` auto-generates a PIN
whenever `mdnsPublish` is true. But the server re-reads `config.json` off disk
on every request and trusts whatever it finds, so a hand-edited config, a
failed write, a config restored from an older schema, or a profile switch that
lands a PIN-less config on disk all silently opened the endpoints. Fail-open
authentication should never be structural.

**Resolution.** Both call sites now delegate to one `enforcePairingPin()` helper
in [vite.plugins.js](vite.plugins.js) that fails closed: a config with no usable
PIN answers `503 Pairing is not configured on this device` and logs the cause
for the operator, rather than letting the request through. "No usable PIN"
covers null, undefined, absent, empty, whitespace-only, and any non-string /
non-number value; a numeric PIN is accepted and surrounding whitespace trimmed.

The duplication was itself the hazard — the same fail-open test existed in two
places — so the lockout check, the failure counter and the comparison now live
in the single helper. Comparison uses `crypto.timingSafeEqual` on equal-length
buffers; length is not hidden, but with a fixed 6-digit PIN and a three-attempt
lockout that leaks nothing useful.

Followers surface the refusal verbatim (both `peerPairing.js` and
`mdnsManager.js` reject with the server's `error` string), so a PIN-less master
reports "Pairing is not configured on this device" instead of failing opaquely.

Verified with 35 assertions: every shape of missing PIN is refused; correct,
wrong, empty, null, prefix and trailing-whitespace PINs behave correctly; the
three-strike lockout still fires, is recorded as a peer event, refuses even the
correct PIN while active, and is scoped per remote address; and a success
clears the counter.

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
| ~~1~~ | ~~Sanitise `bibletext/client.js` before `innerHTML`~~ | **done** |
| ~~2~~ | ~~`crypto.randomBytes` / `crypto.randomInt` for `key` and PIN (F1)~~ | **done** |
| ~~3~~ | ~~Fail-closed PIN check at both `/peer/*` sites (F4)~~ | **done** |
| 4 | Drop `hostname` from `/peer/public-key` (F8) | minutes |
| 5 | Per-session room id for `bibletext`, not `config.key` (F3) | ~1 hour |
| 6 | Restrict `/plugins_<key>/` to browser-facing files (F7) | ~1 hour |
| 7 | Bound `_thumbQueue`, extension allowlist (F6) | ~1 hour |
| 8 | Explicit `allowedHosts` + `Host` check on apiServer (F5) | ~2 hours |
| ~~9~~ | ~~Separate peer and WordPress keypairs; domain-separate the challenge (F2)~~ | **done** |
| — | ~~Authenticate `/presenter-plugins-socket`; split publish/subscribe~~ | **deferred by design** (§1.6) |

Items 3–5 are small and remove the sharpest remaining edges; item 5 is the last
piece of F3 that is still a defect. The publish/subscribe split is no longer on
this list — see [§1.6](#16-open-collaboration-plugins--accepted-design) for why,
and for the conditions under which it should be revisited.

## Reporting a vulnerability

Please report security issues privately to the maintainers rather than opening a
public issue.
