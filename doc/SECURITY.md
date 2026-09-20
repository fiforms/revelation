# Security Model

The trust tiers this software intends to enforce for the HTTP/WebSocket surface
created by [`../vite.plugins.js`](../vite.plugins.js) and the Electron wrapper
that drives it: what each tier is allowed to do, and where the boundaries
actually live in code.

This document describes the model only. The audit findings that were measured
against it live elsewhere, keyed `F1`–`F9`:

- **Fixed** — see the Security section of the wrapper's
  [`CHANGELOG.md`](../../CHANGELOG.md).
- **Open, deferred or withdrawn** — see the wrapper's
  [`TODO.md`](../../TODO.md).

Related: [REVERSE_PROXY.md](REVERSE_PROXY.md) for proxying a normal instance,
and [`doc/dev/PUBLIC_RELAY.md`](../../doc/dev/PUBLIC_RELAY.md) for running a
socket-only relay.

Model last reviewed 2026-09-20.

---

## Threat model in one paragraph

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
See [the collaboration carve-out](#open-collaboration-plugins--accepted-design); that carve-out is
part of the model, not a gap in it.

## Trust tiers

| Tier | Who | Should be able to | Must **not** be able to |
|---|---|---|---|
| **T0 — Operator** | Console user of the machine; anything reaching the app over loopback | Everything | — |
| **T1 — Key holder** | Anyone who knows `config.key` (it appears in every shared presentation URL) | Read presentations and media; render decks | Reach the control API, read app config, execute code in the Electron app |
| **T2 — Invited viewer** | Given one presentation or multiplex link | View that content; follow the presenter | Modify content, control other viewers' decks, enumerate the library |
| **T2c — Collaborating viewer** | An invited viewer, when a collaboration plugin is enabled | Everything T2 can, **plus** drive the shared slide space — see [the collaboration carve-out](#open-collaboration-plugins--accepted-design) | Execute code, read files, reach the control API, enumerate the library |
| **T3 — LAN prober** | Discovers `http://<host>:8000/` with no link and no key | Learn that a presenter app is running | Enumerate presentations, read files, obtain keys/PINs, trigger any operation |
| **T4 — Paired peer** | A follower instance paired over mDNS with the PIN | Receive slide-sync commands | Extract signing material or act as the app toward third parties |

## Secrets and what each one gates

| Secret | Entropy | Gates | Where it leaks to |
|---|---|---|---|
| `config.key` | 64 bits (`crypto`) | `/presentations_<key>/`, `/plugins_<key>/`, `/thumbs_<key>/`, API server on :8900 | **Every shared presentation link** (`/presentation.html?slug=…&key=…`) |
| `presentationPublishKey` | 64 bits (`crypto`) | `/publish/<key>.html` | The URL-publish screen link |
| `mdnsPairingPin` | 6 digits (`crypto`) | `/peer/socket-info`, `/peer/challenge` | Shown in the presenter info panel |
| `rsaPrivateKey` | RSA | WordPress publish auth only | Never served |
| `peerRsaPrivateKey` | RSA | Peer pairing and peer socket auth | Never served |
| Reveal-remote `remoteId` | UUIDv4 | Remote-control channel for one deck | Presenter's remote QR code |
| Reveal-remote `multiplexId` | UUIDv4 | Follower/multiplex channel | Every follower link |
| `presenterLiveRoomId` | 128 bits (`crypto`, per server session) | The `bibletext` live-verse room | Every deck, via `reveal-remote.js` |
| `/media-share/<token>` | 192 bits (`crypto`) | One registered media file | Deck HTML |

> **The key is global, not per-presentation.** Handing someone a link to one
> presentation hands them T1 for the entire library. The only thing standing
> between a T2 viewer and the rest of the library is that `index.json` is
> loopback-only, so they cannot *enumerate* slugs — they can still fetch any
> slug they can guess or that was ever mentioned to them. Treat "share a link"
> as "share the library, unlisted".

## Enforcement mechanisms in use

- **Loopback check** — `isLoopbackAddress(req.socket.remoteAddress)` in
  [`../vite.plugins.js`](../vite.plugins.js). Used for `/admin`,
  `/peer/status`, `/peer/command`, `*/index.json`, and the sandbox-origin gate.
- **Secret in the URL path** — `/presentations_<key>/`, `/plugins_<key>/`,
  `/thumbs_<key>/`, `/publish/<publishKey>.html`, `/media-share/<token>`.
  Not enumerable: `serve-static` does not emit directory listings and
  `index: false` is set on the presentations mount.
- **PIN + lockout** — `enforcePairingPin()`: fail-closed, 3 failures per
  remote address, 60 s block, `timingSafeEqual` comparison.
- **RSA challenge/response** — the `/peer-commands` Socket.IO namespace requires
  a server-signed `token:expiresAt:socketPath` bearer payload, using the
  dedicated peer keypair and a domain-separated signature.
- **Feature flag** — the whole `/peer/*` tree 403s unless
  `config.mdnsPublish === true`.
- **Bind address** — in `localhost` mode Vite is started without `--host`, so
  nothing but loopback can connect at all. The API server on :8900 is always
  bound to `127.0.0.1`, and its port defaults clear of Vite's fallback range.
- **CSP** — `presentation.html` ships
  `script-src 'self'; object-src 'none'; base-uri 'self'`, which is what keeps
  injected markup from becoming code execution (see F3 in CHANGELOG.md).

## Endpoint map

| Path | Reachable by | Gate |
|---|---|---|
| `/`, `/presentation.html`, `/presentations.html`, `/@fs/*`, `/node_modules/*` | T3 | none (Vite dev-server root) |
| `/presentations_<key>/**` | T1 | key in path |
| `/plugins_<key>/**` | T1 | key in path — **serves server-side plugin source** (F7, open) |
| `/thumbs_<key>/**` | T1 | key in path — **spawns ffmpeg** (F6, open) |
| `**/index.json` | T0 | loopback |
| `/admin/**` | T0 | loopback |
| `/peer/status`, `/peer/command` | T0 | loopback + `mdnsPublish` |
| `/peer/public-key` | T3 | `mdnsPublish` only — public by design, same data mDNS broadcasts |
| `/peer/socket-info`, `/peer/challenge` | T4 | `mdnsPublish` + PIN (fail-closed, 3-strike lockout) |
| `/publish/<publishKey>.html` | T2 | 64-bit key in filename |
| `/media-share/<token>` | T2 | 192-bit token |
| `/_remote/ui/**` | T3 | none (static UI only) |
| `/socket.io` (Reveal Remote) | T3 | none; per-channel UUID | 
| `/peer-commands` | T4 | RSA bearer |
| `/presenter-plugins-socket` | T2c | room id only — **open by design**, see [the collaboration carve-out](#open-collaboration-plugins--accepted-design) |
| `http://127.0.0.1:8900/api/**` | T0 + key | loopback bind + `key` |

---

## Open-collaboration plugins — accepted design

Five plugins use the `/presenter-plugins-socket` namespace, and all five treat
a shared room as **a collaborative space in which every participant is a peer**:

| Plugin | What a participant may do | Room id |
|---|---|---|
| `slidecontrol` | Navigate the deck for everyone: next/prev, jump to slide, blank, overview | `remoteMultiplexId` |
| `markerboard` | Draw on, clear, and restore the shared whiteboard | `remoteMultiplexId` |
| `bibletext` | Push the live verse shown on every magic slide | `presenterLiveRoomId` (per server session) |
| `captions` | Push live caption text | `remoteMultiplexId` |
| `videostream` | Drive shared video playback | `remoteMultiplexId` |

**This is intended behaviour, not a defect.** The namespace has no
authentication and no publish/subscribe split: holding the room id is the
permission. A room id is not a capability the app tries to protect — it is in
the multiplex link handed to every viewer.

Accordingly, **T2c is the operative tier whenever any of these plugins is
enabled**: sharing a presentation link is equivalent to granting collaborator
rights in that slide space. The T2 restrictions above ("must not modify
content, control other viewers' decks") describe the app only when none of
these plugins is enabled.

These five declare `"collaboration": true` in their `plugin-manifest.json`,
alongside a `collaboration_detail` string naming the specific abilities a
viewer gains. Settings badges them, shows the detail when the plugin is
expanded, and displays a standing banner listing whichever are enabled — so the
operational rule below is visible at the moment of choosing, not only here. A
new plugin that accepts `presenter-plugin:event` from other participants must
set the same flag; see [`doc/dev/PLUGINS.md`](../../doc/dev/PLUGINS.md).

### Running a public relay

The socket namespaces can be hosted on a public server so that participants
off the LAN can join — this is what `revealremote.fiforms.org` is. That
deployment is the one place where the reverse-proxy weakness in the loopback gates above genuinely
bites: behind a same-machine proxy every forwarded request presents
`127.0.0.1`, so every `isLoopbackAddress()` gate passes for the entire
internet.

**Public relay mode** exists for exactly this. Start the server with
`REVELATION_PUBLIC_SERVER=1` (or `--public-server`, or `npm run relay`) and it
serves only:

| Path | What |
|---|---|
| `/socket.io` | Reveal Remote broker |
| `/presenter-plugins-socket` | Presenter-plugins channel |
| `/_remote/ui/**` | The static remote-control UI (self-contained) |
| `/` | A one-line liveness string, no host details |

Everything else returns a flat `404`. The mode does not gate the local-machine
features — it **never registers them**: no presentations, plugins, thumbnails
(so no `ffmpeg`), media tokens, `/publish`, `/admin`, `/peer/*`, `index.json`,
file watching, or Vite static root and `/@fs`. `ensurePeerCommandServer` is
not started either, since peer pairing authenticates against a `config.json` a
relay has no business holding. The presentations directory is never resolved,
so a relay needs no presentation data on disk at all.

Because nothing loopback-gated is mounted, the proxy question does not arise:
there is nothing behind the gate to reach. Do not run a relay in the app's
normal mode and try to firewall the extra routes — use this mode.

Verified against a live server with 36 probes covering the allowed paths,
Vite's static root and source files, `/@fs` and traversal escapes, every
local-machine route, and the three socket namespaces.

### Operational rule

> **If any collaboration plugin is enabled, share presentation and multiplex
> links only with a small group of trusted people.** There is no per-viewer
> permission, no read-only mode, and no way to eject a participant. Anyone who
> obtains the link — or forwards it onward — can drive the shared space for
> everyone in it.

Two consequences worth stating plainly, because they are easy to under-estimate:

- **Revocation means invalidating the room id.** Un-sharing a link does
  nothing on its own. Restart the app to mint a new `presenterLiveRoomId` for
  `bibletext`, or start a new multiplex session for the other four. (Before
  the F3 fix this meant rotating `config.key`, which also broke every shared
  link and every published URL.)
- **The room is LAN-bound by default, but need not be.** Traffic stays on this
  machine's Vite server unless *Route Live Features Through the Public Server*
  is enabled in Settings, which moves it to a public internet relay — at which
  point a participant no longer has to be on your network, only to hold the
  room id.

### What the carve-out does *not* cover

Accepting open collaboration means accepting that participants can change what
the room displays. It does not extend to letting them escape the room:

- **No code execution.** A participant may set slide *content*, not run script
  in another viewer's page. The `bibletext` allowlist sanitizer (F3) and the
  `presentation.html` CSP both enforce this and remain load-bearing.
- **No access to anything outside the shared space.** The library, local files,
  app config and the control API stay off-limits — those are T0/T1 boundaries
  and are unaffected by this carve-out.
- **No leaking the access key.** Room ids must never be derived from
  `config.key`. `bibletext` once named its room `live-<config.key>`, which put
  the install's master secret into the socket server's room table — fixed in
  F3; rooms now use a per-session `presenterLiveRoomId`, and the other four
  plugins use the `remoteMultiplexId`. A room id is shared with everyone in the
  room and with whoever operates the socket server, so it must gate nothing but
  the room.

### Deferred: publish/subscribe permission split

A future design could separate *publish* from *subscribe* on this namespace —
a presenter-held token permitting broadcast, with viewers subscribed read-only
and navigation intent relayed through the presenter. **Not planned.** There is
no concrete use case today for a viewer who should see the shared space but not
participate in it, and the open model is what makes the collaborative
whiteboard and audience-driven navigation work at all. Revisit only if a
deployment appears that needs mixed-permission rooms — for example a public
broadcast where the audience should watch but not draw.

---

## Reporting a vulnerability

Please report security issues privately to the maintainers rather than opening a
public issue.
